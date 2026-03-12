import { runInitCommand } from "./commands/init.js";

export async function runCli(argv, io = {}) {
  const {
    cwd = process.cwd(),
    stdout = process.stdout,
    stderr = process.stderr
  } = io;

  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    writeUsage(stdout);
    return 0;
  }

  if (command === "init") {
    return runInitCommand(rest, { cwd, stdout, stderr });
  }

  stderr.write(`Unknown command: ${command}\n\n`);
  writeUsage(stderr);
  return 1;
}

function writeUsage(stream) {
  stream.write("Usage: bmo <command> [options]\n\n");
  stream.write("Commands:\n");
  stream.write("  init [target]   Create a BMO workspace scaffold.\n");
}
