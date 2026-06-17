// Provision the player auth users + players rows from a names+codes file.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/seed-players.mjs scripts/players.local.json
//
// The file is JSON: { "sudais": "123456", "zeina": "654321", ... }
// Codes are 6-digit strings. Keep this file OUT of git (see .gitignore).
// Idempotent: re-running resets each player's code to the file's value.

import { readFile } from 'node:fs/promises';
import { env, emailFor, upsertAuthUser, upsertPlayer } from './_admin.mjs';

const file = process.argv[2] || 'scripts/players.local.json';
const { url, key } = env();

let roster;
try {
  roster = JSON.parse(await readFile(file, 'utf8'));
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  console.error('Expected JSON like { "sudais": "123456", "zeina": "654321" }');
  process.exit(1);
}

const entries = Object.entries(roster);
console.log(`Seeding ${entries.length} players into ${url} …\n`);

for (const [name, code] of entries) {
  if (!/^\d{6}$/.test(String(code))) {
    console.error(`  ✗ ${name}: code must be exactly 6 digits — skipped`);
    continue;
  }
  try {
    const email = emailFor(name);
    const id = await upsertAuthUser(url, key, email, String(code), name);
    await upsertPlayer(url, key, id, name);
    console.log(`  ✓ ${name.padEnd(10)} ${email}`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}
console.log('\nDone.');
