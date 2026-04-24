import React, { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useDashboardState } from "../use-dashboard-state";
import { useIntelState } from "../panels/use-intel-state";
import { useGameDataRequired } from "../../providers";
import { ChatFab, ChatPanel } from "@frontend/chat/components";
import { useUnreadCount } from "@frontend/chat/api";
import { ActionButton } from "@frontend/game/gameplay/shared/components";
import { AttentionTextBox, carouselVariants, CAROUSEL_TRANSITION, useCarouselSwipe, IntelContent, ScoreComparison } from "../shared";
import { TurnOutcomePanel } from "../panels/turn-outcome-panel";
import { NextTurnTrigger } from "../panels/next-turn-trigger";
import { HudFrame } from "@frontend/shared/components/hud-frame";
import { CompactClueInput } from "./compact-clue-input";
import { useClueInput } from "./use-clue-input";
import { CompactDashboardHeader } from "./compact-dashboard-header";
import { CompactDashboardFooter } from "./compact-dashboard-footer";
import styles from "./compact-dashboard.module.css";

/** Shared spring pop for intel-box-style content in the condensed dashboard. */
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

interface CompactDashboardProps {
  onOpenClueInput: () => void;
}

/**
 * Compact vertical dashboard for constrained viewports.
 *
 * Structure:
 * - Intel row: INTEL label + team symbol + nav arrows + divider (sibling
 *   of the HudFrame, sits full-bleed above it)
 * - HudFrame (the control area):
 *    - Body: intel swipe zone, turn outcome panel, score box
 *    - Footer: dot countdown / primary action / AI row
 *
 * Used by DesktopScene (portrait), WindowedScene, and MobileScene.
 */
export const CompactDashboard: React.FC<CompactDashboardProps> = ({ onOpenClueInput: _onOpenClueInput }) => {
  const s = useDashboardState();
  const intel = useIntelState();

  /** Outcome mode: turn just ended, not yet advanced. */
  const showOutcome = s.canStartNextTurn && !!s.lastCompletedTurn;

  const { gameData } = useGameDataRequired();

  const [chatOpen, setChatOpen] = useState(false);
  const unreadCount = useUnreadCount(gameData.publicId, chatOpen);

  const clue = useClueInput(gameData.currentRound?.cards ?? []);

  const handleTransmit = (): void => {
    if (!clue.validate()) return;
    s.giveClue(clue.word, clue.count);
    clue.reset();
  };

  /** Carousel swipe navigation -- must be before any early returns */
  const { swipeDirection, handleDragEnd, handleGoBack, handleGoForward } = useCarouselSwipe({
    canGoBack: intel.canGoBack,
    canGoForward: intel.canGoForward,
    onGoBack: intel.onGoBack,
    onGoForward: intel.onGoForward,
  });

  const chatPanelEl = (
    <ChatPanel
      gameId={gameData.publicId}
      viewerPlayerId={gameData.playerContext?.publicId ?? null}
      open={chatOpen}
      onClose={() => setChatOpen(false)}
    />
  );

  const chatFabOverlay = (
    <>
      <div className={styles.chatFabSlot}>
        <ChatFab onClick={() => setChatOpen(true)} unreadCount={unreadCount} />
      </div>
      {chatPanelEl}
    </>
  );

  if (s.isInLobby) {
    return (
      <div className={styles.panel}>
        <HudFrame>
          <div className={styles.lobbyButtons}>
            {s.lobbyAction && (
              <ActionButton id="lobby-action-btn" size="sm" fullWidth
                text={s.lobbyAction.label}
                onClick={s.lobbyAction.handler}
                enabled={!s.isLoading}
              />
            )}
            {s.lobbyAction?.canRedeal && (
              <ActionButton id="redeal-btn" size="sm" fullWidth
                text="REDEAL"
                onClick={s.lobbyAction.redealHandler}
                enabled={!s.isLoading}
              />
            )}
          </div>
        </HudFrame>
        {chatFabOverlay}
      </div>
    );
  }

  return (
    <LayoutGroup id="compact-dashboard">
      <div className={styles.panel}>
        <CompactDashboardHeader
          teamName={intel.teamName}
          canGoBack={intel.canGoBack}
          canGoForward={intel.canGoForward}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
        />
        <HudFrame
          footer={
            <CompactDashboardFooter
              canTransmit={!!clue.word.trim() && !s.isLoading}
              onTransmit={handleTransmit}
            />
          }
        >
          {/* Normal intel swipe zone — ALWAYS rendered, never swapped. */}
          <motion.div
            layout="position"
            layoutId="compact-intel-swipe"
            className={styles.swipeZone}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{ touchAction: "pan-y" }}
          >
            <AnimatePresence mode="wait" initial={false} custom={swipeDirection}>
              <motion.div
                key={intel.selectedIndex}
                custom={swipeDirection}
                variants={carouselVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={CAROUSEL_TRANSITION}
                style={{ display: "flex", flexDirection: "column", flex: 1 }}
              >
                {!intel.hasClue && s.isCodemasterGivingClue ? (
                  <motion.div
                    className={styles.clueInputCenter}
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    transition={popTransition}
                  >
                    <AttentionTextBox>INTEL REQUIRED</AttentionTextBox>
                    <CompactClueInput
                      word={clue.word}
                      count={clue.count}
                      error={clue.error}
                      isLoading={s.isLoading}
                      onWordChange={clue.setWord}
                      onCountChange={clue.setCount}
                      onSubmit={handleTransmit}
                    />
                  </motion.div>
                ) : !intel.hasClue ? (
                  <motion.div
                    className={styles.intelBoxCentered}
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    transition={popTransition}
                  >
                    <IntelContent
                      hasClue={intel.hasClue}
                      clueWord={intel.clueWord}
                      clueNumber={intel.clueNumber}
                      guesses={intel.guesses}
                      maxSlots={intel.maxSlots}
                      teamName={intel.teamName}
                      showGhostRows={false}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className={styles.intelBox}
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    transition={popTransition}
                  >
                    <IntelContent
                      hasClue={intel.hasClue}
                      clueWord={intel.clueWord}
                      clueNumber={intel.clueNumber}
                      guesses={intel.guesses}
                      maxSlots={intel.maxSlots}
                      teamName={intel.teamName}
                      showGhostRows={false}
                    />
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* TURN COMPLETE tag — slots in below the intel when a turn has
              ended but not yet advanced. No layout swap; intel stays above. */}
          <AnimatePresence mode="popLayout">
            {showOutcome && s.lastCompletedTurn ? (
              <motion.div
                key="turn-outcome"
                layout="position"
                layoutId="compact-turn-outcome"
                variants={popVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={popTransition}
              >
                <TurnOutcomePanel
                  completedTurn={s.lastCompletedTurn}
                  variant="compact"
                />
                {/* Side effect: fire startNextTurn after the countdown.
                    Noop in multi-device mode since backend already auto-started
                    (mutation would just error and we don't care). */}
                <NextTurnTrigger keyId={s.lastCompletedTurn.id} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {s.isRoundComplete && s.gameOverData && (
            <motion.div
              layout="position"
              layoutId="compact-score-box"
              variants={popVariants}
              initial="initial"
              animate="animate"
              transition={popTransition}
            >
              <ScoreComparison
                winnerName={s.gameOverData.winnerName ?? ""}
                winnerScore={s.gameOverData.winnerScore}
                loserName={s.gameOverData.loserName ?? ""}
                loserScore={s.gameOverData.loserScore}
                className={styles.scoreBox}
              />
            </motion.div>
          )}
        </HudFrame>
        {/** Chat FAB pinned bottom-right at the panel level — never moves,
         *   never flexes, same position across all dashboard states. */}
        {chatFabOverlay}
      </div>
    </LayoutGroup>
  );
};
