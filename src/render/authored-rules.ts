import type { AgenticReportError } from '../diagnostics.js';
import type { AuthoredRuleDescription } from './authored-rule-contract.js';

/**
 * One authored check over one subject. It answers with a violation or with nothing; it does not
 * throw, because throwing ends the surrounding work and makes the completeness of a run depend on
 * how finely that work happens to be split.
 */
export interface AuthoredRule<TSubject> {
  /** Stable identity, unique inside its rule set; other rules name it as a dependency. */
  readonly id: string;
  /**
   * Rules of the same set whose refusal makes this one unanswerable. A rule reading the parsed kind
   * of a question depends on the rule that parses it: with the kind refused, anything derived from
   * it would be a fact about an interpretation nobody accepted.
   */
  readonly dependsOn?: readonly string[];
  readonly check: (subject: TSubject) => AuthoredRuleOutcome;
}

/**
 * What a rule answers: nothing when the subject satisfies it, one or more violations when it does
 * not, or `'refused'` when the rule found the subject unreadable without adding a record of its own.
 * The silent refusal exists for the case where the violation was already reported elsewhere or is
 * deliberately suppressed as derived: dependent rules must still be skipped, because the
 * interpretation they would read does not exist.
 */
export type AuthoredRuleOutcome =
  AgenticReportError | readonly AgenticReportError[] | 'refused' | undefined;

/** A subject and the rules that judge it, as data — readable without running a single check. */
export interface AuthoredRuleSet<TSubject> {
  readonly subject: string;
  readonly rules: readonly AuthoredRule<TSubject>[];
}

const registeredRuleSets: AuthoredRuleSet<never>[] = [];

/**
 * Declares a rule set and returns it unchanged. Registration is what makes the phase describable
 * without executing it, which is the difference between rules as data and rules as control flow.
 */
export function declareAuthoredRules<TSubject>(
  set: AuthoredRuleSet<TSubject>,
): AuthoredRuleSet<TSubject> {
  assertDeclaredDependencies(set);
  registeredRuleSets.push(set as unknown as AuthoredRuleSet<never>);
  return set;
}

/** Every declared rule set with its dependencies, in declaration order. */
export function describeAuthoredRules(): readonly AuthoredRuleDescription[] {
  return registeredRuleSets.map((set) => ({
    subject: set.subject,
    rules: set.rules.map((rule) => ({ id: rule.id, dependsOn: [...(rule.dependsOn ?? [])] })),
  }));
}

/**
 * Runs one subject through its rule set, keeping every violation instead of stopping at the first.
 * A rule whose declared dependency refused is skipped: its answer would describe an interpretation
 * that was already rejected. Returns whether the subject itself was accepted, so a caller can decide
 * about the subject's own children.
 */
export function runAuthoredRules<TSubject>(
  set: AuthoredRuleSet<TSubject>,
  subject: TSubject,
  violations: AgenticReportError[],
): 'accepted' | 'refused' {
  const refused = new Set<string>();
  for (const rule of set.rules) {
    if ((rule.dependsOn ?? []).some((dependency) => refused.has(dependency))) continue;
    const outcome = rule.check(subject);
    if (outcome === undefined) continue;
    if (outcome === 'refused') {
      refused.add(rule.id);
      continue;
    }
    const found = Array.isArray(outcome) ? outcome : [outcome as AgenticReportError];
    if (found.length === 0) continue;
    refused.add(rule.id);
    violations.push(...found);
  }
  return refused.size === 0 ? 'accepted' : 'refused';
}

/** A dependency naming a rule the set does not declare would be silently ignored at run time. */
function assertDeclaredDependencies<TSubject>(set: AuthoredRuleSet<TSubject>): void {
  const declared = new Set(set.rules.map((rule) => rule.id));
  if (declared.size !== set.rules.length) {
    throw new Error(`Authored rule set ${set.subject} declares a duplicate rule id.`);
  }
  for (const rule of set.rules) {
    for (const dependency of rule.dependsOn ?? []) {
      if (!declared.has(dependency)) {
        throw new Error(
          `Authored rule ${set.subject}/${rule.id} depends on undeclared rule ${dependency}.`,
        );
      }
    }
  }
}
