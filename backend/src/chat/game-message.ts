/**
 * Shared types and mappers for chat messages.
 *
 * Both get-messages and submit-message produce the same API-shaped
 * GameMessage. This module owns the type and the row->API mapper so
 * the two sub-features stay in sync.
 */
import type { GameMessageData } from "@backend/shared/data-access/repositories/game-messages.repository";

/**
 * Message as returned to API consumers. Enriched with player/team
 * info that's not on the DB row itself (player.publicId, publicName,
 * teamName) — those come from the loaded GameAggregate.
 */
export interface GameMessage {
  id: string;
  gameId: string;
  /** Player public ID (UUID). Null for SYSTEM/AI messages. */
  playerId: string | null;
  playerName: string | null;
  teamName: string | null;
  teamOnly: boolean;
  messageType: "CHAT" | "AI_THINKING" | "SYSTEM";
  content: string;
  createdAt: string;
}

/**
 * Player info needed to enrich a DB row into an API message.
 * Sourced from the loaded GameAggregate's player list.
 */
export interface MessageAuthorInfo {
  publicId: string;
  publicName: string;
  teamName: string;
}

/**
 * Convert a DB game_messages row + (optional) player info into the
 * API-shaped GameMessage.
 *
 * Pass `gameId` separately because the DB row stores the internal
 * numeric game id, but the API uses the public string id.
 */
export const toGameMessage = (
  row: GameMessageData,
  gameId: string,
  author: MessageAuthorInfo | null,
): GameMessage => ({
  id: row.id,
  gameId,
  playerId: author?.publicId ?? null,
  playerName: author?.publicName ?? null,
  teamName: author?.teamName ?? null,
  teamOnly: row.team_only,
  messageType: row.message_type,
  content: row.content,
  createdAt: row.created_at.toISOString(),
});
