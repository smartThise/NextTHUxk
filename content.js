// ═══════════════════════════════════════════════════════════════
// NextTHUxk — Entry Point: HTML 模板、Shadow DOM、事件绑定、启动流程
// ═══════════════════════════════════════════════════════════════
(async function () {
'use strict';

// ─── Entry Guard ──────────────────────────────────────────────
if (window.parent !== window) return;
if (!/zhjwxk|zhjw\.cic|webvpn/.test(location.hostname)) return;

const { browser: _browser, TAG, DATA_VER, store, state, baseFlag,
  launch: _origLaunch, fetchTrainingPlan, fetchCourseCatalog, fetchVolunteer,
  fetchSelectedCourses, fetchQueueData, fetchCandidateCourses,
  mergeStaticData, resolveCourseZy, renderCourses, renderPlan,
  renderPreviewTT, renderStageCart, renderDrafts, filterCourses,
  renderPlanView, refreshSelected, showXkResult, volNeedsRefresh,
  checkUpdate } = NX;

console.log(TAG, 'loading on', location.href);

// ─── Init Config State ────────────────────────────────────────
state.SEM = (location.href.match(/p_xnxq=([^&]+)/) || ['', ''])[1];

// WebVPN embeds the upstream host in the pathname, for example:
// /http/<encoded-host>/xkBks.vxkBksXkbBs.do?m=main
// Preserve that prefix for every subsequent endpoint request.
const _webvpn = location.hostname === 'webvpn.tsinghua.edu.cn';
const _xkPathAt = location.pathname.search(/\/(?:xkBks|jhBks|js\.)/);
const _webvpnPrefix = _webvpn && _xkPathAt >= 0
  ? location.pathname.slice(0, _xkPathAt)
  : '';
state.BASE = location.origin + _webvpnPrefix;
state.isZhjwxk = location.hostname === 'zhjwxk.cic.tsinghua.edu.cn'
  || (_webvpn && /\/xkBks\./.test(location.pathname));
state.isZhjw = location.hostname === 'zhjw.cic.tsinghua.edu.cn';

// ─── Load CSS ─────────────────────────────────────────────────
let cssText = '';
try {
  const cssResp = await fetch(_browser.runtime.getURL('content.css'));
  cssText = await cssResp.text();
} catch (e) {
  console.warn(TAG, 'CSS load failed, using empty:', e);
}

// ─── HTML Template ────────────────────────────────────────────
const HTML = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <!-- 液态玻璃折射滤镜：径向 displacement map（中心不位移/边缘强弯折 = 透镜效应） -->
  <filter id="lg-refract" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feImage href="data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><radialGradient id="m" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgb(128,128,128)"/><stop offset="72%" stop-color="rgb(128,128,128)"/><stop offset="100%" stop-color="rgb(230,230,230)"/></radialGradient></defs><rect width="400" height="400" fill="url(#m)"/></svg>')}" result="map" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
<div id="nextthuxk-inner">
  <button id="nextthuxk-launch" title="启动 NextTHUxk 下一代选课">NextTHUxk</button>
  <div id="nextthuxk-toast" class="nx-toast"></div>
  <div id="nextthuxk-dashboard">
  <div class="nx-modal-mask" id="nextthuxk-modal">
    <div class="nx-modal">
      <div class="nx-modal-head">
        <div class="nx-modal-title" id="nextthuxk-modal-title">课程详情</div>
        <button class="nx-modal-close" id="nextthuxk-modal-close">✕</button>
      </div>
      <div class="nx-modal-body" id="nextthuxk-modal-body"><div class="nx-modal-loading">加载中…</div></div>
    </div>
  </div>
  <div class="nx-zy-modal-mask" id="nextthuxk-zy-modal">
    <div class="nx-zy-modal">
      <div class="nx-zy-modal-head">
        <div class="nx-zy-modal-title">志愿信息确认</div>
        <button class="nx-modal-close" id="nextthuxk-zy-modal-close">✕</button>
      </div>
      <div class="nx-zy-modal-body" id="nextthuxk-zy-modal-body"></div>
      <div class="nx-zy-modal-foot">
        <button class="nx-zy-ok" id="nextthuxk-zy-modal-ok">确认</button>
      </div>
    </div>
  </div>
    <div class="nx-header">
      <div class="nx-logo">NextTHUxk<span class="nx-logo-sub">下一代选课</span> <span id="nextthuxk-phase-tag" style="display:none;font-size:11px;background:rgba(47,107,255,.1);color:var(--nx-accent);padding:2px 8px;border-radius:4px;margin-left:6px"></span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="nextthuxk-cache-info" style="font-size:11px;color:var(--nx-ink-soft)"></span>
        <button id="nextthuxk-sem" class="nx-ghost-btn" title="点击修改学期"></button>
        <button id="nextthuxk-grade" class="nx-ghost-btn" title="点击修改年级"></button>
        <button id="nextthuxk-refresh" class="nx-ghost-btn">刷新数据</button>
        <button id="nextthuxk-refresh-queue" class="nx-ghost-btn" style="display:none">刷新队列</button>
        <button id="nextthuxk-check-update" class="nx-ghost-btn">检查更新</button>
        <button class="nx-exit" id="nextthuxk-exit">返回原系统</button>
      </div>
    </div>
    <div class="nx-main">
      <div class="nx-left">
        <div class="nx-search-bar">
          <div class="nx-search-wrap">
            <input type="text" class="nx-search" id="nextthuxk-search" placeholder="搜索课程名称、教师、课程号…">
            <button type="button" class="nx-search-clear" id="nextthuxk-search-clear" aria-label="清空搜索">×</button>
          </div>
          <div class="nx-filters" id="nextthuxk-filters">
            <button class="nx-chip on" data-f="all">全部</button>
            <button class="nx-chip" data-f="available">可选</button>
            <button class="nx-chip" data-f="selected">已选</button>
            <button class="nx-chip" data-f="required">必修</button>
            <button class="nx-chip" data-f="elective">限选</button>
            <button class="nx-chip" data-f="sports">体育</button>
            <button class="nx-chip" data-f="queue">我的队列</button>
            <button class="nx-chip" data-f="plan">培养方案</button>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <select id="nx-filter-conflict" class="nx-zy-select" style="flex:1"><option value="">不限制冲突</option><option value="noconflict">仅无冲突</option><option value="conflict">仅冲突</option></select>
            <select id="nx-filter-credits" class="nx-zy-select" style="flex:1"><option value="">全部学分</option><option value="1">1学分</option><option value="2">2学分</option><option value="3">3学分</option><option value="4">4学分</option><option value="5+">5+学分</option></select>
            <select id="nx-filter-day" class="nx-zy-select" style="flex:1"><option value="">不限周次</option><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="7">周日</option></select>
            <select id="nx-filter-period" class="nx-zy-select" style="flex:1"><option value="">不限大节</option><option value="1">第1大节</option><option value="2">第2大节</option><option value="3">第3大节</option><option value="4">第4大节</option><option value="5">第5大节</option><option value="6">第6大节</option></select>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <select id="nx-filter-reviews" class="nx-zy-select" style="flex:1"><option value="">社区评价: 不限</option><option value="has">有点评</option><option value="cnt5">点评≥5条</option><option value="r45">★≥4.5 好评</option><option value="r40">★≥4.0</option><option value="low">★≤3.0 避雷线</option></select>
            <select id="nx-sort-by" class="nx-zy-select" style="flex:1"><option value="">排序: 默认目录序</option><option value="rate_desc">社区评分 高→低</option><option value="rate_asc">社区评分 低→高</option><option value="cnt_desc">点评数 多→少</option></select>
          </div>
          <div style="margin-top:6px;font-size:10px;color:var(--nx-faint)">ℹ️ 北大 / 北外等跨校课程暂不支持在本插件内选择，请通过教务系统原流程操作</div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <select id="nx-filter-tongshi" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">通识课组: 不限</option><option value="TS1">人文课组</option><option value="TS2">社科课组</option><option value="TS3">艺术课组</option><option value="TS4">科学课组</option></select>
            <select id="nx-filter-feature" class="nx-zy-select" style="flex:1;min-width:120px"><option value="">课程特色: 不限</option><option value="专题研讨课">专题研讨课</option><option value="全外文授课">全外文授课</option><option value="外文授课比例≥50%">双语课(外文≥50%)</option><option value="外文教材">双语课(外文教材)</option><option value="实践课">实践课</option><option value="实验课">实验课</option><option value="挑战性学习">挑战性学习课程</option><option value="文化素质核心课">文化素质核心课</option><option value="文化素质课">文化素质课</option><option value="新生研讨课">新生研讨课</option><option value="混合式教学">混合式教学</option><option value="精品课">精品课</option><option value="认证外文课">认证外文课</option><option value="通识荣誉课">通识荣誉课</option><option value="通识选修课">通识选修课</option><option value="语言类">语言类课程</option><option value="通识英语">通识英语</option><option value="公共英语">公共英语</option></select>
            <select id="nx-filter-grade-filter" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">年级: 不限</option><option value="2026">2026级</option><option value="2025">2025级</option><option value="2024">2024级</option><option value="2023">2023级</option><option value="2022">2022级</option><option value="2021">2021级</option><option value="2020">2020级</option><option value="2019">2019级</option></select>
            <select id="nx-filter-bksrem" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">本科余量: 不限</option><option value=">0">本科余量&gt;0</option></select>
            <select id="nx-filter-yjsrem" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">研院余量: 不限</option><option value=">0">研究生余量&gt;0</option></select>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px"><input type="text" id="nx-filter-xknote" class="nx-inp" style="flex:1;padding:6px 10px;font-size:12px" placeholder="选课文字说明搜索"></div>
        </div>
        <div class="nx-list" id="nextthuxk-list"><div class="nx-empty">点击右下角「选」按钮开始</div></div>
      </div>
      <div class="nx-right">
        <div class="nx-sec"><div class="nx-sec-title">我的培养方案</div><div id="nextthuxk-plan" class="nx-plans"><div class="nx-st">等待加载…</div></div><div id="nextthuxk-plan-detail" style="margin-top:8px;font-size:12px;color:var(--nx-ink-soft)"></div></div>
        <div class="nx-sec"><div class="nx-sec-title">课表预览 <span id="nextthuxk-preview-info" style="font-size:11px;color:var(--nx-ink-soft);font-weight:400"></span></div><div id="nextthuxk-preview-tt"><div class="nx-st">选课后自动生成预览</div></div><button class="nx-stage-btn" id="nextthuxk-preview-reset" style="display:none;margin-top:6px">返回当前已选课表</button></div>
        <div class="nx-sec">
          <div class="nx-sec-title">暂存课表</div>
          <div id="nextthuxk-stage-list"><div class="nx-st">暂无暂存课程</div></div>
          <div id="nextthuxk-stage-conflict" style="margin-top:4px"></div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <input type="text" class="nx-inp" id="nextthuxk-draft-name" placeholder="草稿名称（如：方案A）" style="flex:1;padding:6px 10px;font-size:12px;min-width:120px">
            <button class="nx-stage-btn" id="nextthuxk-save-draft">保存草稿</button>
            <button class="nx-stage-btn" id="nextthuxk-save-selected">存当前选课</button>
            <button class="nx-stage-btn" id="nextthuxk-preview-stage">预览暂存</button>
            <button class="nx-stage-btn" id="nextthuxk-export">导出</button>
            <button class="nx-stage-btn" id="nextthuxk-import">导入</button>
          </div>
          <div id="nextthuxk-import-area" style="display:none;margin-top:6px">
            <textarea class="nx-inp nx-ta" id="nextthuxk-import-data" placeholder="粘贴导出的课表数据…" style="font-size:11px"></textarea>
            <div style="display:flex;gap:6px;margin-top:4px">
              <button class="nx-stage-btn" id="nextthuxk-import-confirm">确认导入到暂存区</button>
              <button class="nx-stage-btn" id="nextthuxk-import-cancel" style="color:#ee4d4d;border-color:rgba(238,77,77,.3)">取消</button>
            </div>
          </div>
          <div id="nextthuxk-drafts" style="margin-top:8px"></div>
        </div>
        <div class="nx-sec"><div class="nx-sec-title">AI 配置</div><div class="nx-ai"><input type="text" class="nx-inp" id="nextthuxk-api" placeholder="API Base URL（如 https://api.openai.com/v1）"><input type="text" class="nx-inp" id="nextthuxk-model" placeholder="模型名称（如 gpt-4o-mini、deepseek-chat）"><input type="password" class="nx-inp" id="nextthuxk-token" placeholder="API Token"><textarea class="nx-inp nx-ta" id="nextthuxk-pref" placeholder="我的选课偏好（如：周五下午空出来、优先给分好的老师、学分凑满30）"></textarea></div></div>
        <div class="nx-sec"><div class="nx-sec-title">AI 课程搜索</div><div style="font-size:11px;color:var(--nx-ink-soft);margin-bottom:8px">基于当前筛选结果 + 当前预览课表，AI 在不冲突的课程中推荐</div><div class="nx-ai"><textarea class="nx-inp nx-ta" id="nextthuxk-ai-search-prompt" placeholder="描述你想要的课（如：想选一门好拿A的通识课、周四下午有空的任选、推荐一门有趣的体育课…）" style="min-height:56px"></textarea><button class="nx-ai-btn" id="nextthuxk-ai-search" style="background:var(--nx-accent)">AI 搜索推荐</button><div id="nextthuxk-ai-search-st" class="nx-st"></div><div id="nextthuxk-ai-search-results"></div></div></div>
        <div class="nx-sec"><div class="nx-sec-title">AI 智能排课</div><div style="font-size:11px;color:var(--nx-ink-soft);margin-bottom:8px">AI 根据必修/体育课 + 偏好自动生成完整课表方案</div><div class="nx-ai"><button class="nx-ai-btn" id="nextthuxk-ai">AI 智能排课</button><div id="nextthuxk-ai-st" class="nx-st"></div></div></div>
      </div>
    </div>
  </div>
</div>
`;

// ─── Shadow DOM ───────────────────────────────────────────────
const host = document.createElement('div');
host.id = 'nextthuxk-host';
host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;font-size:14px;line-height:1.5;color:var(--nx-ink);';
(document.documentElement || document.body).appendChild(host);
const shadow = host.attachShadow({ mode: 'open' });
state.host = host;
state.shadow = shadow;
state.$ = id => shadow.getElementById(id);

shadow.innerHTML = '<style>' + cssText + '</style>' + HTML;
const $ = state.$;

// ─── Toggle ───────────────────────────────────────────────────
function toggle(show) {
  const db = $('nextthuxk-dashboard');
  const btn = $('nextthuxk-launch');
  if (show) { db.classList.add('active'); btn.style.display = 'none'; host.style.pointerEvents = 'all'; }
  else { db.classList.remove('active'); setTimeout(() => { btn.style.display = 'flex'; }, 500); host.style.pointerEvents = 'none'; }
}

// ─── Launch (expose globally for handlePreviewRemove) ─────────
NX.launch = async function launch() {
  if (state.launching) {   // 并发锁：双击刷新/多入口同时触发会双倍抓取流量
    NX.showXkResult({ ok: false, msg: '正在加载中，请稍候…' });
    return;
  }
  state.launching = true;
  const FIN = () => { state.launching = false; };
  state.fetchWarn = '';     // 清空上次加载的不完整提示（本次加载结束时会按实际结果重设）
  const { fmtTime } = NX;
  toggle(true);
  // Resolve semester
  if (!state.SEM) {
    state.SEM = (await store.get('sem')) || '';
    if (!state.SEM) {
      state.SEM = prompt('请输入当前学期（如 2026-2027-1）：', '2026-2027-1') || '2026-2027-1';
    }
  }
  await store.set('sem', state.SEM);
  const SEM0 = state.SEM;   // 学期切换竞态基准：必须在解析后取！（v1.4.4 修复首启永不落缓存）
  const semBtn = $('nextthuxk-sem');
  if (semBtn) semBtn.textContent = state.SEM;
  // Resolve grade
  state.GRADE = (await store.get('grade')) || 0;
  if (!state.GRADE) {
    const g = prompt('请输入你的年级（仅影响 AI 对体育课的推荐，不影响其他功能）\n\n1=大一 2=大二 3=大三 4=大四：');
    if (g) state.GRADE = Math.max(1, Math.min(4, parseInt(g) || 0));
  }
  if (state.GRADE) await store.set('grade', state.GRADE);
  const gradeBtn = $('nextthuxk-grade');
  if (gradeBtn) gradeBtn.textContent = state.GRADE ? ['', '大一', '大二', '大三', '大四'][state.GRADE] : '未设置';
  const listEl = $('nextthuxk-list');
  listEl.innerHTML = '<div class="nx-empty"><span class="nx-spin"></span>&ensp;正在读取数据…</div>';
  try {
    let sd = await store.get('staticData');
    if (sd && sd.ver !== DATA_VER) {
      console.log(TAG, 'data version mismatch, clearing cache');
      sd = null;
      await store.set('staticData', null);
      await store.set('grade', 0);
      state.GRADE = 0;
    }
    const needCatalog = !sd || !sd.courses || sd.courses.length < 100;
    const needVol = !needCatalog && volNeedsRefresh(sd?.volTs);
    // re-merge 数据源：新缓存无 catalog 副本（v1.3.5 起只存 merged courses，存储减半），
    // courses 是 catalog 字段超集，可直接作 merge 输入；旧缓存仍可用 catalog
    let catalog = sd?.catalog || sd?.courses || [];
    let plan = sd?.plan || [];
    let volTs = sd?.volTs || 0;
    if (needCatalog) {
      listEl.innerHTML = '<div class="nx-empty"><span class="nx-spin"></span>&ensp;正在抓取课程目录（全校约 300 页，约需 30-40 秒）…</div>';
      console.log(TAG, 'fetching catalog + plan + volunteer...');
      [plan, catalog] = await Promise.all([
        fetchTrainingPlan().catch(e => { console.warn(TAG, 'plan:', e); return []; }),
        fetchCourseCatalog().catch(e => { console.warn(TAG, 'catalog:', e); return []; }),
      ]);
      volTs = Date.now();
    } else if (sd?.courses?.length) {
      // 缓存命中！无论志愿新旧，先立即用缓存渲染（秒开）；
      // 志愿过期则渲染后后台静默补抓（stale-while-revalidate，不打断界面）
      console.log(TAG, 'using cached', sd.courses.length, 'courses', needVol ? '(vol stale → bg refresh)' : '');
      listEl.innerHTML = '<div class="nx-empty"><span class="nx-spin"></span>&ensp;已读取缓存数据，正在加载实时状态…</div>';
      state.planData = sd.plan || [];
      state.allCourses = sd.courses;
      plan = sd.plan; volTs = sd.volTs || 0;
      if (!needVol) {
        // 志愿也新鲜 → 跳过 merge，仅拉实时状态（已选/队列）
        const [selectedCourses0, qResult0] = await Promise.all([
          fetchSelectedCourses().catch(e => { console.warn(TAG, 'selected:', e); return []; }),
          fetchQueueData(),
        ]);
        state.queueDataMap = qResult0.map;
        state.isQueuePhase = qResult0.phase;
        // 与主路径一致：队列阶段拉候补并标记 isCandidate；非队列阶段清空（防过期候补残留）
        if (state.isQueuePhase) {
          state.candidateCourses = await fetchCandidateCourses();
          if (state.candidateCourses.length) {
            const candCodes0 = new Set(state.candidateCourses.map(c => c.code));
            state.allCourses.forEach(c => { if (candCodes0.has(c.code)) c.isCandidate = true; });
          }
        } else {
          state.candidateCourses = [];
        }
        const selMap0 = {};
        selectedCourses0.forEach(s => { selMap0[s.code + '_' + s.seq] = s; });
        const zyCache0 = (await store.get('zyCache')) || {};
        const cu0 = await resolveCourseZy(state.allCourses, selMap0, zyCache0);
        if (cu0) await store.set('zyCache', zyCache0);
        NX.rebuildCourseMap();
        renderCourses(state.allCourses);
        renderPlan(state.planData);
        renderPreviewTT(
          state.allCourses.filter(c => c.selected).concat(state.candidateCourses.filter(cc => !state.allCourses.some(ac => ac.selected && ac.code === cc.code))),
          '当前已选'
        );
        await renderStageAndDrafts();
        NX.finishLaunch(sd, selectedCourses0.length, volTs, false);
        // 后台静默刷新志愿（不阻塞、失败不打扰）
        fetchVolunteer().then(volData => {
          if (state.SEM !== SEM0) return;   // 学期已切换：弃用，防旧学期数据污染缓存
          state.allCourses = mergeStaticData(state.allCourses, volData, state.planData);
          // isCandidate 是本会话实时标记，不得持久化进缓存（否则退队后仍出现在"已选"筛选）
          const clean = state.allCourses.map(c => { const { isCandidate, ...rest } = c; return rest; });
          return store.set('staticData', { ver: DATA_VER, plan: state.planData, courses: clean, volTs: Date.now(), ts: Date.now() })
            .then(() => {
              console.log(TAG, 'volunteer refreshed in background');
              const ce = state.$('nextthuxk-cache-info');
              if (ce) ce.innerHTML = state.isQueuePhase
                ? '课余量实时数据 · ' + Object.keys(state.queueDataMap).length + '门'
                : '课程数据已更新 · 志愿排队 ' + NX.fmtTime(Date.now());
              filterCourses();
            });
        }).catch(e => console.warn(TAG, 'bg volunteer refresh failed:', e));
        checkUpdate();
        return;
      }
    }
    // 需要 merge: needCatalog / needVol / 旧格式没有 courses 缓存
    const needMerge = needCatalog || needVol || !sd?.courses?.length;
    if (needMerge) {
      const volData = await fetchVolunteer().catch(e => { console.warn(TAG, 'volunteer:', e); return {}; });
      state.planData = plan;
      state.allCourses = mergeStaticData(catalog, volData, plan);
      // 只存 merged courses（不存 catalog 副本，体积约减半）；
      // 若期间用户切换了学期（SEM 变化），弃写缓存以免旧学期数据覆盖新学期空缓存
      if (state.SEM === SEM0) {
        // 同上：isCandidate 为会话实时标记，不进缓存
        const cleanMain = state.allCourses.map(c => { const { isCandidate, ...rest } = c; return rest; });
        sd = { ver: DATA_VER, plan, courses: cleanMain, volTs, ts: needCatalog ? Date.now() : (sd?.ts || Date.now()) };
        await store.set('staticData', sd);
      } else {
        console.warn(TAG, 'cache write skipped: semester switched during load', SEM0, '->', state.SEM);
      }
    }

    const [selectedCourses, qResult] = await Promise.all([
      fetchSelectedCourses().catch(e => { console.warn(TAG, 'selected:', e); return []; }),
      fetchQueueData(),
    ]);
    state.queueDataMap = qResult.map;
    state.isQueuePhase = qResult.phase;

    if (state.isQueuePhase) {
      state.candidateCourses = await fetchCandidateCourses();
    } else {
      state.candidateCourses = [];
    }
    // isCandidate 必须在 mergeStaticData 之后设置，否则新数组会丢失标记
    if (state.candidateCourses.length) {
      const candCodes = new Set(state.candidateCourses.map(c => c.code));
      state.allCourses.forEach(c => { if (candCodes.has(c.code)) c.isCandidate = true; });
    }
    const selMap = {};
    selectedCourses.forEach(s => { selMap[s.code + '_' + s.seq] = s; });
    const zyCacheInit = (await store.get('zyCache')) || {};
    const cacheUpdatedInit = await resolveCourseZy(state.allCourses, selMap, zyCacheInit);
    if (cacheUpdatedInit) await store.set('zyCache', zyCacheInit);
    NX.rebuildCourseMap();   // code+seq → course 索引，渲染/查询统一 O(1)

    renderCourses(state.allCourses);
    renderPlan(state.planData);
    renderPreviewTT(
      state.allCourses.filter(c => c.selected).concat(state.candidateCourses.filter(cc => !state.allCourses.some(ac => ac.selected && ac.code === cc.code))),
      '当前已选'
    );
    await renderStageAndDrafts();
    NX.finishLaunch(sd, selectedCourses.length, volTs, needVol);
  } catch (e) {
    listEl.innerHTML = '<div class="nx-empty nx-st err">' + NX.esc(e.message) + '</div>';
  } finally { FIN(); }
  checkUpdate();
};

// ─── Launch 公共收尾（缓存路径与全量路径复用） ───────────────
async function renderStageAndDrafts() {
  state.stageCart = (await store.get('stageCart')) || [];
  state.savedDrafts = (await store.get('drafts')) || [];
  let migrated = false;
  state.stageCart.forEach(c => {
    if (!c.baseFlag) { const ac = state.allCourses.find(x => x.code === c.code); c.baseFlag = ac ? baseFlag(ac) : 'rx'; migrated = true; }
  });
  state.savedDrafts.forEach(d => d.courses.forEach(c => {
    if (!c.baseFlag) { const ac = state.allCourses.find(x => x.code === c.code); c.baseFlag = ac ? baseFlag(ac) : 'rx'; migrated = true; }
  }));
  if (migrated) { store.set('stageCart', state.stageCart); store.set('drafts', state.savedDrafts); }
  renderStageCart();
  renderDrafts();
}

NX.finishLaunch = function (sd, selCount, volTs, volRefreshed) {
  const { fmtTime } = NX;
  const $ = state.$;
  const cacheEl = $('nextthuxk-cache-info');
  if (cacheEl) {
    const catAge = Math.round((Date.now() - (sd?.ts || Date.now())) / 60000);
    cacheEl.innerHTML = state.isQueuePhase
      ? '课余量实时数据 · ' + Object.keys(state.queueDataMap).length + '门'
      : '课程数据 ' + catAge + '分钟前 · 志愿排队 ' + fmtTime(volTs);
  }
  store.get('config').then(cfg => {
    if (!cfg) return;
    if (cfg.api) $('nextthuxk-api').value = cfg.api;
    if (cfg.model) $('nextthuxk-model').value = cfg.model;
    if (cfg.token) $('nextthuxk-token').value = cfg.token;
    if (cfg.pref) $('nextthuxk-pref').value = cfg.pref;
  });
  console.log(TAG, 'loaded', state.allCourses.length, 'courses (', selCount, 'selected)', volRefreshed ? '(vol refreshed)' : '(vol cached)', state.isQueuePhase ? '(queue phase)' : '');
  if (state.fetchWarn) { showXkResult({ ok: false, msg: state.fetchWarn }); state.fetchWarn = ''; }
  const phaseTag = $('nextthuxk-phase-tag');
  if (phaseTag) {
    if (state.isQueuePhase) { phaseTag.style.display = 'inline'; phaseTag.textContent = '课余量模式'; }
    else { phaseTag.style.display = 'none'; }
  }
  const qRefreshBtn = $('nextthuxk-refresh-queue');
  if (qRefreshBtn) qRefreshBtn.style.display = (state.isQueuePhase || state.candidateCourses.length) ? 'inline-block' : 'none';
  // ─── THU选课社区评价：SWR 加载索引 → 匹配挂载徽章（fail-soft）───
  if (NX.tbEnsureIndex) {
    NX.tbEnsureIndex().then(ok => {
      if (!ok) return;
      const r = NX.tbAttach(state.allCourses);
      console.log(TAG, '[TB] 社区评价匹配', r.matched + '/' + r.total, JSON.stringify(NX.tbState.stats || {}));
      if (r.matched > 0) filterCourses();
    }).catch(() => {});
  }
};

// ─── Event Bindings ───────────────────────────────────────────
$('nextthuxk-launch').onclick = NX.launch;
$('nextthuxk-exit').onclick = () => toggle(false);
$('nextthuxk-refresh').onclick = async () => {
  await store.set('staticData', null);
  NX.launch();
};
$('nextthuxk-refresh-queue').onclick = async () => {
  const btn = $('nextthuxk-refresh-queue');
  if (btn) { btn.textContent = '刷新中…'; btn.disabled = true; }
  const qResult = await NX.fetchQueueData();
  state.queueDataMap = qResult.map;
  state.isQueuePhase = qResult.phase;
  state.candidateCourses = await NX.fetchCandidateCourses();
  const candCodes = new Set(state.candidateCourses.map(c => c.code));
  state.allCourses.forEach(c => { c.isCandidate = candCodes.has(c.code); });
  filterCourses();
  renderPreviewTT(
    state.allCourses.filter(c => c.selected).concat(state.candidateCourses.filter(cc => !state.allCourses.some(ac => ac.selected && ac.code === cc.code))),
    '当前已选'
  );
  if (btn) { btn.textContent = '刷新队列'; btn.disabled = false; }
  showXkResult({ ok: true, msg: '队列数据已刷新 · ' + Object.keys(state.queueDataMap).length + '门课余量 · ' + state.candidateCourses.length + '门我的队列' });
};
$('nextthuxk-search').oninput = NX.debounce(function () {
  try { if (NX.suggestUpdate) NX.suggestUpdate(); } catch (e) {}
  filterCourses();
}, 120);
$('nextthuxk-search').addEventListener('keydown', function (e) {
  try {
    if (NX.suggestKey && NX.suggestKey(e)) e.stopPropagation();
  } catch (err) {}
});
$('nextthuxk-search').addEventListener('blur', function () {
  // 稍作延迟以便点击联想行时先触发 click（面板 pointerdown 已 preventDefault 保焦）
  clearTimeout(NX._sgBlurT);
  NX._sgBlurT = setTimeout(() => { try { NX.suggestHide && NX.suggestHide(); } catch (e) {} }, 150);
});
$('nextthuxk-search-clear').onclick = () => {
  $('nextthuxk-search').value = '';
  filterCourses();
  try { NX.suggestHide && NX.suggestHide(); } catch (e) {}
  $('nextthuxk-search').focus();
};
$('nx-filter-credits').onchange = filterCourses;
$('nx-filter-day').onchange = filterCourses;
$('nx-filter-period').onchange = filterCourses;
$('nx-filter-conflict').onchange = filterCourses;
$('nx-filter-reviews').onchange = filterCourses;
$('nx-sort-by').onchange = filterCourses;
$('nx-filter-tongshi').onchange = filterCourses;
$('nx-filter-feature').onchange = filterCourses;
$('nx-filter-grade-filter').onchange = filterCourses;
$('nx-filter-bksrem').onchange = filterCourses;
$('nx-filter-yjsrem').onchange = filterCourses;
$('nx-filter-xknote').oninput = NX.debounce(NX.filterCourses, 120);
$('nextthuxk-sem').onclick = async () => {
  const s = prompt('修改学期（格式：2026-2027-1）：', state.SEM);
  if (s && s.trim()) {
    state.SEM = s.trim();
    await store.set('sem', state.SEM);
    $('nextthuxk-sem').textContent = state.SEM;
    await store.set('staticData', null);
    // 等待进行中的旧 launch 结束（其会在 SEM 已变时弃写缓存），再以新学期重启
    while (state.launching) await new Promise(r => setTimeout(r, 200));
    NX.launch();
  }
};
$('nextthuxk-grade').onclick = async () => {
  const g = prompt('修改年级（仅影响 AI 对体育课的推荐，不影响其他功能）\n\n1=大一 2=大二 3=大三 4=大四：', String(state.GRADE));
  if (g) {
    state.GRADE = Math.max(1, Math.min(4, parseInt(g) || 3));
    await store.set('grade', state.GRADE);
    $('nextthuxk-grade').textContent = ['', '大一', '大二', '大三', '大四'][state.GRADE];
  }
};
$('nextthuxk-check-update').onclick = async () => {
  await store.set('lastUpdateCheck', 0);
  const btn = $('nextthuxk-check-update');
  btn.textContent = '检查中…';
  btn.disabled = true;
  await checkUpdate();
  btn.textContent = '检查更新';
  btn.disabled = false;
  if (!$('nextthuxk-update-banner') && !$('nextthuxk-danger-banner')) {
    const toast = document.createElement('div');
    toast.id = 'nextthuxk-update-banner';
    toast.innerHTML = '<div class="nx-lg-banner"><span>当前已是最新版本 <b style="color:#07c160">v' + NX.CUR_VER + '</b></span><button onclick="this.closest(\'#nextthuxk-update-banner\').remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:15px;">✕</button></div>';
    $('nextthuxk-dashboard')?.prepend(toast);
  }
};
shadow.querySelectorAll('.nx-chip').forEach(chip => {
  chip.onclick = () => {
    shadow.querySelectorAll('.nx-chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    filterCourses();
  };
});
$('nextthuxk-ai').onclick = NX.callAI;
$('nextthuxk-ai-search').onclick = NX.aiSearch;
$('nextthuxk-save-draft').onclick = NX.saveDraft;
$('nextthuxk-save-selected').onclick = NX.saveSelectedAsDraft;
$('nextthuxk-export').onclick = NX.exportStageCart;
$('nextthuxk-preview-stage').onclick = () => {
  if (!state.stageCart.length) { showXkResult({ ok: false, msg: '暂存区没有课程' }); return; }
  state.previewMode = 'stage';
  renderPreviewTT(state.stageCart, '暂存区预览');
};
$('nextthuxk-import').onclick = () => {
  const area = $('nextthuxk-import-area');
  if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
};
$('nextthuxk-import-confirm').onclick = () => {
  const data = $('nextthuxk-import-data')?.value;
  if (!data) return;
  NX.importToStage(data);
  $('nextthuxk-import-area').style.display = 'none';
  $('nextthuxk-import-data').value = '';
};
$('nextthuxk-import-cancel').onclick = () => {
  $('nextthuxk-import-area').style.display = 'none';
};
$('nextthuxk-preview-reset').onclick = () => {
  renderPreviewTT(
    state.allCourses.filter(c => c.selected).concat(state.candidateCourses.filter(cc => !state.allCourses.some(ac => ac.selected && ac.code === cc.code))),
    '当前已选'
  );
};
// Modal close
$('nextthuxk-modal-close').onclick = () => $('nextthuxk-modal').classList.remove('show');
$('nextthuxk-modal').onclick = e => { if (e.target === $('nextthuxk-modal')) $('nextthuxk-modal').classList.remove('show'); };
_browser.runtime.onMessage.addListener(msg => {
  if (msg.action === 'nextthuxk-toggle') NX.launch();
});

console.log(TAG, 'ready');
})();
