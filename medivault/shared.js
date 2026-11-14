/* ═══════════════════════════════════════════════════════
   MediVault — shared.js
   Shared state, utilities, crypto, IPFS, blockchain,
   sidebar, and audit functions used across all pages.
   ═══════════════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════
//  APP STATE
// ════════════════════════════════════════
window.MediVault = {
  currentFile:          null,
  currentImageType:     'CT Scan',
  preprocessedDataUrl:  null,
  encryptionKey:        null,
  encryptionIV:         null,
  sha256Hash:           null,
  encryptedData:        null,
  ipfsCID:              null,
  ipfsUrl:              null,
  metadata:             null,
  blockchainTx:         null,
  pipelineResult:       null,
  history:              [],

  save() {
    try {
      const data = {
        currentImageType:    this.currentImageType,
        encryptionKey:       this.encryptionKey,
        encryptionIV:        this.encryptionIV,
        sha256Hash:          this.sha256Hash,
        ipfsCID:             this.ipfsCID,
        ipfsUrl:             this.ipfsUrl,
        metadata:            this.metadata,
        blockchainTx:        this.blockchainTx,
        history:             this.history,
      };
      localStorage.setItem('mv_state', JSON.stringify(data));
    } catch(e) {}
  },

  load() {
    try {
      const d = JSON.parse(localStorage.getItem('mv_state') || '{}');
      Object.assign(this, d);
    } catch(e) {}
    // Restore preprocessed dataUrl from sessionStorage
    try {
      const pu = sessionStorage.getItem('mv_preprocessedDataUrl');
      if (pu) this.preprocessedDataUrl = pu;
      const eu = sessionStorage.getItem('mv_encryptedDataB64');
      if (eu) {
        const bin = atob(eu);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        this.encryptedData = arr;
      }
    } catch(e) {}
  },

  saveSession() {
    try {
      if (this.preprocessedDataUrl)
        sessionStorage.setItem('mv_preprocessedDataUrl', this.preprocessedDataUrl);
      if (this.encryptedData) {
        let bin = '';
        this.encryptedData.forEach(b => bin += String.fromCharCode(b));
        sessionStorage.setItem('mv_encryptedDataB64', btoa(bin));
      }
    } catch(e) {}
  }
};

// ════════════════════════════════════════
//  BLOCKCHAIN STATE
// ════════════════════════════════════════
window._mvChain = {
  provider:       null,
  signer:         null,
  contractConfig: null,
  contract:       null,
  walletAddress:  null,
};

// ════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════
function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success: '[OK]', error: '[ERR]', warning: '[WARN]', info: '[INFO]' };
  el.innerHTML = `<span class="toast-label">${icons[type] || icons.info}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('fade-out'); setTimeout(() => el.remove(), 300); }, 3500);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!', 'success'));
}

function setElProgress(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = pct + '%';
}

function setStepStatus(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'step-num ' + status;
  if (status === 'done')    el.textContent = '✓';
  else if (status === 'error') el.textContent = '✗';
  else if (status === 'running') el.textContent = '…';
}

function setStepDesc(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ════════════════════════════════════════
//  PREPROCESSING (canvas-based)
// ════════════════════════════════════════
function applyGrayscale(data) {
  for (let i = 0; i < data.data.length; i += 4) {
    const g = 0.299 * data.data[i] + 0.587 * data.data[i+1] + 0.114 * data.data[i+2];
    data.data[i] = data.data[i+1] = data.data[i+2] = g;
  }
}

function applyNoiseRemoval(data, w, h) {
  const src = new Uint8ClampedArray(data.data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            sum += src[((y + dy) * w + (x + dx)) * 4 + c];
        data.data[(y * w + x) * 4 + c] = sum / 9;
      }
    }
  }
}

function applyContrastEnhancement(data) {
  let min = 255, max = 0;
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data.data[i + c];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data.data[i + c] = Math.round((data.data[i + c] - min) / range * 255);
    }
  }
}

function applyNormalize(data) {
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data.data[i + c] = Math.round(Math.pow(data.data[i + c] / 255, 0.9) * 255);
    }
  }
}

// preprocessImage — works on a canvas element by ID
// opts: { noiseRemoval, contrastEnhancement, normalize, resize, resizeSize, grayscale, workCanvasId, originalSrc }
// returns processed dataURL
async function preprocessImage(opts) {
  const {
    noiseRemoval = true,
    contrastEnhancement = true,
    normalize = true,
    resize = false,
    resizeSize = 512,
    grayscale = false,
    workCanvasId = 'work-canvas',
    originalSrc = null,
  } = opts || {};

  const wc  = document.getElementById(workCanvasId);
  const ctx = wc.getContext('2d');

  // If originalSrc provided, reload it
  if (originalSrc) {
    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        wc.width = img.naturalWidth;
        wc.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        res();
      };
      img.onerror = rej;
      img.src = originalSrc;
    });
  }

  if (resize) {
    const size = parseInt(resizeSize);
    const tmp = document.createElement('canvas');
    tmp.width = size; tmp.height = size;
    tmp.getContext('2d').drawImage(wc, 0, 0, size, size);
    wc.width = size; wc.height = size;
    ctx.drawImage(tmp, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, wc.width, wc.height);
  if (grayscale)          applyGrayscale(imageData);
  if (noiseRemoval)       applyNoiseRemoval(imageData, wc.width, wc.height);
  if (contrastEnhancement) applyContrastEnhancement(imageData);
  if (normalize)          applyNormalize(imageData);
  ctx.putImageData(imageData, 0, 0);

  return wc.toDataURL('image/png');
}

// ════════════════════════════════════════
//  ENCRYPTION (Web Crypto API)
// ════════════════════════════════════════
async function encryptData(dataUrl, opts) {
  const {
    enabled  = true,
    kdfMode  = 'random',
    password = '',
  } = opts || {};

  const binary = atob(dataUrl.split(',')[1]);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  if (!enabled) {
    return { encrypted: bytes, key: null, iv: null, encEnabled: false };
  }

  let key;
  if (kdfMode === 'pbkdf2') {
    const enc         = new TextEncoder();
    const pwd         = password || 'default-passphrase';
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveKey']);
    const salt        = crypto.getRandomValues(new Uint8Array(16));
    key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } else {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  const rawKey    = await crypto.subtle.exportKey('raw', key);
  const keyHex    = Array.from(new Uint8Array(rawKey)).map(b => b.toString(16).padStart(2,'0')).join('');
  const ivHex     = Array.from(iv).map(b => b.toString(16).padStart(2,'0')).join('');

  return {
    encrypted:  new Uint8Array(encrypted),
    key:        keyHex,
    iv:         ivHex,
    encEnabled: true,
  };
}

// ════════════════════════════════════════
//  SHA-256 HASH
// ════════════════════════════════════════
async function sha256(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ════════════════════════════════════════
//  IPFS UPLOAD
// ════════════════════════════════════════
function _ipfsStatus(msg, type) {
  const el = document.getElementById('ipfs-status-badge');
  if (!el) return;
  const colors = { info: '#1D4ED8', success: '#16A34A', error: '#DC2626', warning: '#B45309' };
  el.style.display      = 'block';
  el.style.color        = colors[type] || colors.info;
  el.style.borderColor  = colors[type] || colors.info;
  el.textContent        = msg;
}

async function uploadViaPinata(blob, filename, metadata) {
  const jwtInput = document.getElementById('pinata-jwt');
  const jwt = jwtInput ? jwtInput.value.trim() : '';
  if (!jwt) throw new Error('Pinata JWT missing!');

  _ipfsStatus('📡 Connecting to Pinata IPFS…', 'info');

  const form = new FormData();
  form.append('file', blob, filename);

  const pinataMetadata = {
    name: filename,
    keyvalues: {
      imageType:  metadata.imageType  || 'unknown',
      sha256:     metadata.hash       || '',
      timestamp:  metadata.timestamp  || new Date().toISOString(),
      encrypted:  String(metadata.encrypted),
    }
  };
  form.append('pinataMetadata', JSON.stringify(pinataMetadata));
  form.append('pinataOptions',  JSON.stringify({ cidVersion: 1 }));

  _ipfsStatus('⬆️ Uploading encrypted image to Pinata…', 'info');

  let res;
  try {
    res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method:  'POST',
      headers: { Authorization: 'Bearer ' + jwt },
      body:    form,
    });
  } catch(e) {
    throw new Error('Network error — check internet connection. ' + e.message);
  }

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch(_) {}
    if (res.status === 401) throw new Error('Pinata 401 Unauthorized — JWT expired or invalid.');
    if (res.status === 403) throw new Error('Pinata 403 Forbidden — insufficient permissions.');
    throw new Error('Pinata error ' + res.status + ': ' + errText);
  }

  const json = await res.json();
  const cid  = json.IpfsHash;

  // Also upload metadata JSON
  const metaToggle = document.getElementById('ipfs-meta');
  if (!metaToggle || metaToggle.checked) {
    try {
      const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      const metaForm = new FormData();
      metaForm.append('file', metaBlob, filename.replace('.enc','-metadata.json'));
      metaForm.append('pinataMetadata', JSON.stringify({ name: filename + '-metadata' }));
      metaForm.append('pinataOptions',  JSON.stringify({ cidVersion: 1 }));
      await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method:  'POST',
        headers: { Authorization: 'Bearer ' + jwt },
        body:    metaForm,
      });
    } catch(_) {}
  }

  _ipfsStatus('✅ Successfully pinned to IPFS via Pinata!', 'success');
  return { cid, url: 'https://gateway.pinata.cloud/ipfs/' + cid };
}

async function uploadViaWeb3Storage(blob, filename, metadata) {
  const tokenInput = document.getElementById('web3storage-token');
  const token = tokenInput ? tokenInput.value.trim() : '';
  if (!token) throw new Error('web3.storage token is required. Get one free at web3.storage/account/');

  _ipfsStatus('📡 Connecting to web3.storage…', 'info');
  _ipfsStatus('⬆️ Uploading to web3.storage…', 'info');

  const res = await fetch('https://api.web3.storage/upload', {
    method:  'POST',
    headers: { Authorization: 'Bearer ' + token, 'X-NAME': encodeURIComponent(filename) },
    body:    blob,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('web3.storage error ' + res.status + ': ' + err);
  }

  const json = await res.json();
  const cid  = json.cid;
  _ipfsStatus('✅ Stored on web3.storage!', 'success');
  return { cid, url: 'https://' + cid + '.ipfs.w3s.link' };
}

async function uploadViaLocalNode(blob, filename) {
  _ipfsStatus('📡 Connecting to local IPFS node…', 'info');

  const form = new FormData();
  form.append('file', blob, filename);

  const res = await fetch('http://localhost:5001/api/v0/add?cid-version=1&hash=sha2-256', {
    method: 'POST',
    body:   form,
  });

  if (!res.ok) throw new Error('Local IPFS node error ' + res.status + '. Is your daemon running?');

  const text = await res.text();
  const json = JSON.parse(text.trim().split('\n').pop());
  const cid  = json.Hash;
  _ipfsStatus('✅ Added to local node!', 'success');
  return { cid, url: 'http://localhost:8080/ipfs/' + cid };
}

async function uploadToIPFS(encryptedData, metadata) {
  const providerEl = document.getElementById('ipfs-provider');
  const provider   = providerEl ? providerEl.value : 'pinata';
  const filename   = 'medimage-' + Date.now() + '.enc';
  const blob       = new Blob([encryptedData], { type: 'application/octet-stream' });

  switch (provider) {
    case 'pinata':       return uploadViaPinata(blob, filename, metadata);
    case 'web3storage':  return uploadViaWeb3Storage(blob, filename, metadata);
    case 'local':        return uploadViaLocalNode(blob, filename);
    default: throw new Error('Unknown IPFS provider: ' + provider);
  }
}

// ════════════════════════════════════════
//  QR CODE
// ════════════════════════════════════════
function drawSimpleQR(text, containerId) {
  const container = document.getElementById(containerId);
  if (!container || typeof QRCode === 'undefined') return;
  container.innerHTML = '';
  new QRCode(container, {
    text,
    width:        160,
    height:       160,
    colorDark:    '#1E293B',
    colorLight:   '#ffffff',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ════════════════════════════════════════
//  BLOCKCHAIN / METAMASK
// ════════════════════════════════════════
// ── Embedded contract config (works on Netlify / any static host) ──
const _EMBEDDED_CONFIG = {
  "contractAddress": "0x482091b73484C94F7cC2Db30fA8Fa8c30801FE41",
  "rpcUrl": "http://127.0.0.1:7545",
  "chainId": 1337,
  "networkPort": 7545,
  "deployedAt": "2026-11-13T11:36:46.998Z",
  "txHash": "0x7b16d9332805ace3094e0116787a229d697dadc6d7e5d60847e131f4cdf5ac57",
  "abi": [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"recordId","type":"uint256"},{"indexed":true,"internalType":"address","name":"uploader","type":"address"},{"indexed":false,"internalType":"string","name":"cid","type":"string"},{"indexed":false,"internalType":"string","name":"imageType","type":"string"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"ImageStored","type":"event"},{"inputs":[],"name":"getMyRecords","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_id","type":"uint256"}],"name":"getRecord","outputs":[{"internalType":"string","name":"cid","type":"string"},{"internalType":"string","name":"sha256Hash","type":"string"},{"internalType":"string","name":"imageType","type":"string"},{"internalType":"string","name":"filename","type":"string"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"address","name":"uploader","type":"address"},{"internalType":"bool","name":"encrypted","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"ownerRecords","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"records","outputs":[{"internalType":"string","name":"cid","type":"string"},{"internalType":"string","name":"sha256Hash","type":"string"},{"internalType":"string","name":"imageType","type":"string"},{"internalType":"string","name":"filename","type":"string"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"address","name":"uploader","type":"address"},{"internalType":"bool","name":"encrypted","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"string","name":"_cid","type":"string"},{"internalType":"string","name":"_sha256Hash","type":"string"},{"internalType":"string","name":"_imageType","type":"string"},{"internalType":"string","name":"_filename","type":"string"},{"internalType":"bool","name":"_encrypted","type":"bool"}],"name":"storeImage","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"totalRecords","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]
};

// ── Load env config from server /api/env (local) ─────────────────
let _ENV_CONFIG = null;
async function loadEnvConfig() {
  if (_ENV_CONFIG) return _ENV_CONFIG;
  try {
    const r = await fetch('/api/env', { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      _ENV_CONFIG = await r.json();
      // Update Pinata JWT from env
      if (_ENV_CONFIG.PINATA_JWT) {
        const jwtInput = document.getElementById('pinata-jwt');
        if (jwtInput && !jwtInput.value) jwtInput.value = _ENV_CONFIG.PINATA_JWT;
      }
      // Update NETWORKS Sepolia RPC from env
      if (_ENV_CONFIG.SEPOLIA_RPC_URL && typeof NETWORKS !== 'undefined') {
        NETWORKS.sepolia.rpcUrl = _ENV_CONFIG.SEPOLIA_RPC_URL;
      }
      return _ENV_CONFIG;
    }
  } catch(_) {}
  return null;
}

async function loadContractConfig() {
  // 1. Try local server API first (works when running locally with node server.js)
  try {
    const res = await fetch('/api/config', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && cfg.contractAddress && cfg.contractAddress !== '') return cfg;
    }
  } catch(_) {}

  // 2. Try loading contract-config.json as a static file (works on Netlify)
  try {
    const res = await fetch('/contract-config.json', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg && cfg.contractAddress && cfg.contractAddress !== '') return cfg;
    }
  } catch(_) {}

  // 3. Fallback: use embedded config (always works, no server needed)
  console.log('[MediVault] Using embedded contract config (static deployment)');
  return _EMBEDDED_CONFIG;
}

function _updateWalletUI(connected, address, ethBal) {
  // topbar wallet pill
  const bar  = document.getElementById('wallet-status-bar');
  if (!bar) return;
  if (connected) {
    bar.innerHTML = `
      <div class="wallet-pill">
        <span class="wallet-dot connected"></span>
        <span>${address.slice(0,6)}…${address.slice(-4)}</span>
        <span style="color:#64748B;">|</span>
        <span style="color:#16A34A;">${parseFloat(ethBal).toFixed(4)} ETH</span>
      </div>`;
  } else {
    bar.innerHTML = `
      <div class="wallet-pill">
        <span class="wallet-dot"></span>
        <span>Not Connected</span>
      </div>`;
  }
  // sidebar dots
  const bcDot = document.getElementById('conn-blockchain');
  if (bcDot) bcDot.classList.toggle('connected', connected);
}

async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    toast('MetaMask not found. Install the MetaMask extension.', 'error');
    return false;
  }
  try {
    // Request accounts — this triggers MetaMask popup
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    const ch         = window._mvChain;
    ch.provider      = new ethers.BrowserProvider(window.ethereum);
    ch.signer        = await ch.provider.getSigner();
    ch.walletAddress = await ch.signer.getAddress();

    const network = await ch.provider.getNetwork();
    const balance = await ch.provider.getBalance(ch.walletAddress);
    _updateWalletUI(true, ch.walletAddress, ethers.formatEther(balance));

    ch.contractConfig = await loadContractConfig();
    if (ch.contractConfig) {
      ch.contract = new ethers.Contract(
        ch.contractConfig.contractAddress,
        ch.contractConfig.abi,
        ch.signer
      );
      toast('Wallet connected! Chain: ' + network.chainId.toString(), 'success');
      addAuditLog('WALLET_CONNECT', ch.walletAddress, 'success');
    } else {
      toast('Wallet connected. Run: node deploy.js to deploy contract.', 'warning');
    }

    // Listen for changes — without triggering Blockaid
    if (!window._mvEthListeners) {
      window._mvEthListeners = true;
      window.ethereum.on('accountsChanged', (accounts) => {
        if (!accounts || accounts.length === 0) {
          disconnectWallet();
        } else {
          location.reload();
        }
      });
      window.ethereum.on('chainChanged', () => {
        // Re-init provider on chain change instead of full reload
        const ch2 = window._mvChain;
        if (ch2.walletAddress) {
          ch2.provider = new ethers.BrowserProvider(window.ethereum);
          ch2.provider.getSigner().then(s => {
            ch2.signer = s;
            toast('Network changed — wallet re-synced.', 'info');
          }).catch(() => {});
        }
      });
    }
    return true;
  } catch(err) {
    if (err.code === 4001) {
      toast('MetaMask: connection request rejected.', 'warning');
    } else {
      toast('MetaMask error: ' + err.message, 'error');
    }
    return false;
  }
}

function disconnectWallet() {
  const ch = window._mvChain;
  ch.provider = null;
  ch.signer   = null;
  ch.walletAddress = null;
  ch.contract = null;
  _updateWalletUI(false, '', '');
  toast('Wallet disconnected.', 'info');
  addAuditLog('WALLET_DISCONNECT', '', 'success');
}

async function onWalletToggle(checkbox) {
  if (checkbox.checked) {
    const ok = await connectWallet();
    if (!ok) checkbox.checked = false;
  } else {
    disconnectWallet();
  }
}

async function switchChain(chainIdHex, chainName, rpcUrl, currency) {
  if (!window.ethereum) return false;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch(err) {
    if (err.code === 4902) {
      // Network not in MetaMask — add it
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId:         chainIdHex,
            chainName:       chainName,
            nativeCurrency:  { name: currency, symbol: currency, decimals: 18 },
            rpcUrls:         [rpcUrl],
          }],
        });
        return true;
      } catch(addErr) {
        toast('Could not add network: ' + addErr.message, 'error');
        return false;
      }
    } else if (err.code === 4001) {
      toast('Network switch cancelled.', 'warning');
      return false;
    } else {
      toast('Network switch failed: ' + err.message, 'error');
      return false;
    }
  }
}

async function storeOnBlockchain() {
  const mv  = window.MediVault;
  const ch  = window._mvChain;

  if (!mv.ipfsCID) {
    toast('Upload to IPFS first!', 'error');
    return;
  }

  const btn    = document.getElementById('store-chain-btn');
  const status = document.getElementById('bc-status');
  if (btn) btn.disabled = true;
  if (status) {
    status.style.display = 'block';
    status.style.color   = '#92400E';
    status.style.border  = '1px solid #FDE68A';
    status.style.background = '#FFF7ED';
    status.style.padding = '10px 14px';
    status.style.borderRadius = '6px';
    status.style.fontSize = '13px';
    status.textContent   = 'Initializing...';
  }

  try {
    // Step 1: Load contract config
    if (!ch.contractConfig) {
      ch.contractConfig = await loadContractConfig();
      if (!ch.contractConfig) throw new Error('Contract not deployed. Run: node deploy.js');
    }

    // Step 2: Connect wallet if not connected
    if (!ch.signer) {
      if (status) status.textContent = 'Connecting MetaMask...';
      const ok = await connectWallet();
      if (!ok) throw new Error('MetaMask connection failed or was rejected.');
    }

    // Step 3: Check current chain vs target
    const currentNetwork = await ch.provider.getNetwork();
    const currentChainId = Number(currentNetwork.chainId);
    const targetChainId  = ch.contractConfig._targetChainId || ch.contractConfig.chainId;
    const targetHex      = ch.contractConfig._targetChainHex || ('0x' + targetChainId.toString(16));

    if (currentChainId !== targetChainId) {
      if (status) status.textContent = 'Switching network in MetaMask...';
      const switched = await switchChain(
        targetHex,
        targetChainId === 1337 ? 'Ganache Local' : 'Sepolia Testnet',
        ch.contractConfig.rpcUrl,
        targetChainId === 1337 ? 'ETH' : 'SepoliaETH'
      );
      if (!switched) throw new Error('Network switch failed. Please switch manually in MetaMask.');
      // Re-init provider after switch
      ch.provider = new ethers.BrowserProvider(window.ethereum);
      ch.signer   = await ch.provider.getSigner();
    }

    // Step 4: Build contract instance with current signer
    const contract = new ethers.Contract(
      ch.contractConfig.contractAddress,
      ch.contractConfig.abi,
      ch.signer
    );

    if (status) status.textContent = 'Confirm the transaction in MetaMask...';

    // Step 5: Send transaction
    const imgType  = mv.metadata?.imageType || mv.currentImageType || 'Unknown';
    const filename = mv.metadata?.filename  || (mv.ipfsCID ? mv.ipfsCID.slice(0,20) : 'unknown');

    const tx = await contract.storeImage(
      mv.ipfsCID,
      mv.sha256Hash || '',
      imgType,
      filename,
      true,
      { gasLimit: 500000 }
    );

    const netName = targetChainId === 1337 ? 'Ganache Local' : 'Sepolia Testnet';
    if (status) status.textContent = 'Mining transaction on ' + netName + '...';

    const receipt = await tx.wait();

    // Step 6: Extract record ID from event logs
    let recordId = '0';
    try {
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'ImageStored') {
            recordId = parsed.args.recordId.toString();
            break;
          }
        } catch(_) {}
      }
    } catch(_) {}

    // Step 7: Save result
    const txData = {
      txHash:          receipt.hash,
      blockNumber:     receipt.blockNumber,
      recordId,
      gasUsed:         receipt.gasUsed?.toString(),
      contractAddress: ch.contractConfig.contractAddress,
      network:         netName,
      wallet:          ch.walletAddress,
    };
    mv.blockchainTx = txData;
    // Save key alongside this specific transaction for retrieval
    txData.encryptionKey = mv.encryptionKey || null;
    txData.encryptionIV  = mv.encryptionIV  || null;
    txData.ipfsCID       = mv.ipfsCID       || null;
    txData.sha256Hash    = mv.sha256Hash    || null;
    mv.blockchainTx = txData;
    // Also persist per-network key to localStorage for retrieval page
    try {
      const networkKey = 'mv_key_' + (txData.network || 'ganache').replace(/\s+/g,'_').toLowerCase();
      localStorage.setItem(networkKey, JSON.stringify({
        key:     mv.encryptionKey,
        iv:      mv.encryptionIV,
        cid:     mv.ipfsCID,
        hash:    mv.sha256Hash,
        recordId: recordId,
        network:  txData.network,
        ts:       new Date().toISOString()
      }));
    } catch(_) {}
    mv.save();
    addAuditLog('BLOCKCHAIN_STORE',
      'TX:' + receipt.hash.slice(0,18) + '... Record:#' + recordId + ' Net:' + netName,
      'success'
    );

    // Step 8: Update UI
    if (status) {
      status.style.color      = '#15803D';
      status.style.border     = '1px solid #86EFAC';
      status.style.background = '#F0FDF4';
      status.textContent      = 'Stored on ' + netName + '! Record #' + recordId;
    }

    _fillBlockchainResult(txData, ch.contractConfig.contractAddress);
    const bcResult = document.getElementById('bc-result');
    if (bcResult) {
      bcResult.style.display = 'block';
      bcResult.scrollIntoView({ behavior: 'smooth' });
    }

    const bal = await ch.provider.getBalance(ch.walletAddress);
    _updateWalletUI(true, ch.walletAddress, ethers.formatEther(bal));
    toast('Blockchain record saved! Record #' + recordId, 'success');

  } catch(err) {
    const isReject = err.code === 4001
      || (err.message && (err.message.includes('rejected') || err.message.includes('denied')));

    if (status) {
      status.style.color      = isReject ? '#92400E' : '#DC2626';
      status.style.border     = isReject ? '1px solid #FDE68A' : '1px solid #FECACA';
      status.style.background = isReject ? '#FFF7ED' : '#FEF2F2';
      status.textContent      = isReject
        ? 'Transaction cancelled in MetaMask.'
        : 'Error: ' + (err.reason || err.message);
    }
    toast(isReject ? 'Transaction cancelled.' : 'Error: ' + (err.reason || err.message),
          isReject ? 'warning' : 'error');
    addAuditLog('BLOCKCHAIN_STORE', err.message, 'error');
    console.error('[storeOnBlockchain]', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _fillBlockchainResult(txData, contractAddress) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('bc-tx-hash',   txData.txHash);
  set('bc-record-id', '#' + txData.recordId);
  set('bc-block',     txData.blockNumber?.toString() || '---');
  set('bc-gas',       txData.gasUsed || '---');
  set('bc-contract',  contractAddress || '---');
}


// ════════════════════════════════════════
//  DECRYPTION
// ════════════════════════════════════════
let _decryptedBlob = null;

function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(',');
  const mime           = header.match(/:(.*?);/)[1];
  const binary         = atob(data);
  const arr            = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function detectMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'image/bmp';
  return 'image/png';
}

async function startDecryption() {
  const mv = window.MediVault;

  const cidEl     = document.getElementById('dec-cid');
  const keyEl     = document.getElementById('dec-key');
  const ivEl      = document.getElementById('dec-iv');
  const gwEl      = document.getElementById('dec-gateway');
  const progressEl = document.getElementById('dec-progress');
  const resultEl  = document.getElementById('dec-result');
  const errorEl   = document.getElementById('dec-error');

  const cid    = cidEl    ? cidEl.value.trim()   : '';
  const keyHex = keyEl    ? keyEl.value.trim()   : '';
  const ivHex  = ivEl     ? ivEl.value.trim()    : '';
  const gateway = gwEl    ? gwEl.value           : 'https://gateway.pinata.cloud/ipfs/';

  if (!cid)                       { toast('CID required!', 'error'); return; }
  if (keyHex.length !== 64)       { toast('AES key must be 64 hex chars (256-bit)!', 'error'); return; }
  if (ivHex.length  !== 24)       { toast('IV must be 24 hex chars (12 bytes)!', 'error'); return; }

  if (progressEl) progressEl.style.display = 'block';
  if (resultEl)   resultEl.style.display   = 'none';
  if (errorEl)    errorEl.style.display    = 'none';
  _decryptedBlob = null;

  setElProgress('dec-bar', 0);
  ['fetch','verify','decrypt','render'].forEach(s => setStepStatus('dps-' + s + '-s', 'pending'));

  try {
    // Step 1: Download from IPFS
    setStepStatus('dps-fetch-s', 'running');
    setStepDesc('dps-fetch-d', 'Connecting to ' + gateway + '…');
    setElProgress('dec-bar', 10);

    let encryptedBytes;
    try {
      const res = await fetch(gateway + cid);
      if (!res.ok) throw new Error('Gateway returned ' + res.status);
      encryptedBytes = new Uint8Array(await res.arrayBuffer());
      setStepDesc('dps-fetch-d', 'Downloaded ' + formatBytes(encryptedBytes.length) + ' from IPFS');
    } catch(fetchErr) {
      setStepDesc('dps-fetch-d', 'Primary gateway failed, trying fallback…');
      const fallbacks = [
        'https://ipfs.io/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://dweb.link/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
      ].filter(g => g !== gateway);

      let downloaded = false;
      for (const fb of fallbacks) {
        try {
          const r = await fetch(fb + cid);
          if (r.ok) {
            encryptedBytes = new Uint8Array(await r.arrayBuffer());
            setStepDesc('dps-fetch-d', 'Downloaded via ' + fb);
            downloaded = true;
            break;
          }
        } catch(_) {}
      }
      if (!downloaded) throw new Error('All IPFS gateways failed. CID: ' + cid);
    }

    setStepStatus('dps-fetch-s', 'done');
    setElProgress('dec-bar', 35);

    // Step 2: SHA-256 Verify
    setStepStatus('dps-verify-s', 'running');
    setElProgress('dec-bar', 50);

    const computedHash = await sha256(encryptedBytes);
    const expHash      = mv.sha256Hash || '';
    const integrityEl  = document.getElementById('dec-integrity');

    if (expHash && expHash.length === 64) {
      if (computedHash.toLowerCase() === expHash.toLowerCase()) {
        setStepDesc('dps-verify-d', '✅ Hash matches — file is intact');
        if (integrityEl) { integrityEl.textContent = '✅ Verified'; integrityEl.style.color = 'var(--success)'; }
      } else {
        setStepDesc('dps-verify-d', '⚠️ Hash mismatch — file may be tampered!');
        if (integrityEl) { integrityEl.textContent = '⚠️ MISMATCH'; integrityEl.style.color = 'var(--danger)'; }
      }
    } else {
      setStepDesc('dps-verify-d', 'Hash not in session — skipping verify');
      if (integrityEl) { integrityEl.textContent = '⏭️ Skipped'; integrityEl.style.color = 'var(--text-muted)'; }
    }

    setStepStatus('dps-verify-s', 'done');
    setElProgress('dec-bar', 65);

    // Step 3: AES-256-GCM Decrypt
    setStepStatus('dps-decrypt-s', 'running');
    setElProgress('dec-bar', 75);

    const keyBytes  = new Uint8Array(keyHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const ivBytes   = new Uint8Array(ivHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));

    const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

    let decryptedBuffer;
    try {
      decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, encryptedBytes);
    } catch(decErr) {
      throw new Error('Decryption failed — wrong key or IV. ' + decErr.message);
    }

    setStepStatus('dps-decrypt-s', 'done');
    setElProgress('dec-bar', 90);

    // Step 4: Render
    setStepStatus('dps-render-s', 'running');

    const decBytes  = new Uint8Array(decryptedBuffer);
    const decString = new TextDecoder().decode(decBytes);

    let imgSrc;
    if (decString.startsWith('data:image')) {
      imgSrc         = decString;
      _decryptedBlob = dataURLtoBlob(decString);
    } else {
      const mime     = detectMime(decBytes);
      _decryptedBlob = new Blob([decryptedBuffer], { type: mime });
      imgSrc         = URL.createObjectURL(_decryptedBlob);
    }

    const decImg = document.getElementById('dec-img');
    if (decImg) decImg.src = imgSrc;

    const sizeEl = document.getElementById('dec-size');
    const gwEl2  = document.getElementById('dec-gw-used');
    if (sizeEl) sizeEl.textContent = formatBytes(decryptedBuffer.byteLength);
    if (gwEl2)  gwEl2.textContent  = gateway.replace('https://','').split('/')[0];

    setStepStatus('dps-render-s', 'done');
    setElProgress('dec-bar', 100);

    if (resultEl) { resultEl.style.display = 'block'; resultEl.scrollIntoView({ behavior: 'smooth' }); }

    addAuditLog('DECRYPTION', 'CID:' + cid.slice(0,20) + '…', 'success');
    toast('🔓 Image decrypted successfully!', 'success');

  } catch(err) {
    ['fetch','verify','decrypt','render'].forEach(s => {
      const el = document.getElementById('dps-' + s + '-s');
      if (el && el.classList.contains('running')) setStepStatus('dps-' + s + '-s', 'error');
    });
    if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = '❌ ' + err.message; }
    addAuditLog('DECRYPTION', err.message, 'error');
    toast('Decryption error: ' + err.message, 'error');
    console.error(err);
  }
}

function downloadDecrypted() {
  if (!_decryptedBlob) { toast('No decrypted image to download.', 'error'); return; }
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(_decryptedBlob);
  a.download = 'decrypted-medimage-' + Date.now() + '.png';
  a.click();
}

// ════════════════════════════════════════
//  DOWNLOAD REPORT
// ════════════════════════════════════════
function downloadReport() {
  const mv = window.MediVault;
  const report = {
    cid:        mv.ipfsCID,
    ipfsUrl:    mv.ipfsUrl,
    sha256:     mv.sha256Hash,
    encryption: mv.encryptionKey ? { algorithm: 'AES-256-GCM', iv: mv.encryptionIV, keyHint: mv.encryptionKey.slice(0,8) + '...' } : 'None',
    metadata:   mv.metadata,
    blockchain: mv.blockchainTx || null,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'medivault-report-' + Date.now() + '.json';
  a.click();
}

// ════════════════════════════════════════
//  AUDIT LOG
// ════════════════════════════════════════
function addAuditLog(action, details, status = 'success') {
  try {
    const logs = JSON.parse(localStorage.getItem('mv_audit') || '[]');
    logs.unshift({ id: Date.now(), ts: new Date().toISOString(), action, details, status });
    if (logs.length > 500) logs.splice(500);
    localStorage.setItem('mv_audit', JSON.stringify(logs));
  } catch(e) {}
}

function getAuditLogs() {
  try { return JSON.parse(localStorage.getItem('mv_audit') || '[]'); }
  catch(e) { return []; }
}

// ════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════
const SIDEBAR_NAV = [
  { page: 'dashboard',       href: 'dashboard.html',       label: 'Dashboard',            icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
  { page: 'acquisition',     href: 'acquisition.html',     label: 'Image Acquisition',    icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>' },
  { page: 'preprocessing',   href: 'preprocessing.html',   label: 'Preprocessing',        icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>' },
  { page: 'encryption',      href: 'encryption.html',      label: 'Encryption & Security', icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
  { page: 'ipfs-storage',    href: 'ipfs-storage.html',    label: 'IPFS Storage',         icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>' },
  { page: 'blockchain',      href: 'blockchain.html',      label: 'Blockchain Network',   icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="6" height="6" rx="1"/><rect x="16" y="7" width="6" height="6" rx="1"/><rect x="9" y="14" width="6" height="6" rx="1"/><path d="M5 13v2a1 1 0 0 0 1 1h3M19 13v2a1 1 0 0 1-1 1h-3M12 7V5"/></svg>' },
  { page: 'smart-contracts', href: 'smart-contracts.html', label: 'Smart Contracts',      icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
  { page: 'retrieval',       href: 'retrieval.html',       label: 'Secure Retrieval',     icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
  { page: 'audit-logs',      href: 'audit-logs.html',      label: 'Audit Logs',           icon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
];

function initSidebar(activePage) {
  const container = document.getElementById('sidebar-container');
  if (!container) return;

  const navItems = SIDEBAR_NAV.map(item => `
    <a href="${item.href}" class="nav-item${item.page === activePage ? ' active' : ''}" data-page="${item.page}" title="${item.label}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </a>
  `).join('');

  const logoSVG = `<svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 2L4 8v10c0 7.7 6 14.9 14 16.9C26 32.9 32 25.7 32 18V8L18 2z" fill="#2563EB" opacity="0.12"/>
    <path d="M18 4L6 9.6V18c0 6.9 5.3 13.3 12 15.1 6.7-1.8 12-8.2 12-15.1V9.6L18 4z" stroke="#2563EB" stroke-width="2" fill="none"/>
    <path d="M18 11v8M14 15h8" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;

  container.innerHTML = `
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">
      <div class="brand-logo">${logoSVG}</div>
      <div class="brand-text">
        <span class="brand-name">MediVault</span>
        <span class="brand-tagline">Secure Medical Storage</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-title">MAIN MENU</div>
      ${navItems}
    </nav>
    <div class="sidebar-footer">
      <div class="nav-section-title">SYSTEM</div>
      <a href="#" class="nav-item" title="Settings">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/></svg></span>
        <span class="nav-label">Settings</span>
      </a>
      <a href="#" class="nav-item" title="Help &amp; Support">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
        <span class="nav-label">Help &amp; Support</span>
      </a>
      <div class="connection-status" id="sidebar-conn-status">
        <div class="conn-dot" id="conn-blockchain"></div>
        <span>Blockchain</span>
        <div class="conn-dot" id="conn-ipfs" style="margin-left:6px;"></div>
        <span>IPFS</span>
      </div>
    </div>
    <button class="sidebar-arrow-toggle" id="sidebar-arrow-toggle" onclick="toggleSidebar()" title="Toggle Sidebar">
      <span class="arrow-open"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span>
      <span class="arrow-close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
    </button>
  </aside>`;

  // Restore collapsed state
  const collapsed = localStorage.getItem('mv_sidebar_collapsed') === '1';
  if (collapsed) document.getElementById('sidebar')?.classList.add('collapsed');
  _updateWalletUI(false, '', '');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.toggle('collapsed');
  localStorage.setItem('mv_sidebar_collapsed', sb.classList.contains('collapsed') ? '1' : '0');
}

// ════════════════════════════════════════
//  IPFS PROVIDER CHANGE
// ════════════════════════════════════════
function onProviderChange() {
  const v = document.getElementById('ipfs-provider')?.value;
  const show = (id, vis) => { const el = document.getElementById(id); if(el) el.style.display = vis ? 'block' : 'none'; };
  show('wrap-pinata',      v === 'pinata');
  show('wrap-web3storage', v === 'web3storage');
  show('wrap-local',       v === 'local');
}
