import { VisibilityContext } from "./context";

/**
 * Business rules describing game states.
 * Named for WHAT THEY ARE, not what they show.
 * Pure functions, plain JavaScript.
 */

export const isCodemaster = (ctx: VisibilityContext): boolean => ctx.role === "CODEMASTER";

export const isCodebreaker = (ctx: VisibilityContext): boolean => ctx.role === "CODEBREAKER";

export const isSpectator = (ctx: VisibilityContext): boolean =>
  ctx.role === "SPECTATOR" || ctx.role === "NONE";

export const hasRole = (ctx: VisibilityContext): boolean =>
  ctx.role !== "NONE" && ctx.teamName !== undefined;

export const isCodemasterGivingClue = (ctx: VisibilityContext): boolean =>
  !ctx.isAiSession && ctx.hasActiveTurn && ctx.role === "CODEMASTER" && ctx.isActiveTeam && !ctx.hasClue;

export const isCodemasterObserving = (ctx: VisibilityContext): boolean =>
  ctx.role === "CODEMASTER" && (!ctx.hasActiveTurn || !ctx.isActiveTeam || ctx.hasClue);

export const isCodebreakerGuessing = (ctx: VisibilityContext): boolean =>
  !ctx.isAiSession && ctx.hasActiveTurn && ctx.role === "CODEBREAKER" && ctx.isActiveTeam && ctx.hasClue && ctx.guessesRemaining > 0;

export const isCodebreakerObserving = (ctx: VisibilityContext): boolean =>
  ctx.role === "CODEBREAKER" && (!ctx.hasActiveTurn || !ctx.isActiveTeam || !ctx.hasClue || ctx.guessesRemaining === 0);

export const isObserving = (ctx: VisibilityContext): boolean =>
  isSpectator(ctx) || isCodemasterObserving(ctx) || isCodebreakerObserving(ctx);

export const isInLobby = (ctx: VisibilityContext): boolean =>
  !ctx.hasRound || ctx.roundStatus === "SETUP";

export const isRoundComplete = (ctx: VisibilityContext): boolean => ctx.roundStatus === "COMPLETED";

export const isRoundInProgress = (ctx: VisibilityContext): boolean =>
  ctx.roundStatus === "IN_PROGRESS";

export const isRoundActive = (ctx: VisibilityContext): boolean =>
  ctx.roundStatus === "IN_PROGRESS" || ctx.roundStatus === "COMPLETED";

export const canDealCards = (ctx: VisibilityContext): boolean => isInLobby(ctx) && !ctx.hasCards;

export const canStartRound = (ctx: VisibilityContext): boolean => isInLobby(ctx) && ctx.hasCards;

export const canRedeal = (ctx: VisibilityContext): boolean => isInLobby(ctx) && ctx.hasCards;

export const isAiActive = (ctx: VisibilityContext): boolean =>
  isRoundInProgress(ctx) && ctx.hasActiveTurn && (ctx.aiAvailable || ctx.aiThinking);

/**
 * AR (spymaster enhanced vision) toggle is only relevant for a human codemaster
 * during an active round. Hidden during AI turns — the AI doesn't need the lens,
 * and showing it while the AI is playing would be confusing.
 */
export const canUseArToggle = (ctx: VisibilityContext): boolean =>
  !ctx.isAiSession && isCodemaster(ctx) && isRoundInProgress(ctx);

export const always = (_ctx: VisibilityContext): boolean => true;

export const never = (_ctx: VisibilityContext): boolean => false;
