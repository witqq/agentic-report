---
title: Release notes 4.2
description: What changed in version 4.2 of a small command-line sync tool.
language: en
theme: daylight
scheme: dark
extensions: [extension.yaml]
---

# Release notes 4.2

::::section{title="Faster first sync" id="sync" loom="band"}
The first sync of a large folder now streams file lists instead of loading them whole. On a folder of
200,000 files it starts copying after 4 seconds instead of 70.

Memory stays under 300 MB during the first pass.
::::

::::section{title="Conflicts you can read" id="conflicts" loom="band"}
When both sides changed a file, the tool keeps both copies and names the second one after the machine
that wrote it. The log line says which side won and why.

Old conflict files named with a random suffix are renamed on the next run.
::::

::::section{title="Removed" id="removed"}
The `--legacy-hash` flag is gone. Folders synced with it are rehashed once, in the background.
::::
