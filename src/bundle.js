// Single-file container for a sealed drop, so a seller can host one static file.
// Layout: "EMBR" (4) | version (1) | manifest length u32 BE (4) | manifest JSON (UTF-8) | ciphertext
const MAGIC = [0x45, 0x4d, 0x42, 0x52];
const VERSION = 1;
const MAX_MANIFEST = 64 * 1024;

export function packBundle(manifest, ciphertext) {
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  if (json.length > MAX_MANIFEST) throw new Error('manifest too large');
  const out = new Uint8Array(9 + json.length + ciphertext.length);
  out.set(MAGIC, 0);
  out[4] = VERSION;
  new DataView(out.buffer).setUint32(5, json.length, false);
  out.set(json, 9);
  out.set(ciphertext, 9 + json.length);
  return out;
}

export function unpackBundle(bytes) {
  if (bytes.length < 9 || MAGIC.some((m, i) => bytes[i] !== m)) throw new Error('not an ember bundle');
  if (bytes[4] !== VERSION) throw new Error('unsupported bundle version');
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5, false);
  if (len > MAX_MANIFEST || 9 + len > bytes.length) throw new Error('corrupt bundle');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(9, 9 + len))); }
  catch { throw new Error('corrupt manifest'); }
  return { manifest, ciphertext: bytes.subarray(9 + len) };
}
