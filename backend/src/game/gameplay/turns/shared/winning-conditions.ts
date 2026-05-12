/**
 * Pure game-rule derivation for the codenames win conditions.
 *
 * Operates on slices of the loaded GameAggregate (cards, historical
 * rounds). No DB access, no async. Used by the make-guess action
 * orchestrator to decide if a guess ends the round / game.
 */
import { ROUND_STATE, type GameFormat } from "@codenames/shared/types";
import type { Card, HistoricalRound } from "@backend/game/state/types";

/** Tally of round wins per team id. */
export const getTeamScores = (
  historicalRounds: HistoricalRound[],
): Record<number, number> => {
  const scores: Record<number, number> = {};
  for (const round of historicalRounds) {
    if (round.status !== ROUND_STATE.COMPLETED) continue;
    if (!round._winningTeamId) continue;
    scores[round._winningTeamId] = (scores[round._winningTeamId] ?? 0) + 1;
  }
  return scores;
};

/**
 * Has anyone won the current round?
 *   - assassin selected → other team wins
 *   - guessing team's TEAM cards all selected → guessing team wins
 *   - other team's TEAM cards all selected → other team wins
 *   - otherwise round continues (null)
 */
export const checkRoundWinner = (
  cards: Card[],
  guessingTeamId: number,
  otherTeamId: number,
): number | null => {
  const assassin = cards.find((c) => c.cardType === "ASSASSIN");
  if (assassin?.selected) return otherTeamId;

  const guessingTeamRemaining = cards.filter(
    (c) => c.cardType === "TEAM" && c._teamId === guessingTeamId && !c.selected,
  );
  if (guessingTeamRemaining.length === 0) return guessingTeamId;

  const otherTeamRemaining = cards.filter(
    (c) => c.cardType === "TEAM" && c._teamId === otherTeamId && !c.selected,
  );
  if (otherTeamRemaining.length === 0) return otherTeamId;

  return null;
};

/** Has anyone won the overall game given the format? */
export const checkGameWinner = (
  historicalRounds: HistoricalRound[],
  gameFormat: GameFormat,
): number | null => {
  switch (gameFormat) {
    case "QUICK":
      return historicalRounds[0]?._winningTeamId ?? null;
    case "BEST_OF_THREE": {
      const scores = getTeamScores(historicalRounds);
      const winner = Object.entries(scores).find(([, wins]) => wins >= 2);
      return winner ? Number(winner[0]) : null;
    }
    case "ROUND_ROBIN":
      return null; // Not implemented yet
    default:
      return null;
  }
};
