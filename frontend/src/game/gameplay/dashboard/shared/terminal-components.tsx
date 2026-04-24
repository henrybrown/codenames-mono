import React from "react";
import { motion } from "framer-motion";
import styles from "./terminal-components.module.css";

/** Shared swipe/carousel constants */
export const SWIPE_THRESHOLD = 50; // px drag distance
export const VELOCITY_THRESHOLD = 500; // px/s

/** Shared carousel slide variants for AnimatePresence */
export const carouselVariants = {
  enter: (dir: number) => ({ x: dir < 0 ? 100 : -100, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? -100 : 100, opacity: 0 }),
};

export const CAROUSEL_TRANSITION = { duration: 0.15, ease: [0.4, 0, 0.2, 1] as const };

/**
 * Terminal section card - provides visual container for content
 * Supports layoutId for morphing animations between states
 */
export const TerminalSection: React.FC<{
  children?: React.ReactNode;
  layoutId?: string;
  disableLayoutAnimation?: boolean;
  borderless?: boolean;
}> = ({ children, layoutId, disableLayoutAnimation = false, borderless = false }) => (
  <motion.div
    className={styles.terminalSection}
    data-borderless={borderless}
    layoutId={layoutId}
    layout={!disableLayoutAnimation}
    initial={{ opacity: 0, scale: 0.9, y: 10 }}
    animate={{
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25,
      },
    }}
    transition={{
      layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
      opacity: { duration: 0.2 },
    }}
  >
    {children}
  </motion.div>
);

export const TerminalCommand: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className={styles.terminalCommand}>{children}</div>
);

/**
 * PlayerInfoLayout - Special layout for player/team info header with symbol
 */
export const PlayerInfoLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div className={styles.playerInfoLayout}>{children}</div>
);

/** Re-export from shared components for backward compatibility */
export { AttentionTextBox } from "@frontend/game/gameplay/shared/components";

/**
 * Wrapper for middle grid section - ensures it fills available space
 */
export const MiddleSection: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.middleSection}>{children}</div>
);

/**
 * Spy goggles container with minimum height for better spacing
 */
export const SpyGogglesContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.spyGogglesContainer}>{children}</div>
);

export const SpyGogglesSwitchRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={styles.spyGogglesSwitchRow}>{children}</div>
);

interface SpyGogglesDotProps {
  active: boolean;
}

export const SpyGogglesDot: React.FC<SpyGogglesDotProps> = ({ active }) => (
  <span className={styles.spyGogglesDot} data-active={active} />
);
