import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TerminalSection } from "../shared";
import { AttentionTextBox } from "@frontend/game/gameplay/shared/components";
import type { TurnData } from "@frontend/shared/types";

export interface TurnOutcomePanelProps {
  /** The completed turn to display. Only `id` is used to key the animation. */
  completedTurn: TurnData;
  /** "compact" omits TerminalSection wrapper, "stacked" wraps in TerminalSection */
  variant?: "compact" | "stacked";
}

/**
 * Pure presentational "TURN COMPLETE" tag with a spring pop-in.
 * No side effects. The intel panel already shows the completed turn's
 * clue + guesses — this component is *just* the status tag.
 *
 * Pair with <DotCountdown /> (visual timer) and <NextTurnTrigger /> (side
 * effect that fires startNextTurn) when full outcome UX is wanted.
 */
export const TurnOutcomePanel: React.FC<TurnOutcomePanelProps> = ({
  completedTurn,
  variant = "stacked",
}) => {
  /**
   * Defer the pop until after layout settles (two RAFs on top of the spring
   * delay). Avoids the tag appearing before surrounding content has painted.
   */
  const [showTag, setShowTag] = useState(false);
  useEffect(() => {
    setShowTag(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShowTag(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [completedTurn.id]);

  const content = (
    <motion.div
      key={completedTurn.id}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={showTag ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 16, mass: 0.8, delay: 0.15 }}
    >
      <AttentionTextBox>TURN COMPLETE</AttentionTextBox>
    </motion.div>
  );

  if (variant === "compact") return content;

  return <TerminalSection>{content}</TerminalSection>;
};
