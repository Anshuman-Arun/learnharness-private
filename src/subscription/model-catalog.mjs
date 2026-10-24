/**
 * Account-scoped model discovery for the official SIWC Responses flow.
 * No hardcoded model names: authorization determines availability.
 * OAuth credentials are supplied by the official credential manager,
 * never read from localStorage, auth.json, or a browser session.
 */
const MODELS_URL = 'https://api.openai.com/v1/models';

function parseModels(body) {
  if (!body || !Array.isArray(body.models)) throw new Error('Unexpected ChatGPT model catalog response');
  const shown = body.models.filter(model =>
    model && model.visibility === 'list' && typeof model.slug === 'string' &&
    model.slug.trim() && typeof model.display_name === 'string' && model.display_name.trim());
  const seen = new Set();
  return shown.filter(model => {
    if (seen.has(model.slug)) return false;
    seen.add(model.slug);
    return true;
  }).map(model => ({id: model.slug, name: model.display_name}));
}

export async function discoverPlanModels({getAccessToken, fetchImpl = fetch, signal} = {}) {
  if (typeof getAccessToken !== 'function') throw new Error('Official OAuth token provider is required');
  const token = await getAccessToken();
  if (typeof token !== 'string' || !token) throw new Error('Sign in with ChatGPT first');
  const result = await fetchImpl(MODELS_URL, {
    method: 'GET', headers: {'Authorization': `Bearer ${token}`}, signal
  });
  if (!result.ok) throw new Error(`Unable to list ChatGPT plan models: HTTP ${result.status}`);
  return parseModels(await result.json());
}

export function selectedModelAllowed(models, id) {
  return Array.isArray(models) && models.some(model => model.id === id);
}
