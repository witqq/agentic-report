---
title: 'Как слово превращается в изменение кадра'
language: ru
layout: dashboard
theme: midnight
scheme: dark
motion: expressive
topbar: false
attribution: false
---

Фрагменты кода Agentic Report и Agentic Screencast объясняют передачу значения и привязку времени. Данные примера иллюстративные; показанные состояния модели не являются записью работающего продукта. Файлы и функции перечислены в [карте исходников](SOURCE-MAP.md). [Отдельный пример](../directed-code-execution/report.md) содержит полные функции Report и помощник для обновления их кода из установленного пакета.

::::composition{id="copy-runtime" title="Копия прибывает. Оригинал остаётся." kind="ownership"}
:::object{id="layout" title="layout · исходный шаблон" role="source"}
**Glow 4 px + Shadow 8 px**
:::
:::object{id="shape" title="shape · получатель" role="result"}
Ждёт копию
:::
:::object{id="code" title="agentic-report / src/composition.ts · compositionFrame · copy / transfer" role="code"}

```ts
if (progress < 1)
  frame.travels.push({
    from: targetId,
    to: destinationId,
    content: target.content,
    progress,
  });
else {
  destination.content = target.content;
  destination.visible = true;
  if (cue.action === 'transfer') target.content = { empty: true };
}
```

:::
::cue{at="b1+0.1" action="copy" target="layout" to="shape" duration="1.2"}
::cue{at="b1+0.1" action="focus" target="code" lines="1-7"}
::cue{at="b1+1.3" action="compare" target="layout" to="shape"}
::cue{at="b2" action="focus" target="code" lines="8-10"}
::cue{at="b2+0.8" action="connect" target="layout" to="shape" value="copy: оригинал сохранён"}
::cue{at="b3" action="replace" target="shape" value="Glow 4 px + Shadow 12 px"}
::cue{at="b3" action="focus" target="shape"}
::cue{at="b4" action="focus" target="code" lines="11"}
::::

::::composition{id="runtime-layers" title="Время → состояние → видимый кадр" kind="pipeline"}
:::object{id="clock" title="1 · часы страницы" role="source"}
`seek(t)` → `timed.at(t)`

Передаёт секунды; UI-время не идёт само.
:::
:::object{id="model" title="2 · compositionFrame" role="result"}
`ids + cues + time + resolve`

Создаёт новую `Map`, связи и полёты.
:::
:::object{id="view" title="3 · browser / composition.ts" role="result"}
`CompositionFrame` → DOM / SVG

Меняет содержимое и геометрию.
:::
:::object{id="code" title="agentic-report / src/browser/features/composition.ts · render(time)" role="code"}

```ts
const frame = compositionFrame(
  [...objects.keys()],
  cues,
  staticFrame ? Number.POSITIVE_INFINITY : time,
  resolve,
);
```

:::
::cue{at="b1" action="connect" target="clock" to="model" value="render(time)" duration="0.8"}
::cue{at="b1" action="focus" target="clock"}
::cue{at="b2" action="focus" target="code" lines="1-5"}
::cue{at="b2" action="replace" target="model" value="objects: Map(layout, shape) · connections: [] · travels: [layout → shape]"}
::cue{at="b3" action="connect" target="model" to="view" value="возвращённый frame" duration="0.8"}
::cue{at="b3" action="replace" target="view" value="content() → scopedClone() → mounted region body · rect() → connectionRoute() → SVG"}
::cue{at="b3" action="focus" target="view"}
::cue{at="b4" action="compare" target="model" to="view"}
::::

::::composition{id="reconstruct" title="Перемотка назад не оставляет позднюю правку" kind="before-after"}
:::object{id="authored" title="Один исходник · два времени" role="source"}
`copy @ 1s` → `replace @ 3s`

`ids = [layout, shape]`
:::
:::object{id="later" title="compositionFrame(..., 4)" role="result"}
shape.content = { text: "Shadow 12 px" }
:::
:::object{id="earlier" title="compositionFrame(..., 0)" role="result"}
shape.content = { source: "shape" }
:::
:::object{id="code" title="agentic-report / src/composition.ts · новая Map и пропуск будущих cues" role="code"}

```ts
objects: new Map(
  ids.map((id) => [
    id,
    {
      content: { source: id },
```

:::
::cue{at="b1" action="focus" target="later"}
::cue{at="b2" action="connect" target="authored" to="earlier" value="новый вызов @ 0s"}
::cue{at="b2" action="focus" target="code" lines="1-5"}
::cue{at="b3" action="replace" target="earlier" value="Map !== поздняя Map · content: {source: shape} · travels: []"}
::cue{at="b3" action="compare" target="later" to="earlier"}
::cue{at="b4" action="focus" target="authored"}
::::

::::composition{id="speech-clock" title="Не угаданные секунды. Реальное начало фразы." kind="diagram-code"}
:::object{id="speech" title="Screencast · измеренная речь" role="source"}
`scene.starts[1]`

Начало второго абзаца.
:::
:::object{id="binding" title="installReportComposition · мост" role="result"}
`b2 → times.get("b2")`
:::
:::object{id="frame" title="Report · render(time)" role="result"}
Связь ещё не нарисована
:::
:::object{id="code" title="agentic-screencast / src/report-composition.ts · bind(resolve)" role="code"}

```ts
control.bind((anchor) => {
  const time = times.get(anchor);
  if (time === undefined) throw new Error(`Unbound report composition cue: ${anchor}`);
  return time;
});
```

:::
::cue{at="b1" action="connect" target="speech" to="binding" value="moment(anchor, starts, ...)"}
::cue{at="b1" action="focus" target="speech"}
::cue{at="b2" action="connect" target="binding" to="frame" value="resolve(cue.at)"}
::cue{at="b2" action="replace" target="frame" value="Второй абзац начался → связь рисуется прямо сейчас"}
::cue{at="b2" action="focus" target="code" lines="1-4"}
::cue{at="b3" action="replace" target="frame" value="Новое содержимое → новая высота объекта → rect() → route → стрелка остаётся на границе"}
::cue{at="b3" action="focus" target="frame"}
::cue{at="b4" action="compare" target="speech" to="binding"}
::::
