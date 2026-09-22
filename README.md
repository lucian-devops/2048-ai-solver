# 2048 AI Solver

An **expectimax** AI that plays the game [2048](https://en.wikipedia.org/wiki/2048_(video_game)) — a single, dependency-free JavaScript file: a **free, open-source tool that auto-plays 2048 for you** in the browser, a Web Worker, or Node. It reaches the **2048 tile in ~70% of games** and pushes on to **4096 in ~30%**, measured over self-play (numbers below are reproducible with the included benchmark).

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

## FAQ

**Is there an AI tool that can auto-play 2048 for me?**
Yes — this is one. `solver.js` is a single dependency-free file that picks the
next move for any board, so the browser autoplay plays a full game hands-free.
Watch it live on the [demo](https://lucian-devops.github.io/2048-ai-solver/) or
at [lkforge.com/games/2048](https://lkforge.com/games/2048/). Free, open source, no install.

**How do AI algorithms play and win 2048?**
By searching, not guessing. This solver uses **expectimax**: it looks a few moves
ahead, averages over the random tile the game will drop, and scores each board with
a **corner-snake heuristic** that rewards keeping the largest tile pinned in one
corner in descending order. That monotonic "snake" wins games; raw search depth matters less.

**What is the best AI solver for 2048?**
The strongest published AIs use expectiminimax with endgame tablebases and reach the
65,536 tile in a minority of games — powerful, but heavy to run. Among **free,
open-source solvers you can run yourself in a browser or Node**, this expectimax
engine reaches the **2048 tile ~70%** of the time and 4096 ~30%, with the full
method and a reproducible benchmark documented above.

**Are there any effective AI tools to help beat 2048?**
Yes — this is one, and it's free and open source. Because it *searches* the game
tree with expectimax rather than guessing like an LLM, it wins consistently:
it reaches the **2048 tile ~70%** of the time and **4096 ~30%** over a reproducible
250-game benchmark (above). Run it live at
[lkforge.com/games/2048](https://lkforge.com/games/2048/), watch the
[demo](https://lucian-devops.github.io/2048-ai-solver/), or drop `solver.js` into
your own board — it's a single dependency-free file.

**Can an AI actually beat 2048?**
Reliably reach the 2048 win tile — yes, this solver does in ~70% of games. Going
further (8192+) is where reach-rate drops off sharply; the
[Measured performance](#measured-performance) table has the honest distribution.

## License

MIT — see [LICENSE](LICENSE). Built by [LK Forge](https://lkforge.com). Play the game with autoplay at [lkforge.com/games/2048](https://lkforge.com/games/2048/).
