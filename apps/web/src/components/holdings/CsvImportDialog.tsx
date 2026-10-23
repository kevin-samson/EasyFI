'use client';

import { FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { Overlay } from './Overlay';
import type { CsvBroker, CsvImportInput } from './types';

export type CsvImportDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Text pre-filled in the paste box (sample export). */
  sample?: string;
  /** Parse + import on the server; resolves with what was imported. */
  action: (
    data: CsvImportInput & { replace: boolean },
  ) => Promise<{ imported: number; warnings: { line: number; message: string }[] }>;
};

const BROKERS: { value: CsvBroker; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'fidelity', label: 'Fidelity' },
  { value: 'schwab', label: 'Schwab' },
  { value: 'vanguard', label: 'Vanguard' },
  { value: 'generic', label: 'Generic CSV' },
];

/** Naive preview split: first line is the header; quoted commas are not handled (server parses for real). */
function preview(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const [head, ...body] = lines;
  if (!head) return null;
  return { header: head.split(','), rows: body.map((l) => l.split(',')) };
}

/** Modal to paste or upload a broker CSV export, pick the broker format, and preview rows. */
export function CsvImportDialog({ open, onClose, sample = '', action }: CsvImportDialogProps) {
  const [csv, setCsv] = useState(sample);
  const [broker, setBroker] = useState<CsvBroker>('auto');
  const [fileName, setFileName] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    warnings: { line: number; message: string }[];
  } | null>(null);
  const parsed = useMemo(() => preview(csv), [csv]);
  const rowCount = parsed?.rows.length ?? 0;

  const close = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await action({ broker, csv, replace });
      if (r.warnings.length) setResult(r);
      else close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={close}
      variant="modal"
      title="Import from CSV"
      description="Export positions from your broker, then paste the file contents or upload it."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {result ? null : (
            <Button variant="primary" disabled={rowCount === 0 || busy} onClick={() => void run()}>
              {busy
                ? 'Importing…'
                : `Import ${rowCount ? `${rowCount} ${rowCount === 1 ? 'row' : 'rows'}` : ''}`}
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-[var(--sev-high-bg)] px-3 py-2 text-[13px] text-[var(--sev-high-fg)]"
        >
          {error}
        </p>
      ) : null}
      {result ? (
        <div role="status" className="mb-4 rounded-lg bg-brand/10 px-3 py-2 text-[13px] text-fg">
          <p className="font-medium text-brand">
            Imported {result.imported} {result.imported === 1 ? 'holding' : 'holdings'}.
          </p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {result.warnings.slice(0, 8).map((w) => (
              <li key={`${w.line}-${w.message}`}>
                Line {w.line}: {w.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="Paste CSV">
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName(null);
            }}
            rows={6}
            spellCheck={false}
            placeholder="Symbol,Description,Quantity,Last Price,Cost Basis Total"
            className="w-full resize-y rounded-[10px] border border-line bg-surface-2 p-3 font-mono text-[12px] leading-5 text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
          />
        </Field>
        <div className="space-y-4">
          <Field label="Broker format">
            <Select value={broker} onChange={(e) => setBroker(e.target.value as CsvBroker)}>
              {BROKERS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Replace current holdings
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong px-3 py-4 text-center text-[13px] text-muted hover:bg-surface-2 focus-within:outline-2 focus-within:outline-brand">
            <FileUp aria-hidden className="h-5 w-5 text-faint" />
            <span className="font-medium text-fg">{fileName ?? 'Upload .csv file'}</span>
            <span className="text-[11px] text-faint">Read in your browser</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                setCsv(await f.text());
              }}
            />
          </label>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-fg">Preview</h3>
          {parsed ? <Pill tone="neutral">{rowCount} rows</Pill> : null}
        </div>
        {parsed ? (
          <div className="scroll-x rounded-[10px] border border-line">
            <table className="w-full min-w-[480px] text-[12px] tabular-nums">
              <thead className="bg-surface-2 text-faint">
                <tr>
                  {parsed.header.map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="px-3 py-2 text-left font-normal whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {parsed.header.map((_, j) => (
                      <td
                        key={j}
                        className={
                          j === 0
                            ? 'px-3 py-2 font-mono font-bold whitespace-nowrap text-fg'
                            : 'px-3 py-2 whitespace-nowrap text-muted'
                        }
                      >
                        {r[j] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-[10px] border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-muted">
            Paste a CSV or upload a file to see the rows we will import.
          </p>
        )}
      </div>
    </Overlay>
  );
}
