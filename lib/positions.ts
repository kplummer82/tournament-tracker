export const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"] as const;
export type Position = (typeof POSITIONS)[number];
export type Priority = "primary" | "secondary";
export type PositionMap = Record<Position, Priority | null>;

export function emptyPositionMap(): PositionMap {
  return Object.fromEntries(POSITIONS.map((p) => [p, null])) as PositionMap;
}
