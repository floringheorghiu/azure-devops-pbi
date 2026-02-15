// Property-based tests for Azure DevOps client and PAT transmission security

import * as fc from 'fast-check';

// Mock fetch for testing
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { AzureDevOpsClient } from '../../src/services/azureDevOpsClient';
import { ParsedPBIInfo } from '../../src/types';

describe('Feature: figma-devops-integration, Azure DevOps Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ value: [] })
    });
  });

  describe('Property 2: PAT Transmission Security', () => {
    test('should use HTTPS exclusively for all API calls', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          pat: fc.string({
            minLength: 52,
            maxLength: 52
          }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
          organization: fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9-]+$/.test(s))
        }),
        async ({ pat, organization }: { pat: string; organization: string }) => {
          // Reset mock for this iteration
          mockFetch.mockClear();

          // Mock successful response
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ value: [] })
          });

          // Test PAT validation
          await AzureDevOpsClient.validatePAT(pat, organization);

          // Verify HTTPS was used
          expect(mockFetch).toHaveBeenCalledTimes(1);
          const [url] = mockFetch.mock.calls[0];
          expect(url).toMatch(/^https:\/\//);
          expect(url).toContain('dev.azure.com');
        }
      ), { numRuns: 3 });
    });

    test('should properly encode PAT in Authorization header without exposing it in URL', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
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
        }),
        async ({ pat, pbiInfo }: { pat: string; pbiInfo: any }) => {
          // Reset mock for this iteration
          mockFetch.mockClear();

          // Mock successful response
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
              id: pbiInfo.workItemId,
              fields: {
                'System.Title': 'Test Work Item',
                'System.State': 'Active',
                'System.WorkItemType': 'Product Backlog Item',
                'System.CreatedBy': { displayName: 'Test User' },
                'System.CreatedDate': new Date().toISOString(),
                'System.ChangedDate': new Date().toISOString()
              }
            })
          });

          try {
            await AzureDevOpsClient.getPBIData(pbiInfo as ParsedPBIInfo, pat);
          } catch (error) {
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
        }
      ), { numRuns: 3 });
    });

    test('should not persist PAT values in any form during API calls', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          pat: fc.string({
            minLength: 52,
            maxLength: 52
          }).filter(s => /^[A-Za-z0-9+/]{52}$/.test(s)),
          organization: fc.string({ minLength: 3, maxLength: 20 })
        }),
        async ({ pat, organization }: { pat: string; organization: string }) => {
          // Reset mock for this iteration
          mockFetch.mockClear();

          // Mock response
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ value: [] })
          });

          // Call validation
          const result = await AzureDevOpsClient.validatePAT(pat, organization);

          // Verify the method doesn't store the PAT anywhere
          // (This is more of a design verification - the method should be stateless)
          expect(result).toBeDefined();

          // Verify no global state or class properties were modified
          // (AzureDevOpsClient should be stateless)
          expect(Object.keys(AzureDevOpsClient)).toEqual(['length', 'name', 'prototype', 'API_VERSION', 'BASE_URL']);
        }
      ), { numRuns: 3 });
    });
  });

  describe('Unit tests for API error handling', () => {
    test('should handle 401 authentication errors correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Authentication failed' })
      } as Response);

      const pbiInfo: ParsedPBIInfo = {
        organization: 'testorg',
        project: 'testproject',
        workItemId: 123,
        url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/123'
      };

      await expect(AzureDevOpsClient.getPBIData(pbiInfo, 'invalid-pat'))
        .rejects
        .toMatchObject({
          code: 'INVALID_PAT',
          userMessage: expect.stringContaining('Personal Access Token'),
          retryable: false
        });
    });

    test('should handle 404 work item not found errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Work item not found' })
      } as Response);

      const pbiInfo: ParsedPBIInfo = {
        organization: 'testorg',
        project: 'testproject',
        workItemId: 999999,
        url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/999999'
      };

      await expect(AzureDevOpsClient.getPBIData(pbiInfo, 'valid-pat'))
        .rejects
        .toMatchObject({
          code: 'WORK_ITEM_NOT_FOUND',
          retryable: false
        });
    });

    test('should handle rate limiting with retry indication', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Rate limit exceeded' })
      } as Response);

      const pbiInfo: ParsedPBIInfo = {
        organization: 'testorg',
        project: 'testproject',
        workItemId: 123,
        url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/123'
      };

      await expect(AzureDevOpsClient.getPBIData(pbiInfo, 'valid-pat'))
        .rejects
        .toMatchObject({
          code: 'RATE_LIMIT_EXCEEDED',
          retryable: true
        });
    });

    test('should transform work item data correctly', async () => {
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
        json: async () => mockWorkItem
      } as Response);

      const pbiInfo: ParsedPBIInfo = {
        organization: 'testorg',
        project: 'testproject',
        workItemId: 12345,
        url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
      };

      const result = await AzureDevOpsClient.getPBIData(pbiInfo, 'valid-pat');

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
    });
  });
});