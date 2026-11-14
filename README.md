# MediVault — Secure Medical Imaging & Decentralized Blockchain Storage

A professional multi-page web application for secure medical image processing, AES-256-GCM encryption, IPFS decentralized storage, and Ethereum blockchain registration.

---

## Features

- **AES-256-GCM Encryption** — military-grade encryption with random IV generation
- **SHA-256 Integrity Hashing** — tamper detection for every uploaded image
- **IPFS Decentralized Storage** — via Pinata (FRA1 + NYC1 regions)
- **Blockchain Registration** — Ethereum smart contract on Ganache (local) or Sepolia (testnet)
- **MetaMask Integration** — wallet connect, network auto-switch
- **Image Preprocessing** — Gaussian noise removal, CLAHE contrast, normalization, resize, grayscale
- **Secure Retrieval & Decryption** — IPFS fetch → SHA-256 verify → AES-256-GCM decrypt
- **Role-Based Access Control** — smart contract RBAC
- **Audit Logs** — full event trail with export
- **Automated Evaluation** — `evaluate.js` measures all 6 performance tables

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (ES2022) |
| Encryption | Web Crypto API (AES-256-GCM, SHA-256) |
| Storage | Pinata IPFS API |
| Blockchain | Ethers.js v6 + Solidity (ERC-style mapping) |
| Local Network | Ganache |
| Testnet | Sepolia (Ethereum) |
| Server | Node.js HTTP |

---

## Project Structure

```
MediVault/
├── server.js                  # Static file server (port 3000)
├── deploy.js                  # Smart contract deployer (Ganache)
├── MedImageRegistry.sol       # Solidity smart contract
├── evaluate.js                # Full automated evaluation script
├── contract-config.json       # Deployed contract address + ABI
├── index.html                 # Redirect → medivault/dashboard.html
└── medivault/
    ├── shared.css             # Light theme design system
    ├── shared.js              # Shared state + all core functions
    ├── dashboard.html         # Page 1: Dashboard & stats
    ├── acquisition.html       # Page 2: Medical image upload
    ├── preprocessing.html     # Page 3: Image preprocessing
    ├── encryption.html        # Page 4: AES-256-GCM encryption
    ├── ipfs-storage.html      # Page 5: IPFS upload via Pinata
    ├── blockchain.html        # Page 6: Blockchain registration
    ├── smart-contracts.html   # Page 7: RBAC & contract management
    ├── retrieval.html         # Page 8: Secure image retrieval
    └── audit-logs.html        # Page 9: Full audit trail
```

---

## Quick Start

### Prerequisites
- Node.js v18+
- MetaMask browser extension
- Ganache (for local blockchain)

### 1. Install dependencies
```bash
npm install
```

### 2. Start Ganache
Open Ganache desktop app — ensure it runs on port **7545**

### 3. Deploy smart contract
```bash
node deploy.js
```

### 4. Start the server
```bash
node server.js
```

### 5. Open in browser
```
http://localhost:3000
```

---

## Evaluation

Run the full automated evaluation (Tables 1–6):
```bash
node evaluate.js
```

Requires Ganache running. Results saved to `evaluation_results.txt`.

---

## Supported Networks

| Network | Chain ID | Usage |
|---------|----------|-------|
| Ganache Local | 1337 | Development & evaluation |
| Sepolia Testnet | 11155111 | Public testnet |

---

## Image Dataset

Medical images used for evaluation are from the **BRISC2025** dataset (MRI brain tumors) and chest X-Ray collections. Place images in:
```
images/images/glioma/
images/images/meningioma/
images/images/no_tumor/
images/images/pituitary/
images/images/xray_real/
```

---

## License

MIT License — for academic and research use.
