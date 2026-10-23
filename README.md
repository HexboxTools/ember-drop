# Ember Drop

Sell a file for BCH. The buyer gets an NFT receipt that unlocks it. No server, no accounts.

Built for BCH BLAZE 2026 (Nov 14–22). Hackathon code lands here from Nov 14; until then this repo only holds the plan.

## How it works

encrypt → pay → mint receipt → decrypt

1. The seller drops a file into a static page. It's encrypted in the browser and the ciphertext goes to IPFS or a static host.
2. The buyer connects a wallet over WizardConnect and pays in BCH on mainnet.
3. The payment mints an NFT CashToken receipt to the buyer. Its commitment carries the key share that unlocks the file.
4. Holding the NFT is the license. You can resell it, gift it, or prove you own it.

The seller can be offline the whole time.

## Run it

Static site. Once code exists: `npx serve .`

## Plan

- [ ] Client-side AES-GCM encrypt/decrypt
- [ ] WizardConnect wallet connection
- [ ] CashScript contract: pay → mint receipt NFT
- [ ] Unlock from NFT commitment
- [ ] Live demo on GitHub Pages
- Stretch: ParyonUSD pricing, creator royalty on resale, BCMR metadata

## Threat model / limits

To be written. The short version: whoever holds the receipt can decrypt, and a buyer can always leak the plaintext once they have it.

## License

MIT
