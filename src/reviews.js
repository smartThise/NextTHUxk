// ═══════════════════════════════════════════════════════════════
// NextTHUxk — Reviews: THU选课社区 (thubook.help/thucourse) 实时评价层
// 数据/内容由 THU选课社区贡献者提供，授权协议 CC BY-NC 4.0：
//   https://creativecommons.org/licenses/by-nc/4.0/deed.zh
//   （署名-非商业性使用；弹窗内已随内容展示同款署名声明）
// 设计原则：
//   · 数据源是公开静态 JSON（CORS *），永远实时拉取，不在本地囤点评正文
//   · 仅缓存一份精简索引（count/avg/sqid），SWR 过期后台静默刷新
//   · 单课点评正文在用户打开弹窗时才拉（KB 级），天然实时
//   · 全程 fail-soft：任一环节失败都不影响选课主流程
// ═══════════════════════════════════════════════════════════════
var NX = NX || {};

(function () {
  const TAG = '[NextTHUxk][TB]';
  const TB_PAGE = 'https://thubook.help/thucourse/';
  const TB_DATA = 'https://thubook.help/data/';
  const IDX_KEY = 'tbookIdx';     // 精简索引 {v, ts, courses:{[sqid]:{...}}}
  const TS_KEY = 'tbookIdxTs';
  const IDX_VER = 1;
  const IDX_TTL = 24 * 3600 * 1000;      // 索引过期阈值（后台静默刷新）
  const DETAIL_TTL = 10 * 60 * 1000;     // 正文内存缓存

  // ─── 归一化 ────────────────────────────────────────────────
  // 课程名：NFKC 折叠全角、去所有空白、小写拉丁。保留括号（是课名的一部分）
  function normName(s) {
    return String(s || '')
      .normalize('NFKC')
      .replace(/[\s\u00a0\u3000]+/g, '')
      .toLowerCase();
  }
  // 教师：拆分成名字 token 集合（多教师顺序无关、分隔符差异无关）
  function normTeacherTokens(s) {
    return String(s || '')
      .normalize('NFKC')
      .split(/[,，、;；/\s]+/)
      .map(x => x.trim())
      .filter(Boolean);
  }
  const tKey = (tokens) => tokens.slice().sort().join('\u0002');

  // ─── 状态 ──────────────────────────────────────────────────
  const S = {
    ready: false,
    loadingPromise: null,
    entries: [],            // [{kcm,jsm,kkdw,sqid,tid,count,avg,nt:[tokens]}]
    bySqid: new Map(),
    byNameT: new Map(),     // norm(name)+\u0001+tKey -> [entries]
    byName: new Map(),      // norm(name) -> [entries]
    detailCache: new Map(), // sqid -> {ts, data}
    stats: null,
  };
  NX.tbState = S;

  function slimIndex(raw) {
    const src = (raw && raw.courses) || {};
    const out = {};
    for (const k in src) {
      const e = src[k];
      if (!e || typeof e !== 'object' || e.sqid == null) continue;
      out[e.sqid] = {
        kcm: e.kcm || '', jsm: e.jsm || '', kkdw: (e.kkdw || '').trim(),
        sqid: e.sqid, tid: e.tid != null ? e.tid : null,
        count: e.count || 0,
        avg: Math.round((e.avg || 0) * 10) / 10,
      };
    }
    return { v: IDX_VER, ts: Date.now(), courses: out };
  }

  function push(map, k, v) {
    let a = map.get(k);
    if (!a) { a = []; map.set(k, a); }
    a.push(v);
  }

  function buildMaps(idx) {
    const entries = [];
    const bySqid = new Map();
    const byNameT = new Map();
    const byName = new Map();
    for (const sqid in idx.courses) {
      const e = idx.courses[sqid];
      e.nt = normTeacherTokens(e.jsm);
      entries.push(e);
      bySqid.set(String(sqid), e);
      const nk = normName(e.kcm);
      push(byNameT, nk + '\u0001' + tKey(e.nt), e);
      push(byName, nk, e);
    }
    S.entries = entries; S.bySqid = bySqid; S.byNameT = byNameT; S.byName = byName;
    S.ready = true;
  }

  async function fetchIndex() {
    const res = await fetch(TB_DATA + 'with_comment_index.json', { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return slimIndex(await res.json());
  }

  // SWR：先秒用缓存建图；超过 TTL 后台静默刷新（单飞行 promise 防并发）
  NX.tbEnsureIndex = function () {
    if (S.loadingPromise) return S.loadingPromise;
    S.loadingPromise = (async () => {
      let cached = null, cachedTs = 0;
      try {
        cached = await NX.store.get(IDX_KEY);
        cachedTs = (await NX.store.get(TS_KEY)) || 0;
      } catch (e) { /* storage 异常不阻断 */ }
      if (cached && cached.v === IDX_VER && cached.courses) {
        try { buildMaps(cached); } catch (e) { console.warn(TAG, 'cache build fail', e); }
      }
      const fresh = cached && (Date.now() - cachedTs) < IDX_TTL;
      if (!fresh) {
        try {
          const idx = await fetchIndex();
          buildMaps(idx);
          reattachAll();
          try { await NX.store.set(IDX_KEY, idx); await NX.store.set(TS_KEY, Date.now()); }
          catch (e) { console.warn(TAG, 'idx save fail', e); }
        } catch (e) { console.warn(TAG, 'index fetch fail', e.message || e); }
      } else {
        // 缓存新鲜：静默预热到最新（失败忽略，明天再说）
        fetchIndex().then(idx => {
          buildMaps(idx);
          reattachAll();
          try { NX.store.set(IDX_KEY, idx); NX.store.set(TS_KEY, Date.now()); } catch (e) {}
        }).catch(() => {});
      }
      return S.ready;
    })();
    return S.loadingPromise;
  };

  function reattachAll() {
    try {
      if (NX.state && Array.isArray(NX.state.allCourses) && NX.state.allCourses.length && typeof NX.tbAttach === 'function') {
        NX.tbAttach(NX.state.allCourses);
        if (typeof NX.filterCourses === 'function') NX.filterCourses();   // 重绘徽章（fail-soft）
        if (typeof NX.reapplyJumpIfFresh === 'function') NX.reapplyJumpIfFresh();   // 重渲后恢复跳转定位
      }
    } catch (e) {}
  }

  // ─── 匹配（三级降级）───────────────────────────────────────
  // 返回 entry | null；结果记入 stats 供调试
  NX.tbMatch = function (c) {
    if (!S.ready) return null;
    const nk = normName(c.name);
    const ct = normTeacherTokens(c.teacher);
    const ctk = tKey(ct);

    // T1: 名 + 师 全精确
    const hit = S.byNameT.get(nk + '\u0001' + ctk);
    if (hit && hit.length === 1) { bump('t1'); return hit[0]; }

    // T2: 同名桶内教师 token 相交（或任一方无教师信息 → 中信度匹配）
    const bucket = S.byName.get(nk);
    if (bucket) {
      if (bucket.length === 1) {
        const e = bucket[0];
        const disjoint = ct.length && e.nt.length && !ct.some(t => e.nt.includes(t));
        if (!disjoint) { bump('t2'); return e; }
      } else {
        let best = null, bestScore = -1;
        for (const e of bucket) {
          const inter = ct.filter(t => e.nt.includes(t)).length;
          let score;
          if (ct.length && e.nt.length) score = inter > 0 ? 10 + inter : -1;
          else score = 5;
          if (score < 0) continue;
          score += Math.min(e.count, 10) * 0.01;   // 同分位取更热门的
          if (score > bestScore) { bestScore = score; best = e; }
        }
        if (best) { bump('t2'); return best; }
      }
    }

    // T3: 命名漂移兜底——去「(英)/荣誉/尾缀序号」再试一次；必须过教师核对
    // （否则 "微积分A(1)(英)(SMITH)" 会错吸到 "(王晓峰)" 班的评价）
    const nkStripped = nk.replace(/\((?:英|中文)\)|（(?:英|中文)）|荣誉|\(\d+\)$/, '');
    if (nkStripped && nkStripped !== nk) {
      const b2 = S.byName.get(nkStripped);
      if (b2 && b2.length === 1) {
        const e0 = b2[0];
        const okTeacher = !ct.length || !e0.nt.length || ct.some(t => e0.nt.includes(t));
        if (okTeacher) { bump('t3'); return e0; }
      }
    }

    bump('miss');
    return null;

    function bump(k) {
      if (!S.stats) S.stats = {};
      S.stats[k] = (S.stats[k] || 0) + 1;
    }
  };

  // 批量挂载：给每门课附 c._tbRef（含 AI 用 snippet），返回统计
  // 每次调用重置 stats——匹配统计只反映本次运行，避免多轮挂载累加误读
  NX.tbAttach = function (list) {
    if (!S.ready || !Array.isArray(list)) return { matched: 0, total: list ? list.length : 0 };
    let matched = 0;
    S.stats = {};
    for (const c of list) {
      try {
        const e = NX.tbMatch(c);
        if (e) {
          c._tbRef = e;
          matched++;
          if (!c._tbSnip) {
            // AI 参考节选在正文拉取时才补全；这里先置空占位
            c._tbSnip = '';
          }
        } else if (c._tbRef) { delete c._tbRef; delete c._tbSnip; }
      } catch (err) { /* 单课失败不影响其余 */ }
    }
    S.stats = S.stats || {};
    S.stats.total = list.length;
    S.stats.matched = matched;
    return { matched, total: list.length };
  };

  // ─── 点评正文（实时拉取 + 短缓存） ────────────────────────
  NX.tbFetchReviews = async function (sqid) {
    const key = String(sqid);
    const hit = S.detailCache.get(key);
    if (hit && Date.now() - hit.ts < DETAIL_TTL) return hit.data;
    const res = await fetch(TB_DATA + 'courses/' + key + '.json', { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = await res.json();
    let results = Array.from(doc.results || []);
    let next = doc.next, hops = 0;
    while (next && hops < 5) {
      const p = await fetch(next, { credentials: 'omit' });
      if (!p.ok) break;
      const pd = await p.json();
      results = results.concat(Array.from(pd.results || []));
      next = pd.next; hops++;
    }
    results.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const data = { count: doc.count != null ? doc.count : results.length, results };
    S.detailCache.set(key, { ts: Date.now(), data });
    return data;
  };

  // ─── 深链 ─────────────────────────────────────────────────
  NX.tbCourseUrl = function (e) {
    if (!e) return TB_PAGE + 'search.html';
    return TB_PAGE + 'course.html?sqid=' + encodeURIComponent(e.sqid) +
      '&tid=' + encodeURIComponent(e.tid == null ? '' : e.tid) +
      '&name=' + encodeURIComponent(e.kcm) +
      '&teacher=' + encodeURIComponent(e.jsm || '') +
      '&dept=' + encodeURIComponent(e.kkdw || '');
  };
  NX.tbWriteUrl = function (e) {
    if (!e) return TB_PAGE + 'new-review';
    // thubook 金标准格式（2026-08 实测）：thucourse/new-review?courseId=..&courseName=纯课名(URL编码)
    return TB_PAGE + 'new-review?courseId=' + encodeURIComponent(e.sqid) +
      '&courseName=' + encodeURIComponent(e.kcm || '');
  };

  // 星星渲染：★★★★☆
  NX.tbStars = function (avg) {
    const full = Math.round(Number(avg) || 0);
    let s = '';
    for (let i = 1; i <= 5; i++) s += i <= full ? '★' : '☆';
    return s;
  };

  // ═══════════════════════════════════════════════════════════
  // 点评弹窗（复用全局玻璃 Modal：#nextthuxk-modal）
  // ═══════════════════════════════════════════════════════════
  NX.showReviewsModal = async function (code, seq) {
    const { esc, state } = NX;
    const $ = state.$;
    const mask = $('nextthuxk-modal');
    const titleEl = $('nextthuxk-modal-title');
    const body = $('nextthuxk-modal-body');
    if (!mask || !body) return;
    const c = NX.getCourse ? NX.getCourse(code, seq) : (state.allCourses || []).find(x => x.code === code && String(x.seq || '0') === String(seq || '0'));
    if (!c) return;
    titleEl.textContent = c.name + ' · 社区点评';
    body.innerHTML = '<div class="nx-modal-loading"><span class="nx-spin"></span> 正在加载点评…</div>';
    mask.classList.add('show');

    try { await NX.tbEnsureIndex(); } catch (e) {}
    let e = c._tbRef || null;
    try { if (!e && S.ready) e = NX.tbMatch(c); } catch (err) {}

    const headBits = [];
    if (e && e.count) {
      headBits.push('<div class="nx-tb-head">' +
        '<span class="nx-tb-avg">' + Number(e.avg).toFixed(1) + '</span>' +
        '<span class="nx-tb-starsline"><span class="nx-tb-stars">' + NX.tbStars(e.avg) + '</span>' +
        '<span class="nx-tb-cnt">' + e.count + ' 条点评' + (e.kkdw ? ' · ' + esc(e.kkdw) : '') + '</span></span></div>');
    } else {
      headBits.push('<div class="nx-tb-head nx-tb-empty">这门课在 THU选课社区还没有点评</div>');
    }
    headBits.push('<div class="nx-tb-actions-row">' +
      '<a class="nx-tb-link" href="' + esc(NX.tbCourseUrl(e)) + '" target="_blank" rel="noopener noreferrer">查看课程页 ↗</a>' +
      '<a class="nx-tb-link nx-tb-link-primary" href="' + esc(NX.tbWriteUrl(e)) + '" target="_blank" rel="noopener noreferrer">✎ 去写点评</a></div>');
    // CC BY-NC 授权署名（数据与点评内容均来自 THU选课社区贡献者）
    headBits.push('<div class="nx-tb-license">点评数据来自 <a href="' + esc(NX.tbCourseUrl(e)) + '" target="_blank" rel="noopener noreferrer">THU选课社区</a> 贡献者，以 ' +
      '<a href="https://creativecommons.org/licenses/by-nc/4.0/deed.zh" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0</a> 提供 · 仅限非商业用途</div>');

    if (!e) {
      // 没匹配到条目（可能课太新）：给社区搜索兜底链接即可
      body.innerHTML = headBits.join('');
      return;
    }

    body.innerHTML = headBits.join('') + '<div id="nxTbListWrap" class="nx-tb-listwrap"><div class="nx-modal-loading"><span class="nx-spin"></span> 拉取正文…</div></div>';
    const wrap = body.querySelector('#nxTbListWrap');
    let data;
    try { data = await NX.tbFetchReviews(e.sqid); }
    catch (err) {
      wrap.innerHTML = '<div class="nx-modal-loading">点评加载失败（网络原因），稍后重试</div>';
      return;
    }
    if (!data.results.length) {
      wrap.innerHTML = '<div class="nx-modal-loading">暂无点评正文</div>';
      return;
    }
    wrap.innerHTML = data.results.map(r => {
      const cm = String(r.comment || '').trim();
      return '<div class="nx-tb-item">' +
        '<div class="nx-tb-item-head">' +
        '<span class="nx-tb-stars">' + NX.tbStars(r.rating) + '</span>' +
        '<span class="nx-tb-score">' + Number(r.rating || 0) + '</span>' +
        (r.score ? '<span class="nx-tb-grade">给分 ' + esc(String(r.score).slice(0, 8)) + '</span>' : '') +
        '<span class="nx-tb-date">' + esc(r.created_at || '') + '</span></div>' +
        '<div class="nx-tb-text">' + esc(cm) + '</div></div>';
    }).join('');
  };

  // ═══════════════════════════════════════════════════════════
  // 联想词：搜索框下拉（本地课程索引 + 社区评分加持）
  // ═══════════════════════════════════════════════════════════
  const SG_MAX = 8;
  let sgEl = null, sgItems = [], sgIdx = -1, sgBlurTimer = null;

  function ensureSuggestEl() {
    if (sgEl && sgEl.isConnected) return sgEl;
    const wrap = NX.state.shadow && NX.state.shadow.querySelector('.nx-search-wrap');
    if (!wrap) return null;
    sgEl = NX.state.shadow.querySelector('#nextthuxk-suggest');
    if (!sgEl) {
      sgEl = document.createElement('div');
      sgEl.className = 'nx-suggest';
      sgEl.id = 'nextthuxk-suggest';
      wrap.appendChild(sgEl);
      sgEl.addEventListener('pointerdown', ev => ev.preventDefault()); // 防止点击行时 input 失焦
      sgEl.addEventListener('click', ev => {
        const it = ev.target.closest('.nx-sg-item');
        if (it) pickSuggest(parseInt(it.dataset.i, 10));
      });
    }
    return sgEl;
  }

  function scoreCourse(c, q) {
    const name = lcOf(c.name), code = String(c.code || ''), teacher = lcOf(c.teacher);
    let s = -1;
    if (name.startsWith(q)) s = 100;
    else if (name.includes(q)) s = 80;
    else if (q.length >= 3 && code.startsWith(q)) s = 70;
    else if (teacher.startsWith(q)) s = 60;
    else if (teacher.includes(q)) s = 50;
    else if (code.includes(q) && q.length >= 3) s = 40;
    if (s < 0) return s;
    const tb = c._tbRef;
    if (tb && tb.count) s += Math.min(tb.avg * 2 * Math.min(tb.count, 20) / 20, 5);  // 评分/热度微加权
    if (c.available) s += 2;
    return s;
  }
  function lcOf(s) { return String(s || '').toLowerCase(); }

  function hl(name, q) {
    const idx = lcOf(name).indexOf(q);
    if (idx < 0) return NX.esc(name);
    return NX.esc(name.slice(0, idx)) + '<b>' + NX.esc(name.slice(idx, idx + q.length)) + '</b>' + NX.esc(name.slice(idx + q.length));
  }

  NX.suggestUpdate = function () {
    const $ = NX.state.$;
    const inp = $('nextthuxk-search');
    if (!inp) return;
    const el = ensureSuggestEl();
    if (!el) return;
    const q = inp.value.trim().toLowerCase();
    if (!q) { hideSuggest(); return; }
    const list = NX.state.allCourses || [];
    if (!list.length) { hideSuggest(); return; }
    const scored = [];
    for (const c of list) {
      const s = scoreCourse(c, q);
      if (s > 0) scored.push([s, c]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    sgItems = scored.slice(0, SG_MAX).map(x => x[1]);
    sgIdx = -1;
    if (!sgItems.length) { hideSuggest(); return; }
    el.innerHTML = sgItems.map((c, i) => {
      const tb = c._tbRef;
      let right = '<span class="nx-sg-norev">无点评</span>';
      if (tb && tb.count) {
        const a = Number(tb.avg) || 0;
        const lv = a >= 4.5 ? 'lv-hi' : a >= 4 ? 'lv-good' : a >= 3 ? 'lv-mid' : 'lv-bad';
        right = '<span class="nx-sg-star ' + lv + '">★' + a.toFixed(1) + '</span><span class="nx-sg-cnt">' + tb.count + '评</span>';
      }
      return '<div class="nx-sg-item" data-i="' + i + '">' +
        '<span class="nx-sg-name">' + hl(c.name, q) + '</span>' +
        '<span class="nx-sg-meta">' + NX.esc(c.teacher || '') + (c.teacher && c.department ? ' · ' : '') + NX.esc(c.department || '') + '</span>' +
        right + '</div>';
    }).join('') ;
    el.classList.add('show');
  };

  function hideSuggest() {
    if (sgEl) sgEl.classList.remove('show');
    sgItems = []; sgIdx = -1;
  }
  NX.suggestHide = hideSuggest;

  function pickSuggest(i) {
    const c = sgItems[i];
    if (!c) return;
    const $ = NX.state.$;
    const inp = $('nextthuxk-search');
    if (inp) inp.value = c.name;
    hideSuggest();
    if (inp) inp.focus();
    if (typeof NX.filterCourses === 'function') NX.filterCourses();
  }

  // 键盘导航；返回 true 表示事件已消费（调用方可 stopPropagation）
  NX.suggestKey = function (ev) {
    if (!sgEl || !sgEl.classList.contains('show') || !sgItems.length) return false;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      sgIdx = ev.key === 'ArrowDown'
        ? (sgIdx + 1) % sgItems.length
        : (sgIdx - 1 + sgItems.length) % sgItems.length;
      Array.from(sgEl.children).forEach((n, i) => n.classList.toggle('on', i === sgIdx));
      return true;
    }
    if (ev.key === 'Enter') {
      pickSuggest(sgIdx >= 0 ? sgIdx : 0);
      return true;
    }
    if (ev.key === 'Escape') { hideSuggest(); return true; }
    return false;
  };
})();
