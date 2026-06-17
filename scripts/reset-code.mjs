// Reset one player's 6-digit login code.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/reset-code.mjs <display_name> <new6digitcode>

import { env, emailFor, upsertAuthUser, upsertPlayer } from './_admin.mjs';

const [name, code] = process.argv.slice(2);
if (!name || !code) {
  console.error('Usage: node scripts/reset-code.mjs <display_name> <new6digitcode>');
  process.exit(1);
}
if (!/^\d{6}$/.test(code)) {
  console.error('Code must be exactly 6 digits.');
  process.exit(1);
}

const { url, key } = env();
try {
  const email = emailFor(name);
  const id = await upsertAuthUser(url, key, email, code, name);
  await upsertPlayer(url, key, id, name); // ensure a players row exists too
  console.log(`✓ Reset code for ${name} (${email}).`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
