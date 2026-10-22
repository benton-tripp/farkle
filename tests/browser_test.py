"""Browser regression checks for the static calculator.

Install Python's playwright package and a Chromium browser, then run:
    python tests/browser_test.py --chromium /path/to/chromium \
        --mathjax-es5 /path/to/mathjax-full/es5

This uses an inline HTML harness, real workers created from local source, and a
Map-backed storage stub. It doesn't test HTTP deployment, browser storage quotas,
or the live MathJax CDN. MathJax files are read from the supplied directory.
"""
from pathlib import Path
from urllib.parse import unquote
import argparse
import mimetypes
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = 'farkle-calculator-v3'


def run(chromium, mathjax, screenshots=None):
    html = (ROOT / 'index.html').read_text()
    config = re.search(r'<script>\s*(.*?)\s*</script>', html, re.S).group(1)
    html = re.sub(r'<script\b[^>]*>.*?</script>', '', html, flags=re.S)
    html = html.replace('<link rel="stylesheet" href="./css/styles.css">',
                        '<style>' + (ROOT / 'css/styles.css').read_text() + '</style>')
    engine = (ROOT / 'js/engine.js').read_text()
    worker = (ROOT / 'js/worker.js').read_text().replace("importScripts('./engine.js');", '')
    passed = []

    def check(name, condition):
        assert condition, name
        passed.append(name)
        print('PASS:', name)

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chromium, args=['--no-sandbox'])
        errors = []

        def make_page(saved=None, use_math=True, blocked_storage=False, blocked_worker=False, legacy_saved=None):
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.on('pageerror', lambda error: errors.append(str(error)))
            def serve(route):
                relative = unquote(route.request.url.split('/es5/', 1)[-1])
                file = (mathjax / relative).resolve()
                if file.is_relative_to(mathjax.resolve()) and file.is_file():
                    route.fulfill(path=str(file), content_type=mimetypes.guess_type(file)[0]
                                  or 'application/javascript', headers={'Access-Control-Allow-Origin': '*'})
                else:
                    route.abort()
            page.context.route('https://mathjax.test/es5/**', serve)
            page.set_content(html)
            page.add_script_tag(content=config + '''
                window.testStorage = new Map();
                Object.defineProperty(window, 'localStorage', {value: {
                    getItem(k) {if (window.blockStorage) throw Error('Storage blocked'); return testStorage.get(k) ?? null;},
                    setItem(k,v) {if (window.blockStorage) throw Error('Storage blocked'); testStorage.set(k,v);}
                }});
                const BrowserWorker = window.Worker;
                window.Worker = class extends BrowserWorker {
                    constructor(url) {
                        if (window.blockWorker) throw Error('Worker blocked');
                        if (url !== './js/worker.js') throw Error('Unexpected worker URL');
                        super(URL.createObjectURL(new Blob([window.workerSource], {type:'text/javascript'})));
                    }
                };
            ''')
            page.evaluate('''({source,saved,legacySaved,blockedStorage,blockedWorker,key}) => {
                window.workerSource = source;
                window.blockStorage = blockedStorage;
                window.blockWorker = blockedWorker;
                if (saved !== null) testStorage.set(key, saved);
                if (legacySaved !== null) testStorage.set('farkle-calculator-v2', legacySaved);
            }''', {'source': engine + '\n' + worker, 'saved': saved, 'legacySaved': legacy_saved,
                   'blockedStorage': blocked_storage, 'blockedWorker': blocked_worker, 'key': KEY})
            page.add_script_tag(content=(ROOT / 'vendor/jquery-3.7.1.slim.min.js').read_text())
            page.add_script_tag(content=engine)
            if use_math:
                page.evaluate('''() => {
                    MathJax.loader = {paths:{mathjax:'https://mathjax.test/es5'}};
                    MathJax.chtml = {fontURL:'https://mathjax.test/es5/output/chtml/fonts/woff-v2'};
                }''')
                page.add_script_tag(content=(mathjax / 'tex-chtml.js').read_text())
            page.add_script_tag(content=(ROOT / 'js/app.js').read_text())
            page.wait_for_function("['Ready','Calculation unavailable'].includes(document.querySelector('#status').textContent)")
            page.evaluate("window.dispatchEvent(new Event('load'))")
            return page

        def ready(page):
            page.wait_for_function("document.querySelector('#status').textContent === 'Ready'")

        def change(page, values):
            page.evaluate('''values => {for (const [id,value] of Object.entries(values)) {
                const el=document.getElementById(id);
                if (el.type==='checkbox') el.checked=value; else el.value=value;
                el.dispatchEvent(new Event('change',{bubbles:true}));
            }}''', values)
            ready(page)

        def roll(page, dice):
            page.locator('#clearRoll').click()
            change(page, {'availableDice': len(dice)})
            page.evaluate('''dice => dice.forEach(face => document.querySelector(`[data-face="${face}"]`).click())''', dice)
            ready(page)

        def rendered(page):
            page.wait_for_function('''() => {
                const formulas=[...document.querySelectorAll('#mathExplanation .formula')];
                return formulas.length > 0 && formulas.every(el=>el.querySelector('mjx-container'));
            }''')
            check('Every equation renders without a MathJax error', page.locator('mjx-merror').count() == 0)

        page = make_page()
        check('Default outcome probabilities are displayed', page.locator('#oddsRows tr').count() == 6
              and '2.31%' in page.locator('#oddsRows tr').last.inner_text())
        page.locator('#loadSample').click()
        ready(page)
        check('Sample recommends keeping one and rolling five', page.locator('.result-action').inner_text() == 'Keep 1; roll 5 dice'
              and page.locator('.move').count() == 3)
        check('Dice count remains editable after entering faces', page.locator('#availableDice').is_enabled()
              and page.locator('#rollSlots .roll-slot').count() == 6
              and page.locator('#hotReady').count() == 0)
        page.locator('#mathDetails').evaluate('(el)=>el.open=true')
        rendered(page)
        explanations = page.locator('#mathExplanation').inner_text()
        check('Roll probability formulas define the face-count vector and Farkle set',
              'Each cᵢ is the number of dice showing face i' in explanations
              and 'The set 𝓕' in explanations
              and 'c = (1, 1, 1, 0, 1, 2)' in explanations)
        check('Selected dice formulas define points and dice-count variables',
              'Let t be the unbanked points before the current roll' in explanations
              and 'the number kept' in explanations)
        check('Decision recursions define roll outcomes and continuation terms',
              'ω (omega)' in explanations and 'A(ω) is the set of legal scoring selections' in explanations
              and 'A policy, denoted π' in explanations)
        check('High-score formulas define the boundary and independence terms',
              'The threshold C is chosen' in explanations and 'Fnext means a Farkle' in explanations)
        check('The less-than branch survives HTML insertion', page.evaluate("Array.from(MathJax.startup.document.math).some(item=>item.math.includes('k<d'))"))
        page.locator('#advancedRules').evaluate('(el)=>el.open=true')
        for width in [320, 390, 620, 768, 900, 1024, 1440]:
            page.set_viewport_size({'width': width, 'height': 900})
            check(f'No page overflow at {width} px with equations and rules open',
                  page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.locator('#mathDetails').evaluate('(el)=>el.open=false')
            page.locator('#advancedRules').evaluate('(el)=>el.open=false')
            page.set_viewport_size({'width': 1440, 'height': 1000})
            page.screenshot(path=str(screenshots / 'desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.screenshot(path=str(screenshots / 'mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.locator('#rollSlots .selected').last.click()
        check('Removing a die keeps keyboard focus on a remaining die', page.evaluate("document.activeElement.matches('#rollSlots .selected')"))
        page.wait_for_function("document.querySelector('#status').textContent === 'Incomplete roll'")
        check('A partial roll has no strategy recommendation',
              page.locator('.result-action').count() == 0 and 'Enter 1 more die' in page.locator('#recommendation').inner_text())
        page.locator('#clearRoll').click()
        ready(page)
        change(page, {'availableDice': 3})
        check('Selecting three dice displays exactly three roll slots',
              page.locator('#rollSlots .roll-slot').count() == 3)
        page.locator('[data-face="1"]').click()
        page.wait_for_function("document.querySelector('#status').textContent === 'Incomplete roll'")
        check('Entering one of three dice produces no move recommendation',
              page.locator('#moveList .move').count() == 0
              and page.locator('#rollCountLabel').inner_text() == '1 of 3 dice entered')
        page.locator('[data-face="5"]').click()
        page.wait_for_function("document.querySelector('#status').textContent === 'Incomplete roll'")
        check('Two of three dice still cannot be analyzed',
              page.locator('.result-action').count() == 0)
        page.locator('[data-face="2"]').click()
        ready(page)
        check('Completing three dice produces results and prevents a fourth face',
              page.locator('#rollCountLabel').inner_text() == '3 dice entered'
              and page.locator('.face-button:not([disabled])').count() == 0
              and page.locator('#recommendation .result-action').count() == 1)
        change(page, {'availableDice': 2})
        check('Reducing count below entered faces clears the roll',
              page.locator('#rollSlots .roll-slot').count() == 2
              and page.locator('#rollSlots .selected').count() == 0
              and 'Roll cleared' in page.locator('#rollCountLabel').inner_text())
        page.locator('[data-face="1"]').click()
        page.locator('[data-face="5"]').click()
        ready(page)
        check('Two-dice roll is analyzed with two entered dice',
              page.locator('#rollCountLabel').inner_text() == '2 dice entered'
              and page.locator('#availableDice').input_value() == '2')
        page.locator('#loadSample').click()
        ready(page)
        check('Example switches the count to six and enters six faces',
              page.locator('#availableDice').input_value() == '6'
              and page.locator('#rollSlots .selected').count() == 6)
        roll(page, [1, 1, 1])
        check('Hot dice from a three-dice roll reset the next roll to six',
              'six dice available' in page.locator('#moveList').inner_text()
              and '2.31%' in page.locator('#recommendation').inner_text())
        page.locator('#clearRoll').click()
        ready(page)
        change(page, {'turnPoints': 2000, 'alreadyEntered': True, 'availableDice': 1})
        text = page.locator('#recommendation').inner_text()
        check('Banking risk is zero while hypothetical roll risk is retained',
              'Bank 2,000 points' in text and '66.67%' in text
              and page.locator('.metrics div').nth(3).locator('dd').inner_text() == '0%')
        change(page, {'previousFarkles': 2, 'preset': 'fixed'})
        check('Preset matches published triplet score and preserves history', page.locator('#tripleOnes').input_value() == '300'
              and page.locator('#previousFarkles').input_value() == '2')
        change(page, {'preset': 'doubling', 'bankedPoints': 250, 'streakPenalty': 1000, 'turnPoints': 600})
        roll(page, [2, 3, 6])
        check('Observed Farkle loses turn points and caps the banked penalty',
              'lose 600 unbanked points and 250 banked points' in page.locator('#recommendation').inner_text())
        rendered(page)
        change(page, {'previousFarkles': 0, 'streakPenalty': 0, 'bankedPoints': 9900,
                      'turnPoints': 0, 'objective': 'goal'})
        roll(page, [1])
        check('Target objective banks a sufficient legal score', page.locator('.result-action').inner_text() == 'Keep 1; bank 100 points'
              and '100%' in page.locator('#recommendation').inner_text())
        rendered(page)
        check('Target-probability recursion defines J, B_g, and G_g',
              'Let J(d,t) be the greatest probability' in page.locator('#mathExplanation').inner_text()
              and 'The bank term B' in page.locator('#mathExplanation').inner_text()
              and 'is the probability of eventual target success' in page.locator('#mathExplanation').inner_text())
        change(page, {'objective': 'ev', 'bankedPoints': 0, 'turnPoints': 100000, 'forceHot': True})
        check('Forced hot dice cannot bank at a high entered score', page.locator('.result-action').inner_text() == 'Keep 1; roll 6 dice')
        rendered(page)
        check('Forced-hot boundary equation defines the continuation value',
              'expected net banked-point change under the optimal continuation policy' in page.locator('#mathExplanation').inner_text())
        # Queue a different solution, then invalidate input while it is being computed.
        change(page, {'forceHot': False, 'turnPoints': 0})
        page.locator('#forceHot').evaluate("el=>{el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}")
        page.wait_for_timeout(150)
        page.locator('#turnPoints').fill('')
        page.wait_for_function("document.querySelector('#status').textContent==='Check the inputs'")
        page.wait_for_timeout(1200)
        check('A stale worker response cannot restore results after invalid input',
              page.locator('#status').inner_text() == 'Check the inputs'
              and page.locator('.move').count() == 0 and page.locator('#oddsRows tr').count() == 0
              and not page.locator('#mathExplanation').is_visible())
        for bad in ['125', '100050', '-50']:
            page.locator('#turnPoints').fill(bad)
            page.wait_for_function("document.querySelector('#status').textContent==='Check the inputs'")
            check(f'Invalid score {bad} is rejected rather than changed', page.locator('.result-action').count() == 0)
        change(page, {'forceHot': False, 'turnPoints': 0, 'alreadyEntered': True, 'bankedPoints': 0})
        roll(page, [1, 1, 1, 5, 5, 5])
        page.locator('#toggleMoves').click()
        page.locator('.move').last.click()
        page.locator('#toggleMoves').click()
        check('Collapsing choices keeps the selected choice visible', page.locator('.move[aria-pressed="true"]').count() == 1)
        saved = page.evaluate('(key)=>testStorage.get(key)', KEY)
        restored = make_page(saved=saved, use_math=False)
        check('Saved valid input restores the same selected dice', restored.locator('#rollCountLabel').inner_text() == '6 dice entered')
        check('The calculator still works without MathJax', restored.locator('#status').inner_text() == 'Ready'
              and 'LaTeX source' in restored.locator('#mathStatus').inner_text())
        restored.evaluate('''() => {
            MathJax.startup.promise = Promise.reject(Error('Equation startup failed'));
            MathJax.startup.promise.catch(()=>{});
        }''')
        change(restored, {'turnPoints': 100})
        restored.wait_for_function("document.querySelector('#mathStatus').textContent.includes('formatting failed')")
        check('Failed MathJax startup leaves the equations as readable source',
              restored.locator('#mathExplanation .formula').count() > 0
              and '\\[' in restored.locator('#mathExplanation').text_content())
        saved_v2 = '{"input":{"rules":{},"dice":[1,5,2],"turn":100,"banked":0,"goal":10000,"entered":false,"objective":"ev","nextDice":6,"hotReady":false},"preset":"doubling"}'
        legacy = make_page(use_math=False, legacy_saved=saved_v2)
        check('Saved rolls from the previous version retain their observed dice count',
              legacy.locator('#status').inner_text() == 'Ready'
              and legacy.locator('#availableDice').input_value() == '3'
              and legacy.locator('#rollSlots .selected').count() == 3)
        check('Legacy saved state is upgraded to the new storage key',
              legacy.evaluate('''key => testStorage.has(key)''', KEY))
        corrupt = make_page(saved='{invalid', use_math=False)
        check('Malformed saved settings fall back to defaults', corrupt.locator('#rollCountLabel').inner_text() == 'No dice entered')
        blocked = make_page(use_math=False, blocked_storage=True)
        check('Unavailable storage does not block calculations', blocked.locator('#status').inner_text() == 'Ready')
        no_worker = make_page(use_math=False, blocked_worker=True)
        check('Worker failure gives an explicit error without results', no_worker.locator('#status').inner_text() == 'Calculation unavailable'
              and no_worker.locator('#oddsRows tr').count() == 0)
        check('No unhandled JavaScript errors', not errors)
        print(f'\n{len(passed)} browser checks passed.')
        browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', required=True)
    parser.add_argument('--mathjax-es5', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    if not (args.mathjax_es5 / 'tex-chtml.js').is_file():
        parser.error('--mathjax-es5 must contain tex-chtml.js')
    run(args.chromium, args.mathjax_es5, args.screenshots)
