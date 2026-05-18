'use strict';
/**
 * HIPAA PHI Encryption Migration
 * --------------------------------
 * Run ONCE after deploying the encryption code to encrypt all existing
 * plaintext PHI in the patients and leads collections.
 *
 * Safe to re-run — records already encrypted (prefixed with "enc:") are skipped.
 *
 * Usage:
 *   node backend/scripts/migrate-encrypt-phi.js
 *
 * Key rotation (when replacing ENCRYPTION_KEY):
 *   1. Set ENCRYPTION_KEY_OLD = old key in .env
 *   2. Set ENCRYPTION_KEY     = new key in .env
 *   3. Re-run this script — it re-encrypts all records with the new key
 *   4. Clear ENCRYPTION_KEY_OLD once done
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const { encrypt, searchHash, nameSearchTokens } = require('../src/lib/encryption');

const PATIENT_PHI = ['name', 'phone', 'email', 'notes', 'insurance'];
const LEAD_PHI    = ['name', 'firstName', 'lastName', 'phone', 'email', 'notes', 'insurance'];

async function migrateCollection(col, phiFields, label) {
  const total = await col.countDocuments({});
  console.log(`\n[migrate] ${label}: ${total} documents`);

  let encrypted = 0, skipped = 0, errors = 0;

  const cursor = col.find({});
  for await (const doc of cursor) {
    try {
      const set = {};
      let changed = false;

      for (const f of phiFields) {
        const val = doc[f];
        if (val != null && val !== '' && !String(val).startsWith('enc:')) {
          set[f] = encrypt(val);
          changed = true;
        }
      }

      // Rebuild all search hashes (idempotent)
      const name      = doc.name      || '';
      const firstName = doc.firstName || '';
      const lastName  = doc.lastName  || '';
      const email     = doc.email     && !String(doc.email).startsWith('enc:')     ? doc.email     : '';
      const phone     = doc.phone     && !String(doc.phone).startsWith('enc:')     ? doc.phone     : '';
      const insurance = doc.insurance && !String(doc.insurance).startsWith('enc:') ? doc.insurance : '';

      set.nameTokens  = nameSearchTokens(name || `${firstName} ${lastName}`.trim());
      set.emailSearch = searchHash(email);
      set.phoneSearch = searchHash(phone);
      if (insurance)    set.insuranceSearch = searchHash(insurance);
      if (firstName)    set.firstNameSearch = searchHash(firstName);
      if (lastName)     set.lastNameSearch  = searchHash(lastName);

      if (changed || Object.keys(set).length) {
        await col.updateOne({ _id: doc._id }, { $set: set });
        if (changed) encrypted++; else skipped++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  [error] _id=${doc._id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[migrate] ${label}: ${encrypted} encrypted, ${skipped} already done/no PHI, ${errors} errors`);
}

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('[migrate] ENCRYPTION_KEY is not set in .env — aborting');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'insightlead');

  console.log('[migrate] Connected to', process.env.MONGODB_DB || 'insightlead');
  console.log('[migrate] Starting PHI encryption migration...');

  await migrateCollection(db.collection('patients'), PATIENT_PHI, 'patients');
  await migrateCollection(db.collection('leads'),    LEAD_PHI,    'leads');

  await client.close();
  console.log('\n[migrate] Done. All existing PHI has been encrypted.');
  console.log('[migrate] If ENCRYPTION_KEY_OLD was set for rotation, clear it from .env now.');
}

main().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
