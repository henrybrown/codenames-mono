import React, { useState, useEffect } from "react";
import styles from "./turn-outcome-panel.module.css";

export const COUNTDOWN_SECONDS = 8;
/** 1 dot = 1 second so the dots stay perfectly in sync. */
export const DOT_COUNT = COUNTDOWN_SECONDS;

export interface DotCountdownProps {
  /**
   * Changing this value resets the countdown. Use the current completed-turn
   * id (or similar) so each new outcome restarts the dots.
   * Pass `undefined` to pause/hide the timer.
   */
  keyId?: string;
}

/**
 * Pure presentational dot countdown. Owns its own tick state — no external
 * timer or hook required. Above the dots, shows "Next turn in N seconds"
 * derived from the current iteration.
 */
export const DotCountdown: React.FC<DotCountdownProps> = ({ keyId }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    if (!keyId) return;

    const timer = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= COUNTDOWN_SECONDS) {
          clearInterval(timer);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [keyId]);

  const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsed);

  return (
    <div className={styles.dotCountdown}>
      <span className={styles.dotLabel}>Next turn in {remaining} seconds</span>
      <div className={styles.dotsRow}>
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`${styles.dot} ${i < DOT_COUNT - elapsed ? styles.dotActive : ""}`}
          />
        ))}
      </div>
    </div>
  );
};
