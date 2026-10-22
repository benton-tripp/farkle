(function ($, E) {
  'use strict';
  if (!$ || !E) {
    document.getElementById('status').textContent = 'Calculator files could not load. Check that all project files were uploaded.';
    return;
  }
  const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const RULE_KEYS = Object.keys(E.DEFAULT_RULES);
  const STORAGE_KEY = 'farkle-calculator-v2';
  const points = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format;
  const expected = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const pct = value => {
    if (value === 0 || value === 1) return `${value * 100}%`;
    if (value < 0.0001) return `${(100 * value).toExponential(2)}%`;
    if (value > 0.9999) return '>99.99%';
    return `${(100 * value).toFixed(2)}%`;
  };
  const diceWord = n => `${n} ${n === 1 ? 'die' : 'dice'}`;
  const checked = id => $('#' + id).prop('checked');
  function numeric(id) {
    const value = $('#' + id).val();
    return value === null || String(value).trim() === '' ? NaN : Number(value);
  }
  const app = { dice: [], response: null, moveIndex: 0, showAll: false, revision: 0,
    pending: null, workerBusy: false, timer: null, enteredTouched: false,
    mathVersion: 0, mathQueue: Promise.resolve(), lastMath: '' };
  let worker;

  function status(message, error = false) {
    $('#status').text(message).toggleClass('error', error);
  }
  function applyRules(rules) {
    RULE_KEYS.filter(key => key !== 'previousFarkles').forEach(key => {
      if (key === 'forceHot') $('#' + key).prop('checked', rules[key]);
      else $('#' + key).val(String(rules[key]));
    });
  }
  function readRules() {
    return Object.fromEntries(RULE_KEYS.map(key => [key,
      key === 'forceHot' ? checked(key) : key === 'kindMode' ? $('#' + key).val() : numeric(key)]));
  }
  function readInput() {
    return E.validateInput({ rules: readRules(), turn: numeric('turnPoints'),
      banked: numeric('bankedPoints'), goal: numeric('gameGoal'),
      entered: checked('alreadyEntered'), objective: $('#objective').val(),
      dice: app.dice, nextDice: numeric('availableDice'), hotReady: checked('hotReady') });
  }
  function save(input) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ input,
        preset: $('#preset').val(), enteredTouched: app.enteredTouched }));
    } catch (_) { /* Calculation still works when browser storage is blocked. */ }
  }
  function load() {
    applyRules(E.PRESETS.doubling);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      const input = E.validateInput(saved.input);
      applyRules(input.rules);
      $('#previousFarkles').val(String(input.rules.previousFarkles));
      $('#turnPoints').val(input.turn);
      $('#bankedPoints').val(input.banked);
      $('#gameGoal').val(input.goal);
      $('#availableDice').val(String(input.nextDice));
      $('#hotReady').prop('checked', input.hotReady);
      $('#alreadyEntered').prop('checked', input.entered);
      $('#objective').val(input.objective);
      $('#preset').val(Object.hasOwn(E.PRESETS, saved.preset) ? saved.preset : 'custom');
      app.dice = input.dice;
      app.enteredTouched = Boolean(saved.enteredTouched);
    } catch (_) { /* Invalid saved settings are ignored rather than repaired silently. */ }
  }
  function drawDice() {
    $('#rollSlots').html(Array.from({ length: 6 }, (_, i) => i < app.dice.length
      ? `<button type="button" class="roll-slot selected" data-index="${i}" aria-label="Remove die ${i + 1}, showing ${app.dice[i]}">${FACES[app.dice[i] - 1]}</button>`
      : '<span class="roll-slot" aria-hidden="true">+</span>').join(''));
    $('.face-button').prop('disabled', app.dice.length === 6);
    $('#rollCountLabel').text(app.dice.length ? `${diceWord(app.dice.length)} entered` : 'No dice entered');
    $('#hotReady').prop('disabled', app.dice.length > 0);
    $('#availableDice').prop('disabled', app.dice.length > 0 || checked('hotReady'));
  }
  function preview() {
    const r = E.normalizeRules(readRules());
    const modes = { doubling: '2× / 4× / 8× triple', linear: '2× / 3× / 4× triple',
      fixed: '1,000 / 2,000 / 3,000', none: 'No larger-set award' };
    const award = value => value ? points(value) : 'Disabled';
    const rows = [
      ['Single 1 / single 5', '100 / 50'], ['Three 1s', points(r.tripleOnes)],
      ['Other triplets', 'Face value × 100'], ['Four / five / six of a kind', modes[r.kindMode]],
      ['Straight', award(r.straight)], ['Three distinct pairs', award(r.threePairs)],
      ['Two distinct triplets', r.twoTriples ? points(r.twoTriples) : 'Separate scores'],
      ['Four of a kind plus pair', award(r.fourPlusPair)],
      ['Minimum first bank', points(r.minEntry)], ['Hot dice', r.forceHot ? 'Must roll again' : 'Banking allowed']
    ];
    $('#scorePreview').html(rows.map(([label, value]) =>
      `<div class="rule-line"><span>${label}</span><span>${value}</span></div>`).join(''));
  }
  function metrics(items) {
    return `<dl class="metrics">${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
  }
  function moveTitle(move) {
    return `Keep ${move.dice.join(', ')}; ${move.action === 'bank'
      ? `bank ${points(move.total)} points` : `roll ${diceWord(move.nextDice)}`}`;
  }
  function explanation(state, result) {
    const n = state.nextDice ?? result.nextDice;
    if (!state.canBank) {
      const reason = result.rules.forceHot && n === 6 && state.total > 0
        ? 'The hot-dice rule requires another roll.'
        : state.total === 0 ? 'You need to score before you can bank.'
        : `The first bank must be at least ${points(result.rules.minEntry)} points.`;
      return `${reason} Rolling and following the recommendations gives ${expected(state.rollEV)} expected net points and a ${pct(state.rollRisk)} chance of Farkling before the turn ends.`;
    }
    if (result.objective === 'goal') {
      const bankChance = result.banked + state.total >= result.goal ? 1 : 0;
      return `Banking now gives a ${pct(bankChance)} chance of reaching the target. Rolling, then following the recommendations, gives ${pct(state.rollReach)}. Expected points break ties in target probability.`;
    }
    return `Banking adds ${points(state.total)} points to your game score. Rolling, then following the recommendations, gives ${expected(state.rollEV)} expected net points and a ${pct(state.rollRisk)} chance of Farkling before the turn ends.`;
  }
  function showResults(result) {
    const top = result.moves[0];
    const focused = result.status === 'farkle' ? result.rollCount : top?.nextDice ?? result.nextDice;
    $('#oddsRows').html(result.odds.map(o => `<tr${focused === o.dice ? ' class="focused"' : ''}><th scope="row">${o.dice}</th><td>${escape(pct(o.farkle))}</td><td>${escape(pct(o.hot))}</td></tr>`).join(''));
    if (result.status === 'farkle') {
      $('#recommendation').html(`<p class="result-action">Farkle</p><p>No dice score under these rules. You lose ${points(result.turn)} unbanked points${result.penalty ? ` and ${points(result.penalty)} banked points` : ''}.</p>` + metrics([
        ['Unbanked points lost', points(result.turn)], ['Banked points after this turn', points(result.banked - result.penalty)]
      ]));
      $('#moveList').empty();
      buildMath(result, null);
      return;
    }
    const state = top ?? result.before;
    const n = top?.nextDice ?? result.nextDice;
    const title = top ? moveTitle(top) : state.action === 'bank'
      ? `Bank ${points(result.turn)} points` : `Roll ${diceWord(n)}`;
    const comparison = explanation(state, result);
    const items = [
      ['Turn total after this choice', points(state.total)],
      ['Expected score change', expected(state.ev)],
      ['Farkle if you roll next', pct(result.odds[n - 1].farkle)],
      ['Farkle following this move', pct(state.farkleProb)]
    ];
    $('#recommendation').html(`<p class="result-action">${escape(title)}</p><p class="result-desc">${escape(comparison)}</p>` + metrics(items) +
      `<p class="note">Chance of ending this turn at or above ${points(result.goal)} game points: ${escape(pct(state.goalProb))}.</p>` +
      '<p class="note">Expected score change is the amount added to your banked score, minus any streak penalty. “Farkle if you roll next” is hypothetical when banking is recommended.</p>' +
      (result.penalty ? `<p class="note">A Farkle this turn also deducts ${points(result.penalty)} banked points. That penalty is included in the expected value.</p>` : ''));
    if (!top) {
      $('#moveList').empty();
      buildMath(result, null);
      return;
    }
    if (app.moveIndex >= result.moves.length || (!app.showAll && app.moveIndex >= 6)) app.moveIndex = 0;
    const count = app.showAll ? result.moves.length : Math.min(6, result.moves.length);
    const moves = result.moves.slice(0, count).map((move, i) =>
      `<button type="button" class="move${i === app.moveIndex ? ' selected' : ''}" data-move="${i}" aria-pressed="${i === app.moveIndex}"><span class="move-name">${i + 1}. ${escape(moveTitle(move))}</span><span class="move-detail"><span>Score: ${points(move.score)}</span><span>Expected: ${expected(move.ev)}</span><span>Turn Farkle risk: ${escape(pct(move.farkleProb))}</span>${result.objective === 'goal' ? `<span>Target: ${escape(pct(move.goalProb))}</span>` : ''}</span></button>`).join('');
    const selected = result.moves[app.moveIndex];
    $('#moveList').html(`<h3>Scoring Choices (${result.moves.length})</h3><p class="hint">Choices are ranked for the selected objective. Select one to compare its bank and roll outcomes.</p><div class="move-list">${moves}</div>` +
      (result.moves.length > 6 ? `<button type="button" class="button" id="toggleMoves">${app.showAll ? 'Show fewer choices' : `Show all ${result.moves.length} choices`}</button>` : '') +
      `<div class="selected-detail"><h3>Selected Choice: ${selected.dice.join(', ')}</h3><p>This selection scores ${points(selected.score)} points (${escape(selected.label)}). ${selected.hot ? 'All rolled dice score, making six dice available.' : `${diceWord(selected.nextDice)} ${selected.nextDice === 1 ? 'remains' : 'remain'}.`}</p>${app.moveIndex ? `<p>${escape(explanation(selected, result))}</p>` : ''}<p class="hint">Farkle probability on the next roll: ${escape(pct(selected.nextFarkle))}. The calculation below uses this selected choice, not necessarily the first-ranked one.</p></div>`);
    buildMath(result, selected);
  }

  const formula = tex => `<div class="formula">\\[${escape(tex)}\\]</div>`;
  const block = (title, content) => `<section class="math-block"><h3>${title}</h3>${content}</section>`;
  function buildMath(result, move) {
    const n = move?.nextDice ?? (result.status === 'farkle' ? result.rollCount : result.nextDice);
    const odds = result.odds[n - 1];
    let observed = '';
    if (result.observed) {
      const o = result.observed;
      observed = `<p>The entered roll, ignoring order, had this probability before it was observed:</p>` +
        formula(String.raw`P(\mathbf c)=\frac{d!}{6^d\prod_{i=1}^6 c_i!}=\frac{${o.ways}}{${o.denominator}}`) +
        `<p>For the entered roll, the Farkle outcome is already known. It isn't a new random event.</p>`;
    }
    const probabilities = block('Roll Probabilities', observed +
      '<p>Each ordered roll is equally likely. The multinomial coefficient counts the orders represented by each face-count vector.</p>' +
      formula(String.raw`P(F\mid d)=\sum_{\mathbf c\in\mathcal F_d}\frac{d!}{6^d\prod_{i=1}^6 c_i!}`) +
      formula(String.raw`P(F\mid d=${n})=\frac{${odds.farkleWays}}{${odds.denominator}}\approx ${(100 * odds.farkle).toFixed(4)}\%`) +
      formula(String.raw`P(\text{all dice can score}\mid d=${n})=\frac{${odds.hotWays}}{${odds.denominator}}`) +
      `<p>These are ${result.status === 'farkle' ? 'pre-roll probabilities for the number of dice entered' : 'probabilities for the next roll, should you choose to roll'}. They aren't the risk of banking.</p>`);
    const state = move ?? result.before;
    let current;
    if (result.status === 'farkle') {
      current = `<p>The turn ends. Your banked score changes by ${points(-result.penalty)} points; the ${points(result.turn)} unbanked points are lost.</p>` +
        formula(String.raw`P(F\mid\text{entered roll})=1`);
    } else {
      current = move ? formula(String.raw`t'=t+s=${result.turn}+${move.score}=${move.total}`) +
        formula(String.raw`d'=\begin{cases}6,&k=d\\d-k,&k<d\end{cases}\qquad(d,k,d')=(${result.rollCount},${move.used},${n})`) +
        `<p>Keep ${move.dice.join(', ')}. The scoring breakdown is ${escape(move.label)}. Here, k is the number of dice kept.</p>` :
        formula(String.raw`(d,t)=(${n},${result.turn})`);
      current += formula(String.raw`\operatorname{EV}(\text{bank})=${state.canBank ? state.total : String.raw`\text{not allowed}`}`) +
        formula(String.raw`\operatorname{EV}(\text{roll, then follow policy})\approx ${state.rollEV.toFixed(4)}`) +
        `<p>Suggested action: ${state.action}. Expected score change: ${expected(state.ev)} points. Turn Farkle risk: ${escape(pct(state.farkleProb))}. Target probability: ${escape(pct(state.goalProb))}.</p>`;
    }
    const L = result.penalty;
    const recursion = result.objective === 'goal'
      ? '<p>Let J be the probability of reaching the target this turn. The bank term is 1 if banking reaches the target, and 0 otherwise. An illegal bank action is excluded.</p>' +
        formula(String.raw`J(d,t)=\max\left\{B_g(d,t),\sum_{\omega}P(\omega)\,G_g(\omega,t)\right\}`) +
        formula(String.raw`G_g(\omega,t)=\begin{cases}0,&\omega\text{ is a Farkle}\\\max_{a\in A(\omega)}J(d_a,t+s_a),&\text{otherwise}\end{cases}`)
      : '<p>Let V be the expected change in banked points under the best turn policy. The bank term equals t when banking is legal; otherwise that action is excluded.</p>' +
        formula(String.raw`V(d,t)=\max\left\{B(d,t),\sum_{\omega}P(\omega)\,G(\omega,t)\right\}`) +
        formula(String.raw`G(\omega,t)=\begin{cases}${-L},&\omega\text{ is a Farkle}\\\max_{a\in A(\omega)}V(d_a,t+s_a),&\text{otherwise}\end{cases}`);
    const policy = block('Decision and Risk Recursions', recursion +
      '<p>A(ω) is the set of legal scoring selections. Each selection adds s points and leaves d dice, or six after hot dice. After each future roll, the calculator chooses again under the same objective.</p>' +
      formula(String.raw`R_\pi(d,t)=\begin{cases}0,&\pi\text{ banks}\\P(F\mid d)+\sum_{\omega\notin F}P(\omega)R_\pi(d_{a_\pi},t+s_{a_\pi}),&\pi\text{ rolls}\end{cases}`) +
      '<p>The risk is evaluated for the recommended policy. It is not minimized independently of the selected objective.</p>');
    const boundary = result.boundary;
    const tail = block('High Scores and Independence',
      `<p>The computed high-score boundary is ${points(boundary.threshold)} turn points. This is a calculation boundary, not a game limit or an instruction to bank illegally.</p>` +
      '<p>Let A_d be the expected largest score from a single roll, with zero assigned to a Farkle. For sufficiently high t, the expected change from rolling is nonpositive:</p>' +
      formula(String.raw`C\geq\max_d\frac{A_d}{P(F\mid d)},\qquad A_d-P(F\mid d)t\leq0\quad(t\geq C)`) +
      (result.rules.forceHot ?
        '<p>Where banking is forbidden after hot dice, the engine instead uses the derived six-dice continuation value:</p>' +
        formula(String.raw`V_\pi(6,t)=${boundary.slope.toFixed(8)}t+${boundary.intercept.toFixed(6)}`) :
        '<p>Where banking is allowed, high-score states bank. The target objective also requires that this boundary is at or above the points needed to reach the target.</p>') +
      '<p>The derivation, including the forced-hot boundary and its validity conditions, is in <a href="./MATH.md">MATH.md</a>. Calculations use floating-point numbers, not simulation.</p>' +
      formula(String.raw`P(F_{\rm next}\mid\text{past rolls},d)=P(F\mid d)`) +
      '<p>Past rolls do not change fair-dice probabilities. A streak penalty can change the decision because it changes the cost of a Farkle.</p>');
    renderMath(probabilities + block('Selected Decision', current) + policy + tail);
  }
  function renderMath(markup) {
    app.lastMath = markup;
    const version = ++app.mathVersion;
    app.mathQueue = app.mathQueue.catch(() => {}).then(async () => {
      if (version !== app.mathVersion) return;
      const holder = document.getElementById('mathExplanation');
      const mj = window.MathJax;
      if (mj?.startup?.promise) await mj.startup.promise;
      if (version !== app.mathVersion) return;
      if (typeof mj?.typesetClear === 'function') mj.typesetClear([holder]);
      holder.innerHTML = markup;
      holder.hidden = !markup;
      if (markup && typeof mj?.typesetPromise === 'function') await mj.typesetPromise([holder]);
    }).catch(() => {
      if (version !== app.mathVersion) return;
      const holder = document.getElementById('mathExplanation');
      holder.innerHTML = markup;
      holder.hidden = !markup;
      $('#mathStatus').text('Equation formatting failed. Equations are shown as LaTeX source; calculation results still apply.');
    });
  }

  function clearResults() {
    app.response = null;
    $('#recommendation').empty();
    $('#moveList').empty();
    $('#oddsRows').empty();
    $('#mathExplanation').prop('hidden', true);
    renderMath('');
  }
  function dispatch() {
    if (app.workerBusy || !app.pending || !worker) return;
    const request = app.pending;
    app.pending = null;
    app.workerBusy = true;
    worker.postMessage(request);
  }
  function recompute() {
    clearTimeout(app.timer);
    const id = ++app.revision;
    app.pending = null;
    clearResults();
    $('#resultsPanel').attr('aria-busy', 'true');
    status('Calculating...');
    app.moveIndex = 0;
    app.showAll = false;
    app.timer = setTimeout(() => {
      try {
        const payload = readInput();
        preview();
        save(payload);
        if (!worker) throw Error('The calculation worker is unavailable. Serve this folder over HTTP or HTTPS and reload.');
        app.pending = { id, payload };
        dispatch();
      } catch (error) {
        status(worker ? 'Check the inputs' : 'Calculation unavailable', true);
        $('#resultsPanel').attr('aria-busy', 'false');
        $('#recommendation').text(error.message);
      }
    }, 120);
  }
  function startWorker() {
    try {
      worker = new Worker('./js/worker.js');
    } catch (_) { worker = null; return; }
    worker.addEventListener('message', event => {
      app.workerBusy = false;
      if (event.data.id === app.revision) {
        $('#resultsPanel').attr('aria-busy', 'false');
        if (event.data.error) {
          status('Calculation failed', true);
          $('#recommendation').text(event.data.error);
        } else {
          app.response = event.data.result;
          status('Ready');
          showResults(app.response);
        }
      }
      dispatch();
    });
    worker.addEventListener('error', () => {
      worker.terminate();
      worker = null;
      app.workerBusy = false;
      app.pending = null;
      clearResults();
      status('Calculation unavailable', true);
      $('#resultsPanel').attr('aria-busy', 'false');
      $('#recommendation').text('The worker could not load. Check that js/worker.js and js/engine.js were uploaded, and open the site over HTTP or HTTPS.');
    });
  }
  function init() {
    load();
    drawDice();
    preview();
    startWorker();
    $('.face-button').on('click', function () {
      if (app.dice.length < 6) {
        app.dice.push(Number($(this).attr('data-face')));
        drawDice(); recompute();
      }
    });
    $('#rollSlots').on('click', '.selected', function () {
      const index = Number($(this).attr('data-index'));
      app.dice.splice(index, 1);
      drawDice(); recompute();
      const remaining = $('#rollSlots .selected');
      if (remaining.length) remaining.eq(Math.min(index, remaining.length - 1)).trigger('focus');
      else $('.face-button').first().trigger('focus');
    });
    $('#clearRoll').on('click', () => { app.dice = []; drawDice(); recompute(); });
    $('#loadSample').on('click', () => { app.dice = [1, 5, 2, 3, 6, 6]; drawDice(); recompute(); });
    $('#moveList').on('click', '.move', function () {
      if (!app.response) return;
      app.moveIndex = Number($(this).attr('data-move'));
      showResults(app.response);
      $(`[data-move="${app.moveIndex}"]`).trigger('focus');
    });
    $('#moveList').on('click', '#toggleMoves', () => {
      if (!app.response) return;
      app.showAll = !app.showAll;
      showResults(app.response);
      $('#toggleMoves').trigger('focus');
    });
    $('#preset').on('change', function () {
      const name = $(this).val();
      if (Object.hasOwn(E.PRESETS, name)) applyRules(E.PRESETS[name]);
      recompute();
    });
    RULE_KEYS.filter(key => key !== 'previousFarkles').forEach(key => $('#' + key).on('change', () => {
      $('#preset').val('custom'); recompute();
    }));
    $('#bankedPoints').on('input change', () => {
      if (!app.enteredTouched && numeric('bankedPoints') > 0) $('#alreadyEntered').prop('checked', true);
      recompute();
    });
    $('#alreadyEntered').on('change', () => { app.enteredTouched = true; recompute(); });
    $('#hotReady').on('change', () => { drawDice(); recompute(); });
    $('#availableDice,#turnPoints,#gameGoal,#objective,#previousFarkles').on('input change', recompute);
    $('#mathjaxScript').on('error', () => $('#mathStatus').text('MathJax could not load. Calculations still work; equations are shown as LaTeX source.'));
    function finishMathLoad() {
      const ready = window.MathJax?.startup?.promise;
      if (!ready) {
        $('#mathStatus').text('MathJax could not load. Calculations still work; equations are shown as LaTeX source.');
        return;
      }
      Promise.resolve(ready).then(() => {
        $('#mathStatus').text('Equations use the current rules and selected choice.');
        if (app.lastMath) renderMath(app.lastMath);
      }).catch(() => $('#mathStatus').text('Equation formatting failed. The calculation results still apply.'));
    }
    $(window).on('load', finishMathLoad);
    if (document.readyState === 'complete') finishMathLoad();
    recompute();
  }
  $(init);
})(window.jQuery, window.FarkleEngine);
