/**
 * Test fixture factories for building game state objects.
 * All use spread-based overrides for concise test setup.
 */

import type { GameAggregate, Player, Turn, Card, Round } from "@backend/game/state/types";

let idCounter = 1;
const nextId = () => idCounter++;

export const resetIds = () => { idCounter = 1; };

export const buildPlayer = (overrides: Partial<Player> = {}): Player => ({
  _id: nextId(),
  publicId: `player-${idCounter}`,
  _userId: 100 + idCounter,
  _gameId: 1,
  _teamId: 1,
  teamName: "Red",
  statusId: 1,
  publicName: `Player ${idCounter}`,
  role: "CODEMASTER",
  isAi: false,
  ...overrides,
});

export const buildCard = (overrides: Partial<Card> = {}): Card => ({
  _id: nextId(),
  _roundId: 1,
  _teamId: 1,
  teamName: "Red",
  word: `WORD${idCounter}`,
  cardType: "TEAM",
  selected: false,
  ...overrides,
});

export const buildTurn = (overrides: Partial<Turn> = {}): Turn => ({
  _id: nextId(),
  publicId: `turn-uuid-${idCounter}`,
  _roundId: 1,
  _teamId: 1,
  teamName: "Red",
  status: "ACTIVE",
  guessesRemaining: 3,
  createdAt: new Date("2025-01-01"),
  completedAt: null,
  guesses: [],
  ...overrides,
});

export const buildRound = (overrides: Partial<Round> = {}): Round => ({
  _id: nextId(),
  number: 1,
  status: "IN_PROGRESS",
  _winningTeamId: null,
  winningTeamName: null,
  cards: [],
  turns: [],
  players: [],
  createdAt: new Date("2025-01-01"),
  ...overrides,
});

export const buildGameAggregate = (overrides: Partial<GameAggregate> = {}): GameAggregate => {
  const redCM = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEMASTER", publicName: "Alice" });
  const redCB = buildPlayer({ _teamId: 1, teamName: "Red", role: "CODEBREAKER", publicName: "Bob" });
  const blueCM = buildPlayer({ _teamId: 2, teamName: "Blue", role: "CODEMASTER", publicName: "Charlie" });
  const blueCB = buildPlayer({ _teamId: 2, teamName: "Blue", role: "CODEBREAKER", publicName: "Diana" });

  const cards = [
    buildCard({ _teamId: 1, teamName: "Red", word: "APPLE" }),
    buildCard({ _teamId: 1, teamName: "Red", word: "BANANA" }),
    buildCard({ _teamId: 2, teamName: "Blue", word: "CAR" }),
    buildCard({ _teamId: 2, teamName: "Blue", word: "DOOR" }),
    buildCard({ _teamId: null, teamName: null, word: "EMPTY", cardType: "BYSTANDER" }),
    buildCard({ _teamId: null, teamName: null, word: "KILLER", cardType: "ASSASSIN" }),
  ];

  const turn = buildTurn({ _teamId: 1, teamName: "Red" });

  const players = [redCM, redCB, blueCM, blueCB];

  return {
    _id: 1,
    public_id: "game-public-id",
    status: "IN_PROGRESS",
    game_type: "SINGLE_DEVICE",
    game_format: "QUICK",
    aiMode: false,
    teams: [
      { _id: 1, _gameId: 1, teamName: "Red", players: [redCM, redCB] },
      { _id: 2, _gameId: 1, teamName: "Blue", players: [blueCM, blueCB] },
    ],
    currentRound: buildRound({
      cards,
      turns: [turn],
      players,
    }),
    historicalRounds: [],
    createdAt: new Date("2025-01-01"),
    updatedAt: null,
    ...overrides,
  } as GameAggregate;
};
