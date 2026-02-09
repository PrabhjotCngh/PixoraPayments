# DB-Based Credit Management — Simple Guide

## 🧠 What’s a “Credit”?
- A credit = one right to print after a customer pays.
- Today, the bridge stores this in a local file. If power cuts or machine changes, the file can be lost.
- We’ll move credits to the database so they survive power cuts, can be managed from admin, and are consistent across machines.

---

## 🎯 Goals
- Skip the payment app if the customer already has a valid credit.
- Open payment app only when no valid credit exists.
- Consume (spend) a credit right after printing.
- Let admins grant, revoke, or inspect credits per booth.
- Make it safe against power cuts, late payments, and double-prints.

---

## 🗂️ Data Model (Tables)

### `credits`
- `id` (UUID)
- `booth_id` (UUID)
- `source` (enum: `payment`, `admin_grant`)
- `status` (enum: `available`, `reserved`, `consumed`, `expired`, `void`)
- `reserved_by_session_id` (nullable string)
- `reserved_expires_at` (nullable timestamp)
- `consumed_at` (nullable timestamp)
- `created_at` (timestamp)
- `expires_at` (nullable timestamp)
- `notes` (text, optional)

### `payments` (already exists via orders)
- Link each payment to a booth and order. On success, create a `credits` row.
- Useful fields: `order_id`, `payment_session_id`, `amount`, `status`, `booth_id`, `location_key`, `created_at`.

### Optional `credit_events` (audit)
- `credit_id`, `event_type` (created, reserved, consumed, expired, revoked), `at`, `by` (admin or system), `metadata`.
- Helps debug and build admin history.

---

## 🔄 Credit Status Machine
- `available` → usable right now (no reservation)
- `reserved` → held temporarily for a specific booth session (to avoid race conditions)
- `consumed` → used (printing completed)
- `expired` → time window passed, no longer usable
- `void` → invalidated by admin or refund

State changes (examples):
- payment success → `available`
- session_start claims a credit → `reserved`
- printing completes → `consumed`
- reservation times out → back to `available` (or `expired` if global expiry reached)

---

## 🚦 Session Flow (Bridge + Server)

### 1) `session_start` (customer taps Start)
- Bridge calls server: “Do I have a valid credit?”
- Server logic:
  - Find one `credits` row for this `booth_id` with `status = available`.
  - Atomically reserve it:
    - `UPDATE credits SET status='reserved', reserved_by_session_id=:sessionId, reserved_expires_at=NOW()+:shortHold WHERE id=:creditId AND status='available'`.
    - If update affected 1 row → success. Else there was a race; retry or fall back to payment.
  - If credit found → return “skip payment, proceed to print”.
  - If no credit → return “open payment app”.

### 2) Payment (no credit found)
- Bridge opens payment, server creates order.
- On Cashfree payment success (webhook/receipt): server creates `credits` row: `status='available'` for that `booth_id`.
- If the user paid late (after they left), this credit will still be there for their next `session_start`.

### 3) Printing
- Bridge notifies server: “printing now; consume the reserved credit”.
- Server atomically consumes:
  - `UPDATE credits SET status='consumed', consumed_at=NOW() WHERE id=:creditId AND status='reserved' AND reserved_by_session_id=:sessionId`.
  - If update affected 1 row → success (no double spend).

### 4) Reservation Timeout
- If printing never happens, and `reserved_expires_at` passes:
  - A cron/cleanup job flips status back to `available` (unless overall `expires_at` passed → set `expired`).

---

## 🛠️ Admin Features (Portal)
- **Grant credit**: Create `credits` row for a booth with `source='admin_grant'`, `status='available'`.
- **Revoke credit**: Set `status='void'` (cannot be used).
- **Expire credit**: Force `status='expired'`.
- **View credits**: Filter by booth, status, date range; see audit trail.
- **Bulk ops**: Grant 1 credit to all booths in a location; expire all `reserved` older than X minutes.
- **Adjust TTLs**: Change reservation hold window and overall credit expiry in settings.

---

## 🔐 Safety & Edge Cases

### Late Payments (customer pays after 30 minutes)
- We don’t grant credits until payment success. If it’s late, we still create `available` credit.
- Next `session_start` finds it and reserves it for the new session.
- If you want to prevent very late use, add a global `expires_at` (e.g., 24 hours). Admin can tune it.

### Power Cuts / App Crash
- Reservation is in DB, not in memory. On reboot, stale reservations auto-release after `reserved_expires_at`.
- The credit remains safe and cannot be double-spent.

### Double Prints / Race Conditions
- Use atomic `UPDATE ... WHERE status='available'` to reserve, and `... WHERE status='reserved'` to consume.
- If the row wasn’t updated, someone else took/consumed it → the bridge should handle “no credit” gracefully.

### Offline Mode (no internet)
- If the booth cannot reach the server: fall back to “no credit” and show payment app won’t work.
- Optional: allow a small local cache of *admin-granted* credits that sync back later (advanced feature).

### Refunds / Chargebacks
- If a payment is refunded, set linked credit to `void` (if still `available`/`reserved`). If `consumed`, require admin review.

### Multiple Prints per Payment (future)
- Add `quantity` to credits and decrement until 0 → then `consumed`. Not needed now, but easy to extend.

---

## ⏱️ TTL Strategy (Best Practices)
- Use **two windows**:
  - **Reservation hold (short)**: 5–10 minutes. Prevents double-use during a session. If session dies, it auto-releases.
  - **Global credit expiry (long)**: Optional, e.g., 24 hours. Prevents someone using a very old payment.
- Why not only 30-minute TTL? Because customers may pay later and return. With a global expiry, late payments still create a credit that can be used in the next attempt.
- Admin can tune both values from the portal.

---

## 🔌 API Endpoints (Sketch)

- `GET /api/booth/credits/check?session_id=...`
  - Reserves one available credit atomically; returns `{ hasCredit: true, creditId }` or `{ hasCredit: false }`.

- `POST /api/credits/consume`
  - Body: `{ creditId, session_id }`
  - Consumes the reserved credit atomically.

- `POST /api/admin/credits/grant`
  - Body: `{ booth_id, quantity=1, notes }` → creates credits.

- `POST /api/admin/credits/revoke`
  - Body: `{ credit_id }` → sets `void`.

- `GET /api/admin/credits?booth_id=...&status=...&from=...&to=...`
  - Lists credits and history.

- Webhook: `POST /api/payments/cashfree/webhook`
  - On success, create `available` credit linked to `booth_id`.

---

## 🖥️ Bridge Changes (Windows Client)
- Replace local file reads/writes with server calls:
  - On `session_start`: call `credits/check` and obey result.
  - On `printing`: call `credits/consume`.
- Keep current UX (lock screen to open payment, unlock on credit).
- Add retries with small backoff if network is flaky.

---

## ✅ Implementation Plan
- DB: create `credits` table + indexes on (`booth_id`, `status`).
- Backend services: add reservation/consume logic with atomic `UPDATE`.
- Webhook: on payment success → create `available` credit.
- Bridge: swap local state for API calls; keep session_id for reservation.
- Admin portal: new Credits page + actions (grant/revoke/expire).
- Cleanup job: release expired reservations and mark old credits `expired`.

---

## 🧪 Test Scenarios
- Start session with existing credit → skips payment.
- No credit → payment → webhook → new credit → next session uses it.
- Crash during reservation → credit auto-releases after hold window.
- Double print attempt → second consume fails safely.
- Admin grants credit → session uses it.
- Admin revokes before use → session doesn’t find a credit.

---

## 📓 TL;DR (Like I’m 16)
- Put credits in the database.
- When a customer starts, we check the DB.
- If a credit exists, print. If not, pay.
- After printing, mark the credit as used.
- Admins can give or remove credits.
- Power cuts won’t delete credits, and we avoid double-spending.
