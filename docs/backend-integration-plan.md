# Gambit integration plan — 22 October 2026

## Existing architecture

Gambit (repository commit ac3b4a86bd1981dcf1d9dbd60af31ead8dbec49f) is a vanilla HTML/CSS/JS demo with eight pages, two global adapters (GAMBIT datasets and Gambit shell) and a local chess rules engine. The real backend is the existing FastAPI application in ../scacchi: Python3.12, SQLite WAL, python-chess, Stockfish19. Production is chess.aura-server.org, Docker loopback8095, Cloudflare Tunnel, cookie sessions and SSE /api/events. API documentation is disabled publicly; the existing route inventory is in api-mapping.md. Tests use unittest/FastAPI TestClient and Chromium.

Existing data, account IDs/passwords, admin/owner hierarchy, Elo ledger and archived games must survive. Production remains usable until a tested candidate is switched in. No new public ports or host security changes are required.

## Decisions fixed by the user's explicit constraints

- Preserve original SVG chess pieces and all MP3 sound bytes/attributions, adapting the new renderers to them. Preserve existing board arrows, cancellable multiple premoves, animations and king result markers.
- Preserve container resources, readonly filesystem, user10001, capability drop, TLS/session/origin/CSP controls, audit retention, analysis quotas, node budgets, persistent review cache and tablebases. Do not use the demo engine for online moves, clocks, bot replies, results or ratings.
- Preserve privacy: ordinary users discover people only by unique friend code; profile/history/presence visibility remains self/friends, with admin directory access. Global search/leaderboards must not reintroduce a player directory. Explicit public tournament participation discloses only necessary event information to the event's participants.
- Existing user/admin/owner map to user/admin/super_admin capabilities; no fictional moderator role is granted. Owner-only operations retain owner checks and password reauthentication where required.
- Same-origin fetch with X-Club:1, HttpOnly/Secure/SameSite=Strict cookie. No new cross-origin auth or long-lived browser token. Existing origin/header protections also cover new endpoints. Same-origin script CSP remains; font files will be served locally.
- Existing accounts keep username/password login. Email is optional for legacy users; email recovery/verification is capability-gated until a private SMTP provider is configured. Watch metadata, creator approvals and follows can be real without pretending a video transport exists; actual live video remains provider-gated until configured.
- Stockfish analysis remains on demand. Continuous preanalysis adds total work for unreviewed games and competes for the2CPU budget. Existing full-strength1thread128MiB review engine/caches stay unchanged; no evaluation is disclosed during human games.

## Feature | Existing backend | Gap | Action | Test

| Feature | Existing backend | Gap | Action | Test |
|---|---|---|---|---|
| Auth | register/login/me/logout/password | email, sessions UI | keep auth; add profile/email/session helpers | legacy login, revoke, forced password |
| Profile/stats | Elo/lobby/archive | display profile, rating history, privacy | derive actual games/ledger; validated profile table | ownership, visibility, no client rating |
| Friends | private code requests/blocks/presence | shell adapter | bind existing endpoints; no public directory | request/accept/block/privacy |
| Chat | SSE hub | persistence/read/report | indexed participant-scoped messages | nonparticipant403, blocked deny, reported-only admin |
| Play | full authoritative games/bots/matchmaking/SSE | new UI is local simulation | bind board/snapshot/revision, retain optimistic moves and premoves | illegal moves, clock/reconnect, ranked results |
| Review | cached Stockfish WDL/labels/opening | display adapter | reuse existing endpoint/queue | labels, best move explanation, no live eval |
| Puzzles | none | attempt validation/rating/progress | migrate catalog + server-held solutions and attempt state | illegal/incorrect/replayed attempts, hints, rating |
| Learn | none | courses/lessons/progress | persisted approved content and user progress | resume, valid completion, admin publication |
| Clubs/forum | none | membership/content/votes/moderation | bounded relational records and ownership checks | join/private membership, unique vote, report |
| Tournaments | game/rating primitives | registrations/pairings/standings | event state machine and authoritative games/results | duplicate entry, pairings, result/standing consistency |
| Watch | none | creator/content/follows/provider | persisted records and approvals; explicit provider state | unauthorized creator, approved URL, empty catalog |
| Notifications | challenge/friend SSE | persistent inbox/settings | user-scoped notifications + SSE invalidation | unread/read, private delivery |
| Admin | users/password/session/role/logs/stats/games | content/moderation/settings panel | separate protected UI, preserve hierarchy and audit | every admin route denies ordinary account |

## Migration and order

1. Discovery and plan (this document), freeze protected-asset/config hashes.
2. Runtime config, API/session/realtime/permission adapters and bootstrap; remove production demo identities and simulated responses.
3. Auth/profile/preferences and authoritative game adapter, retaining old UI as rollback route.
4. Relational additive migration for new content/progress/chat/community/event/notification modules, each with reversible down migration and test seeds kept separate.
5. Wire page interactions and protected admin publishing/moderation. Unconfigured external services show explicit unavailable/setup state, never fake success.
6. Unit/API integration and browser flows at390/768/1024/1440, keyboard, console/network errors; permission audit; benchmark existing analysis and realtime regression checks.
7. Coherent SQLite backup, immutable candidate checks, deploy and public smoke; preserve rollback image and old assets.

Only benign UI preferences (theme/board colors/sound/animation/coordinates) migrate once per account after server validation. Old demo identities, friends, messages, ratings, tournament signups and competitive puzzle progress are discarded as nonauthoritative. Server-confirmed progress resumes from account data; imported UI preferences carry an idempotent migration marker.

## Risks and external decisions

The supplied specification is a platform expansion, not just a CSS change. New modules require actual persistent state and must not reuse demo counts or generated outcomes. SMTP and video transport require provider configuration; the owner confirmed no providers are available: email and Watch remain disabled and hidden. Normal user discovery in the demo conflicts with the explicit security/privacy constraint; the existing friend-code policy takes precedence. Public deployment waits for verified authorization and preserved original-data checks, not for cosmetic completeness alone.
