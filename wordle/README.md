# Wordle recreation

Static game at `/the-table/wordle/`. Six guesses, duplicate-letter scoring, keyboard input, hard mode, dark and high-contrast themes, local progress, statistics, and spoiler-free sharing.

## Daily puzzles

`scripts/update-wordle.mjs` fetches dated JSON from the public NYT Wordle service. The hourly `Update daily Wordle` workflow commits the feed, including already published upcoming dates. The browser reads the latest feed from the public repository, falling back to the bundled copy if needed. Only the record matching the device's local calendar date is playable. Midnight is computed as the next local calendar day, including DST changes. A visible or resumed tab rolls over automatically; unavailable days show a retry state, never an invented answer.

The midnight rule is a UI rule based on the player's device clock, like any client-side static game. Upcoming data is inspectable in the public repository, and a changed device clock can change the playable date. It is not a server-enforced anti-cheat gate. GitHub schedules can be delayed or disabled after prolonged repository inactivity, and the upstream public endpoint is not a guaranteed API. Published future records provide a buffer; manual refresh is available under Actions → Update daily Wordle → Run workflow.

## Local development

Serve the repository root using `python -m http.server 8765`, then open `/wordle/`. Run `node --test tests/wordle.test.mjs` from the repository root. Refresh the feed with `node scripts/update-wordle.mjs`.

The UI uses the user's supplied screenshots and saved CSS measurements as references, with simplified navigation and no subscription, login, publisher credits, advertising, analytics, or tracking. The proprietary fonts were not present in the supplied files; system fonts are used. Progress and stats are independent and browser-local. The dictionary comes from https://github.com/tabatkins/wordle-list under its accompanying MIT license and is not guaranteed to track every change to the original game's accepted guesses.
