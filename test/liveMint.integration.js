/**
 * Live chipnet integration (NOT part of `npm test`).
 * Fetches the funded ReceiptMint covenant + seller UTXOs via RelayNetworkProvider,
 * builds a pay->mint tx using the deployer as a stand-in buyer, evaluates it,
 * and refuses to broadcast.
 *
 * Run: node --test test/liveMint.integration.js
 * Requires .secrets/relay.url, relay.token, chipnet.key (gitignored). Chipnet only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { SignatureTemplate } from 'cashscript';
import { seal } from '../src/seal.js';
import { loadReceiptMintArtifact, receiptCommitmentFor } from '../src/mint.js';
import { receiptMintContract, buildMintTx, RECEIPT_DUST } from '../src/mintTx.js';
import { RelayNetworkProvider } from '../src/relayProvider.js';
import { deployerFromKey } from '../src/deploy.js';

const secretsReady = ['.secrets/relay.url', '.secrets/relay.token', '.secrets/chipnet.key', 'config.json']
  .every((p) => existsSync(p));

test('live chipnet: build a buyer mint against the funded covenant (no broadcast)', { skip: !secretsReady }, async () => {
  const cfg = JSON.parse(readFileSync('config.json', 'utf8'));
  assert.equal(cfg.network, 'chipnet');
  const provider = new RelayNetworkProvider({
    baseUrl: readFileSync('.secrets/relay.url', 'utf8').trim(),
    token: readFileSync('.secrets/relay.token', 'utf8').trim(),
  });
  const height = await provider.getBlockHeight();
  assert.ok(height > 0, `expected chipnet tip, got ${height}`);

  const deployer = deployerFromKey(Uint8Array.from(Buffer.from(readFileSync('.secrets/chipnet.key', 'utf8').trim(), 'hex')));
  assert.equal(deployer.address, cfg.sellerAddress, 'chipnet.key must be the deployed seller');
  assert.equal(deployer.pkhHex, cfg.sellerPkhHex);

  const contract = receiptMintContract(
    loadReceiptMintArtifact(),
    { priceSats: BigInt(cfg.priceSats), sellerPkhHex: cfg.sellerPkhHex },
    provider,
  );
  assert.equal(contract.tokenAddress, cfg.covenantTokenAddress);

  const covenantUtxos = await provider.getUtxos(cfg.covenantTokenAddress);
  const mintUtxo = covenantUtxos.find((u) =>
    u.token
    && u.token.category === cfg.category
    && u.token.nft?.capability === 'minting');
  assert.ok(mintUtxo, `no minting NFT at covenant; utxos=${summarize(covenantUtxos)}`);
  assert.equal(mintUtxo.satoshis, 2000n);
  assert.equal(mintUtxo.token.amount, 0n);

  const sellerUtxos = await provider.getUtxos(cfg.sellerAddress);
  const price = BigInt(cfg.priceSats);
  const fee = 1500n;
  const need = price + RECEIPT_DUST + fee;
  const buyerUtxo = sellerUtxos.find((u) => !u.token && u.satoshis >= need);
  assert.ok(buyerUtxo, `seller has no token-free UTXO >= ${need}; utxos=${summarize(sellerUtxos)}`);

  const { manifest, receiptShare } = await seal(new TextEncoder().encode('ember-live-check'), { name: 'live.txt' });
  const commitmentHex = receiptCommitmentFor(receiptShare, manifest.sha256);

  const tb = buildMintTx({
    contract,
    provider,
    mintUtxo,
    buyerUtxos: [buyerUtxo],
    buyerUnlocker: new SignatureTemplate(deployer.sk).unlockP2PKH(),
    buyerAddress: deployer.tokenAddress,
    sellerAddress: cfg.sellerAddress,
    priceSats: price,
    commitmentHex,
    feeSats: fee,
  });

  // Evaluate the covenant against the LIVE source UTXOs. Do not broadcast.
  tb.debug();
  const hex = tb.build();
  assert.ok(hex.length > 200, `built hex too short: ${hex.length}`);
  assert.equal(typeof tb.send, 'function');
  // Explicit no-send guard: this test never calls send() or sendRawTransaction.
  console.log(JSON.stringify({
    ok: true,
    broadcast: false,
    chipnetHeight: height,
    covenant: `${mintUtxo.txid}:${mintUtxo.vout}`,
    mintingCommitment: mintUtxo.token.nft.commitment || '',
    buyerIn: `${buyerUtxo.txid}:${buyerUtxo.vout} ${buyerUtxo.satoshis}sats`,
    builtHexChars: hex.length,
    category: cfg.category,
  }));
});

function summarize(utxos) {
  return JSON.stringify(utxos.map((u) => ({
    out: `${u.txid.slice(0, 8)}:${u.vout}`,
    sats: String(u.satoshis),
    token: u.token ? { category: String(u.token.category).slice(0, 12), cap: u.token.nft?.capability, c: u.token.nft?.commitment || '', amt: String(u.token.amount) } : null,
  })));
}
