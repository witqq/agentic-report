/**
 * Removes the outputs `pnpm build` owns before the build writes them again.
 *
 * The defect it catches: `tsc` and the browser build only add and overwrite files, so a module deleted or renamed in
 * `src/` kept its old `.js`, `.d.ts` and maps in `dist/node`. The stale files then shipped in `npm pack`
 * and failed the release allowlist of `pnpm pack:check`, although a fresh checkout built clean. The
 * build owns exactly these directories; anything else under `dist/` is left alone.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Directories written only by `pnpm build`: `tsc -p tsconfig.build.json` and `scripts/build-browser.ts`. */
export const BUILD_OUTPUTS = ['dist/node', 'dist/browser'] as const;

export async function cleanBuildOutputs(projectRoot: string): Promise<void> {
  await Promise.all(
    BUILD_OUTPUTS.map((output) =>
      rm(path.join(projectRoot, output), { recursive: true, force: true }),
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await cleanBuildOutputs(process.cwd());
}
