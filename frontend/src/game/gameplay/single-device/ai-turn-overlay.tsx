import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getTeamConfig } from "@frontend/shared/types";
import type { TurnPhase } from "@frontend/shared/types";
import { ActionButton, pageContainerStyles } from "@frontend/game/gameplay/shared/components";
import { TeamSymbolIcon } from "@frontend/shared/components/team-symbol-icon";
import styles from "./device-handoff-overlay.module.css";

/**
 * Shown when it's an AI turn (same team, no handoff needed).
 * Prompts the user to pass the device so the team can trigger their AI
 * from the dashboard — no auto-trigger here.
 */

const EASE = [0.4, 0, 0.2, 1] as const;

interface AiTurnOverlayProps {
  active: TurnPhase;
  onPass: () => void;
}

export const AiTurnOverlay: React.FC<AiTurnOverlayProps> = ({ active, onPass }) => {
  const [visible, setVisible] = useState(true);

  const teamConfig = getTeamConfig(active.teamName);
  const roleLabel = active.role === "CODEMASTER" ? "Spymaster" : "Operatives";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.overlayContainer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.3, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE } }}
        >
          <div className={styles.backgroundBlur} />

          <motion.div
            className={pageContainerStyles.card}
            style={{ maxWidth: 480 }}
            initial={{ scale: 0.85, y: 16 }}
            animate={{ scale: 1, y: 0, transition: { duration: 0.35, ease: EASE } }}
            exit={{ scale: 0, transition: { duration: 0.4, ease: EASE } }}
          >
            <h1 className={styles.title}>AI TURN</h1>

            <div
              className={styles.playerInfo}
              style={{ "--team-color": teamConfig.cssVar } as React.CSSProperties}
            >
              <div className={styles.playerName}>{active.teamName}</div>
              <div className={styles.roleLabel}>
                <TeamSymbolIcon
                  symbol={teamConfig.symbol}
                  rotate={teamConfig.symbolRotate}
                  color={teamConfig.cssVar}
                  filled
                />
                {" "}{roleLabel} · AI Agent
              </div>
            </div>

            <p className={styles.subtitle}>
              Pass to the {active.teamName} team to trigger their AI agent.
            </p>

            <ActionButton
              text="PASS"
              enabled={true}
              onClick={() => { onPass(); setVisible(false); }}
              fullWidth
              className={styles.passButton}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
