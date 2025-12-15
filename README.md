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
- Start the app:
   - `npm start`

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

### Running the Bridge on Windows (no terminal)

- Option A — Batch launcher:
   - Use `bridge/launch-bridge.bat` to start the bridge without a terminal. It appends logs to `bridge/bridge-debug.log`.
   - Double‑click the `.bat` or place a shortcut in the Startup folder (`shell:startup`).

- Option B — Task Scheduler (auto‑start at logon/boot):
   1. Open Task Scheduler → Create Task.
   2. General: Name `PixoraBridge`, check “Run whether user is logged on or not” and “Run with highest privileges”.
   3. Triggers: Add “At log on” and/or “At startup”.
   4. Actions: Program/script `node`; Arguments `C:\path\to\PixoraPayments\bridge\bridge.js`; Start in `C:\path\to\PixoraPayments`.
   5. Settings: Enable “Allow task to be run on demand”.
   6. Test: Right‑click task → Run. Check `http://127.0.0.1:4000/health` and `bridge\bridge-debug.log`.

- Option C — NSSM (Windows Service):
   - Install NSSM and run: `nssm install PixoraBridge`
      - Path: `C:\Program Files\nodejs\node.exe`
      - Arguments: `C:\path\to\PixoraPayments\bridge\bridge.js`
      - Startup directory: `C:\path\to\PixoraPayments`
      - I/O: Redirect to `bridge\bridge-debug.log`
   - Start: `nssm start PixoraBridge`

### Bridge endpoints
- `GET /start` — Orchestrates: minimize DSLRBooth → launch Pixora → focus retries.
   - Optional query tuning: `preMinimizeDelayMs`, `postLaunchDelayMs`, `focusRetries`, `focusRetryDelayMs`.
- `GET /health` — Returns `{ ok, now, pid }` for health checks.

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
