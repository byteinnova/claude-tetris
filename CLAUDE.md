# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step. Open directly or serve:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
# or
npx serve .
```

## Architecture

Single-file game logic in `game.js` (~300 lines, no dependencies, no bundler):

- **Board**: `ROWS×COLS` matrix (`board[r][c]` = 0 or color index 1–7).
- **Piece object**: `{ type, shape, x, y }` where `shape` is a 2D matrix.
- **Rotation**: `rotateCW` = transpose + reverse rows. `tryRotate` applies wall kicks `[0, -1, 1, -2, 2]` before giving up.
- **Collision**: `collide(shape, ox, oy)` — bounds check + board overlap.
- **Game loop**: `requestAnimationFrame`-based; accumulates `dropAccum` against `dropInterval`; calls `lockPiece → merge → clearLines → spawn`.
- **Speed formula**: `dropInterval = max(100, 1000 − (level−1) × 90)` ms.
- **Ghost piece**: `ghostY()` projects current piece straight down; drawn at `alpha=0.2`.

## Key tunable constants (top of `game.js`)

| Constant | Default | Note |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | Must match `<canvas>` width/height in `index.html` (`COLS×BLOCK` / `ROWS×BLOCK`) |
| `BLOCK` | 30 | Pixel size per cell |
| `LINE_SCORES` | `[0,100,300,500,800]` | Points for 1–4 lines, multiplied by level |
