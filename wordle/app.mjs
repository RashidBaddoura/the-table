import { localDate, nextMidnight, dayNumber, score, hardModeError, selectPuzzle, statistics, shareText } from './lib/game.mjs';

const $ = selector => document.querySelector(selector);
const storageKey = 'personal-wordle-v1';
let storageOK = true;
function readSaved() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
}
let saved = readSaved();
let settings = { hard: false, dark: false, contrast: false, ...saved.settings };
let records = saved.records || {};
let date = localDate(), puzzle = null, dictionary = null, game = null, busy = false, loading = false, modalKind = '', requestId = 0, rollPending = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const delay = ms => new Promise(resolve => setTimeout(resolve, reducedMotion ? 0 : ms));
const tiles = [], keys = {};
const feedURL = 'https://raw.githubusercontent.com/RashidBaddoura/the-table/master/wordle/data/puzzles.json';

function persist() {
  try {
    const latest = readSaved();
    records = { ...latest.records, ...records };
    localStorage.setItem(storageKey, JSON.stringify({ settings, records, seenHelp: saved.seenHelp }));
  } catch {
    if (storageOK) toast('Your browser cannot save progress. Keep this page open.');
    storageOK = false;
  }
}
function applySettings() {
  document.body.classList.toggle('dark', settings.dark);
  document.body.classList.toggle('contrast', settings.contrast);
  $('meta[name="theme-color"]').content = settings.dark && $('#welcome').hidden ? '#121213' : $('#welcome').hidden ? '#ffffff' : '#e3e3e1';
}
function toast(message, duration = 2200) {
  const item = document.createElement('div'); item.className = 'toast'; item.textContent = message;
  $('#toasts').append(item); setTimeout(() => item.remove(), duration);
}
function announce(message) { $('#announcement').textContent = message; }
function updateWelcome() {
  const [y,m,d] = date.split('-').map(Number);
  $('#date-label').textContent = new Date(y,m-1,d).toLocaleDateString('en-US', { month:'long',day:'numeric',year:'numeric' });
  $('#puzzle-label').textContent = `No. ${puzzle?.number ?? dayNumber(date)}`;
  $('#play').textContent = game?.finished ? 'View results' : game?.guesses.length ? 'Continue' : 'Play';
}

for (let r = 0; r < 6; r++) {
  const row = document.createElement('div'); row.className = 'row'; row.setAttribute('role','group'); row.setAttribute('aria-label',`Guess ${r + 1}`);
  tiles[r] = [];
  for (let c = 0; c < 5; c++) {
    const tile = document.createElement('div'); tile.className = 'tile'; tile.dataset.state = 'empty'; tile.setAttribute('aria-label','Empty');
    row.append(tile); tiles[r].push(tile);
  }
  $('#board').append(row);
}
for (const letters of ['QWERTYUIOP','ASDFGHJKL','↵ZXCVBNM⌫']) {
  const row = document.createElement('div'); row.className = 'keyboard-row';
  if (letters[0] === 'A') { const spacer = document.createElement('span'); spacer.className = 'half'; row.append(spacer); }
  for (const letter of letters) {
    const button = document.createElement('button'); button.className = 'key';
    const key = letter === '↵' ? 'Enter' : letter === '⌫' ? 'Backspace' : letter;
    button.dataset.key = key; button.setAttribute('aria-label',key === 'Backspace' ? 'Delete' : key);
    if (key === 'Backspace') button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 5h12v14H9l-7-7 7-7Z"/><path d="m11 9 6 6m0-6-6 6"/></svg>';
    else button.textContent = key === 'Enter' ? 'ENTER' : key;
    if (key.length > 1) button.classList.add('wide');
    button.addEventListener('click', () => input(key)); row.append(button); keys[key.toLowerCase()] = button;
  }
  if (letters[0] === 'A') { const spacer = document.createElement('span'); spacer.className = 'half'; row.append(spacer); }
  $('#keyboard').append(row);
}

function render() {
  for (let r = 0; r < 6; r++) {
    const guess = game?.guesses[r];
    const text = guess || (r === game?.guesses.length ? game.current : '') || '';
    const states = guess && puzzle ? score(guess, puzzle.solution) : [];
    for (let c = 0; c < 5; c++) {
      const tile = tiles[r][c]; tile.textContent = text[c] || '';
      tile.dataset.state = states[c] || (text[c] ? 'tbd' : 'empty');
      tile.setAttribute('aria-label', text[c] ? `${text[c].toUpperCase()}, ${states[c] || 'not submitted'}` : 'Empty');
    }
  }
  const ranks = { absent: 1, present: 2, correct: 3 }, stateByKey = {};
  for (const guess of game?.guesses || []) score(guess,puzzle.solution).forEach((state,i) => {
    if ((ranks[stateByKey[guess[i]]] || 0) < ranks[state]) stateByKey[guess[i]] = state;
  });
  for (const [letter, key] of Object.entries(keys)) {
    key.dataset.state = stateByKey[letter] || '';
    key.disabled = !puzzle || !dictionary || loading;
    const label = letter === 'backspace' ? 'Delete' : letter.toUpperCase();
    key.setAttribute('aria-label', `${label}${stateByKey[letter] ? `, ${stateByKey[letter]}` : ''}`);
  }
  updateWelcome();
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function loadPuzzle() {
  const id = ++requestId, wantedDate = date; loading = true; puzzle = null; game = null; render();
  $('#feed-error').hidden = false; $('#feed-message').textContent = 'Loading today’s puzzle…'; $('#retry').hidden = true;
  try {
    const wordsPromise = dictionary ? Promise.resolve(dictionary) : fetch('./data/words.txt').then(response => {
      if (!response.ok) throw new Error('Dictionary unavailable');
      return response.text();
    }).then(text => new Set(text.trim().split(/\s+/)));
    // The published branch feed avoids depending on a Pages rebuild for each daily update.
    const feeds = await Promise.allSettled([fetchJSON(feedURL), fetchJSON('./data/puzzles.json'), wordsPromise]);
    if (id !== requestId || wantedDate !== date) return;
    if (feeds[2].status !== 'fulfilled') throw new Error('The word list could not load. Please try again.');
    dictionary = feeds[2].value;
    const remote = feeds[0].status === 'fulfilled' && selectPuzzle(feeds[0].value, date);
    const bundled = feeds[1].status === 'fulfilled' && selectPuzzle(feeds[1].value, date);
    puzzle = remote || bundled;
    if (!puzzle) throw new Error('Today’s puzzle is not available yet. Please try again shortly.');
    const previous = records[date];
    const valid = previous && previous.puzzleId === puzzle.id && Array.isArray(previous.guesses) && previous.guesses.length <= 6 && previous.guesses.every(word => /^[a-z]{5}$/.test(word));
    game = valid ? previous : { puzzleId: puzzle.id, guesses: [], current: '', hard: settings.hard, finished: false, won: false };
    game.current = /^[a-z]{0,5}$/.test(game.current) ? game.current : '';
    game.won = game.guesses.includes(puzzle.solution); game.finished = game.won || game.guesses.length === 6;
    records[date] = game;
    $('#feed-error').hidden = true;
    announce(`Wordle ${puzzle.number}. ${game.finished ? 'Puzzle complete.' : `${6-game.guesses.length} guesses remaining.`}`);
  } catch (error) {
    if (id !== requestId) return;
    $('#feed-message').textContent = error.message || 'Could not load today’s puzzle.';
    $('#retry').hidden = false;
  } finally {
    if (id === requestId) { loading = false; render(); if (modalKind === 'stats' && $('#modal').open) fillModal('stats'); }
  }
}

function input(key) {
  if (checkRollover() || $('#welcome').hidden === false || $('#modal').open || busy || loading || !puzzle || !dictionary || game.finished) return;
  if (key === 'Enter') { submit(); return; }
  if (key === 'Backspace' || key === 'Delete') game.current = game.current.slice(0,-1);
  else if (/^[a-z]$/i.test(key) && game.current.length < 5) {
    game.current += key.toLowerCase();
    const tile = tiles[game.guesses.length][game.current.length-1];
    tile.classList.remove('pop'); void tile.offsetWidth; tile.classList.add('pop');
  } else return;
  persist(); render();
}
function reject(message) {
  toast(message); const row = tiles[game.guesses.length][0].parentElement;
  row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 650);
}
async function submit() {
  if (game.current.length !== 5) return reject('Not enough letters');
  if (!dictionary.has(game.current) && game.current !== puzzle.solution) return reject('Not in word list');
  const error = game.hard ? hardModeError(game.current, game.guesses, puzzle.solution) : '';
  if (error) return reject(error);
  busy = true;
  const row = game.guesses.length, guess = game.current, states = score(guess,puzzle.solution);
  game.guesses.push(guess); game.current = ''; game.won = guess === puzzle.solution; game.finished = game.won || game.guesses.length === 6;
  persist();
  await Promise.all(tiles[row].map(async (tile,i) => {
    await delay(i*300); tile.className = 'tile flip-in'; await delay(250);
    tile.dataset.state = states[i]; tile.className = 'tile flip-out'; await delay(250); tile.className = 'tile';
  }));
  render(); announce(`${guess.toUpperCase()}: ${states.map((state,i) => `${guess[i].toUpperCase()} ${state}`).join(', ')}.`);
  if (game.won) {
    toast(['Genius','Magnificent','Impressive','Splendid','Great','Phew'][row]);
    tiles[row].forEach((tile,i) => { tile.style.animationDelay = `${i*100}ms`; tile.classList.add('bounce'); });
  } else if (game.finished) toast(puzzle.solution.toUpperCase(),5000);
  const finished = game.finished;
  if (finished) await delay(1600);
  tiles[row].forEach(tile => { tile.classList.remove('bounce'); tile.style.animationDelay=''; });
  busy = false;
  if (rollPending || localDate() !== date) { rollPending = false; checkRollover(); }
  else if (finished) openModal('stats');
}

function example(word,index,state,description) {
  return `<div class="example"><div class="example-row" aria-hidden="true">${[...word].map((c,i)=>`<span class="tile" data-state="${i===index?state:'tbd'}">${c}</span>`).join('')}</div><p>${description}</p></div>`;
}
function fillModal(kind) {
  modalKind = kind;
  let content = '';
  if (kind === 'help') content = `<h2 id="modal-title">How To Play</h2><p class="help-subtitle">Guess the Wordle in 6 tries.</p><ul class="instructions"><li>Each guess must be a valid 5-letter word.</li><li>The color of the tiles will change to show how close your guess was to the word.</li></ul><h3>Examples</h3>${example('WORDY',0,'correct','<strong>W</strong> is in the word and in the correct spot.')}${example('LIGHT',1,'present','<strong>I</strong> is in the word but in the wrong spot.')}${example('ROGUE',3,'absent','<strong>U</strong> is not in the word in any spot.')}<p class="divider">Your progress and statistics are saved on this device.</p><p class="divider">A new puzzle is released daily at midnight in your local timezone.</p>`;
  if (kind === 'settings') content = `<h2 id="modal-title" class="settings-title">Settings</h2>${[
    ['hard','Hard Mode','Any revealed hints must be used in subsequent guesses'],['dark','Dark Theme',''],['contrast','High Contrast Mode','For improved color vision']
  ].map(([key,title,description])=>`<div class="setting"><div><div class="setting-name" id="setting-${key}">${title}</div>${description?`<p>${description}</p>`:''}</div><button class="switch" role="switch" aria-labelledby="setting-${key}" aria-checked="${settings[key]}" data-setting="${key}"></button></div>`).join('')}<p class="small divider">Settings and stats are stored in this browser. <button class="text-link" data-modal="about">About this version</button></p>`;
  if (kind === 'stats') {
    const s = statistics(records,date), largest = Math.max(1,...s.distribution);
    content = `<h2 id="modal-title" class="stats-title">Statistics</h2><div class="stats">${[[s.played,'Played'],[s.winPercent,'Win %'],[s.current,'Current<br>Streak'],[s.max,'Max<br>Streak']].map(([value,label])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><h3>GUESS DISTRIBUTION</h3>${s.played ? s.distribution.map((value,i)=>`<div class="distribution-row"><span>${i+1}</span><div class="bar-space"><div class="bar ${game?.won && game.guesses.length===i+1?'highlight':''}" style="width:${Math.max(8,value/largest*100)}%">${value}</div></div></div>`).join('') : '<p class="center">No data</p>'}${game?.finished?`<div class="stats-bottom"><div><div class="countdown-label">Next Wordle</div><div class="countdown" id="countdown"></div></div><button class="share" id="share">Share <svg viewBox="0 0 24 24"><circle cx="18" cy="4" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="20" r="3"/><path d="m8 10 7-4M8 14l7 4"/></svg></button></div>`:'<p class="small divider center">Finish today’s puzzle to share your results.</p>'}<p class="small center">${game?.hard?'Hard Mode · ':''}Statistics saved on this device.</p>`;
  }
  if (kind === 'about') content = '<h2 id="modal-title">Wordle</h2><p class="instructions">One word. Six guesses. A new puzzle every day at midnight in your local timezone.</p><p class="instructions">Your progress and statistics are saved in this browser. No account needed.</p><p class="small divider">Word dictionary: <a href="https://github.com/tabatkins/wordle-list">Tab Atkins</a> · <a href="data/WORDS-LICENSE.txt">MIT license</a></p>';
  $('#modal-content').innerHTML = content;
  updateCountdown();
}
function openModal(kind) {
  fillModal(kind); if (!$('#modal').open) $('#modal').showModal();
}
function updateCountdown() {
  const element = $('#countdown'); if (!element) return;
  let seconds = Math.max(0,Math.ceil((nextMidnight() - Date.now())/1000));
  element.textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
}
async function share() {
  if (!game?.finished || !puzzle) return;
  const text = shareText(puzzle,game,settings.contrast,settings.dark);
  try {
    if (navigator.share && window.matchMedia('(pointer:coarse)').matches) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('Copied results to clipboard'); }
  } catch (error) {
    if (error.name === 'AbortError') return;
    fillModal('share');
    $('#modal-content').innerHTML = '<h2 id="modal-title">Share results</h2><p>Copy your results below:</p><textarea class="share-copy" readonly aria-label="Share results"></textarea>';
    $('.share-copy').value = text; $('.share-copy').focus(); $('.share-copy').select();
  }
}
function checkRollover() {
  if (localDate() === date) return false;
  if (busy) { rollPending = true; return true; }
  date = localDate();
  if ($('#modal').open) $('#modal').close();
  toast('A new Wordle is ready',3000); loadPuzzle(); return true;
}

$('#play').addEventListener('click',()=>{
  checkRollover(); $('#welcome').hidden = true; $('#game').hidden = false; applySettings();
  if (!saved.seenHelp) { saved.seenHelp = true; persist(); openModal('help'); }
  else if (game?.finished) openModal('stats');
});
$('#retry').addEventListener('click',loadPuzzle);
document.addEventListener('click',event=>{
  const modalButton = event.target.closest('[data-modal]'); if (modalButton) openModal(modalButton.dataset.modal);
  const setting = event.target.closest('[data-setting]');
  if (setting) {
    const key = setting.dataset.setting;
    if (key === 'hard' && game?.guesses.length && !settings.hard) return toast('Hard mode can only be enabled at the start of a round');
    settings[key] = !settings[key];
    if (key === 'hard' && game && !game.finished) game.hard = settings.hard;
    persist(); applySettings(); fillModal('settings');
  }
  if (event.target.closest('#share')) share();
});
$('.close').addEventListener('click',()=>$('#modal').close());
$('#modal').addEventListener('click',event=>{
  if (event.target !== $('#modal')) return;
  const rect = $('#modal').getBoundingClientRect();
  if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) $('#modal').close();
});
$('#modal').addEventListener('close',()=>{ modalKind=''; });
document.addEventListener('keydown',event=>{
  if (event.ctrlKey || event.metaKey || event.altKey || $('#modal').open || !$('#welcome').hidden) return;
  if (/^[a-z]$/i.test(event.key) || ['Enter','Backspace','Delete'].includes(event.key)) { event.preventDefault(); input(event.key); }
});
window.addEventListener('storage',event=>{
  if (event.key!==storageKey || busy) return;
  saved = readSaved(); settings = {...settings,...saved.settings}; records = saved.records || {};
  if (puzzle && records[date]?.puzzleId === puzzle.id) game = records[date];
  applySettings(); render();
});
document.addEventListener('visibilitychange',()=>{ if (!document.hidden) { checkRollover(); if (!puzzle && !loading) loadPuzzle(); } });
window.addEventListener('focus',checkRollover);
window.addEventListener('online',()=>{ if (!puzzle && !loading) loadPuzzle(); });
setInterval(()=>{ checkRollover(); updateCountdown(); },1000);
setInterval(()=>{ if (!puzzle && !loading) loadPuzzle(); },60000);
applySettings(); updateWelcome(); loadPuzzle();
