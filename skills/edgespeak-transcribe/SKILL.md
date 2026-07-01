---
name: edgespeak-transcribe
description: Transcribe audio/video on-device via EdgeSpeak into text, JSON, or SRT, with optional word-level timing and sentence-shaping parameters for subtitles, meeting notes, voice memos, and searchable transcripts. Use when the user has a local media file to turn into private no-upload transcription or wants transcribe output tuned with timing or segment options.
---

# EdgeSpeak Transcribe

Turn audio/video into a transcript, **entirely on-device — the audio never leaves the machine**. Under the hood it calls `edgespeak-cli transcribe`. When the EdgeSpeak desktop app is running, the CLI talks to its local gateway (OpenAI-compatible, `127.0.0.1:1117`) and reuses the warm model (proxy mode); when the app is not running, the CLI launches the bundled on-device engine itself (standalone mode). **Standalone is a normal mode, not an error.**

## Inputs to confirm

- Media path to transcribe.
- Desired output: stdout text, `.txt`, `.json`, or `.srt`.
- Any requested model, word timing, sentence length, or subtitle padding options.

## How to do it

1. Confirm the path to the file to transcribe.
2. Check the runtime first:

   ```bash
   edgespeak-cli status
   ```

   - **Command not found** → the CLI isn't installed. Tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed).
   - **License not activated / locked** → first use needs a one-time activation: `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com).
   - **Remote active ASR backend** → file transcription is local-only; ask the user to switch EdgeSpeak to the local engine before transcribing.
   - **Gateway not running (standalone)** → this is fine; `transcribe` will launch the bundled on-device engine itself.
3. Run `edgespeak-cli` and pass requested tuning options explicitly:

   ```bash
   edgespeak-cli transcribe <audio-or-video-file> [-o output-file] [--format txt|json|srt] [options]
   ```

   - Without `-o`: the transcript prints to **stdout** (easy to read / post-process).
   - `-o out.srt` / `out.json` / `out.txt`: writes a file; **the extension decides the format**.
   - Use `--format txt|json|srt` when the output path does not end exactly in `.txt`, `.json`, or `.srt` (for example, some temporary filenames).
   - Use `--model <model-id>` only when the user explicitly asks for a specific local EdgeSpeak model.
   - Use `--license-key <KEY>` (alias `--key`) only to pass a license key explicitly for this run; normally activation (above) already covers it.
4. With the transcript in hand, summarize / clean up / translate as the user needs.

## Timing and segment parameter map

Pass through user-requested timing and sentence-shaping knobs instead of silently dropping them:

| User asks for | Use with `transcribe` | Notes |
| --- | --- | --- |
| Word-level timing, karaoke timing, word-accurate structured output | `-o out.json` or `--format json` | CLI JSON uses the EdgeSpeak caption JSON shape; when word timing is available, words are stored under each supervision's `alignment.word` array. Do not assume OpenAI `verbose_json` `words[]` fields from the CLI renderer. |
| Subtitle cues from real speech-window timing | `-o out.srt` or `--format srt` | SRT uses the sentence/caption segments produced by the local file flow. |
| Minimum / maximum sentence length | `--min-chars <N>` / `--max-chars <N>` | These tune semantic sentence shaping. They work in both proxy mode and standalone mode. |
| Leading / trailing caption padding | `--start-margin <SECS>` / `--end-margin <SECS>` | Seconds, clamped to the supported range (currently 0.0-5.0). They apply to timestamped transcript windows, not plain text segmentation. |
| Specific local transcription model | `--model <model-id>` | Use only when the user names a model or asks to override the configured local model. |

For supported languages, the local gateway file flow runs per-window forced alignment and semantic sentence splitting by default. Plain `txt`/stdout gives text only; use `json` or `srt` when the user needs timing.

In CLI `json` / caption JSON output, word timing items use `{ symbol, start, duration }` under `supervisions[].alignment.word[]`. Transcription JSON does **not** include a per-word score. Do not parse it as flat OpenAI `words[]` with `{ word, start, end, score }`.

Do not invent unsupported `transcribe` flags:

- `transcribe` does **not** expose `--protected-terms`. If the user has a reference transcript and needs brand/jargon protection during alignment, use `edgespeak-align` with `--protected-terms`.
- `transcribe` does **not** expose the standalone segmenter's `--threshold`. If the user already has text and asks for a threshold, use `edgespeak-segment --threshold`.
- **Standalone sentence shaping is supported.** When the app is not running, `transcribe` runs in standalone mode and still accepts `--min-chars`, `--max-chars`, `--start-margin`, and `--end-margin`. Unspecified fields inherit the saved EdgeSpeak sentence-segmentation preferences; explicit flags override only the fields they set.

## API-only timing controls

Prefer `edgespeak-cli transcribe`. If the user explicitly asks to pass lower-level alignment or segment toggles that the CLI does not expose, call the local OpenAI-compatible gateway directly instead of inventing CLI flags.

Use `POST /v1/audio/transcriptions` with multipart fields:

- `file=@media.wav`
- `response_format=verbose_json`
- `timestamp_granularities[]=word` to request word-level output
- `x_edgespeak_semantic_segmentation={"enabled":true,"min_chars":40,"max_chars":160,"start_margin_ms":80,"end_margin_ms":120}` to request semantic sentence shaping

API margin fields are milliseconds. Convert from CLI-style seconds explicitly: `--start-margin 0.2` corresponds to `start_margin_ms=200`.

The OpenAI-compatible transcription API uses multipart `file` upload. Do not send a text `path` field to `/v1/audio/transcriptions`; path-based file execution is an internal CLI/native optimization, not the public OpenAI-compatible contract. Legacy top-level fields such as `semantic_sentence_enabled`, `min_chars`, `max_chars`, `start_margin_ms`, and `end_margin_ms` may be accepted for compatibility, but new examples should prefer the aggregated `x_edgespeak_semantic_segmentation` field.

Only use this API path when the user needs those specific controls and you have the local gateway URL/key context. Otherwise stay with the CLI.

When to still reach for the separate skills: use `edgespeak-align` only when you have an **external reference transcript** (not the one transcribe just produced) and need it timed; use `edgespeak-segment` only to split **plain text you already have** into sentences. For "transcribe this and give me word/sentence timing", a single `transcribe -o out.json` is the whole job.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`.** If the command isn't found, tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed). If it's found but errors, show the error — **do not fabricate a transcript under any circumstances**.
- **First use needs activation.** A fresh install must be activated once with `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com). Without it the on-device engine fails with `license_required`; that error and `status` carry a purchase link — surface it, don't work around it. To pass the key explicitly on a single run, use `--license-key <KEY>` (alias `--key`).
- **Local-only for file transcription**: `edgespeak-cli transcribe` refuses remote/cloud ASR backends even if the gateway lists them. If `edgespeak-cli status` shows `transcribe` as a remote backend, ask the user to switch EdgeSpeak to the local engine before transcribing.
- **First run in standalone may download a model.** With the app not running, the first transcription downloads the on-device model on demand (progress on stderr, can take tens of seconds). **Don't assume it hung.**
- **Word-level timing depends on language**: for supported languages, `json` can carry real per-word timestamps (inline forced alignment). For unsupported languages you get **segment-level** (VAD-split) timing only — don't claim per-word timing there.
- **No speaker diarization** — don't promise "who said what".
- Long audio can take tens of seconds (model decrypt + inference). **Don't assume it hung** — be patient.
