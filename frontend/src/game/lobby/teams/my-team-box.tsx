import React from "react";
import { motion } from "framer-motion";
import { TeamSymbol } from "../shared/team-symbol";
import { getTeamConfig, getOppositeTeam, type TeamName } from "@frontend/shared/types";
import { AttentionTextBox } from "@frontend/game/gameplay/shared/components";
import styles from "../layout/lobby.module.css";

const BOX_ENTER_DURATION = 0.3;
const EASING = [0.4, 0, 0.2, 1] as const;

export interface MyTeamBoxViewProps {
  teamName: TeamName;
  playerName: string;
  playersNeeded: number;
  disabled: boolean;
  aiMode?: boolean;
  onSwitchTeam: () => void;
}

export const MyTeamBoxView: React.FC<MyTeamBoxViewProps> = ({
  teamName,
  playerName,
  playersNeeded,
  onSwitchTeam,
  disabled = false,
  aiMode = false,
}) => {
  const teamConfig = getTeamConfig(teamName);
  const teamColor = teamConfig.cssVar;
  const otherTeamName = getOppositeTeam(teamName);
  const otherTeamColor = otherTeamName ? getTeamConfig(otherTeamName).cssVar : "#6b7280";

  return (
    <motion.div
      layoutId="player-control-container"
      className={styles.myTeamBox}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        borderColor: teamColor,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        duration: BOX_ENTER_DURATION,
        ease: EASING,
        borderColor: { duration: BOX_ENTER_DURATION, ease: EASING },
      }}
    >
      <TeamSymbol
        teamName={teamName}
        teamColor={teamColor}
        className={styles.bigTeamSymbol}
      />

      <div className={styles.statusSection}>
        <div className={styles.playerLabel}>{playerName}</div>
        {!aiMode && (
          playersNeeded > 0 ? (
            <AttentionTextBox>WAITING FOR OPERATIVES</AttentionTextBox>
          ) : (
            <div className={styles.readyMessage}>Ready to start!</div>
          )
        )}
      </div>

      {otherTeamName && (
        <div className={styles.switchButtonContainer}>
          <TeamSymbol
            teamName={otherTeamName}
            teamColor={otherTeamColor}
            className={styles.switchSymbol}
            onClick={onSwitchTeam}
            disabled={disabled}
          />
        </div>
      )}
    </motion.div>
  );
};
