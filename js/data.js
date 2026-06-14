import { LIVE_URL, FALLBACK_URL } from './config.js';

/**
 * Loads match data, calling onUpdate(data, source) twice:
 *   1. Immediately with the committed snapshot (source = 'cached') for instant render.
 *   2. After the live fetch completes (source = 'live').
 * If the live fetch fails, calls onUpdate(data, 'cached-only') with the snapshot,
 * or onUpdate(null, 'error') if neither source was available.
 */
export async function loadData(onUpdate) {
  let cached = null;

  try {
    const res = await fetch(FALLBACK_URL);
    if (res.ok) {
      cached = await res.json();
      if (cached?.matches?.length) onUpdate(cached, 'cached');
    }
  } catch {
    // no local snapshot — continue to live fetch
  }

  try {
    const res = await fetch(LIVE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = await res.json();
    if (!live?.matches) throw new Error('Unexpected data shape');
    onUpdate(live, 'live');
    return live;
  } catch (err) {
    console.error('Live fetch failed:', err);
    if (cached) {
      onUpdate(cached, 'cached-only');
    } else {
      onUpdate(null, 'error');
    }
    return cached;
  }
}
