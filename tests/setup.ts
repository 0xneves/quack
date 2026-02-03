/**
 * Jest Setup - Web Crypto API for Node.js
 * 
 * Node.js has the Web Crypto API available via crypto.webcrypto,
 * but we need to make it available globally as `crypto`.
 */

import { webcrypto } from 'node:crypto';

// Make Web Crypto API available globally
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  writable: true,
  configurable: true,
});

// Also provide TextEncoder/TextDecoder (should be available in Node, but just in case)
if (typeof globalThis.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = await import('node:util');
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });
}

// btoa/atob for base64 (available in Node 16+)
if (typeof globalThis.btoa === 'undefined') {
  Object.defineProperty(globalThis, 'btoa', {
    value: (str: string) => Buffer.from(str, 'binary').toString('base64'),
  });
  Object.defineProperty(globalThis, 'atob', {
    value: (str: string) => Buffer.from(str, 'base64').toString('binary'),
  });
}

console.log('✅ Test environment setup complete');
