'use client';

import { FileUp, Plus, Settings2 } from 'lucide-react';
import type { PortfolioType } from '@easyfi/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { PortfolioSettingsDialog } from '@/components/portfolios/PortfolioSettingsDialog';
import { PageHeader, type Crumb } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, unwrap } from '@/lib/api/client';
import { AddHoldingPanel } from './AddHoldingPanel';
import { CsvImportDialog } from './CsvImportDialog';
import { HoldingsTable } from './HoldingsTable';
import type { HoldingRow } from './types';

export type HoldingsWorkspaceProps = {
  portfolioId: string;
  portfolio: { id: string; name: string; type: PortfolioType; cash: number };
  breadcrumb: Crumb[];
  subtitle: string;
  holdings: HoldingRow[];
  asOf: string | null;
  csvSample?: string;
  exportName?: string;
};

/** Manage-holdings page body: header actions open the add drawer / CSV dialog above the table. */
export function HoldingsWorkspace({
  portfolioId,
  portfolio,
  breadcrumb,
  subtitle,
  holdings,
  asOf,
  csvSample,
  exportName,
}: HoldingsWorkspaceProps) {
  const router = useRouter();
  const [panel, setPanel] = useState<'add' | 'import' | 'settings' | null>(null);
  const [editing, setEditing] = useState<HoldingRow | null>(null);
  const close = useCallback(() => {
    setPanel(null);
    setEditing(null);
  }, []);
  const refresh = useCallback(() => router.refresh(), [router]);
  const path = { params: { path: { id: portfolioId } } };

  return (
    <>
      <PageHeader
        breadcrumb={breadcrumb}
        title="Manage holdings"
        subtitle={subtitle}
        actions={
          <>
            <Button onClick={() => setPanel('settings')} aria-label="Portfolio settings">
              <Settings2 aria-hidden className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <Button onClick={() => setPanel('import')}>
              <FileUp aria-hidden className="h-4 w-4" /> Import CSV
            </Button>
            <Button variant="primary" onClick={() => setPanel('add')}>
              <Plus aria-hidden className="h-4 w-4" /> Add holding
            </Button>
          </>
        }
      />
      {holdings.length === 0 ? (
        <EmptyState
          title="No holdings yet"
          body="Add funds and stocks one by one, or import a positions export from Fidelity, Schwab or Vanguard."
          action={
            <div className="flex gap-2">
              <Button onClick={() => setPanel('import')}>
                <FileUp aria-hidden className="h-4 w-4" /> Import CSV
              </Button>
              <Button variant="primary" onClick={() => setPanel('add')}>
                <Plus aria-hidden className="h-4 w-4" /> Add holding
              </Button>
            </div>
          }
        />
      ) : (
        <HoldingsTable
          holdings={holdings}
          asOf={asOf}
          exportName={exportName}
          onEdit={(row) => {
            setEditing(row);
            setPanel('add');
          }}
          onDelete={async (ids) => {
            await api.POST('/portfolios/{id}/holdings/bulk', {
              ...path,
              body: { ids, action: 'delete' },
            });
            refresh();
          }}
          onTag={async (ids, tag) => {
            await api.POST('/portfolios/{id}/holdings/bulk', {
              ...path,
              body: { ids, action: 'tag', tag },
            });
            refresh();
          }}
        />
      )}
      <AddHoldingPanel
        open={panel === 'add'}
        onClose={close}
        portfolioId={portfolioId}
        editing={editing}
        onSaved={refresh}
      />
      <PortfolioSettingsDialog
        key={`${portfolio.name}-${portfolio.type}-${portfolio.cash}`}
        open={panel === 'settings'}
        onClose={close}
        portfolio={portfolio}
      />
      <CsvImportDialog
        open={panel === 'import'}
        onClose={close}
        sample={csvSample}
        action={async ({ broker, csv, replace }) => {
          const r = unwrap(
            await api.POST('/portfolios/{id}/import', { ...path, body: { broker, csv, replace } }),
          );
          refresh();
          return r;
        }}
      />
    </>
  );
}
