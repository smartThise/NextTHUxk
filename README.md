<div align="center">

<img src="docs/logo-banner.png" alt="One above THU — One THUer should have OneTHU" width="640">

# OneTHU NextTHUxk

**2.3.0 · 下一代选课工作台**

在选课网页里搜索课程、预览课表、暂存方案，再确认提交。

[下载与安装](https://github.com/smartThise/NextTHUxk/releases/latest) · [功能详解](docs/FEATURES.md) · [更新历史](CHANGELOG.md) · [反馈问题](https://github.com/smartThise/NextTHUxk/issues)

[OneTHU 校园应用](https://github.com/smartThise/OneTHU) · **NextTHUxk 选课插件** · [NextTHULearn 学堂插件](https://github.com/smartThise/NextTHULearn)

</div>

NextTHUxk 是清华本科生选课网页的非官方浏览器扩展。2.3.0 沿用 OneTHU 石墨风格，保留课程搜索、志愿、冲突检查、暂存草稿、培养方案和 AI 排课等交互。浏览器扩展可独立使用，无需安装 OneTHU。

## 安装

> 🚀 校内访问 [git.tsinghua.edu.cn/gjl25/NextTHUxk](https://git.tsinghua.edu.cn/gjl25/NextTHUxk) 下载速度更快。
> 各渠道附件对照：`*.xpi` = Firefox 签名版（永久安装）；`*.zip` = Chrome / Edge / Firefox 手动加载通用包。

### Firefox：下载 xpi 一键装（推荐，永久生效）

1. 从 [Releases](https://github.com/smartThise/NextTHUxk/releases) 最新版本下载 `nextthuxk-<版本号>.xpi`
2. 打开 Firefox，地址栏输入 `about:addons`，将 xpi 文件**直接拖入页面**
3. 完成安装——该包经 Mozilla 官方签名，无需开发者模式、重启浏览器不失效

**Firefox 更新方式**：发布新版本时扩展会在页面上弹出更新横幅（也可手动到 Releases 页查看）。下载新版 xpi 后同样拖入 `about:addons`，会自动覆盖升级并保留全部本地数据（草稿 / 缓存 / 配置）。无需先卸载旧版。

### Chrome / Edge：解压加载

1. 从 [Releases](https://github.com/smartThise/NextTHUxk/releases) 下载 `nextthuxk-<版本号>.zip` 并解压
2. 浏览器打开扩展管理页（Chrome: `chrome://extensions`，Edge: `edge://extensions`），开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择解压后的文件夹

> .crx 直拖方式已被 Chrome 收紧拦截，不再提供。更新时下载新 zip 解压**覆盖原文件夹**后回到扩展管理页点击「重新加载」即可；若出现新旧实例冲突等诡异问题，先移除旧版再重新加载。

## 使用

进入 `zhjwxk.cic.tsinghua.edu.cn` 或 `zhjw.cic.tsinghua.edu.cn` 的选课页面，点击右下角 OneTHU 启动按钮进入全屏工作台。首次使用按页面提示选择学期与年级；右上角“返回原系统”可回到教务页面。

## 可以做什么

| 能力 | 说明 |
|---|---|
| 搜索与筛选 | 按需查询教务课程，支持课名、课号、教师与外校互选；类型、学分、星期、大节、余量和冲突筛选。 |
| 选课与志愿 | 查看余量、排队与预选概率，按学校规则选择课程类型、志愿号、调整顺序和确认选退课。 |
| 课表预览 | 动态时间轴展示本校与外校课程；冲突提示、自定义时间占用，预览暂存与草稿课表。 |
| 暂存方案 | 最多五张草稿，逐门调整类型与志愿，导入/导出 JSON，确认后提交方案。 |
| 培养方案 | 查看课组完成情况，检查已选、暂存与草稿覆盖情况。 |
| AI 排课 | 自行配置兼容 API，使用自然语言查课、生成草稿；方案包含课表占用和社区评价参考。 |
| 课程评价 | 实时读取 THU选课社区公开评分与点评，保留来源与作者，支持跳转回社区。 |
| 更新与外观 | GitHub Releases 更新提示；OneTHU 石墨风格、窄屏布局、键盘焦点和减少动态效果。 |

[展开完整功能、规则与操作说明](docs/FEATURES.md)。概率与推荐仅供辅助，最终结果以学校系统为准。

## OneTHU 与浏览器插件

| 项目 | 使用场景 | 获取 |
|---|---|---|
| [OneTHU](https://github.com/smartThise/OneTHU) | macOS、Windows、Android 校园应用；学习、日程、校园服务与按需接入的外部平台。 | [下载应用](https://github.com/smartThise/OneTHU/releases/latest) |
| [NextTHUxk](https://github.com/smartThise/NextTHUxk) | 在教务选课网页使用课程搜索、课表预览、暂存方案与 AI 排课。 | [安装选课插件](https://github.com/smartThise/NextTHUxk/releases/latest) |
| [NextTHULearn](https://github.com/smartThise/NextTHULearn) | 进入网络学堂网页，自动启用 OneTHU 风格的学习工作台。 | [安装学堂插件](https://github.com/smartThise/NextTHULearn/releases/latest) |

三个项目可以独立使用。浏览器扩展沿用对应学校网站的登录态，不要求先安装 OneTHU。

## 数据与隐私

- 选课操作走原系统表单提交，与手动操作完全等价
- 个人数据（草稿、API 配置等）全部存储在浏览器本地
- 扩展代码中不包含任何个人数据
- 课程目录和志愿数据有缓存机制：
  - 课程目录：**随时查询（2.0）**——按需向教务服务端取数，热门搜索结果会话内缓存
  - 志愿排队数据：每日 **8:00 / 12:00 / 16:00 / 20:00** 教务检查点自动同步
  - 已选课程：每次打开工作台实时获取

## 数据来源与授权（THU选课社区）

- 社区评分、点评数量与点评内容由 [THU选课社区（thubook.help/thucourse）](https://thubook.help/thucourse/) 的贡献者创作
- 上述数据以 **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh)**（署名—非商业性使用 4.0 国际）授权：
  - ✅ 允许：署名转载、二次展示（如本扩展的评分徽章 / 点评弹窗 / 联想词 / AI 分析）
  - ❌ 禁止：将点评数据用于任何商业目的（出售、广告变现、商业数据服务等）
- 扩展仅在用户浏览课程或打开点评弹窗时**实时读取**社区的公开接口，并随内容展示来源署名；不在本地分发、转售点评数据库
- 点评著作权归原作者所有；引用时请保留「THU选课社区」及作者信息，详见 CC BY-NC 4.0 条款

## 开发与历史

[架构说明](docs/ARCHITECTURE.md) · [变量说明](docs/VARIABLES.md) · [更新历史](CHANGELOG.md)

## 注意事项

- 仅在清华选课网站域名下生效（zhjwxk / zhjw / webvpn）
- 需要已登录教务系统的浏览器 session
- 体育课的志愿信息独立于其他课程类型，显示规则略有不同
- **北大 / 北外等跨校课程暂无法在本插件选择**：跨校课程走独立流程，不在 zhjwxk 表单体系内，请通过教务系统原渠道选课
- **更新 / 重载**：常规更新覆盖原目录后重新加载即可。若已出现重复实例或存储冲突，先备份需要保留的草稿与配置，再移除旧实例并重新加载。

## 文件结构

```
├── manifest.json        # 浏览器扩展配置 (Manifest V3)
├── content.css          # 全部样式
├── content.js           # 入口：HTML 模板 + Shadow DOM + 事件绑定 + 启动流程
├── src/
│   ├── config.js        # 命名空间 NX、常量、工具函数、存储、网络
│   ├── data.js          # 数据抓取与解析（课程目录、志愿、选退课 API）
│   ├── probability.js   # 中签概率计算、志愿格式化
│   ├── reviews.js       # THU选课社区评价层（匹配 / 点评弹窗 / 联想词）
│   ├── state.js         # 暂存/草稿管理、课表解析、冲突检测、选课状态
│   ├── render.js        # 所有渲染函数 + 筛选逻辑
│   ├── ai.js            # AI 搜索 + 智能排课
│   └── update.js        # 版本更新检查
├── popup.html           # 扩展弹出页
├── popup.js             # 弹出页逻辑
└── README.md            # 本文件
```

## License

MIT

## 用户交流群

扫码进 QQ 群：问题反馈、功能催更、使用技巧交流。

<p align="center">
  <img src="qrcode_group.jpg" alt="NextTHUxk 用户 QQ 群" width="240"/>
</p>
