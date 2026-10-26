import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, openWithCommitment, encodeCommitment } from '../src/seal.js';
import { packBundle, unpackBundle } from '../src/bundle.js';

const data = new TextEncoder().encode('bundle test payload '.repeat(50));

test('bundle round trip then unlock with commitment', async () => {
  const s = await seal(data, { name: 'x.txt' });
  const packed = packBundle(s.manifest, s.ciphertext);
  const { manifest, ciphertext } = unpackBundle(packed);
  assert.deepEqual(manifest, s.manifest);
  const c = encodeCommitment(s.receiptShare, s.manifest.sha256);
  assert.deepEqual(await openWithCommitment(manifest, ciphertext, c), data);
});
test('commitment from another file is rejected', async () => {
  const a = await seal(data), b = await seal(data);
  const c = encodeCommitment(b.receiptShare, b.manifest.sha256);
  await assert.rejects(openWithCommitment(a.manifest, a.ciphertext, c), /different file/);
});
test('commitment tolerates case and whitespace', async () => {
  const s = await seal(data);
  const c = ' ' + encodeCommitment(s.receiptShare, s.manifest.sha256).toUpperCase() + '\n';
  assert.deepEqual(await openWithCommitment(s.manifest, s.ciphertext, c), data);
});
test('rejects non-bundles and truncated bundles', async () => {
  assert.throws(() => unpackBundle(new Uint8Array([1, 2, 3])), /not an ember bundle/);
  const s = await seal(data);
  const packed = packBundle(s.manifest, s.ciphertext);
  assert.throws(() => unpackBundle(packed.subarray(0, 12)), /corrupt/);
  const bad = packed.slice(); bad[4] = 9;
  assert.throws(() => unpackBundle(bad), /unsupported/);
});
test('bundle works for an empty file', async () => {
  const s = await seal(new Uint8Array(0));
  const { manifest, ciphertext } = unpackBundle(packBundle(s.manifest, s.ciphertext));
  const c = encodeCommitment(s.receiptShare, s.manifest.sha256);
  assert.equal((await openWithCommitment(manifest, ciphertext, c)).length, 0);
});
