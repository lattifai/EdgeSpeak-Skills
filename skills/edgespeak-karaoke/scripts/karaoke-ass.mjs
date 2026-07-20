#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STYLES = Object.freeze({
  classic: {
    description: "Balanced white text with a warm gold sweep; safe for most landscape videos.",
    font: "Arial",
    fontSize: 54,
    primary: "&H0000D7FF",
    secondary: "&H00FFFFFF",
    outline: "&H00101010",
    back: "&H80000000",
    borderStyle: 1,
    outlineWidth: 3,
    shadow: 0,
    marginV: 76,
  },
  minimal: {
    description: "Quieter typography with a cyan sweep for clean or dark footage.",
    font: "Arial",
    fontSize: 50,
    primary: "&H00FFD66E",
    secondary: "&H00FFFFFF",
    outline: "&H00181818",
    back: "&H50000000",
    borderStyle: 1,
    outlineWidth: 2,
    shadow: 0,
    marginV: 70,
  },
  boxed: {
    description: "Translucent dark box for busy, bright, or presentation footage.",
    font: "Arial",
    fontSize: 50,
    primary: "&H0000D7FF",
    secondary: "&H00FFFFFF",
    outline: "&H00101010",
    back: "&H78000000",
    borderStyle: 3,
    outlineWidth: 8,
    shadow: 0,
    marginV: 72,
  },
  "high-contrast": {
    description: "Large yellow sweep and heavy outline for vertical, mobile, or difficult footage.",
    font: "Arial",
    fontSize: 60,
    primary: "&H0000FFFF",
    secondary: "&H00FFFFFF",
    outline: "&H00000000",
    back: "&H90000000",
    borderStyle: 1,
    outlineWidth: 4,
    shadow: 0,
    marginV: 86,
  },
});

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = { style: "classic", title: "EdgeSpeak Karaoke" };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("-")) {
      positional.push(token);
      continue;
    }
    if (token === "--list-styles" || token === "--overwrite") {
      options[token.slice(2).replaceAll("-", "_")] = true;
      continue;
    }
    const key = token === "-o" ? "output" : token.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    options[key] = value;
    index += 1;
  }
  options.input = positional[0];
  return options;
}

function number(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${field} must be finite and non-negative`);
  return result;
}

export function loadTranscript(path) {
  let payload = JSON.parse(readFileSync(path, "utf8"));
  if (payload && typeof payload.result === "object") payload = payload.result;
  if (!payload || !Array.isArray(payload.segments) || payload.segments.length === 0) {
    throw new Error("input JSON does not contain non-empty segments[]");
  }
  let previousEnd = 0;
  let wordCount = 0;
  payload.segments.forEach((segment, segmentIndex) => {
    const start = number(segment.start, `segments[${segmentIndex}].start`);
    const end = number(segment.end, `segments[${segmentIndex}].end`);
    if (end <= start) throw new Error(`segments[${segmentIndex}] must have end > start`);
    if (segmentIndex > 0 && start < previousEnd - 0.01) {
      throw new Error("segments overlap; request start_margin=0 and end_margin=0 for karaoke");
    }
    previousEnd = end;
    if (!Array.isArray(segment.words) || segment.words.length === 0) {
      throw new Error(`segments[${segmentIndex}].words[] is missing; request timestamps=\"word\" instead of aligning the ASR text afterward`);
    }
    let previousWordEnd = start;
    segment.words.forEach((word, wordIndex) => {
      if (!word || !String(word.word ?? "").trim()) {
        throw new Error(`segments[${segmentIndex}].words[${wordIndex}] has no word`);
      }
      const wordStart = number(word.start, `segments[${segmentIndex}].words[${wordIndex}].start`);
      const wordEnd = number(word.end, `segments[${segmentIndex}].words[${wordIndex}].end`);
      if (wordEnd <= wordStart) throw new Error(`segments[${segmentIndex}].words[${wordIndex}] must have end > start`);
      if (wordStart < previousWordEnd - 0.01) throw new Error(`segments[${segmentIndex}].words[] is not monotonic`);
      previousWordEnd = wordEnd;
      wordCount += 1;
    });
  });
  return { segments: payload.segments, wordCount };
}

function assTime(seconds) {
  let cs = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(cs / 360000);
  cs %= 360000;
  const minutes = Math.floor(cs / 6000);
  cs %= 6000;
  const wholeSeconds = Math.floor(cs / 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function escapeAss(text) {
  return text.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}");
}

function karaokeText(segment) {
  const eventStart = Math.round(Number(segment.start) * 100) / 100;
  let cursor = 0;
  const pieces = [];
  segment.words.forEach((word, index) => {
    const wordStart = Math.max(cursor, Math.round((Number(word.start) - eventStart) * 100));
    const gap = wordStart - cursor;
    if (index === 0 && gap > 0) pieces.push(`{\\k${gap}}`);
    if (index > 0) pieces.push(gap > 0 ? `{\\k${gap}} ` : " ");
    const wordEnd = Math.round((Number(word.end) - eventStart) * 100);
    const duration = Math.max(1, wordEnd - wordStart);
    pieces.push(`{\\kf${duration}}${escapeAss(String(word.word).trim())}`);
    cursor = wordStart + duration;
  });
  return pieces.join("");
}

function checkedColor(value, field) {
  if (!/^&H[0-9A-Fa-f]{8}$/.test(value)) throw new Error(`${field} must use ASS &HAABBGGRR format`);
  return value.toUpperCase();
}

export function resolveStyle(name, overrides = {}) {
  const preset = STYLES[name];
  if (!preset) throw new Error(`unknown style: ${name}; use one of ${Object.keys(STYLES).join(", ")}`);
  const result = { ...preset };
  if (overrides.font) result.font = overrides.font;
  if (overrides.font_size !== undefined) result.fontSize = number(overrides.font_size, "--font-size");
  if (overrides.margin_v !== undefined) result.marginV = number(overrides.margin_v, "--margin-v");
  for (const field of ["primary", "secondary", "outline", "back"]) {
    if (overrides[field]) result[field] = checkedColor(overrides[field], `--${field}`);
  }
  if (!result.fontSize || /[,\r\n]/.test(result.font)) throw new Error("font and font size are invalid for ASS");
  return result;
}

export function buildAss(segments, { title, style }) {
  if (/[\r\n]/.test(title)) throw new Error("title must not contain line breaks");
  const header = `[Script Info]\n; Generated directly from EdgeSpeak word timestamps.\nTitle: ${title}\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.709\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Karaoke,${style.font},${style.fontSize},${style.primary},${style.secondary},${style.outline},${style.back},-1,0,0,0,100,100,0,0,${style.borderStyle},${style.outlineWidth},${style.shadow},2,120,120,${style.marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const events = segments.map((segment) => `Dialogue: 0,${assTime(Number(segment.start))},${assTime(Number(segment.end))},Karaoke,,0,0,0,karaoke,${karaokeText(segment)}`);
  return `${header}${events.join("\n")}\n`;
}

function filterPath(path) {
  return `ass=filename='${path.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'")}'`;
}

function renderPreviews({ segments, transcriptPath, media, previewDir, at, title, overwrite }) {
  if (!existsSync(media)) throw new Error(`preview media not found: ${media}`);
  mkdirSync(previewDir, { recursive: true });
  const cue = segments.find((segment) => at === undefined || (at >= Number(segment.start) && at <= Number(segment.end))) ?? segments[0];
  const timestamp = at === undefined ? (Number(cue.start) + Number(cue.end)) / 2 : number(at, "--preview-at");
  const previews = [];
  for (const name of Object.keys(STYLES)) {
    const assPath = resolve(previewDir, `${name}.ass`);
    const imagePath = resolve(previewDir, `${name}.png`);
    if (!overwrite && (existsSync(assPath) || existsSync(imagePath))) throw new Error(`preview exists; pass --overwrite: ${imagePath}`);
    writeFileSync(assPath, buildAss(segments, { title, style: resolveStyle(name) }), "utf8");
    // Keep original presentation timestamps for both the subtitle renderer and frame selector.
    // Seeking around an inter-frame codec can otherwise corrupt the first decoded preview frame.
    const previewFilter = `${filterPath(assPath)},select='gte(t,${timestamp})'`;
    execFileSync("ffmpeg", [overwrite ? "-y" : "-n", "-hide_banner", "-loglevel", "error", "-i", media, "-vf", previewFilter, "-frames:v", "1", "-update", "1", imagePath], { stdio: "inherit" });
    previews.push({ style: name, description: STYLES[name].description, image: imagePath });
  }
  return { transcript: transcriptPath, timestamp, previews };
}

function usage() {
  return `Usage:\n  node karaoke-ass.mjs <transcript.json> [-o output.ass] [--style classic]\n  node karaoke-ass.mjs --list-styles\n\nOptions:\n  --preview-media <video>   Render every preset on a real source frame\n  --preview-dir <dir>       Preview destination (default: <output>.previews)\n  --preview-at <seconds>    Frame time; defaults to the midpoint of the first cue\n  --font/--font-size/--margin-v and --primary/--secondary/--outline/--back override a preset\n  --overwrite               Replace existing output and preview files`;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.list_styles) {
      console.log(JSON.stringify(STYLES, null, 2));
      return;
    }
    if (!args.input) throw new Error(usage());
    const input = resolve(args.input);
    const inputExtension = extname(input);
    const inputStem = inputExtension ? input.slice(0, -inputExtension.length) : input;
    const output = resolve(args.output ?? `${inputStem}.karaoke.ass`);
    if (!existsSync(input)) throw new Error(`input not found: ${input}`);
    if (existsSync(output) && !args.overwrite) throw new Error(`output exists; pass --overwrite: ${output}`);
    const { segments, wordCount } = loadTranscript(input);
    const style = resolveStyle(args.style, args);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, buildAss(segments, { title: args.title, style }), "utf8");
    const summary = { output, style: args.style, segments: segments.length, words: wordCount };
    if (args.preview_media) {
      summary.preview = renderPreviews({
        segments,
        transcriptPath: input,
        media: resolve(args.preview_media),
        previewDir: resolve(args.preview_dir ?? `${output.slice(0, -4)}.previews`),
        at: args.preview_at === undefined ? undefined : Number(args.preview_at),
        title: args.title,
        overwrite: Boolean(args.overwrite),
      });
    }
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

// Compare real paths on both sides: Node resolves import.meta.url through symlinks
// but leaves process.argv[1] as the caller typed it, so a plain string compare makes
// a symlinked invocation (the `.claude/skills/...` path SKILL.md documents, a
// node_modules link, /tmp on macOS) silently skip main() and exit 0.
function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (isDirectRun()) main();
