import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseSheets } from '../netlify/functions/lib/data.mjs';
import handler from '../netlify/functions/assets.mjs';

function fixture() {
  return [
    { values: [['자산분류'], ['예금', '<예금>', '은행', 100, 0, '유동자산'], ['주거', '보증금', '은행', 200, 0, '비유동자산'], ['총 자산', null, null, 300], ['부채분류'], ['대출', '대출', '은행', 50], ['총 부채', null, null, 50], ['순자산', null, null, 250]] },
    { values: [['총 매수금액(원)', 100], ['총 평가금액(원)', 110], ['USD/KRW'], [1300], ['종목코드/티커'], ['001', '<ETF>', 'KRW', 2, 50, 55, 100, 110, 10, .1, 110], [null, null, null, null, null, null, null, null, null, null, null, 0]] },
    { values: [['기준월'], ['2026-11', 300, '-', '-', 50, 250], ['2026-12', null, null, 0]] },
  ];
}
test('totals, summary exclusions, return units, and empty future months', () => {
  const data = parseSheets(fixture());
  assert.equal(data.total, 300);
  assert.equal(data.net, 250);
  assert.deepEqual(data.liquidity, { liquid: 100, illiquid: 200 });
  assert.equal(data.invest.holdings.length, 1);
  assert.equal(data.invest.holdings[0][6], 10);
  assert.deepEqual(data.monthly, [['2026-11', 300, null, 50, 250]]);
});
test('new asset and holding rows are included', () => {
  const ranges = fixture();
  ranges[0].values.splice(2, 0, ['예금', '새 계좌', '은행', 40, 0, '유동자산']);
  ranges[1].values.push(['US', '해외', 'USD', 1, 1, 1, 1, 1, 0, 0, 1300]);
  const data = parseSheets(ranges);
  assert.equal(data.total, 340);
  assert.equal(data.invest.overseas, 1300);
});
test('formula errors and changed headers fail rather than showing wrong totals', () => {
  const ranges = fixture();
  ranges[0].values[1][3] = '#REF!';
  assert.throws(() => parseSheets(ranges));
  assert.throws(() => parseSheets([]));
});
test('endpoint rejects mutations and reports missing configuration', async () => {
  assert.equal((await handler(new Request('http://localhost', { method: 'POST' }))).status, 405);
  const previous = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  try { assert.equal((await handler(new Request('http://localhost'))).status, 503); }
  finally { if (previous !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = previous; }
});
test('page renders fetched data, escapes sheet text, preserves display on failure and retries', async () => {
  const source = (await readFile('index.html', 'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1];
  const nodes = {};
  let fail = false;
  let interval;
  const tabNodes = ['overview', 'assets', 'invest', 'history'].map(name => ({
    attributes: { 'aria-controls': `panel-${name}` }, handlers: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key]; },
    addEventListener(key, handler) { this.handlers[key] = handler; },
    focus() { this.focused = true; },
  }));
  const context = {
    window: { scrollTo() {}, matchMedia() { return { matches: false, addEventListener() {} }; } },
    document: { documentElement: { dataset: {} }, querySelectorAll() { return tabNodes; }, getElementById(id) { return nodes[id] ??= { addEventListener() {}, setAttribute() {} }; }, addEventListener() {}, hidden: false },
    fetch: async () => { if (fail) throw new Error('offline'); return { ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => parseSheets(fixture()) }; },
    AbortSignal, setInterval(callback) { interval = callback; },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  tabNodes[2].handlers.click();
  assert.equal(nodes['panel-invest'].hidden, false);
  assert.equal(nodes['panel-overview'].hidden, true);
  assert.equal(tabNodes[2].attributes['aria-selected'], 'true');
  tabNodes[2].handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(nodes['panel-history'].hidden, false);
  assert.equal(nodes['panel-invest'].hidden, true);
  assert.equal(tabNodes[3].focused, true);
  assert.match(nodes.summary.innerHTML, /250/);
  assert.match(nodes.items.innerHTML, /&lt;예금&gt;/);
  const previous = nodes.summary.innerHTML;
  fail = true;
  interval();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.summary.innerHTML, previous);
  assert.match(nodes['connection-status'].textContent, /이전 조회값/);
  fail = false;
  interval();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(nodes['connection-status'].textContent, /연결됨/);
});
