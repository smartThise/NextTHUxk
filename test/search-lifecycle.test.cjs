const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const page = (code = '', pages = 1) => '<form action="/xkBks.vxkBksJxjhBs.do">选课文字说明'
  + (code ? `<tr class="trr2" data-code="${code}"></tr>` : '')
  + `共 ${pages} 页（共 ${pages} 条记录</form>`;
const response = text => new Response(text, { headers: { 'content-type': 'text/html; charset=utf-8' } });

function load(fetch) {
  const elements = new Map();
  const element = name => {
    if (!elements.has(name)) elements.set(name, { value: '', classList: { toggle() {} }, focus() {}, addEventListener() {} });
    return elements.get(name);
  };
  const context = vm.createContext({
    window: {}, chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
    console: { log() {}, warn() {} }, AbortController, DOMException, TextDecoder, URLSearchParams,
    setTimeout, clearTimeout, fetch,
    DOMParser: class { parseFromString(html) { return { html }; } },
  });
  for (const name of ['src/config.js', 'src/data.js', 'src/render.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  }
  const { NX } = context;
  Object.assign(NX.state, {
    BASE: 'https://zhjwxk.cic.tsinghua.edu.cn', SEM: 'fixture', isZhjwxk: true,
    $: element, shadow: { querySelector: () => ({ dataset: { f: 'all' } }) },
  });
  NX.gbkPercentEncode = encodeURIComponent;
  NX.normSeq = value => String(value);
  NX.parseCatalog = document => [...document.html.matchAll(/data-code="([^"]+)"/g)]
    .map(match => ({ code: match[1], seq: '1', name: match[1] }));
  NX.mergeServerRows = () => 0;
  NX.renderStageCart = () => {};
  NX.highlightJumpTarget = () => {};
  NX.filterCourses = () => {};
  const query = value => {
    element('nextthuxk-search').value = value;
    NX.state._serverSig = NX.serverSigOf();
  };
  return { NX, context, query, element };
}

test('a nonexistent course stops after the empty result and one teacher fallback', async () => {
  const requests = [];
  const { NX } = load(async url => { requests.push(new URL(url)); return response(page()); });
  const result = await NX.serverSearchStorm({ kcm: '不存在的课程' });
  assert.equal(result.rows.length, 0);
  assert.equal(result.pageKind, 'empty');
  assert.equal(requests.length, 4);
  assert(!requests.some(url => Number(url.searchParams.get('page')) > 1));
});

test('known 27-page results remain complete', async () => {
  const { NX } = load(async url => {
    const u = new URL(url);
    return response(page('course-' + (u.searchParams.get('page') || 1), 27));
  });
  const result = await NX.serverSearchStorm({ kcm: '课程' });
  assert.equal(result.rows.length, 27);
  assert.equal(result.totalPages, 27);
});

test('clearing or replacing an active search aborts it and blocks its late result', async () => {
  const old = deferred(), next = deferred();
  let oldSignal;
  const { NX, query } = load(async (url, options) => {
    const value = new URL(url).searchParams.get('p_kcm');
    if (value === 'old') { oldSignal = options.signal; await old.promise; return response(page('old')); }
    if (value === 'next') { await next.promise; return response(page('next')); }
    return response(page('browse'));
  });
  query('old');
  const first = NX.runServerSearch();
  while (!oldSignal) await tick();
  NX.cancelServerSearch();
  assert.equal(oldSignal.aborted, true);
  query('next');
  const second = NX.runServerSearch();
  await first;
  assert.equal(NX.state._ssBusy, true, 'the cancelled run cannot clear the new loading state');
  old.resolve();
  await tick();
  assert.notEqual(NX.state._searchRows?.[0]?.code, 'old');
  next.resolve();
  await second;
  assert.equal(NX.state._searchRows[0].code, 'next');
  assert.equal(NX.state._ssBusy, false);

  NX.cancelServerSearch();
  query('');
  await NX.runServerSearch();
  assert.equal(NX.state._searchRows[0].code, 'browse');
});

test('queued cancellation returns promptly and never starts its request', async () => {
  const gate = deferred();
  const requests = [];
  const { NX } = load(async url => { requests.push(url); await gate.promise; return response(page('first')); });
  const first = NX.serverSearch({ kcm: 'first' });
  await tick();
  const controller = new AbortController();
  const second = NX.serverSearch({ kcm: 'cancelled', signal: controller.signal });
  controller.abort();
  await assert.rejects(second, error => error.name === 'AbortError');
  gate.resolve();
  await first;
  await tick();
  assert(!requests.some(url => url.includes('cancelled')));
});

test('interactive search interrupts background lookup and resumes it serially afterwards', async () => {
  const { NX } = load();
  const stalled = deferred();
  const calls = [];
  let backgroundSignal, active = 0, maxActive = 0, backgroundAttempts = 0;
  NX.state._serverSearchSessionKey = 'old-session';
  NX._serverSearchRaw = async options => {
    calls.push(options.kcm);
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      if (options.kcm === 'background' && ++backgroundAttempts === 1) {
        backgroundSignal = options.signal;
        await NX.abortable(stalled.promise, options.signal);
      }
      if (options.interactive) assert.equal(NX.state._serverSearchSessionKey, null);
      return { rows: [{ name: options.kcm }], pageKind: 'ok' };
    } finally { active--; }
  };
  const background = NX.serverSearch({ kcm: 'background' });
  const otherBackground = NX.serverSearch({ kcm: 'other-background' });
  await tick();
  const foreground = await NX.serverSearch({ kcm: 'typed-query', interactive: true });
  assert.equal(backgroundSignal.aborted, true);
  assert.equal(foreground.rows[0].name, 'typed-query');
  assert.equal((await background).rows[0].name, 'background');
  await otherBackground;
  assert.equal(calls[1], 'typed-query');
  assert.equal(backgroundAttempts, 2);
  assert.equal(maxActive, 1);
});

test('a search whose deadline already passed never starts an upstream request', async () => {
  let requests = 0;
  const { NX } = load(async () => { requests++; return response(page()); });
  await assert.rejects(NX.serverSearch({ deadline: Date.now() - 1 }), error => error.name === 'TimeoutError');
  assert.equal(requests, 0);
  assert.equal(NX._activeServerSearch, null);
});

test('an already-cancelled search issues no request and removes its deadline timer', async () => {
  let requests = 0;
  const { NX } = load(async () => { requests++; return response(page()); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(NX.serverSearch({ signal: controller.signal }), error => error.name === 'AbortError');
  await tick();
  assert.equal(requests, 0);
});

test('an overall deadline interrupts a pending request and releases the serial queue', async () => {
  let signal;
  const { NX } = load(async (url, options) => {
    if (new URL(url).searchParams.get('p_kcm') === 'slow') {
      signal = options.signal;
      return new Promise(() => {});
    }
    return response(page('ready'));
  });
  await assert.rejects(NX.serverSearchStorm({ kcm: 'slow', deadline: Date.now() + 30 }), error => error.name === 'TimeoutError');
  assert.equal(signal.aborted, true);
  const result = await NX.serverSearch({ kcm: 'ready' });
  assert.equal(result.rows[0].code, 'ready');
});

test('cancellation interrupts page retries without starting another fallback', async () => {
  const controller = new AbortController();
  const attempts = [];
  const { NX } = load();
  NX.serverSearch = async options => {
    NX.throwIfAborted(options.signal);
    attempts.push(options.page);
    if (options.page === 1) return { rows: [{ code: 'first', seq: '1' }], pageKind: 'ok', totalPages: 2 };
    controller.abort();
    return { rows: [], pageKind: 'unknown' };
  };
  await assert.rejects(NX.serverSearchStorm({ kcm: 'query', signal: controller.signal }), error => error.name === 'AbortError');
  assert.deepEqual(attempts, [1, 2]);
});

test('cancelling while reading the response body releases request timers and parent listeners', async () => {
  const controller = new AbortController();
  let additions = 0, removals = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { additions++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { removals++; return remove(...args); };
  const bodyRead = deferred();
  const { NX } = load(async () => ({
    ok: true, status: 200, headers: new Headers(),
    arrayBuffer() { bodyRead.resolve(); return new Promise(() => {}); },
  }));
  const pending = NX.fetchPage('https://zhjwxk.cic.tsinghua.edu.cn/fixture', { signal: controller.signal });
  await bodyRead.promise;
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(additions, removals);
});

test('the actual clear button cancels immediately and schedules a single-page browse', async () => {
  const { NX, context, query, element } = load();
  let cancelled = false, scheduled = 0;
  query('old');
  const run = NX.beginSearchRun();
  run.scope.signal.addEventListener('abort', () => { cancelled = true; });
  NX.scheduleServerSearch = immediate => { assert.equal(immediate, true); scheduled++; };
  const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  const handler = source.slice(source.indexOf('const updateSearchInput ='), source.indexOf("$('nx-filter-credits').onchange"));
  context.$ = element;
  context.state = NX.state;
  context.filterCourses = NX.filterCourses;
  vm.runInContext(handler, context);
  element('nextthuxk-search-clear').onclick();
  assert.equal(cancelled, true);
  assert.equal(element('nextthuxk-search').value, '');
  assert.equal(NX.state._browsePage, 1);
  assert.equal(scheduled, 1);
});

test('late full-result pagination cannot overwrite a newer query', async () => {
  const delayed = deferred();
  const { NX, query } = load();
  query('old');
  NX.serverSearchStorm = async () => delayed.promise;
  const first = NX.loadAllSearch();
  await tick();
  NX.cancelServerSearch();
  query('new');
  NX.state._searchRows = [{ code: 'new' }];
  delayed.resolve({ rows: [{ code: 'old' }], pageKind: 'ok', totalPages: 1 });
  await first;
  assert.equal(NX.state._searchRows[0].code, 'new');
  assert.equal(NX.state._loadingAll, false);
});

test('an invalid browse page restores and renders the previous page instead of leaving its spinner', async () => {
  const { NX, query } = load();
  const previous = [{ code: 'previous', seq: '1', name: 'Previous course' }];
  Object.assign(NX.state, { _browsePage: 1, _searchRows: previous, _searchTotalPages: 2, _searchTotalRows: 30 });
  NX.browseGoto(2);
  query('');
  let requests = 0, renders = 0;
  NX.serverSearch = async () => {
    requests++;
    return { pageKind: 'ok', rows: [], totalPages: 1 };
  };
  NX.filterCourses = () => { renders++; };
  await NX.runServerSearch();
  assert.equal(requests, 2);
  assert.equal(NX.state._browsePage, 1);
  assert.equal(NX.state._searchRows[0].code, 'previous');
  assert.equal(NX.state._serverSig, NX.serverSigOf());
  assert.equal(NX.state._ssBusy, false);
  assert.equal(renders, 1);
});
