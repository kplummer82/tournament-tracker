"use client";

import { useState } from "react";
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

type ParsedRow = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  fields: string[];
};

type PreviewReady = { index: number; row: ParsedRow };
type PreviewDuplicate = {
  index: number;
  row: ParsedRow;
  matchedBy: "csv" | "db";
  existingId?: number;
  existingName?: string;
};
type PreviewInvalid = { index: number; row: Partial<ParsedRow>; errors: string[] };

type PreviewResponse = {
  ready: PreviewReady[];
  duplicate: PreviewDuplicate[];
  invalid: PreviewInvalid[];
  warnings: string[];
};

type CommitResponse = {
  imported: Array<{ id: number; name: string; field_count: number }>;
  skipped: Array<{ index: number; reason: "duplicate" | "invalid"; details: string }>;
  failed: Array<{ index: number; name: string; error: string }>;
};

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
  };

  const handleClose = (next: boolean) => {
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
    setFileName(file.name);
    try {
      const text = await file.text();
      setCsvText(text);
      await runPreview(text);
    } catch (e: any) {
      setError(e?.message ?? "Failed to read file");
    }
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

  const runCommit = async () => {
    if (!csvText) return;
    setStep("committing");
    setError(null);
    try {
      const res = await fetch("/api/locations/bulk?mode=commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setResult(json as CommitResponse);
      setStep("result");
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
      setStep("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="2xl">
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
          <div className="space-y-4">
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
                "block border-2 border-dashed border-border bg-card hover:bg-elevated transition-colors p-8 cursor-pointer text-center"
              )}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <span className="text-sm font-semibold block">Choose a CSV file</span>
              <span className="text-xs text-muted-foreground block mt-1">
                or drag and drop is not supported yet &mdash; click to browse
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
          <div className="py-8 text-center text-sm text-muted-foreground">
            Importing&hellip; this can take a moment while each address is verified and geocoded.
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 border border-green-600/30 bg-green-600/5">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
              <div className="text-xs">
                <div className="font-semibold">
                  Imported {result.imported.length} location{result.imported.length === 1 ? "" : "s"}.
                </div>
                {result.skipped.length > 0 && (
                  <div className="text-muted-foreground mt-0.5">
                    Skipped {result.skipped.length} (duplicates or invalid).
                  </div>
                )}
                {result.failed.length > 0 && (
                  <div className="text-destructive mt-0.5">
                    {result.failed.length} row{result.failed.length === 1 ? "" : "s"} failed during import.
                  </div>
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
