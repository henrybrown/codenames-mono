import React, { useState } from "react";
import { useCreateNewGame } from "@frontend/game/lobby/api/queries/use-create-new-game";
import { ActionButton, ErrorBox, ToggleSwitch } from "@frontend/game/gameplay/shared/components";
import { GAME_TYPE, GAME_FORMAT, GameType, GameFormat } from "@codenames/shared/types";
import styles from "./create-game-page-content.module.css";

interface SetupSceneProps {
  onComplete: (gameId: string) => void;
}

export const SetupScene: React.FC<SetupSceneProps> = ({ onComplete }) => {
  const [gameType, setGameType] = useState<GameType>(GAME_TYPE.SINGLE_DEVICE);
  const [gameFormat, setGameFormat] = useState<GameFormat>(GAME_FORMAT.QUICK);
  const [aiMode, setAiMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate: createNewGame, isPending } = useCreateNewGame();

  const handleCreate = () => {
    createNewGame(
      { gameType, gameFormat, aiMode },
      {
        onSuccess: (data) => onComplete(data.publicId),
        onError: (err) => {
          console.error("Game creation error:", err);
          setError("Failed to create a new game. Please try again.");
        },
      },
    );
  };

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>NEW GAME</h1>
      </div>
      <div className={styles.terminalBox}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>GAME TYPE</span>
          </div>
          <div className={styles.buttonGroup}>
            <button
              id="game-type-single"
              aria-pressed={gameType === GAME_TYPE.SINGLE_DEVICE}
              className={`${styles.optionButton} ${gameType === GAME_TYPE.SINGLE_DEVICE ? styles.selected : ""}`}
              onClick={() => setGameType(GAME_TYPE.SINGLE_DEVICE)}
            >
              <span className={styles.buttonLabel}>SINGLE DEVICE</span>
              <span className={styles.buttonDesc}>Pass & play on one device</span>
            </button>
            <button
              id="game-type-multi"
              aria-pressed={gameType === GAME_TYPE.MULTI_DEVICE}
              className={`${styles.optionButton} ${gameType === GAME_TYPE.MULTI_DEVICE ? styles.selected : ""}`}
              onClick={() => setGameType(GAME_TYPE.MULTI_DEVICE)}
            >
              <span className={styles.buttonLabel}>MULTI DEVICE</span>
              <span className={styles.buttonDesc}>Each player on their device</span>
            </button>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.aiSection}>
          <div>
            <span className={styles.sectionTitle}>AI MODE</span>
            <div className={styles.aiDesc}>Empty slots filled with AI players</div>
          </div>
          <ToggleSwitch id="ai-mode-toggle" active={aiMode} onChange={() => setAiMode(!aiMode)} />
        </div>

        <div className={styles.actionSection}>
          <ActionButton
            id="create-game-btn"
            onClick={handleCreate}
            enabled={!isPending}
            text={isPending ? "..." : "CREATE GAME"}
          />
        </div>

        {error && <ErrorBox message={error} />}
      </div>
    </>
  );
};
