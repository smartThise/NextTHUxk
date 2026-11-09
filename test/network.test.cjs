const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const bootstrap = '<script>var __vpn_hostname_data = {}; var __vpn_app_hostname_data = {};</script>';
const business = '<form action="/xkBks.vxkBksXkbBs.do"><input name="m" value="yxSearchTab"><input name="token" value="fixture"><input name="p_xnxq" value="fixture"></form>';
const login = '<form action="/do/off/ui/auth/login/check"><input name="i_pass" type="password"></form>';

function load(fetch) {
  const context = vm.createContext({
    window: {},
    chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
    console: { log() {}, warn() {} },
    AbortController,
    DOMException,
    TextDecoder,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch,
  });
  for (const file of ['src/config.js', 'src/data.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  context.NX.state.BASE = 'https://zhjwxk.cic.tsinghua.edu.cn';
  context.NX.state.SEM = 'fixture';
  context.NX.state.isZhjwxk = true;
  return context;
}

function response(html, status = 200) {
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

test('authenticated business pages tolerate WebVPN and login declarations', () => {
  const { NX } = load();
  for (const html of [
    bootstrap + business,
    bootstrap + '<script>var gridDataRows = [["fixture"]];</script>',
    bootstrap + '<frameset><frame src="/xk/top.html"></frameset>',
    business + '<script>var loginUrl="/do/off/ui/auth/login/check"; var passLogin=true; var failure="accessDenied";</script>',
    business + '<!-- <form action="/do/off/ui/auth/login/check"> -->',
  ]) {
    assert.equal(NX.isXkDeadHtml(html), false);
    assert.equal(NX.isSsoLoginHtml(html), false);
  }
});

test('actual sign-in, confirmation, expired-session and bootstrap-only pages are rejected', () => {
  const { NX } = load();
  for (const html of [
    login,
    '<form action="/do/off/ui/auth/login/checkSingle"><button>Confirm</button></form>',
    '<div id="passLogin"><input name="i_user"></div>',
    '<title>清华大学用户电子身份服务系统</title>',
  ]) {
    assert.equal(NX.isSsoLoginHtml(html), true);
    assert.equal(NX.isXkDeadHtml(html), true);
  }
  for (const html of [
    bootstrap,
    '<a href="/do/off/ui/auth/login/form/fixture">Sign in</a>',
    '<p>用户登陆超时或访问内容不存在。请重试</p>' + business,
    '<p>Session has expired. Please sign in again.</p>' + business,
    '<p>accessDenied</p>' + business,
  ]) assert.equal(NX.isXkDeadHtml(html), true);
});

test('business fetch preserves its origin and credentials without reentering', async () => {
  const requests = [];
  const { NX } = load(async (url, options) => {
    requests.push({ url, options });
    return response(bootstrap + business);
  });
  let reentries = 0;
  NX.reenterZhjwxk = async () => { reentries++; return true; };
  const url = NX.state.BASE + '/xkBks.vxkBksXkbBs.do?m=yxSearchTab';
  assert.equal(await NX.fetchPage(url), bootstrap + business);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, url);
  assert.equal(requests[0].options.credentials, 'include');
  assert.equal(reentries, 0);
});

test('sign-in pages are returned without attempting WebVPN reentry', async () => {
  const { NX } = load(async () => response(bootstrap + login));
  let reentries = 0;
  NX.reenterZhjwxk = async () => { reentries++; return true; };
  assert.equal(await NX.fetchPage(NX.state.BASE + '/fixture'), bootstrap + login);
  assert.equal(reentries, 0);
});

test('concurrent bootstrap responses share one reentry and retry their own requests', async () => {
  let releaseReentry;
  const reentryStarted = new Promise(resolve => { releaseReentry = resolve; });
  let finishReentry;
  const reentryGate = new Promise(resolve => { finishReentry = resolve; });
  const counts = new Map();
  const { NX } = load(async url => {
    const pathname = new URL(url).pathname;
    counts.set(pathname, (counts.get(pathname) || 0) + 1);
    if (pathname === '/') {
      releaseReentry();
      await reentryGate;
      return response(bootstrap + business);
    }
    return response(counts.get(pathname) === 1 ? bootstrap : bootstrap + business);
  });
  const first = NX.fetchPage(NX.state.BASE + '/one');
  const second = NX.fetchPage(NX.state.BASE + '/two');
  await reentryStarted;
  finishReentry();
  assert.deepEqual(await Promise.all([first, second]), [bootstrap + business, bootstrap + business]);
  assert.equal(counts.get('/'), 1);
  assert.equal(counts.get('/one'), 2);
  assert.equal(counts.get('/two'), 2);
  assert.equal(await NX.reenterZhjwxk(), false);
  assert.equal(counts.get('/'), 1);
});

test('failed reentry stays bounded by the existing cooldown', async () => {
  let requests = 0;
  const { NX } = load(async () => { requests++; return response(bootstrap); });
  assert.equal(await NX.fetchPage(NX.state.BASE + '/one'), bootstrap);
  assert.equal(await NX.fetchPage(NX.state.BASE + '/two'), bootstrap);
  assert.equal(requests, 3);
});

test('cancelling one coalesced reentry waiter preserves the other request', async () => {
  let begin, release, rootSignal;
  const started = new Promise(resolve => { begin = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const counts = new Map();
  const { NX } = load(async (url, options) => {
    const pathname = new URL(url).pathname;
    counts.set(pathname, (counts.get(pathname) || 0) + 1);
    if (pathname === '/') {
      rootSignal = options.signal;
      begin();
      await gate;
      return response(business);
    }
    return response(counts.get(pathname) === 1 ? bootstrap : business);
  });
  const controller = new AbortController();
  const first = NX.fetchPage(NX.state.BASE + '/first', { signal: controller.signal });
  const second = NX.fetchPage(NX.state.BASE + '/second');
  await started;
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(first, error => error.name === 'AbortError');
  assert.equal(rootSignal.aborted, false);
  release();
  assert.equal(await second, business);
  assert.equal(counts.get('/'), 1);
});

test('server search parses real business HTML carrying WebVPN declarations', async () => {
  const html = bootstrap + business + '<table><tr class="trr2"><td>fixture</td></tr></table>';
  const context = load(async () => response(html));
  const { NX } = context;
  context.DOMParser = class { parseFromString(value) { return { html: value }; } };
  NX.gbkPercentEncode = encodeURIComponent;
  NX.parseCatalog = doc => doc.html === html ? [{ code: 'fixture' }] : [];
  const result = await NX.serverSearch({ kch: 'fixture' });
  assert.equal(result.pageKind, 'ok');
  assert.equal(result.rows.length, 1);
});

test('tab search accepts valid grid data carrying WebVPN declarations', async () => {
  const html = bootstrap + '<script>var gridData = [["fixture"]];</script>';
  const { NX } = load(async () => response(html));
  NX.parseTabGrid = () => [{ code: 'fixture' }];
  const result = await NX.tabSearchByKch('fixture');
  assert.equal(result.length, 1);
});

test('HTTP failures keep status and the schools published-data explanation', async () => {
  const html = '<html><title>提示信息</title><p>最新数据还未发布</p></html>';
  const { NX } = load(async () => response(html, 500));
  for (const operation of [NX._fetchRaw, NX.fetchPageDual]) {
    await assert.rejects(operation(NX.state.BASE + '/fixture'), error => {
      assert.equal(error.status, 500);
      assert.equal(error.message, 'HTTP 500 · 最新数据还未发布');
      assert.equal(error.reason, '最新数据还未发布');
      return true;
    });
  }
  const queue = await NX.fetchQueueData([]);
  assert.equal(queue.notice, 'HTTP 500 · 最新数据还未发布');
  assert.equal(queue.phase, false);
  assert.equal(Object.keys(queue.map).length, 0);
});

test('generic HTTP errors disclose neither page content nor script-only explanations', async () => {
  const { NX } = load(async () => response('<script>var note="最新数据还未发布";</script><p>fixture-private-detail</p>', 503));
  await assert.rejects(NX.fetchPage(NX.state.BASE + '/fixture'), error => {
    assert.equal(error.status, 503);
    assert.equal(error.message, 'HTTP 503');
    assert.equal(error.reason, undefined);
    return true;
  });
});

test('an authenticated empty selected-course table remains empty', async () => {
  const context = load(async () => response(bootstrap + business));
  const { NX } = context;
  context.DOMParser = class { parseFromString() { return { querySelectorAll: () => [] }; } };
  NX.fetchLevelTable = async () => ({});
  NX.overrideFromWholeTT = async rows => rows;
  assert.equal((await NX.fetchSelectedCourses()).length, 0);
});
