import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../wordle/data/puzzles.json', import.meta.url));
const today = new Date().toISOString().slice(0,10);
let existing = { puzzles: {} };
try { existing = JSON.parse(await readFile(destination,'utf8')); } catch {}
const puzzles = { ...existing.puzzles };
let successes = 0;
// UTC+14 starts tomorrow while it is still today in UTC. Fetch published
// upcoming dates so a player's local midnight never waits for a scheduled run.
for (let offset = -2; offset <= 7; offset++) {
  const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+offset);
  const key = date.toISOString().slice(0,10);
  try {
    const response = await fetch(`https://www.nytimes.com/svc/wordle/v2/${key}.json`, {
      headers: { 'User-Agent': 'Personal-Wordle-Daily-Sync/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.print_date!==key || !/^[a-z]{5}$/.test(result.solution) || !Number.isInteger(result.days_since_launch) || !Number.isInteger(result.id)) throw new Error('Unexpected daily puzzle response');
    puzzles[key] = { date:key, id:result.id, number:result.days_since_launch, solution:result.solution, editor: typeof result.editor==='string' ? result.editor : '' };
    successes++; console.log(`Updated ${key}`);
  } catch (error) { console.warn(`Unavailable ${key}: ${error.message}`); }
}
if (!successes) throw new Error('No daily puzzles could be refreshed; retaining the previous feed.');
const cutoff = new Date(`${today}T12:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate()-14);
const sorted = Object.fromEntries(Object.entries(puzzles).filter(([date])=>date>=cutoff.toISOString().slice(0,10)).sort(([a],[b])=>a.localeCompare(b)));
await writeFile(destination,JSON.stringify({ source:'https://www.nytimes.com/svc/wordle/v2/', puzzles:sorted },null,2)+'\n');
if (!sorted[today]) throw new Error('Today’s puzzle is missing from the feed.');
