import { useVisibilityContext } from "./config/context";
import {
  isInLobby,
  isRoundComplete,
  isCodemasterGivingClue,
  isCodebreakerGuessing,
  canStartNextTurn,
  isCodemaster,
  isAiActive,
} from "./config/rules";
import { useGameActions } from ".";
import { useGameDataRequired } from "../providers";
import { useDealAnimation } from "../board/deal-animation-context";
import { useViewMode } from "../board/view-mode/view-mode-context";
import { useStartTurnMutation } from "../api/mutations/use-start-turn";

/**
 * Single source of derived dashboard state.
 * Both CompactDashboard and StackedDashboard read from here.
 * No raw game data or action hooks should appear in dashboard components directly.
 */
export const useDashboardState = () => {
  const ctx = useVisibilityContext();
  const { gameData } = useGameDataRequired();
  const { endTurn, createRound, startRound, dealCards, giveClue, actionState } = useGameActions();
  const { triggerDeal } = useDealAnimation();
  const { setViewMode } = useViewMode();

  const roundNumber = gameData.currentRound?.roundNumber ?? 1;
  const startTurnMutation = useStartTurnMutation(gameData.publicId);
  const isLoading = actionState.status === "loading";

  /** Team colour derived once */
  const teamColor = (() => {
    const name = ctx.teamName?.toLowerCase() ?? "";
    if (name.includes("red"))  return "var(--color-team-red)";
    if (name.includes("blue")) return "var(--color-team-blue)";
    return "var(--color-primary)";
  })();

  /** Lobby action: one handler + one label, fully encapsulated */
  const lobbyAction = isInLobby(ctx) ? {
    label: (() => {
      if (!ctx.hasRound)               return "NEW ROUND";
      if (!ctx.hasCards)               return "DEAL CARDS";
      return                                  "START ROUND";
    })(),
    handler: async () => {
      if (ctx.hasRound && ctx.hasCards)  { startRound(); return; }
      if (ctx.hasRound && !ctx.hasCards) { triggerDeal(); await dealCards(false); return; }
      triggerDeal(); createRound();
    },
    canRedeal:     ctx.hasRound && ctx.hasCards,
    redealHandler: async () => { setViewMode("normal"); triggerDeal(); await dealCards(true); },
  } : null;

  /** Game over data -- only populated when round is complete */
  const gameOverData = isRoundComplete(ctx) ? (() => {
    const teams = gameData.teams ?? [];
    const cards = gameData.currentRound?.cards ?? [];
    const winningTeamName = gameData.currentRound?.winningTeamName;
    const winner = teams.find(t => t.name === winningTeamName);
    const loser  = teams.find(t => t.name !== winningTeamName);

    /** Count selected cards per team (not team.score which is cumulative across rounds) */
    const winnerCards = cards.filter(c => c.teamName === winner?.name && c.selected);
    const loserCards  = cards.filter(c => c.teamName === loser?.name && c.selected);

    return {
      winnerName:         winner?.name,
      winnerScore:        winnerCards.length,
      loserName:          loser?.name,
      loserScore:         loserCards.length,
      totalTurns:         gameData.currentRound?.turns?.length ?? 0,
      totalCardsRevealed: cards.filter(c => c.selected).length,
      newGame:            () => createRound(),
    };
  })() : null;

  return {
    /** Identity */
    teamName:       ctx.teamName ?? "",
    activeTeamName: ctx.activeTeamName ?? "",
    role:           ctx.role,
    playerName:     ctx.playerName ?? "",
    teamColor,

    /** State flags -- derived once, consumed everywhere */
    isLoading,
    hasRole:                ctx.role !== "NONE",
    isInLobby:              isInLobby(ctx),
    isRoundComplete:        isRoundComplete(ctx),
    isCodemasterGivingClue: isCodemasterGivingClue(ctx),
    isCodebreakerGuessing:  isCodebreakerGuessing(ctx),
    canStartNextTurn:       canStartNextTurn(ctx),
    isCodemaster:           isCodemaster(ctx),
    isAiActive:             isAiActive(ctx),
    isAiSession:            ctx.isAiSession,
    isActiveTeam:           ctx.isActiveTeam,
    hasClue:                ctx.hasClue,

    /** Clue / turn info */
    clueWord:         ctx.activeTurn?.clue?.word,
    clueNumber:       ctx.activeTurn?.clue?.number,
    guessesRemaining: ctx.guessesRemaining,
    lastCompletedTurn: ctx.lastCompletedTurn,

    /** Fully encapsulated actions */
    lobbyAction,
    gameOverData,
    endTurn,
    giveClue,

    startNextTurn: {
      handler:   () => startTurnMutation.mutate({ roundNumber }),
      isPending: startTurnMutation.isPending,
    },
  };
};

export type DashboardState = ReturnType<typeof useDashboardState>;
