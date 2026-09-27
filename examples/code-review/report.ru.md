---
contractVersion: 1
title: 'Ревью: идемпотентные повторы вебхуков'
description: Ревью одного изменения с диффом, находками по серьёзности и вердиктом, который нужен автору.
language: ru
---

# Ревью: идемпотентные повторы вебхуков

**Вымышленный пример.** Репозиторий, изменение и находки придуманы, чтобы показать страницу ревью;
замените их настоящим изменением и его доказательствами.

Изменение делает платёжные вебхуки безопасными для повторов: доставка, пришедшая дважды,
записывается один раз. **Вердикт: нужны исправления** — одна блокирующая находка и две помельче.

::::::section{title="Вердикт" id="verdict" nav="Вердикт"}
:::lead
Подход верный, ключ — нет. Две доставки одного события с разными счётчиками повторов получают
разные ключи и обе обрабатываются.
:::

::::findings{title="Находки"}
:::finding{severity="blocking" title="Ключ идемпотентности содержит счётчик повторов" location="src/webhooks/handler.ts:42"}
`attempt` меняется при каждом повторе, поэтому ключ не повторяется ровно в том случае, ради
которого сделано изменение. Стройте ключ только из `event.id` и `event.type`.
:::
:::finding{severity="major" title="Уникального ограничения нет в миграции" location="migrations/0042_webhook_events.sql"}
Код рассчитывает на конфликт, который даёт только уникальный индекс по `idempotency_key`.
Добавьте его в ту же миграцию.
:::
:::finding{severity="minor" title="В журнал пишется всё тело события" location="src/webhooks/handler.ts:57"}
Пишите идентификатор события: в теле могут быть персональные данные.
:::
::::
::::::

::::::section{title="Изменение" id="change" nav="Изменение"}
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

Теперь обработчик записывает каждую доставку до применения и пропускает доставку, чей ключ уже
есть. Находки выше указывают на строки этого диффа.
::::::

::::::section{title="Что нужно для слияния" id="next" nav="Дальше"}

1. Убрать `attempt` из ключа и добавить тест, который доставляет одно событие дважды с разными
   номерами попытки.
2. Добавить уникальный индекс в миграцию 0042.
3. Писать в журнал `event.id` вместо тела события.
   ::::::
