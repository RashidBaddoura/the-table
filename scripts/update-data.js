#!/usr/bin/env node
/**
 * Fetches the latest openfootball World Cup 2026 JSON and writes it to
 * data/worldcup.json.  Run manually with:
 *
 *   node scripts/update-data.js
 *
 * Requires Node 18+ (uses built-in fetch).
 */

const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const URL    = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const OUTPUT = join(__dirname, '..', 'data', 'worldcup.json');

async function main() {
  console.log(`Fetching ${URL} …`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const text = await res.text();
  const data = JSON.parse(text);  // validate JSON before writing

  mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(data, null, 2), 'utf8');

  const count = data.matches?.length ?? '?';
  console.log(`✓ Wrote ${count} matches → ${OUTPUT}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
