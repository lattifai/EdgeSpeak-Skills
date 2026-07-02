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
- Optional sentence length constraints.

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

   # length-constrained split
   edgespeak-cli segment --file transcript.txt --min-chars 40 --max-chars 120
   ```

   - `--file` and `--text` are mutually exclusive.
   - Default output (`txt` / stdout): one sentence per line.
   - `--format json`: an envelope object `{ "text": "<all sentences joined>", "segments": [{ "text": ..., "start"?: ..., "end"?: ... }] }` — the sentence array lives under the top-level `segments` key, it is **not** a bare array.
   - `--threshold <0..1>` tunes boundary sensitivity (default `0.35`). **Lower → more, shorter sentences; higher → fewer, longer sentences.** Adjust only if the default over/under-splits.
   - `--min-chars <N>` / `--max-chars <N>` tune length-constrained splitting.
   - `--license-key <KEY>` (alias `--key`) only to pass a license key explicitly for this run; normally activation already covers it.

## Timestamps: read this

When the input is **plain text**, there is no timing to report: the JSON segments carry **no** `start` / `end` fields — do not assume the keys exist, and never fabricate times. The same applies to `--format srt` on plain text: the cues carry no real timing, so the SRT is not usable as a subtitle file.

To get **real per-sentence timing**, pair segmentation with alignment:

1. `edgespeak-cli align <media> --text <same text>` → word-level timestamps (see `edgespeak-align`).
2. Segment the text into sentences here.
3. Map each sentence onto the aligned words in order: sentence `start` = its first word's `start`, `end` = its last word's `end`.

Use `segment` alone when you only need **clean sentence text**; add `align` when you also need **timing**.

## Output shape (json)

```json
{
  "text": "As you can see it's easy it's simple. And it works.",
  "segments": [
    { "text": "As you can see it's easy it's simple." },
    { "text": "And it works." }
  ]
}
```

`text` is all sentences joined; `segments[]` holds one entry per sentence. With plain-text input the entries carry only `text` (no `start`/`end`); a `speaker` field appears only when the input provided one.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli`.** If the command isn't found, tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed). If it's found but errors, show the error — **do not hand-split the text yourself and pass it off as the model's output**.
- **First use needs activation.** A fresh install must be activated once with `edgespeak-cli activate <KEY>` (buyout key or trial code from https://edgespeak.com). Without it the on-device engine fails with `license_required`; that error and `status` carry a purchase link — surface it, don't work around it. To pass the key on a single run, use `--license-key <KEY>` (alias `--key`).
- **It does not add punctuation or capitalization** — it finds boundaries. Output sentences carry the input's casing/spelling (ASR typos stay).
- **If length constraints don't take effect**, or a run fails while parsing the result, open the EdgeSpeak app and rerun (proxy mode), and capture the command, mode, and CLI version as a bug report — don't hand-split to fake the constraint.
- **First standalone segment after a model-key rename can need a credential refresh.** If a fresh standalone run fails with `model_key_unavailable` / `device-bound-model-key` / `model_not_found (HTTP 404)`, tell the user to open EdgeSpeak once or refresh their license credentials, then retry. Do not treat it as permanent segmentation failure.
- **Long text is slow**: it's a real model pass. ~96K characters takes around 3 minutes. It is not hung — be patient.
- For very large inputs prefer `--file` over a huge inline `--text` to avoid shell-length limits.
