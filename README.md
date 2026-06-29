# EdgeSpeak Skills

**English** · [简体中文](README.zh-CN.md)

Agent Skills that let any Skills-capable agent transcribe audio/video **on-device** through [EdgeSpeak](https://edgespeak.com) — audio never leaves your machine.

## Install

```bash
# auto-detect your agent
npx skills add lattifai/EdgeSpeak-Skills

# or target a specific agent
npx skills add lattifai/EdgeSpeak-Skills --agent claude-code
npx skills add lattifai/EdgeSpeak-Skills --agent cursor
npx skills add lattifai/EdgeSpeak-Skills --agent codex
```

## Requirements

The skills shell out to `edgespeak-cli`, a self-contained on-device transcription runtime (macOS arm64). You can get it in either of two ways:

- **Self-contained CLI — no app required:**

  ```bash
  curl -fsSL https://edgespeak.com/install.sh | sh
  ```

  This installs a self-contained runtime (CLI + on-device engine + dependencies) under `~/.edgespeak/runtime` and symlinks `edgespeak-cli` into `~/.local/bin` (PATH is set up for you).

- **Desktop app:** install [EdgeSpeak](https://edgespeak.com) from the website — it ships the same `edgespeak-cli`.

Either way, verify the install:

```bash
edgespeak-cli --version
edgespeak-cli status
```

Update the runtime later with `edgespeak-cli update` (re-fetches the latest self-contained package).

## Activation

First use needs a one-time activation — the on-device engine requires a valid license:

```bash
edgespeak-cli activate <KEY>
```

`<KEY>` is your buyout key or trial code (both start with `ES-`, obtained from [edgespeak.com](https://edgespeak.com)). The same command handles either. Activation goes online once to exchange the key for a signed credential stored on your machine; after that a buyout key works fully offline (a trial still re-checks online). You can also pass the key via `--stdin` (avoids shell history) or the `EDGESPEAK_LICENSE_KEY` environment variable. Run `edgespeak-cli status` any time to see your plan, trial time left, and any lock reason; expired or invalid licenses surface a purchase link at [edgespeak.com](https://edgespeak.com).

## Skills

| Skill | What it does |
|-------|--------------|
| [`edgespeak-transcribe`](skills/edgespeak-transcribe/SKILL.md) | Transcribe audio/video to text / SRT / JSON with timing and sentence-shaping options, fully on-device |
| [`edgespeak-align`](skills/edgespeak-align/SKILL.md) | Force-align audio against a known transcript → word-level timestamps (karaoke captions, clip cutting, dubbing) |
| [`edgespeak-segment`](skills/edgespeak-segment/SKILL.md) | Split a wall of (even unpunctuated) text into natural sentences |

## How it works

The skills shell out to `edgespeak-cli` (`transcribe` / `align` / `segment`). When the EdgeSpeak desktop app is running, the CLI talks to its local gateway (OpenAI-compatible, `127.0.0.1:1117`, local-only route) and reuses the warm model (proxy mode). When the app is not running, the CLI launches the bundled on-device engine itself (standalone mode) — this is a normal mode, not an error. Either way audio is processed on-device — nothing is uploaded.

## License

MIT — see [LICENSE](LICENSE).
