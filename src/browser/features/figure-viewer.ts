/*! agentic-report script: figure-viewer */
/** The **Open** control of diagrams, charts and wide tables and the full-screen viewer. */

import { provideFeature } from '../features.js';
import { installFigureViewer } from '../figure-viewer.js';

provideFeature('figureViewer', installFigureViewer);
