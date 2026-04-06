'use strict';

const GRADES = Object.freeze({
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
});

const W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912,
]);

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
const D_MIN = 1;
const D_MAX = 10;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeRetrievability(stability, elapsedDays) {
  if (elapsedDays <= 0) return 1.0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

function getInitialStability(grade) {
  return W[grade - 1];
}

function getInitialDifficulty(grade) {
  const d = W[4] - Math.exp(W[5] * (grade - 1)) + 1;
  return clamp(d, D_MIN, D_MAX);
}

function computeNewDifficulty(oldDifficulty, grade) {
  const deltaD = -W[6] * (grade - 3);
  const linearDamping = (10 - oldDifficulty) * deltaD / 9;
  const newD = oldDifficulty + linearDamping;
  const initD4 = getInitialDifficulty(GRADES.EASY);
  const meanReverted = W[7] * (initD4 - newD) + newD;
  return clamp(meanReverted, D_MIN, D_MAX);
}

function computeNewStability(oldStability, difficulty, grade, retrievability) {
  if (grade === GRADES.AGAIN) {
    const lapseS = W[11]
      * Math.pow(difficulty, -W[12])
      * (Math.pow(oldStability + 1, W[13]) - 1)
      * Math.exp(W[14] * (1 - retrievability));
    return Math.min(lapseS, oldStability);
  }
  const hardPenalty = (grade === GRADES.HARD) ? W[15] : 1.0;
  const easyBonus = (grade === GRADES.EASY) ? W[16] : 1.0;
  const sInc = 1
    + hardPenalty * easyBonus * Math.exp(W[8])
    * (11 - difficulty)
    * Math.pow(oldStability, -W[9])
    * (Math.exp(W[10] * (1 - retrievability)) - 1);
  return oldStability * sInc;
}

function determineAction(retrievability) {
  if (retrievability === null || retrievability === undefined) return 'teach_new';
  if (retrievability < 0.3) return 'teach_new';
  if (retrievability > 0.7) return 'skip';
  return 'review';
}

module.exports = {
  GRADES, W, DECAY, FACTOR,
  computeRetrievability, getInitialStability, getInitialDifficulty,
  computeNewDifficulty, computeNewStability, determineAction,
};
