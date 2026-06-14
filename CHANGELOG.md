# Changelog

## 0.13.2 — 2026-06-10

### 维护

- 精简 om-core 集成层源码注释：仅保留「做什么」的说明，移除非必要的内部实现锚点；运行行为零变化。
- 裁剪开发用 mock（`scripts/mock-om-core.mjs`）：移除 shipped 客户端从不调用的 ingest / pending 端点，仅保留 calibrate / prompts / healthz；e2e 全链路测试通过。

## 0.13.0 — 2026-06-07

### 校准面板重设计

- **判词先行的单一阅读流**：定向行（来源 · 片段类型）→ 整体判词 → 校准点（首条左细线锚定）→ 收尾下一步。层次只靠字号 / 字重 / 颜色 / 留白，移除完整度药丸、片段类型药丸 + 说明行、下一步填充盒、首条卡片背景与强调色、逐条 hover 复制图标。content-first，工具退场。
- **顶层判词回归**：面板顶部恒作一句整体判词呈现（高于任何单条校准点），语气随结论自适应，不为显批判硬造反对。
- **首条校准点**：只用左侧 2px 细线锚定，去掉「最相关」标签、卡片背景与强调色；其余点纯留白等权分隔。
- **页脚单个「复制」**：复制整篇校准（判词 + 校准点 + 下一步）；移除摘要与逐条的 hover 复制图标。
- **降级 / 无信号如实呈现**：未连模型走基础结果（判词留空、底部一行说明）；无强相关点或无信号时不凑数。

### i18n

- 校准命名空间精简：新增 `result.nextStepLabel`；移除不再呈现的 `badges` / `mode.*.detail` / `mode.label` / `result.primary` / 逐条复制相关键（en / zh 同步，parity 校验通过）。

## 0.12.1 — 2026-06-07

### Obsidian 社区审核合规

- **`minAppVersion` 抬到 1.7.2**：声明覆盖 `Workspace.revealLeaf`(1.7.2) 与 `ButtonComponent.setIcon`/`setTooltip`/`setDisabled`，清掉 `no-unsupported-api` 报错。
- **directive 注释加描述**：所有 `eslint-disable` 补 ` -- 原因`，require() 类的失效旧规则名 `no-var-requires` 统一改现行 `no-require-imports`。
- **去掉 `no-explicit-any` disable**：迁移文件（`1_to_2` / `2_to_3` / `8_to_9.test`）的 `type X = any` 改为「命名可选字段 + `[key]: unknown` 索引签名」的宽松类型，行为不变。
- **lint 工具链迁 eslint 9 flat config + `eslint-plugin-obsidianmd`**：`npm run lint` 的 error 数对齐官方审核 bot 的阻断集。

### 校准产出语言一致性

- **review / rewrite 强制单语言输出**：按选中文本语言（中/英）整篇输出，不混语；非该语言的候选材料翻译过来，专有名词 / 代码标识 / ref 标题保持原样。

## 0.12.0 — 2026-06-07

### 设置页

- **改为 Tab 形式**（基础 / 模型 / 其他）：基础含官网链接、开始使用、本地服务状态（重启/检查更新/打开日志三按钮并入状态卡）、快捷键、语言；模型含连接订阅、Providers、校准模型选择；其他含重置。
- **标题下加官网链接** `https://www.kogcat.com`（随语言切换文案）。
- **字号层级统一**：去掉 tab 内 h1 段标题，分组统一 sub-header 同字号。
- **色块统一**：引擎卡片 / 计划连接卡片 / 模型列表 / 模型 picker 收敛为同一 card 规范（`--background-secondary` + `--radius-m` + 统一边框），消除突兀灰块与隐形卡片。

### 模型选择

- **自愈默认选中**：`ModelsSection` 在当前校准模型不可用且存在可用模型时，自动落到第一个可用模型；用户已选的有效模型不被改动。
- 添加 provider/模型后自动把校准模型指向新加的可用模型（provider 表单批量添加 + 手动添加两路一致）。

### 校准产出

- **summary 极简化**：有校准点时不再复述原文，信息量全交给「最相关」；面板与复制同步去掉复述段，无强校准点时仅保留提示。

## 0.11.0 — 2026-06-06

### 修复

- **校准/写入请求体丢失（所有平台）**：`requestOmCore` 的 POST 未设 `Content-Length`，node:http 回退 chunked 编码，om-core 解析不到 body → 422 → 校准与记忆写入全失败。补 `Content-Length`。
- **LLM 精炼从不运行**：隐私同意 `PrivacyConsentModal` 成孤儿（无人调用）+ 按钮顺序 bug，`kogcatLlmConsented` 恒为 false → 校准只出确定性模板。接回 `ensureLlmConsent`（首次校准弹一次）并修按钮顺序。
- **引擎不重连**：boot 仅 attach 一次，sidecar 晚到则永不重连。校准时按需重连 + 错误面板加「重连引擎」按钮（失败时显示真实原因）。
- **打开日志卡死/报错**：`openPathWithDefaultApp` 改先查文件存在 → Electron `shell.openPath` 优先（吃绝对路径）→ 回退；去掉误导的"正在打开"成功提示。

### Provider / 模型

- **Provider 表单内获取模型**：填 key/baseURL 后一键拉 `/v1/models`，列表多选直接建模型（OpenAI 兼容族 / Anthropic / Gemini；`requestUrl` 绕 CORS）。
- **当前校准模型选择器**：`ModelsSection` 顶部下拉选用哪个模型（此前无此入口，模型选了也用不上）。
- **同类型 provider 凭据兜底**：所选模型绑定的 provider 无凭据时，自动改用同类型已配置凭据的 provider。
- **只显示可用项（ccswitch 式）**：设置只列已配置的 provider + 可用模型，隐藏出厂无 key 的默认项。
- 移除「高级引擎设置（二进制路径）」入口（`omCorePath` 字段保留，无 UI）。

### 首装引导 / 交互

- 未配置可用 provider 时：介绍弹窗加「配置 Provider」按钮 + 校准面板顶部引导横幅。
- 校准命令注册默认快捷键 `Mod+Shift+C`；设置页加「校准快捷键」入口。

### UI

- 校准面板按 Apple 设计原则重做：留白节奏、层次靠字重/间距、主校准点卡片化、徽章改 pill、复制按钮 hover 浮现、空/加载/错误态更从容；全部走主题变量。
- 图标换成官网品牌 logo（描边、跟随主题）。

### Prompt

- review 精炼 posture 优化（强 warning 才领头反对，否则成立即给 grounded agreement，不硬造反对；reinforce 升为一等点）+ 文风约束（禁破折号/骨架式加粗/三连/公式化收尾）；rewrite 同步文风约束。

测试 156 全过。

## 0.10.0 — 2026-06-04

### Windows 首装健壮化(P0/P1)

- om-core 引擎下载从裸 `requestUrl` 换成 Node https 流式:多源 fallback(阿里云镜像优先 + GitHub)、Range 断点续传、connect/mid-stream 超时、3 次重试、进度提示、`.part` 持久续传 + sha 失败自愈。修国内 Windows「几天装不上」(GitHub release 直连卡死 / 0 字节)。
- zip 解压改纯 JS fflate(含 zip-slip 防御),去掉 Windows 对 PowerShell 的依赖。

### binary cache 脱离 .claude + stable-pointer(P2)

- binary 从 vault 插件目录迁到中立 om data_dir(`<platformdirs om>/bin`,与 CC 插件共享 cache),脱离 `~/.claude`(Claude Code 会 reset/clean 误删)。
- 新增 `current` stable-pointer(Windows junction / POSIX symlink):服务注册指 current,升级=换指针;ob/CC 共享 current、谁版本高谁拥有,根治升级切不动 + 共存死循环。
- 服务检测改"注册是否指向 current"+ 新增 HKCU Run-key 探测分支(schtasks 不可用机器)。

测试全量 156 过;真机 Windows junction 验证。须与 cc-kogcat 同窗口发布。

## 0.9.0 — 2026-06-01

### Removed official-pack consumption

- Removed the official-pack onboarding flow and the knowledge-pack settings UI. Deleted `src/core/om-core/packs.ts` (all `/v1/packs/*` client calls), `src/core/om-core/officialPacks.ts`, and the `PacksSection` settings section.
- Calibration content is now delivered through the om-core self-managed base-image whole-db swap; the plugin no longer installs, upgrades, or manages packs. It only reads base-image status (`/v1/kb/base-image/status`) for display in Settings → Local service.
- Base-image status display, version gating (`REQUIRED_CORE_VERSION` / `REQUIRED_SPEC` / `MIN_REQUIRED_*`), download, and lifecycle are unchanged.

## 0.8.0 — 2026-05-31

### Windows support

- The plugin now runs on Windows (x64). om-core ships a Windows binary (zip bundle) discovered through the same rolling channel as macOS; the wrapper extracts it with PowerShell `Expand-Archive` and resolves the bundle executable as `om-core-bin.exe`.
- Service supervision registers the sidecar with Windows Task Scheduler (per-user, on-logon) through the om-core `install-service` CLI, so onboarding no longer stops on Windows. Transport uses the named-pipe path the engine already supports.
- macOS behaviour is unchanged (tar.xz bundle, launchd).

### Base knowledge image status

- Settings → Local service now shows the om-core base knowledge image state (installed version / absent) next to the engine status. Display-only — om-core owns the image lifecycle; an older sidecar without the endpoint is omitted.

## 0.6.0 — 2026-05-30

### Removed the dormant Smart Composer stack

- Deleted the legacy chat, RAG / vector index (PGlite), MCP, and prompt-template subsystems — unreachable since the review-pass repositioning (the plugin entry already refused to initialize them). ~130 source files removed; the review pass, om-core engine, multi-provider LLM client, and settings are unchanged.
- Dropped the dependencies those subsystems pulled in (lexical, @electric-sql/pglite, drizzle-orm/kit, langchain, @modelcontextprotocol/sdk, react-syntax-highlighter, groq-sdk, parse5, vscode-diff, fuzzysort, react-markdown/remark-gfm, and more) — 28 runtime/dev packages, ~290 transitive packages removed. `main.js` output is unchanged: the dead code was already tree-shaken out.

### Obsidian community-store compliance

- Removed the default `Mod+Shift+C` hotkey so it cannot conflict with user/other-plugin bindings.
- LLM/auth network calls now use Obsidian `requestUrl` instead of `fetch` (Codex + Gemini OAuth endpoints).
- Removed diagnostic `console.log` / `console.info`; only genuine errors and recoverable-failure warnings remain.
- manifest `description` now leads with an action verb and drops the em dash / special characters.
- README and README-zh: dropped the transitional-chat wording and added an explicit "Network use & the local engine" section disclosing the binary download source, sha256 verification, local-binary override, and child-process spawn.

## 0.5.0 — 2026-05-29

### Official calibration pack onboarding

- After the sidecar is ready, onboarding refreshes the channel-backed official-pack status (`POST /v1/packs/official/check`) and installs any missing required calibration pack via the om-core manager (`POST /v1/packs/official/install`), with a progress Notice; outdated required packs surface a hint instead of auto-upgrading. New `src/core/om-core/officialPacks.ts` client. om-core owns channel selection / download verification — the plugin never picks versions or auto-upgrades.
- Engine gate raised to the official-pack manager release: `lifecycle.ts` `MIN_REQUIRED_API_MINOR` 6 → 7 and `download.ts` `REQUIRED_CORE_VERSION` → 0.36.18 (kept in lockstep so the download layer can fetch a binary that satisfies the run gate). `REQUIRED_SPEC` unchanged (22).

### Review-pass repositioning

- The plugin entry no longer initializes the legacy chat / RAG / database stack; the calibration review pass is the single surface. Review synthesis, settings sections, and i18n updated accordingly. (Carried in with this release — review the wording before publishing.)

## 0.4.4 — 2026-05-27

### Windows named-pipe transport

- `transport.ts`:supervised sidecar transport now accepts only `transport: "uds"` / `"npipe"` and uses Node `http.request({socketPath})`; TCP / old pipe discovery is rejected.
- `lifecycle.ts`:transport liveness probing is socketPath-aware for UDS/npipe, and the External TCP settings path was removed.
- Compat gate `MIN_REQUIRED_API_MINOR` 4 → 6 to require the om-core transport contract.

Windows named-pipe smoke must run on Windows.

## 0.4.3 — 2026-05-24

### Requires om-core 0.36.10 (schema 21 / e5 retrieval)

- Bumped the engine gate to the schema-21 / multilingual-e5-small release: `REQUIRED_SPEC` 20 → 21, `REQUIRED_CORE_VERSION` → 0.36.10. The series / api_minor compatibility gate is unchanged (`(0,36)` / api_minor 4). No plugin-side logic change; this pins the plugin to an om-core binary whose dense retrieval is multilingual (much stronger English / cross-lingual recall) and whose hybrid ranking no longer buries top dense hits.

## 0.4.2 — 2026-05-23

### Shell-side review refinement

- The review panel no longer renders om-core's raw recall pool (which dumped every warning / cluster bridge / reinforce as a card — a wall of fragmentary, often-irrelevant items). om-core stays a generic raw-material provider; precision is now the shell's job (mirrors CC's query skill). New `src/core/kogcat/reviewSynthesis.ts`: `synthesizeReview()` runs the user's BYO-key chat model over `{selected text + recall pool}` with an in-plugin refinement prompt → ≤5 high-leverage points (`{stance, judgment, why, refs}`) directly relevant to the selection, extrapolated to its scenario, internal fields hidden, anti-sycophantic, honest "no signal" when nothing calibrates. `curateReviewDeterministic()` is the no-LLM fallback (caps + orders the pool: warnings strongest-first, best cross-domain/tier-1/high-relevance bridges; never the raw wall) — used when there is no consent / no chat model / the LLM fails, so the zero-key onboarding path stays intact. `KogCatReviewView` renders the unified points list; per-point accept/ignore/dismiss unchanged. No om-core change.

## 0.4.1 — 2026-05-23

### Build-time OAuth secret injection

- `GEMINI_OAUTH_CLIENT_SECRET` is no longer a hardcoded literal in `src/constants.ts`; it is injected at build time (esbuild `define`) from the `GEMINI_OAUTH_CLIENT_SECRET` env var or an untracked `secrets.local.json`, and is empty in any build that does not supply it (public source / CI). Keeps the secret out of committed source and secret scanners. See `DEVELOPMENT.md`; `secrets.local.example.json` is the template.

### Right-click review entry

- Registered an `editor-menu` (right-click) entry「KogCat 校准选区 / 当前段落」(selection → 校准选区, otherwise 当前段落), wiring the gesture the onboarding modal and review-panel hint already promised but that had no implementation. The trigger surface is now ribbon + command palette + right-click (+ user-assignable hotkey), matching spec §2/§3/§7.

### om-core version alignment

- Spec/version floor in `download.ts` bumped to match the current om-core 0.36.x binaries: `REQUIRED_SPEC` `19` → `20` (om-core's `SCHEMA_VERSION` is 20 since 0.36.0, so spec-19 channel/fallback filtering matched no release) and the offline fallback floor `REQUIRED_CORE_VERSION` `0.34.0` → `0.36.6`.
- Compat gate `MIN_REQUIRED_API_MINOR` `3` → `4` (`lifecycle.ts`; `MIN_REQUIRED_SERIES` `[0, 36]` unchanged). om-core 0.36.5 fixed a silent failure of dense retrieval + the relevance gate in released binaries — the fix that makes the review recall pipeline (anchor gate / clusters / 2-hop expansion) actually work — but 0.36.5 stayed at api_minor 3, indistinguishable from the broken 0.36.4. om-core 0.36.6 raised `__api_minor__` to 4 (additive: `warnings` gained a `strength` field + strongest-first ordering), so requiring api_minor ≥ 4 forces users onto ≥ 0.36.6 — using api_minor 4 as a proxy for "binary new enough that retrieval is in place."

## 0.4.0

### Review pass consumes the recall pipeline

- The review panel now consumes om-core's recall-pipeline review shape `{summary, has_signal, warnings[], clusters[], reinforce[]}` (was the two-level `points[]`). `warnings` (opposition / invalidation) are front-placed; `clusters` group an anchor concept with its structured cross-domain / contrast bridges (`near`/`predicate`/`far`/`claim`/`cross_domain`/`tier`, rendered with predicate labels + a cross-domain badge + a depth marker, no server-synthesized phrasing); `reinforce` is a supporting fallback shown only when warnings and clusters are both empty. Priority warnings > clusters > reinforce; per-item accept/ignore/dismiss marks unchanged.
- Compat gate raised to series `(0, 36)` / api_minor `3` (`MIN_REQUIRED_API_MINOR`); requires the om-core recall-pipeline binary.

## 0.3.0

### Review pass (repositioning, first cut)

- KogCat is repositioned from a chat client into an editor-anchored **calibration review pass**. New `KogCatReviewView` (ItemView, `src/KogCatReviewView.tsx`) renders a two-level review (top summary → a few high-leverage points with judgement + why + provenance); per-point accept/ignore/dismiss are in-panel marks only — ephemeral, nothing written into note markdown.
- Three entry points: the ribbon now opens the review panel; commands「校准选区 / 当前段落」and「校准整篇笔记」(source kind `vault_selection`). The chat surface is retained in code with its ribbon entry hidden (commands kept as a transition).
- New `calibrateReview()` client → `POST /v1/calibrate/review` (om-core 0.36.1). Compat gate raised to series `(0, 36)` / api_minor `1`; requires om-core ≥ 0.36.1.
- First-run product onboarding `KogCatIntroModal`: positioning + trust statements + one gesture + a sample run on a built-in biased paragraph (deterministic, no LLM key required). Re-openable via the「重看 KogCat 介绍」command. Settings schema 22 → 23 adds `kogcatIntroSeen`.
- README / README-zh: new "Trust & maintenance" section (data-flow disclosure + no-abandonment commitment).

### Docs

- om-core docs 04/05 list the review endpoint + schemas.
- [docs/05-kogcat-calibration.md](docs/05-kogcat-calibration.md) documents the review surface; [docs/03-settings.md](docs/03-settings.md) lists `kogcatIntroSeen`.

## 0.2.2

### om-core onedir binary

- The om-core binary moved to PyInstaller `--onedir` — distributed as a bundle directory packed `om-core-bin-<target>.tar.xz`. The direct-spawn download path (`OM_ALLOW_DIRECT_SPAWN=1`, CI/mock) now extracts it: `download.ts` gained `installBundle()` — extract via system `tar -xJf` into a staging dir, then atomic rename into `bundle/` — invoked when a resolved release's `format` is `tar.xz`. The legacy raw single-file path (absent `format`) is unchanged.
- Channel schema gate `SUPPORTED_CHANNEL_SCHEMA` 2 → 3, aggregate-manifest `SUPPORTED_SCHEMA_VERSION` 1 → 2 — both carry the new per-target `format` field.

## 0.2.0

### Internationalization (i18n)

- **Full bilingual UI (en/zh)** via `i18next` + `react-i18next`. Locale auto-detects from Obsidian `moment.locale()`; user can override under Settings → KogCat → Language.
- **16 namespaces** (`advisor` / `calibration` / `chat` / `command` / `common` / `error` / `modal` / `notice` / `onboarding` / `pack` / `privacy` / `rag` / `settings` / `sidebar` / `status` / `template`) under `src/i18n/locales/{en,zh}/<ns>.json`.
- **Translated surfaces**: 5 commands, all settings page `setName` / `setDesc` / `placeholder` (~90 fields), 12 modals (provider/chat-model/embedding-model/MCP-server form modals, OAuth Plan modals for Claude/Gemini/OpenAI, embedding DB manager, included/excluded files, template form, error, installer-update, confirm, privacy), all user-facing `Notice` messages (~90), Chat header / input buttons / tool actions, Sidebar / Privacy modal / Calibration card / Advisor card. Obsidian-side onboarding flow (download / register-service / start) localized in `onboarding` namespace.
- **Type-safe keys**: `src/i18n/i18next.d.ts` augments `CustomTypeOptions.resources` to the English tree — missing keys fail `npm run type:check`.
- **`npm run i18n:check`**: parity validation across en/zh namespaces (`scripts/i18n-check.mjs`). Wire into CI.
- Settings schema migrated 21 → 22, adds `locale: 'auto' | 'en' | 'zh'`, defaults to `auto`.
- Removed obsolete `src/core/kogcat/i18n.ts` (32-entry hand-rolled dictionary); call sites redirected to `src/i18n`.

### Docs

- New [docs/15-i18n.md](docs/15-i18n.md): module structure, locale resolution, translator workflow, CI hooks, additional-namespace recipe.
- [docs/03-settings.md](docs/03-settings.md) lists `locale` schema field.

## 0.1.4

(prior release)
