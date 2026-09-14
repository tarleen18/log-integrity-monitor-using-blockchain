# 🔗 Blockchain-Based Log Integrity Monitor

A tamper-evident log monitoring system for cybersecurity use. Instead of storing
full logs on a blockchain (slow, expensive, and unnecessary), this system hashes
log batches into a **Merkle root** and anchors just that root on-chain. Anyone
can later re-hash the current logs and compare against the anchored root — if
even a single character changed, the hashes won't match, and the mismatch is
**cryptographically provable** because the anchored value can never be altered
or deleted.

This solves a real, well-known problem in incident response: after a breach,
attackers routinely edit or delete server logs to hide their tracks. This
system makes that tampering detectable.

---

## Architecture

```
 ┌─────────────┐     hash (SHA-256)      ┌────────────────┐
 │  Log files   │ ───────────────────►   │  Merkle Tree     │
 │ (auth.log,   │                        │  Root Hash       │
 │  app.log...) │                        └────────┬─────────┘
 └─────────────┘                                    │
                                                      ▼
                                         ┌─────────────────────┐
                                         │  Smart Contract      │
                                         │  (LogIntegrity.sol)  │
                                         │  on Ethereum testnet │
                                         └─────────┬─────────────┘
                                                      │
                          ┌───────────────────────────┴─────────────────┐
                          ▼                                             ▼
                ┌───────────────────┐                       ┌────────────────────┐
                │  Backend API       │                       │  Dashboard (HTML)   │
                │  (Express +        │ ◄──────────────────► │  Anchor / Verify /   │
                │   ethers.js)       │                       │  History view        │
                └───────────────────┘                       └────────────────────┘
```

**Key design decision:** logs never leave your server. Only a 32-byte hash goes
on-chain, so this is cheap (a few cents in gas per anchor), privacy-preserving,
and doesn't require storing sensitive log content publicly.

---

## Project Structure

```
log-integrity-monitor/
├── contracts/
│   └── LogIntegrity.sol      # Smart contract: stores Merkle roots on-chain
├── scripts/
│   └── deploy.js             # Deploys the contract to local or testnet
├── test/
│   └── LogIntegrity.test.js  # Automated contract tests
├── backend/
│   ├── merkle.js             # Builds Merkle tree from a log file
│   ├── chain.js              # ethers.js wrapper for contract calls
│   ├── server.js             # Express API (anchor, verify, list anchors)
│   └── watcher.js            # Background service: auto-anchors on a schedule
├── frontend/
│   ├── index.html            # Dashboard UI
│   ├── app.js
│   └── style.css
├── logs/
│   └── auth.log              # Sample log file for testing/demo
├── hardhat.config.js
├── .env.example
├── .gitlab-ci.yml
└── README.md
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

### 3a. Run locally (free, instant — good for development/demo)
```bash
# Terminal 1: start a local blockchain
npx hardhat node

# Terminal 2: deploy the contract to it
npm run deploy:local
# copy the printed CONTRACT_ADDRESS into your .env

# Terminal 2: start the backend
npm run backend
```
Open `frontend/index.html` in your browser (or serve it — see below).

### 3b. Run on a real public testnet (for genuine "real life" deployment)
1. Create a free RPC endpoint at [Alchemy](https://www.alchemy.com) or [Infura](https://infura.io) for **Sepolia**.
2. Get free Sepolia test ETH from a faucet (e.g. [sepoliafaucet.com](https://sepoliafaucet.com)).
3. Create a dedicated wallet (MetaMask) for this project — **never use a real wallet's private key**.
4. Fill in `.env`:
   ```
   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
   PRIVATE_KEY=<your-throwaway-wallet-private-key>
   RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
   ```
5. Deploy:
   ```bash
   npm run deploy:sepolia
   ```
6. Copy the deployed `CONTRACT_ADDRESS` into `.env`.
7. Start the backend: `npm run backend`

Your contract is now live on a public, real blockchain — anyone can verify your
anchors independently on [Sepolia Etherscan](https://sepolia.etherscan.io) using
the contract address.

### 4. Run the automated watcher (production-style, no manual clicks)
```bash
npm run watch
```
This anchors every `.log` file in `LOG_DIR` automatically every
`ANCHOR_INTERVAL_MINUTES` — this is what makes it usable in a real environment
instead of a manual demo tool. In production, run this with `pm2` or as a
`systemd` service so it survives reboots.

### 5. Run tests
```bash
npm run compile
npm test
```

---

## Demo Script (for your evaluation/viva)

1. Anchor `logs/auth.log` via the dashboard → note the Merkle root and tx hash.
2. Open the file, delete or edit one line (simulate an attacker covering tracks).
3. Click **Verify Now** → dashboard shows **"ALERT — LOG FILE HAS BEEN TAMPERED WITH"**
   with the mismatched hashes displayed side by side.
4. Show the anchor transaction on Sepolia Etherscan to prove the original hash
   was locked in before the tampering — undeniable, timestamped proof.

---

## Real-World Use Cases

- **SOC / SIEM integrity** — prove server and firewall logs weren't altered post-breach
- **Regulatory compliance** — banks, fintechs, and healthcare orgs (HIPAA/PCI-DSS)
  often must prove audit trails are tamper-free
- **Digital forensics / chain of custody** — timestamped, immutable proof for
  legal proceedings
- **Cloud providers** — offer customers verifiable proof of log integrity as a
  trust feature
- **DevOps/CI pipelines** — anchor build and deployment logs to detect
  unauthorized pipeline tampering

---

## Security Notes

- The contract restricts anchoring to a single `owner` address — in production,
  use a multisig (e.g. Gnosis Safe) instead of a single private key.
- Never commit `.env` — it's already in `.gitignore`.
- This system detects *that* tampering occurred and *when* the last valid state
  was — it does not by itself prevent an attacker with server access from
  editing logs before the next anchor runs. Shorten `ANCHOR_INTERVAL_MINUTES`
  for tighter detection windows, or anchor on every log write for critical systems.

  ### Windows application log sources

  On Windows, the dashboard lists providers from the native `Application` Event
  Log channel. Choose a provider such as `Application Error`, `Chrome`, `Edge`,
  or `.NET Runtime`, then click **Capture Application**. The selected provider's
  events are written to a separate file in `LOG_DIR`, where it becomes available
  in the normal anchor and verify selectors.

  Selected providers are persisted in `logs/.windows-event-sources.json`, and the
  watcher captures only new Windows records by remembering each channel's last
  record ID. The default firewall source remains enabled through
  `WINDOWS_EVENT_CHANNELS`.
