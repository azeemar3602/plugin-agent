import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/** Windows rarely has `python3`; the py launcher is often the only one on PATH. */
const PYTHON_BINS = ["python3", "python", "py"] as const;

/** The interpreter itself is missing — worth trying the next candidate. */
function isMissingInterpreter(message: string): boolean {
  return /ENOENT|not found|Can't find|is not recognized/i.test(message);
}

/** Python ran but could not import its dependencies. */
function isMissingModule(message: string): boolean {
  return /ModuleNotFoundError|ImportError|No module named/i.test(message);
}

export const PYTHON_DEPS_HINT =
  "Python is installed but missing its imaging modules. Run `pip install -r requirements.txt` in the app folder, or export the design as a JPEG/PNG.";

export async function runPythonScript(
  args: string[],
  options: { timeout?: number; maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  const errors: string[] = [];
  let sawMissingModule = false;

  for (const bin of PYTHON_BINS) {
    try {
      const { stdout, stderr } = await execFile(bin, args, {
        timeout: options.timeout ?? 90000,
        maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
        windowsHide: true,
      });
      return { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMissingInterpreter(message)) continue;
      // Keep trying the other binaries: a Store stub can lack the modules while a
      // real install two names later has them.
      if (isMissingModule(message)) sawMissingModule = true;
      errors.push(`${bin}: ${message}`);
    }
  }

  if (sawMissingModule) throw new Error(PYTHON_DEPS_HINT);
  throw new Error(
    errors[0] ||
      "No Python interpreter found. Install Python 3, then run `pip install -r requirements.txt`, or export the design as a JPEG/PNG.",
  );
}
