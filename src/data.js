// ═══════════════════════════════════════════════════════════════
// NextTHUxk — Data: 数据抓取与解析（课程目录、志愿、选退课 API）
// ═══════════════════════════════════════════════════════════════
var NX = NX || {};

// ─── Parsing Helpers ──────────────────────────────────────────

NX.parsePlan = function (doc) {
  const rows = doc.querySelectorAll('table#kcTable tr');
  const out = [];
  let sem = '', season = '';
  for (const row of rows) {
    const tds = row.querySelectorAll('td');
    if (!tds.length) continue;
    const cells = [...tds].map(td => td.textContent.trim().replace(/\s+/g, ' '));
    for (const td of tds) {
      const t = td.textContent.trim();
      const sm = t.match(/(\d{4}-\d{4}学年)/); if (sm) sem = sm[1];
      const sn = t.match(/^(秋|春|夏)$/);         if (sn) season = sn[1];
    }
    const code = cells.find(c => /^\d{8}$/.test(c));
    if (!code) continue;
    const name = cells.find(c => c.length > 1 && !/^\d+$/.test(c) && !['必修','限选','任选','秋','春','夏'].includes(c) && !c.includes('学年'));
    const attr = cells.find(c => ['必修','限选','任选'].includes(c));
    const credit = cells.find(c => /^\d{1,2}(\.\d)?$/.test(c) && c !== code);
    const group = cells.find(c => c.length > 2 && !['必修','限选','任选'].includes(c) && !/^\d/.test(c) && !c.includes('学年') && c !== name);
    if (name) out.push({ semester: sem + ' ' + season, code, name: name.replace(/\s+/g, ''), attr: attr || '', credits: parseFloat(credit) || 0, group: group || '' });
  }
  return out;
};

NX.parseFullProgram = function (doc) {
  const rows = doc.querySelectorAll('#content_1 table tbody tr.trr2');
  const out = [];
  let grp = '', attr = '';
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td')].map(td => td.textContent.trim());
    if (cells.length >= 9) { grp = cells[0]; attr = cells[1] || attr; }
    const idx = cells.length >= 9 ? 2 : 0;
    const code = cells[idx], name = cells[idx + 1];
    if (code && name && /^\d+$/.test(code))
      out.push({ code, name, credits: parseFloat(cells[idx + 2]) || 0, attr, group: grp, semester: '' });
  }
  return out;
};

NX.parseCatalog = function (doc) {
  const out = [];
  doc.querySelectorAll('tr.trr2').forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length < 11) return;
    const cell = i => (tds[i]?.textContent || '').trim().replace(/\s+/g, ' ');
    const code = cell(1);
    const name = cell(3);
    // 外校课程课号带前缀：PK=北大、GPK=北大研、BW=北外（如 BW3w0007 含小写
    // 字母）。OneTHU 同款规则：纯字母数字且至少含一个数字——旧版 /^\d+$/
    // 把 PK/GPK/BW 行全吃了（「北大北外课搜不到」实锤）。
    if (!code || !name || !/^[A-Za-z0-9]+$/.test(code) || !/\d/.test(code)) return;
    const bksCap = parseInt(cell(6)) || 0;
    const bksRem = parseInt(cell(7)) || 0;
    const teacherLink = tds[5]?.querySelector('a[href*="showJsDetail"]');
    const teacherHref = teacherLink?.getAttribute('href') || '';
    const teacherIdMatch = teacherHref.match(/p_jsh=([^&]+)/);
    const teacherId = teacherIdMatch ? teacherIdMatch[1] : '';
    const courseLink = tds[3]?.querySelector('a[href*="showToXs"]');
    const detailHref = courseLink?.getAttribute('href') || '';
    // v1.5.0 同款：行内扫课程属性格（kkxxSearch 网格带「课程属性」列，v1.5.0
    // 用 cells.find 扫。重写时被我硬编码 attr:'' 只靠一级课表回填——培养方案
    // 外的课（英文班 90 课序等）attr 恒空 → baseFlag 落 rx → 概率网格只剩
    // 「任选」单行，用户十二报实锤。一级课表仍随后回填/覆盖权威类型。）
    const attrCell = [...tds].map(td => (td.textContent || '').trim()).find(c => c === '必修' || c === '限选' || c === '任选');
    out.push({
      code,
      seq: cell(2),
      name,
      credits: parseFloat(cell(4)) || 0,
      teacher: cell(5),
      teacherId,
      department: cell(0),
      time: cell(10),
      capacity: bksCap,
      remaining: bksRem,
      available: bksRem > 0,
      selected: false,
      queue: '',
      group: cell(0),
      attr: attrCell || '',   // v1.5.0 行内扫描（data.js:24 同款）——培养方案外的课不再塌成「任选」
      detailUrl: detailHref,
      note: cell(11),   // 说明列 = 外校真实时间载体（OneTHU parseXkCatalogPage td(11) 同款；clockRangesOf 读此字段）
      xkTextNote: cell(11),
      courseFeature: cell(12),
      grade: cell(13),
      tongshiGroup: cell(18),
      gradCapacity: parseInt(cell(8)) || 0,
      gradRemaining: parseInt(cell(9)) || 0,
      volRequired: '', volElective: '', volOptional: '', volSports: '',
    });
  });
  return out;
};

NX.parseVolFromHtml = function (html) {
  const map = {};
  // 捕获第4列开课系（错页校验用：拉回来的页里得有本院系的行才算数）
  const regex = /\[\s*"(\d+)"\s*,\s*"([^"]*?)"\s*,\s*"[^"]*?"\s*,\s*"([^"]*?)"\s*,\s*"(\d*)"\s*,\s*"(\d*)"\s*,\s*"(.*?)"\s*,\s*"(.*?)"\s*,\s*"(.*?)"\s*\]/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    // 墓碑行过滤（用户十七报贴教务原始行实锤：10780102 全零 = 已满课
    // 不在志愿池）——不过滤的话下游会拿 kkxx 容量造「0/100 宽松 + 满屏
    // 假 100%」。报名>0 的 0 容量行保留（超载=真信号）。键同步归一。
    if (!(parseInt(m[4]) || 0) && !(parseInt(m[5]) || 0)) continue;
    const key = m[1] + '_' + NX.normSeq(m[2]);
    map[key] = {
      code: m[1], seq: m[2], department: m[3],
      capacity: parseInt(m[4]) || 0,
      applied: parseInt(m[5]) || 0,
      volRequired: m[6],
      volElective: m[7],
      volOptional: m[8],
    };
  }
  return map;
};

NX.parseVolSportsFromHtml = function (html) {
  const map = {};
  const regex = /\[\s*"(\d+)"\s*,\s*"([^"]*?)"\s*,\s*"[^"]*?"\s*,\s*"(\d*)"\s*,\s*"(\d*)"\s*,\s*"(.*?)"\s*\]/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (!(parseInt(m[3]) || 0) && !(parseInt(m[4]) || 0)) continue;   // 墓碑行同滤 + 键归一
    const key = m[1] + '_' + NX.normSeq(m[2]);
    map[key] = {
      code: m[1], seq: m[2],
      capacity: parseInt(m[3]) || 0,
      applied: parseInt(m[4]) || 0,
      volSports: m[5],
    };
  }
  return map;
};

// ─── Course Type Helpers ──────────────────────────────────────

NX.courseFlag = function (course) {
  const a = (course.attr || '').trim();
  if (a === '限选') return 'xx';
  if (a === '任选') return 'rx';
  if (a === '体育' && !NX.NOT_SPORTS_NAME.test(course.name || '')) return 'ty';   // 排除表课的体育 attr 是分类页混列误标（航空体育→按任选）
  if (a === '必修') return 'bx';
  return 'rx';
};

// 体育课判定（用户二十三报规则重写）：航空体育、书院专项体育、
// 体育学术课（概论/管理/课程与教学论/科技前沿…）都不是体育课——
// 不走体育志愿/体育选课，按任选/必修/限选处理。用户贴 Ty 页实锤
// 这些课混在体育部列表里（容量>0 但三志愿全 0，没人走体育通道）。
// 判定优先级：一级课表/zyMap 属性 > 体育部+非排除名 > 其他一律非体育。
NX.NOT_SPORTS_NAME = /航空体育|书院专项体育|体育(概论|管理|课程与教学论|科技前沿)/;
NX.isSportsCourse = function (course) {
  if (!course) return false;
  // 排除表最优先（用户三十六报「航空体育不算体育！」）：分类页/Ty 页把这些课
  // 标成体育属性混列（二十三报实锤：容量>0 三志愿全 0，没人走体育通道），
  // attr 误标时排除表必须仍然生效
  if (NX.NOT_SPORTS_NAME.test(course.name || '')) return false;
  if ((course.attr || '') === '体育' || course.typeLabel === '体育' || course.typeCode === 'ty') return true;
  const dept = course.department || '';
  if (!dept.includes('体育') && !dept.includes('体武')) return false;   // 名字带体育但院系不是体育部的不算（如「体育社会学」在社科学院）
  return true;   // 体育部常规体育课（体育(N)、游泳、篮球、跆拳道…）
};

NX.baseFlag = function (course) {
  if (NX.isSportsCourse(course)) return 'ty';
  return NX.courseFlag(course);
};

NX.allowedFlags = function (bf) {
  if (bf === 'ty') return ['ty'];
  if (bf === 'bx') return ['bx', 'xx', 'rx'];
  if (bf === 'xx') return ['xx', 'rx'];
  return ['rx'];
};

NX.typeCodeToFlag = function (typeCode) {
  return typeCode === '006' ? 'bx' : typeCode === '008' ? 'xx' : typeCode === '007' ? 'rx' : typeCode === 'ty' ? 'ty' : 'bx';
};

NX.zyTypeOf = function (course) {
  if ((course.typeLabel === '体育' || course.typeCode === 'ty') && !NX.NOT_SPORTS_NAME.test(course.name || '')) return 'ty';
  return { '006': 'bx', '008': 'xx', '007': 'rx' }[course.typeCode] || 'bx';
};

// ─── Data Fetching ────────────────────────────────────────────

// 从列表页 HTML 解析分页控件："第 1 页 / 共 304 页（共 6,078 条记录）"
NX.parsePagerInfo = function (html) {
  const pages = /共\s*(\d+)\s*页/.exec(html);
  const total = /共\s*([\d,，]+)\s*条/.exec(html);
  return {
    pages: pages ? parseInt(pages[1]) : 0,
    total: total ? parseInt(total[1].replace(/[,，]/g, '')) : 0,
  };
};

NX.fetchTrainingPlan = async function () {
  const { state, fetchPage, parsePlan, parseFullProgram } = NX;
  const { SEM, BASE, isZhjwxk, isZhjw } = state;
  if (isZhjwxk) {
    const html = await fetchPage(BASE + '/jhBks.vjhBksPyfakcbBs.do?m=showBksZxZdxjxjhXmxqkclist&p_xnxq=' + SEM);
    return parsePlan(new DOMParser().parseFromString(html, 'text/html'));
  }
  if (isZhjw) {
    const listHtml = await fetchPage(BASE + '/jhBks.vjhBksPyfakcbBs.do?m=grPyfabks&theRole=bks&theModule=pyfa');
    if (listHtml.includes('accessDenied')) return [];
    const m = /fajhh=(\d+)/.exec(listHtml);
    if (!m) return [];
    const html = await fetchPage(BASE + '/jhBks.vjhBksPyfakcbBs.do?m=index2&theModule=pyfa&p_fajhh=' + m[1]);
    return parseFullProgram(new DOMParser().parseFromString(html, 'text/html'));
  }
  return [];
};

// 从查询页 HTML 提取 form[name=frm] 全部字段默认值（v1.3.11：完整表单 POST，1:1 模拟 UI）
NX.extractFormFields = function (html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const form = doc.querySelector('form[name="frm"]');
    if (!form) return null;
    const fields = {};
    form.querySelectorAll('input[name]').forEach(el => { fields[el.name] = el.value || ''; });
    form.querySelectorAll('select[name]').forEach(el => {
      const opt = el.querySelector('option[selected]') || el.querySelector('option');
      fields[el.name] = opt ? (opt.value || '') : '';
    });
    return fields;
  } catch (e) { return null; }
};

// catalog 查询的 POST 基础字段：结构字段照抄表单，查询条件一律置空（等价"全部"），
// 分批时仅 p_kkdwnm 填值。pathContent 置空规避 GBK 编码差异。
NX.catalogPostFields = function (formFields, page, dept, token) {
  const f = {
    m: 'kkxxSearch',
    page: String(page),
    token: token || formFields.token || '',
    'p_sort.p1': '', 'p_sort.p2': '',
    'p_sort.asc1': formFields['p_sort.asc1'] || 'true',
    'p_sort.asc2': formFields['p_sort.asc2'] || 'true',
    p_xnxq: NX.state.SEM,
    pathContent: '', showtitle: '',
    p_kch: '', p_kcm: '', p_zjjsxm: '', p_xkwzsm: '',
    p_kkdwnm: dept || '',
    p_kcflm: '', p_skxq: '', p_skjc: '', p_rxklxm: '',
    p_kctsm: '', p_ssnj: '', p_bkskyl_ig: '', p_yjskyl_ig: '',
  };
  return new URLSearchParams(f);
};
NX.parseDeptCodes = function (html) {
  const sel = /<select[^>]*name="p_kkdwnm"[^>]*>([\s\S]*?)<\/select>/i.exec(html);
  if (!sel) return [];
  const out = [];
  const re = /<option[^>]*value=(["'])(.*?)\1/gi;   // 兼容单/双引号属性
  let m;
  while ((m = re.exec(sel[1])) !== null) {
    const v = m[2].trim();
    if (v) out.push(v);
  }
  return out;
};

NX.fetchCourseCatalog = async function () {
  const { state, fetchPage, parseCatalog, pagedFetch, parsePagerInfo } = NX;
  if (!state.isZhjwxk) return [];
  const { SEM, BASE } = state;
  const firstUrl = BASE + '/xkBks.vxkBksJxjhBs.do?m=kkxxSearch&p_xnxq=' + SEM;
  let firstHtml = '';
  try { firstHtml = await fetchPage(firstUrl); }
  catch (e) { console.warn(NX.TAG, 'catalog first page:', e); return []; }
  const pager = parsePagerInfo(firstHtml);
  if (pager.pages > 0) console.log(NX.TAG, 'catalog pager: 共', pager.pages, '页 /', pager.total, '条');

  const parseCat = html => {
    const batch = parseCatalog(new DOMParser().parseFromString(html, 'text/html'));
    return { items: batch, hasData: batch.length > 0 };
  };

  // v1.3.13：并发高速抓取（v1.3.5 同速，30ms 轻节流 ≈ 33 req/s）+ 缺页自动补抓。
  // 实测：教务对单一查询深分页（~294 页后）固定返回空壳页，可达数据收敛 ~5843 门；
  // 6078 为服务器计数口径（含不可分页获取的行），不再强求（fetchWarn 门槛 5800）。
  const all = await pagedFetch({
    firstHtml,
    fetchPage: p => fetchPage(BASE + '/xkBks.vxkBksJxjhBs.do?m=kkxxSearch&p_xnxq=' + SEM + '&page=' + p + '&_t=' + Date.now()),
    parse: parseCat,
    maxPages: 320, concurrency: 5, throttle: 30,
    dedupe: c => c.code + '_' + c.seq,
    expectPages: pager.pages, label: 'catalog',
  });

  if (pager.total > 0) {
    if (all.length < Math.min(5800, pager.total)) {
      console.warn(NX.TAG, 'catalog got', all.length, '/', pager.total, '— below 5800, data may be incomplete');
      NX.state.fetchWarn = '课程数据仅 ' + all.length + ' 门（低于 5800），可能不完整（详见 Console）';
    } else if (all.length < pager.total) {
      console.log(NX.TAG, 'catalog got', all.length, '/', pager.total, '（服务器计数含不可分页行，已达标）');
    } else {
      console.log(NX.TAG, 'catalog COMPLETE:', all.length, '/', pager.total);
    }
  }
  console.log(NX.TAG, 'catalog total:', all.length, 'courses');
  return all;
};

// ─── 志愿统计（池内按需，v1.5.1 重写）──────────────────────────
// 旧版 tbzySearchBR/Ty 全库硬爬 ≤220 页（用户定稿：任何数据不整库预爬）。
// OneTHU dev 的 getXkVolunteer 同为死码（volMap 只清空不填充）。
// 新版：池内课程逐门按课号单查（教务全站检索组件同构，tbzySearch 系
// 表单与 kkxxSearch 同款 p_kch 课号参数；体育课另查 tbzySearchTy）。
// 1 课 1-2 请求、4 并发 30ms 错峰、失败容忍（0 行/HTTP 错 = 该课无数据，
// 概率显示「无数据」，绝不回退硬爬）。非队列阶段（预选/志愿期）才有意义；
// 队列阶段概率走排队/余量模型（queueDataMap），跳过志愿同步。
// ─── 志愿统计（院系定向实时拉取，v1.5.1 三改）──────────────────────
// 数据源 = 教务「按人头统计」页（xkBksZytjb.do）：
//   BR（tbzySearchBR）9 列：课号/序号/课名/院系/容量/已报/必修/限选/任选志愿
//   Ty（tbzySearchTy）6 列：课号/序号/课名/容量/已报/体育志愿
// 关键事实（存档表单 AI选课分析系统/志愿查询_files/xkBks.xkBksZytjb.html）：
//   ① 该页唯一筛选字段是 p_lrdwnm = 院系代码下拉（86 项，值=数字码），
//      没有课号筛选——之前猜的 p_kch 被服务端无视，返回的是未过滤第 1 页，
//      部分无关课数据混进池（课表冒错概率/卡片空白的一堆怪象根因）。
//   ② Ty 页表单无 p_lrdwnm（体育志愿无院系轴）→ 池含体育课时全量拉
//      ≤20 页（v1.5.0 同款 maxPages）。
// 拉取策略 = 实时院系定向：池内课程按院系去重 → 逐院系 GET
//   （v1.5.0 同款：首页无 page 无 token，翻页 &page=N）→ 院系内分页
//   通常 1-3 页。搜索结果行遇到未拉院系按需补拉（防抖、不重拉）。
// 阶段门控：仅非队列阶段（预选/志愿期）——队列阶段概率走排队/余量模型。
NX.DEPT_CODES = {
  '建筑学院': '000',
  '城规系': '001',
  '建筑系': '002',
  '土木系': '003',
  '水利系': '004',
  '环境学院': '005',
  '机械系': '012',
  '精仪系': '013',
  '能动系': '014',
  '车辆学院': '015',
  '工业工程系': '016',
  '电机系': '022',
  '电子系': '023',
  '计算机系': '024',
  '自动化系': '025',
  '集成电路学院': '026',
  '航院': '031',
  '工物系': '032',
  '化工系': '034',
  '材料学院': '035',
  '数学系': '042',
  '物理系': '043',
  '化学系': '044',
  '生命学院': '045',
  '地学系': '046',
  '交叉信息院': '047',
  '高研院': '048',
  '经管学院': '051',
  '公管学院': '059',
  '金融学院': '060',
  '中文系': '063',
  '外文系': '064',
  '法学院': '066',
  '新闻学院': '067',
  '马克思主义学院': '068',
  '人文学院': '069',
  '社科学院': '070',
  '体育部': '072',
  '图书馆': '075',
  '艺教中心': '078',
  '美术学院': '080',
  '统计系': '088',
  '建管系': '091',
  '天文系': '092',
  '安全学院': '093',
  '人工智能学院': '094',
  '心理系': '095',
  '卫健学院': '096',
  '苏世民书院': '097',
  '建筑技术': '099',
  '核研院': '101',
  '教育学院': '103',
  '训练中心': '151',
  '电工电子中心': '155',
  '学生部': '207',
  '武装部': '209',
  '教务处': '254',
  '研究生院': '255',
  '校医院': '305',
  '药学院': '402',
  '临床医学院': '405',
  '软件学院': '410',
  '网络研究院': '412',
  '地区研究院': '413',
  '航发院': '415',
  '语言中心': '420',
  '新雅书院': '470',
  '致理书院': '471',
  '日新书院': '472',
  '未央书院': '473',
  '行健书院': '475',
  '求真书院': '476',
  '为先书院': '477',
  '秀钟书院': '478',
  '笃实书院': '479',
  '紫荆书院': '482',
  '自强书院': '483',
  '水木书院': '484',
  '数学教学中心': '492',
  '医学院': '500',
  '基础医学院': '501',
  '生医工程学院': '502',
  '医疗管理学院': '503',
  '国际研究生院': '599',
  '清华大学全球创新学院': '601'
};

// 院系名 → 码（精确优先，双向 includes 兜底；外校课无志愿数据自然 miss）
NX.deptCodeOf = function (dept) {
  const d = (dept || '').trim();
  if (!d) return '';
  if (NX.DEPT_CODES[d]) return NX.DEPT_CODES[d];
  const hit = Object.keys(NX.DEPT_CODES).find(k => d.includes(k) || k.includes(d));
  return hit ? NX.DEPT_CODES[hit] : '';
};

// 定向课号志愿查询（用户二十报：070 分院视图不含心智探秘——开课系
// 显示社科学院但分院页就是没有它这行；不分院的完整列表里有）。BR 表
// 单自带 p_kch 课号查询框：POST token+p_kch 即可精确拉该课全部课序的
// 志愿行。只保留请求课号的行，服务器若忽略 p_kch 返回大列表也不污染。
NX.fetchVolCourse = async function (code) {
  const { state, fetchPage } = NX;
  if (!state.isZhjwxk) return {};
  const url = state.BASE + '/xkBks.xkBksZytjb.do?m=tbzySearchBR&p_xnxq=' + state.SEM;
  const fh = await fetchPage(url);
  const token = (fh.match(/name="token"\s+value="([^"]+)"/) || [])[1] || '';
  const html = await fetchPage(state.BASE + '/xkBks.xkBksZytjb.do', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    // 存档 doQuery 实锤：新查询 page="-1"（重置分页语义），p_sort.asc*
    // 真值是 "true" 不是 "asc"——此前非法表单被服务器整体拒绝（0 行）
    body: 'm=tbzySearchBR&page=-1&token=' + encodeURIComponent(token)
      + '&p_xnxq=' + encodeURIComponent(state.SEM)
      + '&p_sort.p1=&p_sort.p2=&p_sort.asc1=true&p_sort.asc2=true'
      + '&p_kch=' + encodeURIComponent(code) + '&p_kcm=&p_lrdwnm=',
  });
  const all = NX.parseVolFromHtml(html);
  const out = {};
  for (const k of Object.keys(all)) if (all[k].code === String(code)) out[k] = all[k];
  console.log(NX.TAG, 'volunteer 定向课号', code + ':', Object.keys(out).length, '行');
  return out;
};

NX.fetchVolunteer = async function (courses, opts) {
  const { state, fetchPage, pagedFetch } = NX;
  if (!state.isZhjwxk) return {};
  const { SEM, BASE } = state;
  const force = !!(opts && opts.force);
  const done = state._volDepts || (state._volDepts = {});   // 本会话已拉院系（refreshSelected 用 force 重拉）
  const pool = (courses || []).filter(c => c && c.code && !c.isCandidate);
  const map = {};
  const deptCodes = new Set();
  pool.forEach(c => {
    const code = NX.deptCodeOf(c.department);
    if (code && (force || !done[code])) deptCodes.add(code);
  });
  const hasSports = pool.some(c => NX.isSportsCourse(c));
  const parseVol = parseFn => html => {
    const b = parseFn(html); const arr = Object.values(b);
    return { items: arr, hasData: arr.length > 0 };
  };
  let reqs = 0;
  const fetched = [];   // 实际拉到数据的院系（日志用）
  // BR：逐院系（已拉的跳过；失败容忍不记 done，下次可重试）。
  // 错页校验（用户十九报：070 被启动池同步标 done 但页里没有心智
  // 探秘——错页/过滤器丢失污染 done 后按需补拉全部空转）：拉回来
  // 的页里至少要有一行真属于该院系，否则不标 done、数据也不进 map。
  for (const code of deptCodes) {
    try {
      const first = BASE + '/xkBks.xkBksZytjb.do?m=tbzySearchBR&p_xnxq=' + SEM + '&p_lrdwnm=' + code;
      const fh = await fetchPage(first);
      reqs++;
      const pg = NX.parsePagerInfo(fh);
      const items = await pagedFetch({
        firstHtml: fh,
        fetchPage: p => p <= 1 ? Promise.resolve(fh) : fetchPage(first + '&page=' + p + '&_t=' + Date.now()),
        parse: parseVol(NX.parseVolFromHtml),
        maxPages: 25, concurrency: 3, throttle: 50,
        dedupe: v => v.code + '_' + v.seq,
        expectPages: pg.pages, label: 'vol-BR-' + code,
      });
      const valid = items.some(v => NX.deptCodeOf(v.department) === code);
      if (!valid) {
        console.warn(NX.TAG, 'volunteer 错页：', code, '返回', items.length, '行但无本院系课程，不标记（会话过期/过滤器丢失？）');
        continue;   // 不进 map、不标 done，下次可重试
      }
      items.forEach(v => { map[v.code + '_' + NX.normSeq(v.seq)] = v; });   // 键归一（前导0课序）
      done[code] = Date.now();
      fetched.push(code);
    } catch (e) { console.warn(NX.TAG, 'volunteer dept ', code, e); }
  }
  // Ty：体育志愿（无院系轴，全量 ≤20 页；force 重拉）
  if (hasSports && (force || !done.ty)) {
    try {
      const first = BASE + '/xkBks.xkBksZytjb.do?m=tbzySearchTy&p_xnxq=' + SEM;
      const fh = await fetchPage(first);
      reqs++;
      const pg = NX.parsePagerInfo(fh);
      const items = await pagedFetch({
        firstHtml: fh,
        fetchPage: p => p <= 1 ? Promise.resolve(fh) : fetchPage(first + '&page=' + p + '&_t=' + Date.now()),
        parse: parseVol(NX.parseVolSportsFromHtml),
        maxPages: 20, concurrency: 3, throttle: 50,
        dedupe: v => v.code + '_' + v.seq,
        expectPages: pg.pages, label: 'vol-Ty',
      });
      items.forEach(v => {
        const k = v.code + '_' + NX.normSeq(v.seq);
        map[k] = Object.assign(
          { capacity: 0, applied: 0, volRequired: '', volElective: '', volOptional: '' }, map[k], v);
      });
      done.ty = Date.now();
    } catch (e) { console.warn(NX.TAG, 'volunteer Ty:', e); }
  }
  console.log(NX.TAG, 'volunteer (dept-sync): ', Object.keys(map).length, 'entries, depts', fetched.join(',') || '(无新院系)');
  return map;
};

// 课序号归一：教务各页前导零不一致（志愿统计 "1" vs 选课页 "01"）
NX.normSeq = function (s) { return String(parseInt(s, 10) || 0); };

// 志愿数据合并进池行（卡片概率/暂存概率网格用）
// 段匹配规则（用户实锤「5/2」张冠李戴事故）：志愿统计页的课序号与选课页
// 前导零不一致（存档 Ty 行 "10720011","1" vs 一级课表/搜索行 "01"）——
// ① 原始键 ② 归一化键（parseInt 去前导零）③ 逐行归一比对；
// 段对不上且该课多段时**宁缺毋滥**（旧 byCode 任意取首段 = 拿别的班的
// 容量/报名人数冒充本班——卡片出现莫名其妙的比例），单段才允许回退。
NX.applyVolunteer = function (courses, volData) {
  const byCodeAll = {};
  for (const v of Object.values(volData || {})) (byCodeAll[v.code] = byCodeAll[v.code] || []).push(v);
  const norm = s => String(parseInt(s, 10) || 0);
  (courses || []).forEach(c => {
    const rows = byCodeAll[c.code] || [];
    let v = volData[c.code + '_' + (c.seq || '0')]
      || volData[c.code + '_' + norm(c.seq)]
      || rows.find(r => norm(r.seq) === norm(c.seq))
      || (rows.length === 1 ? rows[0] : null);   // 多段不盲配
    if (v) {
      c.volRequired = v.volRequired; c.volElective = v.volElective; c.volOptional = v.volOptional;
      c.volSports = v.volSports || '';
      c.volCapacity = v.capacity; c.volApplied = v.applied || 0;   // 不回退 c.capacity：缺志愿行=无数据，不是 0/N 宽松
    } else {
      c.volRequired = ''; c.volElective = ''; c.volOptional = ''; c.volSports = '';
    }
  });
  return courses;
};

// ─── Course Selection/Drop API ────────────────────────────────

// 通用：fetch GET 搜索页拿 token → fetch POST 表单 → 从响应 HTML 检测结果
NX.fetchFormSubmit = async function (searchUrl, postFields) {
  const { state, fetchPage } = NX;
  const BASE = state.BASE;
  try {
    // 1) GET 搜索页，提取 token
    const html = await fetchPage(searchUrl);
    const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
    if (!tokenMatch) return { ok: false, msg: '无法获取 token' };

    // 2) POST 表单数据
    postFields.token = tokenMatch[1];
    const resp = await fetch(BASE + '/xkBks.vxkBksXkbBs.do', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(postFields),
    });
    if (!resp.ok) return { ok: false, msg: 'HTTP ' + resp.status };

    // 3) 读响应 HTML，检测是否需要排队
    const buf = await resp.arrayBuffer();
    const respText = new TextDecoder('gbk').decode(buf);
    if (respText.includes('accessDenied')) return { ok: false, msg: '操作被拒绝（会话失效）' };
    if (respText.includes('加入队列成功')) return { ok: true, submitted: true, msg: '已加入候补队列' };
    if (respText.includes('选课成功')) return { ok: true, submitted: true, msg: '选课成功' };

    // 4.5) 业务拒绝字典（OneTHU 实证扩充，xk-1.5.1）：命中即明确失败并带出可读
    // 文案——此前未知响应一律 ok:true 假成功（时间冲突/学分上限/先修不符等拒绝
    // 页全中招，用户还以为选上了）。成功串已先行短路，此处只看剩余页。
    const alertMsg = (respText.match(/alert\(["']([^"']{2,160})["']/) || [])[1];
    const REJECT_RE = /时间冲突|上课时间冲突|先修|不符合|不允许|无法选课|选课失败|提交失败|余量不足|课余量不足|人数已满|已选满|请先|验证码|超出|达不到|不满足|存在冲突|已选过|重复选课|操作被拒绝|被拒绝|失败|上限|已选课程学分/;
    if (REJECT_RE.test(respText)) {
      const plain = respText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const snippet = (plain.match(/[^ ]{0,20}(?:冲突|先修|不符合|不允许|无法|失败|不足|已满|超出|请先|验证码|拒绝)[^ ]{0,30}/) || [])[0];
      return { ok: false, msg: ((alertMsg || snippet || '选课被教务拒绝').trim()).slice(0, 120) };
    }

    // 4) 检测是否弹出"是否排队"的 confirm
    // 服务器返回 confirm("课程xxx 已满...是否排队？") → 需要再次 POST m=saveBksKcDl
    // 关键：第二次 POST 必须用响应页面里的新 token（第一次的 token 已被消耗）
    const isQueueConfirm = respText.includes('是否排队') && respText.includes('saveBksKcDl');
    if (isQueueConfirm) {
      await new Promise(r => setTimeout(r, 1500));
      // 从第一次 POST 响应中提取新 token（原 token 已被消耗）
      const newTokenMatch = respText.match(/name="token"\s+value="([^"]+)"/);
      if (!newTokenMatch) {
        // 旧 token 一次性已消耗，复用必失败——显式报错而非静默复用（OneTHU 实证修正）
        return { ok: false, msg: '排队页未返回新 token，请稍后重试' };
      }
      const queueFields = { ...postFields, m: 'saveBksKcDl' };
      queueFields.token = newTokenMatch[1];
      const queueResp = await fetch(BASE + '/xkBks.vxkBksXkbBs.do', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(queueFields),
      });
      if (!queueResp.ok) return { ok: false, msg: '排队提交 HTTP ' + queueResp.status };
      const qBuf = await queueResp.arrayBuffer();
      const qText = new TextDecoder('gbk').decode(qBuf);
      if (qText.includes('加入队列成功')) return { ok: true, submitted: true, msg: '已加入候补队列' };
      if (qText.includes('选课成功')) return { ok: true, submitted: true, msg: '选课成功' };
      const qAlert = (qText.match(/alert\(["']([^"']{2,160})["']/) || [])[1];
      return { ok: false, unknown: true, msg: qAlert || '排队提交后响应无法识别' };
    }

    // 未知响应：不再假成功——标记 unknown 交调用方轮询确认（OneTHU xk-1.5.1）
    return {
      ok: false, submitted: false, unknown: true,
      msg: alertMsg || ('响应无法识别：' + respText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)),
    };
  } catch (e) {
    console.error('[NextTHUxk] fetchFormSubmit ERROR:', e);
    return { ok: false, msg: e.message };
  }
};

// 轮询等待：总时长 >= 原固定 sleep，提前满足提前返回（平均省 1s+，最坏不劣于原来）
NX.pollUntil = async function (fn, delay, tries) {
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, delay));
    if (await fn()) return true;
  }
  return false;
};

NX.submitCourse = async function (code, seq, zy, flag) {
  const { state, fetchFormSubmit, fetchSelectedCourses } = NX;
  const { SEM, BASE } = state;
  zy = zy || 3;
  flag = flag || 'bx';
  const mSearch = { bx: 'bxSearch', xx: 'xxSearch', rx: 'rxSearch', ty: 'tySearch' }[flag] || 'bxSearch';
  const mVal = { bx: 'saveBxKc', xx: 'saveXxKc', rx: 'saveRxKc', ty: 'saveTyKc' }[flag] || 'saveBxKc';
  const extra = flag === 'rx' ? '&is_zyrxk=1' : '';
  const searchUrl = BASE + '/xkBks.vxkBksXkbBs.do?m=' + mSearch + '&p_xnxq=' + SEM + '&tokenPriFlag=' + flag + extra;
  const idName = { bx: 'p_bxk_id', xx: 'p_xxk_id', rx: 'p_rx_id', ty: 'p_rxTy_id' }[flag];
  const zyName = { bx: 'p_bxk_xkzy', xx: 'p_xxk_xkzy', rx: 'p_rx_xkzy', ty: 'p_rxTy_xkzy' }[flag];
  const fields = { m: mVal, p_xnxq: SEM, tokenPriFlag: flag, page: '' };
  fields[idName] = SEM + ';' + code + ';' + seq + ';';
  fields[zyName] = String(zy);
  if (flag === 'rx') { fields.is_zyrxk = '1'; fields.p_rxklxm = ''; }
  if (flag === 'ty') { fields.rxTyType = ''; }
  const res = await fetchFormSubmit(searchUrl, fields);
  if (!res.submitted) {
    // 未知响应兜底（xk-1.5.1）：响应页可能是非标准成功文案——仍轮询已选/候补
    // 确认后再下结论；确认未命中才把（含拒绝字典文案的）失败交还给用户。
    if (!res.unknown) return res;
    const hitSelUnknown = () => fetchSelectedCourses().then(sel =>
      sel.some(s => s.code === code && String(s.seq) === String(seq)));
    if (await NX.pollUntil(hitSelUnknown, 700, 3)) return { ok: true, msg: '选课成功' };
    const candUnknown = await NX.fetchCandidateCourses();
    if (candUnknown.some(s => s.code === code && String(s.seq) === String(seq))) return { ok: true, msg: '已加入候补队列' };
    return { ok: false, msg: res.msg };
  }
  // 轮询验证：已选列表或候补队列中出现即视为成功（总等待 ≥ 原 2s 固定延时）
  const hitSel = () => fetchSelectedCourses().then(sel =>
    sel.some(s => s.code === code && String(s.seq) === String(seq)));
  if (await NX.pollUntil(hitSel, 700, 3)) return { ok: true, msg: '选课成功' };
  // 已满课提交后可能进入候补队列而非直接选上
  const cand = await NX.fetchCandidateCourses();
  const foundQueue = cand.some(s => s.code === code && String(s.seq) === String(seq));
  return foundQueue ? { ok: true, msg: '已加入候补队列' } : { ok: false, msg: '选课未生效，请确认课程类型是否正确' };
};

NX.dropCourse = async function (code, seq) {
  const { state, fetchFormSubmit, fetchSelectedCourses } = NX;
  const { SEM, BASE } = state;
  // 判断是候补课程还是已选课程
  const cand = state.candidateCourses || [];
  const isQueue = cand.some(c => c.code === code && String(c.seq) === String(seq));
  if (isQueue) {
    // 候补课程：m=dlDelete，从 dlSearchTab 页面拿 token
    const searchUrl = BASE + '/xkBks.vxkBksXkbBs.do?m=dlSearchTab&p_xnxq=' + SEM;
    const res = await fetchFormSubmit(searchUrl, {
      m: 'dlDelete', p_xnxq: SEM, page: '',
      'p_del_id': SEM + ';' + code + ';' + seq + ';',
    });
    if (!res.submitted) return res;
    const gone = () => NX.fetchCandidateCourses().then(newCand =>
      !newCand.some(s => s.code === code && String(s.seq) === String(seq)));
    if (await NX.pollUntil(gone, 500, 3)) return { ok: true, msg: '已退出候补队列' };
    return { ok: false, msg: '退出队列未生效，请稍后重试' };
  }
  // 已选课程：m=deleteYxk
  const searchUrl = BASE + '/xkBks.vxkBksXkbBs.do?m=yxSearchTab&p_xnxq=' + SEM + '&tokenPriFlag=yx';
  const res = await fetchFormSubmit(searchUrl, {
    m: 'deleteYxk', p_xnxq: SEM, page: '',
    tokenPriFlag: 'yx', tk: '', jhzy_kch: '', jhzy_kxh: '', jhzy_zy: '',
    'p_del_id': SEM + ';' + code + ';' + seq + ';',
  });
  if (!res.submitted) return res;
  const gone = () => fetchSelectedCourses().then(sel =>
    !sel.some(s => s.code === code && String(s.seq) === String(seq)));
  if (await NX.pollUntil(gone, 500, 3)) return { ok: true, msg: '退选成功' };
  return { ok: false, msg: '退选未生效，请稍后重试' };
};

NX.changeVolunteer = async function (code, seq, targetZy) {
  const { state, fetchFormSubmit } = NX;
  const { SEM, BASE } = state;
  const searchUrl = BASE + '/xkBks.vxkBksXkbBs.do?m=yxSearchTab&p_xnxq=' + SEM + '&tokenPriFlag=yx';
  const res = await fetchFormSubmit(searchUrl, {
    m: 'changeZY', p_xnxq: SEM, tokenPriFlag: 'yx', page: '',
    tk: '', jhzy_kch: code, jhzy_kxh: seq, jhzy_zy: String(targetZy),
  });
  if (!res.submitted) return { ok: false, msg: '志愿调整提交失败' };
  await new Promise(r => setTimeout(r, 1000));
  return { ok: true, msg: '志愿已调整为第' + targetZy + '志愿' };
};

NX.fetchSelectedCourses = async function () {
  const { state, fetchPage } = NX;
  if (!state.isZhjwxk) return [];
  const { SEM, BASE } = state;
  try {
    const _t = Date.now();
    const html = await fetchPage(BASE + '/xkBks.vxkBksXkbBs.do?m=yxSearchTab&p_xnxq=' + SEM + '&tokenPriFlag=yx&_t=' + _t);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const zyMap = {};
    const zyRe = /\[\s*"(\d+),(\d+)"\s*,\s*"(\d+)"\s*,\s*"(\d+)"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"\s*\]/g;
    let zm;
    while ((zm = zyRe.exec(html)) !== null) {
      const [_, code, seq, zy, typeCode, isSports] = zm;
      const typeLabel = isSports === '是' ? '体育' : ({ '006': '必修', '008': '限选', '007': '任选' }[typeCode] || '');
      zyMap[code + '_' + seq] = { zy: parseInt(zy), typeCode, typeLabel };
    }
    const rows = doc.querySelectorAll('tr.trr2');
    const selected = [];
    rows.forEach(row => {
      const radio = row.querySelector('input[name="p_del_id"]');
      const val = radio?.getAttribute('value') || '';
      const parts = val.split(';');
      const code = parts[1] || '';
      const seq = parts[2] || '';
      if (!code) return;
      const tds = row.querySelectorAll('td');
      const cell = i => (tds[i]?.textContent || '').trim().replace(/\s+/g, ' ');
      const zyInfo = zyMap[code + '_' + seq] || {};
      const cell2 = cell(2) || '';
      const zyFromCell = cell2.match(/第([一二三])志愿/);
      const isSportsCourse = !cell(1) && zyFromCell;
      const zyNum = zyInfo.zy || (zyFromCell ? ({ '一': 1, '二': 2, '三': 3 }[zyFromCell[1]]) : 0);
      const typeLabel = isSportsCourse ? '体育' : (cell(1) || zyInfo.typeLabel || '');
      // 2026-2027-1 起已选表列序变更（OneTHU 样本实证）：课号独立成列 →
      // cell(3)=课号、cell(4)=课名。自适应取第一个非纯数字候选格，新旧列序
      // 通吃——否则预览课表整屏课号（OneTHU 实测事故，同款）。
      const nameCell = [cell(4), cell(3)].find(x => x !== '' && !/^\d+$/.test(x)) || '';
      selected.push({
        code, seq, name: nameCell || cell(1), teacher: cell(7) || cell(2),
        time: cell(6) || cell(3), credits: parseFloat(cell(8) || cell(4)) || 0,
        typeLabel,
        zy: zyNum,
        typeCode: isSportsCourse ? 'ty' : (zyInfo.typeCode || ''),
      });
    });
    console.log(NX.TAG, 'selected courses:', selected.length);
    if (!selected.length) {
      // 兜底（v1.4.9）：已选查询页拿不到行（选课阶段切换/页面变更/WebVPN）时，
      // 改用一级课表重建已选清单（code+seq+类型全集，志愿号走 zyCache/手填）
      console.warn(NX.TAG, 'yxSearchTab empty → falling back to level table');
      return await NX.fallbackSelectedFromLevelTable();
    }
    return selected;
  } catch (e) {
    console.warn(NX.TAG, 'fetch selected:', e);
    try { return await NX.fallbackSelectedFromLevelTable(); } catch (e2) { return []; }
  }
};

// ─── 已选课程兜底：一级课表（v1.4.9）─────────────────────────
NX.fallbackSelectedFromLevelTable = async function () {
  const map = await NX.fetchLevelTable();
  const out = [];
  for (const key in map) {
    const i = key.indexOf('_');
    const code = key.slice(0, i);
    const seq = key.slice(i + 1) || '0';
    const info = map[key];
    out.push({
      code, seq, name: '', teacher: '', time: '', credits: 0,
      typeLabel: info.typeLabel, typeCode: info.typeCode || '',
      zy: 0, fromLevelTable: true,
    });
  }
  console.log(NX.TAG, 'selected fallback (level table):', out.length);
  return out;
};

// （此位置曾有 encodeURIComponent 旧版 fetchLevelTable 死副本，已删——真实实现在下方 applyLevelMap 区块）
NX.fetchCourseDetail = async function (teacherId, code) {
  const { state, fetchPage } = NX;
  if (!state.isZhjwxk) return null;
  const url = state.BASE + '/js.vjsKcbBs.do?m=showToXs&p_id=' + encodeURIComponent(teacherId + ';' + code);
  try {
    const html = await fetchPage(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('form table table.table-striped') || doc.querySelector('form table.table-striped') || doc.querySelector('table.table-striped');
    if (!table) return null;
    const rows = table.querySelectorAll('tr');
    const fields = {};
    const skipLabels = new Set(['课程名', '课程号']);
    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 2) return;
      const l1 = tds[0]?.textContent?.trim().replace(/：/g, '') || '';
      const v1 = tds[1]?.textContent?.trim() || '';
      if (l1 && v1 && l1.length < 20 && !/^\d+$/.test(l1) && !skipLabels.has(l1)) fields[l1] = v1;
      if (tds.length >= 4) {
        const l2 = tds[2]?.textContent?.trim().replace(/：/g, '') || '';
        const v2 = tds[3]?.textContent?.trim() || '';
        if (l2 && v2 && l2.length < 20 && !/^\d+$/.test(l2) && !skipLabels.has(l2)) fields[l2] = v2;
      }
    });
    return fields;
  } catch (e) { console.warn(NX.TAG, 'detail fetch:', e); return null; }
};

// ─── Queue Data (课余量 + 排队人数) ──────────────────────────

// ─── 课余量/排队（xk-1.5.1 改造：池内按需 API 同步，替代整库 320 页硬爬）──
// 旧版 kylSearch 全量翻页（≤320 页 ≈ 325 请求）已删——任何数据都不整库预爬。
// 新流（传池内课程）：xkqkSearch 首页 1 个请求（阶段探测 + token）→ 池内课程
// 逐门 kylSearch POST（p_kch 精确，1 课 1 请求，5 并发微错峰）→ 排队人数
// selectBksDlCount 批 100（池内 keys，通常 1 个请求）。搜索结果的余量由
// kkxxSearch 行自带（remaining/gradRemaining 列），不经此路。
NX.fetchQueueData = async function (courses) {
  const { state, fetchPage } = NX;
  if (!state.isZhjwxk) return { map: {}, phase: false };
  const { SEM, BASE } = state;
  try {
    const firstHtml = await fetchPage(BASE + '/xkBks.vxkBksXkbBs.do?m=xkqkSearch&p_xnxq=' + SEM);
    if (!firstHtml.includes('gridData') || firstHtml.includes('accessDenied')) return { map: {}, phase: false };
    const gridRegex = /\[\s*"(\d+)"\s*,\s*"([^"]*?)"\s*,\s*"[^"]*?"\s*,\s*"(\d*)"\s*,\s*"(\d*)"\s*,\s*"[^"]*?"\s*,\s*"[^"]*?"\s*\]/g;
    const map = {};
    let gm;
    while ((gm = gridRegex.exec(firstHtml)) !== null) {
      const key = gm[1] + '_' + (NX.normSeq ? NX.normSeq(gm[2]) : gm[2]);   // 段号归一（前导零）
      map[key] = { code: gm[1], seq: gm[2], qCapacity: parseInt(gm[3]) || 0, qRemaining: parseInt(gm[4]) || 0, qQueue: 0 };
    }
    const token = (firstHtml.match(/name="token"\s+value="([^"]+)"/) || [])[1] || '';
    const formAction = BASE + '/xkBks.vxkBksJxjhBs.do';
    if (token) {
      // 池内课程逐门精确查（p_kch）：1 课 1 请求，绝不翻页连发
      const codes = [...new Set((courses || []).map(c => String(c.code || '').trim()).filter(Boolean))];
      const kylPost = async code => {
        const body = new URLSearchParams({
          m: 'kylSearch', page: '1', token,
          'p_sort.p1': '', 'p_sort.p2': '', 'p_sort.asc1': 'true', 'p_sort.asc2': 'true',
          p_xnxq: SEM, pathContent: '',
          p_kch: code, p_kxh: '', p_kcm: '', p_skxq: '', p_skjc: '', bt: '',
        });
        const resp = await fetch(formAction, { method: 'POST', credentials: 'include', body });
        const buf = await resp.arrayBuffer();
        return new TextDecoder('gbk').decode(buf);
      };
      await NX.runPool(codes, 5, async (code, idx) => {
        await new Promise(r => setTimeout(r, 30 * (idx % 5)));   // 微错峰（40/74 教训）
        try {
          const html = await kylPost(code);
          if (!html.includes('gridData')) return;
          let pm;
          const re = /\[\s*"(\d+)"\s*,\s*"([^"]*?)"\s*,\s*"[^"]*?"\s*,\s*"(\d*)"\s*,\s*"(\d*)"\s*,\s*"[^"]*?"\s*,\s*"[^"]*?"\s*\]/g;
          while ((pm = re.exec(html)) !== null) {
            const key = pm[1] + '_' + (NX.normSeq ? NX.normSeq(pm[2]) : pm[2]);
            if (!map[key]) map[key] = { code: pm[1], seq: pm[2], qCapacity: parseInt(pm[3]) || 0, qRemaining: parseInt(pm[4]) || 0, qQueue: 0 };
          }
        } catch (e) { console.warn(NX.TAG, 'kyl code', code, e); }
      });
    }
    // 排队人数（selectBksDlCount 批 100；只查池内 keys；连败 3 批熔断）
    const parts = Object.values(map).map(q => SEM + '_' + q.code + '_' + q.seq);
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < parts.length; i += batchSize) batches.push(parts.slice(i, i + batchSize));
    let qFailStreak = 0; let qFailWarned = false;
    await NX.runPool(batches, 4, async kcMsg => {
      if (qFailStreak >= 3) return;
      try {
        const qResp = await fetch(BASE + '/xkBks.vxkBksXkbBs.do?m=selectBksDlCount&kc_message=' + encodeURIComponent(kcMsg.join(';')), {
          credentials: 'include',
        });
        if (!qResp.ok) { qFailStreak++; return; }
        const qText = new TextDecoder('gbk').decode(await qResp.arrayBuffer());
        const qData = JSON.parse(qText);
        if (Array.isArray(qData)) {
          qData.forEach(obj => {
            const key = obj.kch + '_' + NX.normSeq(obj.kxh);   // 课序号归一（前导零跨页不一致）
            if (map[key]) map[key].qQueue = parseInt(obj.dlrs) || 0;
          });
          qFailStreak = 0;
        }
      } catch (e) {
        qFailStreak++;
        if (!qFailWarned && qFailStreak >= 3) {
          qFailWarned = true;
          console.warn(NX.TAG, 'queue count batches keep failing — session may be invalidated');
          if (!NX.state.fetchWarn) NX.state.fetchWarn = '排队人数获取失败（WebVPN 会话已失效）——请退出 WebVPN 重新登录';
        }
      }
    });
    console.log(NX.TAG, 'queue data (pool-sync):', Object.keys(map).length, 'courses');
    return { map, phase: true };
  } catch (e) {
    console.warn(NX.TAG, 'queue data fetch:', e);
    return { map: {}, phase: false };
  }
};

// ─── Candidate Courses (候补队列) ─────────────────────────────

NX.fetchCandidateCourses = async function () {
  const { state, fetchPage } = NX;
  if (!state.isZhjwxk) return [];
  const { SEM, BASE } = state;
  try {
    // 双解码抓取（OneTHU reqwest 自动转码等价）：GBK/UTF-8 各解各解析，
    // 按行数选优——站点无论哪种编码，行都在，「吃行」不可能再发生。
    // dlSearch 阶段未开放时服务器直接 500（用户实机日志实锤）——任何失败
    // 都不提前放弃，降级进 kbSearch 课表兜底链
    let dual = null;
    try {
      dual = await NX.fetchPageDual(BASE + '/xkBks.vxkBksXkbBs.do?m=dlSearch&p_xnxq=' + SEM);
    } catch (e) {
      console.warn(NX.TAG, 'dlSearch failed (' + e.message + ') → 课表兜底');
    }
    const parseDl = html => {
      const out = [];
      const rowRe = /<tr[^>]*class="trr[12]"[^>]*>([\s\S]*?)<\/tr>/g;
      let m;
      while ((m = rowRe.exec(html)) !== null) {
        const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => t[1].replace(/<[^>]*>/g, '').trim());
        if (tds.length < 7) continue;
        const td = i => tds[i] || '';
        const typeLabel = td(0);
        const zyStr = td(1);
        const code = td(2);
        const name = td(3);
        const seq = td(4);
        const queueTotal = parseInt(td(5)) || 0;
        const myPos = parseInt(td(6)) || 0;
        const time = td(7) || '';
        const teacher = td(8) || '';
        if (!code || !name) continue;
        const zyNum = zyStr.match(/第([一二三1-3])志愿/);   // 一二三/1-3 两种写法都收
        const typeCode = typeLabel === '必修' ? '006' : typeLabel === '限选' ? '008' : '007';
        out.push({
          code, seq: seq || '0', name, teacher, time,
          credits: 0, typeLabel, typeCode,
          zy: zyNum ? ({ '一': 1, '二': 2, '三': 3 }[zyNum[1]] || parseInt(zyNum[1]) || 3) : 3,
          queueTotal, myPos,
          isCandidate: true,
          selected: false,
        });
      }
      return out;
    };
    if (dual && dual.gbk.includes('accessDenied') && dual.utf8.includes('accessDenied')) return [];
    const candidates = dual ? NX.pickDecoded(parseDl, dual) : [];
    console.log(NX.TAG, 'candidate courses:', candidates.length);
    // dlSearch 零行 → 一级课表（kbSearch）兜底（OneTHU getQueueStatus 语义：
    // 「队列功能未开放」提示页/任何零行场景——用户语义：官网课表能看到排队课
    // 就从课表爬；课表也没有就安静空着不报错）
    if (!candidates.length) {
      try {
        // kbSearch 双解码：脚本块「候选：」中文标记只在正确解码下能被正则命中
        // （「候选：」→ 错误解码下变乱码 → 0 命中，天然判别器）
        const kbDual = await NX.fetchPageDual(BASE + '/xkBks.vxkBksXkbBs.do?m=kbSearch&p_xnxq=' + SEM);
        const kbCand = NX.pickDecoded(h => NX.parseTimetableCandidates(h), kbDual);
        console.log(NX.TAG, 'dlSearch empty → kbSearch candidates:', kbCand.length);
        if (kbCand.length) return kbCand;
        // 诊断（OneTHU zhjwxkDebug 语义）：0 命中时把页面形态留在控制台
        console.warn(NX.TAG, 'kbSearch 0 candidates: gbk len', kbDual.gbk.length, 'utf8 len', kbDual.utf8.length, 'p_id blocks:', (kbDual.gbk.match(/p_id=/g) || []).length);
      } catch (e) { console.warn(NX.TAG, 'kbSearch fallback:', e); }
    }
    return candidates;
  } catch (e) {
    console.warn(NX.TAG, 'candidate fetch:', e);
    return [];
  }
};

// 候补课元数据回填（OneTHU 同款：每门按课号单查一页，非全目录爬）：
// dlSearch/kbSearch 行天生缺学分/容量——逐门 kch 精确查一页补齐，
// 概率网格/学分统计/余量徽章即刻可用。
// ─── 一级课表（课程类型源：必修/限选/任选/体育）──────────────────
// v1.5.0 fetchLevelTable 移植 + 编码修正：pathContent='一级课表' 必须 GBK
// 百分号编码（OneTHU client.ts:1221 注释——UTF-8 直发教务解乱码取不到页，
// v1.5.0 用的 encodeURIComponent 是 UTF-8 → 一级课表页从来拿不到 →
// 目录行 attr 恒空 → 必修/限选/体育 chip 全空转）。1 请求，launch 拉 1 次。
NX.fetchLevelTable = async function () {
  const { state } = NX;
  if (!state.isZhjwxk) return {};
  const { SEM, BASE } = state;
  try {
    const url = BASE + '/xkBks.vxkBksXkbBs.do?p_xnxq=' + SEM + '&pathContent=' + NX.gbkPercentEncode('一级课表');
    const dual = await NX.fetchPageDual(url).catch(async () => null);
    const html = dual ? (dual.gbk.includes('trr2') || dual.gbk.includes('trr1') ? dual.gbk : dual.utf8) : await NX.fetchPage(url);
    const map = {};
    const rowRe = /<tr[^>]*class="trr[12]"[^>]*>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(t => t[1].replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' '));
      let code = '', seq = '', attr = '';
      for (let i = 0; i < cells.length; i++) {
        if (/^\d{8}$/.test(cells[i]) && !code) {
          code = cells[i]; seq = cells[i + 1] || '0';
          attr = cells[i + 2] || '';
          if (!/^(必修|限选|任选)$/.test(attr)) attr = '';
        }
      }
      if (!code) continue;
      const isSports = !attr;
      const typeLabel = isSports ? '体育' : attr;
      const typeCode = isSports ? 'ty' : attr === '必修' ? '006' : attr === '限选' ? '008' : '007';
      map[code + '_' + NX.normSeq(seq)] = { typeCode, typeLabel, attr };   // 键归一（课序号跨页前导零不一致）
    }
    console.log(NX.TAG, 'level table:', Object.keys(map).length, 'courses');
    return map;
  } catch (e) { console.warn(NX.TAG, 'level table:', e); return {}; }
};

// 行类型补齐：服务器搜索行/池行从 levelMap 拿 attr/typeLabel/typeCode
// （kkxxSearch 行没有类型列——类型只在一级课表；体育课一级课表无 attr 标记）
NX.applyLevelMap = function (rows) {
  const state = NX.state;
  const map = state.levelMap || {};
  // v1.5.0 mergeStaticData 末块同款：培养方案按课号回填 attr。kkxxSearch
  // 网格没有属性列（OneTHU/v1.5.0 解析器都置 attr=''），方案内课（微积分等
  // 必修）的三行网格全靠这条——重写时被我弄丢，用户十三报实锤「除已选外
  // 只剩任选」。方案外课维持任选（本来就该这么选）。
  // planData 晚到/刷新时重建索引（启动竞态：首次调用可能先于 planData 就位，
  // 空索引曾被永久缓存——方案回填整条死链）
  if (!state._planAttrByCode || state._planAttrSrc !== state.planData) {
    const pa = {};
    (state.planData || []).forEach(p => { if (p.code && p.attr) pa[p.code] = p.attr; });
    state._planAttrByCode = pa;
    state._planAttrSrc = state.planData;
  }
  const planAttr = state._planAttrByCode;
  (rows || []).forEach(c => {
    const e = map[c.code + '_' + NX.normSeq(c.seq)];
    if (e) {
      if (e.attr) c.attr = e.attr;
      c.typeLabel = e.typeLabel;
      c.typeCode = e.typeCode;
    } else if (!c.attr && planAttr[c.code]) {
      c.attr = planAttr[c.code];
    }
  });
  return rows;
};

// ─── 预选分类页属性（用户十三报「这像话吗」终修）──────────────────
// 存档实证（体育_files/xkBks.vxkBksXkbBs.html 等）：预选页分类 tab =
//   bxSearch(必修)/xxSearch(限选)/rxSearch(任选)/tySearch(体育)，
//   首页 GET（…?m=bxSearch&p_xnxq=SEM&tokenPriFlag=bx），翻页 = POST 表单
//   （turn(p): frm.page=p; frm.m=xxSearch; submit，带 token）。
//   行格式 [选择, 课程号, 课序号, 课程名, 选课志愿, 课余量, 时间, 教师, …]。
// 课在哪页就是什么属性——必修/限选 tab 是本生方案级列表（小，全量抓）；
// 任选 tab 全校选修（几十页）不抓：attr 缺省即任选；体育 tab 19 页 361 门
// 不抓：isSportsCourse 名称/院系启发覆盖。两条 tab 合计个位数请求。
NX.fetchCategoryAttrs = async function () {
  const { state, fetchPage } = NX;
  const BASE = state.BASE, SEM = state.SEM;
  const out = {};
  const tabs = [
    { m: 'bxSearch', flag: 'bx', attr: '必修', code: '006' },
    { m: 'xxSearch', flag: 'xx', attr: '限选', code: '008' },
  ];
  const parseRows = html => {
    const rows = [];
    for (const seg of html.match(/gridData\w*\s*=\s*\[[\s\S]*?\];/g) || []) {
      const re = /\[\s*"[^"]*"\s*,\s*"([A-Za-z0-9]+)"\s*,\s*"([^"]*)"\s*,\s*"[^"]*"/g;
      let m;
      while ((m = re.exec(seg)) !== null) {
        if (/\d/.test(m[1])) rows.push({ code: m[1], seq: m[2] });   // 课号须含数字（滤表头/外文行）
      }
    }
    return rows;
  };
  await NX.runPool(tabs, 2, async tab => {
    try {
      const firstUrl = BASE + '/xkBks.vxkBksXkbBs.do?m=' + tab.m + '&p_xnxq=' + SEM + '&tokenPriFlag=' + tab.flag;
      let fh = await fetchPage(firstUrl);
      const token = (fh.match(/name="token"\s+value="([^"]+)"/) || [])[1] || '';
      // GET 首页无网格（会话上下文丢失/重定向）→ 按存档 turn() 原样 POST 重试
      if (!/gridData\w*\s*=/.test(fh)) {
        const resp = await fetch(BASE + '/xkBks.vxkBksXkbBs.do', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ m: tab.m, page: '1', token, p_xnxq: SEM, tokenPriFlag: tab.flag }),
        });
        if (resp.ok) fh = new TextDecoder('gbk').decode(await resp.arrayBuffer());
      }
      if (!/gridData\w*\s*=/.test(fh)) {
        console.warn(NX.TAG, 'category ' + tab.m + ' 无网格，响应首段:', fh.replace(/<[^>]+>/g, ' ').trim().slice(0, 120));
        return;
      }
      const totalPages = Math.min(parseInt((fh.match(/共\s*(\d+)\s*页/) || [])[1], 10) || 1, 10);
      const htmls = [fh];
      for (let p = 2; p <= totalPages; p++) {
        const resp = await fetch(BASE + '/xkBks.vxkBksXkbBs.do', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ m: tab.m, page: String(p), token, p_xnxq: SEM, tokenPriFlag: tab.flag }),
        });
        if (!resp.ok) break;
        htmls.push(new TextDecoder('gbk').decode(await resp.arrayBuffer()));
      }
      let n = 0;
      for (const h of htmls) for (const r of parseRows(h)) {
        out[r.code + '_' + NX.normSeq(r.seq)] = { attr: tab.attr, typeCode: tab.code, typeLabel: tab.attr };
        n++;
      }
      console.log(NX.TAG, 'category ' + tab.attr + ': ' + n + ' 门（' + totalPages + ' 页）');
    } catch (e) { console.warn(NX.TAG, 'category ' + tab.m + ':', e); }
  });
  return out;
};


// ─── 外校课号页签检索兜底（用户四十二报「为什么搜不到」根修）──────
// 根因：kkxxSearch 开课信息索引不命中 PK/GPK/BW 前缀课号（教务 web UI 是在
// 任选页签的检索表单里搜到的——存档 任选_files/xkBks.vxkBksXkbBs.html 表单
// 实锤：p_kch/p_kcm/p_rxklxm 输入 + doQuery() POST m=rxSearch）。本兜底照
// 该表单原样：GET 带 p_kch 直查，无网格则取 token POST 重试；任选→限选→
// 必修逐页签试。行结构（限选_files 存档 gridData 14 列）：
//   [1]attr [3]课名 [4]课号 [5]课序 [6]时间 [7]教师 [8]学分
//   [0]radio value='SEM;课号;课序;'（课序权威源）
NX.parseTabGrid = function (html, attr) {
  const out = [];
  for (const seg of html.match(/gridData\w*\s*=\s*\[[\s\S]*?\];/g) || []) {
    const rows = seg.match(/\[\s*"(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")+\s*\]/g) || [];
    for (const row of rows) {
      const cells = [];
      const cre = /"((?:[^"\\]|\\.)*)"/g;
      let cm;
      while ((cm = cre.exec(row)) !== null) cells.push(cm[1]);
      if (cells.length < 9) continue;
      const name = (cells[3] || '').replace(/<[^>]+>/g, '').trim();
      const code = (cells[4] || '').trim();
      if (!code || !name || !/\d/.test(code)) continue;
      let seq = (cells[5] || '').trim();
      // radio id 权威课序：'SEM;课号;课序;'
      const rid = (cells[0] || '').match(/value='([^']*);([^']*);([^']*);'/);
      if (rid && rid[2] === code && rid[3]) seq = rid[3];
      out.push({
        code, seq: seq || '0', name,
        attr: (cells[1] || '').replace(/<[^>]+>/g, '').trim() || attr || '',
        time: cells[6] || '', teacher: cells[7] || '',
        credits: parseFloat(cells[8]) || 0,
        capacity: 0, remaining: 0, available: true,   // 页签行无余量列——未知≠已满，按需补拉会填
        selected: false, queue: '', group: '', note: '', xkTextNote: '',
        partial: true,   // OneTHU 同款标记：元数据未由全量目录补全
      });
    }
  }
  return out;
};

NX.tabSearchByKch = async function (kch) {
  const { state, fetchPage } = NX;
  const { SEM, BASE } = state;
  if (!state.isZhjwxk && !state.isWebvpn) return [];
  const tabs = [
    { m: 'rxSearch', flag: 'rx', attr: '任选' },
    { m: 'xxSearch', flag: 'xx', attr: '限选' },
    { m: 'bxSearch', flag: 'bx', attr: '必修' },
  ];
  for (const tab of tabs) {
    try {
      let fh = await fetchPage(BASE + '/xkBks.vxkBksXkbBs.do?m=' + tab.m + '&p_xnxq=' + SEM
        + '&tokenPriFlag=' + tab.flag + '&p_kch=' + encodeURIComponent(kch) + '&_t=' + Date.now());
      if (NX.isXkDeadHtml(fh)) continue;
      if (!/gridData\w*\s*=/.test(fh)) {
        // GET 无网格（会话上下文/参数被忽略）→ 按存档 doQuery() 原样 POST
        const token = (fh.match(/name="token"\s+value="([^"]+)"/) || [])[1] || '';
        if (!token) continue;
        const resp = await fetch(BASE + '/xkBks.vxkBksXkbBs.do', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ m: tab.m, page: '', token, p_xnxq: SEM, tokenPriFlag: tab.flag, p_kch: kch, p_kcm: '', p_rxklxm: '' }),
        });
        if (!resp.ok) continue;
        fh = new TextDecoder('gbk').decode(await resp.arrayBuffer());
      }
      const rows = NX.parseTabGrid(fh, tab.attr);
      if (rows.length) {
        console.log(NX.TAG, '外校课号页签检索命中:', kch, tab.attr, rows.length + ' 行');
        return rows;
      }
    } catch (e) { console.warn(NX.TAG, 'tabSearch ' + tab.m + ':', e); }
  }
  return [];
};

NX.backfillCandidateMeta = async function (candidates) {
  const todo = (candidates || []).filter(c => c && c.code && !c.credits);
  if (!todo.length) return;
  await NX.runPool(todo, 4, async c => {
    await new Promise(r => setTimeout(r, 30));   // 微错峰
    try {
      const r = await NX.serverSearch({ kch: c.code });
      const rows = r.rows || [];
      const hit = rows.find(x => String(x.seq || '0') === String(c.seq || '0')) || rows[0];
      if (hit) {
        c.credits = hit.credits || 0;
        c.capacity = hit.capacity || 0;
        c.remaining = hit.remaining || 0;
        c.available = !!hit.available;
        if (!c.teacher && hit.teacher) c.teacher = hit.teacher;
        if (!c.time && hit.time) c.time = hit.time;
        c.xkTextNote = hit.xkTextNote || '';
      }
    } catch (e) { console.warn(NX.TAG, 'cand meta', c.code, e); }
  });
  console.log(NX.TAG, 'candidate metadata backfilled:', todo.length);
};

// 一级课表 → 候选课兜底（OneTHU parseTimetableCandidates 逐行移植）：
// 逐块扫脚本：p_id=..;课号 …候选：名 …getElementById('a{节}_{天}')——格子 id
// 即真实时间正源（不依赖目录加载顺序）。教师在块内 strHTML1 "；X" 行
// （教师/类型/周次）。同课多格（跨节次）按课号合并时间为逗号串。
NX.parseTimetableCandidates = function (html) {
  const byCode = new Map();
  const re = /p_id=\d+;(\d{6,})[\s\S]{0,600}?候选：([^<&"'\n]{1,60})[\s\S]{0,600}?getElementById\('a([1-6])_([1-7])'\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[1];
    const name = (m[2] || '').trim();
    // 格子 id 是 a{节}_{天}（a6_4=周四第6节，与 dlSearch「4-6」同位不同序——实测对齐）
    const slot = m[3], day = m[4];
    if (!code || !name || !day || !slot) continue;
    const block = html.slice(m.index, m.index + m[0].length);
    const parts = [...block.matchAll(/strHTML1 \+= "；([^"]*)"/g)].map(x => x[1] || '');
    const slotStr = day + '-' + slot + '(' + (parts[2] || '全周') + ')';
    const prev = byCode.get(code);
    if (prev) {
      if (!prev.time.includes(slotStr)) prev.time += ',' + slotStr;
      continue;
    }
    byCode.set(code, {
      typeLabel: parts[1] || '',
      zyStr: '',
      code, name, seq: '0', queueTotal: 0, myPos: 0,
      time: slotStr, teacher: parts[0] || '',
      credits: 0, typeCode: '007', zy: 3,
      isCandidate: true, selected: false,
    });
  }
  return [...byCode.values()];
};

// ─── Merge ────────────────────────────────────────────────────

// WebVPN 票据自愈：重进一次教务入口根换票（wengine_vpn_ticket 过期而主会话
// 活着的实录修法）。60s 冷却——合流窗口内 N 个请求全吃壳页只重进一次。
NX.reenterZhjwxk = async function () {
  const now = Date.now();
  if (NX.state._reenterAt && now - NX.state._reenterAt < 60000) return false;
  NX.state._reenterAt = now;
  try {
    const html = await NX._fetchRaw(NX.state.BASE + '/');
    const ok = !NX.isXkDeadHtml(html);
    console.log(NX.TAG, 'webvpn 重进入口换票:', ok ? '成功，重试原请求' : '入口根也是死页=主会话真死，需重新登录');
    return ok;
  } catch (e) {
    console.warn(NX.TAG, 'webvpn 重进入口失败:', e);
    return false;
  }
};

NX.isXkDeadHtml = function (html) {
  return html.includes('accessDenied')
    || html.includes('用户登陆超时或访问内容不存在。请重试')
    || html.includes('电子身份服务系统')
    || html.includes('do/off/ui/auth/login')
    || html.includes('__vpn_app_hostname_data')
    || html.includes('__vpn_hostname_data');
};

/** 服务端课程搜索（kkxxSearch，OneTHU searchXkCourses 语义移植）。
 *  中文筛选参数（课名/教师）必须 gbkPercentEncode——GBK 页面 UTF-8 直发解出
 *  乱码 LIKE 匹配不到 → 0 行。pageKind：ok=有行；empty=结果页但 0 行（真无匹配）；
 *  unknown=异常页（会话/网络，带 htmlHead 诊断）。 */
NX.serverSearch = async function (opts) {
  const { state, fetchPage, parseCatalog } = NX;
  const { SEM, BASE } = state;
  if (!state.isZhjwxk && !state.isWebvpn) return { rows: [], pageKind: 'unknown', msg: '非教务站点' };
  const o = opts || {};
  const page = Math.max(1, o.page || 1);
  const enc = NX.gbkPercentEncode;
  const parts = ['m=kkxxSearch', 'p_xnxq=' + encodeURIComponent(SEM)];
  if (page > 1) parts.push('page=' + page);
  if (o.kch && o.kch.trim()) parts.push('p_kch=' + encodeURIComponent(o.kch.trim()));
  const kw = o.kcm && o.kcm.trim();
  if (kw) parts.push('p_kcm=' + enc(kw));
  const teacher = o.teacher && o.teacher.trim();
  if (teacher) parts.push('p_zjjsxm=' + enc(teacher));
  if (o.department) parts.push('p_kkdwnm=' + encodeURIComponent(o.department));
  if (o.weekday) parts.push('p_skxq=' + encodeURIComponent(o.weekday));
  if (o.section) parts.push('p_skjc=' + encodeURIComponent(o.section));
  if (o.grade) parts.push('p_ssnj=' + encodeURIComponent(o.grade));
  if (o.rxklxm) parts.push('p_rxklxm=' + encodeURIComponent(o.rxklxm));
  if (o.kctsm) parts.push('p_kctsm=' + encodeURIComponent(o.kctsm));
  if (o.onlyAvailable) parts.push('p_bkskyl_ig=0');
  if (o.gradAvail) parts.push('p_yjskyl_ig=0');
  const url = BASE + '/xkBks.vxkBksJxjhBs.do?' + parts.join('&') + '&_t=' + Date.now();
  let html;
  try { html = await fetchPage(url); } catch (e) {
    return { rows: [], pageKind: 'unknown', htmlHead: String(e.message || e) };
  }
  if (NX.isXkDeadHtml(html)) {
    return { rows: [], pageKind: 'unknown', htmlHead: '会话死页（' + html.replace(/<[^>]+>/g, ' ').trim().slice(0, 80) + '）' };
  }
  const rows = parseCatalog(new DOMParser().parseFromString(html, 'text/html'));
  const tp = /共\s*(\d+)\s*页/.exec(html);
  const totalPages = tp ? parseInt(tp[1], 10) : undefined;
  const tr = /共\s*[\d,]+\s*页（共\s*([\d,]+)\s*条记录/.exec(html);
  const totalRows = tr ? parseInt(tr[1].replace(/,/g, ''), 10) : undefined;
  if (rows.length > 0) return { rows, page, hasMore: true, totalPages, totalRows, pageKind: 'ok' };
  const isResultPage = html.includes('选课文字说明') || html.includes('trr2');
  return isResultPage
    ? { rows, page, hasMore: false, totalPages, pageKind: 'empty' }
    : { rows, page, hasMore: false, totalPages, totalRows, pageKind: 'unknown', htmlHead: html.slice(0, 600).replace(/\s+/g, ' ') };
};

/** 风暴护栏版服务端搜索（OneTHU data.ts newSearch 语义移植）：
 *  精确课号 → 只探 1 页；总页数已知且 ≤25 → 全量；>25 或未知 → 只探 5 页
 *  （绝不做未知 25 连发——历史实录 25 连发把代理 token 打满）。页间 30ms 错峰。
 *  0 行且课名非纯数字 → 教师名兜底重试一次（课名即教师名的输入习惯）。 */
NX.serverSearchStorm = async function (opts) {
  const { runPool, serverSearch } = NX;
  const o = opts || {};
  const exactCode = !o.kcm && !!(o.kch || '').trim();   // OneTHU 语义：kch 非空即精确（含 PK/BW 外校课号）
  const first = await serverSearch({ ...o, page: 1 });
  let rows = first.rows || [];
  // 外校课号兜底：kkxxSearch 索引不含 BW/PK/GPK 前缀课号 → 一级课表页签
  // 检索表单（任选→限选→必修）原样重搜（教务 web UI 同款路径，实测可搜）
  if (!rows.length && exactCode && !/^\d+$/.test((o.kch || '').trim())) {
    const tabRows = await NX.tabSearchByKch((o.kch || '').trim());
    if (tabRows.length) {
      return { rows: tabRows, page: 1, hasMore: false, totalPages: 1, totalRows: tabRows.length, pageKind: 'ok', viaTab: true };
    }
  }
  const tp = first.totalPages || 0;
  // 风暴护栏（OneTHU 原码语义）：总页数 ≤25 → 全量；>25 → 只探 5 页（深分页
  // 大多是宽泛词）；tp 解析失败保守探 25 页。forceAll=「加载全部」按钮 →
  // 显式全量补齐（用户主动点击，OneTHU loadAllSearch 同款）。
  // 绝不做课号深页探测（教务返回无过滤首页 + 25 连发打满代理 token 双雷）。
  // forceAll（「加载全部」按钮 / 跳转静默爬全量）压过课号护栏——旧版 exactCode ? 1
  // 恒最先命中，课号检索永远只探首页（#32「点了没效果」真根因）。课号检索页数少
  // （同一课号 ≤ 数页），压力可控（用户定案）。深页结果仍经下方课号前缀过滤兜底。
  const probeTo = o.forceAll ? (tp > 0 ? tp : 25) : (exactCode ? 1 : (tp > 0 ? (tp <= 25 ? tp : 5) : 25));
  if (probeTo > 1) {
    const merged = {};
    rows.forEach(r => { merged[r.code + '_' + (r.seq || '0')] = r; });
    const pages = [];
    for (let p = 2; p <= probeTo; p++) pages.push(p);
    await runPool(pages, 5, async (p, idx) => {
      await new Promise(r => setTimeout(r, 30 * (idx % 5)));
      try {
        const r = await serverSearch({ ...o, page: p });
        (r.rows || []).forEach(row => {
          // 课号检索深页护栏：教务若忽略筛选返回未过滤行，只收课号前缀命中的
          if (exactCode && !String(row.code || '').startsWith((o.kch || '').trim())) return;
          const k = row.code + '_' + (row.seq || '0');
          if (!merged[k]) { merged[k] = row; rows.push(row); }
        });
      } catch (e) { console.warn(NX.TAG, 'server search page', p, e); }
    });
  }
  // 教师名兜底：课名 0 行且非纯数字 → 换教师通道重试一次（单页 + 已知页数）
  if (!rows.length && o.kcm && o.kcm.trim() && !/^\d+$/.test(o.kcm.trim()) && !o.teacher) {
    const retry = await NX.serverSearchStorm({ ...o, kcm: '', teacher: o.kcm.trim() });
    if (retry.rows && retry.rows.length) return retry;
  }
  return {
    rows, totalPages: first.totalPages, totalRows: first.totalRows,
    pageKind: rows.length ? 'ok' : (first.pageKind || 'empty'),
    htmlHead: first.htmlHead,
  };
};

/** 服务端搜索结果合并进工作台课程池（会话级，不写 staticData 缓存）：
 *  code_seq 去重后并入 allCourses，卡片渲染/选课按钮即刻可用。返回新增数。
 *  合并时同步补类型（levelMap）+ 社区评价徽章（tbAttach 幂等）——否则搜索行
 *  attr 恒空（必修/限选 chip 空转）、_tbRef 恒空（卡片评价徽章消失，建议栏却有
 *  评分——建议栏单独匹配过，卡片没有）。 */
NX.mergeServerRows = function (rows) {
  const { state } = NX;
  if (!rows || !rows.length) return 0;
  const byKey = new Map(state.allCourses.map(c => [c.code + '_' + (c.seq || '0'), c]));
  let added = 0, filled = 0;
  // 可解析 = 大节或钟点任一通（用于「已有行是垃圾 time（列序兜底抓到课号等），
  // 新行带来真能上轴的 time/note」时安全替换）
  const parses = c => (NX.parseTimeSlots(c.time || '').length > 0)
    || (NX.clockRangesOf(c.note || c.xkTextNote || '', c.time || '').length > 0);
  // 借用候选索引（一次建好，避免风暴页合并 O(行×池) 放大）
  const borrowersByCode = new Map();
  for (const c of state.allCourses) {
    if ((c.selected || c.isCandidate) && !parses(c)) {
      if (!borrowersByCode.has(c.code)) borrowersByCode.set(c.code, []);
      borrowersByCode.get(c.code).push(c);
    }
  }
  for (const r of rows) {
    const k = r.code + '_' + (r.seq || '0');
    const ex = byKey.get(k);
    if (!ex) { state.allCourses.push(r); byKey.set(k, r); added++; }
    else {
      // 池内已有行：回填缺失字段（OneTHU join 池语义——搜索/回填行带来的
      // note（外校时间）能落到已选课上；已有真值不动，绝不覆盖）
      const before = ex.note + '|' + ex.time;
      if (!ex.note && r.note) ex.note = r.note;
      if (!ex.time && r.time) ex.time = r.time;
      else if (!parses(ex) && parses(r)) ex.time = r.time || ex.time;   // 垃圾 time（如已选行列序兜底抓到课号）换真能解析的
      if (!ex.teacher && r.teacher) ex.teacher = r.teacher;
      if (!ex.credits && r.credits) ex.credits = r.credits;
      if (!ex.department && r.department) ex.department = r.department;
      if (!ex.xkTextNote && r.xkTextNote) ex.xkTextNote = r.xkTextNote;
      if (before !== ex.note + '|' + ex.time) filled++;
    }
    // 课号借用（OneTHU buildRows catByCode.get(code) 同款）：已选/候补/暂存行
    // 课序号与 kkxx 两套编号对不上（外校课实锤）而解析不出时间 → 按课号把
    // 新行的 note/time 借给它。本校多班次不受影响（已选行自带可解析时间，
    // parses 拦住）。先补 note；仍解析不出才换 time。
    if (parses(r)) {
      NX.knoteRemember(r.code, r.seq, r.note || r.xkTextNote || '', r.time || '');   // 持久缓存：暂存的时候把时间暂存起来
      const borrowers = (borrowersByCode.get(r.code) || []).filter(ex2 => ex2 !== ex && !parses(ex2));
      for (const ex2 of borrowers) {
        if (!ex2.note && r.note) { ex2.note = r.note; filled++; }
        if (!parses(ex2) && r.time) { ex2.time = r.time; filled++; }
        if (!ex2.xkTextNote && (r.note || r.xkTextNote)) ex2.xkTextNote = r.note || r.xkTextNote;
      }
    }
    // 池内容版本（join 预览缓存键用）：新增或回填都让 getPreviewCourses 的
    // join 缓存失效——join 合成的是新对象，不改它原行引用可见性
    if (added || filled) state.poolVersion = (state.poolVersion || 0) + 1;
    // 暂存项同步（加暂存时 note 还没到——搜索/回填后落上，课表预览立即可用）
    for (const st of (state.stageCart || [])) {
      if (st.code === r.code && (String(st.seq || '0') === String(r.seq || '0') || !parses(st))) {
        if (!st.note && (r.note || r.xkTextNote)) { st.note = r.note || r.xkTextNote; }
        if (!st.time && r.time) st.time = r.time;
      }
    }
  }
  // 回填命中已有行 → 课表预览重渲（OneTHU 是 React 派生态自动重渲；插件
  // 命令式渲染，这里必须显式刷——否则 note 到了课表还停在「时间未定」）
  if (filled) {
    NX.invalidatePreview();
    try { NX.renderPreviewTT(NX.getPreviewCourses(), (state.$('nextthuxk-preview-info') || {}).textContent || '当前已选'); } catch (e) {}
    console.log(NX.TAG, '池内行回填 time/note:', filled, '门 → 课表已刷新');
  }
  NX.applyLevelMap(rows);
  // 搜索行属性探针（用户十六报）：每次搜索自动打——几行有属性、逐行命中否，
  // 键错位（课序号两套编号疑点：tab 10430494_1 vs kkxx 7课序）一眼定论
  if (rows.length) {
    const wa = rows.filter(r => r.attr).length;
    console.log(NX.TAG, 'server rows 属性: ' + wa + '/' + rows.length + ' | 样例: ' +
      rows.slice(0, 3).map(r => r.code + '_' + (r.seq || '0') + '→' + (r.attr || '空') +
        ((state.levelMap || {})[r.code + '_' + NX.normSeq(r.seq)] ? '(键命中)' : '(键未命中)')).join(' , '));
  }
  if (NX.tbAttach) { try { NX.tbAttach(rows); } catch (e) {} }   // fail-soft
  // 志愿统计：已拉数据立刻应用到本批渲染行（launch 只把数据写进了池内
  // 旧行——搜索/跳转回来的新行对象此前永远拿不到，全卡「无数据」，
  // 用户十一报实锤）；未拉院系防抖补拉，拉完合并 volMap 回刷全池+当前行。
  if (!state.isQueuePhase) {
    if (state.volMap) NX.applyVolunteer(rows, state.volMap);
    if (state._volDepts) {
      const newDepts = [...new Set(rows.map(c => NX.deptCodeOf(c.department)).filter(Boolean))]
        .filter(dc => !state._volDepts[dc]);
      // done 已标但行仍缺（污染页/合法页缺行）也要排程——自愈重拉住在
      // 回调里，newDepts 为空时它才更要跑（用户十九报 3a 场景）
      const retried0 = state._volRetried || (state._volRetried = {});
      const nk0 = r => r.code + '_' + NX.normSeq(r.seq || '0');
      const needRetry = rows.some(r => r && r.code && NX.deptCodeOf(r.department)
        && !(state.volMap || {})[nk0(r)] && !retried0[NX.deptCodeOf(r.department)]);
      if (newDepts.length || needRetry) {
        clearTimeout(state._volDebounce);
        // 搜索是离散动作：立即拉（400ms 防抖用户等不到就截图——心智探秘
        // 行社科学院数据 1-3s 后才到，用户十八报看到的全是补拉前状态）
        clearTimeout(state._volDebounce);
        state._volDebounce = setTimeout(async () => {
          try {
            console.log(NX.TAG, 'volunteer 按需补拉院系:', newDepts.join(','));
            const vol = await NX.fetchVolunteer(rows) || {};
            state.volMap = Object.assign({}, state.volMap, vol);
            // 缺行自愈（用户十九报：070 被启动池的错页标 done，心智探秘
            // 永远无数据）：本批行里 volMap 仍缺的，对其院系定向强制重拉
            // 一次（每院系每会话只试一次，防墓碑行死循环）
            const retried = state._volRetried || (state._volRetried = {});
            const nk = r => r.code + '_' + NX.normSeq(r.seq || '0');
            const missing = (rows || []).filter(r => r && r.code && NX.deptCodeOf(r.department)
              && !state.volMap[nk(r)] && !retried[NX.deptCodeOf(r.department)]);
            let extra = {};
            if (missing.length) {
              const mdeps = Array.from(new Set(missing.map(r => NX.deptCodeOf(r.department))));
              mdeps.forEach(d => { retried[d] = 1; });
              console.log(NX.TAG, 'volunteer 缺行重拉:', mdeps.join(','));
              try {
                extra = await NX.fetchVolunteer(missing, { force: true }) || {};
                state.volMap = Object.assign({}, state.volMap, extra);
              } catch (e2) { console.warn(NX.TAG, 'volunteer 缺行重拉失败', e2); }
              // 分院页都没有（用户二十报：心智探秘在 070 分院视图缺行）
              // → 逐课 p_kch 定向查询（每课每会话一次）
              for (const r of missing) {
                if (state.volMap[nk(r)]) continue;
                if (retried['k:' + r.code]) continue;
                retried['k:' + r.code] = 1;
                try {
                  const m2 = await NX.fetchVolCourse(r.code);
                  if (Object.keys(m2).length) {
                    extra = Object.assign({}, extra, m2);
                    state.volMap = Object.assign({}, state.volMap, m2);
                  }
                } catch (e3) { console.warn(NX.TAG, 'volunteer 定向课号查询失败', r.code, e3); }
              }
            }
            if (!Object.keys(vol).length && !Object.keys(extra).length) return;
            // 全量 volMap 重放：applyVolunteer 的 else 分支无条件清空，
            // 拿增量 delta 去套会把池内已上屏的志愿数据全部抹掉（此前
            // 的暗伤：任何一次搜索都会洗掉大物/马原卡的数据）
            const targets = state.allCourses.concat(state._searchRows || []);
            NX.applyVolunteer(targets, state.volMap);
            NX.filterCourses();
            try { NX.renderStageCart(); } catch (e) {}   // 暂存条概率跟志愿数据一起到（一会有一会没的根因）
          } catch (e) {
            console.warn(NX.TAG, 'volunteer 按需补拉失败:', newDepts.join(','), e);
          }
        }, 60);
      }
    }
  }
  return added;
};
