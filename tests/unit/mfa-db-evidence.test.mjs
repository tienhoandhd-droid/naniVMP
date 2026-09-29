import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('MFA SQL/gateway rehearsal receipt remains bound to the tested migration and matrix', async () => {
  const root = new URL('../../', import.meta.url);
  const receipt = JSON.parse(await readFile(new URL('tests/evidence/mfa-db-pg17.json', root), 'utf8'));
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.scope, 'disposable restored database only');
  assert.deepEqual(Object.keys(receipt.files).sort(), [
    'supabase/migrations/20260929160000_opt_in_mfa_guard.sql', 'tests/sql/mfa-session-guard.sql',
  ]);
  for (const [name, expected] of Object.entries(receipt.files)) {
    const actual = createHash('sha256').update(await readFile(new URL(name, root))).digest('hex');
    assert.equal(actual, expected, `${name} changed: rerun SQL and gateway rehearsals, then reseal evidence`);
  }
  assert.deepEqual(receipt.postgrest.checks.map(c => c.status), [200, 403, 403, 403, 200, 401, 403]);
  assert.deepEqual(receipt.storage.checks.map(c => c.status), [200, 400, 200]);
  assert.equal(receipt.postgrest.productionWrites, 0);
  assert.equal(receipt.storage.signedUrlsNotLogged, true);
});
