// Polyfill for Figma Sandbox Environment
// Figma widgets/plugins run in a restricted JS environment (QuickJS or similar)
// which often lacks standard browser globals like 'window', 'self', or 'crypto'.
// This polyfill ensures libraries like 'node-forge' can initialize without crashing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeGlobal = globalThis as any;

// 1. Ensure 'global' exists (Node-style)
try {
    if (typeof global === 'undefined') {
        safeGlobal.global = safeGlobal;
    }
} catch (e) { /* Ignore read-only errors */ }

// 2. Ensure 'window' exists (Browser-style) - many libs check this first
try {
    if (typeof window === 'undefined') {
        safeGlobal.window = safeGlobal;
    }
} catch (e) { /* Ignore read-only errors */ }

// 3. Ensure 'self' exists
try {
    if (typeof self === 'undefined') {
        safeGlobal.self = safeGlobal;
    }
} catch (e) { /* Ignore read-only errors */ }

// 4. Polyfill 'crypto' if missing
// Note: Math.random is not cryptographically secure, but it is the best available
// fallback in this restricted environment to prevent crashes.
try {
    if (typeof safeGlobal.crypto === 'undefined') {
        console.warn('Polyfilling crypto.getRandomValues with Math.random (Sandbox restriction)');
        safeGlobal.crypto = {
            getRandomValues: (buffer: Uint8Array | Uint16Array | Uint32Array) => {
                // Basic implementation for byte arrays
                if (buffer instanceof Uint8Array || buffer instanceof Uint8ClampedArray) {
                    for (let i = 0; i < buffer.length; i++) {
                        buffer[i] = Math.floor(Math.random() * 256);
                    }
                } else if (buffer instanceof Uint16Array) {
                    for (let i = 0; i < buffer.length; i++) {
                        buffer[i] = Math.floor(Math.random() * 65536);
                    }
                } else if (buffer instanceof Uint32Array) {
                    for (let i = 0; i < buffer.length; i++) {
                        buffer[i] = Math.floor(Math.random() * 4294967296);
                    }
                } else {
                    // Fallback for generic view/buffer
                    console.warn('Unsupported buffer type for crypto polyfill');
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const safeBuffer = buffer as any;
                    for (let i = 0; i < safeBuffer.length; i++) {
                        safeBuffer[i] = Math.floor(Math.random() * 256);
                    }
                }
                return buffer;
            }
        };
    }
} catch (e) {
    console.error('Failed to polyfill crypto:', e);
}

// 5. Build 'process' mock if needed (some node libs check process.version)
try {
    if (typeof process === 'undefined') {
        safeGlobal.process = {
            env: {},
            version: '',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            nextTick: (cb: any) => setTimeout(cb, 0)
        };
    }
} catch (e) { /* Ignore */ }
