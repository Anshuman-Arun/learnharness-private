# Bounded quant study sprints

Training → 4.5-hour quant sprints provides twelve original curricula, each intended as a deep first pass **after its prerequisites are comfortable**. All use 270 minutes: diagnostic 15; derivation 55; guided transfer problems 50; break 10; coding/simulation 45; unseen exit set 60; teach-back/error review 35. Budgets are suggestions. The exit set records overtime rather than preventing submission.

| Topic | Central skill | What to demonstrate |
|---|---|---|
| Conditional probability / likelihood ratios | Bayes in odds form, sequential evidence, conditional independence | Normalize unfamiliar evidence without reversing a conditional |
| Indicators and symmetry | Collisions, inversions, occupancy, covariance | Select indicators and explain where independence is unnecessary |
| Order statistics / exponential races | Survival functions, min/max, competing rates, memorylessness | Derive a new distribution and explain rate/mean units |
| Absorbing chains | Minimal state, first-step equations, finite linear systems | Model a new pattern or hitting problem with valid boundaries |
| Finite-horizon stopping | Bellman recurrence, reservation values, costs | Derive and implement a policy for an unfamiliar horizon |
| Beta-Binomial inference | Posterior kernels and predictive moments | Separate uncertain parameters from future outcomes |
| Concentration | Markov, Chebyshev, Hoeffding and sample size | State assumptions and choose a useful numerical bound |
| Monte Carlo | Standard error, antithetic/control variates | Show variance reduction at equal computational cost |
| Gaussian conditioning | Least-squares projection and residuals | Derive conditional mean/variance and identify Gaussian-only conclusions |
| Discrete hedging | Replication, state prices, no-arbitrage | Replicate a new payoff without substituting physical probabilities |
| Streaming C++ | Welford variance, top-k heaps, numeric edge cases | Implement and test invariants, complexity and precision |
| Calibration / expected value | Proper scoring, payoff thresholds, value of information | Optimize a decision after conditioning on each signal |

After martingales and random walks, a useful sequence is indicators → order statistics/races → stopping → absorbing chains → Monte Carlo, with streaming C++ alongside. Add Bayesian/Gaussian modules for statistics/research roles and hedging for trading interviews.

Each module includes prerequisites, diagnostic questions, derivation prompts, guided transfer tasks, a concrete C++/simulation exercise and common traps. Progress, milestone notes and running timer state persist locally on the server. Timers continue while the page is closed; pause before leaving. Local unsaved note/exit drafts survive reload in the same tab. Checkmarks track activity, not mastery.

Open guided teaching session selects the reversible Guided setting and stages the curriculum/current notes as evidence. Open practice session uses the existing practice agent. Review the staged evidence and send an instruction such as “Begin with the prerequisite diagnostic.” No provider call is made until you submit. These handoffs deliberately omit exit answer keys.

Exit prompts appear only after opening the exit set. All three numeric answers and derivations must be committed before references/rubrics appear. Submitted answers are immutable. Numeric checks use relative tolerance 1e-6 with absolute floor 1e-10; explanations require human/tutor rubric review. A matching number does not certify the derivation. Revisit failures in the notebook and schedule delayed recall; a single afternoon or a three-question score cannot guarantee OA/interview mastery.
