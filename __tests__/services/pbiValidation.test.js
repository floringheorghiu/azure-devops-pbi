// Tests for PBI validation service
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { PBIValidationService } from '../../src/services/pbiValidation';
import { AzureDevOpsClient } from '../../src/services/azureDevOpsClient';
// Mock the Azure DevOps client
jest.mock('../../src/services/azureDevOpsClient');
const mockAzureDevOpsClient = AzureDevOpsClient;
describe('Feature: figma-devops-integration, PBI Validation Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('PBI Info Structure Validation', () => {
        test('should validate complete PBI info structure', () => {
            const validPBIInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 12345,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
            };
            const result = PBIValidationService.validatePBIInfoStructure(validPBIInfo);
            expect(result).toBe(true);
        });
        test('should reject invalid PBI info structures', () => {
            const invalidCases = [
                null,
                undefined,
                {},
                { organization: '', project: 'test', workItemId: 1, url: 'test' },
                { organization: 'test', project: '', workItemId: 1, url: 'test' },
                { organization: 'test', project: 'test', workItemId: 0, url: 'test' },
                { organization: 'test', project: 'test', workItemId: -1, url: 'test' },
                { organization: 'test', project: 'test', workItemId: 1, url: '' },
                { organization: 'test', project: 'test', workItemId: 'invalid', url: 'test' }
            ];
            invalidCases.forEach(invalidCase => {
                const result = PBIValidationService.validatePBIInfoStructure(invalidCase);
                expect(result).toBe(false);
            });
        });
        test('should validate organization and project naming rules', () => {
            const validNames = ['test', 'test-org', 'test_org', 'test.org', 'test123', '123test'];
            const invalidNames = ['-test', 'test-', '_test', 'test_', '.test', 'test.', 'te st', ''];
            validNames.forEach(name => {
                const pbiInfo = {
                    organization: name,
                    project: name,
                    workItemId: 1,
                    url: 'https://dev.azure.com/test/test/_workitems/edit/1'
                };
                expect(PBIValidationService.validatePBIInfoStructure(pbiInfo)).toBe(true);
            });
            invalidNames.forEach(name => {
                const pbiInfo = {
                    organization: name,
                    project: 'validproject',
                    workItemId: 1,
                    url: 'https://dev.azure.com/test/test/_workitems/edit/1'
                };
                expect(PBIValidationService.validatePBIInfoStructure(pbiInfo)).toBe(false);
            });
        });
    });
    describe('PBI Validation with API calls', () => {
        test('should validate existing PBI successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 12345,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
            };
            const mockPBIData = {
                id: 12345,
                title: 'Test PBI',
                state: 'Active',
                description: 'Test description',
                acceptanceCriteria: ['Criterion 1'],
                workItemType: 'Product Backlog Item',
                creator: 'Test User',
                createdDate: new Date(),
                modifiedDate: new Date(),
                lastUpdated: new Date()
            };
            mockAzureDevOpsClient.getPBIData.mockResolvedValue(mockPBIData);
            const result = yield PBIValidationService.validatePBI(pbiInfo, 'valid-pat');
            expect(result.isValid).toBe(true);
            expect(result.data).toEqual(mockPBIData);
            expect(result.error).toBeUndefined();
        }));
        test('should handle API errors gracefully', () => __awaiter(void 0, void 0, void 0, function* () {
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 99999,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/99999'
            };
            const mockError = {
                code: 'WORK_ITEM_NOT_FOUND',
                message: 'Work item not found',
                userMessage: 'The work item does not exist',
                retryable: false
            };
            mockAzureDevOpsClient.getPBIData.mockRejectedValue(mockError);
            const result = yield PBIValidationService.validatePBI(pbiInfo, 'valid-pat');
            expect(result.isValid).toBe(false);
            expect(result.data).toBeUndefined();
            expect(result.error).toEqual(mockError);
        }));
        test('should validate invalid PBI info structure before API call', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const invalidPBIInfo = {
                organization: '',
                project: 'testproject',
                workItemId: 12345,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
            };
            const result = yield PBIValidationService.validatePBI(invalidPBIInfo, 'valid-pat');
            expect(result.isValid).toBe(false);
            expect((_a = result.error) === null || _a === void 0 ? void 0 : _a.code).toBe('INVALID_PBI_INFO');
            expect(mockAzureDevOpsClient.getPBIData).not.toHaveBeenCalled();
        }));
    });
    describe('Batch PBI Validation', () => {
        test('should validate multiple PBIs in batches', () => __awaiter(void 0, void 0, void 0, function* () {
            const pbiInfos = [
                {
                    organization: 'testorg',
                    project: 'testproject',
                    workItemId: 1,
                    url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/1'
                },
                {
                    organization: 'testorg',
                    project: 'testproject',
                    workItemId: 2,
                    url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/2'
                }
            ];
            const mockPBIData = {
                id: 1,
                title: 'Test PBI',
                state: 'Active',
                description: 'Test description',
                acceptanceCriteria: ['Criterion 1'],
                workItemType: 'Product Backlog Item',
                creator: 'Test User',
                createdDate: new Date(),
                modifiedDate: new Date(),
                lastUpdated: new Date()
            };
            mockAzureDevOpsClient.getPBIData.mockResolvedValue(mockPBIData);
            const results = yield PBIValidationService.validateMultiplePBIs(pbiInfos, 'valid-pat');
            expect(results).toHaveLength(2);
            expect(results[0].isValid).toBe(true);
            expect(results[1].isValid).toBe(true);
            expect(mockAzureDevOpsClient.getPBIData).toHaveBeenCalledTimes(2);
        }));
    });
    describe('User-friendly error messages', () => {
        test('should provide helpful error messages for common failures', () => {
            const errorCases = [
                {
                    code: 'INVALID_PAT',
                    expectedMessage: 'Your Personal Access Token is invalid or expired'
                },
                {
                    code: 'WORK_ITEM_NOT_FOUND',
                    expectedMessage: 'The work item could not be found'
                },
                {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    expectedMessage: 'You don\'t have permission to access this work item'
                },
                {
                    code: 'RATE_LIMIT_EXCEEDED',
                    expectedMessage: 'Too many requests to Azure DevOps'
                },
                {
                    code: 'NETWORK_ERROR',
                    expectedMessage: 'Unable to connect to Azure DevOps'
                }
            ];
            errorCases.forEach(({ code, expectedMessage }) => {
                const error = {
                    code,
                    message: 'Technical message',
                    userMessage: 'Generic user message',
                    retryable: false
                };
                const friendlyMessage = PBIValidationService.createUserFriendlyErrorMessage(error);
                expect(friendlyMessage).toContain(expectedMessage);
            });
        });
        test('should fall back to original user message for unknown errors', () => {
            const error = {
                code: 'UNKNOWN_ERROR',
                message: 'Technical message',
                userMessage: 'Original user message',
                retryable: false
            };
            const friendlyMessage = PBIValidationService.createUserFriendlyErrorMessage(error);
            expect(friendlyMessage).toBe('Original user message');
        });
    });
    describe('PBI existence check', () => {
        test('should return true for existing PBI', () => __awaiter(void 0, void 0, void 0, function* () {
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 12345,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
            };
            const mockPBIData = {
                id: 12345,
                title: 'Test PBI',
                state: 'Active',
                description: 'Test description',
                acceptanceCriteria: ['Criterion 1'],
                workItemType: 'Product Backlog Item',
                creator: 'Test User',
                createdDate: new Date(),
                modifiedDate: new Date(),
                lastUpdated: new Date()
            };
            mockAzureDevOpsClient.getPBIData.mockResolvedValue(mockPBIData);
            const exists = yield PBIValidationService.pbiExists(pbiInfo, 'valid-pat');
            expect(exists).toBe(true);
        }));
        test('should return false for non-existing PBI', () => __awaiter(void 0, void 0, void 0, function* () {
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 99999,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/99999'
            };
            const mockError = {
                code: 'WORK_ITEM_NOT_FOUND',
                message: 'Work item not found',
                userMessage: 'The work item does not exist',
                retryable: false
            };
            mockAzureDevOpsClient.getPBIData.mockRejectedValue(mockError);
            const exists = yield PBIValidationService.pbiExists(pbiInfo, 'valid-pat');
            expect(exists).toBe(false);
        }));
    });
});
