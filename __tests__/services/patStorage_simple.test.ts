
import * as EncryptionService from '../../src/utils/encryption';
import { ConfigStorageService } from '../../src/services/configStorage';

// Mock figma global
const mockClientStorage = {
    getAsync: jest.fn(),
    setAsync: jest.fn(),
    deleteAsync: jest.fn()
};

(global as any).figma = {
    clientStorage: mockClientStorage
};

// Mock EncryptionService to avoid forge issues if any
// But we want to test integration with it?
// Let's assume EncryptionService works (it passed its own tests)
// So we use the real one. 
// BUT we need to mock figma for correct key generation there too.
// The global mock above handles it.

describe('ConfigStorageService Simple', () => {
    const STORAGE_KEY = 'azure_devops_config';

    beforeEach(() => {
        jest.clearAllMocks();
        mockClientStorage.setAsync.mockReset().mockResolvedValue(undefined);
        // Default getAsync to null (no key, no config)
        mockClientStorage.getAsync.mockReset().mockResolvedValue(null);
    });

    test('should store and retrieve config', async () => {
        const pat = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const organization = 'test-org';
        const acPattern = 'pattern';

        // 1. Store Config
        // When storing, it first encrypts. Encryption needs a key.
        // encryption.ts: getOrGenerateKey calls clientStorage.getAsync('pbi_plugin_encryption_key_v2')
        // We need to handle that call.

        mockClientStorage.getAsync.mockImplementation(async (key) => {
            if (key === 'pbi_plugin_encryption_key_v2') {
                return null; // Let it generate a key
            }
            if (key === STORAGE_KEY) {
                return null; // Logic in storeConfig checks existing? No.
            }
            return null;
        });

        // We also need to capture what was stored to simulate retrieval
        let storedConfigData: string | null = null;
        mockClientStorage.setAsync.mockImplementation(async (key, value) => {
            if (key === STORAGE_KEY) {
                storedConfigData = value;
            }
        });

        await ConfigStorageService.storeConfig({ pat, organization, acPattern });

        expect(mockClientStorage.setAsync).toHaveBeenCalled();
        expect(storedConfigData).toBeDefined();

        // 2. Retrieve Config
        mockClientStorage.getAsync.mockImplementation(async (key) => {
            if (key === 'pbi_plugin_encryption_key_v2') {
                // We need to return the SAME key that was generated/stored!
                // But we didn't capture it easily unless we spy heavily.
                // OR we can mock EncryptionService.
                return null; // If we return null, it generates a NEW key, so decryption differs!
            }
            if (key === STORAGE_KEY) {
                return storedConfigData;
            }
            return null;
        });

        // WAIT: If getOrGenerateKey returns a different key, decryption FAILS.
        // We MUST ensure the key persists.
        // In the real app, clientStorage persists.
        // In the mock, we need a store.

        const storage = new Map<string, string>();
        mockClientStorage.setAsync.mockImplementation(async (key, value) => {
            storage.set(key, value);
        });
        mockClientStorage.getAsync.mockImplementation(async (key) => {
            return storage.get(key) || null;
        });

        // Now run again
        await ConfigStorageService.storeConfig({ pat, organization, acPattern });

        const retrieved = await ConfigStorageService.retrieveConfig();

        expect(retrieved).not.toBeNull();
        expect(retrieved?.pat).toBe(pat);
    });
});
