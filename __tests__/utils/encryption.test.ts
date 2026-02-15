// Property-based tests for encryption utilities

import * as fc from 'fast-check';
import * as EncryptionService from '../../src/utils/encryption';

// Mock figma global
const mockClientStorage = {
  getAsync: jest.fn().mockResolvedValue('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), // 32 bytes of zeros in Base64
  setAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn()
};

(global as any).figma = {
  clientStorage: mockClientStorage
};

describe('Feature: figma-devops-integration, Encryption Service', () => {
  describe('Property 1: PAT Encryption and Storage Security', () => {
    test('should encrypt and decrypt PATs correctly without exposing plain text', async () => {
      await fc.assert(fc.asyncProperty(
        // Generate realistic PAT-like strings (52 base64 characters)
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), {
          minLength: 52,
          maxLength: 52
        }),
        async (originalPAT: string) => {
          // Encrypt the PAT
          const encrypted = await EncryptionService.encryptPAT(originalPAT);

          // Verify encryption properties
          expect(encrypted).toBeDefined();
          expect(encrypted).not.toBe(originalPAT); // Should not be plain text
          expect(encrypted.length).toBeGreaterThan(originalPAT.length); // Should be longer due to encoding

          // Verify decryption works
          const decrypted = await EncryptionService.decryptPAT(encrypted);
          expect(decrypted).toBe(originalPAT);

          // Verify encrypted token doesn't contain plain text
          expect(encrypted.includes(originalPAT)).toBe(false);
        }
      ), { numRuns: 100 });
    });

    test('should reject invalid encrypted tokens', async () => {
      await fc.assert(fc.asyncProperty(
        fc.string().filter((s: string) => !s.includes('azure-devops-pbi-plugin-key')),
        async (invalidToken: string) => {
          const result = await EncryptionService.decryptPAT(invalidToken);
          expect(result).toBeNull();
        }
      ), { numRuns: 50 });
    });
  });

  describe('Property 3: PAT Cleanup Completeness', () => {
    test('should validate PAT format correctly', () => {
      fc.assert(fc.property(
        fc.oneof(
          // Valid PAT format (52 base64 characters)
          fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), {
            minLength: 52,
            maxLength: 52
          }),
          // Invalid formats
          fc.string().filter((s: string) => s.length !== 52 || !/^[A-Za-z0-9+/]{52}$/.test(s))
        ),
        (token: string) => {
          const isValid = EncryptionService.validatePATFormat(token);
          const expectedValid = /^[A-Za-z0-9+/]{52}$/.test(token);
          expect(isValid).toBe(expectedValid);
        }
      ), { numRuns: 100 });
    });
  });

  describe('Unit tests for encryption edge cases', () => {
    test('should handle empty strings', async () => {
      const encrypted = await EncryptionService.encryptPAT('');
      expect(encrypted).toBeDefined();

      const decrypted = await EncryptionService.decryptPAT(encrypted);
      expect(decrypted).toBe('');
    });

    test('should handle special characters in PATs', async () => {
      const specialPAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr+/==';
      const encrypted = await EncryptionService.encryptPAT(specialPAT);
      const decrypted = await EncryptionService.decryptPAT(encrypted);

      expect(decrypted).toBe(specialPAT);
    });

    test('should reject malformed encrypted tokens', async () => {
      const malformed = 'not-base64-encoded!@#$%';
      const result = await EncryptionService.decryptPAT(malformed);

      expect(result).toBeNull();
    });

    test('should validate typical Azure DevOps PAT format', () => {
      // 52 characters (Base64)
      const validPAT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const invalidPAT = 'too-short';

      expect(EncryptionService.validatePATFormat(validPAT)).toBe(true);
      expect(EncryptionService.validatePATFormat(invalidPAT)).toBe(false);
    });
  });
});