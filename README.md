# KogCat

> AI makes the answer smoother. KogCat makes the judgment sound.

[English](README.md) | [中文](README-zh.md) · **Website:** <https://www.kogcat.com>

A local-first **judgment calibration layer** for Obsidian. Select a line, a section, or a whole note. KogCat reads it against a structured knowledge base of cognitive biases, logic fallacies, and decision frameworks — and hands back a few calibration points to sharpen the judgment. Your markdown stays exactly as you wrote it.

---

## See the difference

You wrote:

> I read 30 minutes a day but feel like I'm forgetting everything. I should take more detailed notes.

**Plain AI** — Try the Cornell method, highlight key passages, add Anki for spaced repetition.

**KogCat** — More notes will likely make it worse. The bottleneck isn't capture. It's retrieval. Research is consistent: close the book, write what you remember — even imperfectly — and it sticks better than any note format applied while reading. Try one session that way. Then weigh what you actually kept against what you thought you had.

---

## How it works

Open the review panel — from the ribbon, the command palette, or a right-click — on a selection, a paragraph, or the whole note. The local engine pulls a recall pool from its calibration base. Connected a chat model? It distills the pool to the few points that matter. Without one, a built-in fallback still works.

---

## Privacy & network

KogCat has no server of its own. Exactly two things touch the network:

1. **The calibration engine (`om-core`).** On first launch, KogCat downloads the binary for your platform from the public release channel (GitHub Releases, with an Alibaba OSS mirror) and verifies it against a **sha256 manifest** before it runs. It's cached outside your vault and reused. KogCat registers it as a local background service — a `com.kogcat.om` LaunchAgent on macOS, an `OmCore` Task Scheduler task on Windows — and talks to it over a local socket only. No inbound port. Prefer your own binary? Point to it in **Settings → KogCat → engine path**, or set `OM_ALLOW_DIRECT_SPAWN=1` to skip the service entirely.
2. **Your LLM provider.** Called only when you consent to review refinement — bring your own key. Point it at a local model (Ollama / LM Studio) to stay fully offline.

No telemetry. No analytics. No account. Your vault is never uploaded — only the text you hand KogCat to review is read, and it never writes proprietary syntax into your notes.

**Maintenance.** Actively maintained. The calibration base refreshes through the engine — nothing for you to install or update. If we ever stop, you'll hear it in advance, with a clean data-export path.

**Uninstall.** Remove the plugin and your vault is untouched. Two things live outside it: the background service and the cached engine. Stop and delete the service (the LaunchAgent or `OmCore` task), then delete the engine under your OS application-support folder.

---

## Requirements

- Obsidian 1.0.0+ (desktop only)
- macOS (Apple Silicon) or Windows x64 — Intel Mac and Linux not yet supported
- An API key for one supported provider: Anthropic, OpenAI, Google Gemini, xAI, DeepSeek, Mistral, Perplexity, OpenRouter, Azure OpenAI, or any OpenAI-compatible endpoint. Local providers (Ollama / LM Studio) need no key.

## Install

1. Install KogCat from the Obsidian community plugin browser, or drop a release build into `<vault>/.obsidian/plugins/kogcat/`, then enable it.
2. Open **Settings → KogCat** and enter your provider API key.
3. Trigger a review. On first use the engine downloads automatically, verifies, and starts; later launches reuse the cache.

## Usage

Select text, or rest the cursor in a paragraph. Open KogCat from the ribbon, command palette, or right-click menu. Then revise the original passage against the points in the panel.

## Acknowledgments

Forked from [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) by Heesu Suh. KogCat keeps its multi-provider LLM client and settings scaffolding; the chat, RAG, MCP, and prompt-template subsystems were removed.

## License

[FSL-1.1-MIT](LICENSE) — converts to MIT two years after each release. Portions derive from Smart Composer (`Copyright (c) 2024 Heesu Suh`), originally MIT-licensed; see Acknowledgments above.
