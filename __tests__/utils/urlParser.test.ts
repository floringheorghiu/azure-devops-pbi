// Property-based tests for URL parsing utilities

import * as fc from 'fast-check';
import { AzureDevOpsURLParser } from '../../src/utils/urlParser';

describe('Feature: figma-devops-integration, URL Parser', () => {
  describe('Property 4: URL Parsing Consistency', () => {
    test('should extract same organization, project, and work item ID regardless of URL format', () => {
      fc.assert(fc.property(
        fc.record({
          org: fc.stringOf(fc.char().filter((c: string) => /[a-zA-Z0-9-]/.test(c)), { minLength: 3, maxLength: 20 }),
          project: fc.stringOf(fc.char().filter((c: string) => /[a-zA-Z0-9-]/.test(c)), { minLength: 3, maxLength: 20 }),
          workItemId: fc.integer({ min: 1, max: 999999 })
        }),
        ({ org, project, workItemId }: { org: string; project: string; workItemId: number }) => {
          // Generate different URL formats for the same PBI
          const urls = [
            `https://dev.azure.com/${org}/${project}/_workitems/edit/${workItemId}`,
            `https://dev.azure.com/${org}/${project}/_boards/board/t/team/Stories/?workitem=${workItemId}`,
            `https://dev.azure.com/${org}/${project}/_queries/query/123/?workitem=${workItemId}`,
            `https://${org}.visualstudio.com/${project}/_workitems/edit/${workItemId}`
          ];

          const results = urls.map(url => AzureDevOpsURLParser.parseURL(url));
          const validResults = results.filter(r => r.isValid && r.data);

          // All valid results should have the same extracted data
          if (validResults.length > 1) {
            const first = validResults[0].data!;
            for (let i = 1; i < validResults.length; i++) {
              const current = validResults[i].data!;
              expect(current.organization).toBe(first.organization);
              expect(current.project).toBe(first.project);
              expect(current.workItemId).toBe(first.workItemId);
            }
          }
        }
      ), { numRuns: 10 });
    });
  });

  describe('Property 5: URL Validation Rejection', () => {
    test('should reject invalid URLs with specific guidance', () => {
      fc.assert(fc.property(
        fc.oneof(
          // Invalid domains
          fc.record({
            domain: fc.constantFrom('google.com', 'github.com', 'microsoft.com'),
            path: fc.string()
          }).map(({ domain, path }: { domain: string; path: string }) => `https://${domain}/${path}`),
          
          // Malformed URLs
          fc.string().filter((s: string) => !s.includes('dev.azure.com') && !s.includes('visualstudio.com')),
          
          // URLs without work item IDs
          fc.record({
            org: fc.string({ minLength: 1, maxLength: 20 }),
            project: fc.string({ minLength: 1, maxLength: 20 })
          }).map(({ org, project }: { org: string; project: string }) => `https://dev.azure.com/${org}/${project}/_boards`)
        ),
        (invalidUrl: string) => {
          const result = AzureDevOpsURLParser.parseURL(invalidUrl);
          
          expect(result.isValid).toBe(false);
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          expect(result.error!.length).toBeGreaterThan(0);
          expect(result.data).toBeUndefined();
        }
      ), { numRuns: 10 });
    });
  });

  describe('Unit tests for specific URL formats', () => {
    test('should parse direct edit URLs correctly', () => {
      const url = 'https://dev.azure.com/myorg/myproject/_workitems/edit/12345';
      const result = AzureDevOpsURLParser.parseURL(url);
      
      expect(result.isValid).toBe(true);
      expect(result.data).toEqual({
        organization: 'myorg',
        project: 'myproject',
        workItemId: 12345,
        url: url
      });
    });

    test('should parse board URLs with query parameters', () => {
      const url = 'https://dev.azure.com/myorg/myproject/_boards/board/t/team/Stories/?workitem=67890';
      const result = AzureDevOpsURLParser.parseURL(url);
      
      expect(result.isValid).toBe(true);
      expect(result.data?.workItemId).toBe(67890);
    });

    test('should handle URL encoding and special characters', () => {
      const url = 'https://dev.azure.com/my-org/my%20project/_workitems/edit/12345';
      const result = AzureDevOpsURLParser.parseURL(url);
      
      expect(result.isValid).toBe(true);
      expect(result.data?.organization).toBe('my-org');
      expect(result.data?.project).toBe('my%20project');
    });

    test('should reject non-Azure DevOps URLs', () => {
      const url = 'https://github.com/user/repo/issues/123';
      const result = AzureDevOpsURLParser.parseURL(url);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('dev.azure.com');
    });
  });
});