import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardState } from "../use-dashboard-state";
import { useGameDataRequired } from "../../providers";
import { useAiStatus, useTriggerAiMove } from "@frontend/ai/api";
import { StatusDot } from "../../shared/components";
import { ActionButton } from "@frontend/game/gameplay/shared/components";
import { DotCountdown } from "../panels/dot-countdown";
import styles from "./compact-dashboard-footer.module.css";

/** Shared spring pop matching compact-dashboard body entrances. */
const popVariants = {
  initial: { scale: 0.85, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
};
const popTransition = {
  type: "spring" as const,
  stiffness: 420,
  damping: 22,
  mass: 0.8,
};

export interface CompactDashboardFooterProps {
  /** Whether the TRANSMIT button should be enabled. */
  canTransmit: boolean;
  /** Handler for the TRANSMIT button. */
  onTransmit: () => void;
}

/**
 * Bottom row of the compact dashboard. Renders one of three variants
 * based on derived state:
 *  - Dot countdown (turn just ended, awaiting auto-advance)
 *  - Primary action button (TRANSMIT / END TURN / NEW GAME)
 *  - AI row (THINKING / TRIGGER AI / STANDING BY + status dot)
 */
export const CompactDashboardFooter: React.FC<CompactDashboardFooterProps> = ({
  canTransmit,
  onTransmit,
}) => {
  const s = useDashboardState();
  const { gameData } = useGameDataRequired();
  const { data: aiStatus } = useAiStatus(gameData.publicId);
  const triggerAi = useTriggerAiMove(gameData.publicId);

  const isAiThinking = (aiStatus?.thinking || triggerAi.isPending) ?? false;
  const canTriggerAi = (aiStatus?.available && !isAiThinking) ?? false;

  const showOutcome = s.isPostTurn && !!s.lastCompletedTurn;

  /** Single primary action -- hidden when it's an AI turn (AI row takes over) */
  const primaryButton = (() => {
    if (s.isAiSession) return null;
    if (s.isCodemasterGivingClue)
      return (
        <ActionButton id="submit-clue-btn" size="sm" fullWidth
          text={s.isLoading ? "..." : "TRANSMIT"}
          onClick={onTransmit}
          enabled={canTransmit && !isAiThinking}
        />
      );
    if (s.isInLobby && s.lobbyAction)
      return (
        <ActionButton id="lobby-action-btn" size="sm" fullWidth
          text={s.isLoading ? "..." : s.lobbyAction.label}
          onClick={s.lobbyAction.handler}
          enabled={!s.isLoading}
        />
      );
    if (s.isCodebreakerGuessing)
      return (
        <ActionButton id="end-turn-btn" size="sm" fullWidth
          text={s.isLoading ? "..." : "END TURN"}
          onClick={s.endTurn}
          enabled={!s.isLoading}
        />
      );
    if (s.isRoundComplete && s.gameOverData)
      return (
        <ActionButton size="sm" fullWidth
          text={s.isLoading ? "..." : "NEW GAME"}
          onClick={s.gameOverData.newGame}
          enabled={!s.isLoading}
        />
      );
    return null;
  })();

  return (
    <motion.div layout="position" layoutId="compact-footer" className={styles.footer}>
      <AnimatePresence mode="popLayout">
        {showOutcome && s.lastCompletedTurn ? (
          <motion.div
            key="dot-countdown"
            layout="position"
            layoutId="compact-footer-dots"
            style={{ width: "100%" }}
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={popTransition}
          >
            <DotCountdown keyId={s.lastCompletedTurn.id} />
          </motion.div>
        ) : primaryButton ? (
          <motion.div
            key="primary-button"
            layout="position"
            layoutId="compact-footer-primary"
            style={{ width: "100%" }}
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={popTransition}
          >
            {primaryButton}
          </motion.div>
        ) : s.isAiActive ? (
          <motion.div
            key="ai-active"
            layout="position"
            layoutId="compact-footer-ai"
            style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4 }}
            variants={popVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={popTransition}
          >
            {aiStatus?.health && (aiStatus.health.placement === "cpu" || aiStatus.health.placement === "partial") ? (
              <div className={styles.healthWarning}>
                {aiStatus.health.placement === "cpu"
                  ? "Running on CPU — slower than normal"
                  : `Partial GPU (${aiStatus.health.gpuPercent}%) — may be slower`}
              </div>
            ) : null}

            <div className={styles.aiActionRow}>
              {isAiThinking ? (
                <>
                  <button className={styles.triggerBtn} disabled>
                    THINKING...
                  </button>
                  <span className={styles.controlRowDot}><StatusDot active thinking /></span>
                </>
              ) : canTriggerAi ? (
                <>
                  <button className={styles.triggerBtn} onClick={() => triggerAi.mutate()}>
                    TRIGGER AI
                  </button>
                  <span className={styles.controlRowDot}><StatusDot active thinking={false} /></span>
                </>
              ) : (
                <>
                  <span className={styles.aiIdleText}>STANDING BY</span>
                  <span className={styles.controlRowDot}><StatusDot active={false} thinking={false} /></span>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
};

CompactDashboardFooter.displayName = "CompactDashboardFooter";
