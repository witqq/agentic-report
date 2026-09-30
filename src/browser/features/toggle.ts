/*! agentic-report script: toggle */
/** Switches (`:::toggle`): the switch shows or hides its panel. */

import { provideFeature } from '../features.js';

provideFeature('toggle', (toggle) => {
  const panel = toggle
    .closest<HTMLElement>('[data-toggle]')
    ?.querySelector<HTMLElement>('[data-toggle-panel]');
  if (panel !== undefined && panel !== null) {
    const active = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(active));
    panel.hidden = !active;
  }
});
