/**
 * Export importer.
 *
 * Everything happens in the browser — files are read with the File API and
 * never leave the machine. That is stated in the UI, not just here, because
 * "upload your health data" is a reasonable thing to hesitate over.
 *
 * The result summary is deliberately blunt about what was skipped. A health
 * import that silently drops six months of sleep is worse than one that fails.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  FileArrowUp,
  Spinner,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { buildDataset, type ImportFile } from "@/lib/garmin/parse";
import type { GarminDataset, UserProfile } from "@/lib/garmin/types";
import { mediumDate, type UnitSystem } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ImportPanel({
  onLoaded,
  onClose,
  units,
  profile,
}: {
  onLoaded: (d: GarminDataset) => void;
  onClose: () => void;
  units: UnitSystem;
  profile: UserProfile;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GarminDataset | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus moves into the dialog on open so keyboard users
  // are not left behind on the page underneath.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ingest = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      setBusy(true);
      setError(null);
      setResult(null);

      try {
        const files: ImportFile[] = [];
        for (const f of Array.from(fileList)) {
          if (/\.zip$/i.test(f.name)) {
            files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
          } else {
            files.push({ name: f.name, text: await f.text() });
          }
        }

        const dataset = await buildDataset(files, { units, profile });

        const total =
          dataset.days.length +
          dataset.activities.length +
          dataset.sleep.length +
          dataset.weight.length;

        if (total === 0) {
          setError(
            "Nothing recognisable in those files. Garmin's export is a ZIP containing Activities.csv and a DI_CONNECT folder of JSON — dropping the whole ZIP in works best.",
          );
        } else {
          setResult(dataset);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Those files could not be read.");
      } finally {
        setBusy(false);
      }
    },
    [units, profile],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-base/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import Garmin export"
        className="panel my-auto w-full max-w-xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-ink">Import your Garmin data</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Everything is parsed in your browser. Nothing is uploaded anywhere.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close import"
            className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-overlay hover:text-ink"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </header>

        <div className="px-5 py-5" aria-live="polite" aria-busy={busy}>
          {result ? (
            <ImportSummary dataset={result} onUse={() => onLoaded(result)} />
          ) : (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void ingest(e.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center transition-colors",
                  dragging ? "border-load bg-load/5" : "border-line-strong bg-surface",
                )}
              >
                {busy ? (
                  <>
                    <Spinner size={24} className="animate-spin text-load" aria-hidden="true" />
                    <p className="text-[13px] text-ink-muted">Reading your export…</p>
                  </>
                ) : (
                  <>
                    <FileArrowUp size={24} className="text-ink-faint" aria-hidden="true" />
                    <div>
                      <p className="text-[14px] font-medium text-ink">
                        Drop your export here
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
                        The whole ZIP, or individual Activities.csv / JSON files
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="mt-1 touch-manipulation rounded-full bg-load px-3.5 py-2 text-[13px] font-semibold text-on-load transition-opacity hover:opacity-90"
                    >
                      Choose files
                    </button>
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept=".zip,.csv,.json"
                      className="sr-only"
                      onChange={(e) => void ingest(e.target.files)}
                    />
                  </>
                )}
              </div>

              {error && (
                <p className="mt-3 flex gap-2 rounded-md border border-error/30 bg-error/5 px-3.5 py-3 text-[13px] leading-relaxed text-ink-muted">
                  <WarningCircle size={16} weight="fill" className="mt-px shrink-0 text-error" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}

              <div className="mt-5 border-t border-line pt-4">
                <p className="eyebrow mb-2.5">Getting your export</p>
                <ol className="flex list-inside list-decimal flex-col gap-1.5 text-[13px] leading-relaxed text-ink-muted">
                  <li>
                    Go to{" "}
                    <span className="font-mono text-[12px] text-ink">
                      garmin.com/account/datamanagement
                    </span>
                  </li>
                  <li>Choose “Export Your Data” and confirm by email</li>
                  <li>Garmin emails a ZIP within a few days — drop it in above</li>
                </ol>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
                  For activities alone, the faster route is Connect → Activities → “Export CSV”,
                  which downloads immediately.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportSummary({ dataset, onUse }: { dataset: GarminDataset; onUse: () => void }) {
  const rows: [string, number][] = [
    ["Activities", dataset.activities.length],
    ["Daily summaries", dataset.days.length],
    ["Nights of sleep", dataset.sleep.length],
    ["Weigh-ins", dataset.weight.length],
    ["VO₂max readings", dataset.vo2max.length],
    ["HRV readings", dataset.hrv.length],
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
        <CheckCircle size={17} weight="fill" className="text-success" aria-hidden="true" />
        Export read successfully
      </p>

      {dataset.meta.firstDate && dataset.meta.lastDate && (
        <p className="text-[13px] text-ink-muted">
          Covering {mediumDate(dataset.meta.firstDate)} to {mediumDate(dataset.meta.lastDate)}.
        </p>
      )}

      <div className="rounded-md border border-line bg-surface px-4 py-1">
        {rows.map(([label, n]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-line/60 py-2 last:border-0"
          >
            <span className="text-[13px] text-ink-muted">{label}</span>
            <span className={cn("font-mono text-[13px]", n > 0 ? "text-ink" : "text-ink-faint")}>
              {n.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {dataset.meta.skipped.length > 0 && (
        <details className="rounded-md border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-[13px] text-ink-muted">
            {dataset.meta.skipped.length} file
            {dataset.meta.skipped.length === 1 ? "" : "s"} not recognised
          </summary>
          <ul className="mt-2.5 flex flex-col gap-1">
            {dataset.meta.skipped.slice(0, 12).map((s) => (
              <li key={s} className="truncate font-mono text-[11px] text-ink-faint">
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[12px] leading-relaxed text-ink-faint">
            Garmin's export contains a lot of files this dashboard has no use for — GPS tracks,
            device settings, gear logs. Skipped entries here are expected unless something you
            wanted is missing from the counts above.
          </p>
        </details>
      )}

      <button
        type="button"
        onClick={onUse}
        className="touch-manipulation rounded-full bg-load px-4 py-2.5 text-[14px] font-semibold text-on-load transition-opacity hover:opacity-90"
      >
        Load this data
      </button>
    </div>
  );
}
