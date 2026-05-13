const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getMasterKey() {
  const raw = process.env.CASHFREE_CREDENTIALS_MASTER_KEY || '';
  if (!raw.trim()) {
    return null;
  }

  // Derive a fixed-length 32-byte key from env text.
  return crypto.createHash('sha256').update(raw).digest();
}

function canEncryptSecrets() {
  return Boolean(getMasterKey());
}

function encryptSecret(plainText) {
  const key = getMasterKey();
  if (!key) {
    throw new Error('CASHFREE_CREDENTIALS_MASTER_KEY is required to encrypt location secrets');
  }

  if (typeof plainText !== 'string' || !plainText.trim()) {
    throw new Error('Secret value is required for encryption');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(cipherText) {
  const key = getMasterKey();
  if (!key) {
    throw new Error('CASHFREE_CREDENTIALS_MASTER_KEY is required to decrypt location secrets');
  }

  if (typeof cipherText !== 'string' || !cipherText.trim()) {
    throw new Error('Encrypted secret is required for decryption');
  }

  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivB64, tagB64, encryptedB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

module.exports = {
  canEncryptSecrets,
  encryptSecret,
  decryptSecret
};
