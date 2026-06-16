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
2. Run `edgespeak-cli`:

   ```bash
   edgespeak-cli transcribe <audio-or-video-file> [-o output-file]
   ```

   - Without `-o`: the transcript prints to **stdout** (easy to read / post-process).
   - `-o out.srt` / `out.json` / `out.txt`: writes a file; **the extension decides the format**.
3. With the transcript in hand, summarize / clean up / translate as the user needs.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`**, installed with EdgeSpeak (`curl -fsSL https://edgespeak.com/install.sh | sh`). If the command isn't found, or the local EdgeSpeak gateway doesn't respond, tell the user to install and open EdgeSpeak (edgespeak.com) — **do not fabricate a transcript**.
- **Local-only**: traffic stays on the loopback interface; audio is **never sent to a cloud provider**. This is EdgeSpeak's core promise.
- **Timestamps are segment-level** (VAD-split), not word-level — fine for SRT, but **don't claim per-word alignment**.
- **No speaker diarization** — don't promise "who said what".
- Long audio can take tens of seconds (model decrypt + inference). **Don't assume it hung** — be patient.
