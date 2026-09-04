/**
 * The public projection of the directive phase: what rules exist over each authored subject and
 * which of them depends on which. It is data only — the executable rule shape stays internal,
 * because a published callback type would be an extension point this package does not offer.
 */
export interface AuthoredRuleDescription {
  readonly subject: string;
  readonly rules: readonly {
    readonly id: string;
    readonly dependsOn: readonly string[];
  }[];
}
