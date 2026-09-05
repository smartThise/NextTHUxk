// ═══════════════════════════════════════════════════════════════
// NextTHUxk — Config: namespace, constants, helpers, storage, network
// ═══════════════════════════════════════════════════════════════

var NX = window.NX = {};

NX.browser = typeof browser !== 'undefined' ? browser : chrome;

// ─── Constants ────────────────────────────────────────────────
NX.TAG = '[NextTHUxk]';
NX.SP = 'nextthuxk_';
NX.DATA_VER = 6;
// 版本单源：直接读 manifest（双版本源实录——v2.0.1 只改了 manifest 没改这里，
// 运行时自报 2.0.0，cmpVer('2.0.1','2.0.0')>0 → 已装 2.0.1 仍永远提示更新）
NX.CUR_VER = (NX.browser.runtime && NX.browser.runtime.getManifest) ? NX.browser.runtime.getManifest().version : '2.0.0';
NX.BUILD = '01c359c';   // 构建标记：面板+启动日志可见，防「页面刷新了但扩展没刷新」的旧构建疑案
NX.DANGEROUS_VERS = ['1.0.1','1.0.2','1.0.3','1.1.2','1.2.0'];
NX.ZY_LIMITS = {
  bx: [[1,1],[2,2],[3,Infinity]], // 必修：1志愿1门, 2志愿2门, 3志愿无限
  xx: [[1,1],[2,2],[3,Infinity]],
  rx: [[1,1],[2,2],[3,Infinity]],
  ty: [[1,1],[2,1],[3,Infinity]], // 体育：1志愿1门, 2志愿1门
};

// ─── Shared State ─────────────────────────────────────────────
NX.state = {
  SEM: '',
  GRADE: 0,
  BASE: '',
  isZhjwxk: false,
  isZhjw: false,
  allCourses: [],
  planData: [],
  activeGroup: null,
  stageCart: [],
  savedDrafts: [],
  manualEvents: [],
  queueDataMap: {},
  isQueuePhase: false,
  candidateCourses: [],
  previewMode: 'selected',   // 'selected' | 'stage' | 'draft'
  previewDraftIdx: -1,
  expandedDraft: -1,
  host: null,
  shadow: null,
  $: null,
  updateTimer: null,
};

// ─── Helpers ──────────────────────────────────────────────────
NX.esc = function (s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// ─── Storage ──────────────────────────────────────────────────
NX.store = {
  get(k) {
    return new Promise(r =>
      NX.browser.storage.local.get(NX.SP + k, d => r(d[NX.SP + k]))
    );
  },
  set(k, v) {
    // Promise 形式：Chrome (MV3, callback 无参，错误走 runtime.lastError) 与
    // Firefox (Promise API) 均兼容；配额写失败会 reject + 打日志，不再静默。
    return new Promise((resolve, reject) => {
      try {
        let p = NX.browser.storage.local.set({ [NX.SP + k]: v });
        if (p && typeof p.then === 'function') {
          p.then(resolve, err => { console.warn(NX.TAG, 'storage.set', NX.SP + k, 'FAILED:', (err && err.message) || err); reject(err); });
        } else {
          resolve();
        }
      } catch (e) { console.warn(NX.TAG, 'storage.set threw:', e); reject(e); }
    });
  },
};

// ─── Network ──────────────────────────────────────────────────
NX._GBK_URL_RE = /zhjw|xkBks|jhBks|vjsKcbBs/;

// 编码探测解码（OneTHU reqvest 自动按响应转码的忠实等价）：
// ①服务端声明 charset → 按声明；②GBK/UTF-8 各解一遍，替换符（U+FFFD）
// 单侧出现即判定；③都无替换符 → 标签数多者胜（错码会吃掉 "<"/'"' 减标签）；
// ④仍平（纯 ASCII）→ xkBks 教务默认 GBK。
// 旧版对 xkBks URL 无条件 GBK：源为 UTF-8 时中文尾字节吞掉标签引号，
// dlSearch/kbSearch 结构损坏解析 0 行——「候选彻底消失」实锤根因。
NX.decodeBest = function (buf, url) {
  const asGbk = new TextDecoder('gbk').decode(buf);
  const asUtf8 = new TextDecoder('utf-8').decode(buf);
  const REPL = String.fromCharCode(0xFFFD);   // U+FFFD 解码替换符
  const gbkBad = asGbk.includes(REPL);
  const utf8Bad = asUtf8.includes(REPL);
  if (gbkBad !== utf8Bad) return gbkBad ? asUtf8 : asGbk;
  const gTags = (asGbk.match(/</g) || []).length;
  const uTags = (asUtf8.match(/</g) || []).length;
  if (gTags !== uTags) return gTags > uTags ? asGbk : asUtf8;
  return NX._GBK_URL_RE.test(url) ? asGbk : asUtf8;
};

NX._fetchRaw = async function (url, opts = {}) {
  // 15s 超时（AbortController）：无超时则单请求挂起会卡死一切等待它的链路
  // （已选时间回填卡「查询中」实录）
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let resp;
  try {
    resp = await fetch(url, { credentials: 'include', ...opts, signal: ctl.signal });
  } finally { clearTimeout(timer); }
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = await resp.arrayBuffer();
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('gb')) return new TextDecoder('gbk').decode(buf);
  if (ct.includes('utf-8')) return new TextDecoder('utf-8').decode(buf);
  return NX.decodeBest(buf, url);
};

// WebVPN 票据自愈（OneTHU proxyZhjwxkApi 死页自愈语义回移；用户实录：学生
// 已登录仍吃 __vpn_hostname_data 壳页——旧提示「退出重新登录」是误诊）。
// 主 WebVPN 会话活着但 wengine_vpn_ticket 过期时，请求被 302 到壳页；
// 重进一次教务入口根（BASE）即自动换票，无需退出登录。60s 冷却防循环。
NX.fetchPage = async function (url, opts = {}) {
  const html = await NX._fetchRaw(url, opts);
  const shell = html && (html.includes('__vpn_hostname_data') || html.includes('__vpn_app_hostname_data'));
  if (shell && NX.isXkDeadHtml && NX.reenterZhjwxk) {
    if (await NX.reenterZhjwxk()) {
      try { return await NX._fetchRaw(url, opts); } catch (e2) { console.warn(NX.TAG, 'webvpn 换票后重试仍失败，保留壳页给上层诊断', e2); }
    }
  }
  return html;
};

// 双解码抓取（OneTHU reqwest 自动转码的最忠实等价）：返回 gbk/utf8 两种解码，
// 由调用方按解析结果挑——kbSearch 的「候选：」正则只在正确解码下命中，
// 天然判别器；行数同则替换符少者胜，再同则教务默认 GBK。
NX.fetchPageDual = async function (url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let resp;
  try {
    resp = await fetch(url, { credentials: 'include', ...opts, signal: ctl.signal });
  } finally { clearTimeout(timer); }
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = await resp.arrayBuffer();
  return { gbk: new TextDecoder('gbk').decode(buf), utf8: new TextDecoder('utf-8').decode(buf) };
};

// 双解码结果选优：score = parse(html).length ×2 +（无替换符 +1）；平分回退 gbk。
NX.pickDecoded = function (parse, dual) {
  const REPL = String.fromCharCode(0xFFFD);
  const ga = parse(dual.gbk), ua = parse(dual.utf8);
  const gs = ga.length * 2 + (dual.gbk.includes(REPL) ? 0 : 1);
  const us = ua.length * 2 + (dual.utf8.includes(REPL) ? 0 : 1);
  return us > gs ? ua : ga;
};

// ─── 并发分页抓取器 ───────────────────────────────────────────
// 通用：先抓首页，再以固定并发窗口抓 page=0..maxPages。
// v1.3.6 强化（修复并发下提前终止丢数据）：
//   1) 单页请求失败或返回空 → 重试 retry 次再判定（老教务系统对突发并发敏感）
//   2) expectPages（从首页"共 N 页"解析）已知时，抓完后对缺失页自动补抓一轮
//   3) 仍缺失 → console.warn 列明细，不再静默截断
NX.pagedFetch = async function (opts) {
  const {
    fetchFirst,          // async () => html（首页，无 page 参数）；与 firstHtml 二选一
    firstHtml = null,    // 已抓好的首页 HTML（避免重复请求）
    fetchPage,           // async (p) => html（p >= 0；p=0 可能与首页重复，dedupe 吸收）
    parse,               // html => { items: [], hasData: bool }
    maxPages = 300,
    concurrency = 5,
    dedupe = null,       // item => key（可选，用于去重）
    retry = 2,           // 单页失败/空页的重试次数
    retryDelay = 300,    // 重试退避 ms
    expectPages = 0,     // 已知总页数（含首页）；抓完后不足则补抓
    label = '',          // 日志标签
    throttle = 100,      // 请求节流 ms（≥服务器限流安全速率；0=不节流）
    cooldown = 8000,     // 补抓两轮之间的冷却等待 ms（等服务器限流窗口解除）
  } = opts;
  const pages = new Map();          // pageNum -> items
  const seen = dedupe ? new Set() : null;
  let stop = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 节流闸：预约式占用槽位（同步更新 lastReq），保证任意两次实际请求发起间隔 ≥ throttle
  let lastReq = 0;
  const gate = () => new Promise(r => {
    const at = Math.max(Date.now(), lastReq + throttle);
    lastReq = at;
    setTimeout(r, Math.max(0, at - Date.now()));
  });

  const absorb = (p, items) => {
    // 合并语义：p=0 与首页可能都有数据（0 基分页），不能覆盖（v1.3.6 修复：曾致首页数据丢失）
    const kept = pages.get(p) || [];
    for (const it of items) {
      if (seen) { const k = dedupe(it); if (seen.has(k)) continue; seen.add(k); }
      kept.push(it);
    }
    pages.set(p, kept);
  };

  // 带重试的单页抓取：网络错误与空页都重试；重试期间 pause 铺新页（避免越界请求）；
  // 重试后仍空 → 返回 'EMPTY'（真末页）
  let pause = false;
  // 空页诊断（v1.3.8）：区分「真没数据」与「被拦截」，只记录第一例避免刷屏
  let emptyDiag = null;
  const diagEmpty = html => {
    if (emptyDiag) return;
    const h = html || '';
    const feats = [];
    if (h.includes('accessDenied')) feats.push('accessDenied(被拒绝)');
    if (/重新登录|登录超时|请先登录/.test(h)) feats.push('登录失效');
    if (h.includes('gridData')) feats.push('gridData(数组存在)');
    if (/<table/i.test(h)) feats.push('有表格结构');
    emptyDiag = 'len=' + h.length + (feats.length ? ' 特征=[' + feats.join(', ') + ']' : ' 无已知特征') + ' head="' + h.slice(0, 100).replace(/\s+/g, ' ') + '"';
  };
  const fetchOne = async p => {
    for (let attempt = 0; ; attempt++) {
      let r, html = '';
      try {
        if (throttle > 0) await gate();
        html = await fetchPage(p);
        r = parse(html);
      }
      catch (e) {
        pause = true;   // 失败即暂停铺新页（含首次），等本页终态
        if (attempt < retry) { await sleep(retryDelay * (attempt + 1)); continue; }
        pause = false; return 'ERR:' + (e && e.message ? e.message : 'unknown');
      }
      if (r.hasData) { pause = false; return r; }
      diagEmpty(html);
      pause = true;
      if (attempt < retry) { await sleep(retryDelay * (attempt + 1)); continue; }
      pause = false; return 'EMPTY';
    }
  };

  let fh = firstHtml;
  if (fh == null) {
    try { fh = await fetchFirst(); }
    catch (e) { console.warn(NX.TAG, 'pagedFetch first page:', e); return []; }
  }
  const first = parse(fh);
  absorb(0, first.items);
  if (!first.hasData) return [...pages.get(0)];

  const cap = expectPages > 0 ? Math.min(expectPages, maxPages) : maxPages;

  let next = 0, active = 0;   // 从 0 起：兼容 0 基分页（page=0 与首页重复时由 dedupe 吸收）
  await new Promise(resolve => {
    const launch = () => {
      while (!stop && !pause && active < concurrency && next <= cap) {
        const p = next++;
        active++;
        fetchOne(p)
          .then(r => {
            if (typeof r === 'string') { stop = true; return; }
            absorb(p, r.items);
          })
          .finally(() => {
            active--;
            if (active === 0 && (stop || next > cap)) resolve();
            else launch();
          });
      }
      if (active === 0 && !pause) resolve();
    };
    launch();
  });

  // ── 总数校验补抓（v1.3.8：纯 EMPTY 免冷却——服务器稳定返回空页时，等待重试无意义）──
  if (expectPages > 0) {
    const cap = Math.min(expectPages, maxPages);
    let missing = [];
    for (let p = 0; p <= cap; p++) {           // <=cap：兼容 1 基分页（多抓一页由 dedupe 吸收）
      if (!pages.has(p)) missing.push(p);
    }
    if (missing.length) {
      console.warn(NX.TAG, label, 'first pass missing', missing.length, 'pages, retrying:', missing.slice(0, 10).join(','), missing.length > 10 ? '…' : '');
      const recover = async (list, conc) => {
        let errStreak = 0, empties = 0, errs = 0;
        await NX.runPool(list, conc, async p => {
          if (errStreak >= 5) return;          // 熔断：连续 5 页失败视为系统性故障
          const r = await fetchOne(p);
          if (typeof r === 'string') {
            errStreak++;
            if (r === 'EMPTY') empties++; else errs++;
            console.warn(NX.TAG, label, 'page', p, 'failed:', r);
            return;
          }
          errStreak = 0;
          absorb(p, r.items);
        });
        return { empties, errs };
      };
      const r1 = await recover(missing, 2);
      let still = missing.filter(p => !pages.has(p));
      if (still.length && cooldown > 0 && (r1.errs > 0 || r1.empties === 0)) {
        // 只有出现网络错误（可能瞬态）或首轮全成功却仍缺（异常态）才值得冷却后再试；
        // 全部 EMPTY = 服务器稳定认为这些页没数据 → 不冷却（省 8s+，v1.3.8 修"变慢"）
        console.warn(NX.TAG, label, still.length, 'pages still missing, cooling down', cooldown, 'ms before final round…');
        await sleep(cooldown);
        await recover(still, 1);
        still = still.filter(p => !pages.has(p));
      }
      if (still.length) {
        console.warn(NX.TAG, label, 'STILL MISSING after recovery:', still.length, 'pages →', still.slice(0, 20).join(','));
        if (emptyDiag) console.warn(NX.TAG, label, 'empty-page diagnostic:', emptyDiag);
      }
    }
  }

  const out = [];
  [...pages.keys()].sort((a, b) => a - b).forEach(p => out.push(...pages.get(p)));
  return out;
};

// ─── Misc Helpers ─────────────────────────────────────────────
// 固定并发度跑完一批异步任务（无终止语义，与 pagedFetch 的空页终止互补）
NX.runPool = async function (items, concurrency, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  });
  await Promise.all(workers);
};

NX.debounce = function (fn, ms) {
  let t = 0;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

// 小写化缓存（key 为字符串故用 Map；全校课名种类有限，无泄漏风险）
NX._lowerCache = new Map();
NX.lc = function (s) {
  if (!s) return '';
  let v = NX._lowerCache.get(s);
  if (v === undefined) { v = s.toLowerCase(); NX._lowerCache.set(s, v); }
  return v;
};
