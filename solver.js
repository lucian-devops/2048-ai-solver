/* ===================== 2048 AI — expectimax engine =====================
   Single-file, DOM-free, side-effect-free game engine + expectimax solver.
   Safe to importScripts() in a Web Worker, `require()` in Node, or load with
   a <script> tag in the browser (attaches to window.LK2048).

   This is the exact engine that powers the browser autoplay at
   https://lkforge.com/games/2048/ — see README for the measured reach rates.
   Variant boards: LK2048.makeEngine(size, winValue).

   The expectimax approach and the probability-threshold pruning follow the
   canonical 2048 AI by Robert Xiao (nneonneo): https://github.com/nneonneo/2048-ai
   (write-up: https://www.robertxiao.ca/hacking/2048-ai/). Original JS impl.
   MIT licensed. */
(function (global) {
  'use strict';

  function makeEngine(size, winValue) {

  const SIZE = size, CELLS = SIZE * SIZE, WIN_VALUE = winValue;

  // Lines (cell indices) in "pile order" per direction: index 0 = edge tiles slide toward.
  const LINES = { left: [], right: [], up: [], down: [] };
  for (let r = 0; r < SIZE; r++) {
    const row = [], rowR = [];
    for (let c = 0; c < SIZE; c++) { row.push(r*SIZE + c); rowR.push(r*SIZE + (SIZE-1-c)); }
    LINES.left.push(row); LINES.right.push(rowR);
  }
  for (let c = 0; c < SIZE; c++) {
    const col = [], colR = [];
    for (let r = 0; r < SIZE; r++) { col.push(r*SIZE + c); colR.push((SIZE-1-r)*SIZE + c); }
    LINES.up.push(col); LINES.down.push(colR);
  }

  // Compute the result of a move without spawning. Returns {board, gained, moved, slides, merges}
  function computeMove(board, dir) {
    const out = board.slice();
    let gained = 0, moved = false;
    const slides = [];
    const merges = [];
    for (const line of LINES[dir]) {
      const seq = [];
      for (const idx of line) if (board[idx]) seq.push(idx);
      for (const idx of line) out[idx] = 0;
      const built = [];
      for (const idx of seq) {
        const v = board[idx];
        const last = built[built.length - 1];
        if (last && !last.merged && last.value === v) {
          last.value *= 2; last.merged = true; last.sources.push(idx);
          gained += last.value;
        } else {
          built.push({ value: v, merged: false, sources: [idx] });
        }
      }
      for (let k = 0; k < built.length; k++) {
        const dest = line[k];
        out[dest] = built[k].value;
        if (built[k].merged) merges.push(dest);
        for (const src of built[k].sources) {
          slides.push({ from: src, to: dest });
          if (src !== dest) moved = true;
        }
        if (built[k].merged) moved = true;
      }
    }
    return { board: out, gained, moved, slides, merges };
  }

  // Lean move for search: result board + gained + moved only. Skips the
  // slide/merge metadata computeMove builds for game.js rendering (unused by
  // search), so search nodes stay allocation-light. Same rules; size-generic.
  function simMove(board, dir) {
    const out = board.slice();
    let gained = 0;
    for (const line of LINES[dir]) {
      const vals = [];
      for (const idx of line) { const v = board[idx]; if (v) vals.push(v); }
      for (const idx of line) out[idx] = 0;
      let w = 0, k = 0;
      while (k < vals.length) {
        let v = vals[k];
        if (k + 1 < vals.length && vals[k + 1] === v) { v *= 2; gained += v; k += 2; }
        else { k += 1; }
        out[line[w++]] = v;
      }
    }
    let moved = false;
    for (let i = 0; i < CELLS; i++) if (out[i] !== board[i]) { moved = true; break; }
    return { board: out, gained, moved };
  }

  function emptyCells(board) {
    const e = [];
    for (let i = 0; i < CELLS; i++) if (!board[i]) e.push(i);
    return e;
  }
  function canMove(board) {
    for (const d of ['left','right','up','down']) if (simMove(board, d).moved) return true;
    return false;
  }

  // Snake weight matrix (largest weight bottom-right corner, boustrophedon).
  // Generated for any size; the 4x4 output matches the historical literal.
  const SNAKE = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      SNAKE.push(r % 2 === 0 ? r * SIZE + (SIZE - 1 - c) : r * SIZE + c);
  const WPOW = SNAKE.map(w => Math.pow(4, w));

  function evaluate(board) {
    let positional = 0, empty = 0, maxV = 0;
    for (let i = 0; i < CELLS; i++) {
      const v = board[i];
      if (!v) { empty++; continue; }
      positional += v * WPOW[i];
      if (v > maxV) maxV = v;
    }
    let smooth = 0;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = board[r*SIZE + c];
      if (!v) continue;
      if (c < SIZE-1) { const n = board[r*SIZE + c+1]; if (n) smooth -= Math.abs(Math.log2(v) - Math.log2(n)); }
      if (r < SIZE-1) { const n = board[(r+1)*SIZE + c]; if (n) smooth -= Math.abs(Math.log2(v) - Math.log2(n)); }
    }
    return positional + empty * 200000 + smooth * 4000;
  }

  // Expectimax with a transposition table + probability-threshold pruning.
  // Chance nodes expand EVERY empty cell (deterministic — no random sampling),
  // but a branch whose cumulative reach-probability falls below CPROB_THRESH is
  // cut to a static eval. That bounds the blow-up from full expansion, so open
  // boards prune themselves shallow while tight boards (few empties) search deep.
  const DIRS = ['down', 'right', 'left', 'up'];   // bottom-right corner tie-break
  const CPROB_THRESH = 0.0001;
  let ttable = new Map();                          // reset per top-level decision

  function searchMax(board, depth, cprob) {
    if (cprob === undefined) cprob = 1;
    if (depth <= 0 || cprob < CPROB_THRESH) return evaluate(board);
    let best = -Infinity, any = false;
    for (const d of DIRS) {
      const r = simMove(board, d);
      if (!r.moved) continue;
      any = true;
      const s = searchChance(r.board, depth - 1, cprob);
      if (s > best) best = s;
    }
    return any ? best : evaluate(board);
  }
  function searchChance(board, depth, cprob) {
    if (cprob === undefined) cprob = 1;
    if (depth <= 0) return evaluate(board);
    const empties = emptyCells(board);
    if (!empties.length) return evaluate(board);
    // ponytail: TT keyed on board only, depth-guarded. Under cprob pruning a
    // cached value can be marginally shallow — fine for a heuristic estimate.
    const key = board.join(',');
    const hit = ttable.get(key);
    if (hit !== undefined && hit.depth >= depth) return hit.value;
    const n = empties.length;
    let total = 0;
    for (const idx of empties) {
      const b2 = board.slice(); b2[idx] = 2;
      total += 0.9 * searchMax(b2, depth - 1, cprob * 0.9 / n);
      const b4 = board.slice(); b4[idx] = 4;
      total += 0.1 * searchMax(b4, depth - 1, cprob * 0.1 / n);
    }
    const value = total / n;
    ttable.set(key, { depth, value });
    return value;
  }
  // Pick the best direction. Depth adapts to how full the board is — deeper when
  // the board is fuller (branching is small then); forcedDepth pins it for the
  // depth-sweep benchmark. Fresh transposition table per top-level decision.
  function bestMove(board, forcedDepth) {
    ttable = new Map();
    const empties = emptyCells(board).length;
    const depth = forcedDepth || (empties > 8 ? 4 : empties > 4 ? 5 : empties > 2 ? 6 : 7);
    let best = null, bestScore = -Infinity;
    for (const d of DIRS) {
      const r = simMove(board, d);
      if (!r.moved) continue;
      const s = searchChance(r.board, depth - 1, 1);
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best;
  }

  // Headless self-play harness — the SAME move-selection the browser ships.
  // rng defaults to Math.random and controls tile spawns. Move selection is now
  // deterministic (no random sampling in search), so a seeded rng makes a full
  // run reproducible; reach-rate over many runs is still a distribution.
  function spawnRandom(b, rng) {
    const e = emptyCells(b);
    if (!e.length) return false;
    const idx = e[Math.floor(rng() * e.length)];
    b[idx] = rng() < 0.9 ? 2 : 4;      // matches game.js spawnTile: 90% 2 / 10% 4
    return true;
  }
  function selfPlayGame(rng, forcedDepth) {
    rng = rng || Math.random;
    let b = new Array(CELLS).fill(0);
    spawnRandom(b, rng); spawnRandom(b, rng);   // standard 2048 starts with two tiles
    let moves = 0, score = 0;
    while (moves < 20000) {
      const dir = bestMove(b, forcedDepth);
      if (!dir) break;
      const r = simMove(b, dir);
      if (!r.moved) break;
      score += r.gained;
      b = r.board;
      spawnRandom(b, rng);
      moves++;
      if (!canMove(b)) break;
    }
    let mx = 0;
    for (let i = 0; i < CELLS; i++) if (b[i] > mx) mx = b[i];
    return { maxTile: mx, moves, score };
  }

    return { SIZE, CELLS, WIN_VALUE, LINES, SNAKE, WPOW,
      computeMove, simMove, emptyCells, canMove, evaluate, searchMax, searchChance, bestMove, selfPlayGame };
  }

  // Default engine: 4x4/2048 unless the page opts into a variant via
  // <html data-g2048-size="N" data-g2048-win="W"> (DOM guard keeps this
  // file safe for workers and node, which always get the 4x4 default).
  let defSize = 4, defWin = 2048;
  if (typeof document !== 'undefined' && document.documentElement) {
    const ds = parseInt(document.documentElement.getAttribute('data-g2048-size'), 10);
    const dw = parseInt(document.documentElement.getAttribute('data-g2048-win'), 10);
    if (ds >= 2 && ds <= 16) defSize = ds;
    if (dw >= 8) defWin = dw;
  }
  const api = makeEngine(defSize, defWin);
  api.makeEngine = makeEngine;

  // Expose as bare globals (game.js's existing call sites resolve to these)
  // AND as a namespace (tests + new consumers).
  for (const k in api) global[k] = api[k];
  global.LK2048 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
