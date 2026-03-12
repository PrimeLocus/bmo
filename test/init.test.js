import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { initializeWorkspace, parseInitArgs } from "../src/commands/init.js";

test("parseInitArgs reads flags and target", () => {
  const options = parseInitArgs(["demo", "--force", "--dry-run"]);

  assert.deepEqual(options, {
    target: "demo",
    force: true,
    dryRun: true,
    help: false
  });
});

test("parseInitArgs supports -- to stop option parsing", () => {
  const options = parseInitArgs(["--", "--force"]);

  assert.deepEqual(options, {
    target: "--force",
    force: false,
    dryRun: false,
    help: false
  });
});

test("parseInitArgs rejects unsupported options", () => {
  assert.throws(() => parseInitArgs(["--unknown"]), {
    message: "Unsupported option: --unknown"
  });
});

test("parseInitArgs validates the argv boundary", () => {
  assert.throws(() => parseInitArgs(null), {
    name: "TypeError",
    message: "init arguments must be provided as an array of strings."
  });
});

test("initializeWorkspace creates the scaffold and seeds the prompt from the repo file", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "bmo-init-cwd-"));
  const target = "workspace";
  const sourcePrompt = "# Seeded prompt\n";

  await writeFile(path.join(cwd, "bmo-system-prompt.md"), sourcePrompt, "utf8");

  const result = await initializeWorkspace({ cwd, target });
  const targetDir = path.join(cwd, target);

  assert.equal(result.targetDir, targetDir);
  assert.ok(result.actions.length >= 5);

  const config = JSON.parse(await readFile(path.join(targetDir, "bmo.config.json"), "utf8"));
  const prompt = await readFile(path.join(targetDir, "prompts/system.md"), "utf8");

  assert.deepEqual(config.wakeWords, ["Hey BMO", "Hey Beau"]);
  assert.equal(prompt, sourcePrompt);

  const memoryDirStats = await stat(path.join(targetDir, "data/memory"));
  assert.equal(memoryDirStats.isDirectory(), true);
});

test("initializeWorkspace dry-run reports actions without writing files", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "bmo-init-dry-"));

  const result = await initializeWorkspace({ cwd, target: "preview", dryRun: true });

  assert.ok(result.actions.some((action) => action.type === "write"));
  await assert.rejects(stat(path.join(cwd, "preview", "bmo.config.json")), {
    code: "ENOENT"
  });
});

test("initializeWorkspace refuses to overwrite files without force", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "bmo-init-force-"));
  const targetDir = path.join(cwd, "workspace");

  await initializeWorkspace({ cwd, target: "workspace" });
  await writeFile(path.join(targetDir, "bmo.config.json"), "{\"custom\":true}\n", "utf8");

  await assert.rejects(
    initializeWorkspace({ cwd, target: "workspace" }),
    {
      message: `Refusing to overwrite existing file without --force: ${path.join(targetDir, "bmo.config.json")}`
    }
  );

  await initializeWorkspace({ cwd, target: "workspace", force: true });

  const config = JSON.parse(await readFile(path.join(targetDir, "bmo.config.json"), "utf8"));
  assert.equal(config.name, "BMO");
});

test("initializeWorkspace rejects file targets", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "bmo-init-file-"));
  const targetPath = path.join(cwd, "not-a-directory");

  await writeFile(targetPath, "blocked", "utf8");

  await assert.rejects(
    initializeWorkspace({ cwd, target: "not-a-directory" }),
    {
      message: `Target path is not a directory: ${targetPath}`
    }
  );
});

test("initializeWorkspace rejects non-file prompt templates", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "bmo-init-prompt-dir-"));
  const promptPath = path.join(cwd, "bmo-system-prompt.md");

  await mkdir(promptPath);

  await assert.rejects(
    initializeWorkspace({ cwd, target: "workspace" }),
    {
      message: `Prompt template is not a file: ${promptPath}`
    }
  );
});

test("initializeWorkspace validates option types", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "bmo-init-validate-"));

  await assert.rejects(
    initializeWorkspace({ cwd: "", target: "workspace" }),
    {
      name: "TypeError",
      message: "cwd must be a non-empty string."
    }
  );

  await assert.rejects(
    initializeWorkspace({ cwd, target: "workspace", force: "yes" }),
    {
      name: "TypeError",
      message: "force must be a boolean."
    }
  );
});
