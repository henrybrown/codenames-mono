import { useEffect, useRef } from "react";
import { useGameDataRequired } from "../../providers";
import { useStartTurnMutation } from "../../api/mutations/use-start-turn";
import { COUNTDOWN_SECONDS } from "./dot-countdown";

export interface NextTurnTriggerProps {
  /**
   * Changing this value restarts the timer. Typically the id of the completed
   * turn being shown. Pass `undefined` to disable.
   */
  keyId?: string;
  /** Seconds to wait before firing the mutation. Defaults to COUNTDOWN_SECONDS. */
  delaySeconds?: number;
}

/**
 * Side-effect component. Renders nothing. Fires `startNextTurn` after
 * `delaySeconds` of being mounted with a given `keyId`.
 *
 * Deliberately separate from the visual countdown — the presentational
 * <DotCountdown /> and this trigger live independent lives. Mount both when
 * you want both behaviours; mount only one when you don't.
 */
export const NextTurnTrigger: React.FC<NextTurnTriggerProps> = ({
  keyId,
  delaySeconds = COUNTDOWN_SECONDS,
}) => {
  const { gameData } = useGameDataRequired();
  const startTurnMutation = useStartTurnMutation(gameData.publicId);

  /** Stable ref so the timeout fires the latest mutation without
   *  restarting on every render. */
  const fireRef = useRef(() => {});
  fireRef.current = () => {
    const roundNumber = gameData.currentRound?.roundNumber ?? 1;
    startTurnMutation.mutate({ roundNumber });
  };

  useEffect(() => {
    if (!keyId) return;
    const timer = setTimeout(() => fireRef.current(), delaySeconds * 1000);
    return () => clearTimeout(timer);
  }, [keyId, delaySeconds]);

  return null;
};
