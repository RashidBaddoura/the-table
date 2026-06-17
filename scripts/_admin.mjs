// Shared helpers for the admin scripts. Uses the Supabase Admin Auth API and
// PostgREST directly via Node's built-in fetch — no npm install required.
//
// Required environment variables (never commit these):
//   SUPABASE_URL                e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   the secret service_role key (admin only)
//
// The synthetic-email convention mirrors the frontend login:
//   email = slug(display_name) + '@thetable.local'   (slug = lowercase alnum)

export const EMAIL_DOMAIN = 'thetable.local';

export function slug(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function emailFor(displayName) {
  return `${slug(displayName)}@${EMAIL_DOMAIN}`;
}

import { readFileSync } from 'node:fs';

// Credentials resolve from (1) env vars (used by the GitHub Action), else
// (2) scripts/admin.local.json (easiest locally — no env-var syntax needed):
//   { "url": "https://<ref>.supabase.co", "serviceRoleKey": "<service_role>" }
export function env() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    try {
      const f = JSON.parse(readFileSync(new URL('./admin.local.json', import.meta.url), 'utf8'));
      url = url || f.url;
      key = key || f.serviceRoleKey;
    } catch { /* file optional */ }
  }
  if (!url || !key) {
    console.error('Missing Supabase credentials.');
    console.error('Create scripts/admin.local.json from scripts/admin.example.json,');
    console.error('or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
    process.exit(1);
  }
  return { url: url.replace(/\/$/, ''), key };
}

function authHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// Find an auth user by email (paginates the admin list endpoint).
export async function findUserByEmail(url, key, email) {
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: authHeaders(key),
    });
    if (!res.ok) throw new Error(`list users HTTP ${res.status}: ${await res.text()}`);
    const body = await res.json();
    const users = body.users ?? body;
    if (!users.length) break;
    const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

// Create (or, if it exists, update the password of) an auth user. Returns id.
export async function upsertAuthUser(url, key, email, password, displayName) {
  const create = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { display_name: displayName },
    }),
  });
  if (create.ok) return (await create.json()).id;

  // Already exists → look up and reset the password to match.
  const existing = await findUserByEmail(url, key, email);
  if (!existing) throw new Error(`create failed and user not found: ${await create.text()}`);
  const upd = await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers: authHeaders(key),
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!upd.ok) throw new Error(`update password HTTP ${upd.status}: ${await upd.text()}`);
  return existing.id;
}

// Upsert a players row (id == auth user id).
export async function upsertPlayer(url, key, id, displayName) {
  const res = await fetch(`${url}/rest/v1/players?on_conflict=id`, {
    method: 'POST',
    headers: { ...authHeaders(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id, display_name: displayName }]),
  });
  if (!res.ok) throw new Error(`upsert player HTTP ${res.status}: ${await res.text()}`);
}
