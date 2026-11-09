#!/usr/bin/env node
// Usage: node scripts/deploy-chipnet.mjs [--broadcast]
// 1) creates/loads a chipnet-only deployer key in .secrets/chipnet.key (gitignored)
// 2) prints the funding address (fund it from a chipnet faucet; NO mainnet funds)
// 3) with --broadcast and funds present: prep (if needed) + genesis, then fills config.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { ElectrumNetworkProvider } from 'cashscript';
import { loadReceiptMintArtifact } from '../src/mint.js';
import { receiptMintContract } from '../src/mintTx.js';
import { deployerFromKey, pickGenesisUtxo, prepTx, genesisTx } from '../src/deploy.js';
import { RelayNetworkProvider } from '../src/relayProvider.js';

function makeProvider() {
  const url = process.env.CHIPNET_RELAY_URL || (existsSync('.secrets/relay.url') ? readFileSync('.secrets/relay.url', 'utf8').trim() : '');
  const token = process.env.CHIPNET_RELAY_TOKEN || (existsSync('.secrets/relay.token') ? readFileSync('.secrets/relay.token', 'utf8').trim() : '');
  if (url && token) return new RelayNetworkProvider({ baseUrl: url, token });
  return new ElectrumNetworkProvider('chipnet');
}

const KEY = '.secrets/chipnet.key';
if (!existsSync(KEY)) { mkdirSync('.secrets', { recursive: true, mode: 0o700 }); writeFileSync(KEY, randomBytes(32).toString('hex'), { mode: 0o600 }); }
const deployer = deployerFromKey(Uint8Array.from(Buffer.from(readFileSync(KEY, 'utf8').trim(), 'hex')));
const cfg = JSON.parse(readFileSync('config.json', 'utf8'));
const provider = makeProvider();
const contract = receiptMintContract(loadReceiptMintArtifact(), { priceSats: BigInt(cfg.priceSats), sellerPkhHex: deployer.pkhHex }, provider);
console.log('deployer (fund on chipnet):', deployer.address);
console.log('covenant tokenAddress:', contract.tokenAddress);
const utxos = await provider.getUtxos(deployer.address);
console.log('deployer utxos:', utxos.map((u) => `${u.txid}:${u.vout} ${u.satoshis}`));
if (!process.argv.includes('--broadcast')) { console.log('dry run; pass --broadcast to deploy'); process.exit(0); }
let g = pickGenesisUtxo(utxos);
if (!g) {
  const prep = await prepTx({ provider, deployer, utxos }).send();
  console.log('prep txid', prep.txid);
  g = (await provider.getUtxos(deployer.address)).find((u) => u.txid === prep.txid && u.vout === 0);
}
const { tb, category } = genesisTx({ provider, deployer, genesisUtxo: g, contract });
const res = await tb.send();
console.log('genesis txid', res.txid, 'category', category);
Object.assign(cfg, { sellerPkhHex: deployer.pkhHex, sellerAddress: deployer.address, category, covenantTokenAddress: contract.tokenAddress, genesisTxid: res.txid });
writeFileSync('config.json', JSON.stringify(cfg, null, 2) + '\n');
console.log('config.json updated');
process.exit(0);
