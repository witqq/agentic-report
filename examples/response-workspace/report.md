---
contractVersion: 1
title: Release decision response workspace
description: A fictional local response form covering every structured answer kind.
language: en
theme: system
layout: document
preset: editorial
---

# Release decision response workspace

**Fictional sample.** The issues, links, priorities, and scores below are demonstration data.

Complete the questions, add only the comments you need, then copy or download the deterministic response.

:::::response{title="Release triage" id="release-triage"}
::::question{id="scope" kind="bucket" title="What should happen when?" prompt="Assign every item to a delivery bucket."}
::bucket{id="do" label="Do now"}
::bucket{id="later" label="Later"}
::bucket{id="skip" label="Do not do"}
::item{id="login" label="Fix the login regression" note="Empty email returns an unexpected server error." meta="Issue 142 · customer impact: high" href="https://example.com/issues/142" bucket="do" comment="true"}
::item{id="copy" label="Correct the export button label" note="The current label is understandable but inconsistent." meta="Issue 138 · cosmetic" href="https://example.com/issues/138" comment="true"}
::item{id="telemetry" label="Add another telemetry vendor" note="No accepted privacy case exists yet." meta="Issue 131 · privacy review required" href="https://example.com/issues/131" bucket="skip" comment="true"}
::::

::::question{id="triage" kind="item-single" title="Choose one disposition per finding"}
::option{id="accept" label="Accept"}
::option{id="discuss" label="Discuss"}
::option{id="reject" label="Reject"}
::item{id="finding-a" label="The rollback owner is missing" note="The runbook names a team but not an accountable person." meta="Review A" href="https://example.com/reviews/a" comment="true"}
::item{id="finding-b" label="The screenshot is stale" note="The current flow uses a different button label." meta="Review B" href="https://example.com/reviews/b" comment="true"}
::::

::::question{id="risks" kind="item-multi" title="Tag the risks that apply"}
::option{id="security" label="Security"}
::option{id="reliability" label="Reliability"}
::option{id="usability" label="Usability"}
::item{id="auth" label="Authentication change" note="Touches the anonymous-to-signed-in boundary." meta="Subsystem: identity" href="https://example.com/changes/auth"}
::item{id="export" label="Response export" note="Must survive clipboard rejection." meta="Subsystem: handoff" href="https://example.com/changes/export"}
::::

::::question{id="decision" kind="single" title="Overall release decision"}
::option{id="go" label="Go"}
::option{id="conditional" label="Conditional go"}
::option{id="hold" label="Hold"}
::::

::::question{id="priority" kind="order" title="Priority order"}
::item{id="first" label="Restore login" note="Stops the active regression." meta="Owner: Identity" href="https://example.com/work/login" comment="true"}
::item{id="second" label="Verify response export" note="Protects the decision handoff." meta="Owner: Tooling" href="https://example.com/work/export"}
::item{id="third" label="Refresh documentation" note="Removes the stale screenshot." meta="Owner: Docs" href="https://example.com/work/docs"}
::::

::::question{id="scores" kind="number" title="Score each release property" prompt="Use a value from 1 to 5." min="1" max="5" step="1"}
::item{id="confidence" label="Evidence confidence" note="How strongly does the evidence support the decision?" meta="1 low · 5 high" href="https://example.com/evidence/confidence"}
::item{id="reversibility" label="Reversibility" note="How safely can the change be rolled back?" meta="1 hard · 5 easy" href="https://example.com/evidence/reversibility"}
::::

::::question{id="summary" kind="text" title="Decision summary" prompt="Explain the decision and its most important condition."}
::::
:::::
