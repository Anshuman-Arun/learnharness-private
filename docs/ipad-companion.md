# iPad scratch work with a Windows PC

The companion runs on the Windows PC that runs LearnHarness. Safari on the iPad opens a separate HTTPS drawing page. Pair it with one saved scratch page using the eight-digit code shown on the PC. Strokes save to that page; the PC can capture them into the current question's evidence. Capture and answer submission remain explicit actions.

The PC can disconnect at any time, including when the companion service is unavailable. Pairing pauses desktop editing to prevent competing overwrites. Codes expire after two minutes and work once; a connection expires after eight hours. A disconnected tablet retains its local draft. Re-pair to the same page and choose **Recover local work** to merge strokes and newer deletions. Keep the tab open until it says **Saved on your PC**. Browser storage clearing/private browsing can remove recovery drafts.

## Windows HTTPS setup

Both devices need to be on a trusted LAN that allows them to reach each other. A cloud environment's localhost cannot serve as your PC's address. Keep the main LearnHarness server on loopback. Only the dedicated companion port 3214 needs to accept LAN traffic.

Use [mkcert's official Windows instructions](https://github.com/FiloSottile/mkcert#windows) (Chocolatey or Scoop), then run `mkcert -install` on the PC. In a private directory outside this checkout, generate a certificate for `localhost`, `127.0.0.1` and your PC's current LAN IP, for example:

```powershell
mkcert -cert-file tablet-cert.pem -key-file tablet-key.pem localhost 127.0.0.1 192.168.1.20
mkcert -CAROOT
```

Replace the example IP with the PC's real LAN IP. If it changes, generate a matching certificate again. Transfer **only the public `rootCA.pem`** from the reported CA directory to the iPad. Install the certificate profile, then enable full trust in Settings → General → About → Certificate Trust Settings, following [mkcert's iOS instructions](https://github.com/FiloSottile/mkcert#mobile-devices). **Never transfer `rootCA-key.pem` or the certificate's private key.** Remove the trust/profile when you stop using this local CA. Do not bypass browser certificate errors.

Use Node 26 and run `npm ci`. This prepares the pinned Excalidraw assets and the standalone companion bundle. Start LearnHarness on loopback, then in another PowerShell terminal:

```powershell
$env:LH_TABLET_TLS_CERT_FILE = 'C:\private\tablet-cert.pem'
$env:LH_TABLET_TLS_KEY_FILE = 'C:\private\tablet-key.pem'
$env:LH_TABLET_PUBLIC_URL = 'https://192.168.1.20:3214'
$env:LH_TABLET_APP_URL = 'http://127.0.0.1:3000'
npm run tablet:serve
```

Allow inbound TCP 3214 on Windows Firewall's private network profile, limited to your local subnet. Do not forward this port on your router.

The app also verifies the helper's TLS certificate on loopback. Copy the **public** mkcert `rootCA.pem` to `$env:TEMP\learnharness-tablet-user\ca.pem` (create this directory first), or set `LH_TABLET_CA_CERT_FILE` to that file **in the process running the main app**. On Unix the default directory suffix is the numeric UID. The companion generates a private control-token file in that same temporary directory; both processes must run as the same OS user. Do not share that token. For a custom directory, set `LH_TABLET_TOKEN_FILE` in both processes.

In Scratch work on the PC, choose **Pair iPad**. Open the displayed HTTPS address in Safari and enter the code. The tablet receives just that drawing page. Its service does not serve the main app, model-key APIs, sessions or arbitrary filesystem paths. Reloading Safari resumes the connection while its session token remains valid.

## Verification and limits

`npm run test:tablet` tests real certificate-verified HTTPS, single-use codes, scoped access, acknowledged replay, reconnect and desktop revocation. `tests/tablet.test.ts` tests expiry/rate limits, page isolation and offline recovery. Local Chromium interaction checks exercise pairing and drawing. Physical iPad/Apple Pencil pressure, Safari storage behavior and palm rejection require testing on your device; these have not been verified in the cloud environment.

Excalidraw supplies the drawing interface under MIT; see `third-party/excalidraw-LICENSE` and font notices. No third-party screen-sharing driver is needed. EasyCanvas or Astropad are separate options if you also want to use the iPad as a general Windows pen display.
