const _browser = typeof browser !== 'undefined' ? browser : chrome;
const statusEl = document.getElementById('status');
const launchBtn = document.getElementById('launch');

_browser.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (!tab) { statusEl.textContent = '无法获取标签页'; return; }
  const url = tab.url || '';
  if (!/zhjwxk\.cic\.tsinghua\.edu\.cn|zhjw\.cic\.tsinghua\.edu\.cn|webvpn\.tsinghua\.edu\.cn/.test(url)) {
    statusEl.textContent = '请先打开清华选课网站';
    statusEl.className = 'status err';
    return;
  }
  // 注入状态探测：右下角按钮不见 = 内容脚本没跑。三种死法在这就能分清：
  // 装完没刷新（F5 即愈）/ Edge IE 模式（扩展整页禁用）/ 商店旧版（看版本号）。
  _browser.tabs.sendMessage(tab.id, { action: 'nextthuxk-ping' }, resp => {
    if (_browser.runtime.lastError || !resp || !resp.ok) {
      statusEl.textContent = '未注入此页面：请先刷新页面（F5）；Edge 若开了 IE 模式请把清华站点移出列表';
      statusEl.className = 'status err';
      return;
    }
    statusEl.textContent = '已注入 v' + (resp.ver || '?') + (resp.zhjwxk ? ' · 本科选课' : ' · 教务系统');
    statusEl.className = 'status ok';
  });
});

launchBtn.onclick = () => {
  _browser.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    _browser.tabs.sendMessage(tabs[0].id, { action: 'nextthuxk-toggle' }, resp => {
      if (_browser.runtime.lastError) {
        statusEl.textContent = '请先打开清华选课网站并刷新';
        statusEl.className = 'status err';
      } else {
        window.close();
      }
    });
  });
};
