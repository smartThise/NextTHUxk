// ═══════════════════════════════════════════════════════════════
// NextTHUxk — State: 课表解析、冲突检测、暂存/草稿管理、选课状态
// ═══════════════════════════════════════════════════════════════
var NX = NX || {};

// ─── Timetable Parsing ────────────────────────────────────────

NX.parseTimeSlots = function (timeStr) {
  if (!timeStr) return [];
  // 缓存：全校时间串种类有限（几百个），避免每次筛选/渲染重复正则解析
  if (!NX._slotsCache) NX._slotsCache = new Map();
  const hit = NX._slotsCache.get(timeStr);
  if (hit) return hit;
  const slots = [];
  const dayLabels = ['周一','周二','周三','周四','周五','周六','周日'];
  const slotLabels = ['1-2节','3-4节','5-6节','7-8节','9-10节','11-12节'];
  const re = /(\d+)\s*[-–—]\s*(\d+)\s*\([^)]*\)/g;
  let m;
  while ((m = re.exec(timeStr)) !== null) {
    const dayNum = parseInt(m[1]);
    const dajie = parseInt(m[2]);
    if (dayNum >= 1 && dayNum <= 7 && dajie >= 1 && dajie <= 6) {
      slots.push({ day: dayLabels[dayNum - 1], slot: slotLabels[dajie - 1] });
    }
  }
  NX._slotsCache.set(timeStr, slots);
  return slots;
};

// ── 外校课（北大/北外）时间与来源（OneTHU Courses.tsx 移植，xk-1.5.1）──
/** 外校钟点解析 v2（北大/北外官方时间描述全格式实证）：
 *  支持周X/星期X、复合日「周二、四」「星期二/星期日」、多段「、;；」分隔、
 *  破折号—–-通吃、全角括号、课级/段级「单周」「双周」、周段「(1-16周)」。
 *  返回钟点块 [{day,begin,end,tag}]（begin/end 为分钟）。 */
NX.clockRangesOf = function (note, time) {
  const raw = (note || '') + ' ' + (time || '');
  if (!raw.trim()) return [];
  // 归一化：星期→周、全角括号→半角、破折号→-、分号→;
  const s = raw.replace(/星期/g, '周').replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[—–]/g, '-').replace(/；/g, ';').replace(/[{}]/g, '(').replace(/」/g, ')');
  const dayChar = '一二三四五六日天';
  const dayIdx = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
  const parityOf = t => (/单周/.test(t) ? '单周' : /双周/.test(t) ? '双周' : '');
  const out = [];
  let globalParity = '';
  for (const seg of s.split(';')) {
    const re = /((?:周?[一二三四五六日天][、\/,]?)+)\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
    let m;
    let segHit = false;
    while ((m = re.exec(seg)) !== null) {
      const days = [...m[1]].filter(ch => dayChar.includes(ch)).map(ch => dayIdx[ch]);
      const begin = Number(m[2]) * 60 + Number(m[3]);
      const end = Number(m[4]) * 60 + Number(m[5]);
      // 周段：时间后紧邻的 (N-M周)
      const after = seg.slice(m.index + m[0].length, m.index + m[0].length + 12);
      const wk = /\((\d+-\d+周?)\)/.exec(after)?.[1] ?? '';
      const parity = parityOf(seg.slice(m.index));
      for (const day of days) {
        if (day >= 1 && end > begin) {
          const bits = [parity, wk].filter(Boolean);
          out.push({ day, begin, end, tag: bits.join('·') });
          segHit = true;
        }
      }
    }
    if (!segHit) {
      const p = parityOf(seg);
      if (p) globalParity = p; // 「;单周」独立尾段 → 管全部段
    }
  }
  if (globalParity) for (const r of out) {
    if (!r.tag.includes('周') || /\d+-\d+/.test(r.tag)) {
      r.tag = [globalParity, ...r.tag.split('·').filter(t => !/^(单周|双周)$/.test(t))].filter(Boolean).join('·');
    }
  }
  return out;
};

/** 外校课程标注：课号前缀 PK=北大本科、GPK=北大研究生（2026 秋 38 门）、
 *  BW=北外（形如 BW3w0007，含小写 w——HAR 实证，19 列与本校对齐） */
NX.originOf = function (code) {
  code = String(code || '');
  return code.startsWith('GPK') ? '北大研' : code.startsWith('PK') ? '北大' : code.startsWith('BW') ? '北外' : '';
};
NX.ORIGIN_COLORS = { '北大': '#c0392b', '北大研': '#c0392b', '北外': '#1f4e79' };

// 冲突检测（区间重叠制，OneTHU 同款语义）：课程大节 → 钟点区间，自定义
// 占用直接用钟点区间；跨边界部分重叠也能测出（旧版按「同日同大节」精确
// 匹配，8:00-9:35 与 9:00-10:30 这类跨界重叠全漏）。
NX.detectConflicts = function (courses) {
  const { parseTimeSlots, SLOT_RANGE, pvToMin } = NX;
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const slotNames = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节'];
  const spans = [];   // {dayN, begin, end, name, when}
  const conflicts = [];
  const addSpan = (dayN, begin, end, name, when) => {
    for (const s of spans) {
      if (s.dayN === dayN && begin < s.end && s.begin < end) {
        conflicts.push({ day: dayNames[dayN - 1], slot: when, a: s.name, b: name });
      }
    }
    spans.push({ dayN, begin, end, name, when });
  };
  courses.concat(NX.state.manualEvents || []).forEach(c => {
    if (c.manual && c.begin && c.end && c.day && pvToMin(c.begin) < pvToMin(c.end)) {
      addSpan(Number(c.day), pvToMin(c.begin), pvToMin(c.end), c.name, c.begin + '-' + c.end);
      return;
    }
    parseTimeSlots(c.time).forEach(({ day, slot }) => {
      const d = dayNames.indexOf(day) + 1;
      const s = slotNames.indexOf(slot) + 1;
      const r = SLOT_RANGE[s - 1];
      if (d && r) addSpan(d, r[0], r[1], c.name, slot);
    });
  });
  return conflicts;
};

// 候选队列右栏区块（OneTHU「排队第X/共Y·候选中」语义）：每行课名(教师)·
// 时间·排队位次·退队（dropCourse 走 m=dlDelete）；kbSearch 兜底候选无位次
// 数据（课表只有格子），显示「候选中」。
NX.renderQueueSection = function () {
  const { state, esc, dropCourse, showXkResult, renderPreviewTT } = NX;
  const sec = state.$('nextthuxk-queue-sec');
  const list = state.$('nextthuxk-queue-list');
  const countEl = state.$('nextthuxk-queue-count');
  if (!sec || !list) return;
  const cands = state.candidateCourses || [];
  sec.style.display = cands.length ? '' : 'none';
  if (!cands.length) { list.innerHTML = ''; return; }
  if (countEl) countEl.textContent = cands.length + ' 门';
  // 暂存区同款玻璃卡样式（nx-stage-item）——右栏视觉一致
  list.innerHTML = cands.map(c => {
    const pos = c.myPos
      ? '排队第' + c.myPos + ' / 共' + (c.queueTotal || '?') + '人'
      : '候选中';
    const meta = [c.time, c.teacher, c.typeLabel].filter(Boolean).map(x => esc(x)).join(' · ');
    return '<div class="nx-stage-item" style="flex-direction:column;align-items:stretch;gap:2px">' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<span class="nx-stage-name nx-jumpable" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-teacher="' + esc(c.teacher || '') + '" title="点击按课号搜索此课程" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer">' + esc(c.name) +
          ' <span style="color:#9aa1ac;font-weight:400;font-size:11px">' + esc(c.code) + '</span></span>' +
        '<span style="font-size:11px;color:#ff9f1a;font-weight:600;white-space:nowrap">' + pos + '</span>' +
        '<button class="nx-queue-drop" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" title="退出候补队列" style="width:auto;height:22px;padding:0 10px;border:none;border-radius:var(--nx-radius-s,8px);background:rgba(238,77,77,.1);color:var(--nx-red,#ee4d4d);font-size:11px;font-family:inherit;cursor:pointer;white-space:nowrap;flex:none">退队</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--nx-ink-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (meta || '—') + '</div>' +
    '</div>';
  }).join('');
  list.querySelectorAll('.nx-jumpable').forEach(item => {
    item.onclick = ev => { ev.stopPropagation(); NX.jumpToCourse(item.dataset.code, item.dataset.seq, item.dataset.teacher); };
  });
  list.querySelectorAll('.nx-queue-drop').forEach(btn => {
    btn.onclick = async () => {
      btn.disabled = true;
      const r = await dropCourse(btn.dataset.code, btn.dataset.seq);
      if (!r || !r.ok) { btn.disabled = false; showXkResult(r || { ok: false, msg: '退队失败' }); return; }
      // 退队成功：从候选池移除并回刷（getPreviewCourses 候选数版本号自动失效）
      state.candidateCourses = state.candidateCourses.filter(c => !(c.code === btn.dataset.code && String(c.seq || '0') === String(btn.dataset.seq)));
      state.allCourses = state.allCourses.filter(c => !(c.isCandidate && c.code === btn.dataset.code && String(c.seq || '0') === String(btn.dataset.seq)));
      NX.rebuildCourseMap();
      NX.renderQueueSection();
      NX.filterCourses();
      renderPreviewTT(NX.getPreviewCourses(), (state.$('nextthuxk-preview-info') || {}).textContent || '当前已选');
    };
  });
};

// 当前预览课表（selected/stage/draft 三态），多处复用
// 已选课时间回填（OneTHU data.ts backfillSelTimes 同款）：时间列解析
// 失败且说明列也解不出钟点的已选课（外校课典型——时间在说明列），
// 逐门 p_kch 精查 kkxxSearch（1 课 1 请求，5 个一批 60ms 间隔），
// 结果经 mergeServerRows 回填 note/time 到池行，课表预览即恢复。
NX.backfillSelTimes = async function () {
  const { state } = NX;
  if (!state.isZhjwxk && !state.isWebvpn) return;
  const tried = state._selTried || (state._selTried = new Map());   // code_seq → 已试次数
  const sel = state.allCourses.filter(c => c.selected && !c.isCandidate);
  const unparsed = sel.filter(r =>
    (NX.parseTimeSlots(r.time || '') || []).length === 0 &&
    (NX.clockRangesOf(r.note || r.xkTextNote || '', r.time || '') || []).length === 0);
  const need = unparsed.filter(r => (tried.get(r.code + '_' + (r.seq || '0')) || 0) < 2);
  if (!need.length) {
    if (unparsed.length && !state._selBfLogged) {
      state._selBfLogged = true;
      console.log(NX.TAG, '已选时间回填: 无可查——' + unparsed.length + ' 门解析不出（' +
        unparsed.map(r => r.code + '_' + (r.seq || '0') + ' time=[' + (r.time || '') + '] note=[' + ((r.note || r.xkTextNote) || '') + ']').join(' ; ') +
        '），已试 ' + [...tried.entries()].filter(e => e[1] > 0).map(e => e[0]).join(','));
    }
    return;
  }
  need.forEach(r => { const k = r.code + '_' + (r.seq || '0'); tried.set(k, (tried.get(k) || 0) + 1); });
  const bfStatus = state._bfStatus || (state._bfStatus = {});
  need.forEach(r => { bfStatus[r.code] = '查询中'; });
  try { NX.invalidatePreview(); if (state.previewMode === 'selected') NX.renderPreviewTT(NX.getPreviewCourses(), (state.$('nextthuxk-preview-info') || {}).textContent || '当前已选'); } catch (e) {}
  console.log(NX.TAG, '已选时间回填: 查 ' + need.map(r => r.code + '_' + (r.seq || '0')).join(','));
  const outcome = [];
  for (let i = 0; i < need.length; i += 5) {
    await Promise.all(need.slice(i, i + 5).map(async r => {
      try {
        let res = await NX.serverSearch({ kch: r.code });
        let rows = res.rows || [];
        if (!rows.length && r.name) {
          // 外校课号 p_kch 不命中兜底：课名搜（GBK 走 gbkPercentEncode）
          const byName = await NX.serverSearch({ kcm: r.name });
          rows = byName.rows || [];
        }
        if (!rows.length) {
          // 双索引全缺兜底：浏览页扫描。外校课号 000/BW/GPK 前缀字典序排最前，
          // 前 10 页（200 行）必含；共享一次扫描（Promise 去重防并发双扫），
          // 会话缓存。p_kch 不含外校课号（用户实锤）且 p_kcm 全名也可能搜不到。
          if (!state._bfScanP) {
            state._bfScanP = (async () => {
              const scanned = [];
              for (let p = 1; p <= 10; p++) {
                try {
                  const res3 = await NX.serverSearch({ page: p });
                  const rs = res3.rows || [];
                  if (!rs.length) break;
                  scanned.push(...rs);
                } catch (e) { break; }
              }
              console.log(NX.TAG, '回填浏览扫描: ' + scanned.length + ' 行（外校课号排序靠前）');
              return scanned;
            })();
          }
          rows = (await state._bfScanP).filter(c => c.code === r.code);
        }
        let hit = rows.find(c => c.code === r.code && String(c.seq || '0') === String(r.seq || '0'));
        if (!hit) hit = rows.find(c => c.code === r.code);   // 课序号对不上（两套编号）也认课号唯一行
        if (hit) { NX.mergeServerRows([hit]); outcome.push(r.code + '✓'); bfStatus[r.code] = '✓已上轴'; }
        else { outcome.push(r.code + '×(搜到' + rows.length + '行无匹配)'); bfStatus[r.code] = '×搜到' + rows.length + '行无匹配'; }
      } catch (e) { outcome.push(r.code + '×(' + (e && e.message || e) + ')'); bfStatus[r.code] = '×' + ((e && e.message || e) + '').slice(0, 30); }
    }));
    if (i + 5 < need.length) await new Promise(res => setTimeout(res, 60));
  }
  console.log(NX.TAG, '已选时间回填结果:', outcome.join(' , ') || '无');
  // 无论成败结尾必重渲（用户三十报实锤：状态行只在重渲时显示，失败时不重渲
  // = 状态永远憋在内存里，「点重试啥也没看见」）
  NX.invalidatePreview();
  try {
    if (NX.state.previewMode === 'selected') NX.renderPreviewTT(NX.getPreviewCourses(), (NX.state.$('nextthuxk-preview-info') || {}).textContent || '当前已选');
  } catch (e) { console.warn(NX.TAG, '回填后预览重渲:', e); }
};

// ─── 课表时间持久缓存（knote：用户三十二报「暂存的时候把时间暂存起来不行吗」）───
// 凡见过能解析的时间/说明列就记下（chrome.storage.local，跨会话），预览 join 时
// 池里没有就用缓存兜底。外校课时间只在 kkxxSearch 说明列出现过一次也能永远用。
NX.knoteLoad = async function () {
  try {
    const v = await NX.store.get('knote');
    NX.state.knote = (v && typeof v === 'object') ? v : {};
  } catch (e) { NX.state.knote = {}; }
  return NX.state.knote;
};
let _knoteSaveT = null;
NX.knoteRemember = function (code, seq, note, time) {
  const parses = (NX.parseTimeSlots(time || '').length > 0)
    || (NX.clockRangesOf(note || '', time || '').length > 0);
  if (!code || !parses) return;
  const kn = NX.state.knote || (NX.state.knote = {});
  const k = code + '_' + (seq || '0');
  const ex = kn[k];
  if (ex && (ex.note || '') === (note || '') && (ex.time || '') === (time || '')) return;
  kn[k] = { note: note || '', time: time || '' };
  if (_knoteSaveT) clearTimeout(_knoteSaveT);
  _knoteSaveT = setTimeout(() => { _knoteSaveT = null; try { NX.store.set('knote', kn); } catch (e) {} }, 400);
};

// OneTHU buildRows join（xklogic.ts catByCode.get(s.code) 原样移植）：
// 已选/候补/暂存行时间解析不出 → 当场按课号借池行（同课号任意班次）的
// note/time 合成预览行。每次渲染现算，不依赖回填时序——池里有目录行
// （用户浏览/搜索带回来的）预览立即能用。
NX.previewJoinRows = function (rows) {
  const catByCode = new Map();   // 课号 → 有 note/可解析时间的池行（首个优先）
  const fallbackByCode = new Map();
  for (const c of NX.state.allCourses) {
    if (NX.parseTimeSlots(c.time || '').length > 0 || NX.clockRangesOf(c.note || c.xkTextNote || '', c.time || '').length > 0) {
      if (!catByCode.has(c.code)) catByCode.set(c.code, c);
    } else if ((c.note || c.xkTextNote) && !fallbackByCode.has(c.code)) {
      fallbackByCode.set(c.code, c);
    }
  }
  return rows.map(s => {
    if (NX.parseTimeSlots(s.time || '').length > 0 || NX.clockRangesOf(s.note || s.xkTextNote || '', s.time || '').length > 0) return s;
    const c0 = catByCode.get(s.code) || fallbackByCode.get(s.code);
    const kn = NX.state.knote || {};
    const knoteHit = c0 || kn[s.code + '_' + (s.seq || '0')]
      || Object.keys(kn).map(k => kn[k] && k.indexOf(s.code + '_') === 0 ? kn[k] : null).filter(Boolean)[0];
    if (!knoteHit) return s;
    return Object.assign({}, s, {
      time: NX.parseTimeSlots(s.time || '').length ? s.time : (knoteHit.time || s.time || ''),
      note: knoteHit.note || s.note || '',
      xkTextNote: knoteHit.xkTextNote || knoteHit.note || s.xkTextNote || '',
    });
  });
};

NX.getPreviewCourses = function () {
  const { allCourses, stageCart, savedDrafts, previewMode, previewDraftIdx } = NX.state;
  if (previewMode === 'selected') {
    // OneTHU Courses.tsx 语义：已选视图含候补课（琥珀块 lane 分道共处）——
    // 候选只属于已选视图；版本号带上候选数（队列同步回刷不再吃掉候选块）。
    // 行经 previewJoinRows 与目录行 join（外校课时间在目录行说明列）
    const v = (NX.state.selVersion || 0) + '|' + (NX.state.candidateCourses || []).length + '|' + (NX.state.poolVersion || 0);
    if (NX._selCacheV !== v) { NX._selCache = NX.previewJoinRows(allCourses.filter(c => c.selected).concat(NX.state.candidateCourses || [])); NX._selCacheV = v; }
    return NX._selCache;
  }
  if (previewMode === 'stage') return NX.previewJoinRows(stageCart);
  if (previewMode === 'draft' && previewDraftIdx >= 0 && savedDrafts[previewDraftIdx]) return savedDrafts[previewDraftIdx].courses;
  return [];
};

// 预览课表槽位索引（引用+长度双重失效）：slotKey → [占用课程列表]
NX._pvRef = null; NX._pvLen = -1; NX._pvIdx = null;
NX.invalidatePreview = function () { NX._pvRef = null; NX._pvLen = -1; NX._pvIdx = null; };
NX.previewSlotIndex = function () {
  const previewCourses = NX.getPreviewCourses();
  const manualEvents = NX.state.manualEvents || [];
  const version = previewCourses.length + '|' + manualEvents.map(e => e.id + ':' + e.time).join(',');
  if (NX._pvRef !== previewCourses || NX._pvLen !== version) {
    const idx = new Map();
    previewCourses.concat(manualEvents).forEach(pc => {
      NX.parseTimeSlots(pc.time || '').forEach(({ day, slot }) => {
        const k = day + '|' + slot;
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push({ name: pc.name || pc.code, code: pc.code, seq: String(pc.seq || '0') });
      });
    });
    NX._pvRef = previewCourses;
    NX._pvLen = version;
    NX._pvIdx = idx;
  }
  return NX._pvIdx;
};

NX.showManualEventModal = function () {
  const { state } = NX;
  const $ = state.$;
  const mask = $('nextthuxk-modal');
  const title = $('nextthuxk-modal-title');
  const body = $('nextthuxk-modal-body');
  if (!mask || !title || !body) return;
  title.textContent = '添加自定义时间占用';
  body.innerHTML = '<div class="nx-manual-form">' +
    '<label>活动名称<input id="nx-manual-name" class="nx-inp" placeholder="例如：社团例会"></label>' +
    '<label>星期<select id="nx-manual-day" class="nx-inp"><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="7">周日</option></select></label>' +
    '<div style="display:flex;gap:8px"><label style="flex:1">开始时间<input id="nx-manual-begin" type="time" class="nx-inp" value="18:00"></label>' +
    '<label style="flex:1">结束时间<input id="nx-manual-end" type="time" class="nx-inp" value="19:30"></label></div>' +
    '<div class="nx-manual-hint">自由时间轴：任意起止钟点（不限于大节），保存在本地并参与冲突检测。</div>' +
    '<button id="nx-manual-save" class="nx-ai-btn">添加到课表</button></div>';
  mask.classList.add('show');
  const nameInput = $('nx-manual-name');
  nameInput.focus();
  $('nx-manual-save').onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { NX.showXkResult({ ok: false, msg: '请输入活动名称' }); return; }
    const day = parseInt($('nx-manual-day').value, 10);
    const begin = ($('nx-manual-begin').value || '').trim();
    const end = ($('nx-manual-end').value || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(begin) || !/^\d{1,2}:\d{2}$/.test(end) || NX.pvToMin(begin) >= NX.pvToMin(end)) {
      NX.showXkResult({ ok: false, msg: '起止时间无效：需 HH:MM 且开始早于结束' });
      return;
    }
    const now = Date.now();
    state.manualEvents.push({ id: now, name, code: 'manual-' + now, seq: '0', day, begin, end, time: '', manual: true, credits: 0 });
    await NX.store.set('manualEvents', state.manualEvents);
    NX.invalidatePreview();
    NX.renderPreviewTT(NX.getPreviewCourses(), $('nextthuxk-preview-info')?.textContent || '当前已选');
    NX.filterCourses();
    mask.classList.remove('show');
    NX.showXkResult({ ok: true, msg: '已添加「' + name + '」（周' + '一二三四五六日'[day - 1] + ' ' + begin + '-' + end + '）' });
  };
};

NX.removeManualEvent = async function (id) {
  const { state } = NX;
  const idx = state.manualEvents.findIndex(e => String(e.id) === String(id));
  if (idx < 0) return;
  const name = state.manualEvents[idx].name;
  state.manualEvents.splice(idx, 1);
  await NX.store.set('manualEvents', state.manualEvents);
  NX.invalidatePreview();
  NX.renderPreviewTT(NX.getPreviewCourses(), state.$('nextthuxk-preview-info')?.textContent || '当前已选');
  NX.filterCourses();
  NX.showXkResult({ ok: true, msg: '已删除「' + name + '」' });
};

NX.findPreviewConflicts = function (course) {
  const idx = NX.previewSlotIndex();
  if (!idx.size) return [];
  const selfSeq = String(course.seq || '0');
  const conflicts = [];
  const seen = new Set();
  for (const { day, slot } of NX.parseTimeSlots(course.time || '')) {
    const hits = idx.get(day + '|' + slot);
    if (!hits) continue;
    for (const h of hits) {
      if (h.code === course.code && h.seq === selfSeq) continue;
      const k = h.name + '|' + day + '|' + slot;
      if (seen.has(k)) continue;
      seen.add(k);
      conflicts.push({ name: h.name, day, slot });
    }
  }
  return conflicts;
};

// ─── Toast ────────────────────────────────────────────────────

NX.showXkResult = function (res) {
  const $ = NX.state.$;
  let toast = $('nextthuxk-toast');
  if (!toast) return;
  toast.className = res.ok ? 'nx-toast nx-toast-ok' : 'nx-toast nx-toast-err';
  toast.textContent = (res.ok ? '✓ ' : '✗ ') + (res.msg || (res.ok ? '操作成功' : '操作失败'));
  toast.style.display = 'block';
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.style.display = 'none', 300); }, 2500);
};

// ─── Volunteer Confirmation Modal ─────────────────────────────

NX.showZyModal = function (missingZy) {
  const { esc, state, courseFlag } = NX;
  const $ = state.$;
  return new Promise(resolve => {
    const mask = $('nextthuxk-zy-modal');
    const body = $('nextthuxk-zy-modal-body');
    if (!mask || !body) { resolve(missingZy.map(() => 3)); return; }
    body.innerHTML = '<div class="nx-zy-hint">以下课程未能自动获取志愿信息，请手动确认：</div>' + missingZy.map((c, i) => {
      const flag = courseFlag(c) === 'ty' ? '体育' : c.typeLabel || '?';
      const curZy = c.zy || 3;
      return '<div class="nx-zy-row">' +
        '<span class="nx-zy-name">' + esc(c.name) + '</span>' +
        '<span class="nx-zy-type">' + esc(flag) + '</span>' +
        '<select class="nx-zy-select nx-zy-modal-sel" data-idx="' + i + '">' +
        '<option value="1"' + (curZy === 1 ? ' selected' : '') + '>第1志愿</option>' +
        '<option value="2"' + (curZy === 2 ? ' selected' : '') + '>第2志愿</option>' +
        '<option value="3"' + (curZy === 3 ? ' selected' : '') + '>第3志愿</option>' +
        '</select></div>';
    }).join('');
    mask.classList.add('show');
    const finish = () => {
      mask.classList.remove('show');
      const values = [];
      body.querySelectorAll('.nx-zy-modal-sel').forEach(sel => values.push(parseInt(sel.value) || 3));
      resolve(values);
    };
    $('nextthuxk-zy-modal-ok').onclick = finish;
    $('nextthuxk-zy-modal-close').onclick = finish;
  });
};

// ─── Resolve Course ZY (志愿信息) ─────────────────────────────

NX.resolveCourseZy = async function (courses, selMap, zyCache) {
  const { state, store, fetchLevelTable, showZyModal } = NX;
  const { isQueuePhase } = state;
  let cacheUpdated = false;
  const missingZy = [];
  let levelMap = null;
  let selectedChanged = false;
  for (const c of courses) {
    const key = c.code + '_' + (c.seq || '0');
    const s = selMap[key];
    if (c.selected !== !!s) selectedChanged = true;
    c.selected = !!s;
    if (s) {
      if (s.zy > 0) {
        c.zy = s.zy; c.typeCode = s.typeCode; c.typeLabel = s.typeLabel;
        zyCache[key] = { zy: s.zy, typeCode: s.typeCode, typeLabel: s.typeLabel, confirmed: true };
        cacheUpdated = true;
      } else {
        const cached = zyCache[key];
        if (cached && cached.zy > 0 && cached.confirmed) {
          c.zy = cached.zy; c.typeCode = cached.typeCode; c.typeLabel = cached.typeLabel;
        } else {
          if (!levelMap) levelMap = await fetchLevelTable();
          const lt = levelMap[key];
          if (lt) { c.typeCode = lt.typeCode; c.typeLabel = lt.typeLabel; }
          else { c.typeCode = s.typeCode; c.typeLabel = s.typeLabel; }
          c.zy = (cached && cached.zy > 0) ? cached.zy : 0;
          missingZy.push(c);
        }
      }
    } else {
      c.zy = 0; c.typeCode = ''; c.typeLabel = '';
    }
  }
  if (missingZy.length) {
    if (isQueuePhase) {
      missingZy.forEach(c => {
        c.zy = 3;
        zyCache[c.code + '_' + (c.seq || '0')] = { zy: 3, typeCode: c.typeCode, typeLabel: c.typeLabel, confirmed: false };
      });
      cacheUpdated = true;
      if (selectedChanged) NX.state.selVersion = (NX.state.selVersion || 0) + 1;
      return cacheUpdated;
    }
    const values = await showZyModal(missingZy);
    missingZy.forEach((c, i) => {
      if (values[i] > 0) {
        c.zy = values[i];
        zyCache[c.code + '_' + (c.seq || '0')] = { zy: c.zy, typeCode: c.typeCode, typeLabel: c.typeLabel, confirmed: false };
        cacheUpdated = true;
      }
    });
  }
  if (selectedChanged) NX.state.selVersion = (NX.state.selVersion || 0) + 1;
  return cacheUpdated;
};

NX.refreshSelected = async function () {
  const { state, store, fetchSelectedCourses, fetchCandidateCourses, resolveCourseZy, filterCourses, renderPreviewTT } = NX;
  const { allCourses } = state;
  // 重新获取已选课程
  const selected = await fetchSelectedCourses();
  const selMap = {};
  selected.forEach(s => { selMap[s.code + '_' + s.seq] = s; });
  // 类型源失效重拉（学期内教务可能调整类型标记；1 请求）
  if (NX.fetchLevelTable) state.levelMap = await NX.fetchLevelTable().catch(() => state.levelMap || {});
  NX.applyLevelMap(allCourses);
  const zyCache = (await store.get('zyCache')) || {};
  const cacheUpdated = await resolveCourseZy(allCourses, selMap, zyCache);
  if (cacheUpdated) await store.set('zyCache', zyCache);
  // 重新获取候补队列（排队选课后状态会变化）
  try {
    state.candidateCourses = await fetchCandidateCourses();
  } catch (e) { /* 保持现有候补数据不变 */ }
  // 同步 isCandidate 标记
  const candKeys = new Set(state.candidateCourses.map(c => c.code + '_' + c.seq));
  allCourses.forEach(c => {
    c.isCandidate = candKeys.has(c.code + '_' + (c.seq || '0'));
  });
  // 课余量/排队同步（池内按需，提交选课后余量必变）；非队列阶段走志愿统计
  try {
    const qResult = await NX.fetchQueueData(allCourses);
    state.queueDataMap = qResult.map;
    state.isQueuePhase = qResult.phase;   // 同 content.js：纯 xkqkSearch 探针
    if (state.isQueuePhase) {
      allCourses.forEach(c => {
        const q = state.queueDataMap[c.code + '_' + NX.normSeq(c.seq)];
        if (q) { c.available = q.qRemaining > 0; if (q.qRemaining > 0) c.remaining = q.qRemaining; c.capacity = q.qCapacity; }
      });
    } else {
      const vol = await NX.fetchVolunteer(allCourses, { force: true });   // 提交后志愿统计必变，重拉
      NX.state.volMap = Object.assign({}, NX.state.volMap, vol);
      NX.applyVolunteer(allCourses, vol);
    }
  } catch (e) { /* 保持现有余量数据 */ }
  filterCourses();
  renderPreviewTT(
    allCourses.filter(c => c.selected).concat(state.candidateCourses.filter(cc => !allCourses.some(ac => ac.selected && ac.code === cc.code))),
    '当前已选'
  );
};

// ─── Stage Cart & Drafts ──────────────────────────────────────

NX.addToStage = function (code, seq, flag, zy) {
  const { state, store, showXkResult, baseFlag, renderStageCart, filterCourses } = NX;
  const { allCourses, stageCart } = state;
  const c = allCourses.find(x => x.code === code && String(x.seq || '0') === String(seq || '0'));
  if (!c) return;
  NX.knoteRemember(c.code, c.seq, c.note || c.xkTextNote || '', c.time || '');   // 暂存的时候把时间暂存起来
  if (stageCart.some(s => s.code === code && String(s.seq) === String(seq || '0'))) {
    showXkResult({ ok: false, msg: '该课程已在暂存区' }); return;
  }
  stageCart.push({
    code: c.code, seq: c.seq || '0', name: c.name, teacher: c.teacher || '',
    time: c.time || '', credits: c.credits || 0, flag, zy: parseInt(zy) || 3,
    baseFlag: baseFlag(c),
    note: (c.note || c.xkTextNote || ''),   // 外校真实时间载体（课表预览 clockRangesOf 用）
  });
  renderStageCart();
  store.set('stageCart', stageCart);
  showXkResult({ ok: true, msg: '已暂存「' + c.name + '」' });
};

NX.removeFromStage = function (idx) {
  const { state, store, renderStageCart, filterCourses, invalidatePreview } = NX;
  state.stageCart.splice(idx, 1);
  NX.invalidatePreview();
  renderStageCart();
  store.set('stageCart', state.stageCart);
  filterCourses();
};

NX.askReplaceDraft = function (name, courses) {
  const { state, store, showXkResult, renderDrafts } = NX;
  const { savedDrafts } = state;
  if (savedDrafts.length < 5) {
    savedDrafts.push({ id: Date.now(), name, courses: [...courses], createdAt: Date.now() });
    renderDrafts(); store.set('drafts', savedDrafts);
    return true;
  }
  const list = savedDrafts.map((d, i) => (i + 1) + '. ' + d.name + ' (' + d.courses.length + '门·' + d.courses.reduce((s, c) => s + (c.credits || 0), 0) + '学分)').join('\n');
  const choice = prompt('草稿已满(5/5)，输入要替换的编号(1-5)，取消则不保存：\n' + list);
  if (!choice) return false;
  const idx = parseInt(choice) - 1;
  if (isNaN(idx) || idx < 0 || idx >= 5) { showXkResult({ ok: false, msg: '已取消' }); return false; }
  savedDrafts[idx] = { id: Date.now(), name, courses: [...courses], createdAt: Date.now() };
  renderDrafts(); store.set('drafts', savedDrafts);
  return true;
};

NX.saveDraft = function () {
  const { state, store, showXkResult, askReplaceDraft, renderStageCart, filterCourses } = NX;
  const $ = state.$;
  const nameInput = $('nextthuxk-draft-name');
  const name = (nameInput?.value || '').trim() || '草稿' + (state.savedDrafts.length + 1);
  if (!state.stageCart.length) { showXkResult({ ok: false, msg: '暂存区没有课程' }); return; }
  if (askReplaceDraft(name, state.stageCart)) {
    state.stageCart = [];
    if (nameInput) nameInput.value = '';
    renderStageCart(); store.set('stageCart', state.stageCart);
    filterCourses();
    showXkResult({ ok: true, msg: '草稿「' + name + '」已保存' });
  }
};

NX.saveSelectedAsDraft = function () {
  const { state, showXkResult, askReplaceDraft } = NX;
  const { allCourses, stageCart } = state;
  const selected = allCourses.filter(c => c.selected);
  if (!selected.length) { showXkResult({ ok: false, msg: '没有已选课程' }); return; }
  const courses = selected.map(c => ({
    code: c.code, seq: c.seq || '0', name: c.name, teacher: c.teacher || '',
    time: c.time || '', credits: c.credits || 0,
    flag: c.typeCode === '006' ? 'bx' : c.typeCode === '008' ? 'xx' : c.typeCode === '007' ? 'rx' : 'bx',
    zy: c.zy || 3, baseFlag: NX.baseFlag(c),
  }));
  const d = new Date();
  const name = '已选课表 ' + (d.getMonth() + 1) + '/' + d.getDate();
  if (askReplaceDraft(name, courses)) {
    showXkResult({ ok: true, msg: '已选课程已保存为「' + name + '」' });
  }
};

NX.deleteDraft = function (idx) {
  const { state, store, renderDrafts } = NX;
  state.savedDrafts.splice(idx, 1);
  renderDrafts();
  store.set('drafts', state.savedDrafts);
};

NX.exportDraft = function (draft) {
  const { showXkResult } = NX;
  const data = {
    v: 1, name: draft.name,
    courses: draft.courses.map(c => ({
      code: c.code, seq: c.seq, name: c.name, teacher: c.teacher, time: c.time,
      credits: c.credits, flag: c.flag, zy: c.zy, baseFlag: c.baseFlag,
    })),
  };
  const json = JSON.stringify(data);
  navigator.clipboard.writeText(json).then(
    () => showXkResult({ ok: true, msg: '「' + draft.name + '」已复制到剪贴板，可分享给他人' }),
    () => {
      const ta = document.createElement('textarea');
      ta.value = json; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
      showXkResult({ ok: true, msg: '「' + draft.name + '」已复制到剪贴板' });
    }
  );
};

NX.exportStageCart = function () {
  const { state, exportDraft, showXkResult } = NX;
  if (!state.stageCart.length) { showXkResult({ ok: false, msg: '暂存区没有课程' }); return; }
  exportDraft({ name: '暂存课表', courses: state.stageCart });
};

NX.importToStage = function (jsonStr) {
  const { state, store, baseFlag, renderStageCart, showXkResult } = NX;
  const { allCourses, stageCart } = state;
  try {
    const data = JSON.parse(jsonStr.trim());
    if (!data.courses || !Array.isArray(data.courses)) throw new Error('数据格式错误');
    let added = 0;
    data.courses.forEach(c => {
      if (!stageCart.some(s => s.code === c.code && String(s.seq) === String(c.seq))) {
        stageCart.push({
          code: c.code, seq: c.seq || '0', name: c.name || '', teacher: c.teacher || '',
          time: c.time || '', credits: c.credits || 0, flag: c.flag || 'bx', zy: c.zy || 3,
          baseFlag: c.baseFlag || (() => { const ac = allCourses.find(x => x.code === c.code); return ac ? baseFlag(ac) : 'rx'; })(),
        });
        added++;
      }
    });
    NX.invalidatePreview();
    renderStageCart();
    store.set('stageCart', stageCart);
    showXkResult({ ok: true, msg: '已导入 ' + added + ' 门课程到暂存区' });
  } catch (e) { showXkResult({ ok: false, msg: '导入失败: ' + e.message }); }
};

NX.promoteDraft = async function (draft) {
  const { state, showXkResult, fetchSelectedCourses, dropCourse, submitCourse, refreshSelected, renderPreviewTT } = NX;
  const $ = state.$;
  const toast = $('nextthuxk-toast');
  const prog = (msg) => { if (toast) { toast.className = 'nx-toast'; toast.style.cssText = 'display:block;opacity:1;background:rgba(29,31,36,.82);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);color:#fff'; toast.textContent = msg; } };
  try {
    prog('正在获取已选课程…');
    const current = await fetchSelectedCourses();
    for (let i = 0; i < current.length; i++) {
      prog('退选 ' + (i + 1) + '/' + current.length + ': ' + current[i].name);
      await dropCourse(current[i].code, current[i].seq);
      await new Promise(r => setTimeout(r, 1000));
    }
    for (let i = 0; i < draft.courses.length; i++) {
      const c = draft.courses[i];
      prog('选课 ' + (i + 1) + '/' + draft.courses.length + ': ' + c.name);
      await submitCourse(c.code, c.seq, c.zy || 3, c.flag || 'bx');
      // 排队选课内部已有 1.5s 延时，这里额外等 2s 避免触发验证码
      await new Promise(r => setTimeout(r, 2000));
    }
    await refreshSelected();
    showXkResult({ ok: true, msg: '课表「' + draft.name + '」已全部提交！' });
    const sel = state.allCourses.filter(c => c.selected);
    renderPreviewTT(sel, '当前已选');
  } catch (e) { showXkResult({ ok: false, msg: '提交出错: ' + e.message }); }
};

NX.canAdjustZy = function (code, seq, targetZy) {
  const { state, zyTypeOf, ZY_LIMITS } = NX;
  const { allCourses } = state;
  const course = allCourses.find(c => c.code === code && String(c.seq || '0') === String(seq || '0'));
  if (!course) return false;
  const zt = zyTypeOf(course);
  let count = 0;
  allCourses.forEach(c => {
    if (!c.selected) return;
    if (c.code === code && String(c.seq || '0') === String(seq || '0')) return;
    if (zyTypeOf(c) !== zt) return;
    if (c.zy === targetZy) count++;
  });
  const limits = ZY_LIMITS[zt] || ZY_LIMITS.bx;
  return count < (limits[targetZy - 1]?.[1] || 0);
};

// ─── Preview Remove Handler ───────────────────────────────────

NX.handlePreviewRemove = async function (code, seq) {
  const { state, dropCourse, showXkResult, removeFromStage, renderPreviewTT, renderDrafts } = NX;
  const { allCourses, stageCart, savedDrafts, previewMode, previewDraftIdx } = state;
  const $ = state.$;
  if (previewMode === 'selected') {
    const c = allCourses.find(x => x.code === code && String(x.seq || '0') === String(seq));
    const name = c?.name || code;
    if (!confirm('确认退选「' + name + '」？')) return;
    const res = await dropCourse(code, seq);
    showXkResult(res);
    // 增量刷新（原实现 NX.launch() 全量重启：重新拉目录/队列/渲染整个面板）
    if (res.ok) {
      await NX.refreshSelected();
      NX.renderPlan(state.planData);
    }
  } else if (previewMode === 'stage') {
    const idx = stageCart.findIndex(s => s.code === code && String(s.seq) === String(seq));
    const name = idx >= 0 ? stageCart[idx].name : code;
    if (!confirm('从暂存区移除「' + name + '」？')) return;
    removeFromStage(idx);
    renderPreviewTT(stageCart, $('nextthuxk-preview-info')?.textContent || '');
  } else if (previewMode === 'draft') {
    const draft = savedDrafts[previewDraftIdx];
    if (!draft) return;
    const idx = draft.courses.findIndex(s => s.code === code && String(s.seq) === String(seq));
    const name = idx >= 0 ? draft.courses[idx].name : code;
    if (!confirm('从草稿移除「' + name + '」？')) return;
    draft.courses.splice(idx, 1);
    NX.invalidatePreview();
    await NX.store.set('drafts', savedDrafts);
    renderDrafts();
    renderPreviewTT(draft.courses, '草稿「' + draft.name + '」预览');
  }
};
