// Property-based tests for encryption utilities

import * as fc from 'fast-check';
import { EncryptionService } from '../../src/utils/encryption';

describe('Feature: figma-devops-integration, Encryption Service', () => {
  describe('Property 1: PAT Encryption and Storage Security', () => {
    test('should encrypt and decrypt PATs correctly without exposing plain text', () => {
      fc.assert(fc.property(
        // Generate realistic PAT-like strings (52 base64 characters)
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), { 
          minLength: 52, 
          maxLength: 52 
        }),
        (originalPAT: string) => {
          // Encrypt the PAT
          const encrypted = EncryptionService.encryptPAT(originalPAT);
          
          // Verify encryption properties
          expect(encrypted).toBeDefined();
          expect(encrypted).not.toBe(originalPAT); // Should not be plain text
          expect(encrypted.length).toBeGreaterThan(originalPAT.length); // Should be longer due to encoding
          
          // Verify decryption works
          const decrypted = EncryptionService.decryptPAT(encrypted);
          expect(decrypted).toBe(originalPAT);
          
          // Verify encrypted token doesn't contain plain text
          expect(encrypted.includes(originalPAT)).toBe(false);
        }
      ), { numRuns: 100 });
    });

    test('should reject invalid encrypted tokens', () => {
      fc.assert(fc.property(
        fc.string().filter((s: string) => !s.includes('azure-devops-pbi-plugin-key')),
        (invalidToken: string) => {
          const result = EncryptionService.decryptPAT(invalidToken);
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
    test('should handle empty strings', () => {
      const encrypted = EncryptionService.encryptPAT('');
      expect(encrypted).toBeDefined();
      
      const decrypted = EncryptionService.decryptPAT(encrypted);
      expect(decrypted).toBe('');
    });

    test('should handle special characters in PATs', () => {
      const specialPAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr+/==';
      const encrypted = EncryptionService.encryptPAT(specialPAT);
      const decrypted = EncryptionService.decryptPAT(encrypted);
      
      expect(decrypted).toBe(specialPAT);
    });

    test('should reject malformed encrypted tokens', () => {
      const malformed = 'not-base64-encoded!@#$%';
      const result = EncryptionService.decryptPAT(malformed);
      
      expect(result).toBeNull();
    });

    test('should validate typical Azure DevOps PAT format', () => {
      const validPAT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX';
      const invalidPAT = 'too-short';
      
      expect(EncryptionService.validatePATFormat(validPAT)).toBe(true);
      expect(EncryptionService.validatePATFormat(invalidPAT)).toBe(false);
    });
  });
});