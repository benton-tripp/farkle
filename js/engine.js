(function (root) {
  'use strict';

  const FACT = [1, 1, 2, 6, 24, 120, 720];
  const DEFAULT_RULES = Object.freeze({
    tripleOnes: 1000,
    kindMode: 'doubling',
    straight: 1500,
    threePairs: 1500,
    twoTriples: 2500,
    fourPlusPair: 1500,
    minEntry: 500,
    forceHot: false,
    streakPenalty: 0,
    previousFarkles: 0
  });
  const SCORE_UNIT = 50;
  const MAX_INPUT = 100000;
  const PRESETS = Object.freeze({
    doubling: Object.freeze({ ...DEFAULT_RULES }),
    linear: Object.freeze({ ...DEFAULT_RULES, kindMode: 'linear', straight: 1000,
      threePairs: 750, twoTriples: 0, fourPlusPair: 0, minEntry: 0 }),
    fixed: Object.freeze({ ...DEFAULT_RULES, tripleOnes: 300, kindMode: 'fixed' })
  });
  const RULE_OPTIONS = Object.freeze({
    tripleOnes: [300, 1000],
    kindMode: ['doubling', 'linear', 'fixed', 'none'],
    straight: [0, 1000, 1500, 3000],
    threePairs: [0, 500, 750, 1000, 1500],
    twoTriples: [0, 1500, 2500],
    fourPlusPair: [0, 1500],
    minEntry: [0, 350, 500, 1000],
    streakPenalty: [0, 500, 1000],
    previousFarkles: [0, 1, 2]
  });

  function integer(value, name, min, max, unit = 1) {
    if (!Number.isSafeInteger(value) || value < min || value > max || value % unit !== 0) {
      throw Error(`${name} must be an integer from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}${unit > 1 ? ` in steps of ${unit}` : ''}.`);
    }
    return value;
  }
  function boolean(value, name) {
    if (typeof value !== 'boolean') throw Error(`${name} must be true or false.`);
    return value;
  }
  function normalizeRules(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Scoring rules must be an object.');
    const r = { ...DEFAULT_RULES, ...input };
    for (const [key, values] of Object.entries(RULE_OPTIONS)) {
      if (!values.includes(r[key])) throw Error(`Unsupported value for ${key}. Choose one of the available rules.`);
    }
    boolean(r.forceHot, 'Forced hot-dice reroll');
    return Object.fromEntries(Object.keys(DEFAULT_RULES).map(key => [key, r[key]]));
  }
  function validateInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Enter a game state.');
    const field = (key, fallback) => input[key] === undefined ? fallback : input[key];
    const rules = normalizeRules(input.rules);
    const dice = input.dice === undefined ? [] : input.dice;
    countsFromDice(dice);
    const turn = integer(field('turn', 0), 'Turn points', 0, MAX_INPUT, SCORE_UNIT);
    const banked = integer(field('banked', 0), 'Banked points', 0, MAX_INPUT, SCORE_UNIT);
    const goal = integer(field('goal', 10000), 'Target score', SCORE_UNIT, MAX_INPUT, SCORE_UNIT);
    const objective = field('objective', 'ev');
    if (!['ev', 'goal'].includes(objective)) throw Error('Choose a valid objective.');
    if (objective === 'goal' && banked >= goal) {
      throw Error('Banked points already meet the target. Raise the target or choose expected points.');
    }
    return { rules, dice: dice.slice(), turn, banked, goal, objective,
      entered: boolean(field('entered', false), 'Entry status'),
      nextDice: integer(field('nextDice', 6), 'Available dice', 1, 6),
      hotReady: boolean(field('hotReady', false), 'Hot dice') };
  }
  function tripleValue(face, rules) { return face === 1 ? rules.tripleOnes : face * 100; }
  function kindValue(face, n, rules) {
    const base = tripleValue(face, rules);
    if (n === 3) return base;
    if (rules.kindMode === 'doubling') return base * Math.pow(2, n - 3);
    if (rules.kindMode === 'linear') return base * (n - 2);
    if (rules.kindMode === 'fixed') return { 4: 1000, 5: 2000, 6: 3000 }[n];
    return null;
  }
  function sumCounts(counts) { return counts[0] + counts[1] + counts[2] + counts[3] + counts[4] + counts[5]; }
  function countKey(counts) { return counts.join(''); }
  function countsFromDice(dice) {
    if (!Array.isArray(dice) || dice.length > 6) throw Error('Enter zero to six dice.');
    const counts = [0, 0, 0, 0, 0, 0];
    dice.forEach(x => {
      if (!Number.isInteger(x) || x < 1 || x > 6) throw Error('Each die must have a face from 1 to 6.');
      counts[x - 1]++;
    });
    return counts;
  }
  function diceFromCounts(counts) {
    const result = [];
    counts.forEach((v, i) => { for (let j = 0; j < v; j++) result.push(i + 1); });
    return result;
  }
  function allMultisets(n) {
    integer(n, 'Dice count', 1, 6);
    const result = [];
    function walk(i, remaining, arr) {
      if (i === 5) {
        const counts = arr.concat([remaining]);
        const ways = FACT[n] / counts.reduce((a, c) => a * FACT[c], 1);
        result.push({ counts, ways, prob: ways / Math.pow(6, n), key: countKey(counts) });
        return;
      }
      for (let c = 0; c <= remaining; c++) walk(i + 1, remaining - c, arr.concat([c]));
    }
    walk(0, n, []);
    return result;
  }
  function generateMelds(counts, r) {
    const melds = [];
    function add(required, points, label) {
      if (!Number.isFinite(points) || points <= 0) return;
      if (required.every((v, i) => v <= counts[i])) {
        melds.push({ need: required, points, text: label });
      }
    }
    for (let face = 1; face <= 6; face++) {
      if (face === 1 || face === 5) {
        const a = [0, 0, 0, 0, 0, 0]; a[face - 1] = 1;
        add(a, face === 1 ? 100 : 50, `single ${face}`);
      }
      for (let k = 3; k <= counts[face - 1]; k++) {
        const a = [0, 0, 0, 0, 0, 0]; a[face - 1] = k;
        add(a, kindValue(face, k, r), `${k} × ${face}`);
      }
    }
    if (r.straight > 0) add([1, 1, 1, 1, 1, 1], r.straight, 'straight (1–6)');
    if (r.threePairs > 0) {
      for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++)
        for (let c = b + 1; c < 6; c++) {
          const need = [0, 0, 0, 0, 0, 0];
          need[a] = need[b] = need[c] = 2;
          add(need, r.threePairs, 'three pairs');
        }
    }
    if (r.twoTriples > 0) {
      for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
        const need = [0, 0, 0, 0, 0, 0]; need[a] = need[b] = 3;
        add(need, r.twoTriples, 'two triplets');
      }
    }
    if (r.fourPlusPair > 0) {
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
        if (a === b) continue;
        const need = [0, 0, 0, 0, 0, 0]; need[a] = 4; need[b] = 2;
        add(need, r.fourPlusPair, 'four of a kind + pair');
      }
    }
    return melds;
  }
  function scoreOptions(counts, rules) {
    const r = normalizeRules(rules);
    if (!Array.isArray(counts) || counts.length !== 6 ||
      counts.some(c => !Number.isInteger(c) || c < 0 || c > 6) || sumCounts(counts) > 6) {
      throw Error('Face counts must be six nonnegative integers totaling at most six.');
    }
    const n = sumCounts(counts);
    if (n === 0) return [];
    const melds = generateMelds(counts, r);
    const best = new Map();
    const layers = Array.from({ length: n + 1 }, () => []);
    const startCounts = [0, 0, 0, 0, 0, 0];
    const start = { counts: startCounts, used: 0, points: 0, labels: [] };
    best.set(countKey(startCounts), start);
    layers[0].push(start);
    for (let k = 0; k <= n; k++) {
      for (const state of layers[k]) {
        // All smaller subsets have been scored before this layer is visited.
        for (const meld of melds) {
          const nextCounts = state.counts.map((c, i) => c + meld.need[i]);
          if (nextCounts.some((c, i) => c > counts[i])) continue;
          const used = sumCounts(nextCounts);
          if (used <= k) continue;
          const key = countKey(nextCounts);
          const candidatePoints = state.points + meld.points;
          let found = best.get(key);
          if (!found) {
            found = { counts: nextCounts, used, points: candidatePoints, labels: state.labels.concat(meld.text) };
            best.set(key, found);
            layers[used].push(found);
          } else if (candidatePoints > found.points) {
            found.points = candidatePoints;
            found.labels = state.labels.concat(meld.text);
          }
        }
      }
    }
    const options = [...best.values()].filter(x => x.used > 0).map(x => ({
      dice: diceFromCounts(x.counts),
      used: x.used,
      score: x.points,
      scoreUnits: x.points / SCORE_UNIT,
      label: x.labels.join(' + '),
      nextDice: x.used === n ? 6 : n - x.used,
      hot: x.used === n,
      key: countKey(x.counts)
    }));
    return options.sort((a, b) => b.score - a.score || a.used - b.used);
  }
  function buildOutcomes(rules) {
    const r = normalizeRules(rules);
    const outcomes = [null];
    const odds = [null];
    for (let n = 1; n <= 6; n++) {
      let farkleWays = 0;
      let hotWays = 0;
      let totalWays = 0;
      const values = allMultisets(n).map(o => {
        const options = scoreOptions(o.counts, r);
        totalWays += o.ways;
        if (!options.length) farkleWays += o.ways;
        if (options.some(x => x.hot)) hotWays += o.ways;
        // For a fixed number of dice kept, a higher score dominates a lower one.
        const bySize = new Map();
        for (const a of options) {
          if (!bySize.has(a.used) || a.score > bySize.get(a.used).score) bySize.set(a.used, a);
        }
        return { ...o, options, actions: [...bySize.values()] };
      });
      outcomes[n] = values;
      const denominator = Math.pow(6, n);
      if (totalWays !== denominator) throw Error('Invalid outcome enumeration for ' + n + ' dice');
      odds[n] = {
        dice: n,
        outcomes: values.length,
        denominator,
        farkleWays,
        farkle: farkleWays / denominator,
        survival: 1 - farkleWays / denominator,
        hotWays,
        hot: hotWays / denominator
      };
    }
    return { outcomes, odds, rules: r };
  }
  function compareNumber(a, b) {
    const tolerance = 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
    return Math.abs(a - b) <= tolerance ? 0 : a > b ? 1 : -1;
  }
  function prefer(a, b, objective) {
    if (!b) return true;
    if (objective === 'goal') {
      const probability = compareNumber(a.goalProb, b.goalProb);
      if (probability) return probability > 0;
    }
    const value = compareNumber(a.ev, b.ev);
    if (value) return value > 0;
    const risk = compareNumber(a.farkleProb, b.farkleProb);
    if (risk) return risk < 0;
    return a.action === 'bank' && b.action !== 'bank';
  }
  const probability = x => Math.max(0, Math.min(1, x));

  function highScoreBoundary(data, r, settings, penalty) {
    // Above max(E[maximum roll score] / P(Farkle)), further rolling cannot
    // increase expected points when banking is allowed. See MATH.md.
    const gains = data.outcomes.slice(1).map(outcomes => outcomes.reduce((sum, o) =>
      sum + o.prob * Math.max(0, ...o.options.map(a => a.score)), 0));
    const stopBound = Math.max(...gains.map((gain, i) => gain / data.odds[i + 1].farkle));
    let threshold = Math.max(SCORE_UNIT, stopBound, settings.entered ? 0 : r.minEntry,
      settings.goal - settings.banked, settings.boundaryFloor ?? 0);
    let slope = 1, intercept = 0, risk = 0;
    if (r.forceHot) {
      let hotWays = 0, partialScore = 0, hotScore = 0;
      const branches = data.outcomes[6].filter(o => o.options.length).map(o => {
        const partial = Math.max(-Infinity, ...o.options.filter(a => !a.hot).map(a => a.score));
        const full = o.options.find(a => a.hot);
        if (partial === -Infinity) {
          hotWays += o.ways;
          hotScore += o.ways * full.score;
        } else partialScore += o.ways * partial;
        return { partial, full };
      });
      const { denominator, farkleWays } = data.odds[6];
      const exitWays = denominator - hotWays;
      risk = farkleWays / exitWays;
      slope = (exitWays - farkleWays) / exitWays;
      intercept = (partialScore + slope * hotScore - farkleWays * penalty) / exitWays;
      if (settings.objective === 'ev') {
        for (const { partial, full } of branches) {
          if (partial !== -Infinity && full) {
            threshold = Math.max(threshold, (slope * full.score + intercept - partial) / risk);
          }
        }
      }
    }
    // Rounding upward also avoids placing the boundary on a floating-point tie.
    threshold = Math.ceil((threshold + 1e-7) / SCORE_UNIT) * SCORE_UNIT;
    return { threshold, stopBound, gains, slope, intercept, risk };
  }

  function solve(data, settings = {}) {
    const state = validateInput({ ...settings, dice: [], rules: settings.rules ?? data.rules });
    const { rules: r, objective, banked, goal, entered } = state;
    for (const key of ['tripleOnes', 'kindMode', 'straight', 'threePairs', 'twoTriples', 'fourPlusPair']) {
      if (r[key] !== data.rules[key]) throw Error('Rebuild the outcome table after changing scoring rules.');
    }
    if (settings.boundaryFloor !== undefined) {
      integer(settings.boundaryFloor, 'Boundary floor', 0, 1000000, SCORE_UNIT);
    }
    const penalty = r.previousFarkles === 2 ? Math.min(r.streakPenalty, banked) : 0;
    const boundary = highScoreBoundary(data, r, { ...state, boundaryFloor: settings.boundaryFloor }, penalty);
    const maxIndex = boundary.threshold / SCORE_UNIT;
    const ev = Array.from({ length: 7 }, () => new Float64Array(maxIndex));
    const risk = Array.from({ length: 7 }, () => new Float64Array(maxIndex));
    const reach = Array.from({ length: 7 }, () => new Float64Array(maxIndex));
    const choice = Array.from({ length: 7 }, () => new Uint8Array(maxIndex));
    const bankAllowed = (n, t) => t > 0 && (entered || t >= r.minEntry) && !(r.forceHot && n === 6);
    const bustMeetsGoal = banked - penalty >= goal ? 1 : 0;

    function resultAt(n, i) {
      const t = i * SCORE_UNIT;
      if (i >= maxIndex) {
        if (r.forceHot && n === 6) return {
          ev: boundary.slope * t + boundary.intercept,
          farkleProb: boundary.risk,
          goalProb: probability(boundary.slope + boundary.risk * bustMeetsGoal), action: 'roll'
        };
        return { ev: t, farkleProb: 0, goalProb: 1, action: 'bank' };
      }
      return { ev: ev[n][i], farkleProb: risk[n][i], goalProb: reach[n][i],
        action: choice[n][i] ? 'roll' : 'bank' };
    }
    function rollAt(n, i) {
      let value = 0, farkle = 0, target = 0;
      for (const outcome of data.outcomes[n]) {
        if (!outcome.options.length) {
          value -= outcome.prob * penalty;
          farkle += outcome.prob;
          target += outcome.prob * bustMeetsGoal;
          continue;
        }
        let best = null;
        for (const option of outcome.actions) {
          const next = resultAt(option.nextDice, i + option.scoreUnits);
          if (prefer(next, best, objective)) best = next;
        }
        value += outcome.prob * best.ev;
        farkle += outcome.prob * best.farkleProb;
        target += outcome.prob * best.goalProb;
      }
      return { ev: value, farkleProb: probability(farkle), goalProb: probability(target), action: 'roll' };
    }
    for (let i = maxIndex - 1; i >= 0; i--) {
      const t = i * SCORE_UNIT;
      for (let n = 1; n <= 6; n++) {
        const roll = rollAt(n, i);
        const bank = bankAllowed(n, t) ? {
          ev: t, farkleProb: 0, goalProb: banked + t >= goal ? 1 : 0, action: 'bank'
        } : null;
        const best = bank && prefer(bank, roll, objective) ? bank : roll;
        ev[n][i] = best.ev;
        risk[n][i] = best.farkleProb;
        reach[n][i] = best.goalProb;
        choice[n][i] = best.action === 'roll' ? 1 : 0;
      }
    }
    function checkState(n, t) {
      integer(n, 'Dice count', 1, 6);
      integer(t, 'Turn points', 0, Number.MAX_SAFE_INTEGER, SCORE_UNIT);
    }
    function getState(n, t) {
      checkState(n, t);
      const canBank = bankAllowed(n, t);
      return { ...resultAt(n, t / SCORE_UNIT), dice: n, total: t,
        canBank, bankEV: canBank ? t : null };
    }
    function getRoll(n, t) {
      checkState(n, t);
      return rollAt(n, t / SCORE_UNIT);
    }
    return { getState, getRoll, boundary, penalty, objective, banked, goal, entered, rules: r };
  }

  function examine(input, dataCache, solutionCache) {
    const state = validateInput(input);
    const { rules, dice, turn, banked, goal, objective, entered } = state;
    const scoringKey = JSON.stringify(['tripleOnes', 'kindMode', 'straight', 'threePairs',
      'twoTriples', 'fourPlusPair'].map(key => rules[key]));
    const data = dataCache?.key === scoringKey ? dataCache.data : buildOutcomes(rules);
    const settings = { rules, banked, goal, objective, entered };
    const solutionKey = JSON.stringify(settings);
    const solution = solutionCache?.key === solutionKey ? solutionCache.solution : solve(data, settings);
    const nextDice = state.hotReady ? 6 : state.nextDice;
    const result = {
      ...state, nextDice, rollCount: dice.length, odds: data.odds.slice(1),
      penalty: solution.penalty, boundary: solution.boundary, moves: [], status: 'preRoll'
    };
    if (!dice.length) {
      const current = solution.getState(nextDice, turn);
      const roll = solution.getRoll(nextDice, turn);
      result.before = { ...current, rollEV: roll.ev, rollRisk: roll.farkleProb, rollReach: roll.goalProb };
    } else {
      const counts = countsFromDice(dice);
      const outcome = data.outcomes[dice.length].find(o => o.key === countKey(counts));
      result.observed = { counts, ways: outcome.ways, denominator: 6 ** dice.length };
      result.status = outcome.options.length ? 'rolled' : 'farkle';
      result.moves = outcome.options.map(option => {
        const total = turn + option.score;
        const current = solution.getState(option.nextDice, total);
        const roll = solution.getRoll(option.nextDice, total);
        return { ...option, ...current, total,
          nextFarkle: data.odds[option.nextDice].farkle,
          rollEV: roll.ev, rollRisk: roll.farkleProb, rollReach: roll.goalProb,
          dice: option.dice };
      }).sort((a, b) => {
        if (prefer(a, b, objective)) return -1;
        if (prefer(b, a, objective)) return 1;
        return b.score - a.score || a.used - b.used || a.key.localeCompare(b.key);
      });
    }
    return { result, dataCache: { key: scoringKey, data }, solutionCache: { key: solutionKey, solution } };
  }
  const api = { DEFAULT_RULES, PRESETS, RULE_OPTIONS, SCORE_UNIT, MAX_INPUT,
    normalizeRules, validateInput, tripleValue, kindValue, allMultisets, countsFromDice,
    scoreOptions, buildOutcomes, prefer, solve, examine };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FarkleEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
