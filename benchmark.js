#!/usr/bin/env node
/* Self-play benchmark — runs the shipped engine headless for N games and
   prints the max-tile distribution and reach rates.
   Usage: node benchmark.js [games]   (default 250) */
'use strict';
const K = require('./solver');

const n = Math.max(1, parseInt(process.argv[2] || '250', 10));
const counts = {};
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const { maxTile } = K.selfPlayGame();
  counts[maxTile] = (counts[maxTile] || 0) + 1;
  if ((i + 1) % 10 === 0 || i + 1 === n) {
    process.stderr.write(`\r  ${i + 1}/${n} games...`);
  }
}
process.stderr.write('\n');

const tiles = Object.keys(counts).map(Number).sort((a, b) => a - b);
const reach = t => tiles.filter(x => x >= t).reduce((s, x) => s + counts[x], 0);

console.log(`\n2048 AI solver — ${n} self-play games (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
console.log('Max tile reached:');
for (const t of tiles) {
  console.log(`  ${String(t).padStart(6)}: ${String(counts[t]).padStart(4)} games  (${(100 * counts[t] / n).toFixed(1)}%)`);
}
console.log('\nReach rate (max tile ≥ X):');
for (const t of [1024, 2048, 4096, 8192]) {
  console.log(`  ≥ ${String(t).padStart(5)}: ${(100 * reach(t) / n).toFixed(1)}%`);
}
