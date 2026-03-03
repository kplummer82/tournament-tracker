/**
 * Bracket type values and labels. Used for API validation, LibraryPicker, and Bracket Builder.
 * Four types for now: single_elimination, double_elimination, march_madness, round_robin.
 */

export const BRACKET_TYPE_VALUES = [
  "single_elimination",
  "double_elimination",
  "march_madness",
  "round_robin",
] as const;

export type BracketTypeValue = (typeof BRACKET_TYPE_VALUES)[number];

export const BRACKET_TYPE_LABELS: Record<BracketTypeValue, string> = {
  single_elimination: "Single elimination",
  double_elimination: "Double elimination",
  march_madness: "March Madness",
  round_robin: "Round robin",
};

export function getBracketTypeLabel(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return BRACKET_TYPE_LABELS[value as BracketTypeValue] ?? value;
}

export function isValidBracketType(value: unknown): value is BracketTypeValue {
  return typeof value === "string" && BRACKET_TYPE_VALUES.includes(value as BracketTypeValue);
}
