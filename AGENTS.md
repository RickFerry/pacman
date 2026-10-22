# AGENTS.md

Vanilla JS Pac-Man clone (HTML/CSS/JS). No build, no dependencies, no bundler, no package.json, no tests.

## Run

- Open `src/index.html` directly in a browser (file:// works; relative `css/` and `js/` paths).
- Or serve the `src/` dir: `python3 -m http.server -d src 8000` → http://localhost:8000.
- No lint/typecheck/test tooling. Don't invent a toolchain; the browser is the final verifier. No git repo either.

## Structure

- `src/index.html` — canvas 560×620, loads scripts in this order: `maze.js` → `game.js` → `render.js` → `main.js`. All share globals via `window`; order matters.
- `src/js/maze.js` — pristine 28×31 maze (`MAZE`), `TUNNEL_ROW=14`, `PACMAN_START`, `GHOST_STARTS`. Exports globals; never mutate `MAZE` (games copy it).
- `src/js/game.js` — state + rules: `createGame()`, `update(game)`, movement, ghost AI, collisions. Constants `PACMAN_SPEED=0.125`, `GHOST_SPEED=0.1`.
- `src/js/render.js` — canvas drawing (`draw(ctx, game, frame)`), `TILE=20`. Canvas size must stay 560×620 to match the maze.
- `src/js/main.js` — rAF loop, keyboard, overlays; owns `game`/`frame`.
- `src/css/style.css` — layout for `#game-wrap` (560×620).

## Conventions

- Comments, HUD text, overlay text and README are in **Spanish**; match the language.
- Script modules communicate only through globals (`window.*`); adding a file means adding a `<script>` tag in `index.html` in dependency order.
- Tile values: `1` wall, `2` dot, `3` pen door, `0` empty. Door (`3`) blocks Pac-Man but not ghosts (`isWall`).
- `createGame()` copies `MAZE` into `game.grid`; eating sets cells to `0` there, never in `MAZE`.
- State is one of `'start' | 'playing' | 'won' | 'lost'`.
- Tunnel wrap only happens on `TUNNEL_ROW` (row 14) via `wrapTunnel`.

## Gotchas

- Script load order is load-bearing: `game.js` needs `MAZE*` globals from `maze.js`; `render.js` uses `DIRS` from `game.js`; `main.js` uses all.
- Ghosts decide direction only when aligned to a cell; hunter chases Pac-Man (Manhattan), the other picks randomly (never reverses unless dead-ended).
- `decideGhost` is called inside `moveGhost` at alignment, using `g.x/g.y` before rounding; don't move that call.
- Eating a dot and scoring happen in `movePacman` only when aligned; `dotsRemaining` drives win.
- Collision resets positions only (`resetPositions`); score/lives/grid persist. Lives decrement can chain into `'lost'`.
- `aligned()` threshold is `1e-3`; speeds are chosen to land on cells every 8/10 frames — keep them in sync if changed.

## Workflow

- Project uses OpenSpec (schema `spec-driven`): `openspec/config.yaml`, commands in `.opencode/commands/opsx-*.md`. Use `openspec` CLI for changes; planning artifacts live under `openspec/`. No main specs exist yet.
- README states the project exists to learn spec-driven development; prefer OpenSpec flow over ad-hoc edits when the user asks for features.
