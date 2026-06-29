---
name: edgespeak-segment
description: Split a long run of text into natural sentences on-device via EdgeSpeak using a semantic sentence splitter that works on unpunctuated ASR output. Use when the user has raw transcript text, captions, or dictation and wants clean sentence boundaries for subtitles, reading, translation chunks, or further processing.
---

# EdgeSpeak Segment

Turn an undifferentiated block of text into **natural sentences**, on-device. This is a **semantic** sentence splitter (a small local model), so it works on **ASR output that has no punctuation or broken punctuation** — where naïve "split on period" fails completely. Under the hood it calls `edgespeak-cli segment`. When the EdgeSpeak desktop app is running, the CLI talks to its local gateway (OpenAI-compatible, `127.0.0.1:1117`) and reuses the warm model (proxy mode); when the app is not running, the CLI launches the bundled on-device engine itself (standalone mode). **Standalone is a normal mode, not an error.**

## Inputs to confirm

- Text to segment, preferably as a file path for large input.
- Desired output: stdout text, `.txt`, `.json`, or `.srt`.
- Optional sentence-boundary sensitivity threshold.

## How to do it

1. Get the text — inline, or (better for long text) a file path.
2. Check the runtime first:

   ```bash
   edgespeak-cli status
   ```

   - **Command not found** → the CLI isn't installed. Tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed).
   - **License not activated / locked** → first use needs a one-time activation: `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com).
   - **Gateway not running (standalone)** → this is fine; `segment` runs against the bundled on-device engine. When the app is running it reuses the warm gateway (proxy) instead.
3. Run `edgespeak-cli segment`:

   ```bash
   # from a file
   edgespeak-cli segment --file transcript.txt [-o out.txt] [--format txt|json|srt]

   # or inline
   edgespeak-cli segment --text "<text to split>"
   ```

   - `--file` and `--text` are mutually exclusive.
   - Default output (`txt` / stdout): one sentence per line.
   - `--format json`: `[{ text, start, end }, ...]`.
   - `--threshold <0..1>` tunes boundary sensitivity (default `0.35`). **Lower → more, shorter sentences; higher → fewer, longer sentences.** Adjust only if the default over/under-splits.
   - `--license-key <KEY>` (alias `--key`) only to pass a license key explicitly for this run; normally activation already covers it.

## Timestamps: read this

When the input is **plain text**, the `start` / `end` fields in JSON output are **placeholders** (e.g. `0.0` / `0.001`) — plain text carries no timing, so the splitter cannot invent it. **Do not present these as real timestamps.**

To get **real per-sentence timing**, pair segmentation with alignment:

1. `edgespeak-cli align <media> --text <same text>` → word-level timestamps (see `edgespeak-align`).
2. Segment the text into sentences here.
3. Map each sentence onto the aligned words in order: sentence `start` = its first word's `start`, `end` = its last word's `end`.

Use `segment` alone when you only need **clean sentence text**; add `align` when you also need **timing**.

## Output shape (json)

```json
[ { "text": "As you can see it's easy it's simple.", "start": 0.0, "end": 0.001 }, ... ]
```

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`.** If the command isn't found, tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed). If it's found but errors, show the error — **do not hand-split the text yourself and pass it off as the model's output**.
- **First use needs activation.** A fresh install must be activated once with `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com). Without it the on-device engine fails with `license_required`; that error and `status` carry a purchase link — surface it, don't work around it. To pass the key on a single run, use `--license-key <KEY>` (alias `--key`).
- **It does not add punctuation or capitalization** — it finds boundaries. Output sentences carry the input's casing/spelling (ASR typos stay).
- **Long text is slow**: it's a real model pass. ~96K characters takes around 3 minutes. It is not hung — be patient.
- For very large inputs prefer `--file` over a huge inline `--text` to avoid shell-length limits.
