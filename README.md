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

Most skills shell out to `edgespeak-cli`, a self-contained on-device transcription and speech runtime for **macOS Apple Silicon** and **Linux x86_64**. The karaoke skill uses configured EdgeSpeak MCP tools when available and falls back to the same CLI. You can get the runtime in either of two ways:

- **Self-contained CLI — no app required:**

  ```bash
  curl -fsSL https://edgespeak.com/install.sh | sh
  ```

  This installs a self-contained runtime (CLI + on-device engine + dependencies) under `~/.edgespeak/runtime` and symlinks `edgespeak-cli` into `~/.local/bin` (PATH is set up for you). On Linux the installer detects NVIDIA GPUs (via `nvidia-smi`) and automatically installs a CUDA-enabled runtime matched to your GPU generation, falling back to the CPU build otherwise; set `EDGESPEAK_LINUX_PROFILE=cpu|cuda-legacy|cuda-modern|cuda-blackwell` to override the detection. At run time, `--device cpu|cuda|cuda:<N>|metal|auto` on `transcribe` / `align` / `segment` / `speech` selects the compute backend (standalone mode only).

- **Desktop app:** install [EdgeSpeak](https://edgespeak.com) from the website — it ships the same `edgespeak-cli`.

Either way, verify the install:

```bash
edgespeak-cli --version
edgespeak-cli status
```

Update the runtime later with `edgespeak-cli update` (re-fetches the latest self-contained package).

### Versioning

Each skill's frontmatter carries its own `version` plus `minCliVersion` — the oldest `edgespeak-cli` that skill is written against (the translate skill has no CLI dependency, so no `minCliVersion`). If `edgespeak-cli --version` reports something older, or a flag documented in a skill is missing from the installed `--help`, run `edgespeak-cli update` first.

### Extra requirements for the karaoke skill

`edgespeak-karaoke` runs bundled scripts and renders video, so it also needs:

- **Node.js 18 or newer.**
- **FFmpeg built with `libass`**, and `ffprobe` — a separate executable that must also be on PATH.
  Style previews and hard subtitles both go through FFmpeg's `ass` filter, which libass provides; an
  FFmpeg without it fails with `No such filter: 'ass'`. Burning to MP4/MOV/MKV/TS also needs
  `libx264`; WebM needs `libvpx` and `libopus`.

`brew install ffmpeg` and the ffmpeg packages in the major Linux distributions include all of these.
Verify with:

```bash
node --version                       # v18 or newer
ffprobe -version                     # must exist alongside ffmpeg
ffmpeg -filters   | grep -w ass      # the ASS renderer
ffmpeg -encoders  | grep -w libx264  # H.264 output
```

## Activation

First use needs a one-time activation — the on-device engine requires a valid license:

```bash
# Sign in via your browser: purchased accounts activate this machine directly,
# new accounts start a free 7-day trial automatically.
edgespeak-cli login

# No account and no browser at hand? Start an instant anonymous 7-day trial
edgespeak-cli trial

# Or activate directly if you already have a license key
edgespeak-cli activate <KEY>
```

`login` opens a browser sign-in and finishes activation automatically — and if the device is already on the anonymous trial, signing in replaces the trial with your account credentials; `--no-browser` prints the sign-in link instead, `--json` emits the resulting license status. `trial` starts an anonymous, device-bound trial with zero friction (one trial per device; trial transcription has a daily time cap) — if `edgespeak-cli trial --help` describes a browser sign-in, the installed CLI predates the instant trial — run `edgespeak-cli update` first. `<KEY>` is your license key (starts with `ES-`) from [edgespeak.com](https://edgespeak.com). Activation goes online once to exchange the key for a signed credential stored on your machine. Buyout licenses show as `lifetime`; unless full offline mode is explicitly enabled, `edgespeak-cli status` will also show how long the cached license can work without internet. You can pass the key via `--stdin` (avoids shell history) or the `EDGESPEAK_LICENSE_KEY` environment variable. Run `edgespeak-cli status` any time to see your plan, trial time left, offline cache window, and any lock reason; expired or invalid licenses surface a purchase link at [edgespeak.com](https://edgespeak.com).

For headless or air-gapped machines: `edgespeak-cli models download --all` pre-downloads the default transcription / alignment / segmentation models (standalone only — quit the EdgeSpeak app first), and lifetime licenses can then run `edgespeak-cli offline enable` to keep working fully offline.

## Skills

| Skill | What it does |
|-------|--------------|
| [`edgespeak-transcribe`](skills/edgespeak-transcribe/SKILL.md) | Transcribe audio/video to text / SRT / JSON with timing and sentence-shaping options, fully on-device |
| [`edgespeak-align`](skills/edgespeak-align/SKILL.md) | Force-align audio against a known transcript → word-level timestamps (karaoke captions, clip cutting, dubbing) |
| [`edgespeak-segment`](skills/edgespeak-segment/SKILL.md) | Split a wall of (even unpunctuated) text into natural sentences — or re-split a word-timed transcript at a new cue length with every word timing re-mapped |
| [`edgespeak-broadcast`](skills/edgespeak-broadcast/SKILL.md) | Turn text into speech fully on-device (Broadcast): WAV synthesis with selectable, cloned, or text-designed voices, style instructions, and reproducible seeds |
| [`edgespeak-karaoke`](skills/edgespeak-karaoke/SKILL.md) | Create styled word-highlighted ASS captions, preview presets on real video frames, and optionally burn them into the source container where practical |
| [`edgespeak-translate`](skills/edgespeak-translate/SKILL.md) | Translate a timed transcript with the timings and 1:1 segment mapping intact — subtitles, bilingual SRT, or a length-budgeted dub script |

## How it works

The transcription, alignment, segmentation, and broadcast skills shell out to `edgespeak-cli` (`transcribe` / `align` / `segment` / `speech`). The karaoke skill prefers a configured EdgeSpeak MCP server and uses the CLI as its fallback. The translate skill uses no EdgeSpeak runtime at all — the agent does the translating itself, so the text stays on your machine like the audio does; its bundled checker, which verifies the timings and segment mapping survived, needs only Node.js 18+. When the EdgeSpeak desktop app is running, CLI calls use its local gateway (OpenAI-compatible, `127.0.0.1:1117`, local-only route) and reuse the warm model (proxy mode). When the app is not running, the CLI launches the bundled on-device engine itself (standalone mode) — this is a normal mode, not an error. Either way audio is processed on-device — nothing is uploaded.

## License

MIT — see [LICENSE](LICENSE).
