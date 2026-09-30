/*! agentic-report script: screens */
/** `layout: screens`: one screen per gesture, keys, the switcher and the address (`screens.ts`). */

import { provideFeature } from '../features.js';
import { installScreens } from '../screens.js';

provideFeature('screens', installScreens);
