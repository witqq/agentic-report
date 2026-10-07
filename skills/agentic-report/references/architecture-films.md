# Teach an architecture through a concrete execution

An architecture film succeeds when its viewer can explain the components' responsibilities, trace a concrete operation through the real functions and locate the place to change. A clean export, a diagram with arrows or highlighted words proves none of those. Use the existing draft viewing to judge understanding; do not add a separate review process or an effect quota.

## Give the explanation something to do

Choose an operation the audience cares about, with an actual input, intermediate representation and result. For an edit, show which fields change and which owner keeps the original. For a read, show where its value comes from and which context resolves it. For an event, show who schedules it, what crosses the boundary and which consumer receives it. State what the event does and what it does not prove: notification is not completed rendering.

Carry the example through real file and function names. Show the pertinent arguments, returned value and stored form, rather than a type name alone. Distinguish a call edge, data flow, ownership and dependency; a connector labelled “next” cannot express all four. Include a file/function locator inside the filmed picture when the viewer needs to find that code; a source paragraph outside the target will not be filmed.

Use a diagram when topology, branching, containment, responsibility or causality matters. A list of independent components is better served by a list or table. A general box named “Model” under five paragraphs does not teach its storage, reads, mutation and event API. Give those paragraphs their corresponding changing representation, actual operation and result.

## Make the scene develop with the speech

At the spoken action, change the displayed fields, deliver the payload, reveal the branch or show the actual output. Focus the responsible code lines at the same paragraph anchor, then move the emphasis as the subject changes. A precise line focus or mark can be stronger than a stage camera orbit; use a camera or loupe when it makes the selected material readable. Combine them when they tell one event: value movement, receiving owner, corresponding call and dependent result.

Keep a recognizable identity across changes. One scene may hold the topology while a detail changes; another may expand the code to full width, follow a value along a pipeline or compare stored and returned forms. A right-hand detail pane is one arrangement, not the required layout of an architecture film. Change the staging when the viewer's question changes, while preserving names and meaningful visual landmarks.

Start engineering/code films with `midnight` and an explicit dark scheme unless the product, brand or requested look calls for another choice. Apply the same palette to the Report material and the Screencast layer. Keep syntax and labels readable in the settled shot; do not dim the operation the viewer must read. A real light UI keeps its truthful captured appearance inside the surrounding dark film.

## Use the expressive vocabulary deliberately

Do not reduce “avoid decoration” to “avoid effects.” Existing entrances, depth, transitions, waves, marks, loupes, action glides, thinking states and numerical animation give meaningful changes weight. A moving switch followed by its result explains an interaction. A queue losing its payload on delivery explains a boundary. Depth can separate layers, then settle for reading. Repeated drift behind unrelated narration explains nothing.

Useful staging alternatives are:

- **Action → response:** a pointer reaches the control, a click coincides with `overlay.actions`, its knob or list moves through `glide`, then a toast or changed result confirms the action. Use a real capture for actual product behavior; saved-page actions reconstruct an illustration.
- **Same object before and after:** open on the concrete result or defect, indicate its cause with a local mark and return to that same object after the operation. Keep its identity, rather than cutting from a generic problem card to a generic success card.
- **One cause, several representations:** reveal the common input and show the different outputs together or sequentially, with matching changes. The source remains recognizable while the viewer learns the distinction.

Adapt these combinations to the operation and audience. A combination illustrates a relationship; it does not prescribe the structure of the entire film.

## Buildable real-code example

The architecture-walkthrough example uses the actual Report composition model, browser renderer, page clock and Screencast speech bridge. It varies ownership, pipeline, before/after and diagram/code staging, moves a value, changes concrete bodies and focuses real lines with measured narration. The companion Screencast example's preparation helper records actual function results and object identities. Those example values illustrate this tool's behavior; they are not evidence of an unrelated product or a deep copy in its data model.

Adapt the operation, evidence and arrangement to the subject. A teaser may begin on a surprising result; a debugging explanation may reconstruct a failure; a code tour may follow a caller. Whole-interface orientation remains the specific requirement for interface material, not a story shape imposed on every architecture.

The native Report source is [architecture-walkthrough.md](../../../examples/directed-change-event/architecture-walkthrough.md). The Screencast package contains `example/architecture-walkthrough/prepare.mjs`, `story.md`, `SOURCE-MAP.md` and the build instructions. The page works by itself; the film binds its anchors to narration.
