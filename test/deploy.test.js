import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockNetworkProvider, SignatureTemplate, randomUtxo } from 'cashscript';
import { seal } from '../src/seal.js';
import { loadReceiptMintArtifact, receiptCommitmentFor } from '../src/mint.js';
import { receiptMintContract, buildMintTx } from '../src/mintTx.js';
import { deployerFromKey, pickGenesisUtxo, prepTx, genesisTx } from '../src/deploy.js';

const key = (b) => Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? b : 0x22));

test('genesis creates a minting NFT the covenant can then mint from', async () => {
  const provider = new MockNetworkProvider();
  const d = deployerFromKey(key(1)), buyer = deployerFromKey(key(2));
  const contract = receiptMintContract(loadReceiptMintArtifact(), { priceSats: 10000n, sellerPkhHex: d.pkhHex }, provider);
  provider.addUtxo(d.address, { ...randomUtxo({ satoshis: 20000n }), vout: 3 });
  let utxos = await provider.getUtxos(d.address);
  assert.equal(pickGenesisUtxo(utxos), null);
  const prep = prepTx({ provider, deployer: d, utxos });
  prep.debug();
  const prepHex = prep.build();
  assert.ok(prepHex.length > 100);
  // simulate the prep result as a vout-0 utxo
  provider.addUtxo(d.address, { ...randomUtxo({ satoshis: 19500n }), vout: 0 });
  const g = pickGenesisUtxo(await provider.getUtxos(d.address));
  assert.ok(pickGenesisUtxo([g]));
  const { tb, category } = genesisTx({ provider, deployer: d, genesisUtxo: g, contract });
  assert.equal(category, g.txid);
  tb.debug();
  // feed the covenant output into a real mint
  provider.addUtxo(contract.address, { ...randomUtxo({ satoshis: 2000n }), token: { category, amount: 0n, nft: { capability: 'minting', commitment: '' } } });
  provider.addUtxo(buyer.address, randomUtxo({ satoshis: 50000n }));
  const [mintUtxo] = await contract.getUtxos(); const [buyerUtxo] = await provider.getUtxos(buyer.address);
  const { manifest, receiptShare } = await seal(new TextEncoder().encode('x'), { name: 'x' });
  const mtb = buildMintTx({ contract, provider, mintUtxo, buyerUtxos: [buyerUtxo], buyerUnlocker: new SignatureTemplate(buyer.sk).unlockP2PKH(),
    buyerAddress: buyer.tokenAddress, sellerAddress: d.address, priceSats: 10000n, commitmentHex: receiptCommitmentFor(receiptShare, manifest.sha256) });
  mtb.debug();
});

test('genesis refuses non-vout-0 input', () => {
  const d = deployerFromKey(key(3)); const provider = new MockNetworkProvider();
  const contract = receiptMintContract(loadReceiptMintArtifact(), { priceSats: 10000n, sellerPkhHex: d.pkhHex }, provider);
  assert.throws(() => genesisTx({ provider, deployer: d, genesisUtxo: { txid: 'ab'.repeat(32), vout: 1, satoshis: 9000n }, contract }));
});
