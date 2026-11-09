#!/usr/bin/env node
// Request chipnet (testnet, no value) sats from https://chipnet.bch.ninja
// to the local deployer address. Never uses mainnet funds.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { deployerFromKey } from '../src/deploy.js';

const FAUCET = 'https://chipnet.bch.ninja/api';
const sats = process.argv[2] || '20000';
const KEY = '.secrets/chipnet.key';
if (!existsSync(KEY)) throw new Error('missing .secrets/chipnet.key — run deploy-chipnet.mjs first');
const deployer = deployerFromKey(Uint8Array.from(Buffer.from(readFileSync(KEY, 'utf8').trim(), 'hex')));
const address = process.argv[3] || deployer.address;

async function api(path, body) {
  const res = await fetch(`${FAUCET}/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`faucet ${path} ${res.status}: ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

function solvePow({ payload, target, expires }) {
  const tgt = BigInt(`0x${target}`);
  let nonce = 0n;
  const expireAt = expires ? Number(expires) : Date.now() + 60_000;
  while (Date.now() < expireAt) {
    const digest = createHash('sha256').update(`${payload}:${nonce}`).digest('hex');
    if (BigInt(`0x${digest}`) <= tgt) return nonce.toString();
    nonce++;
  }
  throw new Error('PoW timed out');
}

const pool = await api('pool');
console.log('faucet pool height', pool.height, 'max', pool.max, 'hashesPerSat', pool.hashesPerSat);
if (BigInt(pool.max) < BigInt(sats)) throw new Error(`faucet max ${pool.max} < requested ${sats}`);
const challenge = await api('challenge', { address, sats });
console.log('challenge obtained; solving poW…');
const nonce = solvePow(challenge);
console.log('solved nonce', nonce);
const result = await api('claim', { payload: challenge.payload, signature: challenge.signature, nonce });
console.log('claimed', { txid: result.txid, fee: result.fee, address, sats });
process.exit(0);
