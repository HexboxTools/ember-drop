/**
 * CashScript NetworkProvider that talks to the private hexbox-chipnet-relay
 * Worker over HTTPS :443 (box-reachable) instead of Electrum :50002.
 */
import { binToHex, hexToBin, isHex } from '@bitauth/libauth';
import { sha256 } from '@cashscript/utils';
import { addressToLockScript } from '../node_modules/cashscript/dist/utils.js';

function lockingBytecodeToElectrumScriptHash(lockingBytecode) {
  const scriptHash = sha256(lockingBytecode);
  scriptHash.reverse();
  return binToHex(scriptHash);
}

export class RelayNetworkProvider {
  constructor({ baseUrl, token, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl) throw new Error('RelayNetworkProvider: baseUrl required');
    if (!token) throw new Error('RelayNetworkProvider: token required');
    this.network = 'chipnet';
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async rpc(method, params = []) {
    const res = await this.fetchImpl(this.baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ method, params }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`relay ${res.status}: ${text.slice(0, 200)}`); }
    if (!res.ok || data.error) throw new Error(data.error ? String(data.error) : `relay ${res.status}: ${text.slice(0, 200)}`);
    return data.result;
  }

  async getUtxos(address) {
    return this.getUtxosForLockingBytecode(addressToLockScript(address));
  }

  async getUtxosForLockingBytecode(lockingBytecode) {
    if (typeof lockingBytecode === 'string' && !isHex(lockingBytecode)) {
      throw new Error(`Invalid locking bytecode: ${lockingBytecode} is not a valid hex string`);
    }
    const lockingBytecodeBin = typeof lockingBytecode === 'string' ? hexToBin(lockingBytecode) : lockingBytecode;
    const scriptHash = lockingBytecodeToElectrumScriptHash(lockingBytecodeBin);
    const result = await this.rpc('blockchain.scripthash.listunspent', [scriptHash, 'include_tokens']);
    return (result || []).map((utxo) => ({
      txid: utxo.tx_hash,
      vout: utxo.tx_pos,
      satoshis: BigInt(utxo.value),
      lockingBytecode: binToHex(lockingBytecodeBin),
      token: utxo.token_data ? { ...utxo.token_data, amount: BigInt(utxo.token_data.amount) } : undefined,
    }));
  }

  async getBlockHeight() {
    const tip = await this.rpc('blockchain.headers.get_tip', []);
    return tip.height;
  }

  async getRawTransaction(txid) {
    return this.rpc('blockchain.transaction.get', [txid]);
  }

  async sendRawTransaction(txHex) {
    return this.rpc('blockchain.transaction.broadcast', [txHex]);
  }
}

export function loadRelaySecrets(readFileSync, secretsDir = '.secrets') {
  const url = process.env.CHIPNET_RELAY_URL || readFileSync(`${secretsDir}/relay.url`, 'utf8').trim();
  const token = process.env.CHIPNET_RELAY_TOKEN || readFileSync(`${secretsDir}/relay.token`, 'utf8').trim();
  return { url, token };
}
