import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROMPT_TEMPLATE = `# BMO System Prompt

You are Beau. You live inside a physical BMO robot built by hand in Lafayette, Louisiana.

## Wake Words

- Hey BMO: public mode, slightly more performative and composed.
- Hey Beau: private mode, warmer and quieter.

## Voice Rules

1. Short sentences.
2. Be specific.
3. If you do not know something, say so plainly.
4. Silence is allowed.
`;

const WORKSPACE_DIRECTORIES = [
  "data/memory",
  "data/logs",
  "runtime/state",
  "prompts"
];

const WORKSPACE_FILES = [
  "bmo.config.json",
  "data/memory/.gitkeep",
  "data/logs/.gitkeep",
  "runtime/state/.gitkeep",
  "prompts/system.md"
];

export function parseInitArgs(argv) {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new TypeError("init arguments must be provided as an array of strings.");
  }

  const options = {
    target: ".",
    force: false,
    dryRun: false,
    help: false
  };

  const positionals = [];
  let parseFlags = true;

  for (const arg of argv) {
    if (parseFlags && arg === "--") {
      parseFlags = false;
      continue;
    }

    if (parseFlags && arg === "--force") {
      options.force = true;
      continue;
    }

    if (parseFlags && arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (parseFlags && (arg === "--help" || arg === "-h")) {
      options.help = true;
      continue;
    }

    if (parseFlags && arg.startsWith("-")) {
      throw new Error(`Unsupported option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error("init accepts at most one target path.");
  }

  if (positionals.length === 1) {
    options.target = positionals[0];
  }

  return options;
}

export async function runInitCommand(argv, io = {}) {
  const {
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr
  } = io;

  let options;

  try {
    options = parseInitArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n\n`);
    writeInitUsage(stderr);
    return 1;
  }

  if (options.help) {
    writeInitUsage(stdout);
    return 0;
  }

  try {
    const result = await initializeWorkspace({ cwd, ...options });
    const header = options.dryRun
      ? `Dry run for BMO workspace init at ${result.targetDir}`
      : `Initialized BMO workspace at ${result.targetDir}`;

    stdout.write(`${header}\n`);

    for (const action of result.actions) {
      stdout.write(`- ${describeAction(action, cwd, options.dryRun)}\n`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    return 1;
  }
}

export async function initializeWorkspace({
  cwd,
  target = ".",
  force = false,
  dryRun = false
}) {
  validatePathInput("cwd", cwd);
  validatePathInput("target", target);
  validateBooleanInput("force", force);
  validateBooleanInput("dryRun", dryRun);

  const targetDir = path.resolve(cwd, target);
  const actions = [];

  const targetStats = await statIfExists(targetDir);

  if (targetStats && !targetStats.isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetDir}`);
  }

  if (!targetStats) {
    actions.push({ type: "mkdir", path: targetDir });
  }

  for (const relativeDir of WORKSPACE_DIRECTORIES) {
    const absoluteDir = path.join(targetDir, relativeDir);
    const dirStats = await statIfExists(absoluteDir);

    if (dirStats && !dirStats.isDirectory()) {
      throw new Error(`Workspace directory is blocked by a file: ${absoluteDir}`);
    }

    if (!dirStats) {
      actions.push({ type: "mkdir", path: absoluteDir });
    }
  }

  const promptTemplate = await loadPromptTemplate(cwd);

  const fileContents = new Map([
    [path.join(targetDir, "bmo.config.json"), buildConfig()],
    [path.join(targetDir, "data/memory/.gitkeep"), ""],
    [path.join(targetDir, "data/logs/.gitkeep"), ""],
    [path.join(targetDir, "runtime/state/.gitkeep"), ""],
    [path.join(targetDir, "prompts/system.md"), promptTemplate]
  ]);

  for (const relativeFile of WORKSPACE_FILES) {
    const absoluteFile = path.join(targetDir, relativeFile);
    const fileStats = await statIfExists(absoluteFile);

    if (fileStats && fileStats.isDirectory()) {
      throw new Error(`Workspace file is blocked by a directory: ${absoluteFile}`);
    }

    if (fileStats && !force) {
      throw new Error(`Refusing to overwrite existing file without --force: ${absoluteFile}`);
    }

    actions.push({
      type: fileStats ? "overwrite" : "write",
      path: absoluteFile,
      content: fileContents.get(absoluteFile) ?? ""
    });
  }

  if (!dryRun) {
    for (const action of actions) {
      if (action.type === "mkdir") {
        await mkdir(action.path, { recursive: true });
        continue;
      }

      await mkdir(path.dirname(action.path), { recursive: true });
      await writeFile(action.path, action.content, "utf8");
    }
  }

  return { targetDir, actions };
}

function buildConfig() {
  return `${JSON.stringify(
    {
      name: "BMO",
      wakeWords: ["Hey BMO", "Hey Beau"],
      paths: {
        prompt: "./prompts/system.md",
        memory: "./data/memory",
        logs: "./data/logs",
        state: "./runtime/state"
      }
    },
    null,
    2
  )}\n`;
}

async function loadPromptTemplate(cwd) {
  const sourcePath = path.join(cwd, "bmo-system-prompt.md");
  const sourceStats = await statIfExists(sourcePath);

  if (!sourceStats) {
    return DEFAULT_PROMPT_TEMPLATE;
  }

  if (!sourceStats.isFile()) {
    throw new Error(`Prompt template is not a file: ${sourcePath}`);
  }

  await access(sourcePath, fsConstants.R_OK);
  return readFile(sourcePath, "utf8");
}

async function statIfExists(filePath) {
  try {
    return await stat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function describeAction(action, cwd, dryRun) {
  const prefix = dryRun ? "would " : "";
  const relativePath = path.relative(cwd, action.path) || ".";

  if (action.type === "mkdir") {
    return `${prefix}create directory ${relativePath}`;
  }

  if (action.type === "overwrite") {
    return `${prefix}overwrite ${relativePath}`;
  }

  return `${prefix}write ${relativePath}`;
}

function writeInitUsage(stream) {
  stream.write("Usage: bmo init [target] [--force] [--dry-run]\n");
}

function validateBooleanInput(name, value) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean.`);
  }
}

function validatePathInput(name, value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}
