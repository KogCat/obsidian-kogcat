# KogCat

> AI 让答案更顺，KogCat 让判断更稳。

[English](README.md) | [中文](README-zh.md) · **官网：** <https://www.kogcat.com>

给 Obsidian 用的本地优先 **判断校准层**。选中一行、一段，或整篇笔记。KogCat 把它对着一个结构化知识库（认知偏误、逻辑谬误、决策框架）读一遍——再递回几条校准点，帮你把判断磨得更准。你的 markdown，一字不动。

---

## 看看区别

你写下：

> 我每天读书 30 分钟，但感觉什么都记不住。我大概该记更详细的笔记。

**普通 AI** —— 试试康奈尔笔记法，标重点，再用 Anki 做间隔重复。

**KogCat** —— 记更多笔记，多半只会更糟。瓶颈不在记录，在检索。研究一再印证：合上书，凭记忆写下来——哪怕不完整——也比任何边读边记的方式记得更牢。先这样试一次。再把你真正留下的，和你以为记住的，掂量掂量。

---

## 工作方式

从侧边栏图标、命令面板，或右键菜单，打开 review 面板——对当前选区、段落，或整篇笔记。本地引擎从校准知识库取回一个召回池。连了 chat model？它会把召回池提炼成最关键的那几点。没有模型，确定性兜底照样可用。

---

## 隐私与网络

KogCat 没有自己的服务器。碰网络的，只有两样：

1. **校准引擎（`om-core`）。** 首次启动时，KogCat 从公共发布 channel（GitHub Releases，备用阿里云 OSS 镜像）下载对应平台的二进制，**运行前先过 sha256 manifest 校验**，缓存到 vault 之外并复用。KogCat 把它注册为本地后台服务——macOS 上是 `com.kogcat.om` LaunchAgent，Windows 上是 `OmCore` 计划任务——只通过本地 socket 通信。不开任何入站端口。想用自己的二进制？在 **设置 → KogCat → 引擎路径** 指过去，或设 `OM_ALLOW_DIRECT_SPAWN=1` 彻底跳过服务注册。
2. **你的 LLM 服务商。** 只有你同意 review 精炼时才调用——自带 Key。指向本地模型（Ollama / LM Studio），即可完全离线。

无 telemetry。无 analytics。无账号。vault 永不上传——只有你递给 KogCat 校准的文字会被读取，它也从不往笔记写入专有语法。

**维护。** 持续维护中。校准知识库由引擎刷新——你无需安装或更新任何东西。万一某天停下，我们会提前告知，并附上干净的数据导出路径。

**卸载。** 删掉插件，vault 原封不动。两样东西在它之外：后台服务，和缓存的引擎。停止并删除服务（LaunchAgent 或 `OmCore` 任务），再删掉操作系统应用支持目录下缓存的引擎。

---

## 环境要求

- Obsidian 1.0.0 或更高（仅桌面端）
- macOS（Apple Silicon）或 Windows x64 —— Intel Mac 与 Linux 暂未支持
- 至少一个支持服务商的 API Key：Anthropic、OpenAI、Google Gemini、xAI、DeepSeek、Mistral、Perplexity、OpenRouter、Azure OpenAI，或任意 OpenAI 兼容端点。本地模型（Ollama / LM Studio）无需 Key。

## 安装

1. 在 Obsidian 社区插件市场安装 KogCat，或把 release 包放进 `<vault>/.obsidian/plugins/kogcat/`，然后启用。
2. 打开 **设置 → KogCat**，填入服务商 API Key。
3. 触发一次 review。首次使用时引擎自动下载、校验、启动；后续启动复用缓存。

## 使用方法

选中文字，或把光标停在一个段落里。从侧边栏图标、命令面板，或右键菜单打开 KogCat。再据面板里的校准点，改写原文。

## 致谢

Fork 自 [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer)（作者 Heesu Suh）。KogCat 保留其多服务商 LLM 客户端与设置脚手架；chat、RAG、MCP、prompt 模板等子系统已移除。

## 许可证

[FSL-1.1-MIT](LICENSE) —— 发布满两年后转为 MIT。部分代码源自 Smart Composer（`Copyright (c) 2024 Heesu Suh`，原 MIT 许可），见上方致谢。
