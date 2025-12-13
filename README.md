# PixoraPayments

Electron app for QR-based payments (Cashfree) used alongside a DSLR photobooth.

## Setup

1. Install Node.js LTS and git.
2. Clone the repo and install deps:
   - `npm install`
3. Create a `.env` (see `.env.example`).
4. Run the app:
   - `npm start`

## Environment

Create `.env` in project root:

```
CASHFREE_APP_ID=YOUR_APP_ID
CASHFREE_SECRET_KEY=YOUR_SECRET_KEY
CASHFREE_ENV=sandbox
CASHFREE_API_VERSION=2025-01-01
WEBHOOK_PORT=3000
```

## Integration with DSLR Booth

The amount and count are chosen on the selection screen. After payment succeeds, the success screen shows a short countdown and then launches the DSLR photobooth app automatically via the Electron API.

### Flow
- User opens PixoraPayments (or is navigated to it).
- User selects pack on `select.html` and pays on `payment.html`.
- On success, `success.html` counts down (configurable) and calls `electronAPI.launchPhotobooth()`.
- PixoraPayments closes after launching the photobooth.

### Launching PixoraPayments
You can start PixoraPayments without passing amount/count. If you need to pass any external data in future, use query params or CLI args, but the current flow does not require a callback URL.

# PixoraPayments

Electron app that collects payment (via Cashfree QR) before starting a DSLR photo session. Designed to run alongside DSLRBooth on the same machine.

## Project Setup

- Prereqs: Install Node.js LTS and Git.
- Clone + install:
   - `npm install`
- Environment:
   - Create `.env` in the project root (see `.env.example`):
      - `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY`: Your Cashfree credentials
      - `CASHFREE_ENV`: `sandbox` or `production`
      - `CASHFREE_API_VERSION`: e.g., `2025-01-01`
      - `WEBHOOK_PORT`: local server port (default `3000`)
      - `PHOTOBOOTH_APP_PATH`: full path to your DSLRBooth executable for relaunch after payment
      - `PHOTOBOOTH_WINDOW_TITLE`: Optional exact window title for the DSLR Booth window used to restore the running app instead of spawning a new instance (helps when the booth is already running in kiosk/fullscreen)
- Start the app:
   - `npm start`

## Allow switching apps / disable kiosk

- **Default behavior**: PixoraPayments used to run in kiosk/always-on-top mode to prevent user navigation away from the kiosk. You can disable that if you need to access other apps while Pixora is running.
- **How to disable**: Open `config.json` and set `window.kiosk` and `window.alwaysOnTop` to `false` (they are `false` by default). If you need Pixora to appear on the taskbar so it's easier to switch to, set `window.skipTaskbar` to `false`.

You can also override these at launch time using environment variables (useful when launching from other automation):

```
PIXORA_KIOSK=false
PIXORA_ALWAYS_ON_TOP=false
PIXORA_SKIPTASKBAR=false
```

Example `config.json` snippet:

```
   "window": {
      "width": 1200,
      "height": 800,
      "fullscreen": false,
      "kiosk": false,
      "alwaysOnTop": false,
      "skipTaskbar": false
   }
```

You can also press the `Esc` key while the selection screen is visible to exit kiosk/always-on-top at runtime (this calls a safe IPC that clears those flags and returns the window to normal behavior).

Bring to Foreground
- **Default**: PixoraPayments will attempt to bring itself to the front when launched. To disable, set `window.bringToFrontOnLaunch` to `false` in `config.json`.
- **Manual**: The renderer exposes `electronAPI.bringToFront()` to force the app to the front on demand.

Bridge and Focus
- If you start PixoraPayments using the `bridge/bridge.js` process, ensure `PIXORA_EXE` and `PIXORA_WINDOW_TITLE` are set so the bridge can focus the window. Bridge will attempt to minimize the DSLR app and then launch Pixora; it will also run a small PowerShell script to move the Pixora window to the foreground.

Examples (bridge environment):
```
PIXORA_EXE=C:\path\to\PixoraPayments.exe
PIXORA_WINDOW_TITLE=Pixora Payments
PHOTOBOOTH_WINDOW_TITLE=dslrbooth - Choose an effect
```

CLI option: Bring to front
- You can also tell PixoraPayments to attempt to bring itself to the front at launch using `--bring-to-front`.
- The `bridge` will pass `--bring-to-front` automatically when launching Pixora.

## Screens Overview

- `index.html` (Welcome)
   - Simple entry screen. Tap/click to continue to selection.

- `select.html` (Choose Pack)
   - User selects the photo pack (e.g., 2 photos ₹200 or 4 photos ₹300).
   - Stores `orderCount` and `orderAmount` in `localStorage`.
   - Continues to payment.

- `payment.html` (Scan & Pay)
   - Generates a Cashfree order and shows a UPI QR.
   - Falls back to a local high‑res QR if the UI component fails.
   - Polls the order status every 2 seconds via the local server.
   - On success, navigates to the success screen.
   - Includes a back arrow to return to selection.

- `success.html` (Payment Successful)
   - Shows a success message and a short countdown.
   - When the timer ends, launches DSLRBooth using `PHOTOBOOTH_APP_PATH` and then closes PixoraPayments.

- `failure.html` (Payment Failed/Expired)
   - Shows a failure message and a brief progress bar countdown.
   - Lets the user retry or return.

- `styles.css`
   - Shared styling (background, frosted container, buttons, layout, QR rendering tweaks).

## How It Works

- Backend (`server.js`):
   - Local Express server that talks to Cashfree REST APIs:
      - `POST /api/create-qr` creates an order and returns QR details.
      - `GET /api/check-payment/:orderId` returns paid status.
   - Optional webhook endpoint for production robustness.

- Frontend:
   - Selection saves amount/count; payment page reads these values and creates the order.
   - Polls payment status until success → proceeds to success screen.

- Electron (`main.js`, `preload.js`):
   - Spawns `server.js` on app start.
   - Exposes APIs to renderer: config, create QR, check payment, and launch DSLRBooth.

## Integrating with DSLRBooth

- Recommended: Use DSLRBooth Triggers → URL to call a local bridge that launches PixoraPayments only on the events you care about.
- Example bridge: see `bridge/bridge.js` (Node/Express) to launch PixoraPayments on `session_start` (optionally filtered by booth mode) and minimize DSLRBooth.
- Logging: use `bridge/bridge-logger.js` to capture all trigger events (like RequestCatcher) while you tune the integration.
- Debug logs: Pixora writes runtime debug to `debug.log` in the app root; the bridge writes `bridge-debug.log`. When things do not appear or disappear, inspect these files for timestamped events from the PowerShell scripts and launch attempts.
   - Look for markers: `MINIMIZED`, `SET_Z_ORDER_BOTTOM`, `HIDDEN`, `WINDOW_NOT_FOUND`, `RESTORED`, `LAUNCHED` in `bridge-debug.log`.
   - Check `debug.log` for `mainWindow.show`, `mainWindow.hide`, `mainWindow.focus`, `mainWindow.blur`, and the `restore-or-launch` handler results.

## Packaging (Windows)

- Use `electron-builder` to produce an installer:
   1. `npm i -D electron-builder`
   2. Add a `build` section in `package.json` (NSIS target)
   3. Run `npm run build:win` on Windows (or macOS with Wine)
- Outputs are under `dist/`.

## Tips

- Ensure outbound HTTPS to Cashfree and local port `3000` is allowed.
- Set a correct `PHOTOBOOTH_APP_PATH` so success screen can relaunch DSLRBooth.
- Tune success countdown in `config.json` (`screens.successDuration`).
