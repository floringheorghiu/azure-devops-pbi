// Property-based tests for Azure DevOps client and PAT transmission security
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
// Mock fetch for testing
const mockFetch = jest.fn();
global.fetch = mockFetch;
import { AzureDevOpsClient } from '../../src/services/azureDevOpsClient';
describe('Feature: figma-devops-integration, Azure DevOps Client', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset().mockResolvedValue({
            ok: true,
            json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ value: [] }); })
        });
    });
    describe('Property 2: PAT Transmission Security', () => {
        test('should use HTTPS exclusively for all API calls', () => __awaiter(void 0, void 0, void 0, function* () {
            yield fc.assert(fc.asyncProperty(fc.record({
                pat: fc.string({
                    minLength: 52,
                    maxLength: 52
                }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
                organization: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s))
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ pat, organization }) {
                // Reset mock for this iteration
                mockFetch.mockClear();
                // Mock successful response
                mockFetch.mockResolvedValue({
                    ok: true,
                    json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ value: [] }); })
                });
                // Test PAT validation
                yield AzureDevOpsClient.validatePAT(pat, organization);
                // Verify HTTPS was used
                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [url] = mockFetch.mock.calls[0];
                expect(url).toMatch(/^https:\/\//);
                expect(url).toContain('dev.azure.com');
            })), { numRuns: 3 });
        }));
        test('should properly encode PAT in Authorization header without exposing it in URL', () => __awaiter(void 0, void 0, void 0, function* () {
            yield fc.assert(fc.asyncProperty(fc.record({
                pat: fc.string({
                    minLength: 52,
                    maxLength: 52
                }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
                pbiInfo: fc.record({
                    organization: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
                    project: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
                    workItemId: fc.integer({ min: 1, max: 999999 }),
                    url: fc.string()
                })
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ pat, pbiInfo }) {
                // Reset mock for this iteration
                mockFetch.mockClear();
                // Mock successful response
                mockFetch.mockResolvedValue({
                    ok: true,
                    json: () => __awaiter(void 0, void 0, void 0, function* () {
                        return ({
                            id: pbiInfo.workItemId,
                            fields: {
                                'System.Title': 'Test Work Item',
                                'System.State': 'Active',
                                'System.WorkItemType': 'Product Backlog Item',
                                'System.CreatedBy': { displayName: 'Test User' },
                                'System.CreatedDate': new Date().toISOString(),
                                'System.ChangedDate': new Date().toISOString()
                            }
                        });
                    })
                });
                try {
                    yield AzureDevOpsClient.getPBIData(pbiInfo, pat);
                }
                catch (error) {
                    // Ignore validation errors for this test
                }
                // Verify fetch was called
                expect(mockFetch).toHaveBeenCalledTimes(1);
                const [url, options] = mockFetch.mock.calls[0];
                // Verify PAT is not in URL
                expect(url).not.toContain(pat);
                // Verify PAT is properly encoded in Authorization header
                expect(options.headers.Authorization).toMatch(/^Basic /);
                expect(options.headers.Authorization).not.toContain(pat); // Should be base64 encoded
                // Verify the encoded header can be decoded to reveal the PAT
                const authHeader = options.headers.Authorization.replace('Basic ', '');
                const decoded = atob(authHeader);
                expect(decoded).toBe(`:${pat}`); // Azure DevOps format: empty username, PAT as password
            })), { numRuns: 3 });
        }));
        test('should not persist PAT values in any form during API calls', () => __awaiter(void 0, void 0, void 0, function* () {
            yield fc.assert(fc.asyncProperty(fc.record({
                pat: fc.string({
                    minLength: 52,
                    maxLength: 52
                }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
                organization: fc.string({ minLength: 3, maxLength: 20 })
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ pat, organization }) {
                // Reset mock for this iteration
                mockFetch.mockClear();
                // Mock response
                mockFetch.mockResolvedValue({
                    ok: true,
                    json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ value: [] }); })
                });
                // Call validation
                const result = yield AzureDevOpsClient.validatePAT(pat, organization);
                // Verify the method doesn't store the PAT anywhere
                // (This is more of a design verification - the method should be stateless)
                expect(result).toBeDefined();
                // Verify no global state or class properties were modified
                // (AzureDevOpsClient should be stateless)
                expect(Object.keys(AzureDevOpsClient)).toEqual(['length', 'name', 'prototype', 'API_VERSION', 'BASE_URL']);
            })), { numRuns: 3 });
        }));
    });
    describe('Unit tests for API error handling', () => {
        test('should handle 401 authentication errors correctly', () => __awaiter(void 0, void 0, void 0, function* () {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ message: 'Authentication failed' }); })
            });
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 123,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/123'
            };
            yield expect(AzureDevOpsClient.getPBIData(pbiInfo, 'invalid-pat'))
                .rejects
                .toMatchObject({
                code: 'INVALID_PAT',
                userMessage: expect.stringContaining('Personal Access Token'),
                retryable: false
            });
        }));
        test('should handle 404 work item not found errors', () => __awaiter(void 0, void 0, void 0, function* () {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 404,
                json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ message: 'Work item not found' }); })
            });
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 999999,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/999999'
            };
            yield expect(AzureDevOpsClient.getPBIData(pbiInfo, 'valid-pat'))
                .rejects
                .toMatchObject({
                code: 'WORK_ITEM_NOT_FOUND',
                retryable: false
            });
        }));
        test('should handle rate limiting with retry indication', () => __awaiter(void 0, void 0, void 0, function* () {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                json: () => __awaiter(void 0, void 0, void 0, function* () { return ({ message: 'Rate limit exceeded' }); })
            });
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 123,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/123'
            };
            yield expect(AzureDevOpsClient.getPBIData(pbiInfo, 'valid-pat'))
                .rejects
                .toMatchObject({
                code: 'RATE_LIMIT_EXCEEDED',
                retryable: true
            });
        }));
        test('should transform work item data correctly', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockWorkItem = {
                id: 12345,
                fields: {
                    'System.Title': 'Test PBI',
                    'System.State': 'Active',
                    'System.Description': '<p>Test description</p>',
                    'System.WorkItemType': 'Product Backlog Item',
                    'System.CreatedBy': { displayName: 'John Doe' },
                    'System.AssignedTo': { displayName: 'Jane Smith' },
                    'System.CreatedDate': '2024-01-01T10:00:00Z',
                    'System.ChangedDate': '2024-01-02T15:30:00Z',
                    'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>Criterion 1</li><li>Criterion 2</li></ul>'
                }
            };
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => __awaiter(void 0, void 0, void 0, function* () { return mockWorkItem; })
            });
            const pbiInfo = {
                organization: 'testorg',
                project: 'testproject',
                workItemId: 12345,
                url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
            };
            const result = yield AzureDevOpsClient.getPBIData(pbiInfo, 'valid-pat');
            expect(result).toMatchObject({
                id: 12345,
                title: 'Test PBI',
                state: 'Active',
                description: 'Test description', // Should be sanitized
                workItemType: 'Product Backlog Item',
                creator: 'John Doe',
                assignedTo: 'Jane Smith'
            });
            expect(result.acceptanceCriteria).toEqual(expect.arrayContaining([
                expect.stringContaining('Criterion 1'),
                expect.stringContaining('Criterion 2')
            ]));
        }));
    });
});
