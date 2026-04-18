<p align="center">
  <img src="assets/banner.png" alt="Kin Banner" width="100%">
</p>

<h1 align="center">Kin (金)</h1>

<p align="center"><em>Beyond Words. Into Meaning.</em></p>

<p align="center">
  不只是翻译，更是理解与共鸣。
</p>

---

## 什么是 Kin？

Kin 是一款为深度阅读而生的浏览器翻译扩展。

我们相信，翻译的本质不是字词的替换，而是意义的传递。Kin 在网页翻译的基础上，为新闻资讯站点打造了沉浸式的阅读模式 —— 让外文内容读起来像母语一样自然流畅。

**从文字，到意义。**

## 核心功能

### 网页翻译
- **双语对照 / 仅译文** — 两种显示模式自由切换
- **悬浮翻译** — 按住 Ctrl 悬停段落，即刻翻译
- **划词翻译** — 选中文字，一键获取译文
- **整页翻译** — 一键翻译整个网页，保持原有排版

### 沉浸阅读 (Reader Mode)
专为新闻资讯站点优化，支持：
- **Bloomberg** · **WSJ** · **New York Times** · **Financial Times** · **The Economist** · **SCMP** · **The New Yorker**

进入沉浸模式后，页面将转换为优雅的阅读排版，支持：
- 双语对照与仅译文切换
- 全文翻译
- 截图导出 (PNG/JPEG)
- PDF 导出
- 三种阅读主题：Kin (金色暖调)、Parchment (羊皮纸色)、Classic (黑白经典)

### 智能设置
- **14+ 翻译引擎** — 从免费服务到 API 接口，随心选择
- **翻译风格** — 默认、口语化、学术严谨、文学优美、简洁明快、新闻报道、自定义
- **网站规则** — 指定始终翻译或永不翻译的网站
- **敏感信息屏蔽** — 自动隐藏手机号、银行卡号等隐私内容

## 安装

<p align="center">
  <!-- Chrome Web Store 上架后替换下方链接 -->
  <a href="#"><img src="https://storage.googleapis.com/web-dev-uploads/image/WlD8wC6g8khYWPJUsQceQkhXSlv1/UV4C4ybeBTsZt43U4CE.png" alt="Chrome Web Store" height="48"></a>
</p>

或手动安装：
1. 下载 [最新 Release](https://github.com/zhaodengfeng/Kin/releases/latest) 的 `Kin-*.zip`
2. 解压到本地文件夹
3. 打开 Chrome 扩展管理页面 (`chrome://extensions/`)
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

## 快速开始

| 快捷键 | 功能 |
|---|---|
| `Alt + A` | 翻译 / 显示原网页 |
| `Alt + S` | 切换双语对照 / 仅译文 |
| `Alt + R` | 进入沉浸阅读模式 |

## 隐私

Kin 尊重你的隐私。

- 所有设置与数据均存储在浏览器本地
- API Key 使用 AES-GCM 加密保存
- 不收集任何个人信息
- 不追踪浏览行为
- 不发送数据到第三方服务器（除你选择的翻译 API 外）

查看完整 [隐私政策](PRIVACY.md)。

## 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript (无框架依赖)
- AES-GCM 加密 (API Key 安全存储)
- html2canvas + jsPDF (截图 / PDF 导出)

## 贡献

欢迎提交 Issue 和 Pull Request。

## License

MIT License

---

<p align="center"><em>Made with care for readers who seek meaning beyond words.</em></p>
