import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, encodeCommitment, openWithCommitment } from '../src/seal.js';
import { findReceiptCommitment, commitmentHexFromToken } from '../src/unlockFromNft.js';

const data = new TextEncoder().encode('unlock from nft '.repeat(50));
const CAT = '3a5041b004b625c6f6db3f4cf52eb93091df9e77b6bfc90b25843ee132e33d27';
const OTHER = '11'.repeat(32);

test('empty minting NFT has no commitment', () => {
  assert.equal(commitmentHexFromToken({ nft: { capability: 'minting', commitment: '' } }), null);
  assert.equal(commitmentHexFromToken({ nft: { capability: 'minting' } }), null);
});

test('finds the receipt that matches this file and ignores the rest', async () => {
  const s = await seal(data, { name: 'doc.txt' });
  const mine = encodeCommitment(s.receiptShare, s.manifest.sha256);
  const other = await seal(data, { name: 'other.txt' });
  const theirs = encodeCommitment(other.receiptShare, other.manifest.sha256);

  const utxos = [
    { txid: 'aa'.repeat(32), vout: 0, satoshis: 2000n, token: { category: CAT, amount: 0n, nft: { capability: 'minting', commitment: '' } } },
    { txid: 'bb'.repeat(32), vout: 1, satoshis: 1000n, token: { category: OTHER, amount: 0n, nft: { capability: 'none', commitment: mine } } },
    { txid: 'cc'.repeat(32), vout: 0, satoshis: 1000n, token: { category: CAT, amount: 0n, nft: { capability: 'none', commitment: theirs } } },
    { txid: 'dd'.repeat(32), vout: 1, satoshis: 1000n, token: { category: CAT, amount: 0n, nft: { capability: 'none', commitment: mine } } },
    { txid: 'ee'.repeat(32), vout: 2, satoshis: 546n },
  ];

  const hit = findReceiptCommitment(utxos, { manifestSha256: s.manifest.sha256, category: CAT });
  assert.ok(hit);
  assert.equal(hit.commitment, mine);
  assert.equal(hit.txid, 'dd'.repeat(32));
  assert.equal(hit.vout, 1);
  assert.deepEqual(await openWithCommitment(s.manifest, s.ciphertext, hit.commitment), data);
});

test('returns null when nothing matches', async () => {
  const s = await seal(data);
  const utxos = [
    { token: { category: CAT, nft: { capability: 'minting', commitment: '01' } } },
    { token: { category: CAT, nft: { capability: 'none', commitment: '01' + 'ab'.repeat(16) + '00'.repeat(8) } } },
  ];
  assert.equal(findReceiptCommitment(utxos, { manifestSha256: s.manifest.sha256, category: CAT }), null);
});

test('prefers an immutable buyer receipt over a minting NFT with the same commitment', async () => {
  const s = await seal(data);
  const mine = encodeCommitment(s.receiptShare, s.manifest.sha256);
  const hit = findReceiptCommitment([
    { txid: 'm1', vout: 0, token: { category: CAT, nft: { capability: 'minting', commitment: mine } } },
    { txid: 'b1', vout: 1, token: { category: CAT, nft: { capability: 'none', commitment: mine } } },
  ], { manifestSha256: s.manifest.sha256 });
  assert.equal(hit.txid, 'b1');
  assert.equal(hit.capability, 'none');
});

test('requires a manifest hash', () => {
  assert.throws(() => findReceiptCommitment([], {}), /manifestSha256 required/);
});
