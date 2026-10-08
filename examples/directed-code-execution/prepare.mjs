import { resolve } from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { compositionAddress, compositionLineLabel } from '../../dist/node/composition.js';
const source = new URL('../../src/composition.ts', import.meta.url);
const compiled = new URL('../../dist/node/composition.js', import.meta.url);
const file = await access(source).then(
  () => source,
  () => compiled,
);
const text = await readFile(file, 'utf8');
const lines = text.split('\n');
const extract = (name) => {
  const start = lines.findIndex((line) => line.startsWith(`export function ${name}(`));
  if (start < 0) throw new Error(`Missing real function: ${name}`);
  const end = lines.findIndex((line, i) => i > start && line === '}');
  if (end < 0) throw new Error(`Missing complete function: ${name}`);
  return { start: start + 1, text: lines.slice(start, end + 1).join('\n') };
};
const address = extract('compositionAddress'),
  label = extract('compositionLineLabel');
const locator = file === source ? 'src/composition.ts' : 'dist/node/composition.js';
const language = file === source ? 'ts' : 'js';
const result = compositionAddress('local', 'value');
const lineLabel = compositionLineLabel('2-4,7', 41);
const scene = (
  id,
  title,
  code,
  explanation,
  value,
) => `:::::composition{id="${id}" title="${title}" kind="${id === 'address' ? 'diagram-code' : 'pipeline'}" layout="${id === 'address' ? 'auto' : 'column'}"}
::::scene-group{id="values" title="Illustrative input and actual function result" layout="row" align="stretch"}
:::object{id="input" title="Input" role="source"}
${id === 'address' ? 'object = local; slot = value' : 'relative lines = 2-4,7; excerpt starts at 41'}
:::
:::object{id="result" title="Actual returned value" role="result"}
${value}
:::
::::
:::object{id="code" title="${locator}:${code.start} · ${id === 'address' ? 'compositionAddress' : 'compositionLineLabel'}" role="code" notes="beside" lineStart="${code.start}"}
\`\`\`${language}
${code.text}
\`\`\`
:::
::cue{at="b1" action="connect" target="input" to="code" relation="call" value="arguments"}
::cue{at="b2" until="b2.end" action="annotate" target="code" lines="${code.text.split('\n').findIndex((line) => line.includes(id === 'address' ? 'return slot' : 'Number(n) + lineStart - 1')) + 1}" to="result" value="${explanation}"}
::cue{at="b2" action="focus" target="code" lines="${code.text.split('\n').findIndex((line) => line.includes(id === 'address' ? 'return slot' : 'Number(n) + lineStart - 1')) + 1}" emphasis="brackets"}
::cue{at="b3" action="connect" target="code" to="result" relation="data" value="return value"}
::cue{at="b3" action="trace" target="code" to="result" effect="beam" duration="1"}
::cue{at="b3+1" action="focus" target="result" emphasis="halo"}
${id === 'source-lines' ? '::cue{at="b4" action="focus" target="result" emphasis="none"}\n' : ''}:::::
`;
const markdown = `---
title: Real functions with directed presentation notes
language: en
layout: dashboard
theme: midnight
scheme: dark
motion: expressive
topbar: false
attribution: false
---

${scene('address', 'An owner and its named value form one address', address, 'The returned address keeps the owner and value region together.', result)}
${scene('source-lines', 'An excerpt keeps the original source line numbers', label, 'The source offset locates this operation in its original file.', lineLabel)}
`;
await writeFile(
  process.argv[2] ? resolve(process.argv[2]) : new URL('./report.md', import.meta.url),
  markdown,
);
