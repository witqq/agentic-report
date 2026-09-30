// Page-source reads shared by the skill's checks; explicit CLI, edition and snapshot paths are separate.
import { lstat, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** An explicitly selected source establishes its canonical root, like the compiler's entry does. */
export async function pageSource(source) {
  const resolved = await realpath(path.resolve(source));
  const isDirectory = (await stat(resolved)).isDirectory();
  return { resolved, directory: isDirectory ? resolved : path.dirname(resolved), isDirectory };
}

/** Lexical and canonical confinement must both hold before reading any page-owned file. */
export async function confinedFile(file, directory, { markdown = false } = {}) {
  const root = await realpath(directory);
  const target = path.resolve(file);
  const inside = (candidate) => {
    const relative = path.relative(root, candidate);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  if (!inside(target)) throw new Error('Page source leaves the page source directory.');
  if (markdown && !target.endsWith('.md'))
    throw new Error('Page source reads accept only Markdown files.');
  let canonical;
  try {
    canonical = await realpath(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new Error('Page source file cannot be resolved.');
  }
  if (!inside(canonical))
    throw new Error('Page source leaves the page source directory through a symbolic link.');
  if (markdown && !canonical.endsWith('.md'))
    throw new Error('Page source reads accept only Markdown files.');
  return canonical;
}

/** Missing optional brief/checklist files remain absent; unsafe aliases and unreadable files fail closed. */
export async function readPageMarkdown(file, directory, { optional = false } = {}) {
  const canonical = await confinedFile(file, directory, { markdown: true });
  if (canonical === undefined) {
    if (optional) return undefined;
    throw new Error('Page source Markdown file is missing.');
  }
  try {
    return await readFile(canonical, 'utf8');
  } catch {
    throw new Error('Page source Markdown file cannot be read.');
  }
}

/** Default checklist writes share the read boundary, including an absent target's canonical parent. */
export async function writePageMarkdown(file, directory, text, options) {
  const canonical = await confinedFile(file, directory, { markdown: true });
  let target = canonical;
  if (target === undefined) {
    const lexical = path.resolve(file);
    const entry = await lstat(lexical).catch((error) => {
      if (error?.code === 'ENOENT') return undefined;
      throw new Error('Page source write target cannot be resolved.');
    });
    if (entry !== undefined) throw new Error('Page source write target cannot be resolved.');
    const parent = await confinedFile(path.dirname(lexical), directory);
    if (parent === undefined) throw new Error('Page source write directory is missing.');
    target = path.join(parent, path.basename(lexical));
  }
  await writeFile(target, text, options);
}

/** Includes use source-root-relative POSIX paths, including percent-encoded file names. */
export function includeFile(reference, directory) {
  let decoded;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    throw new Error('Page include is not a valid local path.');
  }
  if (
    decoded.length === 0 ||
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    decoded.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/iu.test(decoded) ||
    decoded.split('/').some((part) => part === '.' || part === '..')
  )
    throw new Error('Page include must stay under the page source directory.');
  if (!decoded.endsWith('.md')) throw new Error('Page source reads accept only Markdown files.');
  return path.resolve(directory, decoded);
}
