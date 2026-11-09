/**
 * Ember Drop pay -> mint transaction builder (browser + node).
 * Builds the ReceiptMint.mint(emberCommitment) tx with CashScript's TransactionBuilder.
 * Buyer inputs take an unlocker: a SignatureTemplate (tests / local wallet) or
 * placeholderP2PKHUnlocker(addr) so a WizardConnect wallet signs them (sourceOutputs + wc info).
 */
import { Contract, TransactionBuilder } from 'cashscript';

export const RECEIPT_DUST = 1000n;

export function receiptMintContract(artifact, { priceSats, sellerPkhHex }, provider) {
  return new Contract(artifact, [BigInt(priceSats), sellerPkhHex], { provider, addressType: 'p2sh32' });
}

/** Seller P2PKH locking bytecode as cashaddr is not needed: contract checks pkh, we pass address. */
export function buildMintTx({
  contract, provider, mintUtxo, buyerUtxos, buyerUnlocker, buyerAddress, sellerAddress,
  priceSats, commitmentHex, feeSats = 1500n,
}) {
  const price = BigInt(priceSats);
  const cat = mintUtxo.token.category;
  const next = BigInt('0x' + (mintUtxo.token.nft.commitment ? littleEndianToBigHex(mintUtxo.token.nft.commitment) : '0')) + 1n;
  const nextCommit = encodeScriptNum(next);
  const buyerIn = buyerUtxos.reduce((s, u) => s + u.satoshis, 0n);
  const change = buyerIn - price - RECEIPT_DUST - BigInt(feeSats);
  if (change < 0n) throw new Error(`buyer needs ${price + RECEIPT_DUST + BigInt(feeSats)} sats, has ${buyerIn}`);

  const tb = new TransactionBuilder({ provider })
    .addInput(mintUtxo, contract.unlock.mint(commitmentHex));
  for (const u of buyerUtxos) tb.addInput(u, buyerUnlocker);
  tb.addOutput({
    to: contract.tokenAddress,
    amount: mintUtxo.satoshis,
    token: { category: cat, amount: 0n, nft: { capability: 'minting', commitment: nextCommit } },
  });
  tb.addOutput({
    to: toTokenAddress(buyerAddress),
    amount: RECEIPT_DUST,
    token: { category: cat, amount: 0n, nft: { capability: 'none', commitment: commitmentHex } },
  });
  tb.addOutput({ to: sellerAddress, amount: price });
  if (change >= 546n) tb.addOutput({ to: buyerAddress, amount: change });
  return tb;
}

// VM script-number encoding (minimal, little-endian, sign bit) for the counter commitment.
export function encodeScriptNum(n) {
  if (n === 0n) return '';
  const bytes = [];
  let v = n < 0n ? -n : n;
  while (v > 0n) { bytes.push(Number(v & 0xffn)); v >>= 8n; }
  if (bytes[bytes.length - 1] & 0x80) bytes.push(n < 0n ? 0x80 : 0);
  else if (n < 0n) bytes[bytes.length - 1] |= 0x80;
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}
function littleEndianToBigHex(hex) { return hex.match(/../g).reverse().join(''); }
function toTokenAddress(addr) {
  // Tests pass token-aware addresses directly; wallets via WizardConnect give token addresses too.
  return addr;
}

/**
 * WizardConnect sign request for the mint tx. Buyer inputs (index 1..n) are placeholders that the
 * wallet signs with its HD key at [inputIndex, pathName, addressIndex].
 */
export function wcMintSignRequest(tb, buyerInputPaths, userPrompt = 'Ember Drop: buy unlock receipt') {
  const transaction = tb.generateWcTransactionObject({ broadcast: false, userPrompt });
  const inputPaths = buyerInputPaths.map(([path, index], i) => [i + 1, path, index]);
  return { transaction, inputPaths };
}

/** Buyer receive address (index i) from a WizardConnect PathXpub; returns {addr, tokenAddr}. */
export async function addressFromXpub(xpub, index = 0, prefix = 'bchtest') {
  const L = await import('@bitauth/libauth');
  const dec = L.decodeHdPublicKey(xpub);
  if (typeof dec === 'string') throw new Error(dec);
  const child = L.deriveHdPublicNodeChild(dec.node, index);
  if (typeof child === 'string') throw new Error(child);
  const payload = L.hash160(child.publicKey);
  return {
    addr: L.encodeCashAddress({ prefix, type: L.CashAddressType.p2pkh, payload }).address,
    tokenAddr: L.encodeCashAddress({ prefix, type: L.CashAddressType.p2pkhWithTokens, payload }).address,
  };
}
