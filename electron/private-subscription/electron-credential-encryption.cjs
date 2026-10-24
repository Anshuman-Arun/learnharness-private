/**
 * Main-process-only Windows credential encryption adapter matching the
 * CredentialEncryption interface in OpenAI's SIWC DevKit.
 *
 * Call ONLY after app.whenReady() from Electron main. Never import this
 * module from the Next.js server, renderer, or preload script. This module
 * stores no secrets itself; the DevKit handles encrypted persistent state.
 */
function createElectronCredentialEncryption(safeStorage, appReady = () => true) {
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' ||
      typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw new Error('Trusted Electron safeStorage implementation required');
  }
  function requireAvailability() {
    if (!appReady() || !safeStorage.isEncryptionAvailable()) {
      // Fail CLOSED: no plaintext fallback, even in development.
      throw new Error('Windows credential encryption unavailable; sign-in disabled');
    }
  }
  return {
    id: 'electron-safe-storage-v1',
    isAvailable() {
      return !!appReady() && !!safeStorage.isEncryptionAvailable();
    },
    encrypt(plaintext) {
      requireAvailability();
      if (typeof plaintext !== 'string') throw new TypeError('Expected UTF-8 plaintext');
      return new Uint8Array(safeStorage.encryptString(plaintext));
    },
    decrypt(ciphertext) {
      requireAvailability();
      if (!(ciphertext instanceof Uint8Array)) throw new TypeError('Expected encrypted bytes');
      return safeStorage.decryptString(Buffer.from(ciphertext));
    }
  };
}
module.exports = {createElectronCredentialEncryption};
