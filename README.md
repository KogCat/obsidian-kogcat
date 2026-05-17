# KogCat

[中文说明](README-zh.md)

AI gives fast answers. KogCat makes them worth trusting.

Every chat model gives you a confident reply. What it can't tell you is whether
that reply is anchored to a flawed assumption, steering you past the real
problem, or walking you straight into a pitfall it can't see. KogCat runs a
calibration pass on each response against a structured knowledge base of
cognitive biases, logic fallacies, and decision frameworks — and surfaces what
the model missed, without replacing it or slowing you down.

KogCat has no server of its own. The calibration engine runs as a local process
on your machine. Your vault is never read by the plugin — only what you type
into the chat panel is involved. The LLM is whichever provider you already use;
KogCat reads the completed response and evaluates it locally. Nothing about this
setup requires an account, a subscription, or trusting a third party with your
notes.

---

## See the difference

### Example 1 — Learning

You ask: *"I've been reading for 30 minutes every day but I feel like I'm
forgetting everything. Should I take more detailed notes while I read?"*

**Without KogCat:**

> Taking detailed notes is a great way to improve retention. Try the Cornell
> method: divide your page into cues, notes, and a summary section. Highlight
> key passages as you go, then rewrite them in your own words afterward.
> Spaced repetition tools like Anki can also help reinforce what you've
> captured.

**With KogCat — Quick Answer advisor card:**

> **KogCat has an additional perspective** ›
>
> More notes during reading is likely to make the problem worse, not better.
> The bottleneck isn't capture — it's retrieval practice. Research on learning
> consistently shows that closing the book and writing down what you remember
> (even imperfectly) produces stronger retention than any note-taking method
> applied while reading. Adding more detailed notes increases the feeling of
> learning without changing how much actually sticks.
>
> Before changing your note format, try one session where you read a chapter,
> close everything, and write a rough summary from memory. Compare how much
> you actually retained against how much you thought you did.

---

### Example 2 — Getting things done

You ask: *"I have a deliverable due in two weeks and I keep putting it off.
I've tried time-blocking but I still end up doing other things during those
blocks. What should I do?"*

**Without KogCat:**

> Procrastination often comes down to task ambiguity or low energy. Try
> breaking the deliverable into smaller subtasks and scheduling them
> individually. The Pomodoro technique can also help — commit to just 25
> minutes, then take a break. Removing distractions (phone in another room,
> website blockers) during your blocks will make them more effective.

**With KogCat — Quick Answer advisor card:**

> **KogCat suggests reviewing this first** ›
>
> If time-blocking already isn't working, adding Pomodoro and blockers is more
> structure on top of a different problem. Persistent avoidance of a specific
> task — especially one with a real deadline — usually means one of two things:
> the next action isn't actually concrete (you know the goal but not the
> literal first move), or there's something about this particular deliverable
> that feels risky or unresolvable.
>
> Structure-based fixes address attention. They don't address ambiguity or
> resistance, and can produce sessions where you're technically working but
> drifting to lower-stakes parts of the project. The faster question: what is
> the single next physical action on this deliverable, and is there something
> about it you've been avoiding deciding?

---

## Two modes, one plugin

**Quick Answer** keeps your normal chat rhythm. Your model answers as usual.
KogCat evaluates the response in the background and shows an advisor card only
when its judgment diverges meaningfully from the model's. The original answer
is never silently replaced — you stay in control of what to accept.

**Advisor Answer** puts KogCat's judgment first. The model still generates a
draft, but what you see is KogCat's own structured response: a clear
conclusion, the conditions that change the advice, the key risk or boundary,
and a concrete next step. Use this for decisions where a confident-sounding
wrong answer carries real cost.

Switch between modes with a single control at the top of the chat panel.

---

## What touches what

- **Your vault:** never read by KogCat. The plugin has no access to your notes
  unless you paste content into the chat yourself.
- **Your chat messages:** sent to your chosen LLM provider, the same as any
  other chat plugin. KogCat sees the completed response — not the message in
  transit.
- **Calibration:** runs entirely inside the local engine process. The judgment
  does not leave your machine.
- **The LLM:** your API key, your provider, your choice. KogCat adds a layer
  on top of the response; it does not replace or proxy the model.
- **The engine binary:** downloaded once from a pinned GitHub Release and
  verified against a sha256 manifest before it runs. No silent updates.

---

## Requirements

- Obsidian 1.0.0 or later (desktop only — mobile is not supported).
- macOS (arm64 / x64) or Windows x64.
- An API key for at least one supported provider (Anthropic, OpenAI, Google,
  Groq, …) configured in plugin settings.

## Install

1. Install KogCat from the Obsidian community plugin browser, or copy a
   release build into `<vault>/.obsidian/plugins/kog-cat/`.
2. Enable the plugin.
3. Open **Settings → KogCat** and enter your provider API key.
4. Open the chat panel. On first use, the calibration engine downloads
   automatically and is verified against a sha256 manifest before starting.
   Subsequent launches reuse the cached binary — no repeated downloads.

## Usage

1. Open the chat panel from the ribbon or command palette (`KogCat: Open chat`).
2. Choose your answer mode — **Quick Answer** or **Advisor Answer** — from the
   control at the top of the panel.
3. Chat as normal.
   - **Quick Answer:** an advisor card appears below the model's response when
     KogCat has something worth adding. Tap **View KogCat Answer** to expand.
   - **Advisor Answer:** KogCat's structured response is shown directly as the
     assistant reply.

No separate calibration step. No manual triggers. No settings to tune before
you start.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for build setup, database migrations,
and test layout. Issues and patches: <https://github.com/KogCat/obsidian-kogcat>.

## Acknowledgments

KogCat is forked from [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer)
by Heesu Suh. The chat UI, mention system, and PGlite-backed vault index are
built on that codebase.

## License

[MIT](LICENSE). Upstream copyright `Copyright (c) 2024 Heesu Suh` is retained
verbatim in the LICENSE file per the MIT notice clause.
