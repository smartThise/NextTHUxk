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

console.log(TAG, 'v' + (NX.CUR_VER || '?') + ' 构建 ' + (NX.BUILD || '?') + ' loading on', location.href);

// ─── Init Config State ────────────────────────────────────────
state.SEM = (location.href.match(/p_xnxq=([^&]+)/) || ['', ''])[1];
state.BASE = location.origin;
state.isZhjwxk = location.hostname === 'zhjwxk.cic.tsinghua.edu.cn';
state.isZhjw = location.hostname === 'zhjw.cic.tsinghua.edu.cn';
// WebVPN (#21)：页面形如 /http|https/<encoded-host>/<原路径>。
// BASE 必须保留编码站点前缀，否则所有请求都会打到 webvpn 根目录下 404。
state.isWebvpn = location.hostname === 'webvpn.tsinghua.edu.cn';
const WEBVPN_PREFIX_RE = /^\/(https?)\/([0-9a-f]{32,})(?=\/|$)/i;
const _wvp = location.pathname.match(WEBVPN_PREFIX_RE);
if (_wvp) state.BASE += '/' + _wvp[1] + '/' + _wvp[2];

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
  <button id="nextthuxk-launch" title="启动 NextTHUxk 下一代选课"><span class="othu-logo" style="font-size:13px"><span class="lp">(</span><span class="word"><i>O</i><i>n</i><i>e</i></span><span></span><span class="lp"> </span><span class="tu">T</span><span class="tu">H</span><span class="tu">U</span><span class="lp">)</span></span><span>NextTHUxk</span></button>
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
      <div class="nx-logo"><span class="othu-logo" style="font-size:14px"><span class="lp">(</span><span class="word"><i>O</i><i>n</i><i>e</i></span><span></span><span class="lp"> </span><span class="tu">T</span><span class="tu">H</span><span class="tu">U</span><span class="lp">)</span></span><span>NextTHUxk</span><span id="nx-build-tag" style="font-size:9px;color:rgba(255,255,255,.35);margin-left:8px;letter-spacing:.5px">${NX.BUILD || ''}</span> <span id="nextthuxk-phase-tag" style="display:none;font-size:11px;background:rgba(47,107,255,.1);color:var(--nx-accent);padding:2px 8px;border-radius:4px;margin-left:6px"></span></div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="nextthuxk-cache-info" style="font-size:11px;color:var(--nx-ink-soft)"></span>
        <button id="nextthuxk-sem" class="nx-ghost-btn" title="点击修改学期"></button>
        <button id="nextthuxk-grade" class="nx-ghost-btn" title="点击修改年级"></button>
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
          <button id="nx-filter-toggle" class="nx-ghost-btn" style="width:100%;margin-top:4px;font-size:11px">筛选 ▾</button>
          <div id="nx-filter-body" style="display:none">
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
          <div style="margin-top:6px;font-size:10px;color:var(--nx-faint)">ℹ️ 北大 / 北外课程时间为通知附件形式（含单双周），无法按星期/大节筛选搜索</div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            <select id="nx-filter-tongshi" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">通识课组: 不限</option><option value="TS1">人文课组</option><option value="TS2">社科课组</option><option value="TS3">艺术课组</option><option value="TS4">科学课组</option></select>
            <select id="nx-filter-feature" class="nx-zy-select" style="flex:1;min-width:120px"><option value="">课程特色: 不限</option><option value="专题研讨课">专题研讨课</option><option value="全外文授课">全外文授课</option><option value="外文授课比例≥50%">双语课(外文≥50%)</option><option value="外文教材">双语课(外文教材)</option><option value="实践课">实践课</option><option value="实验课">实验课</option><option value="挑战性学习">挑战性学习课程</option><option value="文化素质核心课">文化素质核心课</option><option value="文化素质课">文化素质课</option><option value="新生研讨课">新生研讨课</option><option value="混合式教学">混合式教学</option><option value="精品课">精品课</option><option value="认证外文课">认证外文课</option><option value="通识荣誉课">通识荣誉课</option><option value="通识选修课">通识选修课</option><option value="语言类">语言类课程</option><option value="通识英语">通识英语</option><option value="公共英语">公共英语</option></select>
            <select id="nx-filter-grade-filter" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">年级: 不限</option><option value="2026">2026级</option><option value="2025">2025级</option><option value="2024">2024级</option><option value="2023">2023级</option><option value="2022">2022级</option><option value="2021">2021级</option><option value="2020">2020级</option><option value="2019">2019级</option></select>
            <select id="nx-filter-bksrem" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">本科余量: 不限</option><option value=">0">本科余量&gt;0</option></select>
            <select id="nx-filter-yjsrem" class="nx-zy-select" style="flex:1;min-width:100px"><option value="">研院余量: 不限</option><option value=">0">研究生余量&gt;0</option></select>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px"><input type="text" id="nx-filter-xknote" class="nx-inp" style="flex:1;padding:6px 10px;font-size:12px" placeholder="选课文字说明搜索"></div>
          </div>
        </div>
        <div class="nx-list" id="nextthuxk-list"><div class="nx-empty">点击右下角「选」按钮开始</div></div>
      </div>
      <div class="nx-right">
        <div class="nx-sec"><div class="nx-sec-title">我的培养方案</div><div id="nextthuxk-plan" class="nx-plans"><div class="nx-st">等待加载…</div></div><div id="nextthuxk-plan-detail" style="margin-top:8px;font-size:12px;color:var(--nx-ink-soft)"></div></div>
        <div class="nx-sec"><div class="nx-sec-title" style="display:flex;align-items:center;gap:8px">课表预览 <span id="nextthuxk-preview-info" style="font-size:11px;color:var(--nx-ink-soft);font-weight:400"></span><button class="nx-stage-btn" id="nextthuxk-add-manual" style="margin-left:auto">＋ 添加占用</button></div><div id="nextthuxk-preview-tt"><div class="nx-st">选课后自动生成预览</div></div><button class="nx-stage-btn" id="nextthuxk-preview-reset" style="display:none;margin-top:6px">返回当前已选课表</button></div>
        <div class="nx-sec" id="nextthuxk-queue-sec" style="display:none"><div class="nx-sec-title" style="display:flex;align-items:center;gap:8px">候选队列 <span id="nextthuxk-queue-count" style="font-size:11px;color:#ff9f1a;font-weight:400"></span></div><div id="nextthuxk-queue-list"></div></div>
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

// ─── WebVPN 站点识别（#21）────────────────────────────────────
// 解密 /{protocol}/{encoded-host}/ 中的主机段（WebVPN: AES-128-CBC, key=iv="wrdvpnisthebest!"），
// 精确判定 zhjwxk / zhjw；解密失败则退回路径嗅探（xkBks.）。单飞行 promise，launch 前必等。
NX.ensureSiteIdentity = function () {
  if (!state.isWebvpn) return Promise.resolve(true);
  if (state._siteP) return state._siteP;
  state._siteP = (async () => {
    const m = location.pathname.match(WEBVPN_PREFIX_RE);
    let host = '';
    if (m && m[2].length % 2 === 0) {
      try {
        const raw = new Uint8Array(m[2].match(/../g).map(h => parseInt(h, 16)));
        const keyBytes = new TextEncoder().encode('wrdvpnisthebest!');
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
        const pt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: keyBytes }, key, raw));
        host = [...pt].filter(c => c >= ' ' && c <= '~').join('');
      } catch (e) { console.warn(TAG, 'webvpn host decode fail:', e && e.message); }
    }
    if (!state.isZhjwxk && !state.isZhjw) {
      const after = m ? location.pathname.slice(m[0].length) : location.pathname;
      if (/zhjwxk/i.test(host) || /xkBks\./i.test(after)) state.isZhjwxk = true;
      else if (/zhjw\.cic/i.test(host)) state.isZhjw = true;
    }
    console.log(TAG, 'site identity:', state.isZhjwxk ? 'zhjwxk' : state.isZhjw ? 'zhjw' : 'unknown', '| BASE=' + state.BASE, host ? '| host=' + host : '');
    return state.isZhjwxk || state.isZhjw;
  })();
  return state._siteP;
};

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
  try { await NX.ensureSiteIdentity(); } catch (e) {}   // WebVPN 下先识别站点（#21）
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
  state.manualEvents = (await store.get('manualEvents')) || [];
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
    // ── 随时查询模式（xk-1.5.1，OneTHU dev 同款架构）────────────────
    // 启动只拉核心四路（已选/课余量/候补/培养方案缓存），课程列表一律
    // 搜索时服务器随时查——绝不整库预爬（原版 320 页目录 + 220 页志愿
    // ≈ 500+ 请求已删）。staticData 只存培养方案（DATA_VER=6 起旧缓存清空）。
    state.planData = sd?.plan || [];
    listEl.innerHTML = '<div class="nx-empty"><span class="nx-spin"></span>&ensp;正在读取已选/队列…</div>';
    console.log(TAG, 'on-demand mode: fetching selected + candidates + plan');
    // 候选不再 phase 门控（OneTHU getQueueStatus 语义：独立拉取，dlSearch 拿不到
    // 走一级课表 kbSearch 兜底——「看不到队列候选」实锤：xkqkSearch 阶段探测失败
    // 时旧代码直接跳过候选拉取）
    const [selectedCourses, candCourses, planFresh, levelMap, catAttrs] = await Promise.all([
      fetchSelectedCourses().catch(e => { console.warn(TAG, 'selected:', e); return []; }),
      fetchCandidateCourses().catch(e => { console.warn(TAG, 'candidates:', e); return []; }),
      state.planData.length ? Promise.resolve(null) : fetchTrainingPlan().catch(e => { console.warn(TAG, 'plan:', e); return []; }),
      // 课程类型源（必修/限选/任选/体育）：kkxxSearch 行没有类型列，只在一级课表
      NX.fetchLevelTable().catch(e => { console.warn(TAG, 'level table:', e); return {}; }),
      // 分类 tab 属性（必修/限选，方案级小列表）——存档实证的预选权威源，
      // 优先于一级课表/培养方案回填（用户十三报：微积分全家桶全按任选算）
      NX.fetchCategoryAttrs().catch(e => { console.warn(TAG, 'category attrs:', e); return {}; }),
    ]);
    state.levelMap = Object.assign({}, levelMap, catAttrs);   // 分类页属性优先
    if (Object.keys(catAttrs || {}).length) console.log(TAG, 'category attrs:', Object.keys(catAttrs).length, '键');
    // 竞态修复：启动窗口内已渲染的搜索行也补上属性/志愿（此前只补池行）
    if (state._searchRows && state._searchRows.length) {
      NX.applyLevelMap(state._searchRows);
      if (state.volMap) NX.applyVolunteer(state._searchRows, state.volMap);
      NX.filterCourses();
    }
    if (!state.planData.length) state.planData = planFresh || [];
    state.candidateCourses = candCourses;
    // 候补元数据回填（OneTHU 同款：按课号逐门单查一页，非全目录爬）——
    // dlSearch/kbSearch 行缺学分/容量，补齐后概率网格/余量徽章即刻可用
    if (candCourses.length) {
      listEl.innerHTML = '<div class="nx-empty"><span class="nx-spin"></span>&ensp;正在补齐候补课程信息…</div>';
      await NX.backfillCandidateMeta(candCourses).catch(e => console.warn(TAG, 'cand meta:', e));
    }
    // 核心池 = 已选 + 候补（预览/暂存/冲突/AI 的基础；搜索结果运行时带标记渲染）
    const pool = selectedCourses.map(c => ({ ...c, selected: true }));
    state.candidateCourses.forEach(c => {
      if (!pool.some(p => p.code === c.code && String(p.seq) === String(c.seq))) pool.push({ ...c, isCandidate: true });
    });
    await NX.knoteLoad().catch(e => console.warn(TAG, 'knote:', e));   // 课表时间持久缓存先于首渲
    state.allCourses = pool;

    NX.rebuildCourseMap();   // code+seq → course 索引，渲染/查询统一 O(1)
    NX.applyLevelMap(pool);  // 池行类型补齐（必修/限选 chip + 提交选课 flag 用）
    // 课余量/排队：池内按需 API 同步（xkqkSearch 1 + kylSearch 逐门 + 批量排队 1，
    // 替代旧 320 页整库硬爬）；搜索结果余量由 kkxxSearch 行自带。
    // 非阻塞（OneTHU commitCore 语义：UI 先上屏，数据后到回填）——队列接口
    // 再慢/再挂也绝不挡已选/候补首屏渲染。
    (async () => {
      const qResult = await NX.fetchQueueData(pool).catch(e => { console.warn(TAG, 'queue:', e); return { map: {}, phase: false }; });
      state.queueDataMap = qResult.map;
      state.isQueuePhase = qResult.phase;   // OneTHU getXkQueueData 语义：xkqkSearch gridData 有无（预选阶段候补非空不代表排队阶段——旧 || 候选兜底把预选也判成排队，志愿同步永远不跑）
      if (state.isQueuePhase) {
        // 队列阶段：池行余量合并（卡片 余X/Y 徽章、可选筛选、概率网格用）
        pool.forEach(c => {
          const q = state.queueDataMap[c.code + '_' + NX.normSeq(c.seq)];
          if (q) { c.available = q.qRemaining > 0; if (q.qRemaining > 0) c.remaining = q.qRemaining; c.capacity = q.qCapacity; }
        });
      } else {
        // 非队列阶段（预选/志愿期）：池内按需志愿统计 → 概率网格数据源
        // （OneTHU dev 的 getXkVolunteer 是死码——这里真接上；池内逐门单查，
        // 绝不整库硬爬）
        try {
          const vol = await NX.fetchVolunteer(pool);
          state.volMap = Object.assign({}, state.volMap, vol);   // 全局持久：搜索/跳转新行可取
          NX.applyVolunteer(pool, vol);
        } catch (e) { console.warn(TAG, 'volunteer:', e); }
      }
      const qBtn = state.$('nextthuxk-phase-tag');
      if (qBtn) {
        if (state.isQueuePhase) { qBtn.style.display = 'inline'; qBtn.textContent = '课余量模式'; }
        else qBtn.style.display = 'none';
      }
      NX.filterCourses();
      NX.renderPreviewTT(NX.getPreviewCourses(), (state.$('nextthuxk-preview-info') || {}).textContent || '当前已选');
      NX.renderQueueSection();
      try { NX.renderStageCart(); } catch (e) {}   // 暂存条概率跟志愿数据一起到（不刷=点之前全灰无数据，点一下才绿）
    })();
    if (state.SEM === SEM0) {
      await store.set('staticData', { ver: DATA_VER, plan: state.planData, ts: Date.now() });
    } else {
      console.warn(TAG, 'cache write skipped: semester switched during load', SEM0, '->', state.SEM);
    }
    renderPlan(state.planData);
    renderPreviewTT(pool.filter(c => c.selected).concat(state.candidateCourses), '当前已选');
    NX.renderQueueSection();
    await renderStageAndDrafts();
    NX.backfillStageRows();   // 暂存行不在池（重载后池只含已选/候补）→ 概率/时间全断：此时 stageCart 才真正加载完
    NX.finishLaunch({ ts: Date.now() }, selectedCourses.length, 0, false);
    NX.filterCourses();      // 初始落点：浏览模式第 1 页（1 个请求），随时查询
  } catch (e) {
    listEl.innerHTML = '<div class="nx-empty nx-st err">' + NX.esc(e.message) + '</div>';
  } finally { FIN(); }
  checkUpdate();
};

// ─── Launch 公共收尾（缓存路径与全量路径复用） ───────────────
// 暂存行按需补拉：暂存课不在池（重载后池只含已选/候补）→ 概率/时间全断。
// 必须在 renderStageAndDrafts 之后调用（stageCart 那时才从 storage 加载完）。
NX.backfillStageRows = function () {
  const stageMiss = (state.stageCart || []).filter(s => !state.allCourses.some(ac => ac.code === s.code && String(ac.seq || '0') === String(s.seq || '0')));
  if (!stageMiss.length) return;
  (async () => {
    for (let i = 0; i < stageMiss.length; i += 5) {
      await Promise.all(stageMiss.slice(i, i + 5).map(async s => {
        try {
          let rows = (await NX.serverSearch({ kch: s.code }).catch(() => ({}))).rows || [];
          if (!rows.length && s.name) rows = (await NX.serverSearch({ kcm: s.name }).catch(() => ({}))).rows || [];
          // 必须抓暂存课序号的那一行（航空体育（男）有 3 个课序，抓错行=志愿
          // 多段不盲配=永远无数据，用户点一下搜索把对号行带进来才绿）
          const hit = rows.find(r => r.code === s.code && String(r.seq || '0') === String(s.seq || '0'))
            || rows.find(r => r.code === s.code && NX.normSeq(r.seq) === NX.normSeq(s.seq))
            || rows.find(r => r.code === s.code);
          if (hit) {
            NX.mergeServerRows([hit]);
            const same = state.allCourses.filter(x => x.code === s.code);
            if (state.volMap) NX.applyVolunteer(same, state.volMap);   // volMap 已到就立即套（不等下次渲染）
          }
        } catch (e) { console.warn(TAG, 'stage 行补拉:', s.code, e); }
      }));
    }
    state.selVersion = (state.selVersion || 0) + 1;
    NX.rebuildCourseMap();
    try { NX.renderStageCart(); } catch (e) {}
    try { NX.filterCourses(); } catch (e) {}
    console.log(TAG, 'stage 行补拉完成:', stageMiss.length, '门');
  })();
};

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
  if (cacheEl) NX.renderCacheInfo(selCount);
  NX.startVolAutoSync();   // 志愿/余量定时自动同步（按钮已删，顶栏提示下次时间）
  store.get('config').then(cfg => {
    if (!cfg) return;
    if (cfg.api) $('nextthuxk-api').value = cfg.api;
    if (cfg.model) $('nextthuxk-model').value = cfg.model;
    if (cfg.token) $('nextthuxk-token').value = cfg.token;
    if (cfg.pref) $('nextthuxk-pref').value = cfg.pref;
  });
  console.log(TAG, 'on-demand launch done:', selCount, 'selected,', state.candidateCourses.length, 'candidates,', state.isQueuePhase ? 'queue phase' : 'browse mode');
  // 已选课时间回填（外校课时间在说明列——OneTHU backfillSelTimes 同款，后台静默）
  if (NX.backfillSelTimes) NX.backfillSelTimes().catch(e => console.warn(TAG, '已选时间回填失败:', e));
  if (state.fetchWarn) { showXkResult({ ok: false, msg: state.fetchWarn }); state.fetchWarn = ''; }
  const phaseTag = $('nextthuxk-phase-tag');
  if (phaseTag) {
    if (state.isQueuePhase) { phaseTag.style.display = 'inline'; phaseTag.textContent = '课余量模式'; }
    else { phaseTag.style.display = 'none'; }
  }
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

// ─── 顶栏缓存信息（含下次志愿同步时间提示）─────────────────────
NX.renderCacheInfo = function (selCount) {
  const cacheEl = state.$('nextthuxk-cache-info');
  if (!cacheEl) return;
  const next = state._nextVolSyncAt ? ' · 志愿按教务检查点(8/12/16/20点)同步，下次 ' + NX.fmtTime(new Date(state._nextVolSyncAt)) : '';
  cacheEl.innerHTML = (state.isQueuePhase
    ? '课余量池内同步 ' + Object.keys(state.queueDataMap).length + ' 门 · 候补 ' + state.candidateCourses.length + ' 门 · 随时查询'
    : '随时查询模式 · 已选 ' + (selCount || state.allCourses.filter(c => c.selected).length) + ' 门 · 候补 ' + state.candidateCourses.length + ' 门') + next;
};

// 志愿/余量按教务固定检查点自动同步（插件本源，v1.5.0 update.js volNeedsRefresh 同款：
// 每日 8/12/16/20 点）。按钮已删，顶栏提示下次检查点时间；到点自动同步。
NX.VOL_CHECKPOINTS = [8, 12, 16, 20];
NX.volNeedsRefresh = function (ts) {   // v1.5.0 原样移植
  if (!ts) return true;
  const now = new Date();
  let lastUpdate = new Date(now);
  lastUpdate.setHours(NX.VOL_CHECKPOINTS[0], 0, 0, 0);
  for (let i = NX.VOL_CHECKPOINTS.length - 1; i >= 0; i--) {
    const t = new Date(now);
    t.setHours(NX.VOL_CHECKPOINTS[i], 0, 0, 0);
    if (now >= t) { lastUpdate = t; break; }
    if (i === 0) {
      lastUpdate = new Date(now);
      lastUpdate.setDate(lastUpdate.getDate() - 1);
      lastUpdate.setHours(NX.VOL_CHECKPOINTS[NX.VOL_CHECKPOINTS.length - 1], 0, 0, 0);
    }
  }
  return ts < lastUpdate.getTime();
};
NX.nextVolCheckpoint = function (now) {
  const d = new Date(now);
  for (const h of NX.VOL_CHECKPOINTS) {
    const t = new Date(d);
    t.setHours(h, 0, 0, 0);
    if (t > d) return t;
  }
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  t.setHours(NX.VOL_CHECKPOINTS[0], 0, 0, 0);
  return t;
};
NX.startVolAutoSync = function () {
  if (state._volSyncStarted) return;
  state._volSyncStarted = true;
  const schedule = () => {
    const next = NX.nextVolCheckpoint(Date.now());
    state._nextVolSyncAt = next.getTime();
    NX.renderCacheInfo();
    state._volSyncT = setTimeout(async () => {
      try { await NX.syncQueueAndVol(); } catch (e) { console.warn(TAG, '志愿检查点同步:', e); }
      state._lastVolSyncAt = Date.now();
      schedule();
    }, Math.max(1000, next.getTime() - Date.now()));
  };
  schedule();
};

// ─── Event Bindings ───────────────────────────────────────────
$('nextthuxk-launch').onclick = NX.launch;
$('nextthuxk-exit').onclick = () => toggle(false);

// 筛选栏折叠（用户三十六报：固定筛选占太多竖向空间，课程卡片展示区太少）
{
  const ft = $('nx-filter-toggle'), fb = $('nx-filter-body');
  const apply = open => {
    fb.style.display = open ? 'block' : 'none';
    ft.textContent = open ? '收起筛选 ▴' : '展开筛选 ▾';
    store.set('filtersOpen', open);
  };
  store.get('filtersOpen').then(v => apply(!!v)).catch(() => apply(false));
  ft.onclick = () => apply(fb.style.display === 'none');
}

NX.syncQueueAndVol = async function () {
  const qResult = await NX.fetchQueueData(state.allCourses);
  state.queueDataMap = qResult.map;
  state.isQueuePhase = qResult.phase;   // OneTHU getXkQueueData 语义：xkqkSearch gridData 有无（预选阶段候补非空不代表排队阶段——旧 || 候选兜底把预选也判成排队，志愿同步永远不跑）
  state.candidateCourses = await NX.fetchCandidateCourses();
  if (state.candidateCourses.length) await NX.backfillCandidateMeta(state.candidateCourses).catch(e => console.warn(TAG, 'cand meta:', e));
  const candKeys = new Set(state.candidateCourses.map(c => c.code + '_' + String(c.seq || '0')));
  state.allCourses.forEach(c => { c.isCandidate = candKeys.has(c.code + '_' + String(c.seq || '0')); });
  // 新候选入池（kbSearch 兜底来的不在池里——不入池则队列 chip 可见性断）
  state.candidateCourses.forEach(c => {
    if (!state.allCourses.some(ac => ac.code === c.code && String(ac.seq || '0') === String(c.seq || '0'))) state.allCourses.push({ ...c, isCandidate: true });
  });
  // 池行余量合并（同 launch）
  state.allCourses.forEach(c => {
    const q = state.queueDataMap[c.code + '_' + NX.normSeq(c.seq)];
    if (q) { c.available = q.qRemaining > 0; if (q.qRemaining > 0) c.remaining = q.qRemaining; c.capacity = q.qCapacity; }
  });
  state.selVersion = (state.selVersion || 0) + 1;   // 预览缓存失效（候选集变了）
  NX.rebuildCourseMap();
  filterCourses();
  try { NX.renderStageCart(); } catch (e) {}   // 暂存条余量/概率随队列同步刷新
  NX.renderQueueSection();
  renderPreviewTT(NX.getPreviewCourses(), '当前已选');
  NX.renderCacheInfo();
};
$('nextthuxk-search').oninput = NX.debounce(function () {
  try { if (NX.suggestUpdate) NX.suggestUpdate(); } catch (e) {}
  filterCourses();
}, 120);
$('nextthuxk-search').addEventListener('keydown', function (e) {
  try {
    if (NX.suggestKey && NX.suggestKey(e)) { e.stopPropagation(); return; }
  } catch (err) {}
  // 回车立即查询（跳过 500ms 防抖，OneTHU 同款显式提交语义）
  if (e.key === 'Enter') {
    e.preventDefault();
    try { NX.filterCourses(); NX.scheduleServerSearch(true); } catch (err) {}
  }
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
$('nextthuxk-add-manual').onclick = NX.showManualEventModal;
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
_browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'nextthuxk-toggle') NX.launch();
  if (msg.action === 'nextthuxk-ping') sendResponse({ ok: true, ver: NX.CUR_VER || '?', zhjwxk: !!state.isZhjwxk });
});

console.log(TAG, 'ready');
})();
