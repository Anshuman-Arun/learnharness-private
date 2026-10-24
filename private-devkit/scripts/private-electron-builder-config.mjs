/**
 * Extend the private builder config with the staged noncommercial SDK.
 * Never copy OAuth credentials, and do not affect the baseline installer.
 */
export function addSiwcResources(yaml){
  if(typeof yaml!=='string')throw new Error('Expected electron-builder YAML');
  if(yaml.includes('from: vendor/siwc-runtime'))throw new Error('DevKit resource already included');
  const anchor='\nmac:\n';
  if(yaml.split(anchor).length!==2||!yaml.includes('\nextraResources:\n'))
    throw new Error('Unsupported electron-builder YAML layout; review manually');
  return yaml.replace(anchor,
    '\n  - from: vendor/siwc-runtime\n    to: siwc-runtime\n    filter:\n      - "**/*"\nmac:\n');
}
