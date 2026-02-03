// Property-based tests for PAT storage security
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fc from 'fast-check';
// Mock figma.clientStorage for testing
const mockClientStorage = {
    setAsync: jest.fn(),
    getAsync: jest.fn(),
    deleteAsync: jest.fn()
};
// Mock figma global
global.figma = {
    clientStorage: mockClientStorage
};
import { ConfigStorageService } from '../../src/services/configStorage';
import { EncryptionService } from '../../src/utils/encryption';
describe('Feature: figma-devops-integration, Config Storage Service', () => {
    const STORAGE_KEY = 'azure_devops_config';
    beforeEach(() => {
        jest.clearAllMocks();
        mockClientStorage.setAsync.mockReset().mockResolvedValue(undefined);
        mockClientStorage.getAsync.mockReset().mockResolvedValue(null);
        mockClientStorage.deleteAsync.mockReset().mockResolvedValue(undefined);
    });
    describe('Property 1: Config Encryption and Storage Security', () => {
        test('should store config encrypted and retrieve it correctly without exposing plain text PAT', () => __awaiter(void 0, void 0, void 0, function* () {
            yield fc.assert(fc.asyncProperty(fc.record({
                pat: fc.string({ minLength: 52, maxLength: 52 }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
                organization: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
                acPattern: fc.string()
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ pat, organization, acPattern }) {
                mockClientStorage.setAsync.mockClear();
                mockClientStorage.getAsync.mockClear();
                mockClientStorage.setAsync.mockResolvedValue(undefined);
                mockClientStorage.getAsync.mockImplementation((key) => {
                    if (key === STORAGE_KEY) {
                        const encryptedPat = EncryptionService.encryptPAT(pat);
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
                yield ConfigStorageService.storeConfig({ pat, organization, acPattern: acPattern });
                expect(mockClientStorage.setAsync).toHaveBeenCalledTimes(1);
                const [key, storedValue] = mockClientStorage.setAsync.mock.calls[0];
                expect(key).toBe(STORAGE_KEY);
                expect(storedValue).not.toContain(pat);
                const retrievedConfig = yield ConfigStorageService.retrieveConfig();
                expect(retrievedConfig).toBeDefined();
                expect(retrievedConfig.pat).toBe(pat);
                expect(retrievedConfig.organization).toBe(organization);
                expect(retrievedConfig.acPattern).toBe(acPattern);
                const configInfo = yield ConfigStorageService.getConfigInfo();
                expect(configInfo).toBeDefined();
                expect(configInfo.organization).toBe(organization);
                expect(configInfo.acPattern).toBe(acPattern);
                expect(configInfo).not.toHaveProperty('encryptedPat');
            })), { numRuns: 3 });
        }));
        test('should reject invalid PAT formats during storage', () => __awaiter(void 0, void 0, void 0, function* () {
            yield fc.assert(fc.asyncProperty(fc.record({
                invalidPat: fc.string().filter((s) => !EncryptionService.validatePATFormat(s)),
                organization: fc.string({ minLength: 1, maxLength: 20 }),
                acPattern: fc.string()
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ invalidPat, organization, acPattern }) {
                mockClientStorage.setAsync.mockClear();
                yield expect(ConfigStorageService.storeConfig({ pat: invalidPat, organization, acPattern: acPattern }))
                    .rejects
                    .toThrow('Invalid PAT format');
                expect(mockClientStorage.setAsync).not.toHaveBeenCalled();
            })), { numRuns: 3 });
        }));
    });
    describe('Property 3: Config Cleanup Completeness', () => {
        test('should completely remove config data with no recoverable traces', () => __awaiter(void 0, void 0, void 0, function* () {
            yield fc.assert(fc.asyncProperty(fc.record({
                pat: fc.string({ minLength: 52, maxLength: 52 }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
                organization: fc.string({ minLength: 1, maxLength: 20 }),
                acPattern: fc.string()
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ pat, organization, acPattern }) {
                mockClientStorage.setAsync.mockClear();
                mockClientStorage.deleteAsync.mockClear();
                mockClientStorage.getAsync.mockClear();
                mockClientStorage.setAsync.mockResolvedValue(undefined);
                mockClientStorage.deleteAsync.mockResolvedValue(undefined);
                const encryptedPat = EncryptionService.encryptPAT(pat);
                const storedData = {
                    encryptedPat,
                    organization,
                    acPattern,
                    createdAt: new Date().toISOString(),
                };
                mockClientStorage.getAsync
                    .mockResolvedValueOnce(JSON.stringify(storedData))
                    .mockResolvedValue(null);
                yield ConfigStorageService.clearConfig();
                expect(mockClientStorage.deleteAsync).toHaveBeenCalledWith(STORAGE_KEY);
                const retrievedConfig = yield ConfigStorageService.retrieveConfig();
                expect(retrievedConfig).toBeNull();
                const configInfo = yield ConfigStorageService.getConfigInfo();
                expect(configInfo).toBeNull();
            })), { numRuns: 3 });
        }));
    });
    describe('Unit tests for config storage edge cases', () => {
        test('should handle corrupted storage data gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
            mockClientStorage.getAsync.mockResolvedValue('invalid-json-data');
            const retrievedConfig = yield ConfigStorageService.retrieveConfig();
            expect(retrievedConfig).toBeNull();
            const configInfo = yield ConfigStorageService.getConfigInfo();
            expect(configInfo).toBeNull();
        }));
        test('should handle missing storage data', () => __awaiter(void 0, void 0, void 0, function* () {
            mockClientStorage.getAsync.mockResolvedValue(null);
            const retrievedConfig = yield ConfigStorageService.retrieveConfig();
            expect(retrievedConfig).toBeNull();
            const configInfo = yield ConfigStorageService.getConfigInfo();
            expect(configInfo).toBeNull();
        }));
    });
});
