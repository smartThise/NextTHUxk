const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function clock() {
  let now = 1000, next = 1;
  const jobs = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay = 0) { const id = next++; jobs.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    async advance(ms) {
      const until = now + ms;
      await flush();
      for (;;) {
        const due = [...jobs.entries()].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        jobs.delete(due[0]);
        due[1].fn();
        await flush();
      }
      now = until;
      await flush();
    },
  };
}
function node() {
  const classes = new Set(), handlers = new Map();
  let html = '';
  return {
    value: '', dataset: {}, children: [], style: {}, isConnected: true,
    classList: {
      add(name) { classes.add(name); }, remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
      toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
    },
    set innerHTML(value) {
      html = value;
      this.children = [...value.matchAll(/class="nx-sg-item" data-i="(\d+)"/g)].map(match => {
        const child = node(); child.dataset.i = match[1]; return child;
      });
    },
    get innerHTML() { return html; },
    addEventListener(name, fn) { handlers.set(name, fn); },
    dispatch(name, details = {}) {
      const event = { prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...details };
      if (name === 'input') this.oninput?.(event);
      else handlers.get(name)?.call(this, event);
      return event;
    },
    appendChild(child) { this.children.push(child); }, focus() {}, querySelector() { return null; },
  };
}
const page = code => '<form>选课文字说明' + (code ? `<tr data-code="${code}"></tr>` : '') + '共 1 页（共 1 条记录</form>';
const response = text => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
  arrayBuffer: async () => new TextEncoder().encode(text).buffer });

function fixture(fetcher = async () => response(page())) {
  const timer = clock(), elements = new Map(), requests = [];
  const element = name => { if (!elements.has(name)) elements.set(name, node()); return elements.get(name); };
  const searchWrap = node();
  const context = vm.createContext({
    window: {}, chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
    console: { log() {}, warn() {} }, AbortController, DOMException, TextDecoder, URLSearchParams,
    Date: class extends Date { static now() { return timer.now(); } },
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
    fetch: async (url, options) => { requests.push(new URL(url)); return fetcher(url, options); },
    document: { createElement: node },
    DOMParser: class { parseFromString(html) { return { html }; } },
  });
  for (const name of ['src/config.js', 'src/data.js', 'src/render.js', 'src/reviews.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  }
  const { NX } = context;
  Object.assign(NX.state, {
    BASE: 'https://zhjwxk.cic.tsinghua.edu.cn', SEM: 'fixture', isZhjwxk: true, $: element,
    allCourses: [{ code: '001', seq: '1', name: '数学分析', teacher: '教师' }],
    shadow: { querySelector(selector) {
      if (selector === '.nx-chip.on') return { dataset: { f: 'all' } };
      if (selector === '.nx-search-wrap') return searchWrap;
      if (selector === '#nextthuxk-suggest') return searchWrap.children.find(child => child.id === 'nextthuxk-suggest') || null;
      return null;
    } },
  });
  NX.gbkPercentEncode = encodeURIComponent;
  NX.normSeq = value => String(value);
  NX.parseCatalog = document => [...document.html.matchAll(/data-code="([^"]+)"/g)]
    .map(match => ({ code: match[1], seq: '1', name: match[1] }));
  NX.mergeServerRows = () => 0;
  NX.renderStageCart = () => {};
  NX.renderCourses = rows => { element('nextthuxk-list').innerHTML = rows.length ? rows.map(row => row.name).join(',') : 'NO_RESULTS'; };
  NX.renderListFooter = () => {};
  NX.highlightJumpTarget = () => {};
  context.$ = element;
  context.state = NX.state;
  context.filterCourses = NX.filterCourses;
  const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  vm.runInContext(content.slice(content.indexOf('const updateSearchInput ='), content.indexOf("$('nx-filter-credits').onchange")), context);
  const input = element('nextthuxk-search');
  const type = value => { input.value = value; input.dispatch('input'); };
  return { NX, timer, requests, input, type, element, searchWrap };
}

test('new input aborts a pending nonexistent course and accepts a replacement without its completion', async () => {
  const old = deferred();
  let oldSignal;
  const f = fixture(async (url, options) => {
    const query = new URL(url).searchParams.get('p_kcm');
    if (query === '不存在的课') { oldSignal = options.signal; await old.promise; }
    return response(page(query || 'browse'));
  });
  f.type('不存在的课');
  await f.timer.advance(620);
  assert(oldSignal);
  f.NX.state._jumpCode = 'old-jump';
  f.NX.state._jumpAutoAll = true;
  f.type('有效课程');
  assert.equal(oldSignal.aborted, true);
  assert.equal(f.NX.state._jumpCode, null);
  assert.equal(f.NX.state._jumpAutoAll, false);
  assert.equal(f.input.value, '有效课程');
  await f.timer.advance(620);
  assert.equal(f.NX.state._ssBusy, false);
  assert.equal(f.NX.state._searchRows[0].name, '有效课程');
  assert.equal(f.element('nextthuxk-list').innerHTML, '有效课程');
  old.resolve();
  await flush();
  assert.equal(f.NX.state._searchRows[0].name, '有效课程');
});

test('a nonexistent course finishes after the empty name and teacher results', async () => {
  const f = fixture();
  f.type('不存在的课程');
  await f.timer.advance(620);
  assert.equal(f.requests.length, 4);
  assert.equal(f.NX.state._ssBusy, false);
  assert.equal(f.NX.state._searchRows.length, 0);
  assert.equal(f.element('nextthuxk-list').innerHTML, 'NO_RESULTS');
  await f.timer.advance(2000);
  assert.equal(f.requests.length, 4);
});

test('clear cancels pending input debounce and leaves only a single browse query', async () => {
  const f = fixture();
  f.type('尚未提交');
  await f.timer.advance(60);
  f.element('nextthuxk-search-clear').onclick();
  assert.equal(f.input.value, '');
  await f.timer.advance(1000);
  assert.equal(f.requests.length, 2);
  assert(f.requests.every(url => !url.searchParams.get('p_kcm') && !url.searchParams.get('p_zjjsxm')));
  assert.equal(f.NX.state._ssBusy, false);
});

test('IME composition neither searches interim spelling nor consumes its confirmation Enter', async () => {
  const f = fixture();
  f.input.dispatch('compositionstart');
  f.input.value = 'shu xue';
  f.input.dispatch('input', { isComposing: true });
  const enter = f.input.dispatch('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  assert.equal(enter.prevented, false);
  assert.equal(enter.stopped, false);
  await f.timer.advance(1000);
  assert.equal(f.requests.length, 0);
  f.input.value = '数学';
  f.input.dispatch('compositionend');
  await f.timer.advance(620);
  assert(f.requests.some(url => url.searchParams.get('p_kcm') === '数学'));
  assert(!f.requests.some(url => url.searchParams.get('p_kcm') === 'shu xue'));
});

test('stale suggestions cannot replace a newer query through keyboard or pointer', async () => {
  const f = fixture();
  f.input.value = '数学';
  f.NX.suggestUpdate();
  const suggestions = f.searchWrap.children[0];
  assert.equal(suggestions.classList.contains('show'), true);
  f.input.value = '不存在'; // Programmatic changes also invalidate the suggestion query.
  f.input.dispatch('keydown', { key: 'ArrowDown' });
  f.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(f.input.value, '不存在');
  f.input.value = '数学';
  f.NX.suggestUpdate();
  f.input.value = '另一个查询';
  suggestions.dispatch('click', { target: { closest: () => ({ dataset: { i: '0' } }) } });
  assert.equal(f.input.value, '另一个查询');
  f.type('数学');
  await f.timer.advance(120);
  assert.equal(suggestions.classList.contains('show'), true);
  f.type('不存在');
  assert.equal(suggestions.classList.contains('show'), false);
});

test('Enter submits the typed text unless a suggestion was explicitly selected', async () => {
  const f = fixture();
  f.type('数学');
  await f.timer.advance(120);
  f.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(f.input.value, '数学');
  await f.timer.advance(0);
  const firstCount = f.requests.length;
  await f.timer.advance(1000);
  assert.equal(f.requests.length, firstCount, 'the cancelled debounce cannot restart the submitted search');
  f.type('数');
  await f.timer.advance(120);
  f.input.dispatch('keydown', { key: 'ArrowDown' });
  const selected = f.input.dispatch('keydown', { key: 'Enter' });
  assert.equal(f.input.value, '数学分析');
  assert.equal(selected.prevented, true);
  await f.timer.advance(0);
  assert(f.requests.some(url => url.searchParams.get('p_kcm') === '数学分析'));
});
