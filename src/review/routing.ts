import type { PageLocaleChoice } from '../authoring/registry.js';
import {
  MULTILINGUAL_REVIEW_CONTRACT_VERSION,
  type ReviewArtifact,
  type ReviewTargetManifest,
} from './contract.js';

export interface ReviewLocaleVariant {
  readonly locale: PageLocaleChoice;
  readonly primary: boolean;
  readonly manifest: ReviewTargetManifest;
}

export class ReviewLocaleRoutingError extends Error {
  public constructor(public readonly reason: 'unsupported-locale' | 'ambiguous-revision') {
    super(
      reason === 'unsupported-locale'
        ? 'Review locale is not part of this report.'
        : 'Review revision matches more than one report locale.',
    );
    this.name = 'ReviewLocaleRoutingError';
  }
}

export function selectReviewLocaleVariant<T extends ReviewLocaleVariant>(
  artifact: ReviewArtifact,
  variants: readonly T[],
): T {
  if (artifact.contractVersion === MULTILINGUAL_REVIEW_CONTRACT_VERSION) {
    const selected = variants.find((variant) => variant.locale === artifact.report.locale);
    if (selected === undefined) throw new ReviewLocaleRoutingError('unsupported-locale');
    return selected;
  }
  const exact = variants.filter(
    (variant) => variant.manifest.reportRevision === artifact.report.revision,
  );
  if (exact.length > 1) throw new ReviewLocaleRoutingError('ambiguous-revision');
  const selected = exact[0] ?? variants.find((variant) => variant.primary);
  if (selected === undefined) throw new ReviewLocaleRoutingError('ambiguous-revision');
  return selected;
}
