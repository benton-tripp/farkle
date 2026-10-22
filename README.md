# Farkle Calculator

A browser-based calculator for Farkle scoring choices, roll probabilities, and turn strategy. It uses HTML, CSS, jQuery, and a Web Worker. MathJax formats the equations. There is no build step, application server, account, or database.

This is a calculator, not a scorekeeper. Choosing a displayed move doesn't update your turn or game score.

## Using the Calculator

Select the number of dice in your latest roll, then enter every face, including dice that don't score. Enter the turn points you had set aside before that roll. Don't include the new roll's points or dice from earlier rolls. The calculator scores each legal selection and compares banking with continuing once the full roll is entered. It does not recommend a move for a partial roll.

With no dice entered, the same number-of-dice setting controls how many dice you could roll next. To evaluate a turn after hot dice, select six. If a scoring choice uses every die in an entered roll, the calculator automatically makes six dice available for the following roll. You don't need a separate hot-dice setting. If you reduce the selected dice count below the number of entered faces, the entered roll is cleared.

Banked game points are separate from turn points. The entry checkbox means you've already satisfied the minimum first bank at some earlier point in the game. It can remain checked even if a penalty has since reduced your banked score to zero.

Scores must be multiples of 50, between zero and 100,000; the target must be at least 50. Invalid inputs produce an error, not a rounded or substituted value. Calculations can include future turn totals beyond the input limit.

## Objectives and Results

“Maximize expected points” maximizes the expected change in your banked score during the current turn. A bank adds the full turn total. A Farkle adds zero, or subtracts the configured streak penalty. Unbanked points aren't counted as a second deduction. This objective doesn't account for future turns or opponents.

“Reach the target this turn” maximizes the probability of ending this turn at or above the target. Expected points break near-equal probability ties. The target must exceed the score already banked. This is not the probability of winning a multiplayer game.

“Farkle if you roll next” is the immediate probability for the next dice count. It remains visible as a hypothetical risk when banking is recommended. “Farkle following this move” includes all subsequent rolls under the calculated policy and is zero for a bank. The expected value, turn risk, and target probability all follow the same policy.

The first-ranked choice remains the recommendation. Selecting another choice changes its explanation and equations without changing that ranking.

## Scoring Rules

Singles score 100 for a 1 and 50 for a 5. Other faces score only in combinations. Every combination must come from one roll.

| Setting | Doubling sets | Linear sets | PlayMonster scoring |
|---|---:|---:|---:|
| Three 1s | 1,000 | 1,000 | 300 |
| Other triplets | Face × 100 | Face × 100 | Face × 100 |
| Four / five / six of a kind | Triple × 2 / 4 / 8 | Triple × 2 / 3 / 4 | 1,000 / 2,000 / 3,000 |
| Straight | 1,500 | 1,000 | 1,500 |
| Three distinct pairs | 1,500 | 750 | 1,500 |
| Two distinct triplets | 2,500 | Separate triplet scores | 2,500 |
| Four of a kind plus a different pair | 1,500 | No combined award | 1,500 |
| Minimum first bank | 500 | 0 | 500 |

All presets allow banking after hot dice and have no streak penalty. The first two presets combine house rules; neither is presented as a universal standard. Change individual settings under “Change scoring and turn rules.” Changing a preset preserves the entered scores and prior-Farkle count.

A die cannot contribute to two combinations. For each selected subset, the calculator takes the highest score from nonoverlapping combinations. For example, four 1s plus two 5s score 2,100 under the doubling preset: 2,000 for the four 1s and 100 for the two 5s. The 1,500-point four-plus-pair award does not replace that higher score.

Three pairs require three different faces. Two-triplet awards require two different faces. Six equal dice may instead score as two ordinary triplets. Turning off a special award doesn't disable other ways to score those dice. Rules that force a named pattern to override a higher partition score aren't supported.

The optional streak penalty applies only if the prior-Farkle count is two. It is capped by the current banked score. The app doesn't track or reset the streak automatically and doesn't value its effect on later turns.

Sources: [PlayMonster's rule sheet](https://www.playmonster.com/wp-content/uploads/2018/06/Farkle-Rules.pdf), [LITE Games' doubling rules](https://info.lite.games/en/support/solutions/articles/60000688670-farkle-rules), and [Smart Box Games' rules and variations](https://farkle.games/official-rules/). Confirm the rules with the people playing.

## Calculation Method

The engine counts every possible roll, grouped by face counts and weighted by its number of ordered outcomes. These are analytical probabilities, not simulation estimates. With three distinct pairs enabled, the Farkle counts for one through six dice are 4, 16, 60, 204, 600, and 1,080 out of 6, 36, 216, 1,296, 7,776, and 46,656 outcomes. Disabling three pairs changes the six-dice count to 1,440.

A backward dynamic program chooses scoring subsets and bank-or-roll actions. Its high-score boundary is derived from the rules rather than imposed at an arbitrary cap. Forced hot dice remain subject to the reroll rule at every score. The mathematics is in [MATH.md](MATH.md).

Expected values and turn-level probabilities use floating-point arithmetic. Comparisons within 16 machine epsilons of the larger magnitude are treated as ties. Probability comparisons are relative, so small nonzero probabilities aren't discarded by a fixed absolute tolerance.

The model assumes fair, independent dice. It doesn't include opponents, final-round rules, exact-score finishes, piggybacking, or loaded dice. Past rolls don't change the next roll's probability.

## Host on GitHub Pages

Upload this folder's contents to a repository, with `index.html`, `css`, `js`, and `vendor` at the root. Include the documentation files too. In Settings > Pages, choose “Deploy from a branch,” select the branch and `/(root)`, and save. GitHub displays the published URL after deployment. See [GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

All application paths are relative, so a project site under a repository subdirectory doesn't need a path change. No Node.js installation is needed to host the site. The `.nojekyll` file keeps the files unchanged by Jekyll.

## Run and Test Locally

Serve the project directory rather than opening `index.html` with a `file://` URL, which can block the worker:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. The local server only serves files.

The engine tests use Node's built-in test runner and have no package dependencies. They were run with Node.js 22.16.0:

```sh
node --test tests/engine.test.js
```

Optional browser checks are documented at the top of `tests/browser_test.py`. They use Playwright and a local MathJax distribution, neither of which is required by the hosted calculator.

## Files and Dependencies

`js/engine.js` contains the shared rules, scorer, outcome enumeration, and solver. `js/worker.js` runs calculations off the main thread. `js/app.js` handles inputs, results, storage, and equations. `index.html` and `css/styles.css` contain the interface. Tests and documentation aren't loaded by the calculator.

jQuery 3.7.1 slim is included in `vendor` with its license. MathJax 3.2.1 loads asynchronously from jsDelivr. The calculator works without MathJax, but equations then appear as LaTeX source. This is not a packaged offline app: loading an uncached page or MathJax resource needs network access.

The application saves settings in local storage under `farkle-calculator-v3`. Settings saved by the previous version (`farkle-calculator-v2`) are migrated on first load. The previous version did not associate the selected number of available dice with an entered roll, so migrated rolls use their actual number of entered faces. It doesn't send scores or dice to a server. MathJax's CDN receives ordinary resource requests, and the host may record ordinary site requests. There is no application analytics code. Old settings under `farkle-strategy-lab-v1` aren't migrated.

