---
name: edgespeak-transcribe
version: 0.1.0
minCliVersion: 0.3.0
description: Transcribe audio/video on-device via EdgeSpeak into text, JSON, or SRT, with optional word-level timing and sentence-shaping parameters for subtitles, meeting notes, voice memos, and searchable transcripts. Use when the user has a local media file to turn into private no-upload transcription or wants transcribe output tuned with timing or segment options.
---

# EdgeSpeak Transcribe

Turn audio/video into a transcript, **entirely on-device — the audio never leaves the machine**. Under the hood it calls `edgespeak-cli transcribe`. When the EdgeSpeak desktop app is running, the CLI talks to its local gateway (OpenAI-compatible, `127.0.0.1:1117`) and reuses the warm model (proxy mode); when the app is not running, the CLI launches the bundled on-device engine itself (standalone mode). **Standalone is a normal mode, not an error.**

**Version compatibility.** The frontmatter pins this skill's `version` and the oldest CLI it is written against (`minCliVersion`). If `edgespeak-cli --version` reports something older, run `edgespeak-cli update` (or re-run the installer) before relying on the flags documented here. Same-numbered builds can still differ, so `--help` is the tiebreaker: a command or flag documented here but missing from the installed `--help` also means update — don't route around it.

## Inputs to confirm

- Media path to transcribe.
- Desired output: stdout text, `.txt`, `.json`, or `.srt`.
- Any requested model, word timing, sentence length, or subtitle padding options.

**If the user wants subtitles or captions, ask about cue shaping before the first run.** Cue length is not guessable from the request, and discovering it afterwards costs a whole re-transcription. Ask once, in a single message:

- Max characters per cue? (`--max-chars`; roughly 60-90 reads well, and the default leaves whole sentences intact.)
- Any minimum length or leading/trailing padding? (`--min-chars`, `--start-margin`, `--end-margin`.)

Then run `transcribe` with the answers applied. Do not produce a plain `-o out.srt` first and re-run with shaping after.

## How to do it

1. Confirm the path to the file to transcribe.
2. Check the runtime first:

   ```bash
   edgespeak-cli status
   ```

   - **Command not found** → the CLI isn't installed. Tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed; macOS Apple Silicon and Linux x86_64 — on Linux the installer auto-detects NVIDIA GPUs and installs a CUDA-enabled runtime).
   - **License not activated / locked** → run `edgespeak-cli login` to sign in via the browser (purchased accounts activate this machine directly, new accounts start a free 7-day trial; signing in also replaces an anonymous trial with your account credentials), or `edgespeak-cli activate <KEY>` with an existing key. No account and no browser at hand? `edgespeak-cli trial` starts an instant anonymous 7-day trial (device-bound, one per device; trial transcription has a daily time cap). (If `edgespeak-cli trial --help` describes a browser sign-in, the installed CLI predates the instant trial — run `edgespeak-cli update` first.) Non-interactive runs (agents, pipes, CI) fail fast with `license_required` instead of prompting — activate first, then rerun.
   - **Remote active ASR backend** → file transcription is local-only; ask the user to switch EdgeSpeak to the local engine before transcribing.
   - **Gateway not running (standalone)** → this is fine; `transcribe` will launch the bundled on-device engine itself.
3. Run `edgespeak-cli` and pass requested tuning options explicitly:

   ```bash
   edgespeak-cli transcribe <audio-or-video-file> [-o output-file] [--format txt|json|srt] [options]
   ```

   - Without `-o`: the transcript prints to **stdout** (easy to read / post-process).
   - `-o out.srt` / `out.json` / `out.txt`: writes a file; **the extension decides the format**.
   - **Do not silently overwrite an existing output file.** The CLI clobbers an existing `-o` target without warning. If the requested path already exists and the user did not explicitly ask to overwrite or regenerate that exact file, confirm with the user first (or agree on a different path); if you cannot ask, write to a new non-conflicting path and say so in your answer.
   - Use `--format txt|json|srt` when the output path does not end exactly in `.txt`, `.json`, or `.srt` (for example, some temporary filenames).
   - Use `--model <model-id>` only when the user explicitly asks for a specific local EdgeSpeak model.
   - Use `--license-key <KEY>` (alias `--key`) only to pass a license key explicitly for this run; normally activation (above) already covers it.
4. With the transcript in hand, summarize / clean up / translate as the user needs.

## One inference pass per media file

Transcription is the expensive step; output format and sentence shaping are downstream of it. Settle the output shape **before** the first run, and whenever timing matters at all, make a word-level JSON the master artifact:

```bash
edgespeak-cli transcribe media.mp4 -o out.json --max-chars 80   # text + segments + words[]
```

That JSON already contains every cue boundary you could need — `segments[].words[]` carries real `start`/`end` per word. SRT, ASS, karaoke highlighting, clip ranges, and a re-split at a different cue length are all derivable from it **without touching the audio again**. To re-split, run `edgespeak-cli segment --transcript out.json --max-chars <N>` — it re-splits the text and re-maps the word timings natively (a text-only pass, seconds not minutes) and emits the same transcribe-shaped JSON/SRT (see `edgespeak-segment`).

Re-running `transcribe` on the same media purely to change `-o`/`--format`, or to retry a different `--max-chars`, burns a full inference pass over the whole file for output you already had the data to build. What a re-run *does* buy is the CLI's native shaping, which is pause- and margin-aware in ways a pure text re-split is not — so re-run when caption timing quality is itself the goal, not when you just need another file format.

## Timing and segment parameter map

Pass through user-requested timing and sentence-shaping knobs instead of silently dropping them:

| User asks for | Use with `transcribe` | Notes |
| --- | --- | --- |
| Word-level timing, karaoke timing, word-accurate structured output | `-o out.json` or `--format json` | CLI JSON is the same shape as the gateway's `verbose_json` transcription response; when word timing is available, words are stored under each segment's `words` array (`segments[].words[]`). There is no top-level `words[]`. |
| Subtitle cues from real speech-window timing | `-o out.srt` or `--format srt` | SRT uses the sentence/caption segments produced by the local file flow. |
| Explicit timestamp granularity | `--timestamps none\|word\|segment` | Comma-separated or repeated for multiple granularities (alias `--timestamp-granularities`). Defaults adapt to the output format: `json`→`word`, `srt`→`segment`, `txt`→`none`. `word` is only valid with `json` output; `none` cannot be combined with other values. |
| Run on a specific compute backend | `--device cpu\|cuda\|cuda:<N>\|metal\|auto` | Case-insensitive; `cuda:<N>` selects GPU N, `metal` (alias `mps`) is macOS, `gpu` means Metal on macOS / CUDA elsewhere. **Standalone mode only** — with the app gateway reachable the flag errors explicitly; quit the app (or change `--base-url`) to choose a backend. |
| Minimum / maximum sentence length | `--min-chars <N>` / `--max-chars <N>` | These tune semantic sentence shaping. They work in both proxy mode and standalone mode. |
| Leading / trailing caption padding | `--start-margin <SECS>` / `--end-margin <SECS>` | Seconds, clamped to the supported range (currently 0.0-5.0). They apply to timestamped transcript windows, not plain text segmentation. |
| Specific local transcription model | `--model <model-id>` | Use only when the user names a model or asks to override the configured local model. |

For supported languages, the local gateway file flow runs per-window forced alignment and semantic sentence splitting by default. Plain `txt`/stdout gives text only; use `json` or `srt` when the user needs timing.

CLI `json` output is **exactly the gateway's `verbose_json` response shape** — in proxy mode the API response is passed through verbatim, and standalone mode constructs the identical shape. Word timing items use `{ word, start, end, score? }` (seconds) under `segments[].words[]`. `score` is a `[0, 1]` confidence and is present only when the engine has a real alignment source — absent means "no score", never fabricate one:

```json
{
  "task": "transcribe",
  "duration": 19.69,
  "language": "English",
  "text": "Lattice AI is a high-performance engine ...",
  "segments": [
    { "id": 0, "start": 0.0, "end": 19.69, "text": "Lattice AI is a high-performance engine ...",
      "words": [ { "word": "Lattice", "start": 0.22, "end": 0.64, "score": 0.91 } ] }
  ],
  "usage": { "type": "duration", "seconds": 19.69 }
}
```

`text` is the full continuous transcript. Optional keys are omitted rather than set to null: `language` appears only when the engine reports one, `segments` is omitted when empty, and a segment's `words` is omitted when there is no word timing. Words are nested per segment — do not read a flat top-level `words[]`. JSON key order is not guaranteed (may be alphabetical); parse by key, not position.

Do not invent unsupported `transcribe` flags:

- `transcribe` does **not** expose `--protected-terms`. If the user has a reference transcript and needs brand/jargon protection during alignment, use `edgespeak-align` with `--protected-terms`.
- `transcribe` does **not** expose the standalone segmenter's `--threshold`. If the user already has text and asks for a threshold, use `edgespeak-segment --threshold`.
- **Standalone accepts sentence shaping too.** When the app is not running, `transcribe` runs in standalone mode and still accepts `--min-chars`, `--max-chars`, `--start-margin`, and `--end-margin`. Unspecified fields inherit the saved EdgeSpeak sentence-segmentation preferences; explicit flags override only the fields they set.

## API-only timing controls

Prefer `edgespeak-cli transcribe`. If the user explicitly asks to pass lower-level alignment or segment toggles that the CLI does not expose, call the local OpenAI-compatible gateway directly instead of inventing CLI flags.

Use `POST /v1/audio/transcriptions` with multipart fields:

- `file=@media.wav`
- `response_format=verbose_json`
- `timestamp_granularities[]=word` to request word-level output (requires `response_format=verbose_json`). Word-level results land under `segments[].words[]` in the response, items `{ word, start, end, score? }` in seconds — EdgeSpeak does **not** emit OpenAI's top-level `words[]`, so a reader that only checks the top level sees nothing.
- `x_edgespeak_semantic_segmentation={"min_chars":40,"max_chars":160,"start_margin":0.08,"end_margin":0.12}` to request semantic sentence shaping. All four subfields are optional, margins are in **seconds**, and passing any shaping field activates shaping

API margin fields are seconds, the same unit as the CLI flags. When no shaping field is passed, the EdgeSpeak app's saved sentence-segmentation preferences decide the defaults; any field you pass overrides them.

The OpenAI-compatible transcription API uses multipart `file` upload. Do not send a text `path` field to `/v1/audio/transcriptions` — the gateway rejects it with a 400. For same-machine calls you may instead put a local **absolute path as the `file` field value** (e.g. curl `-F file=/abs/media.wav`, no `@`); the loopback gateway detects it and reads from disk, which avoids re-uploading large files. Anywhere else, upload bytes with `file=@`. Top-level multipart fields `min_chars`, `max_chars`, `start_margin`, and `end_margin` (seconds) are also accepted and mean the same as the aggregated field.

Only use this API path when the user needs those specific controls and you have the local gateway URL/key context. Otherwise stay with the CLI.

When to still reach for the separate skills: use `edgespeak-align` only when you have an **external reference transcript** (not the one transcribe just produced) and need it timed; use `edgespeak-segment` to split **plain text you already have** into sentences, or (`segment --transcript`) to re-split an existing word-timed JSON at a new cue length. For "transcribe this and give me word/sentence timing", a single `transcribe -o out.json` is the whole job.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`.** If the command isn't found, tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed; macOS Apple Silicon and Linux x86_64, CUDA auto-detected on Linux). If it's found but errors, show the error — **do not fabricate a transcript under any circumstances**.
- **First use needs activation.** A fresh install activates once via `edgespeak-cli login` (browser sign-in; purchased accounts activate directly, new accounts start the trial, and signing in upgrades an anonymous trial to your account), `edgespeak-cli activate <KEY>`, or `edgespeak-cli trial` (instant anonymous 7-day trial, no browser or account; one per device, daily transcription cap). Without it the on-device engine fails with `license_required`; the error carries self-serve guidance plus a purchase link — surface it, don't work around it. In an interactive terminal, standalone commands offer to sign in and continue automatically; non-interactive runs (agents, pipes, CI) fail fast instead of prompting. To pass the key explicitly on a single run, use `--license-key <KEY>` (alias `--key`).
- **Local-only for file transcription**: `edgespeak-cli transcribe` refuses remote/cloud ASR backends even if the gateway lists them. If `edgespeak-cli status` shows `transcribe` as a remote backend, ask the user to switch EdgeSpeak to the local engine before transcribing.
- **First run in standalone may download a model.** With the app not running, the first transcription downloads the on-device model on demand (progress on stderr, can take tens of seconds). **Don't assume it hung.** To avoid the wait, pre-download with `edgespeak-cli models download --all` (or a specific id such as `lattice-2-flash`) — standalone only, quit the EdgeSpeak app first; `--json` emits a `{"downloaded":[…],"skipped":[…],"failed":[…]}` envelope. `edgespeak-cli models list` shows each model's `downloaded` status in standalone runs.
- **`--device` only works in standalone mode.** With the app running the CLI errors explicitly (the running app controls its own backend). An unavailable backend (e.g. `cuda` on a CPU-only install, `metal` off macOS) also errors explicitly — it never silently falls back.
- **Missing model over the gateway API.** With the app running, `/v1/audio/transcriptions` auto-downloads a missing local model (bounded wait, on by default). If it is not ready within the request budget you get HTTP 503 with code `model_downloading` (retry after `Retry-After`) or `model_not_downloaded` (auto-download disabled — download it in EdgeSpeak → Models or enable the setting). Treat both as retryable, not permanent failures.
- **Word-level timing depends on language**: for supported languages, `json` can carry real per-word timestamps (inline forced alignment). For unsupported languages you get **segment-level** (VAD-split) timing only — don't claim per-word timing there.
- **Check that word timing actually arrived.** If the `json` output comes back as a single whole-audio segment with no `words` array, the on-device post-processing didn't run — open the EdgeSpeak app and rerun (proxy mode). Never pad missing word timing yourself.
- **A too-tight `--max-chars` splits mid-clause.** Sentence shaping is a length constraint, not line wrapping: when no semantic boundary fits the budget it breaks between arbitrary words (`... dinner plans, and stray` / `worries, our inner monologue ...`). This gets common below ~60 chars on dense narration. Skim the result for cues ending on a conjunction, preposition, or article, and loosen the limit if you see them.
- **No speaker diarization** — don't promise "who said what".
- Long audio can take tens of seconds (model decrypt + inference). **Don't assume it hung** — be patient.
