// ═══════════════════════════════════════════════════════════════
// NextTHUxk — AI: AI 搜索 + 智能排课
// ═══════════════════════════════════════════════════════════════
var NX = NX || {};

// ─── AI 数据接口（xk-1.5.1 随时查询模式适配）──────────────────
// 统一课程 JSON：带全量新字段（志愿统计/余量/类型/候补/暂存/外校说明列），
// aiSearch 与 callAI 共用——「选课 json 提供」的单一真相。
NX.aiCourseJson = function (c) {
  const staged = (NX.state.stageCart || []).some(s => s.code === c.code && NX.normSeq(s.seq || '0') === NX.normSeq(c.seq || '0'));
  const j = {
    name: c.name, code: c.code, seq: c.seq || '0', credits: c.credits,
    teacher: c.teacher || '', department: c.department || '',
    time: c.time || '', attr: c.attr || '', typeLabel: c.typeLabel || '',
    remaining: c.remaining, capacity: c.capacity, available: !!c.available,
    selected: !!c.selected, isCandidate: !!c.isCandidate, staged,
    zy: c.zy || undefined,
    tongshiGroup: c.tongshiGroup || undefined, courseFeature: c.courseFeature || undefined, grade: c.grade || undefined,
    note: c.xkTextNote || c.note || '',
    vol: (c.volCapacity !== undefined || c.volApplied !== undefined) ? {
      capacity: c.volCapacity, applied: c.volApplied,
      required: c.volRequired || '', elective: c.volElective || '', optional: c.volOptional || '', sports: c.volSports || '',
    } : undefined,
    reviewAvg: (c._tbRef && c._tbRef.count) ? c._tbRef.avg : undefined,
    reviewCount: (c._tbRef && c._tbRef.count) || undefined,
    latestReview: c._tbSnip ? String(c._tbSnip).slice(0, 60) : undefined,
  };
  return j;
};
// 预览占用：大节 + 钟点（外校课说明列 join 借用）+ 自定义占用
NX.aiOccupied = function (previewCourses) {
  const out = [];
  let curName = '';
  const push = (day, slot, name) => {
    const k = day + ' ' + slot;
    if (!out.find(s => s.key === k)) out.push({ key: k, day, slot, name: name || curName });
  };
  (previewCourses || []).forEach(c => {
    curName = c.name || c.code;
    NX.parseTimeSlots(c.time || '').forEach(({ day, slot }) => push(day, slot, c.name));
    // clockRangesOf：day=数字(1-7)、begin/end=分钟 → 归一成「周X HH:MM-HH:MM」
    const wd = '一二三四五六日';
    const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    NX.clockRangesOf(c.note || c.xkTextNote || '', c.time || '').forEach(cr =>
      push('周' + (wd[cr.day - 1] || cr.day), hhmm(cr.begin) + '-' + hhmm(cr.end), c.name));
  });
  (NX.state.manualEvents || []).forEach(e => {
    curName = e.name;
    const dayN = Number(e.day) || 1;
    const day = '周' + '一二三四五六日'[dayN - 1];
    NX.parseTimeSlots(e.time || '').forEach(({ day: d2, slot }) => push(d2 || day, slot, e.name));
    if (e.begin && e.end) push(day, e.begin + '-' + e.end, e.name);
  });
  return out;
};

NX.aiSearch = async function () {
  const { esc, state, baseFlag, parseTimeSlots, findPreviewConflicts, showXkResult, addToStage } = NX;
  const $ = state.$;
  const api = $('nextthuxk-api').value.trim();
  const model = $('nextthuxk-model').value.trim() || 'gpt-4o-mini';
  const token = $('nextthuxk-token').value.trim();
  const prompt = $('nextthuxk-ai-search-prompt')?.value?.trim() || '';
  const pref = $('nextthuxk-pref')?.value?.trim() || '';
  const st = $('nextthuxk-ai-search-st');
  const results = $('nextthuxk-ai-search-results');
  const btn = $('nextthuxk-ai-search');

  if (!api || !token) { st.className = 'nx-st err'; st.textContent = '请先填写 API URL 和 Token'; return; }
  if (!prompt) { st.className = 'nx-st err'; st.textContent = '请输入搜索描述'; return; }

  st.className = 'nx-st'; st.innerHTML = '<span class="nx-spin"></span> AI 正在搜索…';
  btn.disabled = true;
  results.innerHTML = '';

  try {
    const { allCourses, candidateCourses, stageCart, savedDrafts, previewMode, previewDraftIdx } = state;
    const q = $('nextthuxk-search').value.toLowerCase();
    const f = state.shadow.querySelector('.nx-chip.on')?.dataset.f || 'all';
    // 随时查询模式：池里只有已选/候补/已合并行——用户看到的是服务端搜索结果，
    // AI 候选集必须同源（_searchRows 为空才退回池内本地过滤）
    const so = NX.buildSearchOpts();
    const searchMode = !!(so.kch || so.kcm || so.weekday || so.section || so.grade || so.rxklxm || so.kctsm || so.onlyAvailable || so.gradAvail);
    let filtered = (searchMode && state._searchRows && state._searchRows.length) ? [...state._searchRows] : [...allCourses];
    if (q) filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.teacher || '').toLowerCase().includes(q));
    if (f === 'available') filtered = filtered.filter(c => c.available);
    else if (f === 'required') filtered = filtered.filter(c => c.attr === '必修');
    else if (f === 'elective') filtered = filtered.filter(c => c.attr === '限选');
    else if (f === 'sports') filtered = filtered.filter(c => NX.isSportsCourse(c));
    // 去重（搜索行与池行可能同课双份；两套课序号按归一化合并）
    {
      const seen = new Set();
      filtered = filtered.filter(c => {
        const k = c.code + '_' + NX.normSeq(c.seq || '0');
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    }

    let previewCourses = [];
    let previewLabel = '无';
    if (previewMode === 'selected') {
      previewCourses = NX.getPreviewCourses();   // 已走 previewJoinRows（外校课时间从目录行/缓存借用）
      previewLabel = '当前已选';
    } else if (previewMode === 'stage') {
      previewCourses = NX.previewJoinRows(stageCart); previewLabel = '暂存区';
    } else if (previewMode === 'draft' && previewDraftIdx >= 0 && savedDrafts[previewDraftIdx]) {
      previewCourses = savedDrafts[previewDraftIdx].courses; previewLabel = '草稿「' + savedDrafts[previewDraftIdx].name + '」';
    }

    const occupiedSlots = NX.aiOccupied(previewCourses);

    const courseList = filtered.map(c => {
      const conflicts = findPreviewConflicts(c);
      return Object.assign(NX.aiCourseJson(c), {
        conflict: conflicts.length > 0,
        conflictWith: conflicts.map(cf => cf.name).join(', '),
      });
    });

    const apiPrompt = '你是清华大学选课AI助手。学生想在已筛选的课程中找课。\n\n' +
      '## 当前预览课表：' + previewLabel + '（' + previewCourses.length + '门）\n' +
      '已占用时间：' + (occupiedSlots.length ? occupiedSlots.map(s => s.key + '(' + s.name + ')').join('、') : '无') + '\n\n' +
      '## 候选课程（共' + courseList.length + '门，已按用户条件筛选）\n' +
      JSON.stringify(courseList.slice(0, 200)) + '\n\n' +
      '## 社区评价参考（THU选课社区）\n' +
      'reviewAvg=社区均分(1-5)，reviewCount=点评数，latestReview=最新点评节选（含考核方式/给分）。点评多且分高的课通常授课体验与给分更好，同等匹配度下优先推荐；评分明显偏低的课需在 reason 中提示。\n\n' +
      '## 学生需求\n' + prompt + '\n\n' +
      '## 学生偏好\n' + (pref || '无特殊偏好') + '\n\n' +
      '请从候选课程中推荐最匹配学生需求的课程。优先推荐不与预览课表冲突的课。如需推荐冲突课程请明确说明。\n\n' +
      '返回纯JSON（不要markdown代码块），格式：\n' +
      '{"recommendations":[{"code":"课程号","seq":"课序号","name":"课名","reason":"推荐理由（一句话）","conflict":false,"conflictWith":""}],"summary":"总体建议"}\n\n' +
      'conflict为true表示该课与预览课表时间冲突。最多推荐10门。';

    const resp = await fetch(api.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: '你是选课助手，只返回JSON。' }, { role: 'user', content: apiPrompt }], temperature: 0.3 })
    });
    if (!resp.ok) throw new Error('API HTTP ' + resp.status);
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API 返回为空');
    const result = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

    const recs = result.recommendations || [];
    if (!recs.length) {
      results.innerHTML = '<div class="nx-st">未找到匹配课程</div>';
    } else {
      results.innerHTML = (result.summary ? '<div class="nx-st ok" style="margin-bottom:8px">' + esc(result.summary) + '</div>' : '')
        + recs.map(r => {
          const course = allCourses.find(c => c.code === r.code && NX.normSeq(c.seq || '0') === NX.normSeq(r.seq || '0'));
          const isConflict = r.conflict || (course && findPreviewConflicts(course).length > 0);
          const borderColor = isConflict ? '#ff9500' : r.conflict ? '#ff3b30' : '#34c759';
          const conflictHtml = isConflict ? '<div style="font-size:10px;color:#ff9500;margin-top:4px">与' + esc(r.conflictWith || '预览课表') + '时间冲突</div>' : '';
          const addBtn = course && !course.selected ? '<button class="nx-stage-btn" data-code="' + esc(r.code) + '" data-seq="' + esc(r.seq || '0') + '" style="margin-top:4px;font-size:10px">暂存</button>' : '';
          return '<div style="padding:10px;margin-top:6px;border-radius:10px;border-left:3px solid ' + borderColor + ';background:rgba(0,0,0,.02)">' +
            '<div style="font-weight:700;font-size:13px">' + esc(r.name) + ' <span style="color:#86868b;font-weight:400">' + esc(r.code) + '</span></div>' +
            '<div style="font-size:11px;color:#86868b;margin-top:2px">' + (course ? esc(course.teacher || '') + ' · ' + esc(course.time || '') : '') + '</div>' +
            '<div style="font-size:12px;margin-top:4px;color:#1d1d1f">' + esc(r.reason) + '</div>' +
            conflictHtml + addBtn + '</div>';
        }).join('');
      results.querySelectorAll('.nx-stage-btn').forEach(b => {
        b.onclick = () => {
          const ac = allCourses.find(c => c.code === b.dataset.code && NX.normSeq(c.seq || '0') === NX.normSeq(b.dataset.seq || '0'));
          if (ac) addToStage(ac.code, ac.seq, baseFlag(ac), 3);
        };
      });
    }
    st.className = 'nx-st ok';
    st.textContent = '找到 ' + recs.length + ' 门推荐课程';
  } catch (e) {
    st.className = 'nx-st err'; st.textContent = '' + e.message;
  } finally { btn.disabled = false; }
};

NX.callAI = async function () {
  const { esc, state, store, baseFlag, detectConflicts, showXkResult } = NX;
  const $ = state.$;
  const api = $('nextthuxk-api').value.trim();
  const model = $('nextthuxk-model').value.trim() || 'gpt-4o-mini';
  const token = $('nextthuxk-token').value.trim();
  const pref = $('nextthuxk-pref').value.trim();
  const st = $('nextthuxk-ai-st');
  const btn = $('nextthuxk-ai');
  if (!api || !token) { st.className = 'nx-st err'; st.textContent = '请填写 API URL 和 Token'; return; }
  st.className = 'nx-st'; st.innerHTML = '<span class="nx-spin"></span> AI 正在分析课程数据…';
  btn.disabled = true;
  try {
    const { allCourses, candidateCourses, savedDrafts, SEM, GRADE } = state;
    // 随时查询模式：全库不在池。必修/体育候选 = 当前搜索结果（用户搜过什么
    // AI 就看什么）∪ 池内必修/体育；没有搜索结果时明确告知 AI 候选范围受限。
    const so = NX.buildSearchOpts();
    const searchMode = !!(so.kch || so.kcm || so.weekday || so.section || so.grade || so.rxklxm || so.kctsm || so.onlyAvailable || so.gradAvail);
    const candPool = (searchMode && state._searchRows && state._searchRows.length)
      ? state._searchRows.slice() : [];
    allCourses.forEach(c => {
      if ((c.attr === '必修' || NX.isSportsCourse(c)) && !candPool.some(x => x.code === c.code && NX.normSeq(x.seq || '0') === NX.normSeq(c.seq || '0'))) candPool.push(c);
    });
    const bxTyCourses = candPool.filter(c => c.attr === '必修' || NX.isSportsCourse(c)).map(c => NX.aiCourseJson(c));
    const selectedInfo = allCourses.filter(c => c.selected).map(c => Object.assign(NX.aiCourseJson(c), { zy: c.zy }));
    const selectedCredits = selectedInfo.reduce((s, c) => s + (c.credits || 0), 0);
    const draftsInfo = savedDrafts.map(d => ({ name: d.name, courses: d.courses.map(c => ({ name: c.name, code: c.code, seq: c.seq, time: c.time, flag: c.flag, zy: c.zy, credits: c.credits })) }));
    // 预览占用（含外校钟点与自定义占用——写进 prompt 让 AI 知道哪些时段真没了）
    const occupied = NX.aiOccupied(NX.getPreviewCourses());

    const prompt = '你是清华大学选课AI助手。请根据以下信息推荐最优选课方案，确保无时间冲突。\n\n' +
      '## 用户信息\n- 当前年级：' + ('大一大二大三大四'[GRADE - 1] || '未知') + '（第' + GRADE + '年本科）\n- 当前学期：' + SEM + '\n\n' +
      '## 本学期候选的必修课和体育课（' + bxTyCourses.length + '门' + (searchMode ? '，来自当前搜索结果+池内' : '，仅池内已加载——可用 keyword 搜索更多后重试') + '；时间格式：星期-大节(周次) 或说明列钟点（note 字段，外校课为星期+钟点文本）；vol=志愿统计(容量/已报/必修限选任选各志愿数)；reviewAvg 为 THU选课社区均分，同分位优先高分教师）\n' +
      JSON.stringify(bxTyCourses.slice(0, 300), null, 1) + '\n\n' +
      '## 当前已选课表（' + selectedInfo.length + '门 · ' + selectedCredits + '学分）\n' +
      (selectedInfo.length ? JSON.stringify(selectedInfo, null, 1) : '无') + '\n\n' +
      '## 当前课表已占用时段\n' + (occupied.length ? occupied.map(o => o.key + '(' + o.name + ')').join('、') : '无') + '\n\n' +
      '## 已保存的暂存课表\n' +
      (draftsInfo.length ? JSON.stringify(draftsInfo, null, 1) : '无') + '\n\n' +
      '## 用户偏好\n' + (pref || '无特殊偏好，请合理推荐') + '\n\n' +
      '重要约束：\n1. 只推荐与用户年级匹配的课程。例如大三学生不应选大一大二的体育课(如体育(1)、体育(2))，应选体育(3)或以上。\n' +
      '2. 课程名中的数字通常表示年级段：体育(1)=大一体育，体育(2)=大二体育，体育(3)=大三体育。\n' +
      '3. 请根据已有课表的时间空隙，从必修课和体育课中选择合适的课程组合。\n' +
      '4. 对于任选课和通识课，不需要逐门搜索，只需根据已有课表的空闲时段给出选课方向建议即可。\n\n' +
      '返回纯JSON（不要markdown代码块），格式：\n' +
      '{"courses":[{"code":"课号","seq":"课序","name":"课名","credits":3,"time":"3-2(全周)","teacher":"教师","flag":"bx","zy":3,"reason":"推荐理由"}],"total_credits":30,"summary":"整体分析","suggestions":["对任选/通识课的建议"]}\n\n' +
      'flag: bx=必修 xx=限选 rx=任选 ty=体育。zy: 志愿号1-3。结果将直接存入暂存草稿。';

    const resp = await fetch(api.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: '你是选课助手，只返回JSON。' }, { role: 'user', content: prompt }], temperature: 0.3 })
    });
    if (!resp.ok) throw new Error('API HTTP ' + resp.status);
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API 返回为空');
    const schedule = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

    // Load AI result into staging cart
    const { renderStageCart, renderPreviewTT, askReplaceDraft } = NX;
    state.stageCart = (schedule.courses || []).map(c => {
      const ac = allCourses.find(x => x.code === c.code);
      return {
        code: c.code, seq: c.seq || '0', name: c.name || '', teacher: c.teacher || '',
        time: c.time || '', credits: c.credits || 0, flag: c.flag || 'bx', zy: c.zy || 3,
        baseFlag: c.baseFlag || (ac ? baseFlag(ac) : 'rx'),
      };
    });
    renderStageCart();
    renderPreviewTT(state.stageCart, 'AI 推荐方案');
    store.set('stageCart', state.stageCart);

    const aiName = 'AI推荐';
    const saved = askReplaceDraft(aiName, state.stageCart);
    if (saved) {
      state.stageCart = [];
      renderStageCart();
      store.set('stageCart', state.stageCart);
    }

    const conflicts = detectConflicts(state.stageCart.length ? state.stageCart : (state.savedDrafts[state.savedDrafts.length - 1]?.courses || []));
    st.className = conflicts.length ? 'nx-st err' : 'nx-st ok';
    let msg = conflicts.length
      ? 'AI方案有 ' + conflicts.length + ' 处时间冲突，请手动调整'
      : 'AI方案已生成！' + (schedule.courses?.length || 0) + '门课 · ' + (schedule.total_credits || '?') + '学分';
    if (saved) msg += ' — 已保存为「' + aiName + '」';
    else msg += ' — 仅保留在暂存区';
    if (schedule.summary) msg += '\n' + schedule.summary;
    if (schedule.suggestions?.length) msg += '\n建议: ' + schedule.suggestions.join('; ');
    st.textContent = msg;

    store.set('config', { api, model, token, pref });
  } catch (e) {
    st.className = 'nx-st err'; st.textContent = '' + e.message;
  } finally { btn.disabled = false; }
};
