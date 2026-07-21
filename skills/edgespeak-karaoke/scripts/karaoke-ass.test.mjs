// Run with: node --test skills/edgespeak-karaoke/scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAss, detectScriptLang, loadTranscript, resolveStyle, resolveTranslationFont } from "./karaoke-ass.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "karaoke-ass.mjs");

const TRANSCRIPT = {
  segments: [
    {
      start: 0.5,
      end: 2.0,
      text: "hello world",
      words: [
        { word: "hello", start: 0.5, end: 1.2 },
        { word: "world", start: 1.3, end: 2.0 },
      ],
    },
  ],
};

const TRANSLATED = {
  segments: TRANSCRIPT.segments.map((segment) => ({ ...segment, translation: "你好世界" })),
};

// The font checks below need a real fontconfig; skip rather than fail on a box without it.
function hasFontconfig() {
  try {
    execFileSync("fc-match", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function workspace(payload = TRANSCRIPT) {
  const dir = mkdtempSync(join(tmpdir(), "karaoke-ass-test-"));
  const transcript = join(dir, "transcript.json");
  writeFileSync(transcript, JSON.stringify(payload), "utf8");
  return { dir, transcript, output: join(dir, "out.ass") };
}

// Regression guard: the plain, non-symlinked invocation must keep working.
test("generates ASS when invoked via the real script path", () => {
  const { dir, transcript, output } = workspace();
  try {
    execFileSync(process.execPath, [SCRIPT, transcript, "-o", output], { stdio: "pipe" });
    assert.ok(existsSync(output), "expected ASS output from a direct invocation");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The bug: SKILL.md documents the `.claude/skills/...` symlink path. Node resolves
// import.meta.url through symlinks but leaves process.argv[1] as typed, so the old
// entry-point guard compared two different strings, skipped main(), and exited 0
// without writing anything -- a silent no-op that looks like success.
test("generates ASS when invoked through a symlinked script path", () => {
  const { dir, transcript, output } = workspace();
  try {
    const linkDir = join(dir, "linked");
    mkdirSync(linkDir);
    const link = join(linkDir, "karaoke-ass.mjs");
    symlinkSync(SCRIPT, link);

    execFileSync(process.execPath, [link, transcript, "-o", output], { stdio: "pipe" });
    assert.ok(existsSync(output), "expected ASS output when invoked through a symlink");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The guard still has to earn its keep: this module exports helpers, so importing
// it must not run the CLI.
test("importing the module does not execute the CLI", async () => {
  const module = await import(`${SCRIPT}?probe=1`);
  assert.equal(typeof module.buildAss, "function");
  assert.equal(typeof module.loadTranscript, "function");
});

test("kana and hangul win over the Han characters mixed in with them", () => {
  assert.equal(detectScriptLang("これは日本語です"), "ja");
  assert.equal(detectScriptLang("한국어 漢字"), "ko");
  assert.equal(detectScriptLang("这是中文"), "zh-cn");
  assert.equal(detectScriptLang("Это по-русски"), "ru");
  assert.equal(detectScriptLang("plain latin text"), null);
});

// The bug this guards: libass renders uncovered codepoints as blank boxes without any
// error, so a Latin font on a CJK translation produces a whole burned video of tofu.
test("a translation font that cannot cover the script is refused", { skip: !hasFontconfig() }, () => {
  assert.throws(
    () => resolveTranslationFont("你好世界", { requested: "Arial", fallback: "Arial" }),
    /does not cover zh-cn/,
  );
});

test("a CJK translation auto-selects a font that covers it", { skip: !hasFontconfig() }, () => {
  const resolved = resolveTranslationFont("你好世界", { fallback: "Arial" });
  assert.equal(resolved.lang, "zh-cn");
  assert.equal(resolved.verified, true);
  // ASS delimits style fields with commas, so an alias list would corrupt the style row.
  assert.ok(!resolved.font.includes(","), `font must be a single alias, got "${resolved.font}"`);
});

test("a Latin translation keeps the preset font without consulting fontconfig", () => {
  const resolved = resolveTranslationFont("bonjour le monde", { fallback: "Arial" });
  assert.deepEqual(resolved, { font: "Arial", lang: null, verified: true });
});

test("translations in the transcript turn on bilingual output by default", () => {
  const { dir, transcript, output } = workspace(TRANSLATED);
  try {
    execFileSync(process.execPath, [SCRIPT, transcript, "-o", output], { stdio: "pipe" });
    const ass = readFileSync(output, "utf8");
    assert.match(ass, /^Style: Translation,/m);
    assert.match(ass, /\{\\rTranslation\}你好世界/);
    // One event carrying both lines, not two events fighting over the same margin.
    assert.equal(ass.match(/^Dialogue:/gm).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--layout source-only ignores the translations", () => {
  const { dir, transcript, output } = workspace(TRANSLATED);
  try {
    execFileSync(process.execPath, [SCRIPT, transcript, "-o", output, "--layout", "source-only"], { stdio: "pipe" });
    const ass = readFileSync(output, "utf8");
    assert.doesNotMatch(ass, /Translation/);
    assert.doesNotMatch(ass, /你好世界/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the layout decides which line is full size", () => {
  const style = resolveStyle("classic");
  const options = { title: "t", style, translationFont: "Arial" };
  const topIsTranslation = buildAss(TRANSLATED.segments, { ...options, layout: "translation-top" });
  const topIsSource = buildAss(TRANSLATED.segments, { ...options, layout: "source-top" });

  assert.match(topIsTranslation, new RegExp(`^Style: Translation,Arial,${style.fontSize},`, "m"));
  assert.match(topIsSource, new RegExp(`^Style: Karaoke,${style.font},${style.fontSize},`, "m"));
  // The translation leads the event text in one and trails it in the other.
  assert.ok(topIsTranslation.includes("karaoke,{\\rTranslation}"));
  assert.ok(topIsSource.includes("karaoke,{\\rKaraoke}"));
});

// A half-translated transcript means the translate step stopped early. Silently emitting
// source-only cues for the rest would pass that off as a complete bilingual file.
test("a partly translated transcript is rejected", () => {
  const { dir, transcript } = workspace({
    segments: [
      { ...TRANSCRIPT.segments[0], translation: "你好世界" },
      { start: 3.0, end: 4.0, text: "again", words: [{ word: "again", start: 3.0, end: 4.0 }] },
    ],
  });
  try {
    assert.throws(() => loadTranscript(transcript), /only 1 of 2 segments carry a translation/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bilingual layout on an untranslated transcript fails loudly", () => {
  const { dir, transcript, output } = workspace();
  try {
    assert.throws(
      () => execFileSync(process.execPath, [SCRIPT, transcript, "-o", output, "--layout", "source-top"], { stdio: "pipe" }),
      /needs segments\[\]\.translation/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
