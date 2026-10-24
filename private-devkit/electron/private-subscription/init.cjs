/**
 * Trusted Electron boot for the optional ChatGPT subscription provider.
 * The app's original model providers and UI continue to work if the
 * official DevKit has not been installed or token sharing isn't authorized.
 *
 * All OAuth operations live in MAIN. The child sees a local broker port and
 * per-launch random capability, never an OpenAI refresh/access credential.
 */
'use strict';
const {startSubscriptionBroker}=require('./loopback-broker.cjs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createElectronSubscriptionService}=require('./electron-subscription-service.cjs');

async function startPrivateSubscription({app,shell,safeStorage,log=()=>{},createChatGPT,streamEventsExtension}={}){
  let sdkFactory=createChatGPT;
  if(!sdkFactory){
    try{
      // The official @siwc/local package is currently a source-workspace
      // dependency, not a published standalone npm package. Do not scrape
      // browser cookies or fall back to a fabricated OAuth token.
      // App builds stage an audited SDK tarball and its dependencies under
      // vendor/siwc-runtime; Electron extraResources copies it to the
      // packaged app. No implicit global/other-app OAuth credentials.
      const location=app.isPackaged
        ? path.join(process.resourcesPath,'siwc-runtime','node_modules','@siwc','local','dist','index.js')
        : path.join(process.cwd(),'vendor','siwc-runtime','node_modules','@siwc','local','dist','index.js');
      const module=await import(pathToFileURL(location).href);
      sdkFactory=module.createChatGPT;
    }catch{
      log('ChatGPT DevKit not installed: subscription sign-in disabled');
      return null;
    }
  }
  try{
    const service=createElectronSubscriptionService({app,shell,safeStorage,createChatGPT:sdkFactory,streamEventsExtension});
    const broker=await startSubscriptionBroker({service});
    return {
      service,broker,
      childEnvironment:{LH_SUBSCRIPTION_BROKER_PORT:String(broker.port),LH_SUBSCRIPTION_BROKER_SECRET:broker.secret},
      async close(){await broker.close();}
    };
  }catch{
    log('ChatGPT desktop broker could not start; subscription provider disabled');
    return null;
  }
}
module.exports={startPrivateSubscription};
