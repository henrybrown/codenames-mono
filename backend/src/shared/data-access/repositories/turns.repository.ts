import { Kysely } from "kysely";
import { DB } from "../../db/db.types";
import { CODEBREAKER_OUTCOME, TurnOutcome } from "@codenames/shared/types";
import { z } from "zod";
import { UnexpectedRepositoryError } from "./repository.errors";

/** Turn primary-key id. */
export type TurnId = number;
/** Public-facing turn UUID. */
export type PublicId = string;
/** Round primary-key id. */
export type RoundId = number;
/** Team primary-key id. */
export type TeamId = number;
/** Player primary-key id. */
export type PlayerId = number;
/** Card primary-key id. */
export type CardId = number;

/** Runtime guard for the nullable outcome string column. */
export const outcomeSchema = z
  .enum([
    CODEBREAKER_OUTCOME.ASSASSIN_CARD,
    CODEBREAKER_OUTCOME.BYSTANDER_CARD,
    CODEBREAKER_OUTCOME.CORRECT_TEAM_CARD,
    CODEBREAKER_OUTCOME.OTHER_TEAM_CARD,
  ])
  .nullable();

/** Service-layer projection of a clue row. */
export type ClueResult = {
  _id: number;
  _turnId: number;
  word: string;
  number: number;
  createdAt: Date;
};

/** Service-layer projection of a guess row enriched with card word + player name. */
export type GuessResult = {
  _id: number;
  _turnId: number;
  _playerId: number;
  _cardId: number;
  cardWord: string; // ENHANCED: Added card word
  playerName: string;
  outcome: TurnOutcome | null;
  createdAt: Date;
};

/** Service-layer projection of a turn row joined with its clue and guesses. */
export type TurnResult = {
  _id: number;
  publicId: string; // ENHANCED: Added public ID
  _roundId: number;
  _teamId: number;
  _gameId: number; // ENHANCED: Added game ID for auth
  teamName: string;
  status: string;
  guessesRemaining: number;
  createdAt: Date;
  completedAt: Date | null;
  clue?: ClueResult;
  guesses: GuessResult[];
};

/** Input for inserting a clue row. */
export type ClueInput = {
  word: string;
  targetCardCount: number;
};

/** Input for inserting a guess row. */
export type GuessInput = {
  turnId: number;
  playerId: number;
  cardId: number;
  outcome: string;
};

/** Input for inserting a new turn (ACTIVE, with given guesses-remaining). */
export type TurnInput = {
  roundId: number;
  teamId: number;
  guessesRemaining: number;
};

/** Lookup-many signature returning all turns in a round. */
export type TurnsFinder<T extends RoundId> = (
  identifier: T,
) => Promise<TurnResult[]>;

/** Lookup-one signature keyed on either turn id or public id. */
export type TurnFinder<T extends TurnId | PublicId> = (
  identifier: T,
) => Promise<TurnResult | null>;

/** Signature for inserting a clue. */
export type ClueCreator = (
  turnId: TurnId,
  clue: ClueInput,
) => Promise<ClueResult>;

/** Signature for inserting a guess. */
export type GuessCreator = (input: GuessInput) => Promise<GuessResult>;

/** Signature for inserting a turn in ACTIVE state. */
export type TurnCreator = (input: TurnInput) => Promise<TurnResult>;

/** Signature for updating a turn's `guesses_remaining` count. */
export type TurnGuessUpdater = (
  turnId: TurnId,
  guessesRemaining: number,
) => Promise<TurnResult>;

/** Signature for updating a turn's status; sets `completed_at` when COMPLETED. */
export type TurnStatusUpdater = (
  turnId: TurnId,
  status: string,
) => Promise<TurnResult>;

const fetchTurnRelatedData = async (
  db: Kysely<DB>,
  turnIds: number[],
): Promise<Record<number, { clue?: ClueResult; guesses: GuessResult[] }>> => {
  if (turnIds.length === 0) {
    return {};
  }

  const [clues, guesses] = await Promise.all([
    db
      .selectFrom("clues")
      .where("turn_id", "in", turnIds)
      .select(["id", "turn_id", "word", "number", "created_at"])
      .execute(),

    db
      .selectFrom("guesses")
      .innerJoin("players", "guesses.player_id", "players.id")
      .innerJoin("cards", "guesses.card_id", "cards.id")
      .where("guesses.turn_id", "in", turnIds)
      .select([
        "guesses.id",
        "guesses.turn_id",
        "guesses.player_id",
        "guesses.card_id",
        "guesses.outcome",
        "guesses.created_at",
        "players.public_name as playerName",
        "cards.word as cardWord",
      ])
      .orderBy("guesses.created_at", "asc")
      .execute(),
  ]);

  const relatedData: Record<
    number,
    { clue?: ClueResult; guesses: GuessResult[] }
  > = {};

  turnIds.forEach((turnId) => {
    relatedData[turnId] = { guesses: [] };
  });

  clues.forEach((clue) => {
    relatedData[clue.turn_id].clue = {
      _id: clue.id,
      _turnId: clue.turn_id,
      word: clue.word,
      number: clue.number,
      createdAt: clue.created_at,
    };
  });

  guesses.forEach((guess) => {
    relatedData[guess.turn_id].guesses.push({
      _id: guess.id,
      _turnId: guess.turn_id,
      _playerId: guess.player_id,
      _cardId: guess.card_id,
      cardWord: guess.cardWord,
      playerName: guess.playerName,
      outcome: outcomeSchema.parse(guess.outcome),
      createdAt: guess.created_at,
    });
  });

  return relatedData;
};

const getTurnBaseData = (db: Kysely<DB>) =>
  db
    .selectFrom("turns")
    .innerJoin("teams", "turns.team_id", "teams.id")
    .innerJoin("rounds", "turns.round_id", "rounds.id")
    .select([
      "turns.id as _id",
      "turns.public_id as publicId",
      "turns.round_id as _roundId",
      "turns.team_id as _teamId",
      "rounds.game_id as _gameId",
      "teams.team_name as teamName",
      "turns.status",
      "turns.guesses_remaining as guessesRemaining",
      "turns.created_at as createdAt",
      "turns.completed_at as completedAt",
    ]);

/** Builds a creator that inserts a new clue row on the given turn. */
export const createClue =
  (db: Kysely<DB>): ClueCreator =>
  async (turnId, { word, targetCardCount }) => {
    try {
      const clue = await db
        .insertInto("clues")
        .values({
          turn_id: turnId,
          word,
          number: targetCardCount,
          created_at: new Date(),
        })
        .returning(["id", "turn_id", "word", "number", "created_at"])
        .executeTakeFirstOrThrow();

      return {
        _id: clue.id,
        _turnId: clue.turn_id,
        word: clue.word,
        number: clue.number,
        createdAt: clue.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create clue for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/** Builds a creator that inserts a guess and returns it enriched with card word + player name. */
export const createGuess =
  (db: Kysely<DB>): GuessCreator =>
  async ({ turnId, playerId, cardId, outcome }) => {
    try {
      const guess = await db
        .insertInto("guesses")
        .values({
          turn_id: turnId,
          player_id: playerId,
          card_id: cardId,
          outcome,
          created_at: new Date(),
        })
        .returning([
          "id",
          "turn_id",
          "player_id",
          "card_id",
          "outcome",
          "created_at",
        ])
        .executeTakeFirstOrThrow();

      const [player, card] = await Promise.all([
        db
          .selectFrom("players")
          .where("id", "=", playerId)
          .select("public_name")
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("cards")
          .where("id", "=", cardId)
          .select("word")
          .executeTakeFirstOrThrow(),
      ]);

      return {
        _id: guess.id,
        _turnId: guess.turn_id,
        _playerId: guess.player_id,
        _cardId: guess.card_id,
        cardWord: card.word,
        playerName: player.public_name,
        outcome: outcomeSchema.parse(guess.outcome),
        createdAt: guess.created_at,
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create guess for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/** Builds a creator that inserts a turn in ACTIVE state. */
export const createTurn =
  (db: Kysely<DB>): TurnCreator =>
  async ({ roundId, teamId, guessesRemaining }) => {
    try {
      const turn = await db
        .insertInto("turns")
        .values({
          round_id: roundId,
          team_id: teamId,
          guesses_remaining: guessesRemaining,
          status: "ACTIVE",
          created_at: new Date(),
        })
        .returning([
          "id",
          "public_id",
          "round_id",
          "team_id",
          "guesses_remaining",
          "status",
          "created_at",
          "completed_at",
        ])
        .executeTakeFirstOrThrow();

      const [team, round] = await Promise.all([
        db
          .selectFrom("teams")
          .where("id", "=", teamId)
          .select("team_name")
          .executeTakeFirstOrThrow(),
        db
          .selectFrom("rounds")
          .where("id", "=", roundId)
          .select("game_id")
          .executeTakeFirstOrThrow(),
      ]);

      return {
        _id: turn.id,
        publicId: turn.public_id,
        _roundId: turn.round_id,
        _teamId: turn.team_id,
        _gameId: round.game_id,
        teamName: team.team_name,
        status: turn.status,
        guessesRemaining: turn.guesses_remaining,
        createdAt: turn.created_at,
        completedAt: turn.completed_at,
        guesses: [],
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to create turn for round ${roundId}`,
        { cause: error },
      );
    }
  };

/** Builds an updater that sets the remaining-guesses counter on a turn. */
export const updateTurnGuesses =
  (db: Kysely<DB>): TurnGuessUpdater =>
  async (turnId, guessesRemaining) => {
    try {
      await db
        .updateTable("turns")
        .set({
          guesses_remaining: guessesRemaining,
          updated_at: new Date(),
        })
        .where("id", "=", turnId)
        .execute();

      const turn = await getTurnBaseData(db)
        .where("turns.id", "=", turnId)
        .executeTakeFirstOrThrow();

      const relatedData = await fetchTurnRelatedData(db, [turnId]);

      return {
        ...turn,
        ...relatedData[turnId],
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update guesses for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/** Builds an updater that flips a turn's status (sets `completed_at` when COMPLETED). */
export const updateTurnStatus =
  (db: Kysely<DB>): TurnStatusUpdater =>
  async (turnId, status) => {
    try {
      const now = new Date();

      await db
        .updateTable("turns")
        .set({
          status,
          completed_at: status === "COMPLETED" ? now : null,
          updated_at: now,
        })
        .where("id", "=", turnId)
        .execute();

      const turn = await getTurnBaseData(db)
        .where("turns.id", "=", turnId)
        .executeTakeFirstOrThrow();

      const relatedData = await fetchTurnRelatedData(db, [turnId]);

      return {
        ...turn,
        ...relatedData[turnId],
      };
    } catch (error) {
      throw new UnexpectedRepositoryError(
        `Failed to update status for turn ${turnId}`,
        { cause: error },
      );
    }
  };

/** Builds a finder returning all turns for a round, in creation order. */
export const getTurnsByRoundId =
  (db: Kysely<DB>): TurnsFinder<RoundId> =>
  async (roundId) => {
    const turns = await getTurnBaseData(db)
      .where("turns.round_id", "=", roundId)
      .orderBy("turns.created_at", "asc")
      .execute();

    if (turns.length === 0) {
      return [];
    }

    const turnIds = turns.map((turn) => turn._id);
    const relatedData = await fetchTurnRelatedData(db, turnIds);

    return turns.map((turn) => ({
      ...turn,
      ...relatedData[turn._id],
    }));
  };

/** Builds a finder that looks up a single turn by public id. */
export const getTurnByPublicId =
  (db: Kysely<DB>): TurnFinder<PublicId> =>
  async (publicId: string) => {
    const turn = await getTurnBaseData(db)
      .where("turns.public_id", "=", publicId)
      .executeTakeFirst();

    if (!turn) return null;

    const relatedData = await fetchTurnRelatedData(db, [turn._id]);

    return {
      ...turn,
      ...relatedData[turn._id],
    };
  };

/** Builds a finder that looks up a single turn by internal id. */
export const getTurnById =
  (db: Kysely<DB>): TurnFinder<TurnId> =>
  async (turnId) => {
    const turn = await getTurnBaseData(db)
      .where("turns.id", "=", turnId)
      .executeTakeFirst();

    if (!turn) return null;

    const relatedData = await fetchTurnRelatedData(db, [turnId]);

    return {
      ...turn,
      ...relatedData[turnId],
    };
  };
