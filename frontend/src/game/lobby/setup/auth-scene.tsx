import React, { useState } from "react";
import { useCreateGuestSession } from "@frontend/game/lobby/api/queries/use-guest-session";
import { ActionButton, AttentionTextBox, ErrorBox } from "@frontend/game/gameplay/shared/components";
import styles from "./guest-auth-page-content.module.css";

interface AuthSceneProps {
  onComplete: () => void;
}

export const AuthScene: React.FC<AuthSceneProps> = ({ onComplete }) => {
  const [error, setError] = useState<string | null>(null);
  const { mutate: createGuestSession, isPending } = useCreateGuestSession();

  const handleConnect = () => {
    createGuestSession(undefined, {
      onSuccess: () => onComplete(),
      onError: () => setError("Failed to create a guest session. Please try again."),
    });
  };

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>SYSTEM ACCESS</h1>
      </div>
      <div className={styles.body}>
        <div className={styles.controlRow}>
          <AttentionTextBox>SECURE CONNECTION REQUIRED</AttentionTextBox>
        </div>
        <div className={styles.controlRow}>
          <ActionButton
            id="connect-btn"
            text={isPending ? "..." : "CONNECT"}
            onClick={handleConnect}
            enabled={!isPending}
            className={styles.fullWidthBtn}
          />
        </div>
        {error && <ErrorBox message={error} />}
      </div>
    </>
  );
};
