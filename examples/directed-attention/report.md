---
title: Follow a message without losing the map
language: en
layout: dashboard
theme: midnight
scheme: dark
motion: expressive
topbar: false
attribution: false
---

::::composition{id="delivery" title="A relation stays. A message passes. Its receiver responds." kind="pipeline"}
:::object{id="producer" title="Producer" role="source"}
Creates each notification.
:::
:::object{id="queue" title="Queue"}
Keeps pending notifications until delivery.
:::
:::object{id="consumer" title="Consumer" role="result"}
Receives its own delivered notification.
:::
::cue{at="b1" action="connect" target="producer" to="queue" value="enqueues"}
::cue{at="b1" action="connect" target="queue" to="consumer" value="delivers"}
::cue{at="b2" action="focus" target="producer" emphasis="outline"}
::cue{at="b2" action="trace" target="producer" to="queue" effect="packet" duration="1.2"}
::cue{at="b3" action="focus" target="queue" emphasis="brackets"}
::cue{at="b3" action="trace" target="queue" to="consumer" effect="beam" duration="1.2"}
::cue{at="b3+1.2" action="focus" target="consumer" emphasis="halo"}
::cue{at="b4" action="compare" target="producer" to="consumer" emphasis="underline"}
::cue{at="b5" action="focus" target="consumer" emphasis="none"}
::::
