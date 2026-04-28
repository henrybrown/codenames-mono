import { createContext, useState, useCallback, useContext, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGiveClueMutation, useEndTurnMutation } from "../api/mutations";
import { useMakeGuessMutation } from "../board/use-make-guess";
import { useGameDataRequired } from "../providers";
import { useTurn } from "../providers";

/** Turn action names */
export type TurnActionName = "giveClue" | "makeGuess" | "endTurn";

/** State for a turn action */
export interface TurnActionState {
  name: TurnActionName | null;
  status: "idle" | "loading" | "success" | "error";
  error?: Error | null;
}

/** Turn actions context data */
export interface TurnActionsData {
  actionState: TurnActionState;
  isPending: boolean;
}

/** Turn actions context handlers */
export interface TurnActionsHandlers {
  giveClue: (word: string, count: number) => void;
  makeGuess: (word: string) => void;
  endTurn: () => void;
  resetActionState: () => void;
}

/** Combined turn actions context value */
export type TurnActionsContextValue = TurnActionsData & TurnActionsHandlers;

export const TurnActionsContext = createContext<TurnActionsContextValue | undefined>(undefined);

const initialState: TurnActionState = {
  name: null,
  status: "idle",
  error: null,
};

interface TurnActionsProviderProps {
  children: ReactNode;
}

export const TurnActionsProvider = ({ children }: TurnActionsProviderProps) => {
  const [actionState, setActionState] = useState<TurnActionState>(initialState);

  const { gameData, gameId } = useGameDataRequired();
  const { setLastActionTurnId } = useTurn();
  const queryClient = useQueryClient();

  const giveClueMutation = useGiveClueMutation(gameId);
  const makeGuessMutation = useMakeGuessMutation(gameId);
  const endTurnMutation = useEndTurnMutation(gameId);

  const resetActionState = useCallback(() => {
    setActionState(initialState);
  }, []);

  const invalidateGameData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["gameData"] });
    queryClient.invalidateQueries({ queryKey: ["turn"] });
    queryClient.invalidateQueries({ queryKey: ["game", gameId, "ai", "status"] });
  }, [queryClient, gameId]);

  const makeGuess = useCallback(
    async (word: string) => {
      if (!gameData.currentRound) return;

      const roundNumber = gameData.currentRound.roundNumber;
      setActionState({ name: "makeGuess", status: "loading", error: null });

      makeGuessMutation.mutate(
        { cardWord: word, roundNumber },
        {
          onSuccess: (res) => {
            setLastActionTurnId(res.turn.id);
            setActionState({ name: "makeGuess", status: "success", error: null });
            invalidateGameData();
          },
          onError: (error) => {
            console.error("Failed to make guess:", error);
            setActionState({ name: "makeGuess", status: "error", error });
          },
        },
      );
    },
    [makeGuessMutation, gameData.currentRound, setLastActionTurnId, invalidateGameData],
  );

  const giveClue = useCallback(
    (word: string, count: number) => {
      if (!gameData.currentRound) return;

      const roundNumber = gameData.currentRound.roundNumber;
      setActionState({ name: "giveClue", status: "loading", error: null });

      giveClueMutation.mutate(
        { word, targetCardCount: count, roundNumber },
        {
          onSuccess: (res) => {
            setLastActionTurnId(res.turn.id);
            setActionState({ name: "giveClue", status: "success", error: null });
            invalidateGameData();
          },
          onError: (error) => {
            console.error("Failed to give clue:", error);
            setActionState({ name: "giveClue", status: "error", error });
          },
        },
      );
    },
    [giveClueMutation, gameData.currentRound, setLastActionTurnId, invalidateGameData],
  );

  const endTurn = useCallback(() => {
    if (!gameData.currentRound) return;

    const roundNumber = gameData.currentRound.roundNumber;
    setActionState({ name: "endTurn", status: "loading", error: null });

    endTurnMutation.mutate(
      { roundNumber },
      {
        onSuccess: () => {
          setActionState({ name: "endTurn", status: "success", error: null });
          invalidateGameData();
          /**
           * Do NOT start the next turn here. The between-turns window
           * (TurnOutcomePanel + DotCountdown + NextTurnTrigger) owns that
           * transition for BOTH single- and multi-device games. See
           * shared/post-turn.rules.ts.
           */
        },
        onError: (error) => {
          console.error("Failed to end turn:", error);
          setActionState({ name: "endTurn", status: "error", error });
        },
      },
    );
  }, [endTurnMutation, gameData.currentRound, invalidateGameData]);

  const value: TurnActionsContextValue = {
    actionState,
    isPending: actionState.status === "loading",
    giveClue,
    makeGuess,
    endTurn,
    resetActionState,
  };

  return <TurnActionsContext.Provider value={value}>{children}</TurnActionsContext.Provider>;
};

export const useTurnActions = (): TurnActionsContextValue => {
  const context = useContext(TurnActionsContext);
  if (context === undefined) {
    throw new Error("useTurnActions must be used within TurnActionsProvider");
  }
  return context;
};
