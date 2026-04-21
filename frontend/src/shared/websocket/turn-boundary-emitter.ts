import { useEffect } from "react";

export interface TurnBoundaryDetail {
  /** All game event types that were in the coalesced batch */
  events: string[];
  /** TURN_ENDED was in the batch */
  hasTurnEnd: boolean;
  /** TURN_STARTED was in the batch */
  hasTurnStart: boolean;
  /** ROUND_ENDED was in the batch */
  hasRoundEnd: boolean;
}

type Listener = (detail: TurnBoundaryDetail) => void;

const listeners = new Set<Listener>();

export function emitTurnBoundary(detail: TurnBoundaryDetail): void {
  listeners.forEach((fn) => fn(detail));
}

export function onTurnBoundary(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Subscribe to turn boundary signals.
 * Fires once per coalesced game event batch that contains
 * TURN_ENDED or TURN_STARTED.
 */
export function useTurnBoundarySignal(callback: Listener): void {
  useEffect(() => onTurnBoundary(callback), [callback]);
}
