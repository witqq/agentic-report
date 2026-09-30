/*! agentic-report script: review */
/** Review Workspace: notes on selected text, the thread list, import and export (`review-workspace.ts`). */

import { provideFeature } from '../features.js';
import { installReviewWorkspace } from '../review-workspace.js';

provideFeature('review', installReviewWorkspace);
