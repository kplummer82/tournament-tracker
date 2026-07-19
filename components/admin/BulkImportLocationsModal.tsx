"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Upload, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, FileText } from "lucide-react";
import {
  buildSkippedEntries,
  type CommitResponse,
  type PreviewResponse,
} from "@/lib/locations/bulkReport";

// Rows per commit request. Each row costs a Mapbox geocode plus a few inserts
// (~0.4-0.8s), so 5 keeps a chunk at ~2-4s: frequent enough for the progress bar
// to feel live, and bounded well under the route's maxDuration even if every
// geocode in the chunk hits its 4s timeout. See pages/api/locations/bulk.ts.
const CHUNK_SIZE = 5;

const BTN_BASE =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-100 border";

const SAMPLE_CSV = `name,address,city,state,zip,fields
"Mission Sports Park","1234 Main St",Fremont,CA,94539,"Field 1;Field 2;Field 3"
"Big League Dreams",250 Big League Dr,Mansfield,TX,76063,"Wrigley;Fenway"
`;

type Step = "upload" | "preview" | "committing" | "result";

export default function BulkImportLocationsModal({
  open,
  onOpenChange,
  onImportComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for child elements, so count depth instead of
  // clearing on the first leave.
  const dragDepth = useRef(0);

  const [progress, setProgress] = useState({ done: 0, total: 0, imported: 0, failed: 0 });
  const [cancelling, setCancelling] = useState(false);
  // Must be a ref, not state: runCommit's loop closes over the render it was
  // invoked in, so a state flag set by a later render would never be observed by
  // the running loop.
  const cancelRef = useRef(false);

  // Section expand state
  const [showReady, setShowReady] = useState(true);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showInvalid, setShowInvalid] = useState(true);
  const [showFailed, setShowFailed] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);

  const reset = () => {
    setStep("upload");
    setCsvText("");
    setFileName("");
    setError(null);
    setPreview(null);
    setResult(null);
    setDragging(false);
    dragDepth.current = 0;
    setProgress({ done: 0, total: 0, imported: 0, failed: 0 });
    setCancelling(false);
    cancelRef.current = false;
  };

  const handleClose = (next: boolean) => {
    // Escape / outside-click / X during an import means "cancel", not "close":
    // closing would reset() the state the in-flight chunk resolves into, so the
    // import would finish invisibly and never refresh the parent list. `open` is
    // a controlled prop, so not calling onOpenChange keeps the dialog mounted.
    if (!next && step === "committing") {
      cancelRef.current = true;
      setCancelling(true);
      return;
    }
    if (!next) {
      // If we successfully imported anything, tell parent to refresh.
      if (result && result.imported.length > 0) {
        onImportComplete();
      }
      reset();
    }
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (!/\.csv$/i.test(file.name)) {
      setError(`"${file.name}" is not a CSV file. Choose a file ending in .csv.`);
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      setCsvText(text);
      await runPreview(text);
    } catch (e: any) {
      setError(e?.message ?? "Failed to read file");
    }
  };

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types ?? []).includes("Files");

  const handleDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    // Required, or the browser navigates to the dropped file instead.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    if (files.length > 1) {
      setError("Drop a single CSV file at a time.");
      return;
    }
    handleFile(files[0]);
  };

  const runPreview = async (text: string) => {
    setError(null);
    try {
      const res = await fetch("/api/locations/bulk?mode=preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setPreview(json as PreviewResponse);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message ?? "Preview failed");
    }
  };

  // Walks the ready set in chunks so the bar can advance between requests. The
  // accumulators are plain locals rather than state: they're scoped to one
  // invocation (no stale-closure risk) and keeping them out of React avoids a
  // re-render cascade per chunk.
  const runCommit = async () => {
    if (!csvText || !preview) return;

    const readyIndices = preview.ready.map((r) => r.index);
    const nameByIndex = new Map(preview.ready.map((r) => [r.index, r.row.name]));

    cancelRef.current = false;
    setCancelling(false);
    setError(null);
    setStep("committing");
    setProgress({ done: 0, total: readyIndices.length, imported: 0, failed: 0 });

    const imported: CommitResponse["imported"] = [];
    const failed: CommitResponse["failed"] = [];
    const skipped: CommitResponse["skipped"] = buildSkippedEntries(preview);

    let done = 0;
    let stopped: "cancelled" | "error" | null = null;
    let chunkError: string | null = null;

    for (let i = 0; i < readyIndices.length; i += CHUNK_SIZE) {
      // Cancel takes effect between chunks. Aborting the in-flight request
      // wouldn't stop the server handler, so rows it had already written would
      // land in neither imported nor skipped.
      if (cancelRef.current) {
        stopped = "cancelled";
        break;
      }

      const batch = readyIndices.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/locations/bulk?mode=commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: csvText, indices: batch }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        imported.push(...json.imported);
        failed.push(...json.failed);
        skipped.push(...json.skipped); // drift only; normally empty
      } catch (e: any) {
        // The whole chunk is unaccounted for. Attributing every row to `failed`
        // is a guess — if the request died at the network layer the server may
        // still have written them — but it keeps the totals reconcilable, and
        // re-running the import is safe because those rows come back as
        // duplicates.
        const msg = e?.message ?? "Request failed";
        for (const idx of batch) {
          failed.push({
            index: idx,
            name: nameByIndex.get(idx) ?? `row ${idx + 2}`,
            error: `Batch request failed: ${msg}`,
          });
        }
        done += batch.length;
        setProgress({ done, total: readyIndices.length, imported: imported.length, failed: failed.length });
        stopped = "error";
        chunkError = msg;
        break;
      }

      done += batch.length;
      setProgress({ done, total: readyIndices.length, imported: imported.length, failed: failed.length });
    }

    // Account for rows we never sent, so every ready row appears exactly once in
    // the report.
    if (stopped) {
      const details =
        stopped === "cancelled"
          ? "import cancelled before this row"
          : "import stopped by an earlier error before this row";
      for (const idx of readyIndices.slice(done)) {
        skipped.push({ index: idx, reason: "not-attempted", details });
      }
    }

    // Always land on "result", even on failure — partial progress has to stay
    // visible, and closing from here is what refreshes the parent list.
    setResult({ imported, skipped, failed });
    if (chunkError) setError(chunkError);
    setCancelling(false);
    setStep("result");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="2xl" showCloseButton={step !== "committing"}>
        <DialogHeader>
          <DialogTitle>Bulk Import Locations</DialogTitle>
          <DialogDescription>
            Upload a CSV to create multiple locations at once. Each location can include a
            semicolon-separated list of fields.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 p-3 border border-destructive/40 bg-destructive/5 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === "upload" && (
          <div
            className="space-y-4"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="space-y-2">
              <span
                className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground block"
                style={{ fontFamily: "var(--font-body)" }}
              >
                CSV Format
              </span>
              <p className="text-xs text-muted-foreground">
                Header row required. Columns: <code className="font-mono">name, address, city, state, zip, fields</code>.
                The <code className="font-mono">fields</code> column is semicolon-separated.
                Wrap any value containing a comma in double quotes.
              </p>
              <pre className="text-[11px] bg-muted/40 p-3 border border-border overflow-x-auto whitespace-pre">
{SAMPLE_CSV}
              </pre>
            </div>

            <label
              className={cn(
                "block border-2 border-dashed transition-colors p-8 cursor-pointer text-center",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-elevated"
              )}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  // Allow re-selecting the same file after an error.
                  e.target.value = "";
                }}
              />
              <Upload
                className={cn(
                  "h-6 w-6 mx-auto mb-2 pointer-events-none",
                  dragging ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="text-sm font-semibold block pointer-events-none">
                {dragging ? "Drop to import" : "Choose a CSV file"}
              </span>
              <span className="text-xs text-muted-foreground block mt-1 pointer-events-none">
                or drag and drop a .csv here
              </span>
            </label>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>{fileName}</span>
            </div>

            {preview.warnings.length > 0 && (
              <div className="text-xs text-muted-foreground border border-border/60 bg-muted/30 p-2">
                {preview.warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}

            <PreviewSection
              title="Ready to import"
              count={preview.ready.length}
              tone="success"
              open={showReady}
              onToggle={() => setShowReady((v) => !v)}
            >
              {preview.ready.map((r) => (
                <RowLine key={r.index} index={r.index}>
                  <span className="font-semibold">{r.row.name}</span>
                  {r.row.city && (
                    <span className="text-muted-foreground"> &middot; {r.row.city}, {r.row.state}</span>
                  )}
                  {r.row.fields.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      &middot; {r.row.fields.length} field{r.row.fields.length === 1 ? "" : "s"}
                    </span>
                  )}
                </RowLine>
              ))}
            </PreviewSection>

            <PreviewSection
              title="Duplicates (will be skipped)"
              count={preview.duplicate.length}
              tone="warn"
              open={showDuplicate}
              onToggle={() => setShowDuplicate((v) => !v)}
            >
              {preview.duplicate.map((d) => (
                <RowLine key={d.index} index={d.index}>
                  <span className="font-semibold">{d.row.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &middot; matches{" "}
                    {d.matchedBy === "db"
                      ? `existing #${d.existingId} (${d.existingName})`
                      : `earlier CSV row (${d.existingName})`}
                  </span>
                </RowLine>
              ))}
            </PreviewSection>

            <PreviewSection
              title="Invalid (will be skipped)"
              count={preview.invalid.length}
              tone="error"
              open={showInvalid}
              onToggle={() => setShowInvalid((v) => !v)}
            >
              {preview.invalid.map((inv) => (
                <RowLine key={inv.index} index={inv.index}>
                  <span className="text-destructive">{inv.errors.join("; ")}</span>
                </RowLine>
              ))}
            </PreviewSection>
          </div>
        )}

        {step === "committing" && (
          <ImportProgress
            done={progress.done}
            total={progress.total}
            imported={progress.imported}
            failed={progress.failed}
            cancelling={cancelling}
          />
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 border border-green-600/30 bg-green-600/5">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
              <div className="text-xs">
                <div className="font-semibold">
                  Imported {result.imported.length} location{result.imported.length === 1 ? "" : "s"}.
                </div>
                {(() => {
                  // "not-attempted" rows were never sent (cancel, or a stop
                  // after a failed chunk) — calling those "duplicates or
                  // invalid" would misreport what happened.
                  const notAttempted = result.skipped.filter(
                    (s) => s.reason === "not-attempted"
                  ).length;
                  const preSkipped = result.skipped.length - notAttempted;
                  return (
                    <>
                      {preSkipped > 0 && (
                        <div className="text-muted-foreground mt-0.5">
                          Skipped {preSkipped} (duplicates or invalid).
                        </div>
                      )}
                      {notAttempted > 0 && (
                        <div className="text-muted-foreground mt-0.5">
                          {notAttempted} row{notAttempted === 1 ? "" : "s"} not attempted —
                          the import stopped early.
                        </div>
                      )}
                    </>
                  );
                })()}
                {result.failed.length > 0 && (
                  <>
                    <div className="text-destructive mt-0.5">
                      {result.failed.length} row{result.failed.length === 1 ? "" : "s"} failed during import.
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      Re-running this import is safe — locations that already exist are
                      detected as duplicates and skipped.
                    </div>
                  </>
                )}
              </div>
            </div>

            {result.failed.length > 0 && (
              <PreviewSection
                title="Failed"
                count={result.failed.length}
                tone="error"
                open={showFailed}
                onToggle={() => setShowFailed((v) => !v)}
              >
                {result.failed.map((f) => (
                  <RowLine key={f.index} index={f.index}>
                    <span className="font-semibold">{f.name}</span>
                    <span className="text-destructive"> &middot; {f.error}</span>
                  </RowLine>
                ))}
              </PreviewSection>
            )}

            {result.skipped.length > 0 && (
              <PreviewSection
                title="Skipped"
                count={result.skipped.length}
                tone="warn"
                open={showSkipped}
                onToggle={() => setShowSkipped((v) => !v)}
              >
                {result.skipped.map((s) => (
                  <RowLine key={s.index} index={s.index}>
                    <span className="text-muted-foreground">
                      {s.reason}: {s.details}
                    </span>
                  </RowLine>
                ))}
              </PreviewSection>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "committing" && (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
                setCancelling(true);
              }}
              disabled={cancelling}
              className={cn(
                BTN_BASE,
                "border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              {cancelling ? "Finishing current batch…" : "Cancel Import"}
            </button>
          )}
          {step === "preview" && (
            <>
              <button
                type="button"
                onClick={() => handleClose(false)}
                className={cn(
                  BTN_BASE,
                  "border-border text-muted-foreground hover:text-foreground"
                )}
                style={{ fontFamily: "var(--font-body)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runCommit}
                disabled={!preview || preview.ready.length === 0}
                className={cn(
                  BTN_BASE,
                  "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
                )}
                style={{ fontFamily: "var(--font-body)" }}
              >
                Confirm Import ({preview?.ready.length ?? 0})
              </button>
            </>
          )}
          {step === "result" && (
            <button
              type="button"
              onClick={() => handleClose(false)}
              className={cn(
                BTN_BASE,
                "bg-primary text-primary-foreground border-primary hover:opacity-90"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              Close
            </button>
          )}
          {step === "upload" && (
            <button
              type="button"
              onClick={() => handleClose(false)}
              className={cn(
                BTN_BASE,
                "border-border text-muted-foreground hover:text-foreground"
              )}
              style={{ fontFamily: "var(--font-body)" }}
            >
              Cancel
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportProgress({
  done,
  total,
  imported,
  failed,
  cancelling,
}: {
  done: number;
  total: number;
  imported: number;
  failed: number;
  cancelling: boolean;
}) {
  const pctOf = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  const pct = Math.round(pctOf(done));
  // Rows the server reported as no longer importable mid-run. Normally 0, but
  // without this segment the bar would under-report and never reach 100%.
  const drifted = Math.max(0, done - imported - failed);

  return (
    <div className="py-6 space-y-3">
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} rows processed`}
        className="h-2 w-full flex overflow-hidden bg-muted border border-border"
      >
        <div
          className="bg-green-600 transition-[width] duration-300"
          style={{ width: `${pctOf(imported)}%` }}
        />
        <div
          className="bg-destructive transition-[width] duration-300"
          style={{ width: `${pctOf(failed)}%` }}
        />
        <div
          className="bg-amber-600 transition-[width] duration-300"
          style={{ width: `${pctOf(drifted)}%` }}
        />
      </div>

      {/* The live region goes on the text, not the bar: screen readers don't
          reliably announce aria-valuenow on an unfocused progressbar, and one
          polite announcement per chunk is the right cadence. */}
      <div className="flex items-baseline justify-between gap-3 text-xs" aria-live="polite">
        <span className="tabular-nums text-muted-foreground">
          {done} of {total} row{total === 1 ? "" : "s"} &middot; {pct}%
        </span>
        <span className="tabular-nums text-muted-foreground">
          <span className="text-green-600 font-semibold">{imported}</span> imported
          {failed > 0 && (
            <>
              {" "}
              &middot; <span className="text-destructive font-semibold">{failed}</span> failed
            </>
          )}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {cancelling
          ? "Cancelling — finishing the current batch, then stopping."
          : "Each address is verified and geocoded, so this takes a moment."}
      </p>
    </div>
  );
}

function PreviewSection({
  title,
  count,
  tone,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  tone: "success" | "warn" | "error";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  const toneClass =
    tone === "success"
      ? "text-green-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-destructive";

  return (
    <div className="border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={cn("text-xs font-semibold uppercase tracking-widest", toneClass)}>
            {title}
          </span>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-border/50 text-xs space-y-1 max-h-64 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

function RowLine({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground tabular-nums text-[10px] shrink-0">
        row {index + 2}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  );
}
