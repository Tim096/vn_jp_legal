# Semantic duplicate audit

## Goal

Identify questions from the two imported sources that test the same legal proposition despite different wording, remove only high-confidence redundant supplemental questions, retain broader or materially different questions, then verify and deploy the corrected quiz interaction and full dataset.

## Success Criteria

- All 466 `shikakumondai` questions remain the canonical backbone.
- All 300 `shikaku-dojo` questions are compared against the backbone and each other.
- Every removed question has a recorded kept ID, reason, and evidence.
- No removal is based only on a shared law name or topic.
- Quiz selection requires an option click plus explicit submission.
- Dataset and deployed site pass structural and HTTP checks.

## Current Context

`pipeline/output/all.json` currently contains 766 questions. Exact normalized matching found zero duplicates, but that does not detect paraphrases or questions testing the same rule.

## Constraints

- Preserve source text; do not generate legal content.
- Prefer source 1 as canonical when two questions test the same proposition.
- Agents perform read-only analysis and write only their assigned result file.
- Do not commit or push until integration and verification pass. User has authorized commit and push.

## Risks

- Over-aggressive semantic deduplication could delete useful variations or opposite-polarity questions.
- Shared statutes do not imply duplicate propositions.
- Negation changes the tested proposition and must be checked explicitly.

## Approval Required

Commit and push approval granted by the user in the current turn.

## Work Packets

- P1: lexical and near-duplicate candidate generation across sources.
- P2: independent legal-proposition overlap audit.
- P3: conservative deduplication policy and candidate adjudication review.

## Integration Policy

Remove a supplemental question only when at least two independent packet results support equivalence and the primary agent verifies matching legal proposition, conditions, and conclusion. Otherwise retain it.

## Verification

Re-run extraction, validator, uniqueness checks, interaction assertions, HTTP smoke test, GitHub Pages build, and production URL checks.

## Reusable Artifacts

Retain candidate and decision reports under this workflow directory.
