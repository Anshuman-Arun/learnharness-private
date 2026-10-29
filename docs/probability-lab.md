# Probability experiment lab

Training → Probability experiments models independent fair dice, urn draws without replacement, and a diagnostic test with base rate/sensitivity/specificity. A committed prediction and explanation precede trials and exact results. The settings of each saved experiment are immutable.

Trial-indexed seeded streams make results identical across batch sizes and reloads. Run/Resume sends bounded batches; Pause finishes the current batch and leaves the saved offset available to resume. A replayed offset is rejected rather than double-counted. Limits are 100–100000 trials and 2000 per request.

Dice sums use exact finite convolutions. Urns use state transitions on the remaining red/blue counts. Diagnostic tests report P(condition | positive), using only positives as the empirical denominator; the outcome table still displays the whole cohort. The 95% Wilson interval quantifies sampling uncertainty. Repeatedly inspecting intervals changes simultaneous coverage and cannot verify the underlying model.

Discuss this result with tutor stages the immutable saved configuration, prediction, reasoning, counts and reference distribution as JSON evidence in a new session. Review/add your question before explicitly sending. No model call is required for the lab itself.
