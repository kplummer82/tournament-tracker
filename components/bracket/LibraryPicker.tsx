import { useCallback, useEffect, useState } from "react";
import type { BracketStructure } from "./types";
import type { BracketTemplateRow } from "@/pages/api/bracket-templates";
import { BRACKET_TYPE_VALUES, getBracketTypeLabel } from "@/lib/bracket-types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LibraryPickerProps = {
  onSelect: (template: {
    id: number;
    name: string;
    structure: BracketStructure;
    bracket_type?: string | null;
    seed_count?: number | null;
  }) => void;
  selectedId?: number | null;
};

const SEED_OPTIONS = [null, 4, 8, 16, 32] as const;

function buildQueryParams(search: string, bracketType: string | null, seedCount: number | null): string {
  const params = new URLSearchParams();
  params.set("library", "1");
  if (search.trim()) params.set("q", search.trim());
  if (bracketType && bracketType !== "all") params.set("bracket_type", bracketType);
  if (seedCount != null) params.set("seed_count", String(seedCount));
  return params.toString();
}

export default function LibraryPicker({ onSelect, selectedId }: LibraryPickerProps) {
  const [templates, setTemplates] = useState<BracketTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [bracketTypeFilter, setBracketTypeFilter] = useState<string>("all");
  const [seedFilter, setSeedFilter] = useState<number | null>(null);
  const [searchDebounce, setSearchDebounce] = useState("");

  const fetchTemplates = useCallback(async () => {
    const query = buildQueryParams(searchDebounce, bracketTypeFilter === "all" ? null : bracketTypeFilter, seedFilter);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bracket-templates?${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [searchDebounce, bracketTypeFilter, seedFilter]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  if (loading && templates.length === 0) return <div className="text-sm text-muted-foreground">Loading library…</div>;
  if (error && templates.length === 0) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Input
          type="search"
          placeholder="Search by name or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 text-sm"
        />
        <div className="flex gap-2 flex-wrap">
          <Select value={bracketTypeFilter} onValueChange={setBracketTypeFilter}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
              <SelectValue placeholder="Bracket type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm">All types</SelectItem>
              {BRACKET_TYPE_VALUES.map((v) => (
                <SelectItem key={v} value={v} className="text-sm">
                  {getBracketTypeLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={seedFilter == null ? "any" : String(seedFilter)}
            onValueChange={(v) => setSeedFilter(v === "any" ? null : parseInt(v, 10))}
          >
            <SelectTrigger className="h-9 w-[120px] text-sm">
              <SelectValue placeholder="Seeds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any" className="text-sm">Any seeds</SelectItem>
              {SEED_OPTIONS.filter((n): n is number => n != null).map((n) => (
                <SelectItem key={n} value={String(n)} className="text-sm">
                  {n} seeds
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {templates.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {search || bracketTypeFilter !== "all" || seedFilter != null
            ? "No templates match your filters."
            : "No templates in system library yet. Build one and save it to the library."}
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => {
            const structure = t.structure as BracketStructure;
            const isSelected = selectedId != null && t.id === selectedId;
            const seedCount = t.seed_count ?? structure?.numTeams ?? null;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: t.id,
                      name: t.name,
                      structure,
                      bracket_type: t.bracket_type,
                      seed_count: t.seed_count,
                    })
                  }
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/30 text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  {t.description && (
                    <span className="ml-2 text-muted-foreground">{t.description}</span>
                  )}
                  <span className="ml-2 text-muted-foreground">
                    {getBracketTypeLabel(t.bracket_type)}
                    {seedCount != null && ` · ${seedCount} seeds`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
