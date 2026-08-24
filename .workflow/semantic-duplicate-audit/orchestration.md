# Orchestration: Semantic duplicate audit

## Execution Rules

- Keep the original objective intact.
- Ask for approval before risky, expensive, external, or destructive actions.
- Keep immediate blocking work local.
- Delegate only bounded, disjoint, materially useful packets.
- Integrate packet results before final verification.

## Branching Rules

- If candidate volumes are large, rank by similarity and review the high-confidence band first.
- If agents disagree, retain the question unless direct source evidence proves equivalence.
- Treat opposite truth values as possible duplicates only when they test the identical rule and differ solely by negation.

## Packet Prompts

- P1 writes `results/p1-lexical.md`: produce ranked cross-source candidate pairs using reproducible lexical or character-ngram evidence. Do not edit product files.
- P2 writes `results/p2-semantic.md`: independently inspect candidate concepts and identify pairs testing the same legal proposition. Include IDs and concise rationale. Do not edit product files.
- P3 writes `results/p3-policy.md`: define a conservative removal rule, audit likely false positives, and recommend keep/remove decisions. Do not edit product files.

## Completion Audit

- Confirm all three results exist.
- Integrate accepted removals into `pipeline/extract-source.mjs` as deterministic rules.
- Record accepted and rejected decisions in `final-report.md`.
- Verify workflow artifacts with the bundled checker.
