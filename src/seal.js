// Ember Drop seal: client-side file encryption (WebCrypto, works in browsers and Node >= 19).
// The content key is split: half in the public manifest, half delivered via the receipt
// NFT commitment (max 40 bytes on BCH, so a 16-byte share fits).
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => {
  if (!/^([0-9a-f]{2})*$/i.test(h)) throw new Error('bad hex');
  return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
};
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(publicShare, receiptShare, salt) {
  const ikm = new Uint8Array([...publicShare, ...receiptShare]);
  const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('ember-drop/v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Seal bytes. Returns { manifest, ciphertext, receiptShare }. receiptShare goes in the NFT commitment. */
export async function seal(plaintext, meta = {}) {
  const publicShare = rand(16), receiptShare = rand(16), salt = rand(16), iv = rand(12);
  const key = await deriveKey(publicShare, receiptShare, salt);
  const aad = enc.encode(JSON.stringify(meta));
  const ciphertext = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext));
  const digest = toHex(await subtle.digest('SHA-256', ciphertext));
  return {
    manifest: { v: 1, meta, publicShare: toHex(publicShare), salt: toHex(salt), iv: toHex(iv), sha256: digest },
    ciphertext,
    receiptShare: toHex(receiptShare),
  };
}

/** Open a sealed file given the manifest, ciphertext and the share read from the receipt NFT. */
export async function open(manifest, ciphertext, receiptShareHex) {
  if (manifest.v !== 1) throw new Error('unsupported manifest version');
  const digest = toHex(await subtle.digest('SHA-256', ciphertext));
  if (digest !== manifest.sha256) throw new Error('ciphertext hash mismatch');
  const key = await deriveKey(fromHex(manifest.publicShare), fromHex(receiptShareHex), fromHex(manifest.salt));
  const aad = enc.encode(JSON.stringify(manifest.meta));
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromHex(manifest.iv), additionalData: aad }, key, ciphertext));
}

/** NFT commitment layout (<=40 bytes): 1 byte version | 16 bytes receipt share | 8 bytes manifest hash prefix. */
export function encodeCommitment(receiptShareHex, manifestSha256Hex) {
  return '01' + receiptShareHex + manifestSha256Hex.slice(0, 16);
}
export function decodeCommitment(hex) {
  if (hex.length !== 50 || !hex.startsWith('01')) throw new Error('not an ember-drop v1 commitment');
  return { receiptShare: hex.slice(2, 34), manifestTag: hex.slice(34) };
}

/** Open using the full receipt commitment (hex). Checks that the receipt was minted for this exact file. */
export async function openWithCommitment(manifest, ciphertext, commitmentHex) {
  const { receiptShare, manifestTag } = decodeCommitment(commitmentHex.trim().toLowerCase());
  if (manifestTag !== manifest.sha256.slice(0, 16)) throw new Error('this receipt belongs to a different file');
  return open(manifest, ciphertext, receiptShare);
}
