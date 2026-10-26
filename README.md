# Ember Drop

Sell a file for BCH. The buyer gets an NFT receipt that unlocks it. No server, no accounts.

Built for BCH BLAZE 2026 (Nov 14–22). The sealing library (`src/seal.js`) was written before the event as a pre-existing component; the BCH payment, contract and WizardConnect parts are built during the hackathon.

## How it works

encrypt → pay → mint receipt → decrypt

1. The seller drops a file into a static page. It's encrypted in the browser and the ciphertext goes to IPFS or a static host.
2. The buyer connects a wallet over WizardConnect and pays in BCH on mainnet.
3. The payment mints an NFT CashToken receipt to the buyer. Its commitment carries the key share that unlocks the file.
4. Holding the NFT is the license. You can resell it, gift it, or prove you own it.

The seller can be offline the whole time.

## Run it

Static site: `npx serve .` then open http://localhost:3000. Seal a file on the first page, then open the Unlock page and paste the receipt commitment to get it back.

Tests: `npm test` (Node 20+).

## Seal format

- AES-256-GCM, key = HKDF-SHA256(publicShare ‖ receiptShare, salt, "ember-drop/v1").
- Manifest (public): version, metadata (bound as AAD), publicShare, salt, iv, sha256 of ciphertext.
- Bundle (`src/bundle.js`): `EMBR` | version | manifest length | manifest JSON | ciphertext, so a seller hosts a single `.ember` file.
- Receipt NFT commitment (25 bytes): `01` ‖ receiptShare(16) ‖ first 8 bytes of ciphertext hash.

## Plan

- [x] Client-side AES-GCM encrypt/decrypt (split key, commitment encoding)
- [x] Single-file `.ember` bundle, seal and unlock pages (manual commitment paste)
- [x] Check that a receipt matches the file it unlocks
- [ ] WizardConnect wallet connection
- [ ] CashScript contract: pay → mint receipt NFT
- [ ] Unlock from NFT commitment
- [ ] Live demo on GitHub Pages
- Stretch: ParyonUSD pricing, creator royalty on resale, BCMR metadata

## Threat model / limits

- Whoever holds the receipt share can decrypt, and a buyer can always leak the plaintext once they have it. This is a license, not DRM.
- The public share and ciphertext are public. Without the receipt share the key has 128 unknown bits.
- The manifest metadata (name, size, price) is bound to the ciphertext as AAD, so editing it breaks decryption.
- Until a receipt is minted on-chain, the commitment is only as private as the seller keeps it.
- Sellers should not reuse a sealed file across different prices; each seal makes fresh shares.

## License

MIT
