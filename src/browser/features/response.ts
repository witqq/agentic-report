/*! agentic-report script: response */
/** Response Workspace: native question controls, answer export and import (`response-workspace.ts`). */

import { provideFeature } from '../features.js';
import { installResponseWorkspaces } from '../response-workspace.js';

provideFeature('response', (page) => installResponseWorkspaces(page));
