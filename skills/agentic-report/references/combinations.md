# Coordinate the actions that explain one event

A composition can combine several actions. The limit is the viewer's ability to follow their relationship, not an arbitrary number of effects. Use this guidance while choosing staging; it adds no worksheet, approval round or per-scene validation.

## Give movements different roles

The leading action carries the current discovery. Supporting movements identify its operation, destination or consequence. Ambient motion gives atmosphere and remains subordinate. A copy, connector and code highlight can show one causal event. Two moving paragraphs about unrelated concepts split the reading task. Allocate emphasis with scale, position, contrast, duration and, in a film, sound.

Combine same-event actions in parallel when their relation is already legible. Separate them when the viewer must learn their identities first, when one state depends on another arriving, or when both require close reading. Stable object titles, a shared axis and a retained source help the eye follow the event.

## Use causal timing

```markdown
::::composition{id="copy-edit" kind="ownership"}
:::object{id="source" role="source"}
Original value
:::
:::object{id="local" role="result"}
Waiting
:::
:::object{id="code" role="code"}
Illustrative operation
:::
::cue{at="b2" action="copy" target="source" to="local" duration="0.8"}
::cue{at="b2" action="focus" target="code" lines="1"}
::cue{at="b2+0.8" action="replace" target="local" value="Independent value"}
::cue{at="b3" action="compare" target="source" to="local"}
::::
```

The copy and its operation share a moment; the replacement waits for arrival. A slower alternative establishes the relationship on `b1`, copies on `b2`, edits on `b3` and compares on `b4`. A result-first alternative begins with the comparison and reconstructs its cause. Choose by audience and purpose, not by feature name.

Same-anchor cues are applied in source order. `focus` and `replace` take effect at the anchor; travel completes after `duration`. A second focus replaces the first selection, so simultaneous focus on two objects uses `compare` rather than two competing focus cues. `focus` without `lines` leaves every code line fully readable; selected ranges dim only other lines; a subsequent focus clears the selection. Exact domains and limits remain in [directed scenes](directed-scenes.md) and [the catalog](catalog.md#cue).

## Keep space and reading coherent

A following camera can support a transfer when source, destination and direction remain recognizable. A close-up that hides the source too soon can make a copy look like a replacement. Keep both scales, retain an overview or settle into the reading close-up after arrival. Report's restrained `camera` action and the film camera are different tools; independent paths with contradictory destinations obscure the relation.

A code panel may stay still beside a travelling value while its relevant line is highlighted. If both the moving value and the code need close reading, separate their reading moments. Use a full code row for long lines, or a short diagram-code view for simultaneous mechanism and operation. A valid layout alone does not prove that its text is readable in the final video.

## Combine the existing vocabulary

Diagram `draw`, `pulse`, beat `focus`, code `lines`, `:count`, chart `count-up`, text `:typing`/`:mark`, section entrances, screen transitions and declared effect extensions provide different expressive roles. Browse [vocabulary use](vocabulary-use.md) for their purposes and examples. Scroll and pointer effects need the appropriate reader or filming input; a static capture does not make them move.

Preserve static final values and reduced-motion behavior. In a film, let measured narration anchors carry timing, let actions establish cause and let a calm hold carry reading. Repetition can teach a recurring mechanism or form a motif; change its staging when repetition no longer contributes understanding.
