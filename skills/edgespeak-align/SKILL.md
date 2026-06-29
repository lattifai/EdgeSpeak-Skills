---
name: edgespeak-align
description: Force-align audio/video against a known transcript on-device via EdgeSpeak to produce word-level timestamps (start, end, confidence) for karaoke captions, word-accurate SRT, dubbing, and clip extraction. Use when the user already has the transcript/script/lyrics and wants to know exactly when each word is spoken.
---

# EdgeSpeak Align

Force-align an audio/video file against a **reference transcript you already have**, producing **word-level timestamps** — when each word starts and ends. Runs **entirely on-device**; the audio never leaves the machine. Under the hood it calls `edgespeak-cli align`. When the EdgeSpeak desktop app is running, the CLI talks to its local gateway (OpenAI-compatible, `127.0.0.1:1117`) and reuses the warm model (proxy mode); when the app is not running, the CLI launches the bundled on-device engine itself (standalone mode). **Standalone is a normal mode, not an error.**

Alignment ≠ transcription. Transcription guesses the words; alignment is given the words and only finds the timing. If the user does **not** have the text yet, use `edgespeak-transcribe` instead.

## Inputs to confirm

- Media path to align.
- Reference transcript/script/lyrics text.
- Desired output: stdout text, `.txt`, `.json`, or `.srt`.
- Optional protected terms for brand names, jargon, names, or tokens that must stay verbatim.

## How to do it

1. Confirm two inputs: the **media file** and the **reference text** (a string, or a text file to read).
2. Check the runtime first:

   ```bash
   edgespeak-cli status
   ```

   - **Command not found** → the CLI isn't installed. Tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed).
   - **License not activated / locked** → first use needs a one-time activation: `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com).
   - **Gateway not running (standalone)** → this is fine; `align` is local-only and runs against the bundled on-device engine. When the app is running it reuses the warm gateway (proxy) instead.
3. Run `edgespeak-cli align`:

   ```bash
   edgespeak-cli align <audio-or-video-file> --text "<reference transcript>" [-o out.json] [--format txt|json|srt]
   ```

   - Read text from a file with a shell substitution: `--text "$(cat script.txt)"`.
   - Without `-o`: result prints to **stdout**.
   - `-o out.srt` / `out.json` / `out.txt`: the **extension decides the format**. Use `--format` only when the path's extension is ambiguous.
   - `json` gives the full `{ word, start, end, confidence }[]` (seconds); `srt` gives one cue per word; `txt` is human-readable.
   - `--protected-terms "<term>"` (repeatable) keeps brand names / jargon verbatim through normalization, so they don't get split or rewritten before matching.
   - `--license-key <KEY>` (alias `--key`) only to pass a license key explicitly for this run; normally activation already covers it.
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

- **Requires `edgespeak-cli`.** If the command isn't found, tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed). If it's found but errors, show the error — **do not fabricate timings under any circumstances**.
- **First use needs activation.** A fresh install must be activated once with `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com). Without it the on-device engine fails with `license_required`; that error and `status` carry a purchase link — surface it, don't work around it. To pass the key on a single run, use `--license-key <KEY>` (alias `--key`).
- **Local-only**: alignment uses the local EdgeSpeak alignment runtime; audio stays on device.
- **The text must roughly match the audio.** Alignment assumes the words are actually spoken; large mismatches (wrong language, missing/extra paragraphs) degrade timing. It is robust to minor disfluencies and punctuation, not to substituting a different transcript.
- **No speaker diarization** — alignment times the words; it does not say who spoke them.

### Long audio: chunk it, or it will eat your RAM

Alignment does **not** VAD-chunk the audio (transcription does; alignment does not). It builds one forced-alignment lattice over the **entire** waveform, and peak memory scales with **total duration × vocabulary**, with no upper bound. As a rule of thumb the on-device aligner consumes very roughly **5–6 GB of RAM per 15 minutes of audio** in a single call — an ~85-minute file can spike to **30+ GB** and thrash or get OOM-killed.

So for anything beyond a few minutes, **do not align the whole file in one shot.** Prefer pre-split media and matching reference-text slices from the user. If you have a reliable media tool and explicit chunk boundaries, align each segment against its corresponding text slice and add each chunk's offset back to the returned `start`/`end`. Short clips (seconds to a couple of minutes) are fine to align directly.

If you do not have reliable chunk boundaries or matching text slices, stop and ask for them instead of guessing offsets or slicing the transcript heuristically. If the user really wants one long file aligned end-to-end and won't chunk, warn them about the memory cost first rather than silently launching a 30 GB job.

### Timeouts and a busy gateway

A real alignment of more than a minute or two of audio can run **longer than a 2-minute command timeout**. Give the command a generous timeout or run it in the background — don't assume a slow run failed. The local gateway is **single-instance and serializes** requests: don't fire many `align`/`segment`/`transcribe` calls at it concurrently, and if a request is killed mid-flight the gateway can be briefly busy/unreachable afterward — re-check `edgespeak-cli status` and retry rather than fabricating timings.
