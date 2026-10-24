/**
 * Trusted Electron main process adapter to the official SIWC local DevKit.
 *
 * The official SDK currently exposes getSession/signIn/listModels and text
 * streamResponse, but it does NOT expose tool streaming. For a full learning
 * agent we require a PRIVATE, reviewed extension `streamEvents` running under
 * the same authenticated/refresh-protected callback inside that SDK.
 * Absence fails closed; OAuth tokens are never returned by any method.
 */
'use strict';
const path=require('node:path');
const {createElectronCredentialEncryption}=require('./electron-credential-encryption.cjs');
const {streamDevKitEvents}=require('./devkit-event-stream.cjs');

function createElectronSubscriptionService({app,shell,safeStorage,createChatGPT,streamEventsExtension,storageDir}={}) {
  if(!app || typeof app.isReady!=='function' || typeof app.getPath!=='function' || !shell || typeof shell.openExternal!=='function' || typeof createChatGPT!=='function')
    throw new Error('Electron app, shell and official createChatGPT factory required');
  if(!app.isReady())throw new Error('App must be ready before creating ChatGPT credential storage');
  const client=createChatGPT({
    appName:'LearnHarness Private',
    appId:'learnharness-private',
    redirectPort:0,
    storageDir:storageDir ?? path.join(app.getPath('userData'),'chatgpt'),
    credentialEncryption:createElectronCredentialEncryption(safeStorage,()=>app.isReady()),
    openBrowser:(url)=>shell.openExternal(url)
  });
  if(typeof client?.getSession!=='function' || typeof client?.signIn!=='function' || typeof client?.listModels!=='function' || typeof client?.disconnect!=='function')
    throw new Error('Invalid official DevKit client');
  async function connected() {
    const status=await client.getSession();
    if(status?.status!=='connected'||status.sharing!==true)throw new Error('ChatGPT plan token sharing is not authorized');
    return status;
  }
  function assertSafeState(state) {
    // The SDK SessionState is documented as credential-free. Still project
    // only the safe public fields rather than forwarding unknown properties.
    return {status:state?.status??'disconnected',sharing:state?.sharing===true,
      ...(typeof state?.profileLabel==='string'?{profileLabel:state.profileLabel}:{}),
      ...(state?.error?.code?{error:{code:String(state.error.code)}}:{})};
  }
  return {
    async session() {return assertSafeState(await client.getSession());},
    async signIn(options={}) {return assertSafeState(await client.signIn(options));},
    async disconnect() {await client.disconnect();return assertSafeState(await client.getSession());},
    async models() {
      await connected();
      const value=await client.listModels();
      return value.filter(m=>typeof m.slug==='string' && m.slug.length<128).map(m=>({slug:m.slug,displayName:m.displayName??m.slug}));
    },
    async infer(request,{signal}) {
      await connected();
      // Prefer the built-in, bounded adapter for our reviewed extension to
      // @siwc/local. Tests may inject a stub, but production never exposes
      // a token-getter or forwards any credentials to the Next child.
      if (!streamEventsExtension && typeof client.streamStructuredEvents !== 'function')
        throw new Error('DevKit tool-stream extension not installed');
      const extension = streamEventsExtension ?? streamDevKitEvents;
      return extension(client,request,{signal});
    },
  };
}
module.exports={createElectronSubscriptionService};
