# Gambit — a complete chess club in your browser

Gambit is a polished, front-end-only chess website inspired by the best parts of Chess.com and Lichess. It includes a real rules-complete chess engine, an interactive board, a puzzle trainer, lessons, live streams, community features, tournaments, profiles and a full app shell with friends, chat, notifications and settings.

Everything runs as static files. There is no build step and no backend — open the site with any static file server and it just works.

## Pages

| Page | What is inside |
| --- | --- |
| `index.html` | Home dashboard with hero board, play modes, daily puzzle, lessons, live streams, tournaments and a social sidebar. |
| `play.html` | Play against the computer or locally. Legal move generation, clocks, bot levels, hints, undo, draw/resign, move list, PGN copy and post-game review. |
| `puzzles.html` | Puzzle trainer with verified tactics, streak tracking, hints, solutions, keypad shortcuts, puzzle rush and battle modes. |
| `learn.html` | Courses, interactive lessons on a board, opening explorer and endgame studies. |
| `watch.html` | Featured broadcast board, live stream grid, broadcast schedule, VOD library, stream modals and live chat. |
| `community.html` | Friends, clubs, forums and leaderboards, plus friend requests, club creation, thread posting and clubhouse chat. |
| `profile.html` | Player profile with rating graph, game history, achievements, performance stats, editable profile and friend list. |
| `tournaments.html` | Featured arena countdown, tournament browser with filters, registration, event details, schedule, creation flow and calendar export. |

## Highlights

- **A real chess engine.** Full legal move generation, castling, en passant, promotion, SAN, checkmate, stalemate, FEN loading and a simple AI opponent. The engine was validated against standard perft positions.
- **A reusable board component.** Click or drag pieces, legal-move hints, promotion picker, last-move and check highlights, coordinates, board themes and orientation flipping.
- **A shared app shell.** Header and footer, notifications, friends drawer, chat, command palette (`Ctrl/Cmd + K`), global search, theme switcher, settings, auth modal, challenge modal and toasts.
- **Persistent demo state.** User profile, settings, chats, friends, puzzle progress, tournament registrations and custom tournaments are stored in `localStorage`.
- **Polished dark-first design.** Emerald accent, optional light theme, custom board palettes, responsive layouts and no external image dependencies — all visuals are CSS, SVG or Unicode.

## Run it

From the project folder:

```bash
python3 -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

You can use the demo account that is signed in by default, or use the **Log in** flow from the header. Signing in with any name starts a fresh guest-style demo session; everything is local to your browser.

## Keyboard shortcuts

- `Ctrl/Cmd + K` — open the command palette
- `H` — hint in the puzzle trainer
- `R` — reset a puzzle
- `N` — next puzzle after solving
- `Esc` — close modals, drawers and the command palette

## Project structure

```
.
├── index.html
├── play.html
├── puzzles.html
├── learn.html
├── watch.html
├── community.html
├── profile.html
├── tournaments.html
├── assets/
│   ├── css/
│   │   ├── base.css        # tokens, shell, components, modals, board
│   │   └── pages.css       # page-specific layouts and responsive rules
│   └── js/
│       ├── engine.js       # chess rules, move generation, SAN, AI
│       ├── board.js        # reusable interactive board
│       ├── data.js         # demo users, friends, puzzles, courses, streams…
│       ├── app.js          # shared shell, modals, friends, chat, settings
│       ├── home.js
│       ├── play.js
│       ├── puzzles.js
│       ├── learn.js
│       ├── watch.js
│       ├── community.js
│       ├── profile.js
│       └── tournaments.js
└── README.md
```

## Notes

- This is a front-end demo. Multiplayer, payments, real streaming and server-side accounts are simulated locally.
- Images are intentionally avoided so the site can run offline; avatars are generated from initials and gradients, and all icons are inline SVG.
- Sound effects are generated with the Web Audio API and respect the sound setting.
