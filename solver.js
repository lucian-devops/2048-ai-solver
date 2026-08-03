/* ===================== 2048 AI — expectimax engine =====================
   Single-file, DOM-free, side-effect-free game engine + expectimax solver.
   Safe to importScripts() in a Web Worker, `require()` in Node, or load with
   a <script> tag in the browser (attaches to window.LK2048).

   This is the exact engine that powers the browser autoplay at
   https://lkforge.com/games/2048/ — see README for the measured reach rates.
   MIT licensed. */
(function (global) {
  'use strict';

  const SIZE = 4, CELLS = SIZE * SIZE, WIN_VALUE = 2048;

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

  function emptyCells(board) {
    const e = [];
    for (let i = 0; i < CELLS; i++) if (!board[i]) e.push(i);
    return e;
  }
  function canMove(board) {
    for (const d of ['left','right','up','down']) if (computeMove(board, d).moved) return true;
    return false;
  }

  // Snake weight matrix (largest weight bottom-right corner, boustrophedon).
  const SNAKE = [
     3,  2,  1,  0,
     4,  5,  6,  7,
    11, 10,  9,  8,
    12, 13, 14, 15
  ];
  const WPOW = SNAKE.map(w => Math.pow(4, w));

  // Board evaluation: positional (corner-snake) + empty-cell bonus + smoothness.
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

  function searchMax(board, depth) {
    if (depth <= 0) return evaluate(board);
    let best = -Infinity, any = false;
    for (const d of ['down','right','left','up']) {
      const r = computeMove(board, d);
      if (!r.moved) continue;
      any = true;
      best = Math.max(best, searchChance(r.board, depth - 1));
    }
    return any ? best : evaluate(board);
  }
  function searchChance(board, depth) {
    const empties = emptyCells(board);
    if (!empties.length || depth <= 0) return evaluate(board);
    let cells = empties;
    if (empties.length > 6) {
      cells = empties.slice();
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [cells[i],cells[j]]=[cells[j],cells[i]]; }
      cells = cells.slice(0, 6);
    }
    let total = 0;
    for (const idx of cells) {
      for (const [v, p] of [[2, 0.9], [4, 0.1]]) {
        const b = board.slice(); b[idx] = v;
        total += p * searchMax(b, depth - 1);
      }
    }
    return total / cells.length;
  }
  // Pick the best direction. Depth adapts to how full the board is.
  function bestMove(board) {
    const empties = emptyCells(board).length;
    const depth = empties > 8 ? 3 : empties > 3 ? 4 : 5;
    let best = null, bestScore = -Infinity;
    for (const d of ['down','right','left','up']) {
      const r = computeMove(board, d);
      if (!r.moved) continue;
      const s = searchChance(r.board, depth - 1);
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best;
  }

  // Headless self-play harness — the SAME move-selection the browser ships.
  // rng defaults to Math.random and controls tile spawns. Note: searchChance
  // samples empties with Math.random too, so a seeded rng makes spawns
  // reproducible but not the full run — reach-rate is a distribution, not a fixed value.
  function spawnRandom(b, rng) {
    const e = emptyCells(b);
    if (!e.length) return false;
    const idx = e[Math.floor(rng() * e.length)];
    b[idx] = rng() < 0.9 ? 2 : 4;      // matches the game's spawn: 90% 2 / 10% 4
    return true;
  }
  function selfPlayGame(rng) {
    rng = rng || Math.random;
    let b = new Array(CELLS).fill(0);
    spawnRandom(b, rng); spawnRandom(b, rng);   // standard 2048 starts with two tiles
    let moves = 0;
    while (moves < 20000) {
      const dir = bestMove(b);
      if (!dir) break;
      const r = computeMove(b, dir);
      if (!r.moved) break;
      b = r.board;
      spawnRandom(b, rng);
      moves++;
      if (!canMove(b)) break;
    }
    let mx = 0;
    for (let i = 0; i < CELLS; i++) if (b[i] > mx) mx = b[i];
    return { maxTile: mx, moves };
  }

  const api = { SIZE, CELLS, WIN_VALUE, LINES, SNAKE, WPOW,
    computeMove, emptyCells, canMove, evaluate, searchMax, searchChance, bestMove, selfPlayGame };
  // Browser / Worker: bare globals + namespace. Node: module.exports.
  for (const k in api) global[k] = api[k];
  global.LK2048 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
