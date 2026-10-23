import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, encodeCommitment, decodeCommitment } from '../src/seal.js';

const data = new TextEncoder().encode('hello ember drop '.repeat(100));

test('round trip', async () => {
  const s = await seal(data, { name: 'a.txt', priceSats: 10000 });
  assert.deepEqual(await open(s.manifest, s.ciphertext, s.receiptShare), data);
});
test('wrong share fails', async () => {
  const s = await seal(data);
  await assert.rejects(open(s.manifest, s.ciphertext, '00'.repeat(16)));
});
test('tampered metadata fails', async () => {
  const s = await seal(data, { priceSats: 1 });
  await assert.rejects(open({ ...s.manifest, meta: { priceSats: 2 } }, s.ciphertext, s.receiptShare));
});
test('tampered ciphertext fails hash check', async () => {
  const s = await seal(data);
  s.ciphertext[0] ^= 1;
  await assert.rejects(open(s.manifest, s.ciphertext, s.receiptShare), /hash mismatch/);
});
test('commitment fits 40 bytes and round trips', async () => {
  const s = await seal(data);
  const c = encodeCommitment(s.receiptShare, s.manifest.sha256);
  assert.ok(c.length / 2 <= 40);
  const d = decodeCommitment(c);
  assert.equal(d.receiptShare, s.receiptShare);
  assert.equal(d.manifestTag, s.manifest.sha256.slice(0, 16));
});
