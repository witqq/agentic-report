import type {
  ReviewArtifact,
  ReviewBinding,
  ReviewSelectionBoundary,
  ReviewThread,
  ReviewThreadSegment,
  ReviewTargetManifest,
  ReviewTargetReference,
} from './contract.js';

export interface ResolvedReviewThread {
  readonly thread: ReviewThread;
  readonly binding: ReviewBinding;
  readonly currentTarget?: ReviewTargetReference;
  readonly segments: readonly ResolvedReviewSegment[];
}
export interface ResolvedReviewSegment {
  readonly segment: ReviewThreadSegment;
  readonly binding: ReviewBinding;
  readonly currentTarget?: ReviewTargetReference;
  readonly selection?: ResolvedReviewSelection;
}
export interface ResolvedReviewSelection {
  readonly start: ResolvedReviewSelectionBoundary;
  readonly end: ResolvedReviewSelectionBoundary;
}
export interface ResolvedReviewSelectionBoundary {
  readonly boundary: ReviewSelectionBoundary;
  readonly binding: ReviewBinding;
  readonly currentTarget?: ReviewTargetReference;
}

export interface ResolvedReviewArtifact {
  readonly reportStatus: 'exact' | 'stale';
  readonly threads: readonly ResolvedReviewThread[];
}

export function bindReviewArtifact(
  artifact: ReviewArtifact,
  manifest: ReviewTargetManifest,
): ResolvedReviewArtifact {
  const reportStatus = artifact.report.revision === manifest.reportRevision ? 'exact' : 'stale';
  return {
    reportStatus,
    threads: artifact.threads.map((thread) => {
      const segments = thread.segments.map((segment) => {
        const primary = bindTarget(
          segment.target,
          manifest.targets,
          segment.reportRevision === manifest.reportRevision ? 'exact' : 'stale',
        );
        if (segment.selection === undefined) return { segment, ...primary };
        const start = bindSelectionBoundary(
          segment.selection.start,
          manifest.targets,
          segment.reportRevision === manifest.reportRevision ? 'exact' : 'stale',
        );
        const end = bindSelectionBoundary(
          segment.selection.end,
          manifest.targets,
          segment.reportRevision === manifest.reportRevision ? 'exact' : 'stale',
        );
        return {
          segment,
          binding: combinedBinding([primary.binding, start.binding, end.binding]),
          ...(start.currentTarget === undefined ? {} : { currentTarget: start.currentTarget }),
          selection: { start, end },
        };
      });
      const latest = segments.at(-1);
      return {
        thread,
        binding: latest?.binding ?? 'missing',
        ...(latest?.currentTarget === undefined ? {} : { currentTarget: latest.currentTarget }),
        segments,
      };
    }),
  };
}

function bindSelectionBoundary(
  boundary: ReviewSelectionBoundary,
  currentTargets: readonly ReviewTargetReference[],
  reportStatus: 'exact' | 'stale',
): ResolvedReviewSelectionBoundary {
  return { boundary, ...bindTarget(boundary.target, currentTargets, reportStatus) };
}

function combinedBinding(bindings: readonly ReviewBinding[]): ReviewBinding {
  for (const candidate of ['ambiguous', 'missing', 'changed', 'exact'] as const)
    if (bindings.includes(candidate)) return candidate;
  return 'missing';
}

function bindTarget(
  prior: ReviewTargetReference,
  currentTargets: readonly ReviewTargetReference[],
  reportStatus: 'exact' | 'stale',
): { readonly binding: ReviewBinding; readonly currentTarget?: ReviewTargetReference } {
  const sameId = currentTargets.find((target) => target.id === prior.id);
  if (reportStatus === 'exact') {
    return sameId !== undefined && equivalentTarget(sameId, prior)
      ? { binding: 'exact', currentTarget: sameId }
      : { binding: 'missing' };
  }

  if (prior.stableKey !== undefined) {
    const stable = currentTargets.filter((target) => target.stableKey === prior.stableKey);
    if (stable.length > 1) return { binding: 'ambiguous' };
    const target = stable[0];
    if (target !== undefined) {
      return {
        binding: target.fingerprint === prior.fingerprint ? 'exact' : 'changed',
        currentTarget: target,
      };
    }
  }

  const sameOrigin = currentTargets.filter(
    (target) => target.kind === prior.kind && equivalentSourceStart(target, prior),
  );
  if (sameOrigin.length === 1) {
    const target = sameOrigin[0];
    if (target === undefined) return { binding: 'missing' };
    return {
      binding: target.fingerprint === prior.fingerprint ? 'exact' : 'changed',
      currentTarget: target,
    };
  }
  if (sameOrigin.length > 1) return { binding: 'ambiguous' };

  const sameFile = currentTargets.filter(
    (target) =>
      target.kind === prior.kind &&
      target.fingerprint === prior.fingerprint &&
      target.source.file === prior.source.file,
  );
  if (sameFile.length === 1) {
    const target = sameFile[0];
    return target === undefined
      ? { binding: 'missing' }
      : { binding: 'exact', currentTarget: target };
  }
  if (sameFile.length > 1) return { binding: 'ambiguous' };

  if (currentTargets.some((target) => target.source.file === prior.source.file)) {
    return { binding: 'missing' };
  }

  const sameContent = currentTargets.filter(
    (target) => target.kind === prior.kind && target.fingerprint === prior.fingerprint,
  );
  if (sameContent.length === 1) {
    const target = sameContent[0];
    return target === undefined
      ? { binding: 'missing' }
      : { binding: 'exact', currentTarget: target };
  }
  if (sameContent.length > 1) return { binding: 'ambiguous' };
  return { binding: 'missing' };
}

function equivalentTarget(left: ReviewTargetReference, right: ReviewTargetReference): boolean {
  return (
    left.kind === right.kind &&
    left.fingerprint === right.fingerprint &&
    left.stableKey === right.stableKey &&
    equivalentSource(left, right)
  );
}

function equivalentSource(left: ReviewTargetReference, right: ReviewTargetReference): boolean {
  return (
    left.source.file === right.source.file &&
    left.source.line === right.source.line &&
    left.source.column === right.source.column &&
    left.source.endLine === right.source.endLine &&
    left.source.endColumn === right.source.endColumn
  );
}

function equivalentSourceStart(left: ReviewTargetReference, right: ReviewTargetReference): boolean {
  return (
    left.source.file === right.source.file &&
    left.source.line === right.source.line &&
    left.source.column === right.source.column
  );
}
