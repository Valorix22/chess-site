# API mapping

The original authenticated same-origin API is retained. New modules use `/api/platform/` to avoid breaking existing clients.

## Existing API

| Method | Path | Module |
|---|---|---|
| GET | `/api/health` | `server.py` |
| GET | `/api/me` | `server.py` |
| GET | `/api/invite-info` | `server.py` |
| POST | `/api/register` | `server.py` |
| POST | `/api/login` | `server.py` |
| POST | `/api/logout` | `server.py` |
| POST | `/api/password` | `server.py` |
| GET | `/api/invites` | `server.py` |
| POST | `/api/invites` | `server.py` |
| POST | `/api/invites/{invite_id}/revoke` | `server.py` |
| GET | `/api/lobby` | `server.py` |
| POST | `/api/games` | `server.py` |
| POST | `/api/games/{gid}/join` | `server.py` |
| GET | `/api/games/{gid}` | `server.py` |
| POST | `/api/games/{gid}/move` | `server.py` |
| POST | `/api/games/{gid}/resign` | `server.py` |
| POST | `/api/games/{gid}/draw` | `server.py` |
| POST | `/api/games/{gid}/retry-bot` | `server.py` |
| POST | `/api/games/{gid}/analysis` | `server.py` |
| GET | `/api/games/{gid}/pgn` | `server.py` |
| POST | `/api/import` | `server.py` |
| GET | `/api/events` | `live.py` |
| GET | `/api/admin/users` | `live.py` |
| POST | `/api/admin/users/{uid}/status` | `live.py` |
| GET | `/api/members` | `live.py` |
| GET | `/api/challenges` | `live.py` |
| POST | `/api/challenges` | `live.py` |
| POST | `/api/challenges/{cid}/reply` | `live.py` |
| POST | `/api/challenges/{cid}/cancel` | `live.py` |
| GET | `/api/preferences` | `live.py` |
| POST | `/api/preferences` | `live.py` |
| GET | `/api/themes` | `live.py` |
| GET | `/api/themes/{tid}` | `live.py` |
| POST | `/api/themes` | `live.py` |
| GET | `/api/friends` | `community.py` |
| POST | `/api/friends/request` | `community.py` |
| POST | `/api/friends/{uid}/reply` | `community.py` |
| POST | `/api/friends/{uid}/remove` | `community.py` |
| POST | `/api/friends/{uid}/block` | `community.py` |
| POST | `/api/friends/{uid}/unblock` | `community.py` |
| GET | `/api/blocks` | `community.py` |
| POST | `/api/admin/users/{uid}/password` | `community.py` |
| POST | `/api/admin/users/{uid}/sessions/revoke` | `community.py` |
| POST | `/api/admin/users/{uid}/role` | `community.py` |
| GET | `/api/admin/logs` | `community.py` |
| GET | `/api/admin/stats` | `community.py` |
| GET | `/api/admin/games` | `community.py` |
| POST | `/api/admin/games/{gid}/abort` | `community.py` |
| POST | `/api/games/{gid}/analysis/cancel` | `community.py` |
| GET | `/api/matchmaking` | `community.py` |
| POST | `/api/matchmaking/cancel` | `community.py` |
| POST | `/api/matchmaking` | `community.py` |

## New modules

Bootstrap/profile/preferences/sessions; messages/notifications/reports; puzzles/attempts; courses/lessons; clubs/members/messages; forum/threads/replies/votes; tournaments/registrations/rounds/standings; watch/creator/follows; administrative content/settings/moderation. Final contracts are documented by the route inventory and tests.

## Added platform routes

All requests use the existing cookie session and mutation header `X-Club:1`. API docs stay disabled publicly. Lists are bounded and ownership is checked on the server; the browser never supplies a trusted rating/result/role.

| Method | Route | Backend |
|---|---|---|
| GET | `/api/platform/config` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/bootstrap` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/profile/{who}` | [backend/gambit.py](../backend/gambit.py) |
| PATCH | `/api/platform/profile` | [backend/gambit.py](../backend/gambit.py) |
| PATCH | `/api/platform/preferences` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/sessions` | [backend/gambit.py](../backend/gambit.py) |
| DELETE | `/api/platform/sessions/{sid}` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/profile/{who}/rating-history` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/notifications` | [backend/gambit.py](../backend/gambit.py) |
| POST | `/api/platform/notifications/read` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/messages/{channel}/{scope}` | [backend/gambit.py](../backend/gambit.py) |
| POST | `/api/platform/messages/{channel}/{scope}` | [backend/gambit.py](../backend/gambit.py) |
| POST | `/api/platform/messages/{channel}/{scope}/read` | [backend/gambit.py](../backend/gambit.py) |
| POST | `/api/platform/reports` | [backend/gambit.py](../backend/gambit.py) |
| POST | `/api/platform/admin/starter-content` | [backend/gambit.py](../backend/gambit.py) |
| GET | `/api/platform/admin/metrics` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| GET | `/api/platform/admin/users/{user_id}` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/admin/users/{user_id}/sanction` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/admin/users/{user_id}/creator` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| GET | `/api/platform/admin/reports` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/admin/reports/{rid}` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| GET | `/api/platform/admin/settings` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| PATCH | `/api/platform/admin/settings` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/admin/notifications` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/admin/games/{gid}/note` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/admin/games/{gid}/void` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| GET | `/api/platform/me/export` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/auth/forgot-password` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| POST | `/api/platform/auth/reset-password` | [backend/gambit_admin.py](../backend/gambit_admin.py) |
| GET | `/api/platform/content/{kind}` | [backend/gambit_content.py](../backend/gambit_content.py) |
| GET | `/api/platform/content/item/{cid}` | [backend/gambit_content.py](../backend/gambit_content.py) |
| POST | `/api/platform/content/{kind}` | [backend/gambit_content.py](../backend/gambit_content.py) |
| PATCH | `/api/platform/content/item/{cid}` | [backend/gambit_content.py](../backend/gambit_content.py) |
| POST | `/api/platform/content/item/{cid}/membership` | [backend/gambit_content.py](../backend/gambit_content.py) |
| GET | `/api/platform/content/item/{cid}/members` | [backend/gambit_content.py](../backend/gambit_content.py) |
| POST | `/api/platform/content/item/{cid}/vote` | [backend/gambit_content.py](../backend/gambit_content.py) |
| GET | `/api/platform/tournaments/{cid}` | [backend/gambit_content.py](../backend/gambit_content.py) |
| POST | `/api/platform/tournaments/{cid}/control` | [backend/gambit_content.py](../backend/gambit_content.py) |
| GET | `/api/platform/tournaments/{cid}/calendar.ics` | [backend/gambit_content.py](../backend/gambit_content.py) |
| GET | `/api/platform/search` | [backend/gambit_content.py](../backend/gambit_content.py) |
| GET | `/api/platform/leaderboards` | [backend/gambit_content.py](../backend/gambit_content.py) |
| POST | `/api/platform/creator/apply` | [backend/gambit_content.py](../backend/gambit_content.py) |
| POST | `/api/platform/games/{gid}/undo` | [backend/gambit_games.py](../backend/gambit_games.py) |
| POST | `/api/platform/games/{gid}/hint` | [backend/gambit_games.py](../backend/gambit_games.py) |
| GET | `/api/platform/hints/{jid}` | [backend/gambit_games.py](../backend/gambit_games.py) |
| POST | `/api/platform/games/{gid}/decline-draw` | [backend/gambit_games.py](../backend/gambit_games.py) |
| POST | `/api/platform/games/{gid}/abort` | [backend/gambit_games.py](../backend/gambit_games.py) |
| POST | `/api/platform/games/{gid}/rematch` | [backend/gambit_games.py](../backend/gambit_games.py) |
| POST | `/api/platform/games/{gid}/visibility` | [backend/gambit_games.py](../backend/gambit_games.py) |
| GET | `/api/platform/spectate/{gid}` | [backend/gambit_games.py](../backend/gambit_games.py) |
| GET | `/api/platform/puzzles/progress` | [backend/gambit_training.py](../backend/gambit_training.py) |
| GET | `/api/platform/puzzles` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/puzzles/{cid}/favorite` | [backend/gambit_training.py](../backend/gambit_training.py) |
| GET | `/api/platform/puzzles/daily` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/puzzles/{cid}/attempts` | [backend/gambit_training.py](../backend/gambit_training.py) |
| GET | `/api/platform/attempts/{aid}` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/attempts/{aid}/move` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/attempts/{aid}/hint` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/attempts/{aid}/give-up` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/puzzle-sessions` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/puzzle-sessions/{cid}/join` | [backend/gambit_training.py](../backend/gambit_training.py) |
| GET | `/api/platform/puzzle-sessions/{cid}` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/lessons/{cid}/progress` | [backend/gambit_training.py](../backend/gambit_training.py) |
| GET | `/api/platform/openings` | [backend/gambit_training.py](../backend/gambit_training.py) |
| GET | `/api/platform/puzzle-sets` | [backend/gambit_training.py](../backend/gambit_training.py) |
| POST | `/api/platform/puzzle-sets` | [backend/gambit_training.py](../backend/gambit_training.py) |
| DELETE | `/api/platform/puzzle-sets/{cid}` | [backend/gambit_training.py](../backend/gambit_training.py) |

Frontend mapping: `boot/session/app` → auth/bootstrap/friends/challenges/preferences; `home/profile` → profile/lobby/ratings; `play` → native games/events/review plus casual helpers; `puzzles` → server attempts/sessions/sets; `learn` → content/progress/openings; `community` → content/memberships/messages/leaderboards; `tournaments` → content/registrations/control/standings/calendar; `admin` → native account/log/game administration and platform content/reports/settings.

Eight pages and `/admin.html` are registered explicitly. `/gambit/*` is blocked to prevent the root static mount from bypassing page authorization or inactive providers. `/assets/` serves only public frontend assets. `/classic/` serves the old interface. SMTP and Watch return404while inactive; normal users receive403on admin APIs and401on expired sessions.
