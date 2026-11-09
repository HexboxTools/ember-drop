/**
 * Ember Drop pay→mint helpers (local prep for BLAZE).
 * Commitment encoding lives in seal.js; this module wires it to the ReceiptMint artifact.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { encodeCommitment, decodeCommitment } from './seal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadReceiptMintArtifact() {
  return JSON.parse(readFileSync(join(__dirname, '../contracts/ReceiptMint.json'), 'utf8'));
}

/** Build the 25-byte commitment hex (no 0x) for a sealed file. */
export function receiptCommitmentFor(receiptShareHex, manifestSha256Hex) {
  return encodeCommitment(receiptShareHex, manifestSha256Hex);
}

/** Validate a commitment before submitting it to ReceiptMint.mint(bytes). */
export function assertMintableCommitment(commitmentHex) {
  const c = commitmentHex.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(c)) throw new Error('commitment must be hex');
  if (c.length !== 50) throw new Error('commitment must be 25 bytes (50 hex chars)');
  const decoded = decodeCommitment(c);
  if (decoded.receiptShare.length !== 32) throw new Error('bad share');
  if (decoded.manifestTag.length !== 16) throw new Error('bad tag');
  return c;
}

/**
 * Outline of the on-chain mint tx (not broadcast here).
 * Requires: funded ReceiptMint UTXO with minting NFT, buyer payment UTXO(s), seller pkh.
 * WizardConnect signs buyer inputs; contract unlocks minting input via mint(emberCommitment).
 */
export function describeMintPlan({ priceSats, commitmentHex, buyerAddress, sellerPkh }) {
  const commitment = assertMintableCommitment(commitmentHex);
  return {
    contract: 'ReceiptMint',
    function: 'mint',
    args: { emberCommitment: commitment },
    priceSats,
    sellerPkh,
    outputs: [
      { role: 'covenant+mintingNFT', notes: 'value += priceSats; commitment counter++' },
      { role: 'receiptNFT', to: buyerAddress, value: 1000, nftCommitment: commitment, capability: 'none' },
      { role: 'sellerPayout', value: priceSats, p2pkh: sellerPkh },
      { role: 'buyerChange', optional: true },
    ],
  };
}
