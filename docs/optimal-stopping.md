# Optimal stopping lab

Configure the number of faces, total available draws and cost of each additional draw. Commit a predicted expected payoff and a strategy. Accept the observed offer, or pay and draw again. The final draw must be accepted. Games persist between page reloads; future random seeds, solution tables and action values are omitted from active API responses.

After accepting, inspect each decision's conditional regret and the finite-horizon table. If `V(n)` is the value before seeing the next offer with n draws available, `V(1)` is the mean offer and `V(n) = E[max(X, V(n−1) − cost)]`. On an observed draw with r further draws available, continue only when `V(r) − cost` exceeds the current offer. Accept ties. Previously paid costs are sunk; final payoff subtracts the costs actually paid.

Local action regret is the difference between the best conditional action value and the chosen action's value. It is not the difference between a lucky/unlucky realized payoff and the game's starting expectation. The policy comparison reports both exact expectations and 5000 reproducible shared-offer simulations for the optimal policy and a learner-selected fixed threshold. Results can be staged in the tutor for derivation review.
