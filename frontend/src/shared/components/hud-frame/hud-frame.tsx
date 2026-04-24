import React from "react";
import styles from "./hud-frame.module.css";

export interface HudFrameProps {
  /** Pinned to the bottom of the frame. */
  footer?: React.ReactNode;
  /** Body content. */
  children?: React.ReactNode;
}

/**
 * HudFrame — control-area layout shell.
 *
 *   [center group]     body, vertically centered in free space
 *     [body]           children
 *   [footer]           pinned to the bottom via flex layout
 *
 * Footer never moves. The body sits centered above it. When the body
 * content grows, it expands within the center slot without pushing the
 * footer.
 */
export const HudFrame: React.FC<HudFrameProps> = ({ footer, children }) => (
  <div className={styles.frame}>
    <div className={styles.centerGroup}>
      <div className={styles.body}>{children}</div>
    </div>
    {footer ? <div className={styles.footer}>{footer}</div> : null}
  </div>
);

HudFrame.displayName = "HudFrame";
