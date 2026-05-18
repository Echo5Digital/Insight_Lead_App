'use strict';
/**
 * HIPAA PHI Field-Level Encryption
 * Algorithm : AES-256-GCM (authenticated encryption)
 * Key source : ENCRYPTION_KEY env var (64 hex chars = 32 bytes)
 * Sentinel   : Encrypted values are prefixed with "enc:" so plaintext
 *              legacy records pass through transparently during/after migration.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 16;
const TAG_BYTES = 16;

function getKey(envVar) {
  const hex = process.env[envVar];
  if (!hex || hex.length !== 64) {
    throw new Error(`[encryption] ${envVar} must be a 64-character hex string. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a sentinel-prefixed base64 string: "enc:<base64(iv+ciphertext+tag)>"
 * Returns the value unchanged if it is null/undefined/empty or already encrypted.
 */
function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (String(plaintext).startsWith('enc:')) return plaintext; // already encrypted
  const key    = getKey('ENCRYPTION_KEY');
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, enc, tag]).toString('base64');
}

/**
 * Decrypt a value produced by encrypt().
 * If the value does NOT start with "enc:" it is treated as plaintext (legacy record)
 * and returned as-is, enabling zero-downtime migration.
 * Falls back to ENCRYPTION_KEY_OLD during key rotation.
 */
function decrypt(value) {
  if (value == null || value === '') return value;
  if (!String(value).startsWith('enc:')) return value; // pre-migration plaintext

  const ciphertext = value.slice(4);
  const keysToTry  = ['ENCRYPTION_KEY', 'ENCRYPTION_KEY_OLD'].filter(k => process.env[k]);

  for (const envVar of keysToTry) {
    try {
      const key      = getKey(envVar);
      const buf      = Buffer.from(ciphertext, 'base64');
      const iv       = buf.slice(0, IV_BYTES);
      const tag      = buf.slice(buf.length - TAG_BYTES);
      const data     = buf.slice(IV_BYTES, buf.length - TAG_BYTES);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(data) + decipher.final('utf8');
    } catch {
      // try next key
    }
  }
  throw new Error('[encryption] Decryption failed — check ENCRYPTION_KEY / ENCRYPTION_KEY_OLD');
}

/**
 * Deterministic HMAC-SHA256 hash for searchable fields (email, phone, insurance).
 * Uses SEARCH_HMAC_KEY (falls back to ENCRYPTION_KEY).
 * Output is consistent for the same input, enabling exact-match lookups.
 */
function searchHash(value) {
  if (!value) return '';
  const key        = process.env.SEARCH_HMAC_KEY || process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('[encryption] SEARCH_HMAC_KEY or ENCRYPTION_KEY required for search hashing');
  const normalized = String(value).toLowerCase().replace(/[\s\-().+]/g, '');
  return crypto.createHmac('sha256', key).update(normalized).digest('hex');
}

/**
 * Returns an array of per-word HMAC hashes for patient name search.
 * Stored as nameTokens: [...] in MongoDB.
 * Query: { nameTokens: { $in: [searchHash(term)] } }
 */
function nameSearchTokens(name) {
  if (!name) return [];
  return String(name)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => searchHash(word));
}

module.exports = { encrypt, decrypt, searchHash, nameSearchTokens };
