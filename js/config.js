// ─── Data sources ────────────────────────────────────────────────────────────
export const LIVE_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
export const FALLBACK_URL = 'data/worldcup.json';

// ─── Roster — edit this to change team assignments ───────────────────────────
// Names MUST match the openfootball dataset exactly (case-sensitive).
export const ROSTER = {
  sudais:  ['South Korea', 'Bosnia & Herzegovina', 'Spain'],
  zeina:   ['Ecuador', 'Australia', 'Netherlands'],
  aboud:   ['Brazil', 'Egypt', 'Ivory Coast'],
  AK:      ['USA', 'Czech Republic', 'Argentina'],
  Rashid:  ['Mexico', 'Tunisia', 'Jordan'],
  enoch:   ['South Africa', 'Colombia', 'New Zealand'],
  imron:   ['Paraguay', 'Switzerland', 'Turkey'],
  jana:    ['Canada', 'France', 'Panama'],
  malak:   ['Algeria', 'Belgium', 'Senegal'],
  mikal:   ['Uruguay', 'Germany', 'Qatar'],
  maryam:  ['Uzbekistan', 'Morocco', 'Iran'],
  saja:    ['Japan', 'Curaçao', 'England'],
  sheen:   ['Saudi Arabia', 'Portugal', 'Haiti'],
  ren:     ['Croatia', 'Norway', 'Iraq'],
  khadija: ['Sweden', 'Austria', 'Scotland'],
};

// ─── Scoring — edit this to tune all point values ────────────────────────────
export const SCORING = {
  group: { win: 3, draw: 1, loss: 0 },
  // Progression bonuses, awarded ONCE when a team reaches that stage.
  // 'Champion' is awarded IN ADDITION TO 'Final' for the winner.
  progression: {
    'Round of 32':   4,
    'Round of 16':   6,
    'Quarterfinals': 9,
    'Semifinals':    13,
    'Final':         18,
    'Champion':      25,
  },
};

// Ordered list of knockout stages (used for display/sorting).
export const STAGE_ORDER = [
  'Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final',
];

// ─── Tiebreaker order (informational) ─────────────────────────────────────────
// 1. Total points  2. Goals for  3. Goal difference  4. Teams still alive

// ─── Country flag emoji ───────────────────────────────────────────────────────
export const FLAGS = {
  'South Korea':          '🇰🇷',
  'Bosnia & Herzegovina': '🇧🇦',
  'Spain':                '🇪🇸',
  'Ecuador':              '🇪🇨',
  'Australia':            '🇦🇺',
  'Netherlands':          '🇳🇱',
  'Brazil':               '🇧🇷',
  'Egypt':                '🇪🇬',
  'Ivory Coast':          '🇨🇮',
  'USA':                  '🇺🇸',
  'Czech Republic':       '🇨🇿',
  'Argentina':            '🇦🇷',
  'Mexico':               '🇲🇽',
  'Tunisia':              '🇹🇳',
  'Jordan':               '🇯🇴',
  'South Africa':         '🇿🇦',
  'Colombia':             '🇨🇴',
  'New Zealand':          '🇳🇿',
  'Paraguay':             '🇵🇾',
  'Switzerland':          '🇨🇭',
  'Turkey':               '🇹🇷',
  'Canada':               '🇨🇦',
  'France':               '🇫🇷',
  'Panama':               '🇵🇦',
  'Algeria':              '🇩🇿',
  'Belgium':              '🇧🇪',
  'Senegal':              '🇸🇳',
  'Uruguay':              '🇺🇾',
  'Germany':              '🇩🇪',
  'Qatar':                '🇶🇦',
  'Uzbekistan':           '🇺🇿',
  'Morocco':              '🇲🇦',
  'Iran':                 '🇮🇷',
  'Japan':                '🇯🇵',
  'Curaçao':              '🇨🇼',
  'England':              '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Saudi Arabia':         '🇸🇦',
  'Portugal':             '🇵🇹',
  'Haiti':                '🇭🇹',
  'Croatia':              '🇭🇷',
  'Norway':               '🇳🇴',
  'Iraq':                 '🇮🇶',
  'Sweden':               '🇸🇪',
  'Austria':              '🇦🇹',
  'Scotland':             '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Cape Verde':           '🇨🇻',
  'DR Congo':             '🇨🇩',
  'Ghana':                '🇬🇭',
};

// ─── Manual point adjustments ────────────────────────────────────────────────
// Add entries here for any manual point changes. Shown as cards on Results page.
export const MANUAL_ADJUSTMENTS = [
  { person: 'saja', points: 2, reason: 'Curaçao has like 20 people.', date: '2026-06-14' },
];

// ─── Event announcements ──────────────────────────────────────────────────────
// Non-scoring events shown as cards on the Results page.
export const EVENTS = [
  { person: 'khadija', message: 'Everyone welcome khadija!', date: '2026-06-16' },
];

// ─── Per-person badge colors (one per person, in ROSTER order) ───────────────
export const PERSON_COLORS = {
  sudais:  '#6366f1',
  zeina:   '#ef4444',
  aboud:   '#10b981',
  AK:      '#f59e0b',
  Rashid:  '#06b6d4',
  enoch:   '#8b5cf6',
  imron:   '#ec4899',
  jana:    '#14b8a6',
  malak:   '#f97316',
  mikal:   '#84cc16',
  maryam:  '#0ea5e9',
  saja:    '#a855f7',
  sheen:   '#22c55e',
  ren:     '#fb923c',
  khadija: '#d946ef',
};
