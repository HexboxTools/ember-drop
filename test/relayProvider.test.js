import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RelayNetworkProvider } from '../src/relayProvider.js';
import { authorize, parseRpcBody, ALLOWED_METHODS } from '../relay/lib.js';
import { deployerFromKey } from '../src/deploy.js';

const key = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 7 : 0x11));

test('authorize rejects missing or wrong bearer token', () => {
  assert.equal(authorize('', 'tok').ok, false);
  assert.equal(authorize('Bearer no', 'tok').status, 401);
  assert.equal(authorize('Bearer tok', 'tok').ok, true);
});

test('parseRpcBody allowlists electrum methods used for deploy', () => {
  assert.ok(ALLOWED_METHODS.has('blockchain.scripthash.listunspent'));
  assert.ok(ALLOWED_METHODS.has('blockchain.transaction.broadcast'));
  assert.equal(parseRpcBody({ method: 'server.peers.subscribe', params: [] }).ok, false);
  assert.equal(parseRpcBody({ method: 'blockchain.headers.get_tip' }).ok, true);
  assert.equal(parseRpcBody({ method: 'blockchain.headers.get_tip', params: {} }).ok, false);
});

test('getUtxos maps electrum listunspent including tokens', async () => {
  const d = deployerFromKey(key);
  let seen;
  const provider = new RelayNetworkProvider({
    baseUrl: 'https://relay.example',
    token: 'secret',
    fetchImpl: async (url, opts) => {
      seen = { url, ...JSON.parse(opts.body), auth: opts.headers.authorization };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          result: [
            { tx_hash: 'aa'.repeat(32), tx_pos: 0, value: 12500, token_data: { category: 'bb'.repeat(32), amount: '0', nft: { capability: 'minting', commitment: '' } } },
          ],
        }),
      };
    },
  });
  const utxos = await provider.getUtxos(d.address);
  assert.equal(seen.url, 'https://relay.example');
  assert.equal(seen.auth, 'Bearer secret');
  assert.equal(seen.method, 'blockchain.scripthash.listunspent');
  assert.equal(seen.params[1], 'include_tokens');
  assert.equal(utxos.length, 1);
  assert.equal(utxos[0].vout, 0);
  assert.equal(utxos[0].satoshis, 12500n);
  assert.equal(utxos[0].token.amount, 0n);
  assert.equal(utxos[0].token.nft.capability, 'minting');
});

test('getBlockHeight and sendRawTransaction pass through result', async () => {
  const calls = [];
  const provider = new RelayNetworkProvider({
    baseUrl: 'https://relay.example/',
    token: 't',
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push(body.method);
      const result = body.method === 'blockchain.headers.get_tip' ? { height: 331383 } : 'txid123';
      return { ok: true, status: 200, text: async () => JSON.stringify({ result }) };
    },
  });
  assert.equal(await provider.getBlockHeight(), 331383);
  assert.equal(await provider.sendRawTransaction('00'), 'txid123');
  assert.deepEqual(calls, ['blockchain.headers.get_tip', 'blockchain.transaction.broadcast']);
});

test('rpc surfaces relay error text', async () => {
  const provider = new RelayNetworkProvider({
    baseUrl: 'https://relay.example',
    token: 't',
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'unauthorized' }) }),
  });
  await assert.rejects(() => provider.getBlockHeight(), /unauthorized/);
});
