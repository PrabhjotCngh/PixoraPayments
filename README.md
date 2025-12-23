# PixoraPayments

Electron app that collects payment (via Cashfree QR) or uses a static QR, then hands control back to DSLRBooth. Includes a small Windows bridge to coordinate focus/quit behavior.

## Quick Start

- Prereqs: Install Node.js LTS and Git.
- Install deps: `npm install`
- Create `.env` in project root:
  - `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox`|`production`), `CASHFREE_API_VERSION`
  - Optional: `PHOTOBOOTH_APP_PATH` (Windows path to DSLRBooth exe)
- Run: `npm start`

## Config Highlights (`config.json`)

- `payment.usePaymentGateway`: `true` for Cashfree gateway; `false` for static QR.
- `payment.qrCodeExpiryMinutes`: minutes for QR validity (timer and failure redirect).
- `assets.staticQrImage`: path to the static QR image used when gateway is off.
- `assets.welcomeVideo`: background video for index page.
- `bridge.baseUrl`: base URL for the Windows bridge (default `https://pixora.textberry.io`).
- `window`: kiosk/fullscreen/alwaysOnTop and bring-to-front behavior.

## Screens & Behavior

- `index.html` (Welcome)
  - Tap/click to go to payment.
  - Plays a full-screen background video with audio.

- `payment.html` (Scan & Pay)
  - Gateway mode:
    - Creates order via backend and renders Cashfree UPI QR.
    - SDK mode matches server `CASHFREE_ENV` and is returned in the QR response (`env: 'sandbox'|'production'`).
    - Polls status at the configured interval (`screens.paymentStatusPollMs`). Success only if `paid` and the amount matches the selected amount.
    - Offline handling: shows a network modal on fetch/SDK errors with a Retry button to re-attempt QR generation.
    - QR Source badge: shows the origin under the device badge — e.g. `SDK (production|sandbox)`, `image_url`, `local QR`, or `static`. Positioned bottom-left in a stacked badge container for visibility.

### Paid Credit + DSLRBooth Event Sequence

- Windows client persists a "paid credit" after `payment_complete` to avoid re-paying when a session is aborted early or events arrive out of order.
- Credit TTL: default 30 minutes (1800s). Configure via environment `PIXORA_CREDIT_TTL_SEC`.
  - Example setup on Windows:
    - User-level: `setx PIXORA_CREDIT_TTL_SEC 1800`
    - .env file: `PIXORA_CREDIT_TTL_SEC=1800`
- State machine enforces ordered progression. Credit is consumed only on the `printing` milestone reached via valid transitions (e.g., from `processing`, `sharing`, or `downloading`). Out-of-order events neither advance the state nor consume credit.
- Behavior:
  - On `session_start` with valid credit, payment app launch is skipped and credit is marked pending.
  - If the session progresses to a milestone (as above), the pending credit is consumed for that session.
  - If the session ends without reaching a milestone, the credit is preserved for the next session.

### Admin Controls: Reset Credit & Launch Payment

  - On success: notifies bridge (`notifyPaymentComplete`) and quits Pixora.
  - Static mode:
    - Renders `assets.staticQrImage` and shows a highlight message.
    - Tap anywhere: notifies bridge and quits Pixora.
  - Cancel button: notifies bridge and quits Pixora.
  - Expiry timer: redirects to failure with `?reason=expired`.


### Admin Control: Set Device ID

- Rename a device remotely: POST `/admin/set_device_id` with `{ deviceId, newId }`.
- The Windows client updates `%APPDATA%/PixoraPayments/device-id.txt`, applies the new ID, and reconnects.
- Use stable, unique IDs per booth (e.g., `rest-kolkata-booth-01`). Avoid spaces and special characters.

### Installer Prompt: Configure Device ID (Windows)

- During installation, the setup prompts for a Device ID if none is already configured.
- The value is stored at `%APPDATA%/PixoraPayments/device-id.txt` and reused on subsequent installs, so you are not prompted again.
- You can also set or change the Device ID later via the Admin page (Set Device ID) or by editing the file directly.
- `success.html`
  - Shows a short countdown then notifies bridge and quits Pixora.

- `failure.html`
  - Shows failure/expired message with progress bar and countdown.
  - On countdown end: notifies bridge and quits Pixora.
  - Retry button: goes back to payment.

- `styles.css`
  - Shared styles, QR loader, overlay, and highlight message.

## Electron APIs (`preload.js` → `window.electronAPI`)

- `getConfig()`: read `config.json`.
- `getCashfreeAppId()`: read Cashfree APP ID from env.
- `getDeviceId()`: returns the stable per-machine device identifier used by the hosted bridge. Priority: `.env` `DEVICE_ID` → persisted file → hostname. The app auto-creates and persists a random UUID at `%APPDATA%/../Roaming/<AppData>/PixoraPayments/device-id.txt` (Electron `userData`) if none exists.
- `setDeviceId(newId)`: validates and persists the Device ID to the Electron `userData` path (e.g., `%APPDATA%/PixoraPayments/device-id.txt`), returning `{ success, deviceId }`.
- `getCashfreeEnv()`: read `CASHFREE_ENV` from `.env` (`sandbox`|`production`).
- `createQRCode(amount, description)`: backend call to create order.
- `checkPayment(orderId)`: backend call to check payment status.
- Backend base selection: payment API calls resolve the base via IPC (`get-backend-base`). When `USE_LOCAL_BACKEND=true`, calls go to `http://127.0.0.1:3000`; otherwise they use the hosted domain from config (`bridge.baseUrl`).
- `quitApp()`: closes the Electron app.
- `notifyPaymentComplete()`: reads `bridge.baseUrl` from config and calls `{baseUrl}?event_type=payment_complete&deviceId=<auto>`. The `deviceId` is auto-picked in the same order as `getDeviceId()` (env → persisted file → hostname).

### Backend Target Examples

Enable local backend for development:

```bash
# .env
USE_LOCAL_BACKEND=true
```

- Effect: payment APIs hit `http://127.0.0.1:3000` and the app spawns the local Express server.
- Verify: open `http://127.0.0.1:3000/health`.

Use hosted backend in production:

```bash
# .env
USE_LOCAL_BACKEND=false
```

- Effect: payment APIs hit the hosted domain from config (`bridge.baseUrl`, e.g., `https://pixora.textberry.io`).
- Verify: open `https://pixora.textberry.io/health`.

## Backend (`server.js`)

- `POST /api/create-qr`: creates Cashfree order and returns QR details. Response includes `env` (`sandbox`|`production`), `payment_session_id`, optional `image_url`, and `payment_link`.
- `GET /api/check-payment/:orderId`: returns success and amount so UI can verify.
- Webhook endpoint (optional): for signature-verified updates in production.

### Health Endpoint

- `GET /health`: diagnostics for environment and config.
  - `environment`: `sandbox` or `production`.
  - `apiBase`: Cashfree REST base URL in use (from `config.json`).
  - `appIdPresent` / `secretPresent`: whether credentials are detected in env.
  - `apiVersion`: Cashfree API version configured.

### Local Backend (dev toggle)

- Purpose: The app can spawn a local Express server (`server.js`) during development to:
  - Simulate/inspect Cashfree REST calls locally with curl-style logs.
  - Test webhooks and payment polling without relying on hosted endpoints.
  - Iterate quickly when offline or in an isolated network.
- Enable: Add `USE_LOCAL_BACKEND=true` to `.env`.
- Behavior: When enabled, Electron spawns the local server on app start; when disabled, the app uses hosted APIs at `https://pixora.textberry.io` and skips spawning.

## Bridge (`bridge/bridge.js`)

- Minimal GET `/` listener:
  - `event=session_start`: minimize DSLRBooth and launch Pixora.
  - `event=payment_complete`: restore/foreground DSLRBooth.
- Logs to `bridge-debug.log` with IST timestamps.
- `PIXORA_EXE` env can override default install path.
 
### Hosted Bridge + Local Windows Client

- Why: A hosted server cannot directly minimize/restore windows on a user PC. OS calls must run locally. The hosted bridge publishes events; the local Windows client performs actions.

- Server (hosted) responsibilities:
  - Expose WebSocket at `/bridge` and HTTP GET `/` for event ingress.
  - Track connected devices by `deviceId`; route events to the intended device.
  - Files: [bridge/bridge.js](bridge/bridge.js) now hosts both HTTP and WebSocket server.

- Client (Windows) responsibilities:
  - Connect to the hosted bridge via WebSocket.
  - Receive `session_start` / `payment_complete` and perform local window control (minimize/restore DSLRBooth, launch Pixora).
  - Files: [bridge/windows-client.js](bridge/windows-client.js).

- Client configuration (`.env` on Windows machine):
  - `BRIDGE_SERVER_URL`: e.g., `wss://pixora.textberry.io/bridge`
  - `DEVICE_ID`: any unique identifier for the machine (override). If not provided, the client generates a random UUID and persists it.
  - `DEVICE_TOKEN`: optional auth token if enabled on server
  - `PIXORA_EXE`: optional override to Pixora executable path

- Running the client on Windows:
  - Install Node.js LTS.
  - Create `.env` with the keys above.
  - Start once for test: `npm run bridge:client`
  - Auto-start: use Task Scheduler → "Run only when user is logged on" → trigger "At log on" → action `node bridge\windows-client.js` in the project folder.

- AWS EC2 setup (hosted bridge):
  - Ubuntu 22.04 or similar, security group: allow `443` (TLS) and (optional) `80` for redirect.
  - Install Node.js (LTS) and Git; clone repo to server.
  - Reverse proxy with NGINX:
    - TLS certificate via Let’s Encrypt.
    - Proxy `wss://pixora.textberry.io/bridge` and `https://pixora.textberry.io/` to Node on `localhost:4000`.
  - Process manager: use `pm2` or `systemd` to run `node bridge/bridge.js`.
  - Env (.env on server): configure domain and any token validation you add later.
  - Verify: connect a Windows client and check `/health` and server logs for `ws connect device=...`.

- Communication flow:
  - Pixora app (renderer) notifies hosted bridge via `notifyPaymentComplete()` (HTTP GET `/` with `event_type=payment_complete` and `deviceId` automatically appended).
  - Hosted bridge publishes the event over WebSocket to the matched Windows client.
  - Windows client receives the event and performs local minimize/restore/launch actions.

## Device ID

- Purpose: Route events from the hosted bridge to the correct local Windows client and surface identity in the UI.
- Generation (Electron app):
  - Order: `.env` `DEVICE_ID` → persisted file → hostname.
  - Persisted file: a random UUID is generated once and stored at Electron `userData` as `device-id.txt` (on Windows typically `%APPDATA%/PixoraPayments/device-id.txt`).
  - `window.electronAPI.getDeviceId()` returns this value; the payment UI shows a badge like “Connected as <deviceId>”.
- Generation (Windows client):
  - Order: `.env` `DEVICE_ID` → `%APPDATA%/PixoraPayments/device-id.txt` (auto-created with a random UUID if missing) → hostname.
  - The client connects to the hosted bridge with `?deviceId=<value>` so the server can target messages.
- Bridge visibility:
  - `GET /health` on the hosted bridge returns `connectedDevices` (array of currently connected device IDs) along with environment details.
  - Events received via `GET /?event_type=...&deviceId=...` are routed to that specific device; if `deviceId` is omitted they are broadcast.

### Admin Hotkey (in-app)

- On the payment screen, press `Ctrl+Shift+D` to open a modal showing the current Device ID with the option to edit and save.
- Save writes to `%APPDATA%/PixoraPayments/device-id.txt` and updates the on-screen badge.
- The modal also shows automatically on first run for a new Device ID. Clear `localStorage.deviceIdAcknowledgedFor` to see it again.

## Packaging (Windows)

- Use `electron-builder` for installers:
  - `npm i -D electron-builder`
  - Configure `build` in `package.json` and run your target script.
  - Build the installer: `npm run build:win`
  - Output under `dist/`.
  - Installer: run the generated `PixoraPayments Setup 1.0.0.exe`.
  - Bridge config: set `PHOTOBOOTH_APP_PATH` to your DSLRBooth executable (e.g., `C:\Program Files\DSLRBooth\DSLRBooth.exe`).

## Operational Tips

- Ensure `PHOTOBOOTH_APP_PATH` is set and points to a valid executable on Windows.
- Open firewall for `localhost:3000` (backend) and `localhost:4000` (bridge).
- Kiosk/always-on-top behavior is driven by `config.window`.
- Adjust `payment.qrCodeExpiryMinutes`, `screens.successDuration`, and `screens.failureDuration` to fit your booth timing.

### Dev Notes

- Electron DevTools are disabled by default to reduce noise and avoid Autofill warnings.
- Cashfree REST base URLs are configured in `config.json` (`cashfree.apiBase.production` / `cashfree.apiBase.sandbox`). The backend selects the correct one based on `CASHFREE_ENV`.
