/**
 * Locate an Ember Drop v1 receipt NFT among CashToken UTXOs and read its commitment.
 * Used by unlock.html so a buyer does not have to paste the 50-hex commitment by hand.
 */
import { decodeCommitment, toHex } from './seal.js';

/** Normalize a CashScript/libauth token.nft.commitment to lowercase hex, or null if empty. */
export function commitmentHexFromToken(token) {
  const raw = token?.nft?.commitment;
  if (raw == null || raw === '') return null;
  if (raw instanceof Uint8Array) {
    if (!raw.length) return null;
    return toHex(raw);
  }
  if (typeof raw === 'string') {
    const h = raw.trim().toLowerCase().replace(/^0x/, '');
    if (!h) return null;
    if (!/^([0-9a-f]{2})*$/.test(h)) return null;
    return h;
  }
  return null;
}

/**
 * Find a receipt NFT minted for this sealed file.
 * @param {object[]} utxos CashScript-style UTXOs (token.nft.commitment, token.category)
 * @param {{ manifestSha256: string, category?: string }} opts
 * @returns {{ commitment: string, capability: string, category?: string, txid?: string, vout?: number } | null}
 */
export function findReceiptCommitment(utxos, { manifestSha256, category } = {}) {
  if (!manifestSha256) throw new Error('manifestSha256 required');
  const tag = String(manifestSha256).slice(0, 16).toLowerCase();
  const cat = category ? String(category).replace(/^0x/i, '').toLowerCase() : null;
  const hits = [];
  for (const u of utxos || []) {
    const token = u?.token;
    if (!token?.nft) continue;
    if (cat) {
      const tc = String(token.category || '').replace(/^0x/i, '').toLowerCase();
      if (tc !== cat) continue;
    }
    const hex = commitmentHexFromToken(token);
    if (!hex) continue;
    let decoded;
    try { decoded = decodeCommitment(hex); } catch { continue; }
    if (decoded.manifestTag !== tag) continue;
    hits.push({
      commitment: hex,
      capability: token.nft.capability || 'none',
      category: token.category,
      txid: u.txid,
      vout: u.vout,
    });
  }
  if (!hits.length) return null;
  // Buyer receipts are immutable (capability none); skip leftover minting NFTs if both match.
  hits.sort((a, b) => Number(a.capability !== 'none') - Number(b.capability !== 'none'));
  return hits[0];
}
