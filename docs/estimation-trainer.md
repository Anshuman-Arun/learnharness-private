# Estimation and confidence

Open Training → Estimation and confidence. Choose products, roots, natural logarithms, birthday probabilities or a Fermi scenario. Commit a positive estimate, central 80% interval and reasoning. The saved submission then reveals the reference and derivation; it cannot be rewritten after seeing the answer. History restores unfinished attempts and lets you review committed ones.

Exact-reference attempts report the multiplicative error and absolute natural-log error. The 80% interval score is `log(high/low) + 10 max(log(low/reference), 0) + 10 max(log(reference/high), 0)`. Lower scores reward useful narrow intervals while penalizing missed references. Coverage is compared with 80%; small samples are noisy. Fermi reference scenarios report their assumptions and are excluded from coverage/calibration aggregates.

Validated with mathematical/domain tests, immutable server submissions, hidden pre-commit references, browser submission/reload/review, typecheck and lint. These metrics assess recorded attempts, not durable mastery.
