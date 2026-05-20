import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AuthScene } from "@frontend/game/lobby/setup/auth-scene";
import { SetupScene } from "@frontend/game/lobby/setup/setup-scene";
import { LobbyScene } from "@frontend/game/lobby/layout/lobby-scene";
import { SceneCard } from "./scene-card";
import styles from "./pre-game-flow.module.css";

/**
 * Manages the pre-game journey: auth → setup → lobby → gameplay.
 *
 * Pure plumbing — each scene owns its own API calls and side effects.
 * This component only handles step sequencing, transitions, and navigation.
 * 
 * Motion.div allows animations between each scene.
 */

type Step = "auth" | "setup" | "lobby";

const STEPS: Step[] = ["auth", "setup", "lobby"];

interface SceneConfig {
  maxWidth?: number;
  render: () => React.ReactNode;
}

export const PreGameFlow: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("auth");
  const [gameId, setGameId] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [loading, setLoading] = useState(false);

  const advance = useCallback(() => setExiting(true), []);

  const handleExitComplete = useCallback(() => {
    const nextIndex = STEPS.indexOf(step) + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
      setExiting(false);
    } else {
      navigate(`/game/${gameId}`, { state: { fromLobby: true } });
    }
  }, [step, navigate, gameId]);

  const handleLobbyLoading = useCallback((isLoading: boolean) => {
    setLoading(isLoading);
  }, []);

  const scenes: Record<Step, SceneConfig> = {
    auth: {
      maxWidth: 480,
      render: () => (
        <AuthScene onComplete={advance} />
      ),
    },
    setup: {
      maxWidth: 700,
      render: () => (
        <SetupScene onComplete={(id) => { setGameId(id); advance(); }} />
      ),
    },
    lobby: {
      maxWidth: 1400,
      render: () => (
        <LobbyScene
          gameId={gameId!}
          onStart={advance}
          onLoading={handleLobbyLoading}
        />
      ),
    },
  };

  return (
    <div className={styles.container}>
      <div
        className={styles.backgroundDot}
        data-visible={exiting || loading}
      />
      <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
        {!exiting && (
          loading ? (
            <motion.div
              key="loading"
              className={styles.loadingDot}
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
              }}
              exit={{
                opacity: 0,
                scale: 0,
                transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
              }}
            />
          ) : (
            <SceneCard key={step} maxWidth={scenes[step].maxWidth}>
              {scenes[step].render()}
            </SceneCard>
          )
        )}
      </AnimatePresence>
    </div>
  );
};
