/**
 * The acting player for a gameplay action.
 *
 * Narrow projection of GamePlayer — actions only need internal id (for
 * attribution / event-creation) and team id (for game-rule checks like
 * "your team's turn"). Resolved by the controller from the loaded
 * GameAggregate and passed explicitly down through the call chain
 * (service → handler → ops → action).
 */
export type ActingPlayer = {
  _id: number;
  _teamId: number;
};
