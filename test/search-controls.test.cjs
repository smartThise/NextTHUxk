const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('typing cancels immediately and deleting all text restores browsing immediately', async () => {
  const elements = new Map();
  const element = name => {
    if (!elements.has(name)) elements.set(name, { value: '', addEventListener() {} });
    return elements.get(name);
  };
  const NX = { state: { $: element }, debounce: callback => callback, updateSearchClear() {} };
  const root = path.resolve(__dirname, '..');
  const render = fs.readFileSync(path.join(root, 'src/render.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'src/config.js'), 'utf8');
  const context = vm.createContext({ NX, window: {}, chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
    AbortController, DOMException, setTimeout, clearTimeout });
  // Network helpers and lifecycle functions are production source, while DOM callbacks are bounded fixtures.
  vm.runInContext(config.replace('var NX = window.NX = {};', 'var NX = window.NX = NX;'), context);
  vm.runInContext(render.match(/NX\.cancelServerSearch = function[\s\S]*?\n};/)[0], context);
  let renders = 0, scheduled = 0;
  context.$ = element;
  context.state = NX.state;
  context.filterCourses = () => { renders++; };
  NX.scheduleServerSearch = immediate => { assert.equal(immediate, true); scheduled++; };
  const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('const updateSearchInput ='), source.indexOf("$('nextthuxk-search').addEventListener('keydown'")), context);
  const input = element('nextthuxk-search');
  const first = NX.searchScope();
  NX.state._searchRun = { scope: first };
  input.value = 'changed';
  input.oninput();
  assert.equal(first.signal.aborted, true);
  assert.equal(renders, 0);
  await new Promise(resolve => setTimeout(resolve, 140));
  assert.equal(renders, 1);
  const second = NX.searchScope();
  NX.state._searchRun = { scope: second };
  input.value = '';
  input.oninput();
  assert.equal(second.signal.aborted, true);
  assert.equal(NX.state._browsePage, 1);
  assert.equal(renders, 2);
  assert.equal(scheduled, 1);
});
