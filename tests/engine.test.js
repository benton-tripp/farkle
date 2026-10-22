'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const base = E.DEFAULT_RULES;
function roll(nums, rules = base) { return E.scoreOptions(E.countsFromDice(nums), rules); }
function whole(nums, rules = base) { return roll(nums, rules).find(o => o.used === nums.length); }
function high(nums, rules = base) { return Math.max(0, ...roll(nums, rules).map(x => x.score)); }

test('all one through six dice outcome multiplicities sum to 6^n', () => {
  for (let n = 1; n <= 6; n++) {
    const out = E.allMultisets(n);
    assert.equal(out.reduce((a, o) => a + o.ways, 0), 6 ** n);
    assert.equal(out.length, [0, 6, 21, 56, 126, 252, 462][n]);
  }
});
test('known exact Farkle probabilities for three-pairs enabled', () => {
  const d = E.buildOutcomes(base);
  assert.deepEqual(d.odds.slice(1).map(o => o.farkleWays), [4, 16, 60, 204, 600, 1080]);
  assert.deepEqual(d.odds.slice(1).map(o => o.denominator), [6, 36, 216, 1296, 7776, 46656]);
});
test('if three pairs are disabled, six-dice Farkles increase by exactly 360 outcomes', () => {
  const d = E.buildOutcomes({ ...base, threePairs: 0 });
  assert.equal(d.odds[6].farkleWays, 1440);
  for (let n = 1; n < 6; n++) assert.equal(d.odds[n].farkleWays, [0, 4, 16, 60, 204, 600][n]);
});
test('singles are scored and do not become triples between different rolls', () => {
  assert.equal(high([1]), 100);
  assert.equal(high([5]), 50);
  assert.equal(high([2]), 0);
  assert.equal(high([1, 5]), 150);
  assert.equal(roll([1, 5]).length, 3);
  assert.equal(whole([1, 5]).score, 150);
});
test('two distinct triplets and three pairs are supported', () => {
  assert.equal(whole([1, 1, 1, 2, 2, 2]).score, 2500);
  assert.equal(whole([2, 2, 3, 3, 6, 6]).score, 1500);
  assert.equal(high([2, 2, 3, 3, 6, 6], { ...base, threePairs: 0 }), 0);
  assert.equal(high([1, 1, 1, 2, 2, 2], { ...base, twoTriples: 0 }), 1200);
});
test('straight consumes all dice, with configurable value', () => {
  assert.equal(whole([6, 1, 5, 2, 4, 3]).score, 1500);
  assert.equal(whole([6, 1, 5, 2, 4, 3], { ...base, straight: 1000 }).score, 1000);
  assert.equal(high([2, 3, 4, 6, 5, 1], { ...base, straight: 0 }), 150);
});
test('4, 5, 6 of a kind follow selected multiplier rule', () => {
  assert.equal(whole([4, 4, 4, 4]).score, 800);
  assert.equal(whole([4, 4, 4, 4, 4]).score, 1600);
  assert.equal(whole([4, 4, 4, 4, 4, 4]).score, 3200);
  assert.equal(whole([4, 4, 4, 4, 4, 4], { ...base, kindMode: 'linear' }).score, 1600);
  assert.equal(whole([4, 4, 4, 4, 4, 4], { ...base, kindMode: 'fixed' }).score, 3000);
});
test('four of a kind + different pair bonus can be switched off', () => {
  const nums = [2, 2, 2, 2, 6, 6];
  assert.equal(whole(nums).score, 1500);
  assert.equal(whole(nums, { ...base, fourPlusPair: 0 }), undefined);
});
test('the score of each selected subset is the maximum valid partition score', () => {
  // A flat four-of-a-kind bonus can be worse than triple aces + single ace.
  assert.equal(whole([1, 1, 1, 1], { ...base, kindMode: 'fixed' }).score, 1100);
  const opts = roll([1, 5, 2, 3, 6, 6]);
  assert.deepEqual(opts.map(o => [o.dice, o.score, o.nextDice]), [
    [[1, 5], 150, 4], [[1], 100, 5], [[5], 50, 5]
  ]);
});
test('the turn EV policy returns a feasible banking or rolling action', () => {
  const d = E.buildOutcomes(base);
  const p = E.solve(d, { objective: 'ev', banked: 1000, goal: 10000, entered: true });
  assert.equal(p.getState(6, 0).action, 'roll');
  assert.equal(p.getState(1, 2000).action, 'bank');
  assert.ok(p.getState(6, 0).ev > 0);
  assert.ok(p.getState(1, 2000).ev >= 2000);
  assert.ok(p.getState(1, 1000).farkleProb >= 0 && p.getState(1, 1000).farkleProb <= 1);
});
test('zero-entry policy permits banking after first scored roll', () => {
  const d = E.buildOutcomes({ ...base, minEntry: 0 });
  const p = E.solve(d, { objective: 'ev', banked: 0, goal: 10000, entered: false });
  assert.equal(p.getState(1, 100).canBank, true);
  assert.equal(p.getState(1, 0).canBank, false);
});
test('hot-dice compulsory reroll and entry threshold actually constrain banking', () => {
  const d = E.buildOutcomes({ ...base, forceHot: true });
  const p = E.solve(d, { objective: 'ev', banked: 1000, goal: 10000, entered: true });
  assert.equal(p.getState(6, 2500).canBank, false);
  assert.equal(p.getState(6, 2500).action, 'roll');
  assert.equal(p.getState(1, 2500).canBank, true);
  const unentered = E.solve(E.buildOutcomes(base), { objective: 'ev', banked: 0, goal: 10000, entered: false });
  assert.equal(unentered.getState(3, 450).canBank, false);
  assert.equal(unentered.getState(3, 500).canBank, true);
});
test('three-strike Farkle penalty affects EV, not one-roll Farkle probability', () => {
  const withPenalty = E.buildOutcomes({ ...base, streakPenalty: 1000, previousFarkles: 2 });
  const without = E.buildOutcomes(base);
  const a = E.solve(withPenalty, { objective: 'ev', banked: 1000, goal: 10000, entered: true });
  const b = E.solve(without, { objective: 'ev', banked: 1000, goal: 10000, entered: true });
  assert.equal(withPenalty.odds[3].farkle, without.odds[3].farkle);
  assert.ok(a.getRoll(3, 200).ev < b.getRoll(3, 200).ev);
});
test('goal objective returns probability of reaching target this turn', () => {
  const d = E.buildOutcomes(base);
  const p = E.solve(d, { objective: 'goal', banked: 9900, goal: 10000, entered: true });
  assert.equal(p.getState(4, 100).action, 'bank');
  assert.equal(p.getState(4, 100).goalProb, 1);
  const noGoal = p.getState(4, 0);
  assert.equal(noGoal.action, 'roll');
  assert.ok(noGoal.goalProb > 0 && noGoal.goalProb < 1);
});
test('example roll exposes recommended action and all scoring subsets', () => {
  const res = E.examine({rules: base, turn: 300, banked: 1100, goal: 10000, entered: true, objective: 'ev',
    dice: [1, 5, 2, 3, 6, 6], nextDice: 6, hotReady: false});
  assert.equal(res.result.status, 'rolled');
  assert.equal(res.result.moves.length, 3);
  assert.ok(res.result.moves[0].ev >= res.result.moves[1].ev);
  assert.equal(res.result.moves.find(o => o.score === 100).nextDice, 5);
});

// Independent reference scorer: score each face separately, then compare the
// applicable six-dice patterns. It does not use the engine's meld enumeration.
function referenceWhole(counts, rules) {
  const faceScores = counts.map((count, index) => {
    const face = index + 1;
    const values = [0];
    const triple = face === 1 ? rules.tripleOnes : face * 100;
    for (let size = 1; size <= count; size++) {
      const candidates = [];
      if (face === 1 || face === 5) candidates.push(values[size - 1] + (face === 1 ? 100 : 50));
      if (size >= 3) candidates.push(values[size - 3] + triple);
      for (let group = 4; group <= size; group++) {
        if (rules.kindMode === 'doubling') candidates.push(values[size - group] + triple * 2 ** (group - 3));
        if (rules.kindMode === 'linear') candidates.push(values[size - group] + triple * (group - 2));
        if (rules.kindMode === 'fixed') candidates.push(values[size - group] + 1000 * (group - 3));
      }
      values[size] = Math.max(-Infinity, ...candidates);
    }
    return values[count];
  });
  let score = faceScores.reduce((a, b) => a + b, 0);
  if (counts.reduce((a, b) => a + b, 0) === 6) {
    if (rules.straight && counts.every(c => c === 1)) score = Math.max(score, rules.straight);
    if (rules.threePairs && counts.filter(c => c === 2).length === 3) score = Math.max(score, rules.threePairs);
    if (rules.twoTriples && counts.filter(c => c === 3).length === 2) score = Math.max(score, rules.twoTriples);
    if (rules.fourPlusPair && counts.includes(4) && counts.includes(2)) score = Math.max(score, rules.fourPlusPair);
  }
  return score;
}
function referenceSubsets(counts, rules) {
  const expected = new Map();
  function walk(i, subset) {
    if (i === 6) {
      const score = referenceWhole(subset, rules);
      if (score > 0) expected.set(subset.join(''), score);
      return;
    }
    for (let c = 0; c <= counts[i]; c++) walk(i + 1, [...subset, c]);
  }
  walk(0, []);
  return expected;
}

test('all scoring subsets match an independent oracle across 4,615 roll/rule cases', () => {
  const rulesets = [E.PRESETS.doubling, E.PRESETS.linear, E.PRESETS.fixed,
    { ...base, kindMode: 'none' },
    { ...base, threePairs: 0, twoTriples: 0, straight: 0, fourPlusPair: 0, tripleOnes: 300 }];
  let cases = 0;
  for (const rules of rulesets) for (let n = 1; n <= 6; n++) {
    for (const outcome of E.allMultisets(n)) {
      const expected = referenceSubsets(outcome.counts, rules);
      const actual = E.scoreOptions(outcome.counts, rules);
      assert.equal(actual.length, expected.size);
      for (const choice of actual) {
        assert.equal(choice.score, expected.get(choice.key), `${outcome.key}: ${choice.key}`);
        assert.equal(choice.hot, choice.used === n);
        assert.equal(choice.nextDice, choice.hot ? 6 : n - choice.used);
      }
      cases++;
    }
  }
  assert.equal(cases, 4615);
});

test('ordered enumeration independently verifies Farkle and all-dice-score counts', () => {
  for (const rules of [base, { ...base, threePairs: 0 }]) {
    const data = E.buildOutcomes(rules);
    for (let n = 1; n <= 6; n++) {
      let farkles = 0, allScore = 0;
      for (let code = 0; code < 6 ** n; code++) {
        const counts = [0, 0, 0, 0, 0, 0];
        let remainder = code;
        for (let die = 0; die < n; die++) { counts[remainder % 6]++; remainder = Math.floor(remainder / 6); }
        const scorer = counts[0] > 0 || counts[4] > 0 || counts.some(c => c >= 3) ||
          (rules.threePairs > 0 && counts.filter(c => c === 2).length === 3);
        if (!scorer) farkles++;
        if (referenceWhole(counts, rules) > 0) allScore++;
      }
      assert.equal(data.odds[n].farkleWays, farkles);
      assert.equal(data.odds[n].hotWays, allScore);
    }
  }
});

test('the fixed preset uses the published 300-point three-ones award', () => {
  assert.equal(whole([1, 1, 1], E.PRESETS.fixed).score, 300);
  assert.equal(whole([1, 1, 1, 1], E.PRESETS.fixed).score, 1000);
  assert.equal(whole([1, 1, 1, 1, 1], E.PRESETS.fixed).score, 2000);
  assert.equal(whole([1, 1, 1, 1, 1, 1], E.PRESETS.fixed).score, 3000);
});

test('special awards never double-count overlapping dice', () => {
  assert.equal(whole([1, 1, 1, 1, 5, 5]).score, 2100);
  assert.equal(whole([6, 6, 6, 6, 6, 6], { ...base, kindMode: 'none' }).score, 1200);
  assert.equal(whole([2, 2, 2, 3, 3, 3], { ...base, twoTriples: 0 }).score, 500);
});

test('invalid rules and scores are rejected instead of rounded or clamped', () => {
  for (const turn of [-50, 25, '', null, NaN, Infinity, 100050]) assert.throws(() => E.validateInput({ turn }));
  for (const banked of [-50, 1, null, NaN, 100050]) assert.throws(() => E.validateInput({ banked }));
  for (const goal of [0, 25, null, Infinity, 100050]) assert.throws(() => E.validateInput({ goal }));
  for (const n of [0, 7, 1.5, NaN]) assert.throws(() => E.allMultisets(n));
  assert.throws(() => E.normalizeRules({ straight: 1251 }));
  assert.throws(() => E.normalizeRules({ forceHot: 'false' }));
  assert.throws(() => E.normalizeRules({ previousFarkles: 3 }));
  assert.throws(() => E.validateInput({ objective: 'unknown' }));
  assert.throws(() => E.validateInput([]));
  assert.throws(() => E.validateInput({ entered: null }));
  assert.throws(() => E.validateInput({ hotReady: null }));
  assert.throws(() => E.validateInput({ objective: 'goal', banked: 10000, goal: 10000 }));
  assert.throws(() => E.scoreOptions([1, 1, 1, 1, 1, -1], base));
  assert.throws(() => E.scoreOptions([7, 0, 0, 0, 0, 0], base));
  assert.throws(() => E.countsFromDice([1, 2, 7]));
  assert.throws(() => E.countsFromDice([1, 1, 1, 1, 1, 1, 1]));
});

test('goal comparisons preserve small but material probability differences', () => {
  const a = { goalProb: 2e-14, ev: 100, farkleProb: 0.9, action: 'roll' };
  const b = { goalProb: 1e-14, ev: 1000, farkleProb: 0.1, action: 'bank' };
  assert.equal(E.prefer(a, b, 'goal'), true);
  assert.equal(E.prefer(b, a, 'goal'), false);
  assert.equal(E.prefer(a, b, 'ev'), false);
});

function close(a, b, tolerance = 1e-8) {
  assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
}
function rollReference(data, solver, n, t, objective) {
  const output = { ev: 0, farkleProb: 0, goalProb: 0, action: 'roll' };
  for (const outcome of data.outcomes[n]) {
    let best;
    if (!outcome.options.length) {
      best = { ev: -solver.penalty, farkleProb: 1,
        goalProb: solver.banked - solver.penalty >= solver.goal ? 1 : 0 };
    } else for (const option of outcome.options) {
      const value = solver.getState(option.nextDice, t + option.score);
      if (!best || E.prefer(value, best, objective)) best = value;
    }
    for (const key of ['ev', 'farkleProb', 'goalProb']) output[key] += outcome.prob * best[key];
  }
  return output;
}

test('the Bellman equations hold below, at, and above the derived boundary', () => {
  for (const objective of ['ev', 'goal']) for (const forceHot of [false, true]) {
    const data = E.buildOutcomes({ ...base, forceHot, streakPenalty: 1000, previousFarkles: 2 });
    const solver = E.solve(data, { objective, entered: false, banked: 500, goal: 10000 });
    const limit = solver.boundary.threshold;
    for (const t of [0, 50, 450, 500, 1500, 9500, 30000, limit - 50, limit, limit + 50, limit * 2]) {
      for (let n = 1; n <= 6; n++) {
        const current = solver.getState(n, t);
        const roll = rollReference(data, solver, n, t, objective);
        const bank = current.canBank ? { ev: t, farkleProb: 0, goalProb: 500 + t >= 10000 ? 1 : 0, action: 'bank' } : null;
        const best = bank && E.prefer(bank, roll, objective) ? bank : roll;
        close(current.ev, best.ev);
        close(current.farkleProb, best.farkleProb, 1e-12);
        close(current.goalProb, best.goalProb, 1e-12);
        assert.equal(current.action, best.action);
        if (current.action === 'bank') assert.equal(current.canBank, true);
      }
    }
  }
});

test('forced hot dice cannot bank even beyond the old 90,000-point cap', () => {
  const data = E.buildOutcomes({ ...base, forceHot: true });
  const solver = E.solve(data, { entered: true, banked: 1000 });
  for (const t of [30000, 90000, 100000, 500000]) {
    const state = solver.getState(6, t);
    assert.equal(state.action, 'roll');
    assert.equal(state.canBank, false);
    assert.ok(state.farkleProb > 0);
  }
  const result = E.examine({ rules: { ...base, forceHot: true }, turn: 100000,
    banked: 1000, entered: true, dice: [1] }).result;
  assert.equal(result.moves[0].hot, true);
  assert.equal(result.moves[0].action, 'roll');
});

test('enlarging the valid boundary does not change the policy values', () => {
  for (const objective of ['ev', 'goal']) for (const forceHot of [false, true]) {
    const data = E.buildOutcomes({ ...base, forceHot });
    const first = E.solve(data, { objective, entered: true, banked: 500 });
    const larger = E.solve(data, { objective, entered: true, banked: 500,
      boundaryFloor: first.boundary.threshold + 20000 });
    for (const t of [0, 100, 300, 500, 1000, 3000, 10000, 100000]) for (let n = 1; n <= 6; n++) {
      const a = first.getState(n, t), b = larger.getState(n, t);
      close(a.ev, b.ev, 1e-7);
      close(a.farkleProb, b.farkleProb, 1e-11);
      close(a.goalProb, b.goalProb, 1e-11);
      assert.equal(a.action, b.action);
    }
  }
});

test('the penalty is capped by banked points and affects only a third Farkle', () => {
  for (const previousFarkles of [0, 1, 2]) {
    const data = E.buildOutcomes({ ...base, streakPenalty: 1000, previousFarkles });
    const solver = E.solve(data, { entered: true, banked: 250 });
    assert.equal(solver.penalty, previousFarkles === 2 ? 250 : 0);
    const bust = E.examine({ rules: data.rules, banked: 250, turn: 500, dice: [2, 3, 6] }).result;
    assert.equal(bust.status, 'farkle');
    assert.equal(bust.penalty, solver.penalty);
  }
});

test('cached and uncached answers agree after scoring, gameplay, and objective changes', () => {
  let dataCache, solutionCache;
  const changes = [{}, { forceHot: true }, { threePairs: 0 }, { previousFarkles: 2, streakPenalty: 500 }];
  for (const patch of changes) {
    const input = { rules: { ...base, ...patch }, banked: 500, turn: 300, entered: true,
      goal: 10000, objective: patch.threePairs === 0 ? 'goal' : 'ev', dice: [1, 5, 2, 3, 6, 6] };
    const cached = E.examine(input, dataCache, solutionCache);
    assert.deepEqual(cached.result, E.examine(input).result);
    dataCache = cached.dataCache; solutionCache = cached.solutionCache;
  }
});

test('target probabilities refer to the banked score at the end of the turn', () => {
  const data = E.buildOutcomes(base);
  const solver = E.solve(data, { entered: true, banked: 10000, goal: 10000 });
  close(solver.getState(6, 0).goalProb, 1, 1e-12);
  const penalized = E.solve(E.buildOutcomes({ ...base, previousFarkles: 2, streakPenalty: 500 }),
    { entered: true, banked: 10000, goal: 10000 });
  assert.ok(penalized.getState(6, 0).goalProb < 1);
});

test('turn-policy probabilities and expected values satisfy basic bounds', () => {
  for (const rules of Object.values(E.PRESETS)) {
    const data = E.buildOutcomes(rules);
    const solver = E.solve(data, { entered: true, banked: 1000 });
    for (let t = 0; t <= 20000; t += 250) for (let n = 1; n <= 6; n++) {
      const state = solver.getState(n, t);
      assert.ok(Number.isFinite(state.ev));
      assert.ok(state.farkleProb >= 0 && state.farkleProb <= 1);
      assert.ok(state.goalProb >= 0 && state.goalProb <= 1);
      if (state.canBank) assert.ok(state.ev >= t - 1e-8);
      if (state.action === 'bank') assert.equal(state.farkleProb, 0);
      else assert.ok(state.farkleProb >= data.odds[n].farkle - 1e-12);
    }
  }
});

test('a solver cannot use outcomes built for different scoring rules', () => {
  const data = E.buildOutcomes(base);
  assert.throws(() => E.solve(data, { rules: { ...base, tripleOnes: 300 } }), /Rebuild the outcome table/);
});
