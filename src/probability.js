// ═══════════════════════════════════════════════════════════════
// NextTHUxk — Probability: 中签概率计算、志愿格式化
// ═══════════════════════════════════════════════════════════════
var NX = NX || {};

NX.fmtVol = function (v) {
  if (!v) return '';
  const priMatch = v.match(/^\((\d+)\)/);
  const pri = priMatch ? parseInt(priMatch[1]) : 0;
  const cleaned = v.replace(/^\(\d+\)/, '');
  const parts = cleaned.split(',').map(n => parseInt(n) || 0);
  if (parts.every(n => n === 0) && !pri) return '';
  let s = parts.join('/');
  if (pri) s = '优先' + pri + '/' + s;
  return s;
};

// 占用对（已报/容量）：课余量行最优先（容量-余量 = 实时已选，与卡片
// 「已满/余0」标签永远一致——用户实锤「已满却显示 0/80 竞争宽松」）；
// 无余量数据才退志愿统计（volApplied/volCapacity），最后退裸容量。
NX.occupancyOf = function (c) {
  const cap = Number(c.capacity) || 0;
  const rem = c.remaining;
  // 预选：报名人数/容量才是竞争信号（课余量在预选没人正式选上 → 恒
  // 0/N「宽松」假象，用户实锤「必 51 却显示 0/100 竞争宽松」）；
  // 补选/排队阶段（isQueuePhase）：课余量=实时已选，与「已满/余0」
  // 标签一致，优先（大学物理 80/80 修法维持）。
  if (!NX.state || !NX.state.isQueuePhase) {
    if (Number(c.volCapacity) > 0 && c.volApplied != null) {
      return { applied: Number(c.volApplied) || 0, cap: Number(c.volCapacity) };
    }
  }
  if (cap > 0 && rem !== undefined && rem !== null && rem !== '' && Number(rem) >= 0) {
    return { applied: Math.max(0, cap - Number(rem)), cap };
  }
  return { applied: Number(c.volApplied) || 0, cap: Number(c.volCapacity) || cap || 0 };
};

NX.volColor = function (course) {
  const occ = NX.occupancyOf(course);
  const cap = occ.cap;
  const applied = occ.applied;
  if (!cap || cap === 0) return { level: 'unknown', color: '#9aa1ac', bg: 'rgba(154,161,172,.08)', pct: 0 };
  const ratio = applied / cap;
  if (ratio <= 0.8) return { level: 'easy', color: '#07c160', bg: 'rgba(7,193,96,.1)', pct: Math.min(ratio * 100, 100) };
  if (ratio <= 1.2) return { level: 'medium', color: '#ff9f1a', bg: 'rgba(255,159,26,.1)', pct: Math.min(ratio * 100, 100) };
  return { level: 'hard', color: '#ee4d4d', bg: 'rgba(238,77,77,.1)', pct: Math.min(ratio * 100, 100) };
};

NX.parseVolArr = function (s) {
  if (!s) return null;
  const str = String(s);
  const priMatch = str.match(/^\((\d+)\)/);
  const pri = priMatch ? parseInt(priMatch[1]) : 0;
  const cleaned = str.replace(/^\(\d+\)/, '').trim();
  const nums = cleaned ? cleaned.match(/\d+/g) : null;
  if (!nums || !nums.length) {
    // 纯优先志愿「(N)」：无分级数据，仅优先人数
    return pri > 0 ? Object.assign([0, 0, 0], { priority: pri }) : null;
  }
  // 志愿串 = 当前阶段开放志愿级的密集列表（从高到低）：
  //   3 个 = 一/二/三志愿（旧全阶段「(1)2，4，5」）
  //   1 个 = 仅第三志愿（新生预选：只开放第三志愿+优先志愿「(1)2」/「2」）
  // 缺的高志愿位补 0（该阶段没人能填）。绝不再因数量 <3 整串判 null
  // （旧版就是这里把新生预选的志愿数据全吃了）。
  const vals = nums.map(n => parseInt(n, 10) || 0);
  const arr = [0, 0, 0];
  const base = 3 - Math.min(3, vals.length);
  for (let i = 0; i < Math.min(3, vals.length); i++) arr[base + i] = vals[i];
  arr.priority = pri;
  return arr;
};

NX.calcProb = function (course, flag, zy) {
  const cap = parseInt(course.volCapacity || course.capacity || 0, 10) || 0;
  if (!cap) return { prob: -1, label: '无数据', color: '#9aa1ac' };

  const zyIdx = zy - 1;

  // 体育：独立级联，只看体育志愿
  if (flag === 'ty') {
    const vols = NX.parseVolArr(course.volSports);
    if (!vols) return { prob: -1, label: '无数据', color: '#9aa1ac' };
    let rem = cap;
    for (let i = 0; i < zyIdx; i++) rem -= vols[i];
    return NX.probResult(rem, vols[zyIdx]);
  }

  // 必修/限选/任选：全局级联
  const bxV = NX.parseVolArr(course.volRequired);
  const xxV = NX.parseVolArr(course.volElective);
  const rxV = NX.parseVolArr(course.volOptional);

  let rem = cap;

  // 必修级联
  if (bxV) {
    if (flag === 'bx') {
      for (let i = 0; i < zyIdx; i++) rem -= bxV[i];
      return NX.probResult(rem, bxV[zyIdx]);
    }
    for (let i = 0; i < 3; i++) rem -= bxV[i];
  }

  // 限选级联
  if (xxV) {
    if (flag === 'xx') {
      for (let i = 0; i < zyIdx; i++) rem -= xxV[i];
      return NX.probResult(rem, xxV[zyIdx]);
    }
    for (let i = 0; i < 3; i++) rem -= xxV[i];
  }

  // 任选级联（优先志愿为最高优先级，相当于第0志愿）
  if (rxV) {
    const pri = rxV.priority || 0;
    if (flag === 'rx') {
      rem -= pri;
      for (let i = 0; i < zyIdx; i++) rem -= rxV[i];
      return NX.probResult(rem, rxV[zyIdx]);
    }
    rem -= pri;
    for (let i = 0; i < 3; i++) rem -= rxV[i];
  }

  return { prob: -1, label: '无数据', color: '#9aa1ac' };
};

NX.probResult = function (rem, applicants) {
  if (!Number.isFinite(rem) || !Number.isFinite(applicants)) {
    return { prob: -1, label: '无数据', percentLabel: '无数据', ratioLabel: '无数据', color: '#9aa1ac' };
  }
  const remShown = Math.max(0, Math.round(rem));
  const applicantsShown = Math.max(0, Math.round(applicants));
  // 比例标签 = 人数/名额（「2/5」=2人抢5位；用户实锤：与占用条 已选/容量
  // 同向。旧版 剩余/人数「5/2」在卡片上和上面的 2/5 并排，读起来像搞反了）
  if (rem <= 0) return { prob: 0, label: '0%', percentLabel: '0%', ratioLabel: applicantsShown + '/' + remShown, color: '#ee4d4d' };
  const prob = applicants === 0 ? 1 : Math.min(1, rem / applicants);
  if (!Number.isFinite(prob)) return { prob: -1, label: '无数据', percentLabel: '无数据', ratioLabel: '无数据', color: '#9aa1ac' };
  let color;
  if (prob >= 0.8) color = '#07c160';
  else if (prob >= 0.5) color = '#ff9f1a';
  else color = '#ee4d4d';
  const percentLabel = Math.round(prob * 100) + '%';
  const ratioLabel = applicantsShown + '/' + remShown;   // 人数/名额，见上
  return { prob, label: percentLabel, percentLabel, ratioLabel, color };
};

NX.flagName = function (flag) {
  return flag === 'bx' ? '必修' : flag === 'xx' ? '限选' : flag === 'rx' ? '任选' : '体育';
};

NX.probBg = function (color) {
  if (color === '#07c160') return 'rgba(7,193,96,.14)';
  if (color === '#ff9f1a') return 'rgba(255,159,26,.14)';
  if (color === '#ee4d4d') return 'rgba(238,77,77,.14)';
  return 'rgba(154,161,172,.12)';
};

NX.currentProbMeta = function (course, flag, zy) {
  const p = NX.calcProb(course, flag, zy);
  return {
    ...p,
    flag,
    zy,
    flagLabel: NX.flagName(flag),
    bg: NX.probBg(p.color),
  };
};

NX.currentProbLine = function (course, flag, zy) {
  const { esc } = NX;
  const p = NX.currentProbMeta(course, flag, zy);
  const pillClass = p.prob >= 0 ? '' : ' nx-prob-pill-muted';
  const pillStyle = p.prob >= 0 ? 'style="background:' + p.bg + ';color:' + p.color + '"' : '';
  const detail = p.ratioLabel && p.ratioLabel !== '无数据' ? ' · ' + p.ratioLabel : '';
  return '<div class="nx-prob-line nx-current-prob" data-code="' + esc(course.code) + '" data-seq="' + esc(course.seq || '0') + '" data-flag="' + esc(flag) + '" data-zy="' + esc(zy) + '"><span class="nx-prob-label">当前选法</span><span class="nx-prob-pill' + pillClass + '" ' + pillStyle + '>' + esc(p.flagLabel) + ' · ' + p.zy + '志愿 · ' + (p.percentLabel || p.label) + detail + '</span></div>';
};

NX.fullProbGrid = function (courseOrAc, bf) {
  // 显示侧全开（用户十六报拍板）：志愿统计本就是全校公开数据（教务志愿
  // 查询页人人可看）——必修/限选/任选 三行永远全显，非池内课也能看别
  // 人的竞争；体育课走体育志愿单行。提交身份下拉仍是池子语义（教务
  // 不收池外必修），只是纯展示不再收窄。
  const aFlags = NX.isSportsCourse(courseOrAc) ? ['ty'] : ['bx', 'xx', 'rx'];
  const rows = [];
  for (const f of aFlags) {
    const cells = [];
    // #39 任选优先档：任选志愿串 (N) 前缀 = 优先任选志愿人数，是独立于
    // 1/2/3 的第 0 档（submitCourse is_zyrxk=1 走的就是它）。此前网格
    // 只有三档，用户走优先通道却只能看到 1/2/3 志愿概率 → 「未能区分
    // 任选优先和任选」。优先档概率 = 级联扣完 bx/xx 后的余量 / N。
    if (f === 'rx') {
      const rxV = NX.parseVolArr(courseOrAc.volOptional);
      const pri = rxV && rxV.priority;
      if (pri > 0) {
        const cap = parseInt(courseOrAc.volCapacity || courseOrAc.capacity || 0, 10) || 0;
        let rem = cap;
        const bxV = NX.parseVolArr(courseOrAc.volRequired);
        const xxV = NX.parseVolArr(courseOrAc.volElective);
        if (bxV) for (let i = 0; i < 3; i++) rem -= bxV[i];
        if (xxV) for (let i = 0; i < 3; i++) rem -= xxV[i];
        const p = NX.probResult(rem, pri);
        cells.push('<span style="color:' + p.color + ';font-weight:700">优先:' + p.label + '</span>');
      }
    }
    for (let z = 1; z <= 3; z++) {
      const p = NX.calcProb(courseOrAc, f, z);
      if (p.prob >= 0) {
        cells.push('<span style="color:' + p.color + ';font-weight:600">' + z + '志愿:' + p.label + '</span>');
      } else {
        cells.push('<span style="color:#9aa1ac">' + z + '志愿:' + p.label + '</span>');
      }
    }
    rows.push('<span style="color:#9aa1ac;font-size:9px">' + NX.flagName(f) + '</span> ' + cells.join(' '));
  }
  return rows.length ? '<div style="margin-top:3px;line-height:1.4;font-size:9px">' + rows.join('<br>') + '</div>' : '';
};
