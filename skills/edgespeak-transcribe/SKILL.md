---
name: edgespeak-transcribe
description: Transcribe audio/video on-device via EdgeSpeak into text, JSON, or SRT, with optional word-level timing and sentence-shaping parameters for subtitles, meeting notes, voice memos, and searchable transcripts. Use when the user has a local media file to turn into private no-upload transcription or wants transcribe output tuned with timing or segment options.
---

# EdgeSpeak Transcribe

Turn audio/video into a transcript, **entirely on-device — the audio never leaves the machine**. Under the hood it calls `edgespeak-cli`, which talks to the local EdgeSpeak gateway (OpenAI-compatible, `127.0.0.1:1117`).

## Inputs to confirm

- Media path to transcribe.
- Desired output: stdout text, `.txt`, `.json`, or `.srt`.
- Any requested model, word timing, sentence length, or subtitle padding options.

## How to do it

1. Confirm the path to the file to transcribe.
2. Check the local gateway if needed:

   ```bash
   edgespeak-cli status
   ```

   If it reports a remote active ASR backend, ask the user to switch EdgeSpeak to the local engine before file transcription. If the gateway is unreachable, `transcribe` may still launch the bundled local engine; continue only when the user did not request gateway-only sentence-shaping options.
3. Run `edgespeak-cli` and pass requested tuning options explicitly:

   ```bash
   edgespeak-cli transcribe <audio-or-video-file> [-o output-file] [--format txt|json|srt] [options]
   ```

   - Without `-o`: the transcript prints to **stdout** (easy to read / post-process).
   - `-o out.srt` / `out.json` / `out.txt`: writes a file; **the extension decides the format**.
   - Use `--format txt|json|srt` when the output path does not end exactly in `.txt`, `.json`, or `.srt` (for example, some temporary filenames).
   - Use `--model <model-id>` only when the user explicitly asks for a specific local EdgeSpeak model.
4. With the transcript in hand, summarize / clean up / translate as the user needs.

## Timing and segment parameter map

Pass through user-requested timing and sentence-shaping knobs instead of silently dropping them:

| User asks for | Use with `transcribe` | Notes |
| --- | --- | --- |
| Word-level timing, karaoke timing, word-accurate structured output | `-o out.json` or `--format json` | CLI JSON uses the EdgeSpeak caption JSON shape; when word timing is available, words are stored under each supervision's `alignment.word` array. Do not assume OpenAI `verbose_json` `words[]` fields from the CLI renderer. |
| Subtitle cues from real speech-window timing | `-o out.srt` or `--format srt` | SRT uses the sentence/caption segments produced by the local file flow. |
| Minimum / maximum sentence length | `--min-chars <N>` / `--max-chars <N>` | These tune semantic sentence shaping. Supplying either length option enables length-based shaping in the local gateway file flow. |
| Leading / trailing caption padding | `--start-margin <SECS>` / `--end-margin <SECS>` | Seconds, clamped by the gateway to the supported range (currently 0.0-5.0). |
| Specific local transcription model | `--model <model-id>` | Use only when the user names a model or asks to override the configured local model. |

For supported languages, the local gateway file flow runs per-window forced alignment and semantic sentence splitting by default. Plain `txt`/stdout gives text only; use `json` or `srt` when the user needs timing.

Do not invent unsupported `transcribe` flags:

- `transcribe` does **not** expose `--protected-terms`. If the user has a reference transcript and needs brand/jargon protection during alignment, use `edgespeak-align` with `--protected-terms`.
- `transcribe` does **not** expose the standalone segmenter's `--threshold`. If the user already has text and asks for a threshold, use `edgespeak-segment --threshold`.
- If the EdgeSpeak app gateway is not reachable, the bundled standalone engine can run `transcribe`, but it does not support `--min-chars`, `--max-chars`, `--start-margin`, or `--end-margin` yet. Do not run a command with those flags while the gateway is unreachable; ask the user to open EdgeSpeak or omit the sentence-shaping options.

## API-only timing controls

Prefer `edgespeak-cli transcribe`. If the user explicitly asks to pass lower-level alignment or segment toggles that the CLI does not expose, call the local OpenAI-compatible gateway directly instead of inventing CLI flags.

Use `POST /v1/audio/transcriptions` with multipart fields:

- `path=/absolute/media/path` or `file=@media.wav`
- `response_format=verbose_json`
- `timestamp_granularities[]=word` to request word-level output
- `word_timestamp_enabled=true|false` to enable/skip forced-alignment word timestamps
- `semantic_sentence_enabled=true|false` to enable/skip semantic sentence splitting
- `length_enabled=true|false`, `min_chars=<N>`, `max_chars=<N>` for sentence length shaping
- `start_margin_ms=<MS>`, `end_margin_ms=<MS>` for sentence/caption padding

API margin fields are milliseconds. Convert from CLI-style seconds explicitly: `--start-margin 0.2` corresponds to `start_margin_ms=200`.

Only use this API path when the user needs those specific controls and you have the local gateway URL/key context. Otherwise stay with the CLI.

When to still reach for the separate skills: use `edgespeak-align` only when you have an **external reference transcript** (not the one transcribe just produced) and need it timed; use `edgespeak-segment` only to split **plain text you already have** into sentences. For "transcribe this and give me word/sentence timing", a single `transcribe -o out.json` is the whole job.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`**, installed with EdgeSpeak (`curl -fsSL https://edgespeak.com/install.sh | sh`). If the command isn't found or fails with a runtime error, tell the user to install/open EdgeSpeak or show the error — **do not fabricate a transcript under any circumstances**.
- **Local-only for file transcription**: `edgespeak-cli transcribe` refuses remote/cloud ASR backends even if the gateway lists them. If status shows a remote active backend, ask the user to switch EdgeSpeak to the local engine before transcribing.
- **Word-level timing depends on language**: for supported languages, `json` can carry real per-word timestamps (inline forced alignment). For unsupported languages you get **segment-level** (VAD-split) timing only — don't claim per-word timing there.
- **No speaker diarization** — don't promise "who said what".
- Long audio can take tens of seconds (model decrypt + inference). **Don't assume it hung** — be patient.
