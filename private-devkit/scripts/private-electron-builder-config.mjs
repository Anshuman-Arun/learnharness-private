/**
 * Extend the private builder config with the staged noncommercial SDK.
 * Never copy OAuth credentials, and do not affect the baseline installer.
 */
export function addSiwcResources(yaml){
  if(typeof yaml!=='string')throw new Error('Expected electron-builder YAML');
  // Git on Windows may check out the YAML as CRLF. Work with one canonical newline style.
  const source=yaml.replace(/\r\n/g,'\n');
  if(source.includes('siwc-runtime/**/*') || source.includes('from: vendor/siwc-runtime'))throw new Error('DevKit resource already included');
  const anchor='\nmac:\n';
  if(source.split(anchor).length!==2||!source.includes('\nextraResources:\n'))
    throw new Error('Unsupported electron-builder YAML layout; review manually');
  return source.replace(anchor,
    '\n  # Copy from vendor (parent), not directly from siwc-runtime: Electron Builder\n  # strips root-level node_modules for a resource fileSet. The relative path\n  # siwc-runtime/node_modules must stay nested to retain the SDK.\n  - from: vendor\n    to: .\n    filter:\n      - "siwc-runtime/**/*"\nmac:\n');
}
