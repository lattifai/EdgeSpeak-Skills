---
name: edgespeak-broadcast
description: Turn text into natural speech fully on-device via EdgeSpeak (Broadcast) — synthesize WAV audio with selectable voices, style instructions, speed and reproducible seeds, and manage a local voice library including cloning a voice from consented reference audio. Use when the user wants local private text-to-speech, an audio version of some text, or wants to list/add/delete EdgeSpeak voices.
---

# EdgeSpeak Broadcast

Turn text into speech, **entirely on-device — the text never leaves the machine**. Broadcast is EdgeSpeak's speech feature; under the hood this skill calls `edgespeak-cli speech` (alias: `synthesize`). When the EdgeSpeak desktop app is running, the CLI talks to its local gateway (OpenAI-compatible, `127.0.0.1:1117`) and reuses the warm model (proxy mode); when the app is not running, the CLI launches the bundled on-device engine itself (standalone mode). **Standalone is a normal mode, not an error.**

## Inputs to confirm

- The text to speak (or the file it comes from).
- Output WAV path.
- Any requested voice, style instructions, speed, language, or reproducibility (seed) preferences.

## How to do it

1. Check the runtime first:

   ```bash
   edgespeak-cli status
   ```

   - **Command not found** → the CLI isn't installed. Tell the user to install it: `curl -fsSL https://edgespeak.com/install.sh | sh` (self-contained, no desktop app needed).
   - **License not activated / locked** → run `edgespeak-cli trial` to sign in via the browser (new accounts start a free 7-day trial; purchased accounts activate directly), or `edgespeak-cli activate <KEY>` if you already have a key.
   - **Gateway not running (standalone)** → this is fine; `speech` will launch the bundled on-device engine itself.
2. Optionally pick a voice. List the local voice library (JSON to stdout):

   ```bash
   edgespeak-cli voices list
   ```

   Each entry has an `id` (`builtin:<slug>` for presets, `user:<uuid>` for user-created voices), localized `names` / `descriptions` (`en-US`, `zh-CN`), `supported_languages`, and a `compatibility` array telling which local models can use it. Pick an id whose compatibility for the chosen model is `"ready"`.
3. Synthesize:

   ```bash
   edgespeak-cli speech "<text>" -o out.wav [options]
   ```

   The WAV is written to `-o` and a JSON result is printed to **stdout**. Engine logs go to **stderr** — when scripting, parse stdout only.

## Option map

| User asks for | Use with `speech` | Notes |
| --- | --- | --- |
| A specific voice | `--voice builtin:<id>` or `--voice user:<uuid>` | Default `builtin:auto` lets the engine pick. OpenAI voice aliases (e.g. `alloy`) are also accepted. |
| Speaking style ("cheerful", "slow news anchor tone", …) | `--instructions "<style>"` | Free-form style text. Conflicts with `--disable-style`. |
| Ignore the style saved with the voice | `--disable-style` | Explicitly disables the voice's default style. |
| Faster / slower speech | `--speed <N>` | Default 1.0. The local model may support a narrower range than OpenAI's 0.25–4.0. |
| Language hint | `--language zh-CN` or `--language en-US` | Selects the internal reference for the voice. |
| Reproducible output | `--seed <N>` | Non-negative. Same seed + same inputs → same audio. The seed actually used is reported in the result JSON (`seed_used`). |
| A different local model | `-m omnivoice` or `-m voxcpm2` | These are the only two model ids the `speech` command accepts (default `omnivoice`, same as the app). |
| Generation quality knobs | `--guidance-scale <0–5>` (default 2), `--inference-steps <1–64>` | Omit `--inference-steps` for the model default. |
| VoxCPM2 bad-case retry | `--retry-badcase [true\|false]` | VoxCPM2 only. |

Input is limited to **4096 characters** per call (OpenAI `input` limit). For longer text, split it into ≤4096-character parts at natural boundaries (paragraphs/sentences), synthesize each part, and concatenate the WAVs afterwards (`ffmpeg -f concat`). Keep the same `--voice` and `--seed` across parts for a consistent result.

## Result JSON (stdout)

Real output shape — long input is synthesized in chunks automatically and reported per chunk:

```json
{
  "output_path": "/abs/path/out.wav",
  "format": "wav",
  "size_bytes": 215084,
  "sample_rate": 48000,
  "duration_seconds": 2.24,
  "seed_used": 2711317933,
  "infer_seconds": 12.55,
  "warnings": [],
  "chunks": [
    { "index": 0, "character_count": 21, "duration_seconds": 2.24,
      "seed_used": 2711317933, "infer_seconds": 12.55, "warnings": [] }
  ]
}
```

`sample_rate` comes from the model (do not assume a fixed rate). Surface non-empty `warnings` to the user.

## Voice management

```bash
# List all voices (JSON)
edgespeak-cli voices list

# Clone a voice from reference audio + its exact transcript
edgespeak-cli voices add ref.wav --ref-text "<exact words spoken in ref.wav>" \
  --name "My voice" [--language zh-CN] [--speaker-description "<optional description>"] --consent

# Delete a user-created voice (by id or exact name); built-in voices cannot be deleted
edgespeak-cli voices delete user:<uuid>
edgespeak-cli voices delete "My voice"
```

- `--consent` is **required** for `voices add`: it asserts the user has permission to use the reference recording. Never add a voice without the user explicitly confirming they have the right to use that recording; refuse to clone third-party voices without consent.
- `--ref-text` must be the exact transcript of the reference audio — a mismatch degrades cloning quality.
- `voices delete` with a name requires an exact, unique match; ambiguous or unknown names fail with a clear error.
- After adding, use the returned/listed `user:<uuid>` id with `speech --voice`.

## MCP and API equivalents

- Through the EdgeSpeak MCP server (`edgespeak-cli mcp` or the app's MCP endpoint), the same capabilities are exposed as tools: `edgespeak_generate_speech`, `edgespeak_list_voices`, `edgespeak_add_voice`, `edgespeak_delete_voice`. Prefer MCP tools when an EdgeSpeak MCP server is already configured.
- With the app running, the local gateway also serves OpenAI-compatible `POST /v1/audio/speech`. Stay with the CLI unless the user specifically needs raw API access.

## Boundaries / gotchas (read this)

- **Requires `edgespeak-cli` 0.3.0+.** Older CLI versions have no `speech` / `voices` commands — if they are missing from `edgespeak-cli --help`, tell the user to update (`edgespeak-cli update`, or reinstall via `curl -fsSL https://edgespeak.com/install.sh | sh`).
- **First use needs activation** (`edgespeak-cli trial` or `activate <KEY>`), same as the other EdgeSpeak skills. Surface license errors; don't work around them.
- **Only `omnivoice` and `voxcpm2` work here.** The EdgeSpeak app's Broadcast workspace has additional model-specific features (voice design, and app-managed models such as Qwen3-TTS) that are **not** available through `speech` — passing other model ids fails with `model not found`. If the user wants voice design, point them to the app's Broadcast workspace.
- **Synthesis is slower than real time on most machines** (a short sentence can take ~10–20 s in standalone mode; the first run may also decrypt/load or download the model). **Don't assume it hung.**
- **Output is WAV only.** If the user wants MP3/M4A/OGG, synthesize WAV first and convert with `ffmpeg` afterwards.
- **stdout vs stderr**: the result JSON is on stdout; engine progress/logs are on stderr. Never parse stderr.
- If `speech` errors, show the error — **do not fabricate audio or claim success without the output file existing.**
