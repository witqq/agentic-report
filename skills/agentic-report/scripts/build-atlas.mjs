#!/usr/bin/env node
/** Build actual packaged examples; the gallery adds navigation, not author code to them. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { buildReport } = await import(path.join(root, 'dist/node/index.js'));
const { listExamples } = await import(path.join(root, 'dist/node/discovery.js'));
const { listReferenceExtensions } = await import(
  path.join(root, 'dist/node/authoring/reference-extensions.js')
);
const at = process.argv.indexOf('--out');
if (at < 0 || !process.argv[at + 1] || process.argv[at + 1].startsWith('--'))
  throw new Error('Use --out <absent or empty directory>.');
const out = path.resolve(process.argv[at + 1]);
if ((await readdir(out).catch(() => [])).length)
  throw new Error('Atlas output must be absent or empty.');
await mkdir(out, { recursive: true });
const entries = listExamples().map((e) => ({
  name: e.id,
  description: e.description,
  input: path.join(root, 'examples', e.path, e.entry),
}));
for (const example of listExamples()) {
  const directory = path.join(root, 'examples', example.path);
  const files = (await readdir(directory)).filter((f) => f.endsWith('.md') && f !== 'brief.md');
  const texts = new Map(
    await Promise.all(files.map(async (f) => [f, await readFile(path.join(directory, f), 'utf8')])),
  );
  const variants = new Set(
    [...texts.values()].flatMap((text) =>
      [
        ...(text.match(/^localizations:\n((?:[ \t].*\n)+)/mu)?.[1] ?? '').matchAll(
          /^\s+[\w-]+:\s*(\S+)/gmu,
        ),
      ].map((m) => m[1]),
    ),
  );
  for (const [file, text] of texts) {
    if (file !== example.entry && !variants.has(file) && /^---\n[\s\S]*?\ntitle:/u.test(text))
      entries.push({
        name: `${example.id}-${path.basename(file, '.md')}`,
        description: `Companion source of ${example.title}`,
        input: path.join(directory, file),
      });
  }
}
for (const extension of await listReferenceExtensions(path.join(root, 'extensions'))) {
  for (const input of extension.examples)
    if (!entries.some((e) => e.input === input))
      entries.push({
        name: `${extension.name}-${path.basename(input, '.md')}`,
        description: extension.description,
        input,
      });
}
const esc = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const links = [];
for (const e of entries) {
  const file = `${e.name}.html`;
  await buildReport({ input: e.input, output: path.join(out, file) });
  links.push(
    `<article><h2>${esc(e.name)}</h2><p>${esc(e.description)}</p><a href="${esc(file)}" target="preview">Open interactive preview</a> · <a href="${esc(file)}">Open full page</a></article>`,
  );
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Report examples atlas</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f8;color:#17253b;font:17px/1.5 system-ui}main{max-width:1280px;margin:auto;padding:30px}h1{font-size:40px}iframe{width:100%;height:75vh;border:1px solid #d3dce7;border-radius:10px;background:white}article{padding:20px;margin:16px 0;background:white;border:1px solid #d3dce7;border-radius:10px}a{color:#245ab2}input{font:inherit;padding:12px;width:100%}</style></head><body><main><h1>Report tools and examples</h1><p>Actual package-built pages. Scroll, switch views and play their scenes to inspect motion. Sources contain illustrative facts where labeled; choose staging from the directing and combinations guides, rather than repeating a catalog as a film template.</p><iframe name="preview" title="Interactive page preview" src="${esc(entries[0].name)}.html"></iframe><input id="search" aria-label="Search examples" placeholder="Find an example, purpose or extension">${links.join('')}</main><script>document.querySelector('#search').oninput=e=>{const q=e.target.value.toLowerCase();for(const a of document.querySelectorAll('article'))a.hidden=!a.textContent.toLowerCase().includes(q)}</script></body></html>`;
await writeFile(path.join(out, 'index.html'), html);
console.log(JSON.stringify({ index: path.join(out, 'index.html'), previews: entries.length }));
