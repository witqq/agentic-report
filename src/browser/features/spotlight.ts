/*! agentic-report script: spotlight */
/** The magnifier (`:::spotlight`): the detail waits until the block shows, then settles. */

import { provideFeature } from '../features.js';
import { installPending } from '../technique-pending.js';

provideFeature('spotlight', (element) => installPending(element, 'data-spotlight-pending', 0.5));
