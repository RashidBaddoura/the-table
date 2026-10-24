import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, nextMidnight, score, hardModeError, selectPuzzle, statistics, shareText } from '../wordle/lib/game.mjs';

test('duplicate letters consume only available answer letters, with greens first',()=>{
  assert.deepEqual(score('allee','apple'),['correct','present','absent','absent','correct']);
  assert.deepEqual(score('eerie','serve'),['absent','correct','correct','absent','correct']);
  assert.deepEqual(score('sissy','sissy'),Array(5).fill('correct'));
});
test('hard mode preserves positions and the minimum count of duplicate hints',()=>{
  assert.equal(hardModeError('crane',['apple'],'ample'),'1st letter must be A');
  assert.match(hardModeError('about',['eerie'],'serve'),/letter must be E/);
  assert.match(hardModeError('spear',['eerie'],'serve'),/letter must be E/);
  assert.equal(hardModeError('ample',['apple'],'ample'),'');
  assert.equal(hardModeError('cared',['array'],'rarer'),'Guess must contain 2 Rs');
});
test('only the exact local date is selected, with no previous/future fallback',()=>{
  const puzzle = {date:'2026-10-24',solution:'apple',number:1953};
  const feed = {puzzles:{'2026-10-24':puzzle}};
  assert.equal(selectPuzzle(feed,'2026-10-24'),puzzle);
  assert.equal(selectPuzzle(feed,'2026-10-23'),null);
  assert.equal(selectPuzzle(feed,'2026-10-25'),null);
});
test('local midnight follows the local calendar in all tested timezones, including DST',()=>{
  const oldTZ = process.env.TZ;
  try {
    for (const zone of ['America/New_York','Pacific/Kiritimati','Pacific/Honolulu','Asia/Kolkata']) {
      process.env.TZ=zone;
      const before = new Date(2026,9,24,23,59,59);
      assert.equal(localDate(before),'2026-10-24');
      assert.equal(nextMidnight(before)-before.getTime(),1000);
      assert.equal(localDate(new Date(nextMidnight(before))),'2026-10-25');
    }
    process.env.TZ='America/New_York';
    const spring = new Date(2026,2,8), fall = new Date(2026,10,1);
    assert.equal(nextMidnight(spring)-spring.getTime(),23*3600000);
    assert.equal(nextMidnight(fall)-fall.getTime(),25*3600000);
  } finally { if(oldTZ===undefined) delete process.env.TZ; else process.env.TZ=oldTZ; }
});
test('stats handle skipped days, loss, current streak and finished games only',()=>{
  const win = n=>({finished:true,won:true,guesses:Array(n).fill('apple')});
  const records = {'2026-10-20':win(2),'2026-10-21':win(3),'2026-10-23':win(1),'2026-10-24':{finished:false,guesses:[]}};
  assert.deepEqual(statistics(records,'2026-10-24'),{played:3,winPercent:100,current:1,max:2,distribution:[1,1,1,0,0,0]});
  assert.equal(statistics(records,'2026-10-25').current,0);
  records['2026-10-24']={finished:true,won:false,guesses:Array(6).fill('crane')};
  assert.equal(statistics(records,'2026-10-24').current,0);
  assert.equal(statistics(records,'2026-10-24').winPercent,75);
});
test('sharing reveals colors, not answer text, and includes hard mode',()=>{
  assert.equal(shareText({number:1953,solution:'apple'},{won:true,hard:true,guesses:['apple']}),'Wordle 1953 1/6*\n\n🟩🟩🟩🟩🟩');
});
