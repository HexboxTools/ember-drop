/**
 * Ember Drop chipnet deploy helpers: create the ReceiptMint minting-NFT category (CashTokens genesis)
 * at the covenant's token address. Genesis rule: category id = txid of the outpoint spent at input 0,
 * which must have vout == 0. If the deployer has no vout-0 UTXO, prepTx() makes one (send-to-self).
 */
import { TransactionBuilder, SignatureTemplate } from 'cashscript';
import { secp256k1, hash160, encodeCashAddress, CashAddressType } from '@bitauth/libauth';

export const COVENANT_SATS = 2000n;

export function deployerFromKey(sk, prefix = 'bchtest') {
  const pk = secp256k1.derivePublicKeyCompressed(sk);
  if (typeof pk === 'string') throw new Error(pk);
  const pkh = hash160(pk);
  const addr = (type) => encodeCashAddress({ prefix, type, payload: pkh }).address;
  return { sk, pkh, pkhHex: Buffer.from(pkh).toString('hex'), address: addr(CashAddressType.p2pkh), tokenAddress: addr(CashAddressType.p2pkhWithTokens), sig: new SignatureTemplate(sk) };
}

const plain = (u) => !u.token;

/** Pick a token-free vout-0 UTXO usable as genesis input, or null. */
export function pickGenesisUtxo(utxos, min = COVENANT_SATS + 1500n) {
  return utxos.find((u) => u.vout === 0 && plain(u) && u.satoshis >= min) ?? null;
}

/** Send-to-self consolidation so output 0 becomes a fresh vout-0 UTXO. */
export function prepTx({ provider, deployer, utxos, feeSats = 500n }) {
  const ins = utxos.filter(plain);
  const total = ins.reduce((s, u) => s + u.satoshis, 0n);
  if (total <= feeSats + COVENANT_SATS + 1500n) throw new Error(`deployer underfunded: ${total} sats`);
  const tb = new TransactionBuilder({ provider });
  for (const u of ins) tb.addInput(u, deployer.sig.unlockP2PKH());
  tb.addOutput({ to: deployer.address, amount: total - feeSats });
  return tb;
}

/** Genesis tx: mint the minting NFT (commitment '' = counter 0) into the covenant; change back. */
export function genesisTx({ provider, deployer, genesisUtxo, contract, feeSats = 600n }) {
  if (genesisUtxo.vout !== 0) throw new Error('genesis input must have vout 0');
  const category = genesisUtxo.txid;
  const change = genesisUtxo.satoshis - COVENANT_SATS - feeSats;
  if (change < 0n) throw new Error('genesis utxo too small');
  const tb = new TransactionBuilder({ provider })
    .addInput(genesisUtxo, deployer.sig.unlockP2PKH())
    .addOutput({ to: contract.tokenAddress, amount: COVENANT_SATS, token: { category, amount: 0n, nft: { capability: 'minting', commitment: '' } } });
  if (change >= 546n) tb.addOutput({ to: deployer.address, amount: change });
  return { tb, category };
}
