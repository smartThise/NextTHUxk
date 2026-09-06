// ═══════════════════════════════════════════════════════════════
// NextTHUxk — Render: 所有渲染函数 + 筛选逻辑
// ═══════════════════════════════════════════════════════════════
var NX = NX || {};

// ─── 课表预览时间轴常量（OneTHU Courses.tsx 同款，xk-1.5.1）────────
// 大节→钟点映射（清华第1-14节标准时段）；预览轴 08:00-21:45，0.72px/分钟。
const PV_BEGIN = ['', '08:00', '08:50', '09:50', '10:40', '11:30', '13:30', '14:20', '15:20', '16:10', '17:05', '17:55', '19:20', '20:10', '21:00'];
const PV_END = ['', '08:45', '09:35', '10:35', '11:25', '12:15', '14:15', '15:05', '16:05', '16:55', '17:50', '18:40', '20:05', '20:55', '21:45'];
NX.pvToMin = hm => { const p = String(hm).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };
NX.SLOT_RANGE = [
  [NX.pvToMin(PV_BEGIN[1]), NX.pvToMin(PV_END[2])],
  [NX.pvToMin(PV_BEGIN[3]), NX.pvToMin(PV_END[5])],
  [NX.pvToMin(PV_BEGIN[6]), NX.pvToMin(PV_END[7])],
  [NX.pvToMin(PV_BEGIN[8]), NX.pvToMin(PV_END[9])],
  [NX.pvToMin(PV_BEGIN[10]), NX.pvToMin(PV_END[11])],
  [NX.pvToMin(PV_BEGIN[12]), NX.pvToMin(PV_END[14])],
];
NX.PV_PX_PER_MIN = 0.72;
NX.PV_AXIS_BEGIN = 8 * 60;
NX.PV_AXIS_END = NX.pvToMin(PV_END[14]);
/** 课块配色（无概率色时按课名稳定取色，同 OneTHU 正式课表） */
const PV_PALETTE = ['#6d7ff0', '#3d8bfd', '#1fa487', '#e07a4f', '#b463d6', '#2f9edb', '#c9971f', '#4caf6e', '#d45c8a', '#7a63e8'];
NX.pvColorOf = function (name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PV_PALETTE[h % PV_PALETTE.length] || '#6d7ff0';
};

// ─── THUbook 评分徽章（有数据才出现；按分数段分色便于扫读）──
// ≥4.5 神课绿 · 4.0~4.4 优质靛蓝 · 3.0~3.9 一般琥珀 · <3.0 避课红
NX.tbBadgeHtml = function (c) {
  const e = c._tbRef;
  if (!e || !e.count || !e.avg) return '';
  const a = Number(e.avg) || 0;
  const lv = a >= 4.5 ? 'lv-hi' : a >= 4 ? 'lv-good' : a >= 3 ? 'lv-mid' : 'lv-bad';
  return '<button type="button" class="nx-tb-badge ' + lv + '" data-code="' + NX.esc(c.code) + '" data-seq="' + NX.esc(c.seq || '0') + '" title="THU选课社区评分 · 点击查看全部点评">★' + a.toFixed(1) + '<i>' + e.count + '评</i></button>';
};

// ─── Course Card Rendering ────────────────────────────────────
// 渐进渲染：只渲染视口内+预载距离的卡片（原实现一次 innerHTML 全量 6000+ 卡，
// 数十万 DOM 节点 + 每按钮闭包，是内存占用巨大/卡顿的主因）
NX.RENDER_CHUNK = 80;

NX.courseCardHtml = function (c, ctx) {
  const { esc, state, volColor, fmtVol, baseFlag, allowedFlags, currentProbMeta, currentProbLine, fullProbGrid, typeCodeToFlag, findPreviewConflicts } = NX;
  const { queueDataMap, isQueuePhase } = state;
  const stageSet = ctx.stageSet;
    const tags = [];
    const _org = NX.originOf(c.code);
    if (_org) tags.push('<span class="nx-tag" style="color:#fff;background:' + (NX.ORIGIN_COLORS[_org] || '#666') + ';border:none">' + _org + '</span>');
    if (c.available) tags.push('<span class="nx-tag nx-tag-ok">可选</span>');
    else tags.push('<span class="nx-tag nx-tag-no">已满</span>');
    if (c.selected) tags.push('<span class="nx-tag nx-tag-sel">已选</span>');
    if (c.attr === '必修') tags.push('<span class="nx-tag nx-tag-req">必修</span>');
    else if (c.attr === '限选') tags.push('<span class="nx-tag nx-tag-ele">限选</span>');
    else if (c.attr === '任选') tags.push('<span class="nx-tag nx-tag-opt">任选</span>');
    if (c.teacher) tags.push('<span class="nx-tag">' + esc(c.teacher) + '</span>');
    if (c.time) tags.push('<span class="nx-tag">' + esc(c.time) + '</span>');
    if (c.department) tags.push('<span class="nx-tag">' + esc(c.department) + '</span>');
    const vc = volColor(c);
    const volParts = [];
    const isTy = c.attr === '体育' || c.department?.includes('体育') || c.name?.includes('体育') || c.typeLabel === '体育';
    if (isTy && c.volSports && c.volSports !== '0,0,0') {
      const s = fmtVol(c.volSports); if (s) volParts.push('<span>体 ' + s + '</span>');
    } else {
      if (c.volRequired && c.volRequired !== '0,0,0') { const s = fmtVol(c.volRequired); if (s) volParts.push('<span>必 ' + s + '</span>'); }
      if (c.volElective && c.volElective !== '0,0,0') { const s = fmtVol(c.volElective); if (s) volParts.push('<span>限 ' + s + '</span>'); }
      if (c.volOptional && c.volOptional !== '0,0,0') { const s = fmtVol(c.volOptional); if (s) volParts.push('<span>任 ' + s + '</span>'); }
    }
    const volHtml = volParts.length ? '<div class="nx-vol">' + volParts.join('') + '</div>' : '';
    const defFlag = baseFlag(c);
    const occ = NX.occupancyOf(c);   // 已满(余0)绝不显示 0/N 竞争宽松（用户实锤）
    const volApplied = occ.applied;
    const volCap = occ.cap;
    const compLabel = vc.level === 'easy' ? '竞争宽松' : vc.level === 'medium' ? '竞争适中' : vc.level === 'hard' ? '竞争激烈' : '';
    const compHtml = volCap > 0 ? '<div class="nx-comp"><div class="nx-comp-bar" style="width:' + vc.pct + '%;background:' + vc.color + '"></div><span class="nx-comp-txt" style="color:' + vc.color + '">' + volApplied + '/' + volCap + ' · ' + compLabel + '</span></div>' : '';
    const currentFlag = c.selected ? typeCodeToFlag(c.typeCode) : defFlag;
    const currentZy = c.selected ? (c.zy || 3) : 3;
    const currentProbHtml = currentProbLine(c, currentFlag, currentZy);
    const probHtml = fullProbGrid(c, defFlag);
    const qKey = c.code + '_' + NX.normSeq(c.seq);
    const qd = queueDataMap[qKey];
    const cand = ctx.candMap.get(qKey);
    let queueInfoHtml = '';
    if (isQueuePhase && (qd || cand)) {
      if (cand) {
        queueInfoHtml = '<div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
          '<span style="background:rgba(255,159,26,.12);color:#ff9f1a;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">排队第' + cand.myPos + '名</span>' +
          '<span style="background:rgba(154,161,172,.1);color:#9aa1ac;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">共' + cand.queueTotal + '人排队</span>' +
          (qd ? '<span style="background:rgba(' + (qd.qRemaining > 0 ? '52,199,89' : '255,59,48') + ',.12);color:' + (qd.qRemaining > 0 ? '#07c160' : '#ee4d4d') + ';padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">余' + qd.qRemaining + '/' + qd.qCapacity + '</span>' : '') +
          '<span style="font-size:10px;font-weight:700;color:#ff9f1a">' + cand.typeLabel + ' · 第' + cand.zy + '志愿</span></div>';
      } else if (qd) {
        const rc = qd.qRemaining > 0 ? '#07c160' : '#ee4d4d';
        const rl = qd.qRemaining > 0 ? '余' + qd.qRemaining + '/' + qd.qCapacity : '已满(容量' + qd.qCapacity + ')';
        const hope = qd.qRemaining > 0 ? '排入希望：高' : qd.qQueue > 0 ? '排入希望：低(队' + qd.qQueue + '人)' : '暂无排队';
        const hc = qd.qRemaining > 0 ? '#07c160' : qd.qQueue > 0 ? '#ff9f1a' : '#9aa1ac';
        queueInfoHtml = '<div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
          '<span style="background:rgba(' + (qd.qRemaining > 0 ? '52,199,89' : '255,59,48') + ',.12);color:' + rc + ';padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">' + rl + '</span>' +
          (qd.qQueue > 0 ? '<span style="background:rgba(255,159,26,.12);color:#ff9f1a;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600">排队 ' + qd.qQueue + '人</span>' : '') +
          '<span style="font-size:10px;font-weight:700;color:' + hc + '">' + hope + '</span></div>';
      }
    }
    const pConflicts = findPreviewConflicts(c);
    const conflictHtml = pConflicts.length
      ? '<div style="font-size:10px;color:#ee4d4d;margin-top:3px;display:flex;gap:4px;align-items:center;flex-wrap:wrap"><span>冲突:</span>' + pConflicts.slice(0, 3).map(cf => '<span style="background:rgba(238,77,77,.1);padding:1px 6px;border-radius:4px">' + cf.day + cf.slot + ' ' + esc(cf.name) + '</span>').join('') + '</div>'
      : '';
    const detail = [c.capacity ? '容量' + c.capacity : '', c.remaining !== undefined ? '余' + c.remaining : ''].filter(Boolean).join(' · ');
    const noteHtml = c.xkTextNote ? '<div style="font-size:11px;color:#ff9f1a;margin-top:4px;padding:3px 8px;background:rgba(255,159,26,.06);border-radius:4px;line-height:1.4">' + esc(c.xkTextNote) + '</div>' : '';
    let selectBtn;
    if (c.selected) {
      const volLabel = c.zy ? '<span class="nx-vol-info">第' + c.zy + '志愿 · ' + esc(c.typeLabel || '') + '</span>' : '';
      const p = currentProbMeta(c, currentFlag, currentZy);
      const probInline = isQueuePhase && (qd || cand)
        ? '<span class="nx-inline-prob" style="color:' + (cand ? '#ff9f1a' : qd.qRemaining > 0 ? '#07c160' : '#ee4d4d') + '">' + (cand ? '排队第' + cand.myPos + '名' : qd.qRemaining > 0 ? '余' + qd.qRemaining : '已满') + '</span>'
        : '<span class="nx-inline-prob nx-card-inline-prob" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" style="color:' + p.color + '">' + (p.percentLabel || p.label) + '</span>';
      const canUp = c.zy && c.zy > 1 && NX.canAdjustZy(c.code, c.seq || '0', c.zy - 1);
      const canDown = c.zy && c.zy < 3 && NX.canAdjustZy(c.code, c.seq || '0', c.zy + 1);
      const upBtn = canUp ? '<button class="nx-vol-btn" data-dir="up" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-zy="' + c.zy + '">▲</button>' : (c.zy > 1 ? '<button class="nx-vol-btn" disabled title="该志愿名额已满">▲</button>' : '');
      const downBtn = canDown ? '<button class="nx-vol-btn" data-dir="down" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-zy="' + c.zy + '">▼</button>' : (c.zy < 3 ? '<button class="nx-vol-btn" disabled title="该志愿名额已满">▼</button>' : '');
      const sFlag = typeCodeToFlag(c.typeCode);
      const inStage = stageSet.has(c.code + '_' + String(c.seq || '0'));
      selectBtn = volLabel + probInline + upBtn + downBtn + '<button class="nx-stage-btn nx-add-stage-sel" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-flag="' + sFlag + '" data-zy="' + (c.zy || 3) + '"' + (inStage ? ' disabled' : '') + '>' + (inStage ? '已暂存' : '暂存') + '</button><button class="nx-drop-btn" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '">退选</button>';
    } else if (c.available) {
      const inStage = stageSet.has(c.code + '_' + String(c.seq || '0'));
      const aFlags = allowedFlags(defFlag);
      const flagOpts = aFlags.map(f => '<option value="' + f + '"' + (defFlag === f ? ' selected' : '') + '>' + (f === 'bx' ? '必修' : f === 'xx' ? '限选' : f === 'rx' ? '任选' : '体育') + '</option>').join('');
      const p = currentProbMeta(c, currentFlag, currentZy);
      const probInline = isQueuePhase && (qd || cand)
        ? '<span class="nx-inline-prob" style="color:' + (cand ? '#ff9f1a' : qd.qRemaining > 0 ? '#07c160' : '#ee4d4d') + '">' + (cand ? '排队第' + cand.myPos + '名' : qd.qRemaining > 0 ? '余' + qd.qRemaining : '已满') + '</span>'
        : '<span class="nx-inline-prob nx-card-inline-prob" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" style="color:' + p.color + '">' + (p.percentLabel || p.label) + '</span>';
      selectBtn = '<select class="nx-type-select" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '">' + flagOpts + '</select><select class="nx-zy-select" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '"><option value="3">3志愿</option><option value="2">2志愿</option><option value="1">1志愿</option></select>' + probInline + '<button class="nx-select-btn" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '">选课</button><button class="nx-stage-btn nx-add-stage" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '"' + (inStage ? ' disabled' : '') + '>' + (inStage ? '已暂存' : '暂存') + '</button>';
    } else if (c.isCandidate && cand) {
      // 已在候补队列中：显示排队位置 + 删除按钮
      selectBtn = '<span style="font-size:11px;color:#ff9f1a;font-weight:600">排队第' + cand.myPos + '名 / 共' + cand.queueTotal + '人</span>' +
        '<button class="nx-drop-btn" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '">删除</button>';
    } else {
      // 已满但未在队列：允许排队选课
      const inStage = stageSet.has(c.code + '_' + String(c.seq || '0'));
      const aFlags = allowedFlags(defFlag);
      const flagOpts = aFlags.map(f => '<option value="' + f + '"' + (defFlag === f ? ' selected' : '') + '>' + (f === 'bx' ? '必修' : f === 'xx' ? '限选' : f === 'rx' ? '任选' : '体育') + '</option>').join('');
      const p = currentProbMeta(c, currentFlag, currentZy);
      const probInline = isQueuePhase && (qd || cand)
        ? '<span class="nx-inline-prob" style="color:' + (cand ? '#ff9f1a' : qd.qRemaining > 0 ? '#07c160' : '#ee4d4d') + '">' + (cand ? '排队第' + cand.myPos + '名' : qd.qRemaining > 0 ? '余' + qd.qRemaining : '已满') + '</span>'
        : '<span class="nx-inline-prob nx-card-inline-prob" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" style="color:' + p.color + '">' + (p.percentLabel || p.label) + '</span>';
      selectBtn = '<span style="font-size:10px;color:#ee4d4d;font-weight:600;margin-right:2px">已满</span>' +
        '<select class="nx-type-select" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '">' + flagOpts + '</select>' +
        '<select class="nx-zy-select" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '"><option value="3">3志愿</option><option value="2">2志愿</option><option value="1">1志愿</option></select>' +
        probInline +
        '<button class="nx-select-btn" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" style="background:var(--nx-glass);color:var(--nx-ink-soft);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 0 0 0 1px var(--nx-line)">排队选课</button>' +
        '<button class="nx-stage-btn nx-add-stage" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '"' + (inStage ? ' disabled' : '') + '>' + (inStage ? '已暂存' : '暂存') + '</button>';
    }
    return '<div class="nx-card' + (c.selected ? ' nx-selected' : '') + '" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-tid="' + esc(c.teacherId || '') + '">' +
      '<div class="nx-card-head"><span class="nx-card-name">' + esc(c.name) + '</span>' + NX.tbBadgeHtml(c) + '<span class="nx-card-credit">' + c.credits + '学分</span></div>' +
      '<div style="font-size:11px;color:#9aa1ac;margin-bottom:3px">' + esc(c.code) + (c.seq ? ' · ' + esc(c.seq) + '课序' : '') + '</div>' +
      '<div class="nx-tags">' + tags.join('') + '</div>' +
      (isQueuePhase && (qd || cand) ? queueInfoHtml : volHtml + compHtml + currentProbHtml + probHtml) + conflictHtml + noteHtml +
      '<div class="nx-card-detail"><div class="nx-card-detail-inner">' + detail + '</div></div>' +
      '<div class="nx-card-actions">' +
      '<button class="nx-detail-btn" data-code="' + esc(c.code) + '" data-tid="' + esc(c.teacherId || '') + '">简介</button>' +
      selectBtn + '</div></div>';
};

// ─── 渐进渲染 + 事件委托 ─────────────────────────────────────

// 通用课程查找（优先 Map 索引，回退线性扫）
NX.getCourse = function (code, seq) {
  const { courseMap, allCourses } = NX.state;
  const k = code + '_' + String(seq || '0');
  if (courseMap) { const hit = courseMap.get(k); if (hit) return hit; }
  return allCourses.find(x => x.code === code && String(x.seq || '0') === String(seq || '0'));
};

// 暂存/草稿行 → 池内数据源（Issue #33 定案）：课序精确优先；兜底必须「教师一致」
// 或「该课号池内唯一」——绝不吃同名第一门（数据不完整池里第一门常是别的老师的课，
// 概率/余量错标误导极强：用户实测王洪川 100% 被错标成刘烨 9%）。
NX.courseForStage = function (c, pool) {
  const src = pool || NX.state.allCourses;
  const t = String(c.teacher || '').trim();
  const tOk = x => !t || (!!x.teacher &&
    (x.teacher === t || x.teacher.includes(t) || t.includes(x.teacher)));
  const same = src.filter(x => x.code === c.code);
  // ① 课序精确且教师不矛盾
  const exact = same.find(x => String(x.seq || '0') === String(c.seq || '0'));
  if (exact && tOk(exact)) return exact;
  // ② 教师一致（课序两套编号对不上是本系统文档在案的老毛病——教师才是真身份，
  //    实测：暂存王洪川 100% 被课序精确命中成刘烨 9%）
  if (t) {
    const tm = same.find(x => x.teacher &&
      (x.teacher === t || x.teacher.includes(t) || t.includes(x.teacher)));
    if (tm) return tm;
  }
  // ③ 无教师信息才裸信课序；有教师但没命中 → 课序命中不可靠，唯一才用
  if (!t && exact) return exact;
  return same.length === 1 ? same[0] : undefined;
};

NX.rebuildCourseMap = function () {
  const m = new Map();
  for (const c of NX.state.allCourses) m.set(c.code + '_' + (c.seq || '0'), c);
  NX.state.courseMap = m;
};

NX.renderCourses = function (list) {
  const { state } = NX;
  const $ = state.$;
  const el = $('nextthuxk-list');
  if (!el) return;
  if (state.renderObserver) { state.renderObserver.disconnect(); state.renderObserver = null; }
  state.renderList = list;
  state.renderCursor = 0;
  if (!list.length) { el.innerHTML = '<div class="nx-empty">暂无匹配课程</div>'; return; }
  state.renderCtx = {
    candMap: new Map(state.candidateCourses.map(cc => [cc.code + '_' + String(cc.seq || '0'), cc])),
    stageSet: new Set(state.stageCart.map(s => s.code + '_' + String(s.seq || '0'))),
  };
  NX.bindCardDelegation(el);
  el.innerHTML = '';
  const sentinel = document.createElement('div');
  sentinel.className = 'nx-render-sentinel';
  el.appendChild(sentinel);
  state.renderSentinel = sentinel;
  NX.renderMoreCourses();
  const io = new IntersectionObserver(entries => {
    if (entries.some(en => en.isIntersecting)) NX.renderMoreCourses();
  }, { root: el, rootMargin: '800px' });
  io.observe(sentinel);
  state.renderObserver = io;
};

NX.renderMoreCourses = function () {
  const { state, courseCardHtml } = NX;
  const { renderList, renderCursor, renderSentinel, renderCtx, renderObserver } = state;
  if (!renderList || !renderSentinel) return;
  if (renderCursor >= renderList.length) { if (renderObserver) renderObserver.disconnect(); return; }
  const end = Math.min(renderCursor + NX.RENDER_CHUNK, renderList.length);
  const parts = [];
  for (let i = renderCursor; i < end; i++) parts.push(courseCardHtml(renderList[i], renderCtx));
  renderSentinel.insertAdjacentHTML('beforebegin', parts.join(''));
  state.renderCursor = end;
  if (end >= renderList.length && renderObserver) renderObserver.disconnect();
};

// 事件委托：容器级 click/change 两个监听器，替代每批 8 次 querySelectorAll + 每按钮闭包
NX.bindCardDelegation = function (el) {
  if (el.dataset.nxDelegated) return;
  el.dataset.nxDelegated = '1';
  const { showCourseModal, submitCourse, dropCourse, changeVolunteer, addToStage, refreshSelected, showXkResult, baseFlag } = NX;
  const { showReviewsModal } = NX;
  const syncCardProb = node => {
    const card = node.closest('.nx-card');
    if (!card) return;
    const course = NX.getCourse(card.dataset.code, node.dataset.seq);
    if (!course || course.selected) return;
    const flag = card.querySelector('.nx-type-select')?.value || baseFlag(course);
    const zy = parseInt(card.querySelector('.nx-zy-select')?.value) || 3;
    const meta = NX.currentProbMeta(course, flag, zy);
    const line = card.querySelector('.nx-current-prob');
    if (line) {
      line.dataset.flag = flag;
      line.dataset.zy = String(zy);
      const pill = line.querySelector('.nx-prob-pill');
      if (pill) {
        const detail = meta.ratioLabel && meta.ratioLabel !== '无数据' ? ' · ' + meta.ratioLabel : '';
        pill.textContent = meta.flagLabel + ' · ' + meta.zy + '志愿 · ' + (meta.percentLabel || meta.label) + detail;
        pill.style.background = meta.bg;
        pill.style.color = meta.color;
        pill.classList.toggle('nx-prob-pill-muted', meta.prob < 0);
      }
    }
    const inline = card.querySelector('.nx-card-inline-prob');
    if (inline) {
      inline.textContent = meta.percentLabel || meta.label;
      inline.style.color = meta.color;
    }
  };
  el.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) {
      const card = e.target.closest('.nx-card');
      if (card) card.classList.toggle('open');
      return;
    }
    const cls = btn.classList;
    if (cls.contains('nx-detail-btn')) {
      showCourseModal(btn.dataset.code, btn.dataset.tid);
    } else if (cls.contains('nx-tb-badge')) {
      if (showReviewsModal) showReviewsModal(btn.dataset.code, btn.dataset.seq);
      return;
    } else if (cls.contains('nx-select-btn')) {
      const actions = btn.parentElement;
      const flag = actions.querySelector('.nx-type-select')?.value || 'bx';
      const zy = actions.querySelector('.nx-zy-select')?.value || '3';
      const origText = btn.textContent;
      btn.disabled = true; btn.textContent = '提交中…';
      submitCourse(btn.dataset.code, btn.dataset.seq, parseInt(zy), flag)
        .then(res => { showXkResult(res); return res.ok ? refreshSelected() : null; })
        .catch(err => showXkResult({ ok: false, msg: err.message }))
        .finally(() => { btn.disabled = false; btn.textContent = origText; });
    } else if (cls.contains('nx-drop-btn')) {
      const origText = btn.textContent;
      btn.disabled = true; btn.textContent = origText.includes('删除') ? '退出中…' : '退选中…';
      dropCourse(btn.dataset.code, btn.dataset.seq)
        .then(res => { showXkResult(res); return res.ok ? refreshSelected() : null; })
        .catch(err => showXkResult({ ok: false, msg: err.message }))
        .finally(() => { btn.disabled = false; btn.textContent = origText; });
    } else if (cls.contains('nx-vol-btn')) {
      const curZy = parseInt(btn.dataset.zy) || 1;
      const targetZy = btn.dataset.dir === 'up' ? curZy - 1 : curZy + 1;
      if (targetZy < 1) return;
      btn.disabled = true;
      changeVolunteer(btn.dataset.code, btn.dataset.seq, targetZy)
        .then(res => { showXkResult(res); return res.ok ? refreshSelected() : null; })
        .catch(err => showXkResult({ ok: false, msg: err.message }))
        .finally(() => { btn.disabled = false; });
    } else if (cls.contains('nx-add-stage')) {
      const actions = btn.parentElement;
      const flag = actions.querySelector('.nx-type-select')?.value || 'bx';
      const zy = parseInt(actions.querySelector('.nx-zy-select')?.value) || 3;
      addToStage(btn.dataset.code, btn.dataset.seq, flag, zy);
      btn.textContent = '已暂存';
      btn.disabled = true;
    } else if (cls.contains('nx-add-stage-sel')) {
      addToStage(btn.dataset.code, btn.dataset.seq, btn.dataset.flag || 'bx', parseInt(btn.dataset.zy) || 3);
      btn.textContent = '已暂存';
      btn.disabled = true;
    }
  });
  el.addEventListener('change', e => {
    const t = e.target;
    if (t.classList && (t.classList.contains('nx-type-select') || t.classList.contains('nx-zy-select'))) {
      syncCardProb(t);
    }
  });
};

// ─── Timetable Preview ────────────────────────────────────────

NX.renderPreviewTT = function (courses, label) {
  const { esc, state, typeCodeToFlag, calcProb, probBg, fullProbGrid, parseTimeSlots, handlePreviewRemove } = NX;
  const { allCourses, queueDataMap, isQueuePhase, candidateCourses, stageCart, savedDrafts, previewMode, previewDraftIdx } = state;
  const $ = state.$;
  const el = $('nextthuxk-preview-tt');
  const info = $('nextthuxk-preview-info');
  const resetBtn = $('nextthuxk-preview-reset');
  if (!el) return;
  if (info) info.textContent = label || '';
  if (resetBtn) resetBtn.style.display = (label && label !== '当前已选') ? 'inline-block' : 'none';
  state.previewMode = (label === '当前已选') ? 'selected' : 'stage';
  if (label && label.startsWith('草稿「')) state.previewMode = 'draft';
  const manualEvents = state.manualEvents || [];
  if (!courses.length && !manualEvents.length) { el.innerHTML = '<div class="nx-st">暂无课程</div>'; return; }
  const raw = [];
  const undet = [];   // 时间未定/无固定时段课程（#16）：不进网格，单列在表格下方
  courses.concat(manualEvents).forEach((c, ci) => {
    const lbl = c.teacher ? c.name + '(' + c.teacher + ')' : c.name;
    let cellColor = '', probLabel = '', probBgColor = '';
    const qKey = c.code + '_' + NX.normSeq(c.seq);
    const qd = queueDataMap[qKey];
    const cand = candidateCourses.find(cc => cc.code === c.code && String(cc.seq) === String(c.seq || '0'));
    if (c.manual) {
      cellColor = '#8b5cf6'; probLabel = '自定义'; probBgColor = 'rgba(139,92,246,.14)';
    } else if (c.isCandidate && cand && cand.myPos) {
      // 候选提示不 gate 在 isQueuePhase（预选阶段候补课同样要看见位次；
      // kbSearch 兜底候选无位次 → 下方「候选中」分支）
      cellColor = '#ff9f1a'; probLabel = '排队第' + cand.myPos + '/' + cand.queueTotal + '人'; probBgColor = 'rgba(255,159,26,.14)';
    } else if (c.isCandidate) {
      cellColor = '#ff9f1a'; probLabel = '候选中'; probBgColor = 'rgba(255,159,26,.14)';
    } else if (isQueuePhase) {
      if (state.previewMode === 'selected') {
        probLabel = '已选'; cellColor = '#07c160'; probBgColor = 'rgba(7,193,96,.14)';
      } else if (qd) {
        if (qd.qRemaining > 0) { cellColor = '#07c160'; probLabel = '余' + qd.qRemaining; probBgColor = 'rgba(7,193,96,.14)'; }
        else if (qd.qQueue > 0) { cellColor = '#ff9f1a'; probLabel = '排队' + qd.qQueue + '人'; probBgColor = 'rgba(255,159,26,.14)'; }
        else { cellColor = '#ee4d4d'; probLabel = '已满'; probBgColor = 'rgba(238,77,77,.14)'; }
      }
    } else if (state.previewMode === 'selected' && c.zy) {
      const sf = typeCodeToFlag(c.typeCode);
      const p = calcProb(c, sf, c.zy);
      if (p.prob >= 0) { cellColor = p.color; probLabel = p.percentLabel || p.label; probBgColor = probBg(p.color); }
    } else if ((state.previewMode === 'stage' || state.previewMode === 'draft') && c.flag && c.zy) {
      const ac = NX.getCourse(c.code, c.seq);
      if (ac) { const p = calcProb(ac, c.flag, c.zy); if (p.prob >= 0) { cellColor = p.color; probLabel = p.percentLabel || p.label; probBgColor = probBg(p.color); } }
    }
    // 课块：清华课按大节→钟点；外校课（PK/GPK/BW）time 无槽位，
    // 从 note 解析「周X HH:MM-HH:MM」（钟点解析 v2，含复合日/单双周/周段）
    const mk = (day, begin, end, tag) => ({
      key: (c.code || 'm') + '_' + (c.seq || '0') + '_' + tag, day, begin, end,
      label: lbl, color: cellColor, probLabel, probBgColor,
      manual: !!c.manual, id: c.id, code: c.code, seq: c.seq || '0', teacher: c.teacher || '',
      origin: NX.originOf(c.code), tag,
    });
    let n = 0;
    const _dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const _slotNames = ['1-2节', '3-4节', '5-6节', '7-8节', '9-10节', '11-12节'];
    parseTimeSlots(c.time).forEach(({ day, slot }) => {
      // 插件 parseTimeSlots 返回标签（周一/1-2节），OneTHU 返回数字——此处换算
      const dNum = _dayNames.indexOf(day) + 1;
      const sNum = _slotNames.indexOf(slot) + 1;
      const r = NX.SLOT_RANGE[sNum - 1];
      if (!dNum || !r) return;
      raw.push(mk(dNum, r[0], r[1], '' + sNum));
      n += 1;
    });
    if (!n && c.manual && c.begin && c.end && c.day && NX.pvToMin(c.begin) < NX.pvToMin(c.end)) {
      raw.push(mk(c.day, NX.pvToMin(c.begin), NX.pvToMin(c.end), 'clock'));
      n += 1;
    }
    if (!n) {
      NX.clockRangesOf(c.note || c.xkTextNote || '', c.time).forEach(cr => {
        raw.push(Object.assign(mk(cr.day, cr.begin, cr.end, 'c' + cr.begin), { tag: cr.tag }));
        n += 1;
      });
    }
    if (!n) {
      // 时间未定/无固定时段（如二级选课阶段才定时间的实验课）→ 单列展示
      undet.push({ lbl, ci, code: c.code, seq: c.seq || '0', credits: c.credits || 0, zy: c.zy || 0, manual: !!c.manual, id: c.id });
      console.log(NX.TAG, '时间未定 ' + c.code + '_' + (c.seq || '0') + ' time=[' + (c.time || '') + '] note=[' + ((c.note || c.xkTextNote) || '') + ']');
    }
    // 未定课存在 → 防抖触发已选时间回填（launch 时可能查询失败/数据未就绪，
    // 这里给每门课第二次机会；tried 计数两试封顶，不会循环）
    if (undet.some(u => !u.manual) && NX.backfillSelTimes && !NX._undetBfT) {
      NX._undetBfT = setTimeout(() => { NX._undetBfT = null; NX.backfillSelTimes().catch(e => console.warn(NX.TAG, '已选时间回填失败:', e)); }, 800);
    }
  });
  // 同日重叠分道（OneTHU d822563 重叠簇制）：簇 = 首尾相接/重叠的块序列，
  // 簇内独立分道，lanes = 本簇深度；孤立块满宽。绝不用全日总道数劈半天。
  const lanesOf = new Map();
  for (let day = 1; day <= 7; day++) {
    const list = raw.filter(b => b.day === day).sort((a, b) => a.begin - b.begin || a.end - b.end);
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const ends = [];
      for (const b of cluster) {
        let lane = ends.findIndex(le => le <= b.begin);
        if (lane === -1) { lane = ends.length; ends.push(b.end); }
        else ends[lane] = b.end;
        lanesOf.set(b.key, { lane, lanes: ends.length });
      }
      for (const b of cluster) {
        const e = lanesOf.get(b.key);
        if (e) lanesOf.set(b.key, { lane: e.lane, lanes: ends.length });
      }
      cluster = [];
      clusterEnd = -1;
    };
    for (const b of list) {
      if (cluster.length && b.begin >= clusterEnd) flush();
      cluster.push(b);
      clusterEnd = Math.max(clusterEnd, b.end);
    }
    flush();
  }
  // 时间轴渲染：钟点轴（08:00-21:45 起步）+ 7 日列 + 绝对定位课块
  // 自由时间轴：占用可越出默认轴（早自习/晚自习），轴随块伸缩（30 分钟对齐）
  const PX = NX.PV_PX_PER_MIN;
  let A0 = NX.PV_AXIS_BEGIN, A1 = NX.PV_AXIS_END;
  for (const b of raw) { A0 = Math.min(A0, b.begin); A1 = Math.max(A1, b.end); }
  A0 = Math.floor(A0 / 30) * 30; A1 = Math.ceil(A1 / 30) * 30;
  const H = Math.round((A1 - A0) * PX);
  const hm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  let axisLines = '';
  for (let m = A0; m <= A1; m += 60) axisLines += '<span class="nx-tta-hl" style="top:' + Math.round((m - A0) * PX) + 'px">' + hm(m) + '</span>';
  // 轴列与日列同构：日列顶有 .nx-tta-day-h（星期头）把网格体往下推一个头高，
// 轴列没有同款头 → 整条钟点轴相对网格/课块整体上偏（用户实录「整体都向上
// 偏移了」）。补一个同 class 隐藏头，轴原点与 .nx-tta-day-b 顶对齐。
  let h = '<div class="nx-tta"><div style="flex:0 0 36px;min-width:36px"><div class="nx-tta-day-h" style="visibility:hidden">&nbsp;</div><div class="nx-tta-axis" style="height:' + H + 'px">' + axisLines + '</div></div>';
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  days.forEach((dn, di) => {
    const blocks = raw.filter(b => b.day === di + 1).map(b => {
      const ln = lanesOf.get(b.key) || { lane: 0, lanes: 1 };
      const top = Math.round((b.begin - A0) * PX);
      const hgt = Math.max(14, Math.round((b.end - b.begin) * PX) - 2);
      const bc = b.color || NX.pvColorOf(b.label);
      const bg = b.color ? (b.probBgColor || bc + '22') : bc + '22';
      const originHtml = b.origin ? '<span class="nx-tta-origin" style="background:' + (NX.ORIGIN_COLORS[b.origin] || '#666') + '">' + b.origin + '</span>' : '';
      // 时间段取代大节号/clock 标记（用户定稿：日程上直接可读起止钟点）
      const tagHtml = '<span class="nx-tta-tag">' + hm(b.begin) + '-' + hm(b.end) + '</span>';
      const probHtml = b.probLabel ? '<span class="nx-tt-prob" style="background:' + b.probBgColor + ';color:' + b.color + '">' + b.probLabel + '</span>' : '';
      return '<div class="nx-tta-b' + (b.manual ? ' nx-tt-manual' : ' nx-tt-jump') + '" style="top:' + top + 'px;height:' + hgt + 'px;left:calc(' + (ln.lane * 100 / ln.lanes) + '% + 1px);width:calc(' + (100 / ln.lanes) + '% - 2px);background:' + bg + ';border-left:3px solid ' + bc + '"' +
        (b.manual ? ' data-manual-id="' + esc(b.id) + '"' : ' data-code="' + esc(b.code) + '" data-seq="' + esc(b.seq) + '" data-teacher="' + esc(b.teacher || '') + '"') +
        ' title="' + esc(b.label + (b.tag ? ' · ' + b.tag : '')) + '">' +
        '<div class="nx-tta-l">' + originHtml + esc(b.label) + probHtml + tagHtml + '</div>' +
        '<span class="nx-tta-x" title="移除">✕</span></div>';
    }).join('');
    h += '<div class="nx-tta-day"><div class="nx-tta-day-h">' + dn + '</div><div class="nx-tta-day-b" style="height:' + H + 'px">' + blocks + '</div></div>';
  });
  h += '</div>';
  // 时间未定课程单列（#16）
  if (undet.length) {
    const bf = (NX.state && NX.state._bfStatus) || {};
    const bfLine = undet.filter(u => !u.manual).map(u => bf[u.code] || '').filter(Boolean).join('，');
    h += '<div style="margin-top:10px;font-size:11px;color:var(--nx-faint)">时间未定 / 无固定时段（' + undet.length + ' 门，不含在上方网格中）' +
      '<button type="button" id="nx-undet-retry" style="margin-left:8px;background:rgba(47,107,255,.12);border:none;color:var(--nx-accent);border-radius:4px;padding:1px 8px;cursor:pointer;font-size:10px">重试解析</button>' +
      (bfLine ? '<span style="margin-left:8px;color:var(--nx-ink-soft)">回填：' + esc(bfLine) + '</span>' : '') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">' +
      undet.map(u => '<span class="nx-tt-undet" data-code="' + esc(u.code) + '" data-seq="' + esc(u.seq) + '" title="点击移除">' +
        esc(u.lbl) + ' · ' + u.credits + '学分' + (u.zy ? ' · 第' + u.zy + '志愿' : '') + ' <i>✕</i></span>').join('') +
      '</div>';
  }
  if (manualEvents.length) {
    h += '<div class="nx-manual-list"><span class="nx-manual-list-label">自定义占用</span>' +
      manualEvents.map(e => {
        const slots = parseTimeSlots(e.time || '');
        const when = (e.begin && e.end)
          ? '周' + '一二三四五六日'[(Number(e.day) || 1) - 1] + ' ' + e.begin + '-' + e.end
          : slots.map(s => s.day + ' ' + s.slot).join('、');
        return '<button type="button" class="nx-manual-chip" data-id="' + esc(e.id) + '" title="删除此占用">' + esc(e.name) + (when ? ' · ' + esc(when) : '') + '　✕</button>';
      }).join('') + '</div>';
  }
  const cr = courses.reduce((s, c) => s + (c.credits || 0), 0);
  h += '<div class="nx-st ok" style="margin-top:6px">' + courses.length + '门课 · ' + cr + '学分' + (manualEvents.length ? ' · 自定义占用' + manualEvents.length + '项' : '') + '</div>';
  el.innerHTML = h;
  el.querySelectorAll('.nx-tta-x').forEach(x => {
    x.onclick = ev => {
      ev.stopPropagation();
      const b = x.closest('.nx-tta-b');
      if (!b) return;
      if (b.dataset.manualId) NX.removeManualEvent(b.dataset.manualId);
      else handlePreviewRemove(b.dataset.code, b.dataset.seq);
    };
  });
  el.querySelectorAll('.nx-tta-b.nx-tt-jump').forEach(bEl => {
    bEl.onclick = () => NX.jumpToCourse(bEl.dataset.code, bEl.dataset.seq, bEl.dataset.teacher);
  });
  const retryBtn = el.querySelector('#nx-undet-retry');
  if (retryBtn) retryBtn.onclick = () => {
    retryBtn.textContent = '查询中…';
    const st = NX.state;
    const tried = st._selTried || (st._selTried = new Map());
    undet.filter(u => !u.manual).forEach(u => tried.set(u.code + '_' + (u.seq || '0'), 0));   // 清计数重试
    st._bfScanP = null;   // 浏览扫描缓存作废重扫
    st._selBfLogged = false;
    if (NX.backfillSelTimes) NX.backfillSelTimes().catch(e => console.warn(NX.TAG, '已选时间回填失败:', e));
  };
  el.querySelectorAll('.nx-tt-undet').forEach(chip => {
    chip.onclick = () => handlePreviewRemove(chip.dataset.code, chip.dataset.seq);
  });
  el.querySelectorAll('.nx-manual-chip').forEach(chip => {
    chip.onclick = () => NX.removeManualEvent(chip.dataset.id);
  });
};

// 从课表预览定位到左侧课程列表。重置会隐藏目标课程的筛选条件，
// 用课程号搜索后精确滚动到对应课序号。
// 跳转语义（OneTHU jumpTo 定稿）：课号注入搜索栏并保持（无自动清词），
// 重置筛选 → 服务端按课号精确搜索 → 结果渲染后高亮目标卡片 1.8s。
// 随时查询版：不再依赖本地 courseMap（核心池只有已选/候补）。
NX.jumpToCourse = function (code, seq, teacher) {
  const { state } = NX;
  const $ = state.$;
  const search = $('nextthuxk-search');
  const list = $('nextthuxk-list');
  if (!search || !list || !code) return;

  state.activeGroup = null;
  state.shadow.querySelectorAll('.nx-chip').forEach(chip => {
    chip.classList.toggle('on', chip.dataset.f === 'all');
  });
  [
    'nx-filter-credits', 'nx-filter-day', 'nx-filter-period',
    'nx-filter-conflict', 'nx-filter-reviews', 'nx-sort-by',
    'nx-filter-tongshi', 'nx-filter-feature', 'nx-filter-grade-filter',
    'nx-filter-bksrem', 'nx-filter-yjsrem'
  ].forEach(id => { const node = $(id); if (node) node.value = ''; });
  const note = $('nx-filter-xknote');
  if (note) note.value = '';

  search.value = code;
  state._jumpCode = code;
  state._jumpSeq = seq || '0';
  state._jumpTeacher = String(teacher || '').trim();
  state._jumpAutoAll = true;   // 目标缺失且数据不完整时，允许自动补齐一轮（#33）
  state._serverSig = null;   // 强制发新服务端查询（课号 → kch 精确）
  NX.filterCourses();
  NX.scheduleServerSearch(true);   // 跳转立即查（不等防抖）
  list.scrollTop = 0;
};

// ─── Stage Cart Rendering ─────────────────────────────────────

NX.stageProbHtml = function (c) {
  const { state, fullProbGrid, baseFlag, getCourse } = NX;
  const { isQueuePhase, queueDataMap, allCourses } = state;
  // 课序精确 → 课号兜底（暂存/课余量/kkxx 两套课序号对不上时概率不该消失）
  const ac = NX.courseForStage(c);
  if (!ac) return '';
  if (isQueuePhase) {
    const qKey = c.code + '_' + NX.normSeq(c.seq);
    const qd = queueDataMap[qKey];
    if (qd) {
      const rc = qd.qRemaining > 0 ? '#07c160' : '#ee4d4d';
      return '<div style="margin-top:2px;display:flex;gap:4px;align-items:center;flex-wrap:wrap"><span style="background:rgba(' + (qd.qRemaining > 0 ? '52,199,89' : '255,59,48') + ',.12);color:' + rc + ';padding:1px 8px;border-radius:8px;font-size:10px;font-weight:600">余' + qd.qRemaining + '/' + qd.qCapacity + '</span>' + (qd.qQueue > 0 ? '<span style="background:rgba(255,159,26,.12);color:#ff9f1a;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:600">排队' + qd.qQueue + '人</span>' : '') + '</div>';
    }
    return '';
  }
  const bf = c.baseFlag || baseFlag(ac);
  return fullProbGrid(ac, bf).replace(/margin-top:3px/, 'margin-top:2px');
};

NX.renderStageCart = function () {
  const { esc, state, store, baseFlag, allowedFlags, detectConflicts, renderPreviewTT } = NX;
  const { stageCart, allCourses } = state;
  const $ = state.$;
  const el = $('nextthuxk-stage-list');
  if (!el) return;
  if (!stageCart.length) { el.innerHTML = '<div class="nx-st">暂无暂存课程，点击课程卡片上的「暂存」按钮添加</div>'; $('nextthuxk-stage-conflict').innerHTML = ''; return; }
  el.innerHTML = stageCart.map((c, i) => {
    const bf = c.baseFlag || (() => { const ac = NX.courseForStage(c); return ac ? baseFlag(ac) : 'rx'; })();
    const aFlags = allowedFlags(bf);
    if (!aFlags.includes(c.flag)) { c.flag = aFlags[0]; store.set('stageCart', stageCart); }
    const flOpts = aFlags.map(f => '<option value="' + f + '"' + (c.flag === f ? ' selected' : '') + '>' + (f === 'bx' ? '必修' : f === 'xx' ? '限选' : f === 'rx' ? '任选' : '体育') + '</option>').join('');
    const zyOpts = [1, 2, 3].map(z => '<option value="' + z + '"' + (c.zy === z ? ' selected' : '') + '>' + z + '志愿</option>').join('');
    const prob = NX.stageProbHtml(c);
    return '<div class="nx-stage-item" style="flex-direction:column;align-items:stretch;gap:2px">' +
      '<div style="display:flex;align-items:center;gap:4px">' +
      '<span class="nx-stage-name nx-jumpable" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-teacher="' + esc(c.teacher || '') + '" title="点击按课号搜索此课程" style="min-width:80px;cursor:pointer">' + esc(c.name) + (c.teacher ? ' <span style="color:#9aa1ac;font-weight:400">' + esc(c.teacher) + '</span>' : '') + '</span>' +
      '<span class="nx-stage-info">' + c.credits + '学分</span>' +
      '<select class="nx-stage-flag-sel" data-idx="' + i + '" style="padding:2px 4px;border-radius:6px;border:1px solid rgba(0,0,0,.1);font-size:10px;font-family:inherit;background:#fff;cursor:pointer">' + flOpts + '</select>' +
      '<select class="nx-stage-zy-sel" data-idx="' + i + '" style="padding:2px 4px;border-radius:6px;border:1px solid rgba(0,0,0,.1);font-size:10px;font-family:inherit;background:#fff;cursor:pointer">' + zyOpts + '</select>' +
      '<button class="nx-stage-rm" data-idx="' + i + '">✕</button></div>' + prob + '</div>';
  }).join('');
  // 暂存课名点击 → 课号注入搜索栏并按课号精确搜索（OneTHU jumpTo 语义）
  el.querySelectorAll('.nx-jumpable').forEach(item => {
    item.onclick = ev => { ev.stopPropagation(); NX.jumpToCourse(item.dataset.code, item.dataset.seq, item.dataset.teacher); };
  });
  el.querySelectorAll('.nx-stage-flag-sel').forEach(sel => {
    sel.onchange = () => {
      const i = parseInt(sel.dataset.idx);
      stageCart[i].flag = sel.value;
      store.set('stageCart', stageCart);
      NX.renderStageCart();
      if (state.previewMode === 'stage') renderPreviewTT(stageCart, $('nextthuxk-preview-info')?.textContent || '');
    };
  });
  el.querySelectorAll('.nx-stage-zy-sel').forEach(sel => {
    sel.onchange = () => {
      const i = parseInt(sel.dataset.idx);
      stageCart[i].zy = parseInt(sel.value);
      store.set('stageCart', stageCart);
      NX.renderStageCart();
      if (state.previewMode === 'stage') renderPreviewTT(stageCart, $('nextthuxk-preview-info')?.textContent || '');
    };
  });
  el.querySelectorAll('.nx-stage-rm').forEach(btn => {
    btn.onclick = () => NX.removeFromStage(parseInt(btn.dataset.idx));
  });
  const cf = $('nextthuxk-stage-conflict');
  if (cf) {
    const conflicts = detectConflicts(stageCart);
    if (conflicts.length) {
      cf.innerHTML = conflicts.map(c =>
        '<div style="font-size:11px;color:#ee4d4d">时间冲突：' + esc(c.day) + ' ' + esc(c.slot) + ' — ' + esc(c.a) + ' 与 ' + esc(c.b) + '</div>'
      ).join('');
    } else cf.innerHTML = '<div style="font-size:11px;color:#07c160">✓ 无时间冲突</div>';
  }
  NX.scheduleProbBackfill();
};

// ─── 暂存/草稿概率自动回填（#33 跟进：概率不再要用户点一下才出现）──────────
// 池里查不到的暂存/草稿课 → 按课号静默爬全量合并进池（同课号页数少，压力小，
// 用户定案）；每课号每会话 2 次封顶；与查询管线互斥（跑动中延后，防把全量盖回去）。
NX.scheduleProbBackfill = function () {
  clearTimeout(NX._probBfTimer);
  NX._probBfTimer = setTimeout(() => { NX._probBfTimer = null; NX.backfillStageProbs().catch(e => console.warn(NX.TAG, 'prob backfill:', e)); }, 700);
};
NX.backfillStageProbs = async function () {
  const state = NX.state;
  if (state.isQueuePhase) return;   // 排队阶段概率来自 queueDataMap，不吃池
  if (state._loadingAll || state._ssBusy) {
    state._probBfDeferred = (state._probBfDeferred || 0) + 1;
    if (state._probBfDeferred < 20) NX.scheduleProbBackfill();
    return;
  }
  state._probBfDeferred = 0;
  const tried = state._probBfTried || (state._probBfTried = new Map());
  const items = [];
  (state.stageCart || []).forEach(c => { if (!c.manual) items.push(c); });
  (state.savedDrafts || []).forEach(d => (d.courses || []).forEach(c => { if (!c.manual) items.push(c); }));
  const seen = new Set();
  const need = [];
  for (const c of items) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    if (NX.courseForStage(c)) continue;           // 池里已有（精确/教师/唯一兜底命中）
    if ((tried.get(c.code) || 0) >= 2) continue;  // 两次封顶（失败多为会话问题，不刷屏）
    need.push(c.code);
  }
  if (!need.length) return;
  need.forEach(cd => tried.set(cd, (tried.get(cd) || 0) + 1));
  for (const cd of need) {
    try {
      const res = await NX.serverSearchStorm({ kch: cd, forceAll: true });
      const rows = res.rows || [];
      if (rows.length && NX.mergeServerRows(rows)) NX.rebuildCourseMap();
    } catch (e) { console.warn(NX.TAG, 'prob backfill crawl', cd, e); }
  }
  NX.renderStageCart();
  NX.renderDrafts();
  if (state.previewMode === 'stage' || state.previewMode === 'draft') {
    try { NX.invalidatePreview(); NX.renderPreviewTT(NX.getPreviewCourses(), (state.$('nextthuxk-preview-info') || {}).textContent || ''); } catch (e) {}
  }
  // 仍有缺口（多个课号分轮补）→ 续跑
  if (items.some(c => !c.manual && !NX.courseForStage(c) && (tried.get(c.code) || 0) < 2)) NX.scheduleProbBackfill();
};

// ─── Drafts Rendering ─────────────────────────────────────────

NX.draftCourseProbHtml = function (c) {
  const { state, fullProbGrid, baseFlag, getCourse } = NX;
  const { isQueuePhase, queueDataMap } = state;
  const ac = getCourse(c.code, c.seq);
  if (!ac) return '';
  if (isQueuePhase) {
    const qKey = c.code + '_' + NX.normSeq(c.seq);
    const qd = queueDataMap[qKey];
    if (qd) {
      const rc = qd.qRemaining > 0 ? '#07c160' : '#ee4d4d';
      return '<div style="margin-top:2px;display:flex;gap:4px;align-items:center;flex-wrap:wrap"><span style="background:rgba(' + (qd.qRemaining > 0 ? '52,199,89' : '255,59,48') + ',.12);color:' + rc + ';padding:1px 8px;border-radius:8px;font-size:10px;font-weight:600">余' + qd.qRemaining + '/' + qd.qCapacity + '</span>' + (qd.qQueue > 0 ? '<span style="background:rgba(255,159,26,.12);color:#ff9f1a;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:600">排队' + qd.qQueue + '人</span>' : '') + '</div>';
    }
    return '';
  }
  const bf = c.baseFlag || baseFlag(ac);
  return fullProbGrid(ac, bf).replace(/margin-top:3px/, 'margin-top:2px');
};

NX.renderDrafts = function () {
  const { esc, state, store, baseFlag, allowedFlags, renderPreviewTT, promoteDraft, deleteDraft, exportDraft } = NX;
  const { savedDrafts, allCourses } = state;
  const $ = state.$;
  const el = $('nextthuxk-drafts');
  if (!el) return;
  if (!savedDrafts.length) { el.innerHTML = ''; return; }
  const { expandedDraft } = state;
  el.innerHTML = savedDrafts.map((d, di) => {
    const cr = d.courses.reduce((s, c) => s + (c.credits || 0), 0);
    const dt = new Date(d.createdAt);
    const exp = expandedDraft === di;
    let courseList = '';
    if (exp && d.courses.length) {
      courseList = '<div class="nx-draft-courses" style="margin-top:6px;border-top:1px solid rgba(0,0,0,.06);padding-top:6px">';
      d.courses.forEach((c, ci) => {
        const bf = c.baseFlag || (() => { const ac = NX.courseForStage(c); return ac ? baseFlag(ac) : 'rx'; })();
        const aFlags = allowedFlags(bf);
        if (!aFlags.includes(c.flag)) { c.flag = aFlags[0]; store.set('drafts', savedDrafts); }
        const flOpts = aFlags.map(f => '<option value="' + f + '"' + (c.flag === f ? ' selected' : '') + '>' + (f === 'bx' ? '必修' : f === 'xx' ? '限选' : f === 'rx' ? '任选' : '体育') + '</option>').join('');
        const zyOpts = [1, 2, 3].map(z => '<option value="' + z + '"' + (c.zy === z ? ' selected' : '') + '>' + z + '志愿</option>').join('');
        const prob = NX.draftCourseProbHtml(c);
        courseList += '<div style="display:flex;align-items:center;gap:4px;padding:3px 0;font-size:11px;border-bottom:1px solid rgba(0,0,0,.03)">' +
          '<span class="nx-jumpable" data-code="' + esc(c.code) + '" data-seq="' + esc(c.seq || '0') + '" data-teacher="' + esc(c.teacher || '') + '" title="点击按课号搜索此课程" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:#1f2329;cursor:pointer">' + esc(c.name) + '</span>' +
          '<span style="font-size:10px;color:#9aa1ac">' + c.credits + '学分</span>' +
          '<select class="nx-draft-flag" data-di="' + di + '" data-ci="' + ci + '" style="padding:1px 3px;border-radius:5px;border:1px solid rgba(0,0,0,.1);font-size:10px;font-family:inherit;background:#fff;cursor:pointer">' + flOpts + '</select>' +
          '<select class="nx-draft-zy" data-di="' + di + '" data-ci="' + ci + '" style="padding:1px 3px;border-radius:5px;border:1px solid rgba(0,0,0,.1);font-size:10px;font-family:inherit;background:#fff;cursor:pointer">' + zyOpts + '</select>' +
          prob +
          '<button class="nx-draft-crm" data-di="' + di + '" data-ci="' + ci + '" style="width:16px;height:16px;border-radius:8px;border:none;background:rgba(238,77,77,.1);color:#ee4d4d;font-size:9px;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center">✕</button></div>';
      });
      courseList += '</div>';
    }
    const expIcon = exp ? '▼' : '▶';
    return '<div class="nx-draft-card"><div class="nx-draft-head"><span class="nx-draft-name" style="cursor:pointer" data-toggle="' + di + '">' + expIcon + ' ' + esc(d.name) + '</span><span class="nx-draft-info">' + d.courses.length + '门 · ' + cr + '学分 · ' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</span></div><div class="nx-draft-acts"><button class="nx-draft-view" data-idx="' + di + '">预览 & 修改</button><button class="nx-draft-go" data-idx="' + di + '">提交选课</button><button class="nx-draft-export" data-idx="' + di + '">导出</button><button class="nx-draft-del" data-idx="' + di + '">删除</button></div>' + courseList + '</div>';
  }).join('');
  el.querySelectorAll('[data-toggle]').forEach(span => {
    span.onclick = () => {
      const idx = parseInt(span.dataset.toggle);
      state.expandedDraft = expandedDraft === idx ? -1 : idx;
      NX.renderDrafts();
    };
  });
  // 草稿课名点击 → 课号注入搜索栏并按课号精确搜索（OneTHU jumpTo 语义）
  el.querySelectorAll('.nx-jumpable').forEach(item => {
    item.onclick = ev => { ev.stopPropagation(); NX.jumpToCourse(item.dataset.code, item.dataset.seq, item.dataset.teacher); };
  });
  el.querySelectorAll('.nx-draft-flag').forEach(sel => {
    sel.onchange = () => {
      const di = parseInt(sel.dataset.di), ci = parseInt(sel.dataset.ci);
      savedDrafts[di].courses[ci].flag = sel.value;
      store.set('drafts', savedDrafts);
      NX.renderDrafts();
      if (state.previewMode === 'draft' && state.previewDraftIdx === di) renderPreviewTT(savedDrafts[di].courses, '草稿「' + savedDrafts[di].name + '」预览');
    };
  });
  el.querySelectorAll('.nx-draft-zy').forEach(sel => {
    sel.onchange = () => {
      const di = parseInt(sel.dataset.di), ci = parseInt(sel.dataset.ci);
      savedDrafts[di].courses[ci].zy = parseInt(sel.value);
      store.set('drafts', savedDrafts);
      NX.renderDrafts();
      if (state.previewMode === 'draft' && state.previewDraftIdx === di) renderPreviewTT(savedDrafts[di].courses, '草稿「' + savedDrafts[di].name + '」预览');
    };
  });
  el.querySelectorAll('.nx-draft-crm').forEach(btn => {
    btn.onclick = () => {
      const di = parseInt(btn.dataset.di), ci = parseInt(btn.dataset.ci);
      const name = savedDrafts[di].courses[ci].name;
      if (!confirm('从草稿移除「' + name + '」？')) return;
      savedDrafts[di].courses.splice(ci, 1);
      NX.invalidatePreview();
      store.set('drafts', savedDrafts);
      NX.renderDrafts();
      if (state.previewMode === 'draft' && state.previewDraftIdx === di) renderPreviewTT(savedDrafts[di].courses, '草稿「' + savedDrafts[di].name + '」预览');
    };
  });
  el.querySelectorAll('.nx-draft-view').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      const d = savedDrafts[idx];
      if (d) { state.previewDraftIdx = idx; renderPreviewTT(d.courses, '草稿「' + d.name + '」预览'); }
    };
  });
  el.querySelectorAll('.nx-draft-go').forEach(btn => {
    btn.onclick = () => {
      const d = savedDrafts[parseInt(btn.dataset.idx)];
      if (!d) return;
      if (!confirm('确定提交「' + d.name + '」？\n将先退选所有已选课程，再选入该草稿中的 ' + d.courses.length + ' 门课程。')) return;
      promoteDraft(d);
    };
  });
  el.querySelectorAll('.nx-draft-del').forEach(btn => {
    btn.onclick = () => deleteDraft(parseInt(btn.dataset.idx));
  });
  el.querySelectorAll('.nx-draft-export').forEach(btn => {
    btn.onclick = () => {
      const d = savedDrafts[parseInt(btn.dataset.idx)];
      if (d) exportDraft(d);
    };
  });
  NX.scheduleProbBackfill();
  };

// ─── Course Detail Modal ──────────────────────────────────────

NX.showCourseModal = async function (code, teacherId) {
  const { esc, state, fetchCourseDetail } = NX;
  const $ = state.$;
  const mask = $('nextthuxk-modal');
  const title = $('nextthuxk-modal-title');
  const body = $('nextthuxk-modal-body');
  const c = state.allCourses.find(x => x.code === code);
  title.textContent = c ? c.name + '（' + code + '）' : code;
  body.innerHTML = '<div class="nx-modal-loading"><span class="nx-spin"></span> 正在加载课程简介…</div>';
  mask.classList.add('show');
  const fields = await fetchCourseDetail(teacherId, code);
  if (!fields || !Object.keys(fields).length) {
    body.innerHTML = '<div class="nx-modal-loading">暂无课程简介信息</div>';
    return;
  }
  const order = ['课程编号','课程名称','总学时数','总学分','课程内容简介','Course Description','考核安排','联系人','教材及参考书','上课教师','选课指导语','先修要求','教师教学特色','Office Hour','成绩评定标准','参考书'];
  let html = '';
  for (const key of order) {
    if (fields[key] && fields[key].length > 0) {
      html += '<div class="nx-modal-row"><div class="nx-modal-label">' + esc(key) + '</div><div class="nx-modal-val">' + esc(fields[key]) + '</div></div>';
    }
  }
  for (const [k, v] of Object.entries(fields)) {
    if (!order.includes(k) && v && v.length > 0) {
      html += '<div class="nx-modal-row"><div class="nx-modal-label">' + esc(k) + '</div><div class="nx-modal-val">' + esc(v) + '</div></div>';
    }
  }
  body.innerHTML = html || '<div class="nx-modal-loading">暂无信息</div>';
};

// ─── Plan Coverage ────────────────────────────────────────────

NX.checkPlanCoverage = function () {
  const { state } = NX;
  const { allCourses, stageCart, savedDrafts, planData } = state;
  const codes = new Set();
  const detail = {};
  const collect = (list) => list.forEach(c => {
    codes.add(c.code);
    if (!detail[c.code]) detail[c.code] = c;
  });
  collect(allCourses.filter(c => c.selected));
  collect(stageCart);
  savedDrafts.forEach(d => collect(d.courses));
  // 行解析：池内行优先，暂存/草稿自带行兜底（暂存项可能不在 allCourses）。
  // 此前本地弱判据只查 department/attr——学生已选体育课但搜索行属性稀疏
  // （attr/department 空）时 hasSports 恒 false → 体育必修 0/1，而左栏旧渲染
  // 还是 1/1（左旧右新同时上屏，用户实录）。统一走 NX.isSportsCourse 判据
  // （排除表+attr/typeLabel/typeCode+院系），暂存/草稿自带 flag=ty 也认。
  const rowOf = (code) => allCourses.find(x => x.code === code) || detail[code] || null;
  const isSports = (code) => {
    const c = rowOf(code);
    if (!c) return false;
    if ((c.flag || '') === 'ty') return true;
    return NX.isSportsCourse(c);
  };
  const hasSports = [...codes].some(isSports) || stageCart.some(c => isSports(c.code));
  const isSecondLang = (code) => { const c = rowOf(code); return !!c && ((c.name || '').includes('第二外国语') || (c.name || '').includes('二外')); };
  const hasSecondLang = [...codes].some(isSecondLang) || stageCart.some(c => isSecondLang(c.code));
  const isAdvEnglish = (code) => { const c = rowOf(code); return !!c && ((c.name || '').includes('进阶读写') || (c.name || '').includes('进阶')); };
  const hasAdvEnglish = [...codes].some(isAdvEnglish) || stageCart.some(c => isAdvEnglish(c.code));
  const isBasicEnglish = (code) => { const c = rowOf(code); return !!c && ((c.name || '').includes('阅读写作') || (c.name || '').includes('听说交流')); };

  return planData.map(p => {
    let covered = codes.has(p.code);
    let coveredBy = covered && detail[p.code] ? (detail[p.code].teacher || detail[p.code].name) : '';
    if (!covered && (p.attr === '体育' || p.name.includes('体育') || (p.group || '').includes('体育'))) {
      if (hasSports) { covered = true; coveredBy = '(已有体育课)'; }
    }
    if (!covered && /英语\(3\)/.test(p.name)) {
      if (hasAdvEnglish) { covered = true; coveredBy = '(英语进阶读写)'; }
      else if (hasSecondLang) { covered = true; coveredBy = '(第二外国语替代)'; }
    }
    if (!covered && /英语\([12]\)/.test(p.name)) {
      if ([...codes].some(code => isBasicEnglish(code)) || stageCart.some(c => isBasicEnglish(c.code))) { covered = true; coveredBy = '(英语阅读写作/听说交流)'; }
    }
    return { ...p, covered, coveredBy };
  });
};

NX.renderPlanView = function (searchQuery) {
  const { esc, state } = NX;
  const $ = state.$;
  const el = $('nextthuxk-list');
  const { planData } = state;
  if (!planData.length) { el.innerHTML = '<div class="nx-empty">暂无培养方案数据</div>'; return; }
  const coverage = NX.checkPlanCoverage();
  let filtered = coverage;
  if (searchQuery) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery) || p.code.includes(searchQuery) || (p.attr || '').includes(searchQuery));
  }
  const groups = {};
  filtered.forEach(p => { const g = p.group || p.attr || '其他'; if (!groups[g]) groups[g] = []; groups[g].push(p); });
  const totalCr = coverage.reduce((s, c) => s + c.credits, 0);
  const coveredCr = coverage.filter(c => c.covered).reduce((s, c) => s + c.credits, 0);
  const coveredN = coverage.filter(c => c.covered).length;
  let html = '<div style="margin-bottom:14px;padding:12px 16px;border-radius:12px;background:var(--nx-glass);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 0 0 0 1px var(--nx-line);font-size:13px">' +
    '<strong>培养方案进度</strong>: ' + coveredN + '/' + coverage.length + '门 · ' + coveredCr + '/' + totalCr + '学分' +
    '<div style="margin-top:6px;height:6px;background:rgba(0,0,0,.06);border-radius:3px;overflow:hidden">' +
    '<div style="height:100%;width:' + (totalCr ? Math.round(coveredCr / totalCr * 100) : 0) + '%;background:var(--nx-accent);border-radius:3px"></div></div></div>';
  for (const [groupName, courses] of Object.entries(groups)) {
    const gTotal = courses.reduce((s, c) => s + c.credits, 0);
    const gCovered = courses.filter(c => c.covered).reduce((s, c) => s + c.credits, 0);
    html += '<div style="margin-bottom:14px"><div style="font-size:13px;font-weight:700;color:#1f2329;margin-bottom:6px;padding:5px 12px;background:rgba(29,31,36,.05);border-radius:8px;display:flex;justify-content:space-between"><span>' + esc(groupName) + '</span><span style="font-size:11px;font-weight:400;color:' + (gCovered >= gTotal ? '#07c160' : '#9aa1ac') + '">' + gCovered + '/' + gTotal + '学分</span></div>';
    courses.forEach(p => {
      const icon = p.covered ? '✓' : '✗';
      const bg = p.covered ? 'rgba(7,193,96,.06)' : 'rgba(238,77,77,.04)';
      const statusHtml = p.covered
        ? '<span style="color:#07c160;font-size:11px;white-space:nowrap">' + esc(p.coveredBy || '已满足') + '</span>'
        : '<span style="color:#ee4d4d;font-size:11px">未满足</span>';
      html += '<div class="nx-stage-item nx-jumpable" style="background:' + bg + ';gap:8px;cursor:pointer" data-code="' + esc(p.code) + '" title="点击按课号搜索此课程"><span style="font-size:12px">' + icon + '</span><span class="nx-stage-name">' + esc(p.name) + ' <span style="color:#9aa1ac;font-size:10px">' + p.code + '</span></span><span class="nx-stage-info">' + p.credits + '学分</span>' + statusHtml + '</div>';
    });
    html += '</div>';
  }
  el.innerHTML = html;
  // 左栏卡与右栏视图同刻刷新（两处都出自 checkPlanCoverage，但渲染时机
  // 不同会各拿各的快照——用户实录左 1/1 右 0/1 同屏）
  try { NX.renderPlan(state.planData); } catch (e) {}
  // 条目点击 → 课号注入搜索栏并按课号精确搜索（OneTHU jumpTo 语义）
  el.querySelectorAll('.nx-jumpable').forEach(item => {
    item.onclick = () => NX.jumpToCourse(item.dataset.code, '0');
  });
};

NX.renderPlan = function (plan) {
  const { esc, state, checkPlanCoverage } = NX;
  const $ = state.$;
  const el = $('nextthuxk-plan');
  const coverage = checkPlanCoverage();
  const groups = {};
  coverage.forEach(c => { const g = c.group || c.attr || '其他'; if (!groups[g]) groups[g] = []; groups[g].push(c); });
  el.innerHTML = Object.entries(groups).map(([name, items]) => {
    const cr = items.reduce((s, c) => s + c.credits, 0);
    const cov = items.filter(c => c.covered).reduce((s, c) => s + c.credits, 0);
    return '<div class="nx-plan-card" data-g="' + esc(name) + '" title="点击在培养方案视图查看本组"><div class="nx-plan-num">' + cov + '<small style="font-size:12px;font-weight:400;color:#9aa1ac">/' + cr + '学分</small></div><div class="nx-plan-lbl">' + esc(name) + ' (' + items.length + '门)</div></div>';
  }).join('');
  const detail = $('nextthuxk-plan-detail');
  const total = coverage.reduce((s, c) => s + c.credits, 0);
  const totalCov = coverage.filter(c => c.covered).reduce((s, c) => s + c.credits, 0);
  if (detail) detail.textContent = '共 ' + coverage.length + ' 门，' + totalCov + '/' + total + ' 学分已覆盖';
  // 右栏卡片点击 → 切培养方案视图（OneTHU 同款修复：此前点击静默无效）
  el.querySelectorAll('.nx-plan-card').forEach(card => {
    card.onclick = () => {
      const planChip = state.shadow.querySelector('.nx-chip[data-f="plan"]');
      if (planChip) planChip.click();
    };
  });
};

// ─── Filters ──────────────────────────────────────────────────

// ─── 列表过滤 v2（xk-1.5.1 随时查询，OneTHU dev 同款架构）──────────
// 启动绝不整库预爬（原版 320 页目录 + 220 页志愿 ≈ 500+ 请求已删）：
// 搜索一律服务器 kkxxSearch 随时查（GBK+风暴护栏）；已选/我的队列走本地
// 核心池；浏览模式（空关键词）一页一请求翻页，绝不连发。
NX.filterCourses = function () {
  const { state, renderCourses, renderPlanView, lc, esc } = NX;
  const $ = state.$;
  const { allCourses, candidateCourses, activeGroup } = state;
  const rawQ = $('nextthuxk-search').value;
  const q = rawQ.toLowerCase();   // 用户输入不入缓存（中间态多），课程字段才走 lc
  NX.updateSearchClear();
  const f = state.shadow.querySelector('.nx-chip.on')?.dataset.f || 'all';
  if (f === 'plan') { renderPlanView(q); return; }

  // —— 服务端条件指纹：这些变化 = 换一次服务器查询（OneTHU newSearch 语义）。
  //    注意 f（chip）不入指纹：必修/限选/体育/可选/已选/队列全是本地过滤
  //    （教务无对应参数），chip 切换即时生效不重查（v1.5.0 语义）。
  //    conflict/credits/reviews/sort/xknote 同样只本地细化。
  const serverSig = JSON.stringify([
    rawQ.trim(), state.SEM, state._browsePage || 1,
    $('nx-filter-tongshi')?.value || '', $('nx-filter-feature')?.value || '',
    $('nx-filter-grade-filter')?.value || '', $('nx-filter-bksrem')?.value || '',
    $('nx-filter-yjsrem')?.value || '', $('nx-filter-day')?.value || '',
    $('nx-filter-period')?.value || '',
  ]);
  const sigChanged = serverSig !== state._serverSig;
  state._serverSig = serverSig;
  // 必修/限选/体育也是本地池过滤（用户二十二报：v1.5.0 语义——chip 过滤
  // 课程池而非当前搜索行；搜索行是浏览快照，attr 覆盖稀疏，滤完必空）
  const localChip = f === 'selected' || f === 'queue' || f === 'required' || f === 'elective' || f === 'sports';

  let list;
  if (localChip) {
    list = allCourses;
    if (f === 'selected') {
      const seen = new Set();
      const candKeys = new Set(candidateCourses.map(c => c.code + '_' + (c.seq || '0')));
      list = list.filter(c => {
        if (!c.selected && !c.isCandidate && !candKeys.has(c.code + '_' + (c.seq || '0'))) return false;
        const k = c.code + '_' + (c.seq || '0');
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    } else if (f === 'queue') {
      const qKeys = new Set(candidateCourses.map(c => c.code + '_' + (c.seq || '0')));
      list = list.filter(c => qKeys.has(c.code + '_' + (c.seq || '0')));
    }
    // required/elective/sports：list 已是全池，走下面统一 chip 过滤
  } else {
    // —— 服务器随时查询路径：条件变了 → 调度查询 + 查询中提示（旧条件结果作废）
    if (sigChanged) {
      state._searchRows = null;
      state._uiPage = 1;   // 新查询回第 1 页（OneTHU searchRunId 同款）
      NX.scheduleServerSearch();
      const listEl = $('nextthuxk-list');
      if (listEl) {
        listEl.innerHTML = '<div class="nx-empty"><span class="nx-spin"></span>&ensp;正在查询教务（服务器精确匹配 · 随时查询模式）…</div>';
        return;
      }
    }
    list = state._searchRows || [];
    // 查询异常显式上屏（不再静默空白）：unknown 页 / 网络失败带原因 + 重试
    if (!list.length && state._searchError) {
      const listEl2 = $('nextthuxk-list');
      if (listEl2) {
        listEl2.innerHTML = '<div class="nx-empty nx-st err">' + esc(state._searchError) + '</div>' +
          '<div style="text-align:center;padding:6px 0 2px"><button type="button" class="nx-stage-btn" id="nx-retry-search">重试</button></div>';
        const rb = listEl2.querySelector('#nx-retry-search');
        if (rb) rb.onclick = () => { state._serverSig = null; NX.filterCourses(); NX.scheduleServerSearch(true); };
        return;
      }
    }
  }
  // 恒全量的只有已选/队列（OneTHU listRows 语义：跳转残留的课号/关键词
  // 绝不能把队列视图清空）；必修/限选/体育池内 q 过滤照常（v1.5.0 同款）
  const noQChip = f === 'selected' || f === 'queue';
  if (q && !noQChip) list = list.filter(c => lc(c.name).includes(q) || c.code.toLowerCase().includes(q) || lc(c.teacher).includes(q));
  if (f === 'available') list = list.filter(c => c.available);
  else if (f === 'required') list = list.filter(c => c.attr === '必修' || c.typeLabel === '必修');
  else if (f === 'elective') list = list.filter(c => c.attr === '限选' || c.typeLabel === '限选');
  else if (f === 'sports') list = list.filter(c => NX.isSportsCourse(c));
  if (activeGroup) list = list.filter(c => (c.group || c.attr) === activeGroup);
  const cf = $('nx-filter-credits')?.value;
  if (cf) {
    if (cf === '5+') list = list.filter(c => c.credits >= 5);
    else list = list.filter(c => c.credits === parseInt(cf));
  }
  const df = $('nx-filter-day')?.value;
  const pf = $('nx-filter-period')?.value;
  if (df || pf) {
    // 正则预编译（原实现在 filter 回调内每门课 new RegExp，6000 次对象创建）
    const bothRe = df && pf ? new RegExp(df + '-' + pf + '\\(') : null;
    const dayRe = df ? new RegExp(df + '-\\d') : null;
    const periodRe = pf ? new RegExp('\\d+-' + pf + '\\(') : null;
    list = list.filter(c => {
      if (!c.time) return false;
      if (bothRe) return bothRe.test(c.time);
      if (dayRe) return dayRe.test(c.time);
      return periodRe.test(c.time);
    });
  }
  const cf2 = $('nx-filter-conflict')?.value;
  if (cf2) {
    list = list.filter(c => {
      const conflicts = NX.findPreviewConflicts(c);
      return cf2 === 'noconflict' ? conflicts.length === 0 : conflicts.length > 0;
    });
  }
  const tsVal = $('nx-filter-tongshi')?.value;
  if (tsVal) {
    const tsMap = { TS1: '人文课组', TS2: '社科课组', TS3: '艺术课组', TS4: '科学课组' };
    list = list.filter(c => (c.tongshiGroup || '').includes(tsMap[tsVal] || ''));
  }
  const featVal = $('nx-filter-feature')?.value;
  if (featVal) list = list.filter(c => (c.courseFeature || '').includes(featVal));
  const gradeVal = $('nx-filter-grade-filter')?.value;
  if (gradeVal) list = list.filter(c => (c.grade || '').includes(gradeVal));
  const bksVal = $('nx-filter-bksrem')?.value;
  if (bksVal === '>0') list = list.filter(c => (c.remaining || 0) > 0);
  const yjsVal = $('nx-filter-yjsrem')?.value;
  if (yjsVal === '>0') list = list.filter(c => (c.gradRemaining || 0) > 0);
  const xkNote = ($('nx-filter-xknote')?.value || '').trim().toLowerCase();
  if (xkNote) list = list.filter(c => lc(c.xkTextNote).includes(xkNote));
  // ─── 社区评价筛选（thubook）───
  const rv = $('nx-filter-reviews')?.value;
  if (rv) {
    const ok = c => {
      const t = c._tbRef;
      if (!t || !t.count) return false;
      if (rv === 'has') return true;
      if (rv === 'cnt5') return t.count >= 5;
      if (rv === 'r45') return t.avg >= 4.5;
      if (rv === 'r40') return t.avg >= 4;
      if (rv === 'low') return t.avg <= 3;
      return true;
    };
    list = list.filter(ok);
  }
  // ─── 排序（复制数组，绝不动 allCourses 本体顺序）───
  const sortBy = $('nx-sort-by')?.value;
  if (sortBy && list.length > 1) {
    list = list.slice().sort((a, b) => {
      const ta = a._tbRef && a._tbRef.count ? a._tbRef : null;
      const tb = b._tbRef && b._tbRef.count ? b._tbRef : null;
      const av = ta ? ta.avg : null, bv = tb ? tb.avg : null;   // 无点评恒排末尾
      const ca = ta ? ta.count : -1, cb = tb ? tb.count : -1;
      if (sortBy === 'rate_desc') return bv == null ? -1 : av == null ? 1 : (bv - av) || (cb - ca);
      if (sortBy === 'rate_asc') return bv == null ? 1 : av == null ? -1 : (av - bv) || (ca - cb);
      if (sortBy === 'cnt_desc') return cb - ca;
      return 0;
    });
  }
  // —— 分页（OneTHU 教务同款）：浏览模式 = 服务端翻页（一页一请求）；
  //    搜索模式 = 本地翻页（已加载池在手，翻页零请求），总页数/总数用
  //    服务端真值，未加载尾部页有不完整提示条 + 加载全部入口。
  const so = NX.buildSearchOpts();
  const searchMode = !localChip && !!(so.kch || so.kcm || so.weekday || so.section || so.grade
    || so.rxklxm || so.kctsm || so.onlyAvailable || so.gradAvail);
  let show = list;
  if (searchMode) {
    // 页码钳到筛选后实际页数（本地筛掉行后第N页可能越界出空页）
    const totalPages = state._searchTotalPages || Math.max(1, Math.ceil(list.length / NX.PAGE_SIZE));
    const page = Math.min(Math.max(1, state._uiPage || 1), Math.max(1, Math.ceil(list.length / NX.PAGE_SIZE)));
    state._uiPage = page;
    show = list.slice((page - 1) * NX.PAGE_SIZE, page * NX.PAGE_SIZE);
  }
  renderCourses(show);
  NX.renderListFooter({ localChip, searchMode, list, show });
};

NX.PAGE_SIZE = 20;   // OneTHU 同款每页条数

// 底部分页条 + 搜索结果捕捉（OneTHU 同款）：第N页/共M页（共K条记录）、
// 上一页/下一页、跳至 GO、数据不完整提示 + 「加载当前关键词全部」。
NX.renderListFooter = function (o) {
  const { state } = NX;
  const $ = state.$;
  const listEl = $('nextthuxk-list');
  if (!listEl || o.localChip || !o.list.length) return;
  // 搜索模式翻到未加载的尾部页（OneTHU 同款提示；服务端总页数 > 本地已加载）
  if (o.searchMode && !o.show.length) {
    listEl.innerHTML = '<div class="nx-empty">此页未加载——点下方「加载当前关键词全部」后可查看</div>';
  }
  const mkBtn = (label, dis, onclick) => {
    const b = document.createElement('button');
    b.className = 'nx-stage-btn';
    b.textContent = label;
    b.disabled = !!dis;
    b.onclick = onclick;
    return b;
  };
  // 数据不完整提示（OneTHU 同款）：宽泛词只探测了前几页 → 显式补齐入口
  if (o.searchMode && state._searchIncomplete && !state._jumpCrawling) {
    const html = '<div class="nx-st" style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;padding:8px 0 2px;font-size:11px;color:#b8860b">' +
      '数据不完整：已加载 ' + o.list.length + ' 门' +
      (state._searchTotalPages > 0 ? '，教务共 ' + state._searchTotalPages + ' 页' : '') +
      (state._searchTotalRows > 0 ? '（共 ' + state._searchTotalRows + ' 门）' : '') +
      '<button type="button" class="nx-stage-btn nx-loadall" style="margin-left:6px"' + (state._loadingAll ? ' disabled' : '') + '>' +
      (state._loadingAll ? '加载中…' : '加载当前关键词全部') + '</button></div>';
    listEl.insertAdjacentHTML('afterbegin', html);
    const lb = listEl.querySelector('.nx-loadall');
    if (lb) lb.onclick = () => NX.loadAllSearch();
  }
  const pager = document.createElement('div');
  pager.style.cssText = 'display:flex;gap:8px;justify-content:center;align-items:center;padding:10px 0 4px;flex-wrap:wrap';
  const cur = document.createElement('span');
  cur.style.cssText = 'align-self:center;font-size:11px;color:var(--nx-faint)';
  const goInput = document.createElement('input');
  goInput.className = 'nx-inp';
  goInput.style.cssText = 'width:52px;padding:2px 4px;font-size:11px;text-align:center';
  goInput.placeholder = '页码';
  let gotoPage, totalPages, curPage, nextDis;
  if (o.searchMode) {
    // 本地筛选（冲突/学分/文字说明/可选 chip/课组）生效时：显示满足全部
    // 条件的已加载页数+条数（用户三十六报：不再挂关键词 alone 的教务总数）
    const fNow = state.shadow.querySelector('.nx-chip.on')?.dataset.f || 'all';
    const clientFiltered = fNow === 'available' || $('nx-filter-conflict')?.value
      || $('nx-filter-credits')?.value || ($('nx-filter-xknote')?.value || '').trim()
      || state.activeGroup;
    if (clientFiltered) {
      totalPages = Math.max(1, Math.ceil(o.list.length / NX.PAGE_SIZE));
      curPage = Math.min(Math.max(1, state._uiPage || 1), totalPages);
      gotoPage = n => { state._uiPage = Math.min(n, totalPages); NX.filterCourses(); };
      nextDis = curPage >= totalPages;
      cur.textContent = '第 ' + curPage + ' 页 / 共 ' + totalPages + ' 页（当前条件 ' + o.list.length + ' 条）';
    } else {
      totalPages = state._searchTotalPages || Math.max(1, Math.ceil(o.list.length / NX.PAGE_SIZE));
      curPage = Math.min(Math.max(1, state._uiPage || 1), totalPages);
      gotoPage = n => { state._uiPage = n; NX.loadSearchPageTo(n); NX.filterCourses(); };
      nextDis = curPage >= totalPages;
      cur.textContent = '第 ' + curPage + ' 页 / 共 ' + totalPages + ' 页' +
        (!state._searchIncomplete ? '（' + (state._searchTotalRows > 0 ? state._searchTotalRows + ' 条记录' : o.list.length + ' 门') + '）' : '');
    }
  } else {
    curPage = state._browsePage || 1;
    totalPages = state._searchTotalPages || 0;
    gotoPage = n => NX.browseGoto(n);
    nextDis = !state._browseHasMore && !(totalPages > curPage);
    cur.textContent = '第 ' + curPage + ' 页' +
      (totalPages > 0 ? ' / 共 ' + totalPages + ' 页' : '') +
      (state._searchTotalRows > 0 ? '（共 ' + state._searchTotalRows + ' 条记录）' : ' · 随时查询');
  }
  const doJump = () => {
    const n = parseInt(goInput.value, 10);
    goInput.value = '';
    if (!Number.isFinite(n) || n < 1) return;
    gotoPage(n);
  };
  goInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doJump(); } };
  pager.appendChild(mkBtn('‹ 上一页', curPage <= 1, () => gotoPage(curPage - 1)));
  pager.appendChild(cur);
  pager.appendChild(mkBtn('下一页 ›', nextDis, () => gotoPage(curPage + 1)));
  pager.appendChild(goInput);
  pager.appendChild(mkBtn('GO', false, doJump));
  listEl.appendChild(pager);
};

// 搜索模式跳页补载（用户实录：课号查询共 2 页只探第 1 页——storm
// exactCode probeTo=1——下一页把 _uiPage 置 2 后 filterCourses 又钳回已装载
// 页 1，按钮永远「点了没反应」，页码却显示服务端总页数=「显示有误」）。
// 目标页 > 已装载页 → 逐页补拉（单页 serverSearch，code_seq 去重并入），
// 拉完回置目标页再渲染；GO 超界由钳制兜底，forceAll 仍走 loadAllSearch。
NX.loadSearchPageTo = async function (target) {
  const state = NX.state;
  if (state._loadingAll || state._ssBusy) return;
  const loaded = Math.ceil((state._searchRows || []).length / NX.PAGE_SIZE);
  if (!target || target <= loaded) return;
  const cap = state._searchTotalPages || 0;
  const to = cap > 0 ? Math.min(target, cap) : target;
  if (to <= loaded) return;
  state._loadingAll = true;
  try {
    const selKeys = new Set(state.allCourses.filter(c => c.selected).map(c => c.code + '_' + (c.seq || '0')));
    const candKeys = new Set(state.candidateCourses.map(c => c.code + '_' + (c.seq || '0')));
    for (let p = loaded + 1; p <= to; p++) {
      const res = await NX.serverSearch({ ...NX.buildSearchOpts(), page: p });
      const rows = res.rows || [];
      if (!rows.length) break;
      const seen = new Set((state._searchRows || []).map(c => c.code + '_' + (c.seq || '0')));
      rows.forEach(r => {
        const k = r.code + '_' + (r.seq || '0');
        r.selected = selKeys.has(k);
        r.isCandidate = candKeys.has(k);
        if (!seen.has(k)) { seen.add(k); (state._searchRows = state._searchRows || []).push(r); }
      });
      if (NX.mergeServerRows(rows)) NX.rebuildCourseMap();
    }
  } catch (e) { console.warn(NX.TAG, 'search page load:', e); }
  state._loadingAll = false;
  state._uiPage = Math.min(to, Math.max(1, Math.ceil((state._searchRows || []).length / NX.PAGE_SIZE)));
  NX.filterCourses();
};

// 「加载全部」（OneTHU loadAllSearch 同款）：forceAll 全量补齐探测页，
// 结果沿用当前关键词的服务端真值，页码/条数刷新。
NX.loadAllSearch = async function () {
  const state = NX.state;
  if (state._loadingAll) return;
  if (state._ssBusy) { state._loadAllPending = true; return; }   // 管线跑动中：排队而非静默丢弃（#32）
  state._loadingAll = true;
  NX.filterCourses();   // 提示条立即变「加载中…」
  try {
    const opts = NX.buildSearchOpts();
    opts.forceAll = true;
    const res = await NX.serverSearchStorm(opts);
    const selKeys = new Set(state.allCourses.filter(c => c.selected).map(c => c.code + '_' + (c.seq || '0')));
    const candKeys = new Set(state.candidateCourses.map(c => c.code + '_' + (c.seq || '0')));
    (res.rows || []).forEach(r => {
      const k = r.code + '_' + (r.seq || '0');
      r.selected = selKeys.has(k);
      r.isCandidate = candKeys.has(k);
    });
    state._searchRows = res.rows || [];
    // 同上：补齐页合并进会话池（暂存/详情/选课按钮一致可用）
    if ((res.rows || []).length && NX.mergeServerRows(res.rows)) NX.rebuildCourseMap();
    // #32 定案：补齐后仍 < 服务端总数（翻页请求静默失败等）→ 保留提示可重试，
    // 绝不假装补齐成功（旧版无条件清 flag = 「点了没效果」的误导来源之一）
    const stillIncomplete = !!(res.totalRows && (res.rows || []).length < res.totalRows);
    state._searchIncomplete = stillIncomplete;
    if (stillIncomplete) {
      console.warn(NX.TAG, 'load all: 仍不完整', (res.rows || []).length, '/', res.totalRows,
        '——部分页请求失败，可重试「加载当前关键词全部」');
    }
    if (res.totalPages) state._searchTotalPages = res.totalPages;
    if (res.totalRows) state._searchTotalRows = res.totalRows;
    state._searchError = res.pageKind === 'unknown' ? '教务返回异常页（已自动重进未果，WebVPN 会话已失效）——请退出 WebVPN 重新登录' : '';
  } catch (e) {
    console.warn(NX.TAG, 'load all:', e);
  }
  state._loadingAll = false;
  state._jumpCrawling = false;
  if (state._searchDeferred) { state._searchDeferred = false; NX.scheduleServerSearch(true); return; }
  NX.filterCourses();
  NX.highlightJumpTarget();   // 跳转自动补齐路径：补齐后重入高亮（#33）
};

// 浏览模式跳页：置页码 → 作废指纹 → 重新走查询管线（一次一页）
NX.browseGoto = function (page) {
  const state = NX.state;
  state._browsePage = Math.max(1, page);
  state._serverSig = null;
  NX.filterCourses();
};

// ─── 服务器随时查询调度（OneTHU 同款：输入 500ms 防抖，回车立即查）────
// 查询模式（关键词/服务端筛选非空）→ 风暴护栏版多页探测；浏览模式（全空）
// → 只取当前页 1 个请求。跑动中条件再变 → 收敛后自动补跑。
// 课号路由（OneTHU Courses.tsx codeLike 规则，支持 PK/GPK/BW 外校课号）：
// ≥5 位、无中文、含数字、字母数字连字符 → 课号（截「-」前段）；否则课名。
NX.isCodeLike = function (kw) {
  kw = String(kw || '').trim();
  return kw.length >= 5 && !/[\u4e00-\u9fff]/.test(kw) && /\d/.test(kw) && /^[A-Za-z0-9][-A-Za-z0-9]*$/.test(kw);
};
NX.buildSearchOpts = function () {
  const state = NX.state;
  const $ = state.$;
  const rawQ = ($('nextthuxk-search').value || '').trim();
  const f = state.shadow.querySelector('.nx-chip.on')?.dataset.f || 'all';
  const codeLike = NX.isCodeLike(rawQ);
  return {
    // 课号注入搜索栏（OneTHU 定稿：课号保持，无自动清词）
    kch: codeLike ? rawQ.split(/[-–]/)[0].trim() : '',
    kcm: codeLike ? '' : rawQ,
    weekday: $('nx-filter-day')?.value || '',
    section: $('nx-filter-period')?.value || '',
    grade: $('nx-filter-grade-filter')?.value || '',
    rxklxm: $('nx-filter-tongshi')?.value || '',
    kctsm: $('nx-filter-feature')?.value || '',
    onlyAvailable: $('nx-filter-bksrem')?.value === '>0' || f === 'available',
    gradAvail: $('nx-filter-yjsrem')?.value === '>0',
  };
};
NX.runServerSearch = async function () {
  const state = NX.state;
  if (state._ssBusy) { state._ssPending = true; return; }
  if (state._loadingAll) { state._searchDeferred = true; return; }   // 补齐中：延后重跑，别把全量结果盖回去
  state._ssBusy = true;
  try {
    for (let guard = 0; guard < 4; guard++) {
      const ranSig = state._serverSig;
      const opts = NX.buildSearchOpts();
      const queryMode = !!(opts.kch || opts.kcm || opts.weekday || opts.section || opts.grade
        || opts.rxklxm || opts.kctsm || opts.onlyAvailable || opts.gradAvail);
      if (!queryMode) opts.page = state._browsePage || 1;   // 浏览模式：单页
      try {
        let res = queryMode ? await NX.serverSearchStorm(opts) : await NX.serverSearch(opts);
        // 外校课号 p_kch 搜不到（教务课号索引不含 PK/GPK/BW 前缀课号，用户实测：
        // 跳转/搜索框输入 BW3w0008 显示无结果）→ 池里有这门课（已选/暂存/跳转
        // 来源都带课名）→ 自动换课名重搜，卡片/回填链路全恢复
        if (queryMode && opts.kch && !(res.rows || []).length) {
          const poolHit = state.allCourses.find(c => c.name && (c.code === opts.kch || c.code.startsWith(opts.kch)));
          if (poolHit) {
            console.log(NX.TAG, '课号 0 行 → 课名重搜:', opts.kch, '→', poolHit.name);
            const res2 = await NX.serverSearchStorm(Object.assign({}, opts, { kch: '', kcm: poolHit.name }));
            if ((res2.rows || []).length) { res = res2; opts.kcm = poolHit.name; }
          }
        }
        // 搜索结果带核心池标记渲染（选中/候补徽章与按钮状态一致）
        const selKeys = new Set(state.allCourses.filter(c => c.selected).map(c => c.code + '_' + (c.seq || '0')));
        const candKeys = new Set(state.candidateCourses.map(c => c.code + '_' + (c.seq || '0')));
        (res.rows || []).forEach(r => {
          const k = r.code + '_' + (r.seq || '0');
          r.selected = selKeys.has(k);
          r.isCandidate = candKeys.has(k);
        });
        state._searchRows = res.rows || [];
        state._browseHasMore = res.pageKind === 'ok' && (res.rows || []).length > 0;
        // 搜索结果合并进会话池（暂存/简介/选课按钮即刻可用——否则 addToStage
        // 的 allCourses.find 落空，搜索卡片点暂存静默无效；code_seq 去重，
        // 池内已有行跳过，已选/队列 chip 按 selected/isCandidate 过滤不受污染）
        if ((res.rows || []).length && NX.mergeServerRows(res.rows)) NX.rebuildCourseMap();
        state._searchTotalPages = res.totalPages || 0;
        state._searchTotalRows = res.totalRows || 0;
        // 捕捉不完整（OneTHU 同款）：已加载 < 服务端总数 → 尾部页未探测，
        // 分页条出「加载全部」补齐入口
        state._searchIncomplete = queryMode && !!(res.totalRows && (res.rows || []).length < res.totalRows);
        state._searchError = res.pageKind === 'unknown'
          ? '教务返回异常页' + (res.htmlHead ? '（' + String(res.htmlHead).slice(0, 80) + '…）' : '') + '（已自动重进未果）——请退出 WebVPN 重新登录'
          : (res.pageKind === 'empty' ? '' : '');
      } catch (e) {
        console.warn(NX.TAG, 'server search scheduled:', e);
        state._searchRows = state._searchRows || [];
        state._browseHasMore = false;
        state._searchError = '查询失败：' + (e && e.message ? e.message : e);
      }
      if (state._serverSig === ranSig) break;   // 条件未再变 → 收敛
    }
  } finally {
    state._ssBusy = false;
  }
  if (state._ssPending) { state._ssPending = false; NX.runServerSearch(); return; }
  if (state._loadAllPending) { state._loadAllPending = false; NX.loadAllSearch(); return; }   // #32：排队的补齐
  NX.filterCourses();   // sig 未变 → 直接渲染新结果（不再触发查询）
  NX.highlightJumpTarget();
};
// 防抖入口（filterCourses 用）；immediate=true 时跳过防抖立即查（回车/跳转用）
NX.scheduleServerSearch = function (immediate) {
  clearTimeout(NX._ssTimer);
  NX._ssTimer = setTimeout(() => { NX._ssTimer = null; NX.runServerSearch(); }, immediate ? 0 : 500);
};

/** 跳转目标高亮（OneTHU jumpTo 定稿语义：课号注入搜索栏并保持，
 *  高亮 1.8s 瞬时清除；无自动清词） */
NX.highlightJumpTarget = function () {
  const state = NX.state;
  if (!state._jumpCode) return;
  const $ = state.$;
  const code = state._jumpCode, seq = state._jumpSeq || '0';
  // 目标不在当前结果 → 不消费跳转意图：数据不完整时自动补齐一轮重试（#33）；
  // 补齐后仍无 → 明确提示。绝不高亮同名第一门充数（正是本 bug 的误导根源）。
  // 数据定位（渐进渲染：DOM 只渲到 renderCursor，按索引强制渲到目标条再滚）；
  // 教师仲裁：同课号同课序多教师（课序骗人实锤）→ 定位到对的人
  const list = state.renderList || [];
  const jt = state._jumpTeacher || '';
  const codeSeq = c => String(c.code || '') === String(code) &&
    String(c.seq || '0') === String(seq);
  const tOk = c => !jt || (!!c.teacher &&
    (c.teacher === jt || c.teacher.includes(jt) || jt.includes(c.teacher)));
  let idx = list.findIndex(c => codeSeq(c) && tOk(c));
  if (idx === -1) idx = list.findIndex(codeSeq);
  if (idx === -1) {
    // 用户定案（#33）：跳转没找到 → 直接静默爬全量（课号检索页数少，压力小），
    // 不弹提示不闪 banner；爬完仍无（课序真不在教务）才静默放弃
    if (state._searchIncomplete && !state._loadingAll && state._jumpAutoAll) {
      state._jumpAutoAll = false;
      state._jumpCrawling = true;   // 爬取期间压住「数据不完整」banner（静默）
      void NX.loadAllSearch();      // 补齐后 filterCourses → 本函数重入（_jumpCode 仍在）
      return;
    }
    state._jumpCode = null;
    return;
  }
  state._jumpCode = null;
  let guard = 0;
  while (state.renderList === list && state.renderCursor <= idx && guard++ < 300) NX.renderMoreCourses();
  requestAnimationFrame(() => {
    const cards = [...($('nextthuxk-list')?.querySelectorAll('.nx-card') || [])];
    const card = cards.find(c => c.dataset.code === String(code) &&
      String(c.dataset.seq || '0') === String(seq) && tOk({ teacher: c.dataset.teacher || '' })) ||
      cards.find(c => c.dataset.code === String(code) && String(c.dataset.seq || '0') === String(seq));
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('nx-jump-target');
    setTimeout(() => card.classList.remove('nx-jump-target'), 1800);
  });
};

NX.updateSearchClear = function () {
  const $ = NX.state.$;
  const btn = $('nextthuxk-search-clear');
  const hasValue = !!$('nextthuxk-search').value.trim();
  btn.classList.toggle('show', hasValue);
};

NX.filterByGroup = function (g) {
  NX.state.activeGroup = g;
  NX.filterCourses();
};
