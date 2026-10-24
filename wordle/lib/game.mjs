export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function nextMidnight(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function dayNumber(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.UTC(2021, 5, 19)) / 86400000);
}

export function score(guess, answer) {
  const result = Array(5).fill('absent');
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct';
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] !== 'correct' && remaining[guess[i]] > 0) {
      result[i] = 'present';
      remaining[guess[i]]--;
    }
  }
  return result;
}

export function hardModeError(guess, guesses, answer) {
  const ordinal = ['1st', '2nd', '3rd', '4th', '5th'];
  for (const previous of guesses) {
    const clues = score(previous, answer);
    const counts = {};
    for (let i = 0; i < 5; i++) {
      if (clues[i] === 'correct' && guess[i] !== previous[i]) return `${ordinal[i]} letter must be ${previous[i].toUpperCase()}`;
      if (clues[i] !== 'absent') counts[previous[i]] = (counts[previous[i]] || 0) + 1;
    }
    for (const [letter, count] of Object.entries(counts)) {
      if ([...guess].filter(c => c === letter).length < count) return count > 1 ? `Guess must contain ${count} ${letter.toUpperCase()}s` : `Guess must contain ${letter.toUpperCase()}`;
    }
  }
  return '';
}

export function selectPuzzle(feed, date = localDate()) {
  const puzzle = feed?.puzzles?.[date];
  return puzzle && puzzle.date === date && /^[a-z]{5}$/.test(puzzle.solution) && Number.isInteger(puzzle.number) ? puzzle : null;
}

export function statistics(records, today = localDate()) {
  const finished = Object.entries(records).filter(([date, game]) => date <= today && game.finished).sort(([a], [b]) => a.localeCompare(b));
  let current = 0, max = 0, lastDay = null, wins = 0;
  const distribution = Array(6).fill(0);
  for (const [date, game] of finished) {
    const day = dayNumber(date);
    if (game.won) {
      wins++;
      distribution[game.guesses.length - 1]++;
      current = lastDay === day - 1 ? current + 1 : 1;
      max = Math.max(max, current);
    } else current = 0;
    lastDay = day;
  }
  if (lastDay === null || lastDay < dayNumber(today) - 1) current = 0;
  return { played: finished.length, winPercent: finished.length ? Math.round(wins / finished.length * 100) : 0, current, max, distribution };
}

export function shareText(puzzle, game, contrast = false, dark = false) {
  const emoji = { correct: contrast ? '🟧' : '🟩', present: contrast ? '🟦' : '🟨', absent: dark ? '⬛' : '⬜' };
  return `Wordle ${puzzle.number} ${game.won ? game.guesses.length : 'X'}/6${game.hard ? '*' : ''}\n\n${game.guesses.map(guess => score(guess, puzzle.solution).map(state => emoji[state]).join('')).join('\n')}`;
}
