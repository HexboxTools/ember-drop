import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockNetworkProvider, SignatureTemplate, randomUtxo, randomNFT } from 'cashscript';
import { secp256k1, hash160, encodeCashAddress, CashAddressType } from '@bitauth/libauth';
import { seal } from '../src/seal.js';
import { loadReceiptMintArtifact, receiptCommitmentFor } from '../src/mint.js';
import { receiptMintContract, buildMintTx, encodeScriptNum } from '../src/mintTx.js';

const priv = (b) => Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? b : 0x11));
function wallet(b) {
  const sk = priv(b); const pk = secp256k1.derivePublicKeyCompressed(sk); const pkh = hash160(pk);
  const addr = (type) => encodeCashAddress({ prefix: 'bchtest', type, payload: pkh }).address;
  return { sk, pkh, addr: addr(CashAddressType.p2pkh), tokenAddr: addr(CashAddressType.p2pkhWithTokens) };
}

async function setup(priceSats = 10000n) {
  const provider = new MockNetworkProvider();
  const seller = wallet(1), buyer = wallet(2);
  const contract = receiptMintContract(loadReceiptMintArtifact(), { priceSats, sellerPkhHex: Buffer.from(seller.pkh).toString('hex') }, provider);
  provider.addUtxo(contract.address, randomUtxo({ satoshis: 2000n, token: randomNFT({ nft: { capability: 'minting', commitment: '' } }) }));
  provider.addUtxo(buyer.addr, randomUtxo({ satoshis: 50000n }));
  const [mintUtxo2] = await contract.getUtxos();
  const [buyerUtxo] = await provider.getUtxos(buyer.addr);
  const { manifest, receiptShare } = await seal(new TextEncoder().encode('ember'), { name: 'e.txt' });
  const commitmentHex = receiptCommitmentFor(receiptShare, manifest.sha256);
  return { provider, seller, buyer, contract, mintUtxo: mintUtxo2, buyerUtxo, commitmentHex, priceSats };
}

test('script num encoding', () => {
  assert.equal(encodeScriptNum(0n), ''); assert.equal(encodeScriptNum(1n), '01');
  assert.equal(encodeScriptNum(128n), '8000'); assert.equal(encodeScriptNum(256n), '0001');
});

test('ReceiptMint covenant accepts a valid pay->mint tx', async () => {
  const s = await setup();
  const tb = buildMintTx({
    contract: s.contract, provider: s.provider, mintUtxo: s.mintUtxo, buyerUtxos: [s.buyerUtxo],
    buyerUnlocker: new SignatureTemplate(s.buyer.sk).unlockP2PKH(), buyerAddress: s.buyer.tokenAddr,
    sellerAddress: s.seller.addr, priceSats: s.priceSats, commitmentHex: s.commitmentHex,
  });
  tb.debug();
  const hex = tb.build();
  assert.ok(hex.length > 200);
});

test('covenant rejects underpaying the seller', async () => {
  const s = await setup();
  const tb = buildMintTx({
    contract: s.contract, provider: s.provider, mintUtxo: s.mintUtxo, buyerUtxos: [s.buyerUtxo],
    buyerUnlocker: new SignatureTemplate(s.buyer.sk).unlockP2PKH(), buyerAddress: s.buyer.tokenAddr,
    sellerAddress: s.seller.addr, priceSats: s.priceSats - 1n, commitmentHex: s.commitmentHex,
  });
  assert.throws(() => tb.debug());
});

test('covenant rejects a malformed commitment', async () => {
  const s = await setup();
  const tb = buildMintTx({
    contract: s.contract, provider: s.provider, mintUtxo: s.mintUtxo, buyerUtxos: [s.buyerUtxo],
    buyerUnlocker: new SignatureTemplate(s.buyer.sk).unlockP2PKH(), buyerAddress: s.buyer.tokenAddr,
    sellerAddress: s.seller.addr, priceSats: s.priceSats, commitmentHex: '02' + s.commitmentHex.slice(2),
  });
  assert.throws(() => tb.debug());
});

test('WizardConnect sign request carries contract info + buyer input paths', async () => {
  const { placeholderP2PKHUnlocker } = await import('cashscript');
  const { wcMintSignRequest } = await import('../src/mintTx.js');
  const s = await setup();
  const tb = buildMintTx({
    contract: s.contract, provider: s.provider, mintUtxo: s.mintUtxo, buyerUtxos: [s.buyerUtxo],
    buyerUnlocker: placeholderP2PKHUnlocker(s.buyer.addr), buyerAddress: s.buyer.tokenAddr,
    sellerAddress: s.seller.addr, priceSats: s.priceSats, commitmentHex: s.commitmentHex,
  });
  const req = wcMintSignRequest(tb, [['receive', 0]]);
  assert.equal(req.transaction.sourceOutputs.length, 2);
  assert.equal(req.transaction.sourceOutputs[0].contract.abiFunction.name, 'mint');
  assert.deepEqual(req.inputPaths, [[1, 'receive', 0]]);
  assert.equal(req.transaction.transaction.outputs.length, 4);
});

test('addressFromXpub derives a token-aware chipnet address', async () => {
  const L = await import('@bitauth/libauth');
  const { addressFromXpub } = await import('../src/mintTx.js');
  const node = L.deriveHdPrivateNodeFromSeed(new Uint8Array(32).fill(7));
  const xpub = L.encodeHdPublicKey({ network: 'testnet', node: L.deriveHdPublicNode(node) }).hdPublicKey;
  const a = await addressFromXpub(xpub, 0);
  assert.match(a.addr, /^bchtest:q/); assert.match(a.tokenAddr, /^bchtest:z/);
});
