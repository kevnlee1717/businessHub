import { execFile } from "node:child_process";
import { mkdir, unlink } from "node:fs/promises";
import { basename, dirname, extname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const uploadRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "uploads");

export function absoluteUploadPath(storagePath: string) {
  return join(uploadRoot, storagePath);
}

export async function generateIpadSlideThumbnail(storagePath: string): Promise<string> {
  const sourceAbs = absoluteUploadPath(storagePath);
  const directory = posix.dirname(storagePath);
  const base = basename(storagePath, extname(storagePath));
  const thumbPath = posix.join(directory, `${base}-thumb.png`);
  const outPrefixAbs = join(uploadRoot, directory, `${base}-thumb`);

  await mkdir(join(uploadRoot, directory), { recursive: true });
  try {
    await execFileAsync("/usr/bin/pdftoppm", [
      "-png",
      "-f",
      "1",
      "-l",
      "1",
      "-scale-to",
      "800",
      "-singlefile",
      sourceAbs,
      outPrefixAbs
    ]);
  } catch (error) {
    try {
      await unlink(join(uploadRoot, thumbPath));
    } catch {
      // Ignore partial thumbnail cleanup failures.
    }
    throw error;
  }

  return thumbPath;
}
