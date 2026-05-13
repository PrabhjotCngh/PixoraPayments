# Location + Cashfree Credential Implementation Summary

## Scope Delivered

This implementation was completed in phases and is now functionally end-to-end:

1. Phase 1: schema foundation for location-level Cashfree credentials.
2. Phase 2: credential crypto + resolver service.
3. Phase 3: admin API contract updates for credential management.
4. Phase 4: admin UI updates for create/edit/status visibility.
5. Phase 5: runtime payment flow integration + booth config status visibility.

---

## Core Backend Changes

### Data model

- Migration `007_add_location_cashfree_credentials.sql` added:
   - `cashfree_app_id`
   - `cashfree_secret_key_encrypted`
   - `cashfree_credential_env`
   - `cashfree_credentials_updated_at`
- Added constraints for env validity and credential pair integrity.
- Existing rows remain fallback-compatible with default `.env` credentials.

### Credential security and resolution

- `backend/services/secretCrypto.js`
   - AES-256-GCM encryption/decryption for location secret values.
- `backend/services/cashfreeCredentialService.js`
   - resolves effective credentials by `location_key`
   - exposes source (`default`/`custom`)
   - supports masked app-id output
   - validates clear-vs-override payload rules

### Admin location APIs

- `backend/services/locationService.js`
   - create/update support optional credential fields
   - safe response metadata only (no raw secret)
- `backend/routes/adminLocations.js`
   - accepts optional credential fields on POST/PUT
   - supports `clear_cashfree_credentials`

### Runtime payment path

- `backend/services/orderService.js`
   - create-order resolves effective credentials per location before Cashfree API call
   - get-order status call resolves credential source by order location context
   - returns effective env + source metadata to route layer
- `backend/routes/createOrder.js`
   - response now includes `qrCode.env` and `qrCode.credential_source`
- `backend/routes/getOrder.js`
   - resolves DB order first and uses its `location_key` for status polling

### Booth config visibility

- `backend/server.js`
   - `/api/booth/info` now includes `payment_gateway` metadata:
      - `is_configured`
      - `credential_source`
      - `effective_env`
      - `masked_app_id`
- `frontend/src/booth-config.html`
   - displays read-only gateway source/env/masked app-id
   - includes settlement note for default vs custom routing

---

## Admin UI Enhancements

In `backend/bridge/admin.html`:

1. Create location form supports optional App ID/Secret/Env.
2. Locations grid shows gateway source, masked app id, and credential updated timestamp.
3. Edit flow moved from browser prompt to structured modal.
4. Clear override action supported (`clear_cashfree_credentials`).
5. Client-side validation blocks invalid combinations.

---

## Settlement and Routing Behavior

1. Default mode:
- location has no custom credentials
- uses global `.env` Cashfree credentials
- payments settle to Pixora Cashfree account

2. Custom mode:
- location has custom app id + secret (and optional env override)
- payments settle to partner/location Cashfree account

3. Polling consistency:
- order status polling uses the order's persisted `location_key`
- ensures status checks are executed with the same routing model

---

## QA Checklist

### Admin API

1. Create location with no credential fields -> `credential_source=default`.
2. Create/update with only app-id or only secret -> validation error.
3. Update with env only and no credentials -> validation error.
4. Update with `clear_cashfree_credentials=true` and no extra values -> success.
5. Update with clear flag + credential values -> validation error.

### Admin UI

1. Create location with blank credential fields -> shows `DEFAULT` in grid.
2. Edit location with custom values -> shows `CUSTOM` with masked app-id.
3. Clear custom credentials from modal -> reverts to `DEFAULT`.
4. Verify modal remains open if update fails.

### Runtime Payment

1. `/api/booth/info` returns `payment_gateway` metadata.
2. `POST /api/create-order` response includes `qrCode.env` + `qrCode.credential_source`.
3. `GET /api/get-order/:orderId` continues working and updates status.

### Security

1. Raw secret is never returned in API responses.
2. Raw secret is never displayed in admin or booth UI.
3. Storing custom secret without `CASHFREE_CREDENTIALS_MASTER_KEY` fails safely.

---

## Operational Notes

1. Run migration 007 before using the updated location APIs.
2. Set `CASHFREE_CREDENTIALS_MASTER_KEY` in environments where custom location secrets must be stored.
3. Existing locations continue to work without immediate data backfill.
