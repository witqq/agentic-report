---
contractVersion: 1
title: Карта слоёв показа анимаций
language: ru
---

# Карта слоёв

:::diagram{title="Карта слоёв показа" description="Холст создаёт аксессор и драйвер и открывает Stage, внедряя их; Stage создаёт плеер; драйвер тикает плеер, плеер пишет в аксессор, аксессор отдаёт кадр порту цели у рендерера, порт кладёт его в блок."}
::node{id="canvas" label="Холст" detail="держит одну постановку" kind="neutral"}
::node{id="accessor" label="CanvasAccessor" detail="аксессор холста" kind="warning"}
::node{id="driver" label="Driver" detail="драйвер кадров, requestAnimationFrame" kind="neutral"}
::node{id="stage" label="Stage" detail="постановщик: лента, шаги, предпросмотр" kind="success"}
::node{id="player" label="Player" detail="движок @volga/anim" kind="success"}
::node{id="port" label="ShowTarget" detail="порт цели у рендереров" kind="warning"}
::node{id="block" label="Block" detail="кадр через блок" kind="accent"}
::edge{from="canvas" to="accessor" label="new CanvasAccessor(поиск цели, диагностика)" kind="dependency"}
::edge{from="canvas" to="driver" label="new Driver()" kind="dependency"}
::edge{from="canvas" to="stage" label="open(колода, опции)"}
::edge{from="accessor" to="stage" label="accessor, onUndriven" kind="data"}
::edge{from="driver" to="stage" label="driver" kind="data"}
::edge{from="stage" to="player" label="createPlayer({ accessor, driver, onUndriven })" kind="dependency"}
::edge{from="driver" to="player" label="tick(время)"}
::edge{from="player" to="accessor" label="read / write(цель, путь, значение)"}
::edge{from="player" to="accessor" label="onUndriven(цели)"}
::edge{from="driver" to="accessor" label="flush() после tick"}
::edge{from="accessor" to="canvas" label="найти рендерер(цель)"}
::edge{from="accessor" to="port" label="applyTransform: одна матрица на цель; release()"}
::edge{from="port" to="block" label="матрица блока" kind="data"}
::legend{title="Как читать карту"}
::legend-item{edge="dependency" label="создаёт"}
::legend-item{edge="data" label="внедряет"}
::legend-item{edge="call" label="вызывает"}
::legend-item{node="success" label="в транке"}
::legend-item{node="accent" label="из ветки, остаётся"}
::legend-item{node="warning" label="из ветки, переделывается"}
::legend-item{node="neutral" label="новое"}
:::
