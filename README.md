# PixoraPayments

Electron app that collects payment (via Cashfree QR) or uses a static QR, then hands control back to DSLRBooth. Includes a small Windows bridge to coordinate focus/quit behavior.

## Quick Start

- Prereqs: Install Node.js LTS and Git.
- Install deps: `npm install`
- Create `.env` in project root:
  - `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox`|`production`), `CASHFREE_API_VERSION`, `WEBHOOK_PORT`
  - Optional: `PHOTOBOOTH_APP_PATH` (Windows path to DSLRBooth exe)
- Run: `npm start`

## Config Highlights (`config.json`)

- `payment.usePaymentGateway`: `true` for Cashfree gateway; `false` for static QR.
- `payment.qrCodeExpiryMinutes`: minutes for QR validity (timer and failure redirect).
- `assets.staticQrImage`: path to the static QR image used when gateway is off.
- `assets.welcomeVideo`: background video for index page.
- `bridge.baseUrl`: base URL for the Windows bridge (default `http://127.0.0.1:4000`).
- `window`: kiosk/fullscreen/alwaysOnTop and bring-to-front behavior.

## Screens & Behavior

- `index.html` (Welcome)
  - Tap/click to go to payment.
  - Plays a full-screen background video with audio.

- `payment.html` (Scan & Pay)
  - Gateway mode:
    - Creates order via backend and renders Cashfree UPI QR.
    - Polls status every 2s. Treats as success only if `paid` and the amount matches the initially selected amount.
    - On success: notifies bridge (`notifyPaymentComplete`) and quits Pixora.
  - Static mode:
    - Renders `assets.staticQrImage` and shows a highlight message.
    - Tap anywhere: notifies bridge and quits Pixora.
  - Cancel button: notifies bridge and quits Pixora.
  - Expiry timer: redirects to failure with `?reason=expired`.

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
- `createQRCode(amount, description)`: backend call to create order.
- `checkPayment(orderId)`: backend call to check payment status.
- `quitApp()`: closes the Electron app.
- `notifyPaymentComplete()`: reads `bridge.baseUrl` from config and calls `{baseUrl}?event_type=payment_complete`.

## Backend (`server.js`)

- `POST /api/create-qr`: creates Cashfree order and returns QR details.
- `GET /api/check-payment/:orderId`: returns success and amount so UI can verify.
- Webhook endpoint (optional): for signature-verified updates in production.

## Bridge (`bridge/bridge.js`)

- Minimal GET `/` listener:
  - `event=session_start`: minimize DSLRBooth and launch Pixora.
  - `event=payment_complete`: restore/foreground DSLRBooth.
- Logs to `bridge-debug.log` with IST timestamps.
- `PIXORA_EXE` env can override default install path.

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
