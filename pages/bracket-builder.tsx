import { useState, useCallback } from "react";
import Header from "@/components/Header";
import BracketPreview from "@/components/bracket/BracketPreview";
import LibraryPicker from "@/components/bracket/LibraryPicker";
import StructureEditor from "@/components/bracket/StructureEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BracketStructure } from "@/components/bracket/types";
import { validateFirstRoundSeeds } from "@/components/bracket/types";
import {
  BRACKET_TYPE_VALUES,
  getBracketTypeLabel,
  isValidBracketType,
  type BracketTypeValue,
} from "@/lib/bracket-types";

export default function BracketBuilderPage() {
  const [structure, setStructure] = useState<BracketStructure | null>(null);
  const [source, setSource] = useState<"library" | "scratch">("scratch");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [scratchBracketType, setScratchBracketType] = useState<BracketTypeValue | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSelectFromLibrary = useCallback(
    (template: {
      id: number;
      name: string;
      structure: BracketStructure;
      bracket_type?: string | null;
      seed_count?: number | null;
    }) => {
      setSelectedTemplateId(template.id);
      const structureWithType: BracketStructure = {
        ...template.structure,
        bracketType:
          template.bracket_type && isValidBracketType(template.bracket_type)
            ? template.bracket_type
            : template.structure.bracketType ?? "single_elimination",
      };
      setStructure(structureWithType);
      setSource("library");
      setSaveName(template.name ? `Copy of ${template.name}` : "");
    },
    []
  );

  const handleBuildFromScratch = useCallback(() => {
    setSource("scratch");
    setSelectedTemplateId(null);
    setScratchBracketType(null);
    setStructure(null);
    setSaveName("");
    setSaveDescription("");
  }, []);

  const handleSaveToLibrary = useCallback(async () => {
    if (!structure) {
      setSaveError("Build or select a bracket first.");
      return;
    }
    if (!validateFirstRoundSeeds(structure).valid) {
      setSaveError("Fix duplicate or missing seeds in Round 1 before saving.");
      return;
    }
    const name = saveName.trim();
    if (!name) {
      setSaveError("Name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/bracket-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: saveDescription.trim() || null,
          structure,
          is_library: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSaveSuccess(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [structure, saveName, saveDescription]);

  return (
    <div className="min-h-screen">
      <Header />

      <main className="mx-auto max-w-7xl px-4 md:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Bracket Builder</h1>
        <p className="text-muted-foreground mb-8">
          Create bracket layouts and save them to the system library. No tournament required.
        </p>

        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          {/* Left: source and structure */}
          <div className="space-y-6 rounded-xl border bg-muted/20 p-4">
            <div>
              <h2 className="text-sm font-semibold mb-2">Source</h2>
              <div className="flex gap-2 mb-4">
                <Button
                  variant={source === "scratch" ? "default" : "outline"}
                  size="sm"
                  onClick={handleBuildFromScratch}
                >
                  Build from scratch
                </Button>
                <Button
                  variant={source === "library" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSource("library")}
                >
                  Start from library
                </Button>
              </div>
              {source === "library" && (
                <div className="mt-2">
                  <LibraryPicker
                    onSelect={handleSelectFromLibrary}
                    selectedId={selectedTemplateId}
                  />
                </div>
              )}
            </div>
            {source === "scratch" && scratchBracketType === null && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Choose bracket type</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Only Single elimination has a from-scratch builder for now. Other types: start from library.
                </p>
                <div className="flex flex-wrap gap-2">
                  {BRACKET_TYPE_VALUES.map((t) => (
                    <Button
                      key={t}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setScratchBracketType(t);
                      }}
                    >
                      {getBracketTypeLabel(t)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {source === "scratch" && scratchBracketType === "single_elimination" && (
              <StructureEditor value={structure} onChange={setStructure} />
            )}
            {source === "scratch" && scratchBracketType != null && scratchBracketType !== "single_elimination" && (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                From-scratch builder is only available for Single elimination. Use &quot;Start from library&quot; to pick a template for {getBracketTypeLabel(scratchBracketType)}.
              </div>
            )}
          </div>

          {/* Right: Bracket Workspace */}
          <div className="rounded-xl border bg-muted/20 p-4">
            <h2 className="text-sm font-semibold mb-4">Bracket Workspace</h2>
            <BracketPreview
              structure={structure}
              editable={true}
              onStructureChange={setStructure}
            />
          </div>
        </div>

        {/* Save to system library / Save as new template */}
        <div className="mt-8 rounded-xl border bg-muted/20 p-4 max-w-xl">
          <h2 className="text-sm font-semibold mb-3">
            {source === "library" ? "Save as new template" : "Save to system library"}
          </h2>
          {source === "library" && selectedTemplateId != null && (
            <p className="text-xs text-muted-foreground mb-3">
              Save a copy with a new name. This creates a new template; the original stays in the library.
            </p>
          )}
          <div className="space-y-3">
            <div>
              <Label htmlFor="save-name">Name</Label>
              <Input
                id="save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={source === "library" ? "Copy of …" : "e.g. 8-team single elimination"}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="save-desc">Description (optional)</Label>
              <Input
                id="save-desc"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
              />
            </div>
            {structure && (
              <p className="text-xs text-muted-foreground">
                Bracket type ({structure.bracketType ? getBracketTypeLabel(structure.bracketType) : "Single elimination"}) and seed count ({structure.numTeams}) are detected from the bracket structure.
              </p>
            )}
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {source === "library" ? "Saved as new template." : "Saved to system library."}
              </p>
            )}
            <Button
              onClick={handleSaveToLibrary}
              disabled={!structure || saving || (structure ? !validateFirstRoundSeeds(structure).valid : false)}
            >
              {saving
                ? "Saving…"
                : source === "library"
                  ? "Save as new template"
                  : "Save to system library"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
