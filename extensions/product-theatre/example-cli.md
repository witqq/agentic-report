---
title: From an empty folder to a checked page in 18 seconds
description: One timed run of agentic-report, replayed step by step from its log.
language: en
layout: landing
theme: daylight
extensions: [extension.yaml, script.yaml]
data: [scenario-cli.json]
---

# From an empty folder to a checked page in 18 seconds

Four commands take a landing page from nothing to twelve snapshots you can look at. Scroll through the
run: each step lights the part of the tool it touches.

::product-theatre{title="One run, second by second" id="run" nav="Run" scenario="scenario-cli"}

::::section{title="Run it yourself" id="try" nav="Try"}
The same four commands work in any empty folder with Node.js 24.18 or newer. The snapshot step also needs
Chromium for Playwright, installed once with `npx playwright install chromium`.

:::actions
::action[Open the repository]{href="https://github.com/witqq/agentic-report" kind="primary"}
:::
::::
