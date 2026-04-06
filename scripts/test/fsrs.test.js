const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRetrievability,
  computeNewStability,
  computeNewDifficulty,
  determineAction,
  getInitialStability,
  getInitialDifficulty,
  GRADES,
} = require('../fsrs.js');

describe('FSRS constants', () => {
  it('exports grade constants', () => {
    assert.equal(GRADES.AGAIN, 1);
    assert.equal(GRADES.HARD, 2);
    assert.equal(GRADES.GOOD, 3);
    assert.equal(GRADES.EASY, 4);
  });
});

describe('computeRetrievability', () => {
  it('returns 0.9 when elapsed days equals stability', () => {
    const r = computeRetrievability(10, 10);
    assert.ok(Math.abs(r - 0.9) < 0.001, `Expected ~0.9, got ${r}`);
  });

  it('returns 1.0 when elapsed days is 0', () => {
    const r = computeRetrievability(10, 0);
    assert.ok(Math.abs(r - 1.0) < 0.001, `Expected ~1.0, got ${r}`);
  });

  it('returns 0.0 for zero stability', () => {
    const r = computeRetrievability(0, 5);
    assert.equal(r, 0.0);
  });

  it('returns 0.0 for negative stability', () => {
    const r = computeRetrievability(-1, 5);
    assert.equal(r, 0.0);
  });

  it('returns value between 0 and 1 for positive elapsed days', () => {
    const r = computeRetrievability(5, 20);
    assert.ok(r > 0 && r < 1, `Expected 0 < r < 1, got ${r}`);
  });

  it('decreases as elapsed days increase', () => {
    const r1 = computeRetrievability(10, 5);
    const r2 = computeRetrievability(10, 15);
    assert.ok(r1 > r2, `Expected r1 > r2, got ${r1} <= ${r2}`);
  });

  it('is higher for greater stability at same elapsed time', () => {
    const r1 = computeRetrievability(20, 10);
    const r2 = computeRetrievability(5, 10);
    assert.ok(r1 > r2, `Expected r1 > r2, got ${r1} <= ${r2}`);
  });
});

describe('getInitialStability', () => {
  it('returns w0 for Again', () => {
    const s = getInitialStability(GRADES.AGAIN);
    assert.ok(Math.abs(s - 0.212) < 0.001);
  });
  it('returns w1 for Hard', () => {
    const s = getInitialStability(GRADES.HARD);
    assert.ok(Math.abs(s - 1.2931) < 0.001);
  });
  it('returns w2 for Good', () => {
    const s = getInitialStability(GRADES.GOOD);
    assert.ok(Math.abs(s - 2.3065) < 0.001);
  });
  it('returns w3 for Easy', () => {
    const s = getInitialStability(GRADES.EASY);
    assert.ok(Math.abs(s - 8.2956) < 0.001);
  });
  it('increases with better grades', () => {
    const s1 = getInitialStability(GRADES.AGAIN);
    const s2 = getInitialStability(GRADES.HARD);
    const s3 = getInitialStability(GRADES.GOOD);
    const s4 = getInitialStability(GRADES.EASY);
    assert.ok(s1 < s2 && s2 < s3 && s3 < s4);
  });
});

describe('getInitialDifficulty', () => {
  it('returns highest difficulty for Again', () => {
    const d = getInitialDifficulty(GRADES.AGAIN);
    assert.ok(d > 5, `Expected > 5, got ${d}`);
  });
  it('returns lowest difficulty for Easy', () => {
    const d = getInitialDifficulty(GRADES.EASY);
    assert.ok(d >= 1, `Expected >= 1, got ${d}`);
  });
  it('is clamped between 1 and 10', () => {
    for (const g of [1, 2, 3, 4]) {
      const d = getInitialDifficulty(g);
      assert.ok(d >= 1 && d <= 10, `Grade ${g}: expected 1-10, got ${d}`);
    }
  });
  it('decreases with better grades', () => {
    const d1 = getInitialDifficulty(GRADES.AGAIN);
    const d2 = getInitialDifficulty(GRADES.HARD);
    const d3 = getInitialDifficulty(GRADES.GOOD);
    assert.ok(d1 > d2 && d2 > d3, `Expected d1 > d2 > d3, got ${d1}, ${d2}, ${d3}`);
  });
});

describe('computeNewDifficulty', () => {
  it('increases difficulty on Again', () => {
    const d = computeNewDifficulty(5.0, GRADES.AGAIN);
    assert.ok(d > 5.0, `Expected > 5.0, got ${d}`);
  });
  it('does not change difficulty on Good', () => {
    const d = computeNewDifficulty(5.0, GRADES.GOOD);
    assert.ok(Math.abs(d - 5.0) < 0.1, `Expected ~5.0, got ${d}`);
  });
  it('decreases difficulty on Easy', () => {
    const d = computeNewDifficulty(5.0, GRADES.EASY);
    assert.ok(d < 5.0, `Expected < 5.0, got ${d}`);
  });
  it('is always clamped between 1 and 10', () => {
    const d1 = computeNewDifficulty(1.0, GRADES.EASY);
    const d2 = computeNewDifficulty(10.0, GRADES.AGAIN);
    assert.ok(d1 >= 1 && d1 <= 10, `Expected 1-10, got ${d1}`);
    assert.ok(d2 >= 1 && d2 <= 10, `Expected 1-10, got ${d2}`);
  });
  it('dampens changes near boundary', () => {
    const change_mid = computeNewDifficulty(5.0, GRADES.AGAIN) - 5.0;
    const change_high = computeNewDifficulty(9.0, GRADES.AGAIN) - 9.0;
    assert.ok(change_mid > change_high,
      `Expected larger change at D=5 than D=9, got ${change_mid} vs ${change_high}`);
  });
});

describe('computeNewStability', () => {
  it('increases stability on Good', () => {
    const s = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.5);
    assert.ok(s > 5.0, `Expected > 5.0, got ${s}`);
  });
  it('increases stability on Hard (Hard is a passing grade)', () => {
    const s = computeNewStability(5.0, 5.0, GRADES.HARD, 0.5);
    assert.ok(s > 5.0, `Expected > 5.0, got ${s}`);
  });
  it('gives larger increase for Easy than Good', () => {
    const sGood = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.5);
    const sEasy = computeNewStability(5.0, 5.0, GRADES.EASY, 0.5);
    assert.ok(sEasy > sGood, `Expected Easy > Good, got ${sEasy} vs ${sGood}`);
  });
  it('gives smaller increase for Hard than Good', () => {
    const sHard = computeNewStability(5.0, 5.0, GRADES.HARD, 0.5);
    const sGood = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.5);
    assert.ok(sHard < sGood, `Expected Hard < Good, got ${sHard} vs ${sGood}`);
  });
  it('decreases stability on Again (lapse)', () => {
    const s = computeNewStability(10.0, 5.0, GRADES.AGAIN, 0.5);
    assert.ok(s < 10.0, `Expected < 10.0 (lapse), got ${s}`);
  });
  it('never increases stability on lapse', () => {
    const s = computeNewStability(1.0, 5.0, GRADES.AGAIN, 0.9);
    assert.ok(s <= 1.0, `Expected <= 1.0 on lapse, got ${s}`);
  });
  it('gives larger increase at low retrievability (desirable difficulty)', () => {
    const sLowR = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.3);
    const sHighR = computeNewStability(5.0, 5.0, GRADES.GOOD, 0.8);
    assert.ok(sLowR > sHighR,
      `Expected larger increase at low R, got ${sLowR} vs ${sHighR}`);
  });
});

describe('determineAction', () => {
  it('returns teach_new for R < 0.3', () => {
    assert.equal(determineAction(0.0), 'teach_new');
    assert.equal(determineAction(0.29), 'teach_new');
  });
  it('returns review for 0.3 <= R <= 0.7', () => {
    assert.equal(determineAction(0.3), 'review');
    assert.equal(determineAction(0.5), 'review');
    assert.equal(determineAction(0.7), 'review');
  });
  it('returns skip for R > 0.7', () => {
    assert.equal(determineAction(0.71), 'skip');
    assert.equal(determineAction(1.0), 'skip');
  });
  it('returns teach_new for null (new concept)', () => {
    assert.equal(determineAction(null), 'teach_new');
  });
});
