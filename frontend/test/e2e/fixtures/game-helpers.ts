import { type APIRequestContext } from "@playwright/test";

const API = "http://localhost:3000/api";

/** Create a guest session and return the auth cookie string */
export async function createGuestSession(request: APIRequestContext) {
  const res = await request.post(`${API}/auth/guests`);
  const body = await res.json();
  if (!body.success) throw new Error("Failed to create guest session");

  /** Extract auth cookie from response headers */
  const setCookie = res.headers()["set-cookie"] ?? "";
  const authToken = setCookie.match(/authToken=([^;]+)/)?.[1];
  return {
    user: body.data.user,
    token: authToken ?? body.data.session?.token,
    cookie: `authToken=${authToken}`,
  };
}

/** Create a new game */
export async function createGame(
  request: APIRequestContext,
  cookie: string,
  opts: { gameType: string; gameFormat?: string; aiMode?: boolean },
) {
  const res = await request.post(`${API}/games`, {
    headers: { cookie },
    data: {
      gameType: opts.gameType,
      gameFormat: opts.gameFormat ?? "QUICK",
      aiMode: opts.aiMode ?? false,
    },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to create game: ${JSON.stringify(body)}`);
  return body.data.game as { publicId: string };
}

/** Add players to a game (sends one at a time — multi-device requires this) */
export async function addPlayers(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  players: { playerName: string; teamName: string }[],
) {
  for (const player of players) {
    const res = await request.post(`${API}/games/${gameId}/players`, {
      headers: { cookie },
      data: player,
    });
    const body = await res.json();
    if (!body.success) throw new Error(`Failed to add player ${player.playerName}: ${JSON.stringify(body)}`);
  }
}

/** Start the game (transition from LOBBY to IN_PROGRESS) */
export async function startGame(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
) {
  const res = await request.post(`${API}/games/${gameId}/start`, {
    headers: { cookie },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to start game: ${JSON.stringify(body)}`);
  return body.data;
}

/** Create a new round */
export async function createRound(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
) {
  const res = await request.post(`${API}/games/${gameId}/rounds`, {
    headers: { cookie },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to create round: ${JSON.stringify(body)}`);
  return body.data;
}

/** Deal cards for a round */
export async function dealCards(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  roundNumber: number,
) {
  const res = await request.post(`${API}/games/${gameId}/rounds/${roundNumber}/deal`, {
    headers: { cookie },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to deal cards: ${JSON.stringify(body)}`);
  return body.data;
}

/** Start a round */
export async function startRound(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  roundNumber: number,
) {
  const res = await request.post(`${API}/games/${gameId}/rounds/${roundNumber}/start`, {
    headers: { cookie },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to start round: ${JSON.stringify(body)}`);
  return body.data;
}

/** Get full game state */
export async function getGameState(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  opts?: { role?: string; playerId?: string },
) {
  const params = new URLSearchParams();
  if (opts?.role) params.set("role", opts.role);
  if (opts?.playerId) params.set("playerId", opts.playerId);
  const qs = params.toString() ? `?${params}` : "";

  const res = await request.get(`${API}/games/${gameId}${qs}`, {
    headers: { cookie },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to get game state: ${JSON.stringify(body)}`);
  return body.data.game;
}

/** Give a clue. Single device uses `role`, multi-device uses `playerId`. */
export async function giveClue(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  roundNumber: number,
  data: { word: string; targetCardCount: number; role?: string; playerId?: string },
) {
  const res = await request.post(`${API}/games/${gameId}/rounds/${roundNumber}/clues`, {
    headers: { cookie },
    data,
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to give clue: ${JSON.stringify(body)}`);
  return body.data;
}

/** Make a guess. Single device uses `role`, multi-device uses `playerId`. */
export async function makeGuess(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  roundNumber: number,
  data: { cardWord: string; role?: string; playerId?: string },
) {
  const res = await request.post(`${API}/games/${gameId}/rounds/${roundNumber}/guesses`, {
    headers: { cookie },
    data,
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to make guess: ${JSON.stringify(body)}`);
  return body.data;
}

/** Post a chat message to a game */
export async function postMessage(
  request: APIRequestContext,
  cookie: string,
  gameId: string,
  data: { content: string; teamOnly?: boolean },
) {
  const res = await request.post(`${API}/games/${gameId}/messages`, {
    headers: { cookie },
    data: { content: data.content, teamOnly: data.teamOnly ?? false },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to post message: ${JSON.stringify(body)}`);
  return body.data;
}

/**
 * Add a single player via a fresh guest session (needed for multi-device).
 */
export async function addPlayerWithNewSession(
  request: APIRequestContext,
  gameId: string,
  player: { playerName: string; teamName: string },
) {
  const { cookie } = await createGuestSession(request);
  const res = await request.post(`${API}/games/${gameId}/players`, {
    headers: { cookie },
    data: player,
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to add player ${player.playerName}: ${JSON.stringify(body)}`);
  return { cookie };
}

/**
 * Set up a game ready for gameplay via API (skip UI lobby).
 * For multi-device, each player gets their own guest session.
 * Returns game ID and card data.
 */
export async function setupGameViaApi(
  request: APIRequestContext,
  opts: { gameType?: string; gameFormat?: string } = {},
) {
  const gameType = opts.gameType ?? "SINGLE_DEVICE";
  const isMulti = gameType === "MULTI_DEVICE";

  const { cookie } = await createGuestSession(request);
  const game = await createGame(request, cookie, {
    gameType,
    gameFormat: opts.gameFormat ?? "QUICK",
  });

  const players = [
    { playerName: "Alice", teamName: "Team Red" },
    { playerName: "Bob", teamName: "Team Red" },
    { playerName: "Charlie", teamName: "Team Blue" },
    { playerName: "Diana", teamName: "Team Blue" },
  ];

  /**
   * For multi-device: creator must also be a player to perform game ops.
   * Add creator as the first player, then add remaining 3 with new sessions.
   */
  if (isMulti) {
    /** Creator joins as first player */
    const res = await request.post(`${API}/games/${game.publicId}/players`, {
      headers: { cookie },
      data: players[0],
    });
    const body = await res.json();
    if (!body.success) throw new Error(`Failed to add creator player: ${JSON.stringify(body)}`);

    /** Remaining players each get their own session */
    for (const player of players.slice(1)) {
      await addPlayerWithNewSession(request, game.publicId, player);
    }
  } else {
    await addPlayers(request, cookie, game.publicId, players);
  }

  await startGame(request, cookie, game.publicId);
  await createRound(request, cookie, game.publicId); // auto-deals cards
  await startRound(request, cookie, game.publicId, 1);

  /** For single-device, pass role to get perspective. For multi-device, the server uses the auth token. */
  const stateOpts = isMulti ? {} : { role: "CODEMASTER" };
  const gameState = await getGameState(request, cookie, game.publicId, stateOpts);
  const playerId = gameState.playerContext?.publicId;

  return { gameId: game.publicId, cookie, gameState, playerId, gameType };
}

/**
 * Multi-device setup that returns each player's auth cookie alongside their
 * role for the current round.
 *
 * Roles are randomised per round; this resolves the role -> cookie mapping by
 * inspecting the loaded game state. Use when a test needs to act as a
 * specific role (e.g. the codemaster on the first team) and only the API
 * helpers — not a logged-in browser — drive the gameplay.
 */
export async function setupMultiDeviceGame(request: APIRequestContext) {
  const playerSpecs = [
    { playerName: "Alice", teamName: "Team Red" },
    { playerName: "Bob", teamName: "Team Red" },
    { playerName: "Charlie", teamName: "Team Blue" },
    { playerName: "Diana", teamName: "Team Blue" },
  ];

  const { cookie: hostCookie } = await createGuestSession(request);
  const game = await createGame(request, hostCookie, {
    gameType: "MULTI_DEVICE",
    gameFormat: "QUICK",
  });

  /** Host = Alice on Team Red */
  const res = await request.post(`${API}/games/${game.publicId}/players`, {
    headers: { cookie: hostCookie },
    data: playerSpecs[0],
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Failed to add host player: ${JSON.stringify(body)}`);

  const cookiesByName: Record<string, string> = { Alice: hostCookie };
  for (const spec of playerSpecs.slice(1)) {
    const { cookie } = await addPlayerWithNewSession(request, game.publicId, spec);
    cookiesByName[spec.playerName] = cookie;
  }

  await startGame(request, hostCookie, game.publicId);
  await createRound(request, hostCookie, game.publicId);
  await startRound(request, hostCookie, game.publicId, 1);

  /** GET /games/:id doesn't return currentRound.players — fetch separately
   *  from the players-by-game endpoint which carries role for the current
   *  round. */
  const playersRes = await request.get(`${API}/games/${game.publicId}/players`, {
    headers: { cookie: hostCookie },
  });
  const playersBody = await playersRes.json();
  if (!playersBody.success) {
    throw new Error(`Failed to fetch players: ${JSON.stringify(playersBody)}`);
  }
  const roundPlayers: any[] = playersBody.data.players;

  const players = roundPlayers.map((p) => ({
    publicId: p.publicId,
    name: p.name,
    teamName: p.teamName,
    role: p.role as "CODEMASTER" | "CODEBREAKER",
    cookie: cookiesByName[p.name],
  }));

  /** Fetch the game state from a codemaster's perspective so cards carry
   *  cardType / teamName — required for tests that look up specific cards
   *  (bystander, assassin, team-X) by predicate. */
  const anyCodemaster = players.find((p) => p.role === "CODEMASTER");
  if (!anyCodemaster) throw new Error("No codemaster found in multi-device setup");
  const gameState = await getGameState(request, anyCodemaster.cookie, game.publicId, {
    playerId: anyCodemaster.publicId,
  });

  return { gameId: game.publicId, hostCookie, gameState, players };
}
