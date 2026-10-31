/* Doable — passcode sharing: a read-only snapshot of a space, encrypted on this device with a key
 * derived from the passcode (PBKDF2-SHA-256, 310k rounds → AES-256-GCM). The server only ever holds
 * the ciphertext, so a link without the passcode reveals nothing. Pure WebCrypto; works in the app,
 * the share page and Node (tests). */
(function (global) {
  'use strict';

  const subtle = () => (global.crypto || require('node:crypto').webcrypto).subtle;
  const rnd = n => (global.crypto || require('node:crypto').webcrypto).getRandomValues(new Uint8Array(n));
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ROUNDS = 310000;

  const b64 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function deriveKey(passcode, salt) {
    const base = await subtle().importKey('raw', enc.encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // → { blob, salt, iv, v } ready to store
  async function seal(obj, passcode) {
    const salt = rnd(16), iv = rnd(12);
    const key = await deriveKey(passcode, salt);
    const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { blob: b64(new Uint8Array(data)), salt: b64(salt), iv: b64(iv), v: 1 };
  }
  // Throws on a wrong passcode (GCM authentication fails)
  async function open(sealed, passcode) {
    const key = await deriveKey(passcode, unb64(sealed.salt));
    const data = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.blob));
    return JSON.parse(dec.decode(data));
  }

  // Share ids are random, not derived from anything, so a link can't be guessed from a space name
  const newShareId = () => b64(rnd(12)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  global.Sharing = { seal, open, newShareId, ROUNDS };
})(typeof window !== 'undefined' ? window : globalThis);
