// Property-based tests for PAT storage security

import * as fc from 'fast-check';

// Mock figma.clientStorage for testing
const mockClientStorage = {
  setAsync: jest.fn(),
  getAsync: jest.fn(),
  deleteAsync: jest.fn()
};

// Mock figma global
(global as any).figma = {
  clientStorage: mockClientStorage
};

import { ConfigStorageService } from '../../src/services/configStorage';
import * as EncryptionService from '../../src/utils/encryption';

describe('Feature: figma-devops-integration, Config Storage Service', () => {
  const STORAGE_KEY = 'azure_devops_config';

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientStorage.setAsync.mockReset().mockResolvedValue(undefined);
    mockClientStorage.getAsync.mockReset().mockResolvedValue(null);
    mockClientStorage.deleteAsync.mockReset().mockResolvedValue(undefined);
  });

  describe('Property 1: Config Encryption and Storage Security', () => {
    test('should store config encrypted and retrieve it correctly without exposing plain text PAT', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          pat: fc.string({ minLength: 52, maxLength: 52 }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
          organization: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
          acPattern: fc.string()
        }),
        async ({ pat, organization, acPattern }) => {
          mockClientStorage.setAsync.mockClear();
          mockClientStorage.getAsync.mockClear();

          mockClientStorage.setAsync.mockResolvedValue(undefined);
          mockClientStorage.getAsync.mockImplementation(async (key) => {
            if (key === STORAGE_KEY) {
              const encryptedPat = await EncryptionService.encryptPAT(pat);
              const storedData = {
                encryptedPat,
                organization,
                acPattern,
                createdAt: new Date().toISOString(),
              };
              return Promise.resolve(JSON.stringify(storedData));
            }
            return Promise.resolve(null);
          });

          await ConfigStorageService.storeConfig({ pat, organization, acPattern: acPattern as string | undefined });

          expect(mockClientStorage.setAsync).toHaveBeenCalledTimes(1);
          const [key, storedValue] = mockClientStorage.setAsync.mock.calls[0];
          expect(key).toBe(STORAGE_KEY);

          expect(storedValue).not.toContain(pat);

          const retrievedConfig = await ConfigStorageService.retrieveConfig();
          expect(retrievedConfig).toBeDefined();
          expect(retrievedConfig!.pat).toBe(pat);
          expect(retrievedConfig!.organization).toBe(organization);
          expect(retrievedConfig!.acPattern).toBe(acPattern);

          const configInfo = await ConfigStorageService.getConfigInfo();
          expect(configInfo).toBeDefined();
          expect(configInfo!.organization).toBe(organization);
          expect(configInfo!.acPattern).toBe(acPattern);
          expect(configInfo).not.toHaveProperty('encryptedPat');
        }
      ), { numRuns: 3 });
    });

    test('should reject invalid PAT formats during storage', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          invalidPat: fc.string().filter((s: string) => !EncryptionService.validatePATFormat(s)),
          organization: fc.string({ minLength: 1, maxLength: 20 }),
          acPattern: fc.string()
        }),
        async ({ invalidPat, organization, acPattern }) => {
          mockClientStorage.setAsync.mockClear();

          await expect(ConfigStorageService.storeConfig({ pat: invalidPat, organization, acPattern: acPattern as string | undefined }))
            .rejects
            .toThrow('Invalid PAT format');

          expect(mockClientStorage.setAsync).not.toHaveBeenCalled();
        }
      ), { numRuns: 3 });
    });
  });

  describe('Property 3: Config Cleanup Completeness', () => {
    test('should completely remove config data with no recoverable traces', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          pat: fc.string({ minLength: 52, maxLength: 52 }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
          organization: fc.string({ minLength: 1, maxLength: 20 }),
          acPattern: fc.string()
        }),
        async ({ pat, organization, acPattern }) => {
          mockClientStorage.setAsync.mockClear();
          mockClientStorage.deleteAsync.mockClear();
          mockClientStorage.getAsync.mockClear();

          mockClientStorage.setAsync.mockResolvedValue(undefined);
          mockClientStorage.deleteAsync.mockResolvedValue(undefined);

          const encryptedPat = await EncryptionService.encryptPAT(pat);
          const storedData = {
            encryptedPat,
            organization,
            acPattern,
            createdAt: new Date().toISOString(),
          };

          mockClientStorage.getAsync
            .mockResolvedValueOnce(JSON.stringify(storedData))
            .mockResolvedValue(null);

          await ConfigStorageService.clearConfig();

          expect(mockClientStorage.deleteAsync).toHaveBeenCalledWith(STORAGE_KEY);

          const retrievedConfig = await ConfigStorageService.retrieveConfig();
          expect(retrievedConfig).toBeNull();

          const configInfo = await ConfigStorageService.getConfigInfo();
          expect(configInfo).toBeNull();
        }
      ), { numRuns: 3 });
    });
  });

  describe('Unit tests for config storage edge cases', () => {
    test('should handle corrupted storage data gracefully', async () => {
      mockClientStorage.getAsync.mockResolvedValue('invalid-json-data');

      const retrievedConfig = await ConfigStorageService.retrieveConfig();
      expect(retrievedConfig).toBeNull();

      const configInfo = await ConfigStorageService.getConfigInfo();
      expect(configInfo).toBeNull();
    });

    test('should handle missing storage data', async () => {
      mockClientStorage.getAsync.mockResolvedValue(null);

      const retrievedConfig = await ConfigStorageService.retrieveConfig();
      expect(retrievedConfig).toBeNull();

      const configInfo = await ConfigStorageService.getConfigInfo();
      expect(configInfo).toBeNull();
    });
  });
});