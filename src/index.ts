import { AgenticReportError } from './diagnostics.js';
import { getNodeCompatibilityDiagnostic } from './node-compatibility.js';
import { readInstalledPackageMetadata } from './package-metadata.js';

const installedPackage = readInstalledPackageMetadata();
const compatibilityDiagnostic = getNodeCompatibilityDiagnostic(
  process.versions.node,
  installedPackage.nodeEngine,
);
if (compatibilityDiagnostic !== undefined) {
  throw new AgenticReportError(compatibilityDiagnostic);
}

export { buildReport } from './core/compiler.js';
export { inspectReport, validateReport } from './core/analyze-report.js';
export { inspectReview } from './core/inspect-review.js';
export { fixReport } from './core/fix-report.js';
export { initProject } from './authoring/init-project.js';
export type {
  AppliedFix,
  BuildReportOptions,
  BuildReportResult,
  Diagnostic,
  DiagnosticFix,
  FixReportOptions,
  FixReportResult,
  InitProjectOptions,
  InitProjectResult,
  InspectReportOptions,
  InspectReportResult,
  InspectReviewOptions,
  InspectReviewResult,
  OutputFormat,
  ReportManifest,
  ReportManifestInput,
  ValidateReportOptions,
  ValidateReportResult,
} from './contracts.js';
export {
  REVIEW_CONTRACT_VERSION,
  REVIEW_TARGET_MANIFEST_VERSION,
  parseReviewArtifact,
  parseReviewTargetManifest,
  serializeReviewArtifact,
  type ReviewArtifact,
  type ReviewBinding,
  type ReviewMessage,
  type ReviewSelectionAnchor,
  type ReviewSelectionBoundary,
  type ReviewThread,
  type ReviewThreadSegment,
  type ReviewTargetManifest,
  type ReviewTargetReference,
} from './review/contract.js';
export { AgenticReportError } from './diagnostics.js';
export {
  EXTENSION_PROPOSAL_CONTRACT_VERSION,
  getExtensionProposalSchema,
  getExtensionProposalTemplate,
  validateExtensionProposal,
  type ExtensionProposal,
  type ExtensionTrustBoundary,
  type ExtensionProposalValidation,
} from './authoring/extension-gate.js';
export {
  getAuthoringSchema,
  getSourceContract,
  listExamples,
  sourceContract,
  type DirectiveName,
  type ExampleContract,
  type SchemaScope,
  type SourceContract,
} from './discovery.js';
