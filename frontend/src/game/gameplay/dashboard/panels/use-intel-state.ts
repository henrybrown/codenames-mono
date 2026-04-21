import { useState, useEffect } from "react";
import { useTurn, useGameDataRequired } from "../../providers";
import { useGameActions } from "..";
import type { GuessDisplay } from "./intel-panel";

/** Full intel state — used by CompactDashboard which needs codemaster fields too. */
export interface IntelState {
  teamName: string;
  guesses: GuessDisplay[];
  guessesRemaining: number;
  maxSlots: number;
  selectedIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  isHistorical: boolean;
  hasClue: boolean;
  clueWord?: string;
  clueNumber?: number;
  isCodemasterGivingClue: boolean;
  isLoading: boolean;
  onSubmitClue?: (word: string, count: number) => void;
}

/**
 * Shared intel navigation state.
 * Used by IntelPanel (stacked) and CompactDashboard.
 */
export const useIntelState = (): IntelState => {
  const { historicTurns } = useTurn();
  const { gameData } = useGameDataRequired();
  const { giveClue, actionState } = useGameActions();

  /**
   * Default view is always the latest turn, derived fresh on every render
   * from the current historicTurns. The user can pin an earlier index via
   * the nav arrows; that override is cleared when a brand-new latest turn
   * arrives (so e.g. after a turn boundary we snap forward again).
   *
   * Done this way (instead of useState + useEffect) so refresh never
   * flashes the first turn: there's no intermediate render where
   * selectedIndex lags behind historicTurns.
   */
  const [overrideIndex, setOverrideIndex] = useState<number | null>(null);
  const latestIndex = Math.max(0, historicTurns.length - 1);
  const selectedIndex = overrideIndex ?? latestIndex;

  const latestTurnId = historicTurns[historicTurns.length - 1]?.id;
  useEffect(() => {
    /** New latest turn arrived — clear any override so we track latest again. */
    setOverrideIndex(null);
  }, [latestTurnId]);

  const selectedTurn = historicTurns[selectedIndex];
  const isViewingLatest = selectedIndex === latestIndex;

  const canGoBack = selectedIndex > 0;
  const canGoForward = selectedIndex < latestIndex;
  const onGoBack = (): void => {
    const next = Math.max(0, selectedIndex - 1);
    setOverrideIndex(next === latestIndex ? null : next);
  };
  const onGoForward = (): void => {
    const next = Math.min(latestIndex, selectedIndex + 1);
    setOverrideIndex(next === latestIndex ? null : next);
  };

  const teamName = selectedTurn?.teamName ?? "";
  const hasClue = !!selectedTurn?.clue;
  const isHistorical = !isViewingLatest || selectedTurn?.status === "COMPLETED";

  const playerRole = gameData.playerContext?.role;
  const playerTeam = gameData.playerContext?.teamName;

  const isCodemasterGivingClue =
    playerRole === "CODEMASTER" &&
    playerTeam === selectedTurn?.teamName &&
    !hasClue &&
    isViewingLatest &&
    selectedTurn?.status === "ACTIVE";

  const guesses: GuessDisplay[] = [
    ...(selectedTurn?.prevGuesses ?? []).map((g) => ({
      word: g.cardWord,
      outcome: g.outcome as GuessDisplay["outcome"],
    })),
    ...(selectedTurn?.lastGuess
      ? [
          {
            word: selectedTurn.lastGuess.cardWord,
            outcome: selectedTurn.lastGuess.outcome as GuessDisplay["outcome"],
          },
        ]
      : []),
  ];

  /** Stable slot count -- floor 3, only ever grows across all turns */
  const maxSlots = historicTurns.reduce(
    (max, turn) => Math.max(max, turn.clue?.number ?? 0),
    3
  );

  return {
    teamName,
    guesses,
    guessesRemaining: selectedTurn?.guessesRemaining ?? 0,
    selectedIndex,
    canGoBack,
    canGoForward,
    onGoBack,
    onGoForward,
    isHistorical,
    maxSlots,
    hasClue,
    clueWord: hasClue ? selectedTurn!.clue!.word : undefined,
    clueNumber: hasClue ? selectedTurn!.clue!.number : undefined,
    isCodemasterGivingClue,
    isLoading: actionState.status === "loading",
    onSubmitClue: isCodemasterGivingClue ? giveClue : undefined,
  };
};
