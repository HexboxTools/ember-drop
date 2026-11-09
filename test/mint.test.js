import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, encodeCommitment } from '../src/seal.js';
import {
  loadReceiptMintArtifact,
  receiptCommitmentFor,
  assertMintableCommitment,
  describeMintPlan,
} from '../src/mint.js';

test('ReceiptMint artifact compiles with mint(bytes)', () => {
  const a = loadReceiptMintArtifact();
  assert.equal(a.contractName, 'ReceiptMint');
  assert.equal(a.abi[0].name, 'mint');
  assert.ok(a.bytecode.length > 100);
});

test('sealed file produces mintable 25-byte commitment', async () => {
  const { manifest, receiptShare } = await seal(new TextEncoder().encode('hi'), { name: 't.txt' });
  const c = receiptCommitmentFor(receiptShare, manifest.sha256);
  assert.equal(c, encodeCommitment(receiptShare, manifest.sha256));
  assert.equal(assertMintableCommitment(c).length, 50);
  const plan = describeMintPlan({
    priceSats: 10000,
    commitmentHex: c,
    buyerAddress: 'bitcoincash:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqfnhks603',
    sellerPkh: '00'.repeat(20),
  });
  assert.equal(plan.args.emberCommitment, c);
  assert.equal(plan.outputs[1].nftCommitment, c);
});
