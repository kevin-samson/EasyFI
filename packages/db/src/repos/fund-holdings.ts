import { and, asc, desc, eq, inArray, max, notInArray } from 'drizzle-orm';
import type { Db } from '../client';
import { fundHoldings, fundSectorWeights, type FundHolding } from '../schema';
import { chunk } from '../util';

export interface ConstituentInput {
  fundTicker?: string;
  constituentTicker?: string | null;
  name: string;
  weight: number;
  assetBucket?: string | null;
  sector?: string | null;
  industry?: string | null;
}

export type SectorWeightsInput =
  readonly { sector: string; weight: number }[] | Record<string, number>;

export interface FundSnapshot {
  asOf: string;
  constituents: FundHolding[];
  sectorWeights: { sector: string; weight: number }[];
}

const KEEP_SNAPSHOTS = 2;

function normaliseSectorWeights(input: SectorWeightsInput | undefined) {
  if (!input) return [];
  if (Array.isArray(input)) return [...input] as { sector: string; weight: number }[];
  return Object.entries(input as Record<string, number>).map(([sector, weight]) => ({
    sector,
    weight,
  }));
}

export function fundHoldingsRepo(db: Db) {
  return {
    /**
     * Replace the (fund, asOf) snapshot atomically, then drop all but the latest two snapshots
     * for that fund (spec §5: keep latest + previous).
     */
    async replaceSnapshot(
      fundTicker: string,
      asOf: string,
      rows: readonly ConstituentInput[],
      sectorWeights?: SectorWeightsInput,
    ): Promise<void> {
      const weights = normaliseSectorWeights(sectorWeights);
      await db.transaction(async (tx) => {
        const at = (t: typeof fundHoldings | typeof fundSectorWeights) =>
          and(eq(t.fundTicker, fundTicker), eq(t.asOf, asOf));
        await tx.delete(fundHoldings).where(at(fundHoldings));
        await tx.delete(fundSectorWeights).where(at(fundSectorWeights));
        for (const part of chunk(rows)) {
          await tx.insert(fundHoldings).values(
            part.map((c) => ({
              fundTicker,
              asOf,
              constituentTicker: c.constituentTicker ?? null,
              name: c.name,
              weight: c.weight,
              assetBucket: c.assetBucket ?? null,
              sector: c.sector ?? null,
              industry: c.industry ?? null,
            })),
          );
        }
        if (weights.length > 0) {
          await tx
            .insert(fundSectorWeights)
            .values(weights.map((w) => ({ fundTicker, asOf, sector: w.sector, weight: w.weight })));
        }

        const dates = await tx
          .selectDistinct({ asOf: fundHoldings.asOf })
          .from(fundHoldings)
          .where(eq(fundHoldings.fundTicker, fundTicker))
          .orderBy(desc(fundHoldings.asOf));
        const keep = [...new Set([asOf, ...dates.map((d) => d.asOf)])]
          .sort()
          .reverse()
          .slice(0, KEEP_SNAPSHOTS);
        await tx
          .delete(fundHoldings)
          .where(and(eq(fundHoldings.fundTicker, fundTicker), notInArray(fundHoldings.asOf, keep)));
        await tx
          .delete(fundSectorWeights)
          .where(
            and(
              eq(fundSectorWeights.fundTicker, fundTicker),
              notInArray(fundSectorWeights.asOf, keep),
            ),
          );
      });
    },

    /** Stored snapshot dates for a fund, newest first. */
    async snapshotDates(fundTicker: string): Promise<string[]> {
      const rows = await db
        .selectDistinct({ asOf: fundHoldings.asOf })
        .from(fundHoldings)
        .where(eq(fundHoldings.fundTicker, fundTicker))
        .orderBy(desc(fundHoldings.asOf));
      return rows.map((r) => r.asOf);
    },

    /** Funds whose latest book lists `ticker`, heaviest weight first. */
    async fundsHolding(
      ticker: string,
    ): Promise<{ fundTicker: string; weight: number; asOf: string }[]> {
      const heads = await this.funds();
      if (heads.length === 0) return [];
      const rows = await db
        .select({
          fundTicker: fundHoldings.fundTicker,
          weight: fundHoldings.weight,
          asOf: fundHoldings.asOf,
        })
        .from(fundHoldings)
        .where(eq(fundHoldings.constituentTicker, ticker));
      const latest = new Map(heads.map((h) => [h.fundTicker, h.asOf]));
      const acc = new Map<string, { fundTicker: string; weight: number; asOf: string }>();
      for (const r of rows) {
        if (latest.get(r.fundTicker) !== r.asOf) continue;
        const cur = acc.get(r.fundTicker) ?? { fundTicker: r.fundTicker, weight: 0, asOf: r.asOf };
        cur.weight += r.weight;
        acc.set(r.fundTicker, cur);
      }
      return [...acc.values()].sort((a, b) => b.weight - a.weight);
    },

    /** Every fund with a stored book and its latest snapshot date, by ticker. */
    async funds(): Promise<{ fundTicker: string; asOf: string }[]> {
      const rows = await db
        .select({ fundTicker: fundHoldings.fundTicker, asOf: max(fundHoldings.asOf) })
        .from(fundHoldings)
        .groupBy(fundHoldings.fundTicker)
        .orderBy(asc(fundHoldings.fundTicker));
      return rows.flatMap((r) => (r.asOf ? [{ fundTicker: r.fundTicker, asOf: r.asOf }] : []));
    },

    /** Latest snapshot per fund. Funds without holdings are absent from the result. */
    async latest(funds: readonly string[]): Promise<Record<string, FundSnapshot>> {
      if (funds.length === 0) return {};
      const heads = await db
        .select({ fundTicker: fundHoldings.fundTicker, asOf: max(fundHoldings.asOf) })
        .from(fundHoldings)
        .where(inArray(fundHoldings.fundTicker, [...funds]))
        .groupBy(fundHoldings.fundTicker);
      const out: Record<string, FundSnapshot> = {};
      for (const { fundTicker, asOf } of heads) {
        if (!asOf) continue;
        const [constituents, weights] = await Promise.all([
          db
            .select()
            .from(fundHoldings)
            .where(and(eq(fundHoldings.fundTicker, fundTicker), eq(fundHoldings.asOf, asOf)))
            .orderBy(desc(fundHoldings.weight), asc(fundHoldings.id)),
          db
            .select({ sector: fundSectorWeights.sector, weight: fundSectorWeights.weight })
            .from(fundSectorWeights)
            .where(
              and(eq(fundSectorWeights.fundTicker, fundTicker), eq(fundSectorWeights.asOf, asOf)),
            )
            .orderBy(desc(fundSectorWeights.weight)),
        ]);
        out[fundTicker] = { asOf, constituents, sectorWeights: weights };
      }
      return out;
    },
  };
}
