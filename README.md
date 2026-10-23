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

Static site: `npx serve .` then open http://localhost:3000 to seal a file.

Tests: `npm test` (Node 20+).

## Seal format

- AES-256-GCM, key = HKDF-SHA256(publicShare ‖ receiptShare, salt, "ember-drop/v1").
- Manifest (public): version, metadata (bound as AAD), publicShare, salt, iv, sha256 of ciphertext.
- Receipt NFT commitment (25 bytes): `01` ‖ receiptShare(16) ‖ first 8 bytes of ciphertext hash.

## Plan

- [x] Client-side AES-GCM encrypt/decrypt (split key, commitment encoding)
- [ ] WizardConnect wallet connection
- [ ] CashScript contract: pay → mint receipt NFT
- [ ] Unlock from NFT commitment
- [ ] Live demo on GitHub Pages
- Stretch: ParyonUSD pricing, creator royalty on resale, BCMR metadata

## Threat model / limits

To be written. The short version: whoever holds the receipt can decrypt, and a buyer can always leak the plaintext once they have it.

## License

MIT
