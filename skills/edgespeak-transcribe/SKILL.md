---
name: edgespeak-transcribe
description: Transcribe audio/video to text on-device via EdgeSpeak — subtitles, meeting notes, voice memos, searchable transcripts. Load when the user has an audio/video file to turn into text/SRT, or wants private (no-upload) transcription. 中文触发：把录音 / 视频 / 语音备忘转成文字、做字幕、整理会议纪要或可搜索文稿, 全程本地、零上传。
---

# EdgeSpeak Transcribe

Turn audio/video into a transcript, **entirely on-device — the audio never leaves the machine**. Under the hood it calls `edgespeak-cli`, which talks to the local EdgeSpeak gateway (OpenAI-compatible, `127.0.0.1:1117`).

## When to load (triggers)

- The user has an audio/video file and wants a transcript, subtitles, meeting notes, or searchable text.
- They mention transcription, captions/subtitles, meeting minutes, or "turn this recording into text".
- They care about privacy and don't want speech uploaded to the cloud.

## How to do it

1. Confirm the path to the file to transcribe.
2. Check the local gateway if needed:

   ```bash
   edgespeak-cli status
   ```

   Continue only when the active backend is local.
3. Run `edgespeak-cli`:

   ```bash
   edgespeak-cli transcribe <audio-or-video-file> [-o output-file] [--format txt|json|srt]
   ```

   - Without `-o`: the transcript prints to **stdout** (easy to read / post-process).
   - `-o out.srt` / `out.json` / `out.txt`: writes a file; **the extension decides the format**.
   - Use `--format txt|json|srt` when the output path does not end exactly in `.txt`, `.json`, or `.srt` (for example, some temporary filenames).
   - Use `--model <model-id>` only when the user explicitly asks for a specific local EdgeSpeak model.
4. With the transcript in hand, summarize / clean up / translate as the user needs.

## Word-level timing and sentences are built in (use `--format json` or `srt`)

You don't need to chain anything: **`transcribe` runs forced alignment + sentence splitting inline, per speech window, as part of the same pass.** For a supported language, asking for a structured format gives you per-sentence `segments[]` with **word-level timestamps** already attached — no separate `align`/`segment` calls, no re-loading the media:

```bash
edgespeak-cli transcribe <media> -o out.json   # segments[] each with words[] (start/end seconds)
edgespeak-cli transcribe <media> -o out.srt     # subtitle cues from the real per-window timing
```

So for karaoke captions, word-accurate SRT, clip extraction, or clean sentence lines, just transcribe to `json`/`srt`. Plain `txt`/stdout still gives the text only.

Tune the sentence shaping (all optional; sensible defaults):

- `--min-chars <N>` / `--max-chars <N>` — merge sentences shorter than `N` chars / split sentences longer than `N`.
- `--start-margin <SECS>` / `--end-margin <SECS>` — leading/trailing silence padding added to each sentence's start/end (useful so caption cues don't clip the first/last syllable).

When to still reach for the separate skills: use `edgespeak-align` only when you have an **external reference transcript** (not the one transcribe just produced) and need it timed; use `edgespeak-segment` only to split **plain text you already have** into sentences. For "transcribe this and give me word/sentence timing", a single `transcribe -o out.json` is the whole job.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`**, installed with EdgeSpeak (`curl -fsSL https://edgespeak.com/install.sh | sh`). If the command isn't found, or the local EdgeSpeak gateway doesn't respond, tell the user to install and open EdgeSpeak (edgespeak.com) — **do not fabricate a transcript**.
- **Local-only for file transcription**: `edgespeak-cli transcribe` refuses remote/cloud ASR backends even if the gateway lists them. If status shows a remote active backend, ask the user to switch EdgeSpeak to the local engine before transcribing.
- **Word-level timing depends on language**: for supported languages, `json`/`srt` carry real per-word timestamps (inline forced alignment). For unsupported languages you get **segment-level** (VAD-split) timing only — don't claim per-word timing there.
- **No speaker diarization** — don't promise "who said what".
- Long audio can take tens of seconds (model decrypt + inference). **Don't assume it hung** — be patient.
