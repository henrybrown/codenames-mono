import React from "react";
import { TeamSymbolIcon } from "@frontend/shared/components/team-symbol-icon";
import { AttentionTextBox } from "@frontend/game/gameplay/shared/components";
import { getOutcomeSymbol, type GuessDisplay } from "../panels/intel-panel";
import styles from "./intel-content.module.css";

interface IntelContentProps {
  hasClue: boolean;
  clueWord?: string;
  clueNumber?: number;
  guesses: GuessDisplay[];
  maxSlots?: number;
  teamName: string;
  /** Show ghost rows for remaining guess slots */
  showGhostRows?: boolean;
  /** Show "AWAITING INPUT" when clue exists but no guesses yet */
  showAwaitingGuesses?: boolean;
}

export const IntelContent: React.FC<IntelContentProps> = ({
  hasClue,
  clueWord,
  clueNumber,
  guesses,
  maxSlots = 3,
  teamName,
  showGhostRows = true,
  showAwaitingGuesses = true,
}) => {
  if (!hasClue) {
    return (
      <div className={styles.awaitingCenter}>
        <AttentionTextBox>INTEL REQUIRED</AttentionTextBox>
      </div>
    );
  }

  return (
    <>
      <div className={styles.clueSection}>
        <span className={styles.clueWord}>"{clueWord}"</span>
        <span className={styles.clueNumber}>: {clueNumber}</span>
      </div>

      <div className={styles.divider} />

      <div className={styles.guessesSection}>
        <div className={styles.guessList}>
          {guesses.map((guess, index) => {
            const { symbol, color, rotate } = getOutcomeSymbol(guess.outcome, teamName);
            return (
              <div key={index} className={styles.guessRow}>
                <span className={styles.guessWord}>{guess.word}</span>
                <span className={styles.guessDots} />
                <span className={styles.guessSymbol}>
                  <TeamSymbolIcon symbol={symbol} rotate={rotate} color={color} filled />
                </span>
              </div>
            );
          })}

          {showGhostRows && guesses.length > 0 && Array.from({ length: Math.max(0, maxSlots - guesses.length) }).map((_, i) => (
            <div key={`ghost-${i}`} className={`${styles.guessRow} ${styles.guessRowGhost}`}>
              <span className={styles.guessWord}>· · · · ·</span>
              <span className={styles.guessDots} />
              <span className={styles.guessSymbol}>·</span>
            </div>
          ))}

          {showAwaitingGuesses && guesses.length === 0 && (
            <AttentionTextBox>AWAITING INPUT</AttentionTextBox>
          )}
        </div>
      </div>
    </>
  );
};
