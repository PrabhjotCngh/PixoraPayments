const db = require('../database/db');
const { encryptSecret, decryptSecret, canEncryptSecrets } = require('./secretCrypto');

function normalizeEnv(value) {
  if (!value) return null;
  const env = String(value).trim().toLowerCase();
  if (env === 'sandbox' || env === 'production') return env;
  throw new Error('cashfree_credential_env must be either sandbox or production');
}

function maskAppId(appId) {
  if (!appId) return null;
  const str = String(appId);
  if (str.length <= 10) return '***';
  return `${str.slice(0, 6)}...${str.slice(-4)}`;
}

function getEnvFallbackCredentials() {
  return {
    appId: process.env.CASHFREE_APP_ID || null,
    secretKey: process.env.CASHFREE_SECRET_KEY || null,
    env: normalizeEnv(process.env.CASHFREE_ENV || 'sandbox') || 'sandbox',
    source: 'default'
  };
}

async function getLocationCredentialRow(locationKey, client = db) {
  const key = String(locationKey || '').trim().toUpperCase();
  if (!key) {
    throw new Error('locationKey is required');
  }

  const result = await client.query(
    `SELECT
      location_key,
      cashfree_app_id,
      cashfree_secret_key_encrypted,
      cashfree_credential_env,
      cashfree_credentials_updated_at
    FROM locations
    WHERE location_key = $1`,
    [key]
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

async function resolveLocationCredentials(locationKey, client = db) {
  const fallback = getEnvFallbackCredentials();
  const row = await getLocationCredentialRow(locationKey, client);

  if (!row || !row.cashfree_app_id || !row.cashfree_secret_key_encrypted) {
    return {
      source: 'default',
      isConfigured: Boolean(fallback.appId && fallback.secretKey),
      appId: fallback.appId,
      secretKey: fallback.secretKey,
      env: fallback.env,
      maskedAppId: maskAppId(fallback.appId),
      locationKey: String(locationKey || '').trim().toUpperCase(),
      hasCustomCredentials: false,
      updatedAt: null
    };
  }

  let decryptedSecret;
  try {
    decryptedSecret = decryptSecret(row.cashfree_secret_key_encrypted);
  } catch (error) {
    throw new Error(`Failed to decrypt location credentials for ${row.location_key}: ${error.message}`);
  }

  return {
    source: 'custom',
    isConfigured: true,
    appId: row.cashfree_app_id,
    secretKey: decryptedSecret,
    env: normalizeEnv(row.cashfree_credential_env) || fallback.env,
    maskedAppId: maskAppId(row.cashfree_app_id),
    locationKey: row.location_key,
    hasCustomCredentials: true,
    updatedAt: row.cashfree_credentials_updated_at || null
  };
}

function validateCredentialInput(input) {
  const appId = input.cashfree_app_id ? String(input.cashfree_app_id).trim() : null;
  const secret = input.cashfree_secret_key ? String(input.cashfree_secret_key).trim() : null;
  const env = normalizeEnv(input.cashfree_credential_env);

  if ((appId && !secret) || (!appId && secret)) {
    throw new Error('cashfree_app_id and cashfree_secret_key must be provided together');
  }

  if ((appId || secret) && !canEncryptSecrets()) {
    throw new Error('Cannot store custom Cashfree credentials: CASHFREE_CREDENTIALS_MASTER_KEY is not configured');
  }

  return {
    appId,
    secret,
    env
  };
}

function buildCredentialUpdateFields(input) {
  const { appId, secret, env } = validateCredentialInput(input);

  // Explicit clear: remove custom credentials and return to .env fallback.
  if (input.clear_cashfree_credentials === true) {
    if (appId || secret || env) {
      throw new Error('clear_cashfree_credentials cannot be combined with credential values');
    }

    return {
      cashfree_app_id: null,
      cashfree_secret_key_encrypted: null,
      cashfree_credential_env: null,
      cashfree_credentials_updated_at: new Date()
    };
  }

  if (!appId && !secret && !env) {
    return {};
  }

  if (!appId && !secret && env) {
    throw new Error('cashfree_credential_env cannot be set without custom credentials');
  }

  return {
    cashfree_app_id: appId,
    cashfree_secret_key_encrypted: secret ? encryptSecret(secret) : null,
    cashfree_credential_env: env || null,
    cashfree_credentials_updated_at: new Date()
  };
}

module.exports = {
  getEnvFallbackCredentials,
  getLocationCredentialRow,
  resolveLocationCredentials,
  buildCredentialUpdateFields,
  validateCredentialInput,
  maskAppId
};
