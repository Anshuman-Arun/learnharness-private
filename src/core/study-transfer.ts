/** Written transfer tasks are reviewed as reasoning, never graded by a matching scalar. */
export const STUDY_TRANSFER: Record<string, [string, string, string]> = {
	"bayes-odds": [
		"Derive sequential posterior odds from a joint law. Construct dependent observations for which multiplying marginal likelihood ratios gives a wrong posterior, and compute the correct one.",
		"A detector is deployed in two populations with different prevalence. Decide which additional measurements you need before recommending the same positive-result action in both.",
		"Implement log-odds updates; test extreme priors and duplicated signals. Explain which failures are numerical and which are modelling errors.",
	],
	indicators: [
		"Derive both the mean and variance of occupied boxes. Identify every covariance class; independence of placements does not imply independence of occupancy indicators.",
		"Compare the number of colliding pairs with the number of objects participating in collisions. Construct a configuration that maximizes their difference.",
		"Write an O(n) expected-time pair counter, prove its invariant and compare against brute force on seeded small cases.",
	],
	"order-races": [
		"Derive the joint law of winning clock and first arrival time for unequal exponential rates; establish their independence.",
		"Replace one exponential clock with a uniform clock. Identify exactly which residual-time argument breaks and give a numerical counterexample.",
		"Simulate uniform spacings and exponential races. Design an experiment that distinguishes matching means from matching distributions.",
	],
	"absorbing-chains": [
		"Build prefix-state first-step equations for the waiting time to HTH. Verify transitions for overlapping prefixes and solve them.",
		"Introduce a closed nonabsorbing class. Distinguish probability of eventual absorption, unconditional hitting time and time conditional on absorption.",
		"Implement a linear-system solver and simulation. Report residuals and identify singular or nearly singular systems rather than inventing an answer.",
	],
	"stopping-dp": [
		"Derive the reservation policy for arbitrary discrete offers, finite horizon and per-rejection cost. Show the boundary and prove backward induction.",
		"Change the offer distribution after an observed draw. Explain why a horizon-only Bellman state may no longer suffice.",
		"Compare policies on common random offers and independent replicate runs. Separate expected regret from realized payoff differences.",
	],
	"beta-binomial": [
		"Derive a joint two-step posterior predictive law and quantify predictive covariance. Explain why conditional independence does not survive integrating out p.",
		"Construct two priors with the same mean but different concentration. Compare their response to the same data and their predictive dispersion.",
		"Implement Gamma-ratio Beta sampling. Compare full predictive simulation against a plug-in Binomial and diagnose their variance difference.",
	],
	"tail-bounds": [
		"Derive Markov and Chebyshev from pointwise inequalities. Invert Hoeffding for an explicit confidence and error requirement.",
		"Construct dependent bounded observations with the same marginal law as IID observations, for which the IID sample-size guarantee fails.",
		"Compare exact Binomial tails, valid bounds and simulations at equal n. State when a loose bound still answers a decision question.",
	],
	"monte-carlo": [
		"Derive the optimal control coefficient and variance reduction. State the case where a poorly chosen control increases variance.",
		"Design a control for an integral and compare against antithetic sampling at equal function-evaluation cost, including pilot fitting cost.",
		"Implement independent replicate experiments and confidence intervals. Diagnose how estimating a coefficient on the evaluation sample affects inference.",
	],
	"gaussian-conditioning": [
		"Derive the affine projection and conditional Gaussian law using an independent residual. Identify exactly where Gaussianity is required.",
		"Construct uncorrelated dependent variables. Explain why the Gaussian conditional-variance conclusion fails for your example.",
		"Simulate conditional-bin estimates; vary bin width and sample size to separate discretization bias from Monte Carlo error.",
	],
	"discrete-hedging": [
		"Replicate a two-state contingent payoff and derive the state prices. Show why physical probability drops out.",
		"Violate d < R < u and explicitly construct a self-financing arbitrage. Discuss equality at a boundary.",
		"Extend replication to a three-step tree and verify every terminal payoff. Compare risk-neutral pricing against backward portfolio construction.",
	],
	"streaming-cpp": [
		"Derive a merge operation for two Welford summaries (count, mean, M2). Verify associativity algebraically and discuss floating-point limits.",
		"Design a rolling median with duplicate removal and bounded memory. State balancing invariants and justify O(log k) updates.",
		"Test large offsets with tiny variance, empty partitions, duplicate heap values and adversarial monotone streams. Compare with high-precision or centered references.",
	],
	"calibration-ev": [
		"Derive honesty of the Brier score by minimizing expected loss. Give forecasts with good ranking but poor calibration.",
		"Derive expected value of a noisy signal from its confusion matrix and a payoff table; optimize after each signal before averaging.",
		"Implement a forecast backtest that avoids time leakage. Report calibration and decision utility separately, including uncertainty from small samples.",
	],
};
