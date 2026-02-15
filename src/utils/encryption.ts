import * as forge from 'node-forge';

// Custom Base64 encoding/decoding is no longer needed as forge handles it,
// but keeping the exports if used elsewhere or for simple helpers.
// Actually, forge has util.encode64.
// Let's implement the interface using forge.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const figma: any;

const KEY_STORAGE_NAME = 'pbi_plugin_encryption_key_v2'; // Changed key name to force fresh start with new format

// Helper: Generate a random key (32 bytes for AES-256)
function generateKeyBytes(): string {
  return forge.random.getBytesSync(32);
}

// Exported helper for other services (e.g. Basic Auth)
export function base64Encode(input: string): string {
  return forge.util.encode64(input);
}

// Retrieve or generate persistent key
async function getOrGenerateKey(): Promise<string> {
  let storedKey = await figma.clientStorage.getAsync(KEY_STORAGE_NAME);

  if (!storedKey) {
    storedKey = forge.util.encode64(generateKeyBytes());
    await figma.clientStorage.setAsync(KEY_STORAGE_NAME, storedKey);
  }

  return forge.util.decode64(storedKey);
}

export async function encryptPAT(token: string): Promise<string> {
  try {
    const key = await getOrGenerateKey();
    const iv = forge.random.getBytesSync(12); // 96-bit IV for GCM

    const cipher = forge.cipher.createCipher('AES-GCM', key);
    cipher.start({
      iv: iv,
      tagLength: 128 // 128-bit tag
    });
    cipher.update(forge.util.createBuffer(token, 'utf8'));
    cipher.finish();

    const encrypted = cipher.output.getBytes();
    const tag = cipher.mode.tag.getBytes();

    // Format: iv:tag:ciphertext (Base64 encoded)
    // We combine tag and ciphertext or store separately?
    // Standard GCM usually appends tag to ciphertext or stores separate.
    // Let's store: base64(iv):base64(ciphertext + tag) or keep separate for clarity.
    // Simpler: base64(iv):base64(tag):base64(ciphertext)

    return `${forge.util.encode64(iv)}:${forge.util.encode64(tag)}:${forge.util.encode64(encrypted)}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Encryption failed');
  }
}

export async function decryptPAT(encryptedToken: string): Promise<string | null> {
  try {
    if (!encryptedToken || !encryptedToken.includes(':')) {
      return null;
    }

    const parts = encryptedToken.split(':');
    if (parts.length !== 3) return null;

    const [ivB64, tagB64, cipherB64] = parts;

    const key = await getOrGenerateKey();
    const iv = forge.util.decode64(ivB64);
    const tag = forge.util.decode64(tagB64);
    const ciphertext = forge.util.decode64(cipherB64);

    const decipher = forge.cipher.createDecipher('AES-GCM', key);
    decipher.start({
      iv: iv,
      tagLength: 128,
      tag: forge.util.createBuffer(tag)
    });

    decipher.update(forge.util.createBuffer(ciphertext));
    const pass = decipher.finish();

    if (pass) {
      return decipher.output.toString();
    } else {
      console.warn('Decryption authentication failed');
      return null;
    }
  } catch (error) {
    console.warn('Decryption failed:', error);
    return null;
  }
}

export function validatePATFormat(token: string): boolean {
  // Azure DevOps PATs are typically 52 characters long and Base64 encoded
  return /^[A-Za-z0-9+/]{52}$/.test(token);
}
