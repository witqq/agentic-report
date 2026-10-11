// Entry-point identity shared by importable skill commands, including symbolic-link installations.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Imports stay inert; direct invocation compares canonical files rather than installation spellings. */
export function isCliEntry(moduleUrl, entry = process.argv[1]) {
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
