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

Requires [EdgeSpeak](https://edgespeak.com) installed locally (and/or the `edgespeak-cli`).

## Skills

| Skill | What it does |
|-------|--------------|
| [`edgespeak-transcribe`](skills/edgespeak-transcribe/SKILL.md) | Transcribe audio/video to text / SRT / JSON, fully on-device |
| [`edgespeak-align`](skills/edgespeak-align/SKILL.md) | Force-align audio against a known transcript → word-level timestamps (karaoke captions, clip cutting, dubbing) |
| [`edgespeak-segment`](skills/edgespeak-segment/SKILL.md) | Split a wall of (even unpunctuated) text into natural sentences |

## How it works

The skills shell out to `edgespeak-cli` (`transcribe` / `align` / `segment`), which talks to the local EdgeSpeak gateway (OpenAI-compatible, `127.0.0.1:1117`, local-only route). Audio is processed on-device — nothing is uploaded.

## License

MIT — see [LICENSE](LICENSE).
