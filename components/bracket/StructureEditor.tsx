import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { singleEliminationWithByes } from "./types";
import type { BracketStructure } from "./types";

type StructureEditorProps = {
  value: BracketStructure | null;
  onChange: (structure: BracketStructure) => void;
};

function describeStructure(structure: BracketStructure): string {
  const { numTeams, rounds } = structure;
  const numRounds = rounds.length;
  const round0 = rounds[0];
  const byeCount = round0?.games.filter((g) => (g.seeds?.length ?? 0) === 1).length ?? 0;
  const playInCount = round0?.games.filter((g) => (g.seeds?.length ?? 0) >= 2).length ?? 0;

  const parts: string[] = [`${numTeams} teams`, `${numRounds} round${numRounds !== 1 ? "s" : ""}`];
  if (byeCount > 0) parts.push(`${byeCount} bye${byeCount !== 1 ? "s" : ""}`);
  if (playInCount > 0 && byeCount > 0) parts.push(`${playInCount} play-in game${playInCount !== 1 ? "s" : ""}`);
  return parts.join(" · ");
}

export default function StructureEditor({ value, onChange }: StructureEditorProps) {
  const [inputValue, setInputValue] = useState<string>(
    value?.numTeams ? String(value.numTeams) : ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    const n = parseInt(inputValue, 10);
    if (!Number.isFinite(n) || n < 2 || n > 64) {
      setError("Enter a number between 2 and 64.");
      return;
    }
    setError(null);
    try {
      onChange(singleEliminationWithByes(n));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate bracket.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleGenerate();
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Number of teams</label>
      <div className="flex gap-2">
        <Input
          type="number"
          min={2}
          max={64}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 11"
          className="w-28"
        />
        <Button type="button" size="sm" onClick={handleGenerate}>
          Generate
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value && (
        <p className="text-xs text-muted-foreground">{describeStructure(value)}</p>
      )}
    </div>
  );
}
