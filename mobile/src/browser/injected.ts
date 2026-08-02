/**
 * JavaScript injected into every browsed page BEFORE its own scripts run, exposing the wallet to
 * dApps: an EIP-1193 `window.ethereum` (+ EIP-6963 discovery) and a Phantom-compatible
 * `window.solana`. Signing/connect calls are forwarded to React Native over the WebView bridge and
 * resolved by `window.__xgo.resolve(...)`; the app shows an approval sheet and runs the SAME signer
 * the WalletConnect flow uses.
 *
 * Passive by design: no account is exposed until the user approves a connect request for the origin.
 */

/** Seed values baked into the injected script for the initial page state. */
export interface InjectedSeed {
  /** Active EVM address (checksummed) or null. */
  evmAddress: string | null;
  /** Active EVM chain id as hex (e.g. "0x1") — the chain the provider reports until switched. */
  evmChainIdHex: string;
  /** Active Solana address (base58) or null. */
  solAddress: string | null;
}

export function buildInjectedProvider(seed: InjectedSeed): string {
  // Everything below runs INSIDE the page. Keep it dependency-free and defensive.
  return `(function () {
  if (window.__xgo && window.__xgo.installed) return;

  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function b58decode(str) {
    var bytes = [0];
    for (var i = 0; i < str.length; i++) {
      var c = B58.indexOf(str[i]);
      if (c < 0) throw new Error("bad base58");
      for (var j = 0; j < bytes.length; j++) bytes[j] *= 58;
      bytes[0] += c;
      var carry = 0;
      for (var k = 0; k < bytes.length; k++) { bytes[k] += carry; carry = bytes[k] >> 8; bytes[k] &= 0xff; }
      while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    for (var q = 0; q < str.length && str[q] === "1"; q++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  }
  function b64ToBytes(b64) {
    var bin = atob(b64); var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var bin = ""; var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  var state = { evmAddress: ${JSON.stringify(seed.evmAddress)}, evmChainId: ${JSON.stringify(seed.evmChainIdHex)}, solAddress: ${JSON.stringify(seed.solAddress)} };
  var pending = {}; var nextId = 1;
  var xgo = { installed: true, state: state, resolve: resolve };
  window.__xgo = xgo;

  function send(kind, method, params) {
    var id = String(nextId++);
    return new Promise(function (res, rej) {
      pending[id] = { res: res, rej: rej };
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, kind: kind, method: method, params: params, origin: location.origin, host: location.host }));
    });
  }
  function resolve(id, resultJson, errorJson) {
    var p = pending[id]; if (!p) return; delete pending[id];
    if (errorJson) { var e = new Error(errorJson.message || "Request rejected"); e.code = errorJson.code || 4001; p.rej(e); }
    else p.res(resultJson);
  }

  /* ---------- tiny event emitter ---------- */
  function Emitter() { this._l = {}; }
  Emitter.prototype.on = function (ev, cb) { (this._l[ev] = this._l[ev] || []).push(cb); return this; };
  Emitter.prototype.addListener = Emitter.prototype.on;
  Emitter.prototype.removeListener = function (ev, cb) { var a = this._l[ev]; if (a) this._l[ev] = a.filter(function (f) { return f !== cb; }); return this; };
  Emitter.prototype.off = Emitter.prototype.removeListener;
  Emitter.prototype.once = function (ev, cb) { var self = this; function h() { self.removeListener(ev, h); cb.apply(null, arguments); } return this.on(ev, h); };
  Emitter.prototype.emit = function (ev) { var a = (this._l[ev] || []).slice(); var args = [].slice.call(arguments, 1); a.forEach(function (f) { try { f.apply(null, args); } catch (e) {} }); };
  Emitter.prototype.removeAllListeners = function () { this._l = {}; };

  /* ==================== EVM (EIP-1193) ==================== */
  var eth = new Emitter();
  eth.isMetaMask = true; eth.isXGO = true;
  eth.chainId = state.evmChainId; eth.networkVersion = String(parseInt(state.evmChainId, 16));
  eth.selectedAddress = null;
  var connectedEvm = false;

  eth.request = function (args) {
    var method = args && args.method; var params = (args && args.params) || [];
    switch (method) {
      case "eth_chainId": return Promise.resolve(eth.chainId);
      case "net_version": return Promise.resolve(eth.networkVersion);
      case "eth_accounts": return Promise.resolve(connectedEvm && state.evmAddress ? [state.evmAddress] : []);
      case "eth_requestAccounts":
      case "wallet_requestPermissions":
        if (!state.evmAddress) return Promise.reject({ code: 4001, message: "No EVM account" });
        return send("evm", "connect", params).then(function (addr) {
          connectedEvm = true; state.evmAddress = addr; eth.selectedAddress = addr;
          eth.emit("accountsChanged", [addr]); eth.emit("connect", { chainId: eth.chainId });
          return method === "wallet_requestPermissions" ? [{ parentCapability: "eth_accounts" }] : [addr];
        });
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return send("evm", method, params).then(function (hex) {
          if (hex) { eth.chainId = hex; eth.networkVersion = String(parseInt(hex, 16)); state.evmChainId = hex; eth.emit("chainChanged", hex); }
          return null;
        });
      case "personal_sign":
      case "eth_sign":
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4":
      case "eth_sendTransaction":
      case "eth_signTransaction":
        return send("evm", method, params);
      default:
        // Read-only RPC the wallet doesn't service locally — let the dApp's own RPC handle it.
        return send("evm", method, params);
    }
  };
  // legacy compatibility
  eth.enable = function () { return eth.request({ method: "eth_requestAccounts" }); };
  eth.send = function (m, p) {
    if (typeof m === "string") return eth.request({ method: m, params: p || [] });
    if (m && m.method) return eth.request(m); // some libs pass a payload
    return Promise.reject(new Error("unsupported"));
  };
  eth.sendAsync = function (payload, cb) {
    eth.request(payload).then(function (r) { cb(null, { id: payload.id, jsonrpc: "2.0", result: r }); },
      function (e) { cb(e, null); });
  };
  window.ethereum = eth;

  /* EIP-6963 multi-wallet discovery */
  var info = { uuid: "b4c0ffee-0000-4000-8000-000000000001", name: "XGO", icon: "data:image/svg+xml;base64,", rdns: "org.globalgoshens.xgo" };
  function announce() { window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: eth }) })); }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();

  /* ==================== Solana (Phantom-compatible) ==================== */
  function PubKey(addr) { this._a = addr; }
  PubKey.prototype.toString = function () { return this._a; };
  PubKey.prototype.toBase58 = function () { return this._a; };
  PubKey.prototype.toBytes = function () { return b58decode(this._a); };
  PubKey.prototype.toBuffer = function () { return b58decode(this._a); };
  PubKey.prototype.equals = function (o) { return o && o.toString() === this._a; };

  var sol = new Emitter();
  sol.isPhantom = true; sol.isXGO = true; sol.publicKey = null; sol.isConnected = false;

  sol.connect = function () {
    if (!state.solAddress) return Promise.reject(new Error("No Solana account"));
    if (sol.isConnected && sol.publicKey) return Promise.resolve({ publicKey: sol.publicKey });
    return send("solana", "connect", {}).then(function (addr) {
      state.solAddress = addr; sol.publicKey = new PubKey(addr); sol.isConnected = true;
      sol.emit("connect", sol.publicKey); return { publicKey: sol.publicKey };
    });
  };
  sol.disconnect = function () { sol.isConnected = false; sol.publicKey = null; sol.emit("disconnect"); return Promise.resolve(); };

  function serializeTx(tx) {
    // Works for both legacy Transaction and VersionedTransaction (web3.js objects from the page).
    return bytesToB64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  }
  function applySignature(tx, sigB64, addr) {
    var sig = b64ToBytes(sigB64);
    if (tx.version !== undefined && tx.message && tx.message.staticAccountKeys) {
      var keys = tx.message.staticAccountKeys.map(function (k) { return k.toBase58(); });
      var idx = keys.indexOf(addr);
      if (idx >= 0) tx.signatures[idx] = sig;
    } else if (tx.signatures && tx.signatures.length && tx.signatures[0] && tx.signatures[0].publicKey) {
      tx.signatures.forEach(function (s) { if (s.publicKey && s.publicKey.toBase58() === addr) s.signature = sig; });
    } else if (typeof tx.addSignature === "function") {
      try { tx.addSignature(new PubKey(addr), sig); } catch (e) {}
    }
    return tx;
  }

  sol.signAndSendTransaction = function (tx, opts) {
    return send("solana", "solana_signAndSendTransaction", { transaction: serializeTx(tx) })
      .then(function (r) { return { signature: r.signature }; });
  };
  sol.signTransaction = function (tx) {
    return send("solana", "solana_signTransaction", { transaction: serializeTx(tx) })
      .then(function (r) { return applySignature(tx, r.signature, state.solAddress); });
  };
  sol.signAllTransactions = function (txs) {
    return send("solana", "solana_signAllTransactions", { transactions: txs.map(serializeTx) })
      .then(function (r) { return txs.map(function (tx, i) { return applySignature(tx, r.signatures[i], state.solAddress); }); });
  };
  sol.signMessage = function (msg, display) {
    var bytes = msg instanceof Uint8Array ? msg : new TextEncoder().encode(String(msg));
    return send("solana", "solana_signMessage", { message: bytesToB64(bytes) })
      .then(function (r) { return { signature: b64ToBytes(r.signature), publicKey: sol.publicKey }; });
  };
  // Generic Phantom request() shim
  sol.request = function (args) {
    var m = args && args.method;
    if (m === "connect") return sol.connect();
    if (m === "disconnect") return sol.disconnect();
    if (m === "signAndSendTransaction") return sol.signAndSendTransaction(args.params.transaction);
    if (m === "signTransaction") return sol.signTransaction(args.params.transaction);
    if (m === "signAllTransactions") return sol.signAllTransactions(args.params.transactions);
    if (m === "signMessage") return sol.signMessage(args.params.message);
    return Promise.reject(new Error("Unsupported: " + m));
  };
  window.solana = sol;
  window.xgoSolana = sol;

  /* Apply account/chain updates pushed from the app after a switch. */
  xgo.update = function (next) {
    if (next.evmChainId && next.evmChainId !== eth.chainId) { eth.chainId = next.evmChainId; eth.networkVersion = String(parseInt(next.evmChainId, 16)); state.evmChainId = next.evmChainId; eth.emit("chainChanged", next.evmChainId); }
    if (next.evmAddress !== undefined && next.evmAddress !== state.evmAddress) { state.evmAddress = next.evmAddress; if (connectedEvm) { eth.selectedAddress = next.evmAddress; eth.emit("accountsChanged", next.evmAddress ? [next.evmAddress] : []); } }
    if (next.solAddress !== undefined && next.solAddress !== state.solAddress) { state.solAddress = next.solAddress; if (sol.isConnected) { sol.publicKey = next.solAddress ? new PubKey(next.solAddress) : null; sol.emit("accountChanged", sol.publicKey); } }
  };

  window.dispatchEvent(new Event("ethereum#initialized"));
})();
true;`;
}
