/*! agentic-report script: copyable */
/** Copyable prose (`:::copyable`): the copy control that copies the rendered text of the block. */

import './copy.js';
import { contentElements, feature, provideFeature } from '../features.js';

provideFeature('copyable', (page, strings) => {
  const copy = feature('copy');
  if (copy === undefined) return;
  for (const block of contentElements<HTMLElement>(page, '[data-copyable-prose]'))
    if (block.querySelector(':scope > [data-copy-prose]') === null)
      block.append(copy.button('prose', strings));
});
