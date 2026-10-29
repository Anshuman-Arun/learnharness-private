/** Four-field fixture for the REAL global-learning DAG rendering path.
 * No x/y coordinates, cluster placement rules, colors, or hand-routed links:
 * the production PlanDiagram -> blockLayout (Dagre) decides everything.
 * IDs and cross-disciplinary dependencies are deliberately explicit.
 */
export const exampleFields = [
  {
    id:"math", title:"Multivariable calculus & linear algebra",
    nodes:[
      ["vectors","Vector fields"],["partials","Partial derivatives"],["gradient","Gradient"],
      ["divergence","Divergence"],["curl","Curl"],["lineint","Line integrals"],
      ["flux","Flux integrals"],["gauss","Divergence theorem"],["stokes","Stokes theorem"],
      ["linear","Linear operators"],["eigen","Eigenvectors"],["spectral","Spectral theorem"],
    ],
    edges:[
      ["vectors","gradient"],["partials","gradient"],["vectors","divergence"],
      ["partials","divergence"],["vectors","curl"],["partials","curl"],
      ["vectors","lineint"],["vectors","flux"],["lineint","stokes"],
      ["curl","stokes"],["divergence","gauss"],["flux","gauss"],
      ["linear","eigen"],["eigen","spectral"],
    ],
  },
  {
    id:"physics",title:"Electromagnetism & quantum physics",
    nodes:[
      ["potential","Electrostatic potential"],["efield","Electric fields"],
      ["gausslaw","Gauss's law"],["bfield","Magnetic fields"],
      ["ampere","Ampere's law"],["faraday","Faraday's law"],
      ["maxwell","Maxwell equations"],["emwave","Electromagnetic waves"],
      ["qstate","Quantum states"],["hamiltonian","Hamiltonian operator"],
      ["eigenstates","Energy eigenstates"],["schrodinger","Schrodinger equation"],
    ],
    edges:[
      ["potential","efield"],["efield","gausslaw"],["bfield","ampere"],
      ["bfield","faraday"],["efield","faraday"],["ampere","maxwell"],
      ["faraday","maxwell"],["gausslaw","maxwell"],["maxwell","emwave"],
      ["qstate","hamiltonian"],["hamiltonian","eigenstates"],
      ["qstate","schrodinger"],["hamiltonian","schrodinger"],
    ],
  },
  {
    id:"stats",title:"Probability & stochastic processes",
    nodes:[
      ["rv","Random variables"],["conditional","Conditional expectation"],
      ["bayes","Bayes' rule"],["covariance","Covariance matrices"],
      ["markov","Markov chains"],["stationary","Stationary distributions"],
      ["brownian","Brownian motion"],["ito","Ito integrals"],
      ["sde","Stochastic differential equations"],["likelihood","Likelihood functions"],
      ["regression","Linear regression"],["glm","Generalized linear models"],
    ],
    edges:[
      ["rv","conditional"],["rv","covariance"],["conditional","bayes"],
      ["rv","markov"],["markov","stationary"],["rv","brownian"],
      ["brownian","ito"],["ito","sde"],["brownian","sde"],
      ["rv","likelihood"],["likelihood","regression"],["regression","glm"],
      ["covariance","regression"],
    ],
  },
  {
    id:"applied",title:"Quantitative finance & machine learning",
    nodes:[
      ["portcov","Portfolio covariance"],["markowitz","Mean-variance optimization"],
      ["factors","Factor risk models"],["options","Option payoffs"],
      ["bs","Black-Scholes PDE"],["delta","Delta hedging"],
      ["montecarlo","Monte Carlo simulation"],["stochvol","Stochastic volatility"],
      ["gd","Gradient descent"],["nn","Neural network training"],
      ["pca","Principal component analysis"],["filter","Kalman filtering"],
    ],
    edges:[
      ["portcov","markowitz"],["portcov","factors"],
      ["options","bs"],["bs","delta"],["options","montecarlo"],
      ["stochvol","montecarlo"],["gd","nn"],
      ["pca","factors"],["factors","filter"],
    ],
  },
];

/** Exactly nine cross-field prerequisite edges; other links stay local.
 * No cycles: all bridges go out of math/stats and into physics/applied. */
export const exampleBridges=[
  ["math","gradient","physics","efield"],
  ["math","divergence","physics","gausslaw"],
  ["math","curl","physics","faraday"],
  ["math","linear","physics","hamiltonian"],
  ["math","eigen","applied","pca"],
  ["math","gradient","applied","gd"],
  ["stats","covariance","applied","portcov"],
  ["stats","brownian","applied","bs"],
  ["stats","sde","applied","stochvol"],
];
const id=(field,node)=>`concept:${field}:${node}`;
const concepts=exampleFields.flatMap(field=>field.nodes.map(([key,title],n)=>({
  id:id(field.id,key),title,
  sources:[{chatId:`sample-${field.id}`,chatTitle:field.title,
    localNodeId:`${field.id}-${n}`,summary:`Synthetic fixture: ${field.title}`}],
  evidence:[],correctChecks:0,incorrectChecks:0,ungradedChecks:0,
})));
const own=exampleFields.flatMap(field=>field.edges.map(([from,to])=>({
  from:id(field.id,from),to:id(field.id,to),sessions:[`sample-${field.id}`],
})));
const shared=exampleBridges.map(([fromField,from,toField,to])=>({
  from:id(fromField,from),to:id(toField,to),sessions:["synthetic-cross-subject"],
}));
export const exampleGlobalLearningGraph={
  concepts,
  dependencies:[...own,...shared],
  conflicts:[],
  sessions:exampleFields.map(field=>({
    id:`sample-${field.id}`,title:field.title,concepts:field.nodes.length,
  })),
  unlinkedAnswers:0,
};
