---
name: edgespeak-align
description: Force-align audio/video against a known transcript on-device via EdgeSpeak → word-level timestamps (start/end/confidence) for karaoke captions, word-accurate SRT, dubbing, and clip extraction. Load when the user already HAS the text and wants to know exactly WHEN each word is spoken. 中文触发：已有文稿/字幕，要把每个词对齐到音频时间轴、做逐词高亮字幕/卡拉OK字幕、按句剪辑、配音对齐，全程本地、零上传。
---

# EdgeSpeak Align

Force-align an audio/video file against a **reference transcript you already have**, producing **word-level timestamps** — when each word starts and ends. Runs **entirely on-device**; the audio never leaves the machine. Under the hood it calls `edgespeak-cli align`, which talks to the local EdgeSpeak gateway (OpenAI-compatible, `127.0.0.1:1117`).

Alignment ≠ transcription. Transcription guesses the words; alignment is given the words and only finds the timing. If the user does **not** have the text yet, use `edgespeak-transcribe` instead.

## When to load (triggers)

- The user has **both** an audio/video file **and** its transcript/script/lyrics, and wants word-level timing.
- They want karaoke / word-by-word highlighted captions, word-accurate SRT, or to extract a clip "from where they say X to where they say Y".
- Dubbing / re-voicing where each word must line up with the original.
- They have machine captions with sloppy timing and want them re-timed against clean text.

## How to do it

1. Confirm two inputs: the **media file** and the **reference text** (a string, or a text file to read).
2. Check the local gateway if needed:

   ```bash
   edgespeak-cli status
   ```

   Continue only when the active backend is **local** (audio stays on device).
3. Run `edgespeak-cli align`:

   ```bash
   edgespeak-cli align <audio-or-video-file> --text "<reference transcript>" [-o out.json] [--format txt|json|srt]
   ```

   - Read text from a file with a shell substitution: `--text "$(cat script.txt)"`.
   - Without `-o`: result prints to **stdout**.
   - `-o out.srt` / `out.json` / `out.txt`: the **extension decides the format**. Use `--format` only when the path's extension is ambiguous.
   - `json` gives the full `{ word, start, end, confidence }[]` (seconds); `srt` gives one cue per word; `txt` is human-readable.
   - `--protected-terms "<term>"` (repeatable) keeps brand names / jargon verbatim through normalization, so they don't get split or rewritten before matching.
4. Use the word timings to build captions, cut clips, or sync dubbing.

## Output shape (json)

```json
{ "words": [ { "word": "as", "start": 0.02, "end": 0.18, "confidence": -2.61 }, ... ] }
```

`confidence` is a log-probability (higher = more confident; it is **not** a 0–1 score). Use it only to flag low-confidence words, not as a percentage.

## Sentence-level timing (combine with segment)

`align` returns **words**, not sentences. To get sentence/caption-level timing:

1. `edgespeak-cli segment` the reference text into sentences (see `edgespeak-segment`).
2. Map each sentence onto the aligned words in order — the sentence's `start` = first word's `start`, `end` = last word's `end`.

This pairing is the reliable way to get sentence timestamps; `segment` alone on plain text does **not** produce real timings.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`**, installed with EdgeSpeak (`curl -fsSL https://edgespeak.com/install.sh | sh`). If the command isn't found or the gateway doesn't respond, tell the user to install and open EdgeSpeak (edgespeak.com) — **do not fabricate timings**.
- **Local-only**: alignment refuses remote/cloud backends. If `status` shows a remote active backend, ask the user to switch EdgeSpeak to the local engine first.
- **The text must roughly match the audio.** Alignment assumes the words are actually spoken; large mismatches (wrong language, missing/extra paragraphs) degrade timing. It is robust to minor disfluencies and punctuation, not to substituting a different transcript.
- **No speaker diarization** — alignment times the words; it does not say who spoke them.

### ⚠️ Long audio: chunk it, or it will eat your RAM

Alignment does **not** VAD-chunk the audio (transcription does; alignment does not). It builds one forced-alignment lattice over the **entire** waveform, and peak memory scales with **total duration × vocabulary**, with no upper bound. As a rule of thumb the on-device aligner consumes very roughly **5–6 GB of RAM per 15 minutes of audio** in a single call — an ~85-minute file can spike to **30+ GB** and thrash or get OOM-killed.

So for anything beyond a few minutes, **do not align the whole file in one shot.** Split the audio into segments (e.g. ≤ 5 minutes each, ideally on a silence so you don't cut a word), align each segment against its corresponding slice of the reference text, and add each chunk's offset back to the returned `start`/`end`. Short clips (seconds to a couple of minutes) are fine to align directly.

If the user really wants one long file aligned end-to-end and won't chunk, warn them about the memory cost first rather than silently launching a 30 GB job.

### Timeouts and a busy gateway

A real alignment of more than a minute or two of audio can run **longer than a 2-minute command timeout**. Give the command a generous timeout or run it in the background — don't assume a slow run failed. The local gateway is **single-instance and serializes** requests: don't fire many `align`/`segment`/`transcribe` calls at it concurrently, and if a request is killed mid-flight the gateway can be briefly busy/unreachable afterward — re-check `edgespeak-cli status` and retry rather than fabricating timings.
