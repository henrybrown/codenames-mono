/**
 * The acting player for a gameplay action.
 *
 * Narrow projection of `GamePlayer` — internal id (for attribution and
 * event-creation) and team id (for "is it your turn?" rule checks). The
 * full player record isn't needed at the action layer.
 */
export type ActingPlayer = {
  _id: number;
  _teamId: number;
};
