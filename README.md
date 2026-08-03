# 2048 AI Solver

An **expectimax** AI that plays the game [2048](https://en.wikipedia.org/wiki/2048_(video_game)) — a single, dependency-free JavaScript file you can run in the browser, in a Web Worker, or in Node. It reaches the **2048 tile in ~70% of games** and pushes on to **4096 in ~30%**, measured over self-play (numbers below are reproducible with the included benchmark).

This is the exact engine behind the browser autoplay at **[lkforge.com/games/2048](https://lkforge.com/games/2048/)**.

**▶ Live demo (watch the AI play):** https://lucian-devops.github.io/2048-ai-solver/

## Why expectimax, not an LLM?

2048 is a game *against chance*: you choose a direction, then the game drops a random tile (a **2** with 90% probability, a **4** with 10%) on a random empty square. That makes it a search problem with a clear correct tool — not something you'd hand to a language model, which predicts text tokens rather than searching a game tree.

- **Minimax** assumes an adversary playing the *worst* tile against you — too defensive, because 2048's tiles are random, not malicious.
- **Expectimax** *averages* over the chance nodes weighted by probability, which models the real game. This is the textbook split: minimax for chess, expectimax for games against nature.

## How it works

The search alternates two layer types:

- **Max layer** — try all four moves, keep the best.
- **Chance layer** — for each empty cell, place a 2 (p=0.9) and a 4 (p=0.1), and average the resulting scores.

Search depth adapts to how full the board is (3 when there's lots of space, up to 5 when it's tight). On crowded boards the chance layer samples up to 6 empty cells rather than all of them, to keep the branching factor sane.

### The heuristic

A board the search can't play to the end is scored with three terms:

```
score = positional + empties × 200000 + smoothness × 4000
```

- **Positional (corner-snake)** — each cell has a fixed rank in a boustrophedon "snake" anchored at the bottom-right corner; a tile's value is multiplied by `4^rank`. Because the weights grow as powers of four, one big tile in the corner dominates, so the search is rewarded for stacking value into that corner in descending order. This monotonicity does more work than raw search depth.
- **Empty cells** — a flat, deliberately huge bonus (`200000`) per blank square. Open space keeps future moves legal, so a nearly-full board scores as almost worthless regardless of tile size.
- **Smoothness** — for each adjacent pair, subtract `|log2(a) − log2(b)|`, so mergeable neighbours are cheap and a big tile stranded next to a small one is punished.

## Measured performance

From a 250-game headless self-play run:

| Who / what | Top tile | Notes |
|---|---|---|
| Theoretical maximum | 131,072 | Absolute ceiling on a 4×4 board |
| Best research AI (2025) | 65,536 | Reached ~8.4% of games; median score ~820,000 |
| **This solver** | **4,096** | **~30% of games; reaches 2048 ~70% of the time** |
| Most human players | 2,048 | The original win condition |

Research-AI figures are from a 2025 expectiminimax-plus-tablebase benchmark. This solver's figures are from our own self-play run. Reach rate is a *distribution*, not a fixed value — expect a few points of variance between runs, especially at small game counts.

## Usage

### Node

```js
const K = require('./solver');

// Best move for a board (16-length array, row-major, 0 = empty):
const board = [
  2, 0, 0, 0,
  4, 2, 0, 0,
  8, 4, 0, 0,
  16, 8, 2, 0,
];
console.log(K.bestMove(board)); // 'down' | 'right' | 'left' | 'up' | null

// Play a full game headless:
console.log(K.selfPlayGame()); // { maxTile, moves }
```

### Reproduce the benchmark

```bash
node benchmark.js 250
```

Output:

```
2048 AI solver — 250 self-play games

Reach rate (max tile ≥ X):
  ≥  1024: ~87%
  ≥  2048: ~70%
  ≥  4096: ~30%
  ≥  8192:   0%
```

### Browser

```html
<script src="solver.js"></script>
<script>
  const dir = LK2048.bestMove(board); // engine attaches to window.LK2048
</script>
```

## API

All functions are pure and DOM-free. A board is a 16-length array in row-major order, `0` for empty.

| Function | Returns |
|---|---|
| `bestMove(board)` | Best direction (`'up'`/`'down'`/`'left'`/`'right'`) or `null` if no move |
| `computeMove(board, dir)` | `{ board, gained, moved, slides, merges }` — the move applied, no spawn |
| `evaluate(board)` | Heuristic score of a static board |
| `searchChance(board, depth)` / `searchMax(board, depth)` | Raw expectimax layers |
| `canMove(board)` | `true` if any legal move exists |
| `emptyCells(board)` | Array of empty cell indices |
| `selfPlayGame(rng?)` | Plays a full game; returns `{ maxTile, moves }` |

## License

MIT — see [LICENSE](LICENSE). Built by [LK Forge](https://lkforge.com). Play the game with autoplay at [lkforge.com/games/2048](https://lkforge.com/games/2048/).
