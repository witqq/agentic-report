---
contractVersion: 1
title: Форма ответа по решению о релизе
description: Вымышленная локальная форма со всеми видами структурированных ответов.
language: ru
---

# Форма ответа по решению о релизе

**Вымышленный пример.** Проблемы, ссылки, приоритеты и оценки ниже служат демонстрационными данными.

Ответьте на вопросы, добавьте только нужные комментарии, затем скопируйте или скачайте детерминированный ответ.

::::::section{title="Разбор в едином локальном пространстве" id="workspace" nav="Пространство" recipe="hero"}
:::::response{title="Разбор релиза" id="release-triage"}
::::question{id="scope" kind="bucket" title="Что и когда следует сделать?" prompt="Распределите каждый пункт по этапу поставки."}
::bucket{id="do" label="Сделать сейчас"}
::bucket{id="later" label="Позже"}
::bucket{id="skip" label="Не делать"}
::item{id="login" label="Исправить регрессию входа" note="Пустой адрес почты вызывает неожиданную ошибку сервера." meta="Задача 142 · влияние на клиентов: высокое" href="https://example.com/issues/142" bucket="do" comment="true"}
::item{id="copy" label="Исправить подпись кнопки экспорта" note="Текущая подпись понятна, но не согласована с остальными." meta="Задача 138 · оформление" href="https://example.com/issues/138" comment="true"}
::item{id="telemetry" label="Добавить ещё одного поставщика телеметрии" note="Принятого обоснования приватности пока нет." meta="Задача 131 · требуется проверка приватности" href="https://example.com/issues/131" bucket="skip" comment="true"}
::::

::::question{id="triage" kind="item-single" title="Выберите решение по каждому замечанию"}
::option{id="accept" label="Принять"}
::option{id="discuss" label="Обсудить"}
::option{id="reject" label="Отклонить"}
::item{id="finding-a" label="Не указан владелец отката" note="В инструкции названа команда, но не ответственный человек." meta="Ревью A" href="https://example.com/reviews/a" comment="true"}
::item{id="finding-b" label="Снимок экрана устарел" note="В текущем процессе у кнопки другая подпись." meta="Ревью B" href="https://example.com/reviews/b" comment="true"}
::::

::::question{id="risks" kind="item-multi" title="Отметьте применимые риски"}
::option{id="security" label="Безопасность"}
::option{id="reliability" label="Надёжность"}
::option{id="usability" label="Удобство"}
::item{id="auth" label="Изменение аутентификации" note="Затрагивает границу между анонимным и вошедшим пользователем." meta="Подсистема: идентификация" href="https://example.com/changes/auth"}
::item{id="export" label="Экспорт ответа" note="Должен работать при отказе буфера обмена." meta="Подсистема: передача" href="https://example.com/changes/export"}
::::

::::question{id="decision" kind="single" title="Общее решение о релизе"}
::option{id="go" label="Выпускать"}
::option{id="conditional" label="Выпускать с условиями"}
::option{id="hold" label="Отложить"}
::::

::::question{id="priority" kind="order" title="Порядок приоритетов"}
::item{id="first" label="Восстановить вход" note="Устраняет активную регрессию." meta="Владелец: идентификация" href="https://example.com/work/login" comment="true"}
::item{id="second" label="Проверить экспорт ответа" note="Защищает передачу решения." meta="Владелец: инструменты" href="https://example.com/work/export"}
::item{id="third" label="Обновить документацию" note="Убирает устаревший снимок." meta="Владелец: документация" href="https://example.com/work/docs"}
::::

::::question{id="scores" kind="number" title="Оцените каждое свойство релиза" prompt="Используйте значение от 1 до 5." min="1" max="5" step="1"}
::item{id="confidence" label="Уверенность в данных" note="Насколько убедительно данные поддерживают решение?" meta="1 — низкая · 5 — высокая" href="https://example.com/evidence/confidence"}
::item{id="reversibility" label="Обратимость" note="Насколько безопасно можно откатить изменение?" meta="1 — сложно · 5 — легко" href="https://example.com/evidence/reversibility"}
::::

::::question{id="summary" kind="text" title="Итог решения" prompt="Объясните решение и его самое важное условие."}
::::
:::::
::::::
