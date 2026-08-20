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
export { initProject } from './authoring/init-project.js';
export type {
  BuildReportOptions,
  BuildReportResult,
  Diagnostic,
  InitProjectOptions,
  InitProjectResult,
  InspectReportOptions,
  InspectReportResult,
  OutputFormat,
  ReportManifest,
  ReportManifestInput,
  ValidateReportOptions,
  ValidateReportResult,
} from './contracts.js';
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
