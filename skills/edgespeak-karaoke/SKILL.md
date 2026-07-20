---
name: edgespeak-karaoke
description: Create word-highlighted karaoke ASS subtitles and optionally burn them into local video using one EdgeSpeak transcription request with inline word-level forced alignment. Use when the user asks for karaoke captions, per-word highlighting, an ASS file, subtitle style choices or previews, or a hard-subbed video without supplying a final reference transcript.
---

# EdgeSpeak Karaoke

Create karaoke subtitles from one EdgeSpeak transcription request. Use the bundled zero-dependency
Node.js scripts for deterministic ASS generation, real-frame style previews, and FFmpeg rendering.

## Let the user pick the look

Collect the source path, output location, and whether the user wants ASS, hard subtitles, or both.
Style is the one decision the user can see and disagree with, so treat it as theirs by default:

- **Explicit**: honor the named preset or overrides. Available presets are `classic`, `minimal`,
  `boxed`, and `high-contrast`.
- **Auto**: only when the user actually hands the decision over — "you pick", "whatever works",
  "just make it quick", "use the default". Choose from the table below and continue without blocking.
- **Preview then ask** — the default whenever the user stated no style preference. Render every
  preset on real source frames, show the PNGs with the runtime's image-viewing capability, and ask
  one compact question. A terminal can list paths and descriptions, but ANSI text is not a faithful
  visual preview.

Silence is not delegation. A user who never mentioned style has usually not seen the options rather
than decided to skip them. Asking costs one short exchange; guessing wrong costs a re-render of the
whole video, and with hard subtitles that is the expensive path.

**Never render previews without showing them.** `--preview-media` renders all four presets on every
run, so the moment that command completes the full comparison already exists on disk. Opening one
PNG, picking silently, and reporting only the winner hides a trade-off the user was entitled to see.

For auto mode — and to seed the recommendation offered alongside previews — inspect representative
source frames and use these defaults:

| Footage | Preset |
|---|---|
| General landscape or mixed content | `classic` |
| Clean, mostly dark background | `minimal` |
| Busy, bright, slides, or screen recording | `boxed` |
| Vertical/mobile or consistently difficult background | `high-contrast` |

When brightness swings across the source — dark scenes and bright scenes in the same video — no
single frame settles the choice. Render previews at two contrasting timestamps and compare both,
because a preset that wins on a bright frame can go invisible on a dark one.

Current-request instructions win. If present, also read optional preferences from
`.edgespeak-skills/edgespeak-karaoke/EXTEND.md`, then
`~/.edgespeak-skills/edgespeak-karaoke/EXTEND.md`; project preferences win over user preferences.
Useful preferences include preset, font, font size, ASS colors, margin, output format, and quality.

## Transcribe and align once

1. Confirm the source exists and inspect its duration, dimensions, and container with `ffprobe`.
2. Call `edgespeak_transcribe_file` once:

   ```json
   {
     "path": "/absolute/path/source-media",
     "timestamps": "word",
     "start_margin": 0,
     "end_margin": 0
   }
   ```

   Add `min_chars` / `max_chars` only when the user requests different caption lengths. Add `model`
   only when the user names one. If locality matters, inspect `edgespeak_list_models` and do not pick
   a remote model without consent.
3. Do **not** call `edgespeak_align` after a successful word-timestamp transcription. This request
   already runs EdgeSpeak's inline local forced-alignment path and returns `segments[].words[]`.
4. For a long MCP response, use `artifact_json_path`. For an inline response, save the `result`
   object as JSON. The converter accepts either direct transcript JSON or a wrapper with `result`.
5. Require non-empty word timing in every timed segment. Never invent word timing or silently fall
   back to segment timing.

Use `edgespeak_align` only when the user supplied an external final transcript or materially edited
the ASR text. Alignment must use the final word sequence; never keep stale timestamps after edits.

## Generate ASS and previews

Requires Node.js 18 or newer. Generate the selected preset:

```bash
node <skill-dir>/scripts/karaoke-ass.mjs /path/to/transcript.json \
  -o /output/source.karaoke.ass \
  --style classic \
  --title "Source title"
```

To present the choice, render every preset on one active cue from the actual source. This is the
default path, not a special case — and every PNG it produces is meant to be shown:

```bash
node <skill-dir>/scripts/karaoke-ass.mjs /path/to/transcript.json \
  -o /output/source.karaoke.ass \
  --style classic \
  --preview-media /path/to/source-video \
  --preview-dir /output/source.karaoke-previews
```

Use `--preview-at <seconds>` when another frame is more representative, and run it twice with
different timestamps when the source mixes bright and dark scenes. List presets with
`--list-styles`. Fine-tune with `--font`, `--font-size`, `--margin-v`, `--primary`, `--secondary`,
`--outline`, and `--back`; ASS colors use `&HAABBGGRR`. The script preserves EdgeSpeak segment
boundaries and only maps aligned durations/gaps to `\kf` / `\k` tags.

## Burn hard subtitles

When the source has video and the user wants hard subtitles:

```bash
node <skill-dir>/scripts/render-hardsub.mjs \
  /path/to/source-video \
  /output/source.karaoke.ass
```

The default `--format source` preserves the source **container** when practical:

- MP4/M4V/MOV -> same extension with H.264/AAC.
- MKV -> MKV with H.264 and copied audio.
- WebM -> WebM with VP9/Opus.
- TS/M2TS -> same extension with H.264/AAC.
- Unsupported/ambiguous source extensions -> MKV fallback, reported as `container_fallback: true`.

Hard subtitles always require video re-encoding; preserving the container does not mean copying the
source video codec. Use `--format mp4|mov|mkv|webm` or an explicit `-o` only when the user requests a
different delivery format. Use `--overwrite` only with authorization.

### Match the source bitrate

Re-encoding at a fixed quality ignores what the source shipped at, and the gap can be large: burning
CRF 21 into a lean 1.5 Mbps AV1 file yields a 4.2 Mbps H.264 copy — 2.8x the source bitrate, nearly
3x the file size, with no visible gain. The script therefore probes the source and derives an
`-maxrate` / `-bufsize` ceiling from its bitrate, scaled by how much less efficient the output codec
is (H.264 needs roughly 1.6x the bitrate of AV1 for comparable quality). Quality still comes from
CRF; the cap only stops it from overshooting the source.

This is automatic for x264 targets. VP9/WebM is left alone because the `.webm` profile pins
`-b:v 0` for constant-quality mode. The report includes `source_video_bitrate`, `video_bitrate`, and
the `bitrate_cap` decision — compare the first two when reporting the result.

Override only when the user asks for a specific bitrate or quality level:

- `--crf <n>` sets the quality target (lower is better, 21 default for H.264).
- `--maxrate <rate>` replaces the derived ceiling, e.g. `--maxrate 4M`.
- `--maxrate none` disables the cap entirely and restores plain CRF behavior.

Bitrate is also the lever for file size. When a user objects to output size, quote the source
bitrate alongside the output bitrate before proposing a change, and remember that flat illustrated
or screen-recorded footage compresses far harder than live action — subtitle text itself stays crisp
even at CRF 28, so it is never the constraint.

## CLI fallback

If MCP is unavailable but `edgespeak-cli` is installed, use the single-call equivalent:

```bash
edgespeak-cli transcribe /path/to/source-media -o /output/transcript.json \
  --start-margin 0 --end-margin 0
```

CLI transcript JSON already contains `segments[].words[]`. Do not run `edgespeak-cli align` on text
that the same transcribe command just produced.

## Validation and reporting

- Give MCP and FFmpeg realistic wall-clock budgets; do not interrupt healthy silent processing.
- Keep `start_margin=0` and `end_margin=0` so adjacent ASS events do not overlap.
- Preserve the original media, transcript artifact, and ASS unless replacement is explicit.
- Verify the hard-subbed output duration, stream count, output codec, and zero subtitle streams.
- Compare the output bitrate against the source before reporting; a multiple of the source bitrate
  means the encode overshot, not that the source was low quality.
- Extract an active-cue frame and visually verify that text is burned into pixels and readable.
- Report the ASS path, preview paths if any, video path, selected preset, container decision, codecs,
  duration, size, and validation result.

## Bundled scripts

- `scripts/karaoke-ass.mjs`: validate EdgeSpeak word timing, generate preset/custom ASS, and render
  real-frame PNG previews.
- `scripts/render-hardsub.mjs`: burn ASS with FFmpeg, preserve the source container where practical,
  and validate the result.
