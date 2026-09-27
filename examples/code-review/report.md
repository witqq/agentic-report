---
contractVersion: 1
title: 'Review: idempotent webhook retries'
description: A code review of one change with the diff, findings by severity, and the verdict the author needs.
language: en
localizations:
  ru: report.ru.md
layout: document
theme: midnight
scheme: system
review: true
---

# Review: idempotent webhook retries

**Fictional sample.** The repository, change, and findings are invented to demonstrate a review
page; replace them with the real change and its evidence.

The change makes payment webhooks safe to retry: a delivery that arrives twice is recorded once.
**Verdict: request changes** — one blocking finding, two smaller ones.

::::::section{title="Verdict" id="verdict" nav="Verdict"}
:::lead
The approach is right; the key is not. Two deliveries of the same event with different retry
counters get different keys and are both processed.
:::

::::findings{title="Findings"}
:::finding{severity="blocking" title="The idempotency key includes the retry counter" location="src/webhooks/handler.ts:42"}
`attempt` changes on every retry, so the key never repeats for the case the change exists for.
Build the key from `event.id` and `event.type` only.
:::
:::finding{severity="major" title="The unique constraint is not in the migration" location="migrations/0042_webhook_events.sql"}
The code relies on a conflict that only a unique index on `idempotency_key` produces. Add it in the
same migration.
:::
:::finding{severity="minor" title="The log line repeats the payload" location="src/webhooks/handler.ts:57"}
Log the event id instead; the payload can carry personal data.
:::
::::
::::::

::::::section{title="The change" id="change" nav="Change"}
:::diff{file="src/webhooks/handler.ts"}

```diff
@@ -38,7 +38,12 @@ export async function handleWebhook(event: WebhookEvent, attempt: number) {
   const verified = verifySignature(event);
   if (!verified) return reject(event, 'signature');

-  await payments.apply(event);
-  log.info('webhook applied', event.payload);
+  const key = `${event.id}:${event.type}:${attempt}`;
+  const inserted = await db.webhookEvents.insertIgnoringConflict({ key, event });
+  if (!inserted) {
+    log.info('duplicate webhook skipped', event.payload);
+    return accept(event);
+  }
+  await payments.apply(event);
   return accept(event);
 }
```

:::

The handler now records each delivery before applying it and skips a delivery whose key already
exists. The findings above point at the lines of this diff.
::::::

::::::section{title="What would make it mergeable" id="next" nav="Next"}

1. Drop `attempt` from the key and add a test that delivers the same event twice with different
   attempts.
2. Add the unique index to migration 0042.
3. Log `event.id` instead of the payload.
   ::::::
