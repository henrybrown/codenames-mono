import React from "react";
import { PanelSlots } from "./types";
import {
  hasRole,
  isCodemasterGivingClue,
  isCodebreakerGuessing,
  isRoundComplete,
  isInLobby,
  isAiActive,
  isRoundActive,
  canUseArToggle,
  always,
} from "./rules";
import { useVisibilityContext } from "./context";
import { isPostTurn } from "../../shared/post-turn.rules";
import {
  TeamHeaderPanel,
  ARTogglePanel,
  IntelPanel,
  AIStatusPanel,
  ClueInputPanel,
  CodebreakerActionsPanel,
  LobbyActionsPanel,
  GameoverPanel,
} from "../panels";
import { TurnOutcomePanel } from "../panels/turn-outcome-panel";
import { DotCountdown } from "../panels/dot-countdown";
import { NextTurnTrigger } from "../panels/next-turn-trigger";
import { TerminalSection } from "../shared";

/**
 * Stacked dashboard composition for the bottom slot when a turn just ended.
 * Pure wiring — each piece is an independent concern:
 *   - TurnOutcomePanel: presentational summary
 *   - DotCountdown:     presentational timer UI
 *   - NextTurnTrigger:  side-effect that fires startNextTurn after the delay
 *
 * Self-gates via `isPostTurn` so single- and multi-device share the
 * exact same between-turns experience (see shared/post-turn.rules.ts).
 */
const StackedTurnOutcomeSlot: React.FC = () => {
  const ctx = useVisibilityContext();

  if (!isPostTurn(ctx)) return null;
  if (!ctx.lastCompletedTurn) return null; // defensive; isPostTurn already implies this

  return (
    <TerminalSection>
      <TurnOutcomePanel completedTurn={ctx.lastCompletedTurn} variant="compact" />
      <DotCountdown keyId={ctx.lastCompletedTurn.id} />
      <NextTurnTrigger keyId={ctx.lastCompletedTurn.id} />
    </TerminalSection>
  );
};

/**
 * Panel configuration - reads like requirements.
 * "AR toggle shows when isCodemaster"
 * "Intel shows when round is in progress (always visible during gameplay)"
 * "Clue input shows as its own panel when codemaster needs to give a clue"
 */
export const GAME_PANELS: PanelSlots = {
  header: [{ id: "team-header", component: TeamHeaderPanel, shouldRender: hasRole }],

  middle: [
    { id: "intel", component: IntelPanel, shouldRender: isRoundActive },
    { id: "clue-input", component: ClueInputPanel, shouldRender: isCodemasterGivingClue },
    { id: "ar-toggle", component: ARTogglePanel, shouldRender: canUseArToggle },
    { id: "ai-status", component: AIStatusPanel, shouldRender: isAiActive },
    { id: "gameover", component: GameoverPanel, shouldRender: isRoundComplete },
  ],

  bottom: [
    { id: "lobby-actions", component: LobbyActionsPanel, shouldRender: isInLobby },
    {
      id: "codebreaker-actions",
      component: CodebreakerActionsPanel,
      shouldRender: isCodebreakerGuessing,
    },
    {
      id: "turn-outcome",
      component: StackedTurnOutcomeSlot,
      shouldRender: always,
    },
  ],
};

/**
 * Panel config for mobile portrait drawer.
 * No header slot — TeamHeaderPanel is rendered by the drawer chrome instead.
 */
export const MOBILE_DRAWER_PANELS: PanelSlots = {
  header: [],   // suppressed — drawer chrome owns the header
  middle: GAME_PANELS.middle,
  bottom: GAME_PANELS.bottom,
};
