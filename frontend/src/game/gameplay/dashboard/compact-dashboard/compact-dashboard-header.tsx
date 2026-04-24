import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getTeamStyle } from "../panels/intel-panel";
import { TeamSymbolIcon } from "@frontend/shared/components/team-symbol-icon";
import { CircleButton } from "../../shared/components";
import styles from "./compact-dashboard-header.module.css";

const TEAM_SWITCH_DURATION = 0.3;
const EASING = [0.4, 0, 0.2, 1] as const;

export interface CompactDashboardHeaderProps {
  teamName: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
}

/**
 * Top row of the compact dashboard: INTEL label + animated team symbol on
 * the left, prev/next nav arrows on the right, with a full-bleed divider
 * line underneath. The divider is structurally part of the header, not
 * a HudFrame concern.
 */
export const CompactDashboardHeader: React.FC<CompactDashboardHeaderProps> = ({
  teamName,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}) => {
  const { symbol, color, rotate } = getTeamStyle(teamName);

  return (
    <motion.div layout="position" layoutId="compact-header" className={styles.header}>
      <div className={styles.row}>
        <div className={styles.left}>
          <span className={styles.label}>INTEL</span>

          <AnimatePresence mode="wait">
            <motion.span
              key={teamName}
              className={styles.teamSymbol}
              style={{ "--symbol-color": color } as React.CSSProperties}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ duration: TEAM_SWITCH_DURATION, ease: EASING }}
            >
              <TeamSymbolIcon symbol={symbol} rotate={rotate} />
            </motion.span>
          </AnimatePresence>
        </div>

        <div className={styles.navGroup}>
          <CircleButton size="sm" onClick={onGoBack} disabled={!canGoBack} aria-label="Previous turn">{"<"}</CircleButton>
          <CircleButton size="sm" onClick={onGoForward} disabled={!canGoForward} aria-label="Next turn">{">"}</CircleButton>
        </div>
      </div>
      <div className={styles.divider} />
    </motion.div>
  );
};

CompactDashboardHeader.displayName = "CompactDashboardHeader";
