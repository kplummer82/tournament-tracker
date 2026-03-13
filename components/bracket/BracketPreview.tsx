"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import type { BracketStructure, BracketRound, BracketGame } from "./types";
import {
  validateFirstRoundSeeds,
  cloneStructure,
  addFirstRoundGame,
  addGameToRound,
  deleteGameFromStructure,
  toggleByeGame,
  computeWinnerSeeds,
  getHomeSlotIndex,
} from "./types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { GripVertical, Plus, Trash2, ArrowLeftRight, Maximize2, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

const BOX_WIDTH = 224;
const BOX_HEIGHT = 112;
const SLOT_GAP = 8;
/** Vertical space per first-round slot: box height + gap so games never overlap. */
const SLOT_HEIGHT = BOX_HEIGHT + SLOT_GAP;
const ROUND_GAP = 56;
const LINE_EXTEND = 28;

type Transform = { x: number; y: number; scale: number };
const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
const ZOOM_STEP = 0.25;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function zoomAt(prev: Transform, cursorX: number, cursorY: number, delta: number): Transform {
  const newScale = clamp(prev.scale + delta, MIN_SCALE, MAX_SCALE);
  const contentX = (cursorX - prev.x) / prev.scale;
  const contentY = (cursorY - prev.y) / prev.scale;
  return { scale: newScale, x: cursorX - contentX * newScale, y: cursorY - contentY * newScale };
}

function fitTransform(totalW: number, totalH: number, vpW: number, vpH: number): Transform {
  const scale = clamp(Math.min((vpW - 32) / totalW, (vpH - 32) / totalH), MIN_SCALE, MAX_SCALE);
  return { scale, x: (vpW - totalW * scale) / 2, y: (vpH - totalH * scale) / 2 };
}

export type BracketGameDetails = {
  gamedate?: string | null;
  gametime?: string | null;
  location?: string | null;
  homescore?: number | null;
  awayscore?: number | null;
};

type BracketPreviewProps = {
  structure: BracketStructure | null;
  /** Optional: seed index -> display name (e.g. team name). If not provided, show seed numbers only. */
  seedLabels?: Record<number, string>;
  /** Offset to add to bracket-relative seed numbers for display (e.g. 8 so seed 1 shows as #9). */
  seedOffset?: number;
  /** When true and onStructureChange is set, first-round seeds are editable (dropdowns) and first-round games are draggable. */
  editable?: boolean;
  onStructureChange?: (structure: BracketStructure) => void;
  /** Callback when a game box is clicked (for scheduling). Only fires when editable is false. */
  onGameClick?: (bracketGameId: string) => void;
  /** Optional game scheduling details to display on bracket boxes, keyed by bracket_game_id. */
  gameDetails?: Record<string, BracketGameDetails>;
};

/** Center Y (px) for game at round r, game index k (0-based). First round has slots 0..N-1 with centers at (k+0.5)*SLOT_HEIGHT. */
function gameCenterY(roundIndex: number, gameIndex: number): number {
  const r = roundIndex;
  const k = gameIndex;
  if (r === 0) return (k + 0.5) * SLOT_HEIGHT;
  const halfSpan = 1 << (r - 1); // 2^(r-1)
  return (k * (1 << r) + halfSpan) * SLOT_HEIGHT;
}

function SeedSelect({
  value,
  numTeams,
  seedLabels,
  duplicates,
  onValueChange,
}: {
  value: number;
  numTeams: number;
  seedLabels?: Record<number, string>;
  duplicates: Set<number>;
  onValueChange: (seed: number) => void;
}) {
  const hasError = duplicates.has(value);
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onValueChange(parseInt(v, 10))}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "w-full h-7 text-xs",
          hasError && "border-destructive ring-2 ring-destructive/50"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: numTeams }, (_, i) => i + 1).map((seed) => (
          <SelectItem key={seed} value={String(seed)}>
            {seedLabels?.[seed] ?? `Seed ${seed}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function GameSlot({
  game,
  roundIndex,
  gameIndex,
  seedLabels,
  seedOffset,
  topPx,
  editable,
  onSeedChange,
  onFeedsFromChange,
  onDelete,
  duplicates,
  numTeams,
  prevRoundGames,
  homeSlotIndex,
  innerOnly,
  onToggleBye,
  onGameClick,
  gameDetails,
}: {
  game: BracketGame;
  roundIndex: number;
  gameIndex: number;
  seedLabels?: Record<number, string>;
  seedOffset?: number;
  topPx: number;
  editable?: boolean;
  onSeedChange?: (gameIndex: number, slotIndex: number, newSeed: number) => void;
  onFeedsFromChange?: (slotIndex: number, gameId: string) => void;
  onDelete?: () => void;
  onToggleBye?: () => void;
  duplicates?: Set<number>;
  numTeams?: number;
  prevRoundGames?: BracketGame[];
  /** 0 = slot A is home, 1 = slot B is home, null = cannot determine yet. */
  homeSlotIndex?: 0 | 1 | null;
  /** When true, render only inner content (for use inside DraggableFirstRoundSlot). */
  innerOnly?: boolean;
  onGameClick?: (bracketGameId: string) => void;
  gameDetails?: BracketGameDetails;
}) {
  const isFirstRound = roundIndex === 0;
  const isByeGame = isFirstRound && (game.seeds?.length ?? 0) === 1;
  const off = seedOffset ?? 0;
  const slot1 =
    isFirstRound && game.seeds?.[0]
      ? seedLabels?.[game.seeds[0]]
        ? `${seedLabels[game.seeds[0]]} (#${game.seeds[0] + off})`
        : `Seed ${game.seeds[0] + off}`
      : game.feedsFrom?.[0]
        ? `Winner ${game.feedsFrom[0]}`
        : "—";
  const slot2 =
    isFirstRound && game.seeds?.[1]
      ? seedLabels?.[game.seeds[1]]
        ? `${seedLabels[game.seeds[1]]} (#${game.seeds[1] + off})`
        : `Seed ${game.seeds[1] + off}`
      : game.feedsFrom?.[1]
        ? `Winner ${game.feedsFrom[1]}`
        : "—";

  const isEditableFirstRound = isFirstRound && editable && onSeedChange != null && numTeams != null && duplicates != null;
  const isEditableLaterRound =
    !isFirstRound && editable && onFeedsFromChange != null && prevRoundGames != null && prevRoundGames.length >= 2;

  const content = (
    <>
      <div className="flex items-center justify-between gap-1.5 shrink-0 min-w-0">
        <span className="text-[11px] text-muted-foreground leading-snug truncate">{game.id}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          {isEditableFirstRound && onToggleBye && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onToggleBye(); }}
              title={isByeGame ? "Convert to play-in game" : "Convert to bye"}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {editable && onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive -mr-0.5"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete game"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {isEditableFirstRound && isByeGame ? (
        <div className="mt-0.5">
          <SeedSelect
            value={game.seeds![0]}
            numTeams={numTeams!}
            seedLabels={seedLabels}
            duplicates={duplicates!}
            onValueChange={(s) => onSeedChange!(gameIndex, 0, s)}
          />
        </div>
      ) : isEditableFirstRound && game.seeds && game.seeds.length >= 2 ? (
        <>
          <div className="mt-0.5">
            <SeedSelect
              value={game.seeds[0] ?? 1}
              numTeams={numTeams}
              seedLabels={seedLabels}
              duplicates={duplicates}
              onValueChange={(s) => onSeedChange(gameIndex, 0, s)}
            />
          </div>
          <div className="text-xs text-muted-foreground py-0.5 shrink-0">vs</div>
          <div>
            <SeedSelect
              value={game.seeds[1] ?? 2}
              numTeams={numTeams}
              seedLabels={seedLabels}
              duplicates={duplicates}
              onValueChange={(s) => onSeedChange(gameIndex, 1, s)}
            />
          </div>
        </>
      ) : isEditableLaterRound && game.feedsFrom && prevRoundGames ? (
        <>
          <div className="mt-0.5">
            <Select
              value={game.feedsFrom[0] ?? ""}
              onValueChange={(v) => onFeedsFromChange(0, v)}
            >
              <SelectTrigger size="sm" className="h-7 text-xs w-full">
                <SelectValue placeholder="Feeds from" />
              </SelectTrigger>
              <SelectContent>
                {prevRoundGames.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground py-0.5 shrink-0">vs</div>
          <div>
            <Select
              value={game.feedsFrom[1] ?? ""}
              onValueChange={(v) => onFeedsFromChange(1, v)}
            >
              <SelectTrigger size="sm" className="h-7 text-xs w-full">
                <SelectValue placeholder="Feeds from" />
              </SelectTrigger>
              <SelectContent>
                {prevRoundGames.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : isByeGame ? (
        <>
          <div className="mt-0.5 min-w-0">
            <span className="text-sm font-medium leading-snug break-words">{slot1}</span>
          </div>
          <div className="mt-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">
              BYE
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 mt-0.5 min-w-0">
            <span className={cn(
              "text-[10px] font-bold shrink-0 w-4 text-center",
              homeSlotIndex === 0 ? "text-sky-400" : "text-muted-foreground"
            )}>
              {homeSlotIndex === 0 ? "H" : homeSlotIndex === 1 ? "V" : ""}
            </span>
            <span className="text-sm font-medium leading-snug break-words min-w-0 flex-1">{slot1}</span>
            {gameDetails?.homescore != null && (
              <span className="text-xs font-semibold tabular-nums text-foreground/70 shrink-0">{gameDetails.homescore}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground leading-snug shrink-0">vs</div>
          <div className="flex items-center gap-1 min-w-0">
            <span className={cn(
              "text-[10px] font-bold shrink-0 w-4 text-center",
              homeSlotIndex === 1 ? "text-sky-400" : "text-muted-foreground"
            )}>
              {homeSlotIndex === 1 ? "H" : homeSlotIndex === 0 ? "V" : ""}
            </span>
            <span className="text-sm font-medium leading-snug break-words min-w-0 flex-1">{slot2}</span>
            {gameDetails?.awayscore != null && (
              <span className="text-xs font-semibold tabular-nums text-foreground/70 shrink-0">{gameDetails.awayscore}</span>
            )}
          </div>
          {gameDetails && (gameDetails.gamedate || gameDetails.gametime) && (
            <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">
              {[gameDetails.gamedate, gameDetails.gametime].filter(Boolean).join(" ")}
            </div>
          )}
        </>
      )}
    </>
  );

  if (innerOnly) return content;

  const isClickable = !editable && !isByeGame && onGameClick != null;

  return (
    <div
      className={cn(
        "absolute rounded-lg p-3 box-border flex flex-col justify-center min-h-0",
        isByeGame
          ? "border border-dashed border-border/60 bg-muted/10"
          : "border border-border bg-muted/30",
        isClickable && "cursor-pointer hover:border-primary/60 hover:bg-muted/50 transition-colors"
      )}
      style={{
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        left: roundIndex * (BOX_WIDTH + ROUND_GAP),
        top: topPx,
      }}
      title={isByeGame ? `${slot1} (BYE)` : isEditableFirstRound ? undefined : `${slot1} vs ${slot2}`}
      onClick={isClickable ? () => onGameClick(game.id) : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGameClick!(game.id); } } : undefined}
    >
      {content}
    </div>
  );
}

/** Swap two first-round games by index and renumber ids so game at index i is g{i+1}. */
function swapFirstRoundGames(
  structure: BracketStructure,
  fromIndex: number,
  toIndex: number
): BracketStructure {
  if (fromIndex === toIndex) return structure;
  const next = cloneStructure(structure);
  const round0 = next.rounds[0];
  if (!round0?.games?.length || fromIndex < 0 || toIndex < 0 || fromIndex >= round0.games.length || toIndex >= round0.games.length)
    return structure;
  const games = round0.games;
  [games[fromIndex], games[toIndex]] = [games[toIndex], games[fromIndex]];
  games.forEach((g, i) => {
    g.id = `g${i + 1}`;
  });
  return next;
}

const FIRST_ROUND_DROP_PREFIX = "r0-";

function DraggableFirstRoundSlot({
  gameIndex,
  topPx,
  isByeGame,
  children,
}: {
  gameIndex: number;
  topPx: number;
  isByeGame?: boolean;
  children: React.ReactNode;
}) {
  const id = `${FIRST_ROUND_DROP_PREFIX}${gameIndex}`;
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const setRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  return (
    <div
      ref={setRef}
      className={cn(
        "absolute rounded-lg p-3 box-border flex flex-col justify-center min-h-0",
        isByeGame
          ? "border border-dashed border-border/60 bg-muted/10"
          : "border border-border bg-muted/30",
        isOver && "ring-2 ring-primary/50"
      )}
      style={{
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        left: 0 * (BOX_WIDTH + ROUND_GAP),
        top: topPx,
      }}
    >
      <div
        {...listeners}
        {...attributes}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted/50 touch-none"
        aria-label="Drag to reorder game"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

export default function BracketPreview({
  structure,
  seedLabels,
  seedOffset,
  editable,
  onStructureChange,
  onGameClick,
  gameDetails,
}: BracketPreviewProps) {
  // Compute dimensions early so hooks can depend on them (hooks must run unconditionally)
  const rounds = (structure?.rounds ?? []) as BracketRound[];
  const firstRoundCount = rounds[0]?.games?.length ?? 0;
  const totalHeight = firstRoundCount * SLOT_HEIGHT;
  const totalWidth = rounds.length > 0
    ? rounds.length * BOX_WIDTH + (rounds.length - 1) * ROUND_GAP
    : 0;

  // Existing state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Fullscreen + zoom/pan state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [isCursorGrabbing, setIsCursorGrabbing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const touchesRef = useRef<Touch[]>([]);

  const handleFitToScreen = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    setTransform(fitTransform(totalWidth, totalHeight, el.clientWidth, el.clientHeight));
  }, [totalWidth, totalHeight]);

  const handleCloseFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setTimeout(() => fullscreenBtnRef.current?.focus(), 0);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || activeDragId !== null) return;
    if ((e.target as HTMLElement).closest("button,select,[role=option],[data-radix-select-trigger]")) return;
    isPanningRef.current = true;
    setIsCursorGrabbing(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [activeDragId, transform.x, transform.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    setTransform(p => ({
      ...p,
      x: panStartRef.current.tx + e.clientX - panStartRef.current.x,
      y: panStartRef.current.ty + e.clientY - panStartRef.current.y,
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    isPanningRef.current = false;
    setIsCursorGrabbing(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { handleCloseFullscreen(); return; }
    if (e.key === "+" || e.key === "=") setTransform(p => ({ ...p, scale: clamp(p.scale + ZOOM_STEP, MIN_SCALE, MAX_SCALE) }));
    if (e.key === "-") setTransform(p => ({ ...p, scale: clamp(p.scale - ZOOM_STEP, MIN_SCALE, MAX_SCALE) }));
    if (e.key === "0") handleFitToScreen();
  }, [handleCloseFullscreen, handleFitToScreen]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  // Auto-fit + focus when fullscreen opens
  useEffect(() => {
    if (isFullscreen && overlayRef.current) {
      overlayRef.current.focus();
      setTimeout(handleFitToScreen, 0);
    }
  }, [isFullscreen, handleFitToScreen]);

  // Global Escape key
  useEffect(() => {
    if (!isFullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") handleCloseFullscreen(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isFullscreen, handleCloseFullscreen]);

  // Mouse wheel zoom (imperative — passive:false required to call preventDefault)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !isFullscreen) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setTransform(p => zoomAt(p, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [isFullscreen]);

  // Touch pan + pinch-to-zoom
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !isFullscreen) return;
    const onStart = (e: TouchEvent) => { touchesRef.current = Array.from(e.touches); };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const prev = touchesRef.current;
      const curr = Array.from(e.touches);
      if (curr.length === 1 && prev.length === 1) {
        setTransform(t => ({
          ...t,
          x: t.x + curr[0].clientX - prev[0].clientX,
          y: t.y + curr[0].clientY - prev[0].clientY,
        }));
      } else if (curr.length === 2 && prev.length === 2) {
        const prevDist = Math.hypot(prev[1].clientX - prev[0].clientX, prev[1].clientY - prev[0].clientY);
        const currDist = Math.hypot(curr[1].clientX - curr[0].clientX, curr[1].clientY - curr[0].clientY);
        const rect = el.getBoundingClientRect();
        const mx = (curr[0].clientX + curr[1].clientX) / 2 - rect.left;
        const my = (curr[0].clientY + curr[1].clientY) / 2 - rect.top;
        setTransform(t => {
          const newScale = clamp(t.scale * (currDist / prevDist), MIN_SCALE, MAX_SCALE);
          const cx = (mx - t.x) / t.scale;
          const cy = (my - t.y) / t.scale;
          return { scale: newScale, x: mx - cx * newScale, y: my - cy * newScale };
        });
      }
      touchesRef.current = curr;
    };
    const onEnd = (e: TouchEvent) => { touchesRef.current = Array.from(e.touches); };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [isFullscreen]);

  if (!structure || !structure.rounds?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-muted-foreground">
        No bracket structure. Choose a preset or load from library.
      </div>
    );
  }

  const validation = validateFirstRoundSeeds(structure);
  const duplicatesSet = new Set(validation.duplicates);
  const winnerSeedsMap = computeWinnerSeeds(structure);

  const handleSeedChange = (gameIndex: number, slotIndex: number, newSeed: number) => {
    if (!onStructureChange || !structure?.rounds?.[0]?.games?.[gameIndex]) return;
    const next = cloneStructure(structure);
    const game = next.rounds[0].games[gameIndex];
    if (!game.seeds) game.seeds = [1, 2];
    game.seeds[slotIndex] = newSeed;
    onStructureChange(next);
  };

  const handleFeedsFromChange = (roundIndex: number, gameIndex: number, slotIndex: number, gameId: string) => {
    if (!onStructureChange || roundIndex < 1 || !structure?.rounds?.[roundIndex]?.games?.[gameIndex]) return;
    const next = cloneStructure(structure);
    const game = next.rounds[roundIndex].games[gameIndex];
    if (!game.feedsFrom) game.feedsFrom = ["", ""];
    game.feedsFrom[slotIndex] = gameId;
    onStructureChange(next);
  };

  const handleDeleteGame = (roundIndex: number, gameIndex: number) => {
    if (!onStructureChange) return;
    onStructureChange(deleteGameFromStructure(structure, roundIndex, gameIndex));
  };

  const handleToggleBye = (gameIndex: number) => {
    if (!onStructureChange) return;
    onStructureChange(toggleByeGame(structure, gameIndex));
  };

  const handleAddFirstRoundGame = (pairWithGameIndex: number) => {
    if (!onStructureChange) return;
    onStructureChange(addFirstRoundGame(structure, pairWithGameIndex));
  };

  const handleAddGameToRound = (roundIndex: number, feedsFromIdA: string, feedsFromIdB: string) => {
    if (!onStructureChange) return;
    onStructureChange(addGameToRound(structure, roundIndex, feedsFromIdA, feedsFromIdB));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    if (!onStructureChange || !editable) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const b = String(over.id);
    if (!a.startsWith(FIRST_ROUND_DROP_PREFIX) || !b.startsWith(FIRST_ROUND_DROP_PREFIX)) return;
    const fromIndex = parseInt(a.slice(FIRST_ROUND_DROP_PREFIX.length), 10);
    const toIndex = parseInt(b.slice(FIRST_ROUND_DROP_PREFIX.length), 10);
    if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return;
    const next = swapFirstRoundGames(structure, fromIndex, toIndex);
    onStructureChange(next);
  };

  // Build gameId -> { roundIndex, gameIndex } for connector lines
  const gamePosition = new Map<string, { roundIndex: number; gameIndex: number }>();
  rounds.forEach((r, roundIndex) => {
    r.games.forEach((g, gameIndex) => {
      gamePosition.set(g.id, { roundIndex, gameIndex });
    });
  });

  const connectorPaths: string[] = [];
  rounds.forEach((r, roundIndex) => {
    if (roundIndex === 0) return;
    r.games.forEach((game, gameIndex) => {
      const feedsFrom = game.feedsFrom;
      if (!feedsFrom || feedsFrom.length < 2) return;
      const posA = gamePosition.get(feedsFrom[0]);
      const posB = gamePosition.get(feedsFrom[1]);
      if (!posA || !posB) return;

      const centerY_A = gameCenterY(posA.roundIndex, posA.gameIndex);
      const centerY_B = gameCenterY(posB.roundIndex, posB.gameIndex);
      const centerY_curr = gameCenterY(roundIndex, gameIndex);

      const leftX_curr = roundIndex * (BOX_WIDTH + ROUND_GAP);
      const rightX_prev = (roundIndex - 1) * (BOX_WIDTH + ROUND_GAP) + BOX_WIDTH;
      const elbowX = rightX_prev + LINE_EXTEND;
      const midY = (centerY_A + centerY_B) / 2;

      // From feeder A: horizontal right to elbow
      connectorPaths.push(`M ${rightX_prev} ${centerY_A} H ${elbowX}`);
      // From feeder B: horizontal right to elbow
      connectorPaths.push(`M ${rightX_prev} ${centerY_B} H ${elbowX}`);
      // Vertical between the two horizontals
      connectorPaths.push(`M ${elbowX} ${centerY_A} V ${centerY_B}`);
      // Horizontal from elbow to left of current box
      connectorPaths.push(`M ${elbowX} ${midY} H ${leftX_curr}`);
      // Vertical from horizontal line down/up to current game center
      connectorPaths.push(`M ${leftX_curr} ${midY} V ${centerY_curr}`);
    });
  });

  const renderRounds = () =>
    rounds.map((r, roundIndex) =>
      r.games.map((game, gameIndex) => {
        const centerY = gameCenterY(roundIndex, gameIndex);
        const topPx = centerY - BOX_HEIGHT / 2;

        // Compute home slot index for this game
        let homeSlotIndex: 0 | 1 | null = null;
        if (roundIndex === 0 && game.seeds && game.seeds.length >= 2) {
          homeSlotIndex = getHomeSlotIndex(
            new Set([game.seeds[0]]),
            new Set([game.seeds[1]])
          );
        } else if (roundIndex > 0 && game.feedsFrom && game.feedsFrom.length >= 2) {
          homeSlotIndex = getHomeSlotIndex(
            winnerSeedsMap.get(game.feedsFrom[0]) ?? new Set(),
            winnerSeedsMap.get(game.feedsFrom[1]) ?? new Set()
          );
        }

        const isFirstRoundEditable = roundIndex === 0 && editable && onStructureChange;
        if (isFirstRoundEditable) {
          const gameIsBye = game.seeds?.length === 1;
          return (
            <DraggableFirstRoundSlot
              key={game.id}
              gameIndex={gameIndex}
              topPx={topPx}
              isByeGame={gameIsBye}
            >
              <GameSlot
                game={game}
                roundIndex={roundIndex}
                gameIndex={gameIndex}
                seedLabels={seedLabels}
                seedOffset={seedOffset}
                topPx={topPx}
                editable={editable}
                onSeedChange={handleSeedChange}
                onDelete={editable && onStructureChange ? () => handleDeleteGame(roundIndex, gameIndex) : undefined}
                onToggleBye={editable && onStructureChange ? () => handleToggleBye(gameIndex) : undefined}
                duplicates={duplicatesSet}
                numTeams={structure.numTeams}
                homeSlotIndex={homeSlotIndex}
                innerOnly
              />
            </DraggableFirstRoundSlot>
          );
        }
        return (
          <GameSlot
            key={game.id}
            game={game}
            roundIndex={roundIndex}
            gameIndex={gameIndex}
            seedLabels={seedLabels}
            seedOffset={seedOffset}
            topPx={topPx}
            editable={editable}
            onSeedChange={roundIndex === 0 ? handleSeedChange : undefined}
            onFeedsFromChange={
              roundIndex >= 1 && structure.rounds[roundIndex - 1]?.games
                ? (slotIndex, gameId) => handleFeedsFromChange(roundIndex, gameIndex, slotIndex, gameId)
                : undefined
            }
            onDelete={
              editable && onStructureChange ? () => handleDeleteGame(roundIndex, gameIndex) : undefined
            }
            duplicates={roundIndex === 0 ? duplicatesSet : undefined}
            numTeams={roundIndex === 0 ? structure.numTeams : undefined}
            prevRoundGames={roundIndex >= 1 ? structure.rounds[roundIndex - 1]?.games : undefined}
            homeSlotIndex={homeSlotIndex}
            onGameClick={onGameClick}
            gameDetails={gameDetails?.[game.id]}
          />
        );
      })
    );

  const firstRound = structure.rounds[0];
  const overlayGame =
    activeDragId?.startsWith(FIRST_ROUND_DROP_PREFIX) && firstRound?.games
      ? (() => {
          const idx = parseInt(activeDragId.slice(FIRST_ROUND_DROP_PREFIX.length), 10);
          return Number.isFinite(idx) ? firstRound.games[idx] : null;
        })()
      : null;

  const bracketContent =
    editable && onStructureChange ? (
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {renderRounds()}
        <DragOverlay dropAnimation={null} zIndex={1000}>
          {overlayGame ? (
            <div
              className="rounded-lg border-2 border-primary/60 bg-muted/90 shadow-xl opacity-95 cursor-grabbing flex flex-col justify-center p-3"
              style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
            >
              <div className="text-[11px] text-muted-foreground leading-snug">
                {overlayGame.id}
              </div>
              <div className="text-sm font-medium leading-snug mt-0.5">
                {overlayGame.seeds?.[0] != null
                  ? (seedLabels?.[overlayGame.seeds[0]] ?? `Seed ${overlayGame.seeds[0]}`)
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground py-0.5">vs</div>
              <div className="text-sm font-medium leading-snug">
                {overlayGame.seeds?.[1] != null
                  ? (seedLabels?.[overlayGame.seeds[1]] ?? `Seed ${overlayGame.seeds[1]}`)
                  : "—"}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    ) : (
      renderRounds()
    );

  // Shared bracket canvas (rendered in both normal and fullscreen views)
  const bracketCanvas = (
    <div className="relative shrink-0" style={{ width: totalWidth, height: totalHeight }}>
      <svg
        width={totalWidth}
        height={totalHeight}
        className="absolute left-0 top-0 block"
        aria-hidden
      >
        <g stroke="currentColor" strokeWidth="1.5" fill="none" className="text-muted-foreground/70">
          {connectorPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
      {bracketContent}
    </div>
  );

  return (
    <>
      {/* Normal view — desktop: scrollable bracket; mobile: tap-to-expand card */}
      <div className="hidden md:block relative overflow-x-auto overflow-y-auto rounded-lg border border-border/50 bg-muted/10 min-h-[320px] max-h-[70vh]">
        <button
          ref={fullscreenBtnRef}
          type="button"
          onClick={() => setIsFullscreen(true)}
          title="Fullscreen"
          aria-label="Enter fullscreen"
          className="absolute top-2 right-2 z-10 flex items-center justify-center h-7 w-7 rounded bg-muted/60 border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/90 transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        {/* Only render here when not in fullscreen — avoids duplicate DndContext instances */}
        {!isFullscreen && bracketCanvas}
        {editable && !validation.valid && (
          <p className="mt-2 text-sm text-destructive">
            Fix Round 1 seeds: each seed 1–{structure.numTeams} must appear exactly once.
            {validation.duplicates.length > 0 && ` Duplicates: ${validation.duplicates.join(", ")}.`}
            {validation.missing.length > 0 && ` Missing: ${validation.missing.join(", ")}.`}
          </p>
        )}
        {editable && onStructureChange && (
          <AddGameToolbar
            structure={structure}
            onAddFirstRound={handleAddFirstRoundGame}
            onAddToRound={handleAddGameToRound}
          />
        )}
      </div>

      {/* Mobile: tap-to-expand card */}
      <button
        type="button"
        onClick={() => setIsFullscreen(true)}
        className="md:hidden w-full flex flex-col items-center justify-center gap-3 py-10 rounded-lg border border-dashed border-border/60 bg-muted/10 text-muted-foreground hover:bg-muted/20 hover:border-border transition-colors"
      >
        <Maximize2 className="h-6 w-6" />
        <span className="text-sm font-medium">Tap to view bracket</span>
        <span className="text-xs">{rounds.length} round{rounds.length !== 1 ? "s" : ""} · {firstRoundCount} first-round game{firstRoundCount !== 1 ? "s" : ""}</span>
      </button>

      {/* Fullscreen overlay via portal */}
      {isFullscreen && typeof document !== "undefined" && ReactDOM.createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[100] flex flex-col bg-background"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 h-11 border-b border-border/60 bg-card shrink-0 gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none">
              Bracket
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleFitToScreen}
                title="Fit to screen (0)"
                aria-label="Fit to screen"
                className="h-10 w-10 md:h-8 md:w-8"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setTransform(p => ({ ...p, scale: clamp(p.scale - ZOOM_STEP, MIN_SCALE, MAX_SCALE) }))}
                title="Zoom out (−)"
                aria-label="Zoom out"
                className="h-10 w-10 md:h-8 md:w-8"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-10 text-center tabular-nums select-none">
                {Math.round(transform.scale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setTransform(p => ({ ...p, scale: clamp(p.scale + ZOOM_STEP, MIN_SCALE, MAX_SCALE) }))}
                title="Zoom in (+)"
                aria-label="Zoom in"
                className="h-10 w-10 md:h-8 md:w-8"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <div className="w-px h-5 bg-border/60 mx-1" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseFullscreen}
                title="Exit fullscreen (Esc)"
                aria-label="Exit fullscreen"
                className="h-10 w-10 md:h-8 md:w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Pan/zoom canvas */}
          <div
            className="flex-1 overflow-hidden relative select-none"
            style={{ cursor: isCursorGrabbing ? "grabbing" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                transformOrigin: "0 0",
                willChange: "transform",
              }}
            >
              {bracketCanvas}
            </div>
          </div>

          {/* Validation message when editable */}
          {editable && !validation.valid && (
            <p className="px-4 py-2 text-sm text-destructive border-t border-border/50 shrink-0">
              Fix Round 1 seeds: each seed 1–{structure.numTeams} must appear exactly once.
              {validation.duplicates.length > 0 && ` Duplicates: ${validation.duplicates.join(", ")}.`}
              {validation.missing.length > 0 && ` Missing: ${validation.missing.join(", ")}.`}
            </p>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function AddGameToolbar({
  structure,
  onAddFirstRound,
  onAddToRound,
}: {
  structure: BracketStructure;
  onAddFirstRound: (pairWithGameIndex: number) => void;
  onAddToRound: (roundIndex: number, feedsFromIdA: string, feedsFromIdB: string) => void;
}) {
  const [addRoundIndex, setAddRoundIndex] = useState<number | null>(null);
  const [feedA, setFeedA] = useState("");
  const [feedB, setFeedB] = useState("");
  const round0 = structure.rounds[0];
  const canAddR0 = round0 != null && round0.games.length >= 1;

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Add game</p>
      <div className="flex flex-wrap items-center gap-3">
        {canAddR0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddFirstRound(0)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add first-round game
          </Button>
        )}
        {structure.rounds.slice(1).map((r, i) => {
          const roundIndex = i + 1;
          const prevGames = structure.rounds[roundIndex - 1]?.games ?? [];
          const isExpanded = addRoundIndex === roundIndex;
          return (
            <div key={roundIndex} className="flex items-center gap-2">
              {isExpanded ? (
                <>
                  <Select value={feedA} onValueChange={setFeedA}>
                    <SelectTrigger className="w-[72px] h-8 text-xs">
                      <SelectValue placeholder="Game A" />
                    </SelectTrigger>
                    <SelectContent>
                      {prevGames.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={feedB} onValueChange={setFeedB}>
                    <SelectTrigger className="w-[72px] h-8 text-xs">
                      <SelectValue placeholder="Game B" />
                    </SelectTrigger>
                    <SelectContent>
                      {prevGames.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!feedA || !feedB || feedA === feedB}
                    onClick={() => {
                      onAddToRound(roundIndex, feedA, feedB);
                      setAddRoundIndex(null);
                      setFeedA("");
                      setFeedB("");
                    }}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Round {roundIndex + 1}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddRoundIndex(null);
                      setFeedA("");
                      setFeedB("");
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddRoundIndex(roundIndex)}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add game to Round {roundIndex + 1}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
