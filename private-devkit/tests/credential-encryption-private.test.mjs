import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createElectronCredentialEncryption}=require('../src/subscription/electron-credential-encryption.cjs');

test('Electron main credential adapter round-trips encrypted bytes only when ready',()=>{
  let ready=false, encryption=true;
  const storage={
    isEncryptionAvailable:()=>encryption,
    encryptString:s=>Buffer.from(`cipher:${s}`),
    decryptString:b=>b.toString().replace(/^cipher:/,'')
  };
  const adapter=createElectronCredentialEncryption(storage,()=>ready);
  assert.equal(adapter.isAvailable(),false);
  assert.throws(()=>adapter.encrypt('never persisted'),/unavailable/);
  ready=true;
  const encrypted=adapter.encrypt('refresh_mock');
  assert.ok(encrypted instanceof Uint8Array);
  assert.equal(adapter.decrypt(encrypted),'refresh_mock');
  encryption=false;
  assert.equal(adapter.isAvailable(),false);
  assert.throws(()=>adapter.decrypt(encrypted),/unavailable/);
});

test('Electron credential adapter rejects incomplete implementations and nonbinary ciphertext',()=>{
  assert.throws(()=>createElectronCredentialEncryption({}),/safeStorage/);
  const good={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
  const adapter=createElectronCredentialEncryption(good);
  assert.throws(()=>adapter.decrypt('plaintext'),/encrypted bytes/);
  assert.throws(()=>adapter.encrypt({}),/UTF-8/);
});
