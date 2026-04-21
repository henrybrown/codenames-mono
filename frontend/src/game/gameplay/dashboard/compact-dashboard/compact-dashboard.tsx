import React, { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useDashboardState } from "../use-dashboard-state";
import { useIntelState } from "../panels/use-intel-state";
import { useGameDataRequired } from "../../providers";
import { useAiStatus, useTriggerAiMove } from "@frontend/ai/api";
import { ChatFab, ChatPanel } from "@frontend/chat/components";
import { useUnreadCount } from "@frontend/chat/api";
import { getTeamStyle } from "../panels/intel-panel";
import { TeamSymbolIcon } from "@frontend/shared/components/team-symbol-icon";
import { StatusDot, CircleButton } from "../../shared/components";
import { ActionButton } from "@frontend/game/gameplay/shared/components";
import { AwaitingLabel, carouselVariants, CAROUSEL_TRANSITION, useCarouselSwipe, IntelContent, ScoreComparison } from "../shared";
import { TurnOutcomePanel } from "../panels/turn-outcome-panel";
import { DotCountdown } from "../panels/dot-countdown";
import { NextTurnTrigger } from "../panels/next-turn-trigger";
import { CompactClueInput } from "./compact-clue-input";
import { useClueInput } from "./use-clue-input";
import styles from "./compact-dashboard.module.css";

const TEAM_SWITCH_DURATION = 0.3;
const EASING = [0.4, 0, 0.2, 1] as const;

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
 * Four sections stacked vertically:
 * - Header: INTEL label + team symbol + score (round over) + nav arrows
 * - Intel box: clue + guesses
 * - AI section: trigger button or thinking status (only when AI active)
 * - Footer: single full-width primary action button
 *
 * Used by DesktopScene (portrait), WindowedScene, and MobileScene.
 */
export const CompactDashboard: React.FC<CompactDashboardProps> = ({ onOpenClueInput: _onOpenClueInput }) => {
  const s = useDashboardState();
  const intel = useIntelState();

  /** Outcome mode: turn just ended, not yet advanced. */
  const showOutcome = s.canStartNextTurn && !!s.lastCompletedTurn;

  const { gameData } = useGameDataRequired();
  const { data: aiStatus } = useAiStatus(gameData.publicId);
  const triggerAi = useTriggerAiMove(gameData.publicId);

  const isAiThinking = (aiStatus?.thinking || triggerAi.isPending) ?? false;
  const canTriggerAi = (aiStatus?.available && !isAiThinking) ?? false;

  const [chatOpen, setChatOpen] = useState(false);
  const unreadCount = useUnreadCount(gameData.publicId, chatOpen);

  const clue = useClueInput(gameData.currentRound?.cards ?? []);

  const handleTransmit = (): void => {
    if (!clue.validate()) return;
    s.giveClue(clue.word, clue.count);
    clue.reset();
  };

  const { symbol, color, rotate } = getTeamStyle(intel.teamName);

  /** Single primary action -- hidden when it's an AI turn (footer AI section takes over) */
  const primaryButton = (() => {
    if (s.isAiSession) return null;
    if (s.isCodemasterGivingClue)
      return (
        <ActionButton id="submit-clue-btn" size="sm" fullWidth
          text={s.isLoading ? "..." : "TRANSMIT"}
          onClick={handleTransmit}
          enabled={!!(clue.word.trim()) && !isAiThinking && !s.isLoading}
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

  const lobbyChatOverlay = (
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
        <div className={styles.content}>
          <div className={styles.contentSpacer} />
          <div className={styles.fixedWidthWrapper}>
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
          </div>
          <div className={styles.contentSpacer} />
        </div>
        {lobbyChatOverlay}
      </div>
    );
  }

  return (
    <LayoutGroup id="compact-dashboard">
    <div className={styles.panel}>
      <div className={styles.content}>
        <motion.div layout="position" layoutId="compact-header" className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerLabel}>INTEL</span>

            <AnimatePresence mode="wait">
              <motion.span
                key={intel.teamName}
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

            {/** Score now shown in scoreBox below intel, not in header */}
          </div>

          <div className={styles.navGroup}>
            <CircleButton size="sm" onClick={handleGoBack} disabled={!intel.canGoBack} aria-label="Previous turn">{"<"}</CircleButton>
            <CircleButton size="sm" onClick={handleGoForward} disabled={!intel.canGoForward} aria-label="Next turn">{">"}</CircleButton>
          </div>
        </motion.div>

        <div className={styles.centerGroup}>
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
                    <div className={styles.fixedWidthWrapper}>
                      <AwaitingLabel>INTEL REQUIRED</AwaitingLabel>
                    </div>
                    <div className={styles.fixedWidthWrapper}>
                      <CompactClueInput
                        word={clue.word}
                        count={clue.count}
                        error={clue.error}
                        isLoading={s.isLoading}
                        onWordChange={clue.setWord}
                        onCountChange={clue.setCount}
                        onSubmit={handleTransmit}
                      />
                    </div>
                  </motion.div>
                ) : !intel.hasClue ? (
                  <motion.div
                    className={styles.intelBoxCentered}
                    variants={popVariants}
                    initial="initial"
                    animate="animate"
                    transition={popTransition}
                  >
                    <div className={styles.fixedWidthWrapper}>
                      <IntelContent
                        hasClue={intel.hasClue}
                        clueWord={intel.clueWord}
                        clueNumber={intel.clueNumber}
                        guesses={intel.guesses}
                        maxSlots={intel.maxSlots}
                        teamName={intel.teamName}
                        showGhostRows={false}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    className={`${styles.fixedWidthWrapper} ${styles.intelBox}`}
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
                className={styles.fixedWidthWrapper}
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

          <motion.div layout="position" layoutId="compact-footer" className={styles.footer}>
            <AnimatePresence mode="popLayout">
              {showOutcome && s.lastCompletedTurn ? (
                <motion.div
                  key="dot-countdown"
                  layout="position"
                  layoutId="compact-footer-dots"
                  className={styles.fixedWidthWrapper}
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
                  className={styles.fixedWidthWrapper}
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
                  className={styles.fixedWidthWrapper}
                  variants={popVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={popTransition}
                >
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
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>

      </div>
      {/** Chat FAB pinned bottom-right at the panel level — never moves,
       *   never flexes, same position across all dashboard states. */}
      <div className={styles.chatFabSlot}>
        <ChatFab onClick={() => setChatOpen(true)} unreadCount={unreadCount} />
      </div>
      {chatPanelEl}
    </div>
    </LayoutGroup>
  );
};
