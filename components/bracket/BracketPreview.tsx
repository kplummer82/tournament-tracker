"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import type { BracketStructure, BracketRound, BracketGame, FeedSource } from "./types";
import type { BracketGamePrediction } from "@/lib/bracket-prediction";
import {
  validateFirstRoundSeeds,
  validateBracket,
  cloneStructure,
  addFirstRoundGame,
  addGameToRound,
  addFeedGame,
  deleteGameFromStructure,
  toggleByeGame,
  computeWinnerSeeds,
  getHomeSlotIndex,
  gameFeeds,
  isDoubleElim,
  setGameFeed,
} from "./types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatHHMMAMPM } from "@/lib/datetime";
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
import { GripVertical, Plus, Trash2, ArrowLeftRight, Maximize2, X, ZoomIn, ZoomOut, Maximize, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const BOX_WIDTH = 264;
const BOX_HEIGHT = 132;
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
  field?: string | null;
  homescore?: number | null;
  awayscore?: number | null;
  home_team?: string | null;
  away_team?: string | null;
  /** When true, this game is missing date/time or venue/field — show a warning marker. */
  unscheduled?: boolean;
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
  /** Prediction overlay data keyed by bracket_game_id. When present, games show prediction styling. */
  predictionOverlay?: Record<string, BracketGamePrediction>;
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
      <SelectContent className="z-[200]">
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
  leftPx,
  editable,
  onSeedChange,
  onFeedsFromChange,
  onFeedChange,
  earlierGameOptions,
  deMode,
  onDelete,
  duplicates,
  numTeams,
  prevRoundGames,
  homeSlotIndex,
  innerOnly,
  onToggleBye,
  onGameClick,
  gameDetails,
  prediction,
}: {
  game: BracketGame;
  roundIndex: number;
  gameIndex: number;
  seedLabels?: Record<number, string>;
  seedOffset?: number;
  topPx: number;
  /** Explicit x position (double-elim layout). Falls back to round-based x when omitted. */
  leftPx?: number;
  editable?: boolean;
  onSeedChange?: (gameIndex: number, slotIndex: number, newSeed: number) => void;
  onFeedsFromChange?: (slotIndex: number, gameId: string) => void;
  /** Double-elim: set one slot's feed source (game + winner/loser). */
  onFeedChange?: (slotIndex: number, source: FeedSource) => void;
  /** Double-elim: games that can be a feed source (earlier columns). */
  earlierGameOptions?: { id: string; label: string }[];
  /** True when rendering inside a double-elimination bracket. */
  deMode?: boolean;
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
  /** Prediction overlay data for this game. */
  prediction?: BracketGamePrediction;
}) {
  const isFirstRound = roundIndex === 0;
  const isByeGame = isFirstRound && (game.seeds?.length ?? 0) === 1;
  const off = seedOffset ?? 0;
  const feeds = gameFeeds(game);
  const feedLabel = (i: number) => {
    const f = feeds[i];
    if (!f || !f.from) return "—";
    return `${f.outcome === "loser" ? "Loser" : "Winner"} ${f.from}`;
  };
  const isPredicted = prediction != null && !prediction.isActualResult && !prediction.isBye;
  const hasPredictedTeams = prediction != null && !prediction.isBye;

  // Use prediction team names for later rounds when available
  const slot1 =
    hasPredictedTeams && !isFirstRound && prediction.homeTeamName && prediction.homeTeamName !== "TBD"
      ? prediction.homeTeamName
      : isFirstRound && game.seeds?.[0]
        ? seedLabels?.[game.seeds[0]]
          ? `${seedLabels[game.seeds[0]]} (#${game.seeds[0] + off})`
          : `Seed ${game.seeds[0] + off}`
        : !isFirstRound && gameDetails?.home_team
          ? gameDetails.home_team
          : feedLabel(0);
  const slot2 =
    hasPredictedTeams && !isFirstRound && prediction.awayTeamName && prediction.awayTeamName !== "TBD"
      ? prediction.awayTeamName
      : isFirstRound && game.seeds?.[1]
        ? seedLabels?.[game.seeds[1]]
          ? `${seedLabels[game.seeds[1]]} (#${game.seeds[1] + off})`
          : `Seed ${game.seeds[1] + off}`
        : !isFirstRound && gameDetails?.away_team
          ? gameDetails.away_team
          : feedLabel(1);

  const isEditableFirstRound = isFirstRound && editable && onSeedChange != null && numTeams != null && duplicates != null;
  const isEditableLaterRound =
    !isFirstRound && editable && onFeedsFromChange != null && prevRoundGames != null && prevRoundGames.length >= 2;
  const isEditableDeLaterRound =
    !isFirstRound && editable === true && deMode === true && onFeedChange != null &&
    earlierGameOptions != null && earlierGameOptions.length >= 1;

  // Prediction win probabilities — only show for first-round games where matchups are fixed.
  // Later-round matchups vary across MC simulations, making per-game % less meaningful.
  const homeWinPct = isPredicted && isFirstRound && prediction.homeWinProbability != null
    ? Math.round(prediction.homeWinProbability * 100)
    : null;
  const awayWinPct = homeWinPct != null ? 100 - homeWinPct : null;

  // Prediction scores (use prediction scores for predicted games, fall through to gameDetails for actual)
  const displayHomeScore = isPredicted ? prediction.homescore : gameDetails?.homescore;
  const displayAwayScore = isPredicted ? prediction.awayscore : gameDetails?.awayscore;

  const content = (
    <>
      <div className="flex items-center justify-between gap-1.5 shrink-0 min-w-0">
        <span className="flex items-center gap-1 min-w-0">
          <span className="text-[11px] text-muted-foreground leading-snug truncate">{game.id}</span>
          {game.label && (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 leading-snug truncate">
              {game.label}
            </span>
          )}
          {!editable && !isByeGame && gameDetails?.unscheduled && (
            <AlertTriangle
              className="h-3 w-3 text-amber-500 shrink-0"
              aria-label="Missing date/time or venue"
            />
          )}
        </span>
        {isPredicted && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 shrink-0">
            Predicted
          </span>
        )}
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
      ) : isEditableDeLaterRound ? (
        <div className="mt-0.5 space-y-1">
          {[0, 1].map((slot) => {
            const f = feeds[slot];
            return (
              <div key={slot} className="flex gap-1">
                <Select
                  value={f?.from || ""}
                  onValueChange={(v) => onFeedChange!(slot, { from: v, outcome: f?.outcome ?? "winner" })}
                >
                  <SelectTrigger size="sm" className="h-7 text-xs flex-1 min-w-0">
                    <SelectValue placeholder="From game" />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {earlierGameOptions!.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={f?.outcome ?? "winner"}
                  onValueChange={(v) => onFeedChange!(slot, { from: f?.from ?? "", outcome: v as FeedSource["outcome"] })}
                >
                  <SelectTrigger size="sm" className="h-7 text-xs w-[104px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectItem value="winner">Winner</SelectItem>
                    <SelectItem value="loser">Loser</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
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
              <SelectContent className="z-[200]">
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
              <SelectContent className="z-[200]">
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
            <span className={cn(
              "text-sm font-medium leading-snug break-words min-w-0 flex-1",
              isPredicted && prediction.winnerId === prediction.homeTeamId && "font-bold"
            )}>{slot1}</span>
            {homeWinPct != null && (
              <span className="text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                {homeWinPct}%
              </span>
            )}
            {displayHomeScore != null && (
              <span className={cn(
                "text-xs font-semibold tabular-nums shrink-0",
                isPredicted ? "text-amber-600 dark:text-amber-400" : "text-foreground/70"
              )}>{displayHomeScore}</span>
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
            <span className={cn(
              "text-sm font-medium leading-snug break-words min-w-0 flex-1",
              isPredicted && prediction.winnerId === prediction.awayTeamId && "font-bold"
            )}>{slot2}</span>
            {awayWinPct != null && (
              <span className="text-[10px] font-semibold tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                {awayWinPct}%
              </span>
            )}
            {displayAwayScore != null && (
              <span className={cn(
                "text-xs font-semibold tabular-nums shrink-0",
                isPredicted ? "text-amber-600 dark:text-amber-400" : "text-foreground/70"
              )}>{displayAwayScore}</span>
            )}
          </div>
          {gameDetails && (gameDetails.gamedate || gameDetails.gametime) && (
            <div className="text-[9px] text-muted-foreground/60 mt-0.5 truncate">
              {[
                gameDetails.gamedate
                  ? (() => { const d = new Date(gameDetails.gamedate); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`; })()
                  : null,
                gameDetails.gametime
                  ? formatHHMMAMPM(gameDetails.gamedate ?? "2000-01-01", gameDetails.gametime)
                  : null,
              ].filter(Boolean).join(" ")}
            </div>
          )}
          {gameDetails && (gameDetails.location || gameDetails.field) && (
            <div className="text-[9px] text-muted-foreground/60 truncate">
              {[gameDetails.location, gameDetails.field].filter(Boolean).join(" · ")}
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
        game.ifNecessary
          ? "border-2 border-dotted border-muted-foreground/40 bg-muted/5"
          : isByeGame
            ? "border border-dashed border-border/60 bg-muted/10"
            : isPredicted
              ? "border border-dashed border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10"
              : "border border-border bg-muted/30",
        isClickable && "cursor-pointer hover:border-primary/60 hover:bg-muted/50 transition-colors"
      )}
      style={{
        width: BOX_WIDTH,
        height: BOX_HEIGHT,
        left: leftPx ?? roundIndex * (BOX_WIDTH + ROUND_GAP),
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
  predictionOverlay,
}: BracketPreviewProps) {
  // Compute dimensions early so hooks can depend on them (hooks must run unconditionally)
  const rounds = (structure?.rounds ?? []) as BracketRound[];
  const firstRoundCount = rounds[0]?.games?.length ?? 0;
  const de = isDoubleElim(structure);

  // Double-elim uses explicit col/row layout; single-elim uses the binary-tree formula.
  const deLayout = new Map<string, { x: number; y: number }>();
  let deWidth = 0;
  let deHeight = 0;
  if (de) {
    for (const r of rounds) {
      for (const g of r.games) {
        const x = (g.col ?? r.round) * (BOX_WIDTH + ROUND_GAP);
        const y = (g.row ?? 0) * SLOT_HEIGHT;
        deLayout.set(g.id, { x, y });
        deWidth = Math.max(deWidth, x + BOX_WIDTH);
        deHeight = Math.max(deHeight, y + BOX_HEIGHT);
      }
    }
  }
  const totalHeight = de ? deHeight : firstRoundCount * SLOT_HEIGHT;
  const totalWidth = de
    ? deWidth
    : rounds.length > 0
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
  const deValidation = de ? validateBracket(structure) : null;

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

  const handleDeleteGameById = (gameId: string) => {
    if (!onStructureChange || !structure) return;
    for (let ri = 0; ri < structure.rounds.length; ri++) {
      const gi = structure.rounds[ri].games.findIndex((g) => g.id === gameId);
      if (gi !== -1) { onStructureChange(deleteGameFromStructure(structure, ri, gi)); return; }
    }
  };

  const handleFeedChange = (gameId: string, slotIndex: number, source: FeedSource) => {
    if (!onStructureChange || !structure) return;
    onStructureChange(setGameFeed(structure, gameId, slotIndex, source));
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

  const handleDeAddGame = (a: FeedSource, b: FeedSource, group: BracketGame["group"]) => {
    if (!onStructureChange || !structure) return;
    const find = (id: string) => allGamesFlat.find((g) => g.id === id);
    const colA = find(a.from)?.col ?? 0;
    const colB = find(b.from)?.col ?? 0;
    const rowA = find(a.from)?.row ?? 0;
    const rowB = find(b.from)?.row ?? 0;
    const col = Math.max(colA, colB) + 1;
    const row = (rowA + rowB) / 2;
    const label = group === "final" ? "Final" : group === "winners" ? "WB" : "LB";
    onStructureChange(addFeedGame(structure, a, b, { group, col, row, label }));
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
  const loserPaths: string[] = [];
  if (de) {
    // Generic per-source elbows from each feeder's right edge to the target's left edge.
    for (const r of rounds) {
      for (const game of r.games) {
        const tpos = deLayout.get(game.id);
        if (!tpos) continue;
        const tx = tpos.x;
        const ty = tpos.y + BOX_HEIGHT / 2;
        gameFeeds(game).forEach((f) => {
          const spos = deLayout.get(f.from);
          if (!spos) return;
          const sx = spos.x + BOX_WIDTH;
          const sy = spos.y + BOX_HEIGHT / 2;
          const midX = sx + Math.max(LINE_EXTEND, (tx - sx) / 2);
          const d = `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`;
          if (f.outcome === "loser") loserPaths.push(d);
          else connectorPaths.push(d);
        });
      }
    }
  } else {
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
  }

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
            prediction={predictionOverlay?.[game.id]}
          />
        );
      })
    );

  const allGamesFlat = rounds.flatMap((r) => r.games);
  const renderDoubleElim = () =>
    rounds.flatMap((r) =>
      r.games.map((game, gIdx) => {
        const pos = deLayout.get(game.id);
        if (!pos) return null;
        const isSeedGame = r.round === 0 && (game.seeds?.length ?? 0) > 0;
        const fds = gameFeeds(game);
        let homeSlotIndex: 0 | 1 | null = null;
        if (isSeedGame && game.seeds && game.seeds.length >= 2) {
          homeSlotIndex = getHomeSlotIndex(new Set([game.seeds[0]]), new Set([game.seeds[1]]));
        } else if (fds.length >= 2) {
          homeSlotIndex =
            getHomeSlotIndex(
              winnerSeedsMap.get(fds[0].from) ?? new Set<number>(),
              winnerSeedsMap.get(fds[1].from) ?? new Set<number>()
            ) ?? 0; // double-elim default: slot 0 = home
        }
        const myCol = game.col ?? r.round;
        const earlierGameOptions = allGamesFlat
          .filter((g) => (g.col ?? 0) < myCol && g.id !== game.id)
          .map((g) => ({ id: g.id, label: g.label ? `${g.id} · ${g.label}` : g.id }));
        return (
          <GameSlot
            key={game.id}
            game={game}
            roundIndex={r.round}
            gameIndex={gIdx}
            seedLabels={seedLabels}
            seedOffset={seedOffset}
            topPx={pos.y}
            leftPx={pos.x}
            editable={editable}
            deMode
            onSeedChange={isSeedGame && editable && onStructureChange ? handleSeedChange : undefined}
            onFeedChange={
              !isSeedGame && editable && onStructureChange
                ? (slot, source) => handleFeedChange(game.id, slot, source)
                : undefined
            }
            earlierGameOptions={earlierGameOptions}
            onDelete={editable && onStructureChange ? () => handleDeleteGameById(game.id) : undefined}
            duplicates={isSeedGame ? duplicatesSet : undefined}
            numTeams={isSeedGame ? structure.numTeams : undefined}
            homeSlotIndex={homeSlotIndex}
            onGameClick={onGameClick}
            gameDetails={gameDetails?.[game.id]}
            prediction={predictionOverlay?.[game.id]}
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

  const bracketContent = de ? (
    renderDoubleElim()
  ) : editable && onStructureChange ? (
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
        className="absolute left-0 top-0 block pointer-events-none"
        aria-hidden
      >
        <g stroke="currentColor" strokeWidth="1.5" fill="none" className="text-muted-foreground/70">
          {connectorPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {loserPaths.length > 0 && (
          <g
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            fill="none"
            className="text-amber-500/70"
          >
            {loserPaths.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}
      </svg>
      {bracketContent}
    </div>
  );

  return (
    <>
      {/* Normal view — desktop: header (legend + fullscreen) over a scrollable canvas.
          min-w-0 keeps the wide canvas from blowing out the layout (and pushing the
          fullscreen button off-screen) when placed inside a flex/grid item. */}
      <div className="hidden md:block min-w-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          {de ? (
            <div className="flex flex-wrap items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 border-t border-muted-foreground/70" /> Winner advances
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 border-t border-dashed border-amber-500/70" /> Loser drops to losers bracket
              </span>
            </div>
          ) : (
            <span />
          )}
          <button
            ref={fullscreenBtnRef}
            type="button"
            onClick={() => setIsFullscreen(true)}
            title="Fullscreen — drag to pan, scroll to zoom"
            aria-label="Enter fullscreen"
            className="inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded border border-border/60 bg-muted/40 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fullscreen
          </button>
        </div>
        {/* Scroll area holds only the canvas so the controls below never scroll away. */}
        <div className="relative overflow-auto rounded-lg border border-border/50 bg-muted/10 min-h-[320px] max-h-[70vh] min-w-0">
          {/* Only render here when not in fullscreen — avoids duplicate DndContext instances */}
          {!isFullscreen && bracketCanvas}
        </div>
        {editable && de && deValidation && !deValidation.valid && (
          <ul className="mt-2 text-sm text-destructive list-disc pl-5 space-y-0.5">
            {deValidation.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {editable && !de && !validation.valid && (
          <p className="mt-2 text-sm text-destructive">
            Fix Round 1 seeds: each seed 1–{structure.numTeams} must appear exactly once.
            {validation.duplicates.length > 0 && ` Duplicates: ${validation.duplicates.join(", ")}.`}
            {validation.missing.length > 0 && ` Missing: ${validation.missing.join(", ")}.`}
          </p>
        )}
        {editable && onStructureChange && (
          de ? (
            <DeAddGameToolbar structure={structure} onAdd={handleDeAddGame} />
          ) : (
            <AddGameToolbar
              structure={structure}
              onAddFirstRound={handleAddFirstRoundGame}
              onAddToRound={handleAddGameToRound}
            />
          )
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
            <span className="text-xs text-muted-foreground select-none truncate">
              <span className="font-semibold uppercase tracking-widest">Bracket</span>
              <span className="hidden sm:inline ml-2 text-muted-foreground/70">Drag to pan · scroll to zoom</span>
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
          {editable && de && deValidation && !deValidation.valid && (
            <p className="px-4 py-2 text-sm text-destructive border-t border-border/50 shrink-0">
              {deValidation.errors.join(" ")}
            </p>
          )}
          {editable && !de && !validation.valid && (
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
                    <SelectContent className="z-[200]">
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
                    <SelectContent className="z-[200]">
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

/** Add-game toolbar for double-elimination editing: choose two source games and which
 * result (winner/loser) each contributes, plus the sub-bracket the new game belongs to. */
function DeAddGameToolbar({
  structure,
  onAdd,
}: {
  structure: BracketStructure;
  onAdd: (a: FeedSource, b: FeedSource, group: BracketGame["group"]) => void;
}) {
  const games = structure.rounds.flatMap((r) => r.games);
  const [fromA, setFromA] = useState("");
  const [outA, setOutA] = useState<FeedSource["outcome"]>("winner");
  const [fromB, setFromB] = useState("");
  const [outB, setOutB] = useState<FeedSource["outcome"]>("loser");
  const [group, setGroup] = useState<NonNullable<BracketGame["group"]>>("losers");
  const canAdd = !!fromA && !!fromB && fromA !== fromB;

  const gameOption = (g: BracketGame) => (
    <SelectItem key={g.id} value={g.id}>
      {g.label ? `${g.id} · ${g.label}` : g.id}
    </SelectItem>
  );

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Add game (double elimination)</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Select value={fromA} onValueChange={setFromA}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Game A" /></SelectTrigger>
            <SelectContent className="z-[200]">{games.map(gameOption)}</SelectContent>
          </Select>
          <Select value={outA} onValueChange={(v) => setOutA(v as FeedSource["outcome"])}>
            <SelectTrigger className="w-[88px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[200]">
              <SelectItem value="winner">Winner</SelectItem>
              <SelectItem value="loser">Loser</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">vs</span>
        <div className="flex gap-1">
          <Select value={fromB} onValueChange={setFromB}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Game B" /></SelectTrigger>
            <SelectContent className="z-[200]">{games.map(gameOption)}</SelectContent>
          </Select>
          <Select value={outB} onValueChange={(v) => setOutB(v as FeedSource["outcome"])}>
            <SelectTrigger className="w-[88px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[200]">
              <SelectItem value="winner">Winner</SelectItem>
              <SelectItem value="loser">Loser</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={group} onValueChange={(v) => setGroup(v as NonNullable<BracketGame["group"]>)}>
          <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[200]">
            <SelectItem value="winners">Winners</SelectItem>
            <SelectItem value="losers">Losers</SelectItem>
            <SelectItem value="final">Final</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!canAdd}
          onClick={() => {
            onAdd({ from: fromA, outcome: outA }, { from: fromB, outcome: outB }, group);
            setFromA("");
            setFromB("");
          }}
          className="gap-1.5 h-8"
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}
