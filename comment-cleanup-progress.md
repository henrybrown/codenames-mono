# Backend Comment Cleanup — Progress

**Started:** 2026-05-15
**Total files:** 187
**Status:** in progress

## How to use this file

- Claude Code ticks each box as the four passes (A, B, C, D) are applied to that file.
- The "notes" after the em-dash captures anything flagged: TODO context-missing, section-divider files >300 lines, borderline comments retained, etc.
- A blank notes section means clean — passes applied, nothing notable.
- This file is the source of truth for what's done. Don't trust git diff stats to tell you what's been processed; the sweep may produce zero-change commits for files with no comment fluff.

## Files

### backend/src/

- [x] `backend/src/index.ts` —

### backend/src/ai/

- [x] `backend/src/ai/index.ts` —

### backend/src/ai/models/

- [x] `backend/src/ai/models/ai-health.ts` —
- [x] `backend/src/ai/models/index.ts` —
- [x] `backend/src/ai/models/llm.service.ts` —

### backend/src/ai/models/providers/

- [x] `backend/src/ai/models/providers/anthropic.provider.ts` —
- [x] `backend/src/ai/models/providers/gemini.provider.ts` —
- [x] `backend/src/ai/models/providers/index.ts` —
- [x] `backend/src/ai/models/providers/ollama.provider.ts` —
- [x] `backend/src/ai/models/providers/openai.provider.ts` —
- [x] `backend/src/ai/models/providers/types.ts` —

### backend/src/ai/move/

- [x] `backend/src/ai/move/get-status.controller.ts` —
- [x] `backend/src/ai/move/get-status.service.ts` —
- [x] `backend/src/ai/move/index.ts` —
- [x] `backend/src/ai/move/trigger-move.controller.ts` —
- [x] `backend/src/ai/move/trigger-move.service.ts` —

### backend/src/ai/pipeline/

- [x] `backend/src/ai/pipeline/codenames-pipeline.ts` —
- [x] `backend/src/ai/pipeline/guesser.ts` —
- [x] `backend/src/ai/pipeline/index.ts` —
- [x] `backend/src/ai/pipeline/spymaster.ts` —

### backend/src/ai/pipeline/prompts/

- [x] `backend/src/ai/pipeline/prompts/guesser.hosted.ts` —
- [x] `backend/src/ai/pipeline/prompts/guesser.local.ts` —
- [x] `backend/src/ai/pipeline/prompts/index.ts` —
- [x] `backend/src/ai/pipeline/prompts/spymaster.hosted.ts` —
- [x] `backend/src/ai/pipeline/prompts/spymaster.local.ts` —

### backend/src/ai/player/

- [x] `backend/src/ai/player/ai-player.service.ts` — 625 lines, kept section dividers per >300 rule
- [x] `backend/src/ai/player/game-event-bus.ts` —
- [x] `backend/src/ai/player/index.ts` —

### backend/src/auth/

- [x] `backend/src/auth/get-user.controller.ts` —
- [x] `backend/src/auth/index.ts` —

### backend/src/auth/errors/

- [x] `backend/src/auth/errors/auth-errors.middleware.ts` —
- [x] `backend/src/auth/errors/auth.errors.ts` —

### backend/src/auth/guest-session/

- [x] `backend/src/auth/guest-session/create-guest-session.controller.ts` — kept "Keep this for debugging, remove in production" — context-light TODO worth flagging
- [x] `backend/src/auth/guest-session/create-guest-session.validation.ts` —
- [x] `backend/src/auth/guest-session/create-guest-user.service.ts` —
- [x] `backend/src/auth/guest-session/guest-login.service.ts` —
- [x] `backend/src/auth/guest-session/username-generator.ts` —

### backend/src/chat/

- [x] `backend/src/chat/game-message.ts` —
- [x] `backend/src/chat/index.ts` —

### backend/src/chat/queries/

- [x] `backend/src/chat/queries/get-messages.controller.ts` —
- [x] `backend/src/chat/queries/get-messages.service.ts` —
- [x] `backend/src/chat/queries/index.ts` —

### backend/src/chat/submit/

- [x] `backend/src/chat/submit/index.ts` —
- [x] `backend/src/chat/submit/submit-message.controller.ts` —
- [x] `backend/src/chat/submit/submit-message.service.ts` —

### backend/src/game/access/

- [x] `backend/src/game/access/blocking-game-action.middleware.ts` —
- [x] `backend/src/game/access/index.ts` —
- [x] `backend/src/game/access/require-game-player.middleware.ts` —
- [x] `backend/src/game/access/require-game-role.middleware.ts` —
- [x] `backend/src/game/access/resolve-acting-player.ts` —
- [x] `backend/src/game/access/types.ts` —

### backend/src/game/gameplay/

- [x] `backend/src/game/gameplay/gameplay-actions.ts` —
- [x] `backend/src/game/gameplay/index.ts` —

### backend/src/game/gameplay/errors/

- [x] `backend/src/game/gameplay/errors/gameplay-errors.middleware.ts` —
- [x] `backend/src/game/gameplay/errors/gameplay.errors.ts` —

### backend/src/game/gameplay/games/

- [x] `backend/src/game/gameplay/games/end-game.action.ts` —
- [x] `backend/src/game/gameplay/games/index.ts` —

### backend/src/game/gameplay/queries/

- [x] `backend/src/game/gameplay/queries/get-events.controller.ts` —
- [x] `backend/src/game/gameplay/queries/get-events.service.ts` —
- [x] `backend/src/game/gameplay/queries/get-game.controller.ts` —
- [x] `backend/src/game/gameplay/queries/get-game.service.ts` —
- [x] `backend/src/game/gameplay/queries/get-players.controller.ts` —
- [x] `backend/src/game/gameplay/queries/get-players.service.ts` —
- [x] `backend/src/game/gameplay/queries/get-turn.controller.ts` —
- [x] `backend/src/game/gameplay/queries/get-turn.service.ts` —
- [x] `backend/src/game/gameplay/queries/index.ts` —

### backend/src/game/gameplay/rounds/

- [x] `backend/src/game/gameplay/rounds/end-round.action.ts` —
- [x] `backend/src/game/gameplay/rounds/end-round.rules.ts` —
- [x] `backend/src/game/gameplay/rounds/index.ts` —
- [x] `backend/src/game/gameplay/rounds/winning-conditions.ts` —

### backend/src/game/gameplay/turns/

- [x] `backend/src/game/gameplay/turns/index.ts` — kept context-light TODO at L11
- [x] `backend/src/game/gameplay/turns/types.ts` —

### backend/src/game/gameplay/turns/clue/

- [x] `backend/src/game/gameplay/turns/clue/give-clue.action.ts` —
- [x] `backend/src/game/gameplay/turns/clue/give-clue.controller.ts` —
- [x] `backend/src/game/gameplay/turns/clue/give-clue.rules.ts` —
- [x] `backend/src/game/gameplay/turns/clue/give-clue.service.ts` —
- [x] `backend/src/game/gameplay/turns/clue/index.ts` —

### backend/src/game/gameplay/turns/end/

- [x] `backend/src/game/gameplay/turns/end/end-turn.action.ts` —
- [x] `backend/src/game/gameplay/turns/end/end-turn.controller.ts` —
- [x] `backend/src/game/gameplay/turns/end/end-turn.rules.ts` —
- [x] `backend/src/game/gameplay/turns/end/end-turn.service.ts` —
- [x] `backend/src/game/gameplay/turns/end/index.ts` —

### backend/src/game/gameplay/turns/guess/

- [x] `backend/src/game/gameplay/turns/guess/index.ts` —
- [x] `backend/src/game/gameplay/turns/guess/make-guess.action.ts` —
- [x] `backend/src/game/gameplay/turns/guess/make-guess.controller.ts` —
- [x] `backend/src/game/gameplay/turns/guess/make-guess.rules.ts` —
- [x] `backend/src/game/gameplay/turns/guess/make-guess.service.ts` —
- [x] `backend/src/game/gameplay/turns/guess/outcome-strategy.ts` —

### backend/src/game/gameplay/turns/shared/

- [x] `backend/src/game/gameplay/turns/shared/present-turn.ts` —

### backend/src/game/gameplay/turns/start/

- [x] `backend/src/game/gameplay/turns/start/index.ts` —
- [x] `backend/src/game/gameplay/turns/start/start-turn.action.ts` —
- [x] `backend/src/game/gameplay/turns/start/start-turn.controller.ts` —
- [x] `backend/src/game/gameplay/turns/start/start-turn.rules.ts` —
- [x] `backend/src/game/gameplay/turns/start/start-turn.service.ts` —

### backend/src/game/lobby/

- [x] `backend/src/game/lobby/index.ts` —
- [x] `backend/src/game/lobby/lobby-actions.ts` —

### backend/src/game/lobby/errors/

- [x] `backend/src/game/lobby/errors/lobby-errors.middleware.ts` —
- [x] `backend/src/game/lobby/errors/lobby.errors.ts` —

### backend/src/game/lobby/players/

- [x] `backend/src/game/lobby/players/add-players.controller.ts` —
- [x] `backend/src/game/lobby/players/add-players.service.ts` —
- [x] `backend/src/game/lobby/players/add-players.validation.ts` —
- [x] `backend/src/game/lobby/players/index.ts` —
- [x] `backend/src/game/lobby/players/modify-batch-players.controller.ts` —
- [x] `backend/src/game/lobby/players/modify-players.service.ts` —
- [x] `backend/src/game/lobby/players/modify-players.validation.ts` —
- [x] `backend/src/game/lobby/players/modify-single-player.controller.ts` —
- [x] `backend/src/game/lobby/players/remove-players.controller.ts` —
- [x] `backend/src/game/lobby/players/remove-players.service.ts` —
- [x] `backend/src/game/lobby/players/remove-players.validation.ts` —

### backend/src/game/lobby/rounds/

- [x] `backend/src/game/lobby/rounds/assign-roles.actions.ts` —
- [x] `backend/src/game/lobby/rounds/assign-roles.rules.ts` —
- [x] `backend/src/game/lobby/rounds/deal-cards.actions.ts` —
- [x] `backend/src/game/lobby/rounds/deal-cards.controller.ts` —
- [x] `backend/src/game/lobby/rounds/deal-cards.rules.ts` —
- [x] `backend/src/game/lobby/rounds/deal-cards.service.ts` —
- [x] `backend/src/game/lobby/rounds/index.ts` —
- [x] `backend/src/game/lobby/rounds/new-round.actions.ts` —
- [x] `backend/src/game/lobby/rounds/new-round.controller.ts` —
- [x] `backend/src/game/lobby/rounds/new-round.rules.ts` —
- [x] `backend/src/game/lobby/rounds/new-round.service.ts` —
- [x] `backend/src/game/lobby/rounds/start-round.actions.ts` —
- [x] `backend/src/game/lobby/rounds/start-round.controller.ts` —
- [x] `backend/src/game/lobby/rounds/start-round.rules.ts` —
- [x] `backend/src/game/lobby/rounds/start-round.service.ts` —

### backend/src/game/lobby/setup/

- [x] `backend/src/game/lobby/setup/create-game.controller.ts` —
- [x] `backend/src/game/lobby/setup/create-game.service.ts` —
- [x] `backend/src/game/lobby/setup/create.game.validation.ts` —
- [x] `backend/src/game/lobby/setup/setup-actions.ts` —

### backend/src/game/lobby/setup/errors/

- [x] `backend/src/game/lobby/setup/errors/setup-errors.middleware.ts` —
- [x] `backend/src/game/lobby/setup/errors/setup.errors.ts` —

### backend/src/game/lobby/start-game/

- [x] `backend/src/game/lobby/start-game/start-game-ai-helper.ts` —
- [x] `backend/src/game/lobby/start-game/start-game.controller.ts` —
- [x] `backend/src/game/lobby/start-game/start-game.service.ts` —
- [x] `backend/src/game/lobby/start-game/start-game.validation.ts` —

### backend/src/game/lobby/state/

- [x] `backend/src/game/lobby/state/helpers.ts` —
- [x] `backend/src/game/lobby/state/index.ts` —
- [x] `backend/src/game/lobby/state/load-lobby-aggregate.ts` —
- [x] `backend/src/game/lobby/state/types.ts` —
- [x] `backend/src/game/lobby/state/validation.ts` —

### backend/src/game/state/

- [x] `backend/src/game/state/index.ts` —
- [x] `backend/src/game/state/load-game-aggregate.ts` —
- [x] `backend/src/game/state/load-turn-aggregate.ts` —
- [x] `backend/src/game/state/types.ts` —
- [x] `backend/src/game/state/validation.ts` — kept "E.g." trailing comment as-is per don't-rewrite rule

### backend/src/game/state/helpers/

- [x] `backend/src/game/state/helpers/aggregate.ts` —
- [x] `backend/src/game/state/helpers/index.ts` —
- [x] `backend/src/game/state/helpers/players.ts` —
- [x] `backend/src/game/state/helpers/turn-phase.ts` —

### backend/src/shared/config/

- [x] `backend/src/shared/config/env.config.ts` —
- [x] `backend/src/shared/config/index.ts` —
- [x] `backend/src/shared/config/jwt.config.ts` —

### backend/src/shared/data/

- [x] `backend/src/shared/data/schema-migrations.ts` —
- [x] `backend/src/shared/data/system-data-loader.ts` —

### backend/src/shared/data-access/

- [x] `backend/src/shared/data-access/transaction-handler.ts` —

### backend/src/shared/data-access/repositories/

- [x] `backend/src/shared/data-access/repositories/ai-pipeline-runs.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/cards.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/game-events.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/game-messages.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/games.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/player-roles.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/players.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/repository.errors.ts` —
- [x] `backend/src/shared/data-access/repositories/rounds.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/sessions.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/teams.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/turns.repository.ts` —
- [x] `backend/src/shared/data-access/repositories/users.repository.ts` —

### backend/src/shared/data/decks/

- [ ] `backend/src/shared/data/decks/index.ts` —

### backend/src/shared/data/enums/

- [ ] `backend/src/shared/data/enums/index.ts` —

### backend/src/shared/db/

- [ ] `backend/src/shared/db/db.postgres.ts` —
- [ ] `backend/src/shared/db/index.ts` —

### backend/src/shared/http/

- [ ] `backend/src/shared/http/result-status.ts` —

### backend/src/shared/http-client/

- [ ] `backend/src/shared/http-client/http-client.ts` —
- [ ] `backend/src/shared/http-client/index.ts` —

### backend/src/shared/http-middleware/

- [ ] `backend/src/shared/http-middleware/add-error-details.helper.ts` —
- [ ] `backend/src/shared/http-middleware/auth.middleware.ts` —
- [ ] `backend/src/shared/http-middleware/controller-helpers.ts` —
- [ ] `backend/src/shared/http-middleware/error-handler.middleware.ts` —
- [ ] `backend/src/shared/http-middleware/feature-error-handler.middleware.ts` —
- [ ] `backend/src/shared/http-middleware/http-logger.middleware.ts` —

### backend/src/shared/logging/

- [ ] `backend/src/shared/logging/create-app-logger.ts` —
- [ ] `backend/src/shared/logging/index.ts` —

### backend/src/shared/websocket/

- [ ] `backend/src/shared/websocket/game-events-emitter.ts` —
- [ ] `backend/src/shared/websocket/index.ts` —
- [ ] `backend/src/shared/websocket/websocket-auth.middleware.ts` —
- [ ] `backend/src/shared/websocket/websocket-events.types.ts` —
- [ ] `backend/src/shared/websocket/websocket-server.ts` —


## Summary (filled in after sweep completes)

- Files processed: 0 / 187
- Comments removed (approximate): -
- Files flagged for follow-up: -
- TODO comments retained without context: -
