/** Explicit opt-in hosting API, separate from the offline compiler entry. */
import './index.js'; // Apply the same installed Node compatibility gate as the compiler API.
export { serveReport } from './live/server.js';
export type {
  ServeReportOptions,
  LiveReportServer,
  LiveSnapshot,
  LiveSubject,
  LiveConversation,
  LiveConversationMessage,
} from './live/contract.js';
