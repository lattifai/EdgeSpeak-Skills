// Run with: node --test skills/edgespeak-karaoke/scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "karaoke-ass-test-"));
  const transcript = join(dir, "transcript.json");
  writeFileSync(transcript, JSON.stringify(TRANSCRIPT), "utf8");
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
