// Azure DevOps URL parsing utilities

import { ParsedPBIInfo } from '../types';

export interface URLParseResult {
  isValid: boolean;
  data?: ParsedPBIInfo;
  error?: string;
}

export class AzureDevOpsURLParser {
  /**
   * Parses various Azure DevOps URL formats to extract PBI information
   * @param url The Azure DevOps URL to parse
   * @returns Parsed PBI information or error
   */
  static parseURL(url: string): URLParseResult {
    try {
      const trimmedUrl = url.trim();
      
      const protocolMatch = trimmedUrl.match(/^(https?):\/\/(.*)/i);
      if (!protocolMatch) {
        return { isValid: false, error: 'Malformed URL: Missing protocol.' };
      }
      const [, protocol, rest] = protocolMatch;

      const hostAndPathMatch = rest.match(/^([^/]+)(.*)/);
      if (!hostAndPathMatch) {
        return { isValid: false, error: 'Malformed URL: Missing hostname.' };
      }
      const [, hostname, pathAndQuery] = hostAndPathMatch;

      let pathname = '';
      let search = '';

      const queryStartIndex = pathAndQuery.indexOf('?');
      if (queryStartIndex !== -1) {
        pathname = pathAndQuery.substring(0, queryStartIndex);
        search = pathAndQuery.substring(queryStartIndex);
      } else {
        pathname = pathAndQuery;
      }

      const customUrl = {
        hostname: hostname.toLowerCase(),
        pathname,
        search,
        protocol,
        originalUrl: trimmedUrl,
        searchParams: this.parseQueryParams(search) // Use custom parser
      };

      // Validate that this is an Azure DevOps URL
      if (!this.isAzureDevOpsURL(customUrl.hostname)) {
        return { 
          isValid: false,
          error: 'URL must be from dev.azure.com or visualstudio.com'
        };
      }

      let organization: string;
      let project: string;
      const hostnameLower = customUrl.hostname.toLowerCase();

      // Logic to extract organization and project based on hostname type
      if (hostnameLower.includes('.visualstudio.com')) {
        // Format: {organization}.visualstudio.com/{project}/_workitems/...
        const orgMatch = hostnameLower.match(/^(.*?)\.visualstudio\.com/);
        if (!orgMatch || !orgMatch[1]) {
          return { isValid: false, error: 'Invalid visualstudio.com URL: could not determine organization.' };
        }
        organization = decodeURIComponent(orgMatch[1]);
        
        const pathParts = customUrl.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length < 1) {
          return { isValid: false, error: 'Invalid visualstudio.com URL: missing project.' };
        }
        project = decodeURIComponent(pathParts[0]);

      } else if (hostnameLower.includes('dev.azure.com')) {
        // Format: dev.azure.com/{organization}/{project}/_apis/...
        const pathParts = customUrl.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length < 2) {
          return { isValid: false, error: 'Invalid dev.azure.com URL: missing organization or project.' };
        }
        organization = decodeURIComponent(pathParts[0]);
        project = decodeURIComponent(pathParts[1]);

      } else {
        return {
          isValid: false,
          error: 'Unsupported Azure DevOps URL format.'
        };
      }

      // Extract work item ID using various patterns
      const workItemId = this.extractWorkItemId(customUrl);
      
      if (!workItemId) {
        return {
          isValid: false,
          error: 'Could not find work item ID in URL'
        };
      }

      return {
        isValid: true,
        data: {
          organization,
          project,
          workItemId,
          url: trimmedUrl
        }
      };

    } catch (error: unknown) {
      return {
        isValid: false,
        error: `Malformed URL format: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Checks if URL is from Azure DevOps
   */
  private static isAzureDevOpsURL(hostname: string): boolean {
    return hostname.includes('dev.azure.com') || 
           hostname.includes('visualstudio.com');
  }

  /**
   * Extracts work item ID from various URL patterns
   */
  private static extractWorkItemId(customUrl: { pathname: string; searchParams: Map<string, string> }): number | null {
    // Pattern 1: Direct edit URL - /edit/{id}
    const editMatch = customUrl.pathname.match(/\/edit\/(\d+)/);
    if (editMatch) {
      return parseInt(editMatch[1], 10);
    }

    // Pattern 2: Query parameter - ?workitem={id}
    const queryId = customUrl.searchParams.get('workitem');
    if (queryId) {
      const id = parseInt(queryId, 10);
      if (!isNaN(id)) {
        return id;
      }
    }

    // Pattern 3: Board URL with workitem parameter
    const workitemParam = customUrl.searchParams.get('workItem');
    if (workitemParam) {
      const id = parseInt(workitemParam, 10);
      if (!isNaN(id)) {
        return id;
      }
    }

    // Pattern 4: Path-based ID extraction for other formats
    const pathMatch = customUrl.pathname.match(/\/workitems\/(\d+)/);
    if (pathMatch) {
      return parseInt(pathMatch[1], 10);
    }

    return null;
  }

  /**
   * Manually parses a query string into a Map of key-value pairs.
   */
  private static parseQueryParams(queryString: string): Map<string, string> {
    const params = new Map<string, string>();
    if (!queryString || queryString.length <= 1) {
      return params; 
    }
    const query = queryString.startsWith('?') ? queryString.substring(1) : queryString;

    query.split('&').forEach(pair => {
      const parts = pair.split('=');
      if (parts.length === 2) {
        const key = decodeURIComponent(parts[0]);
        const value = decodeURIComponent(parts[1]);
        params.set(key, value);
      } else if (parts.length === 1 && parts[0]) {
        const key = decodeURIComponent(parts[0]);
        params.set(key, '');
      }
    });
    return params;
  }

  /**
   * Validates that extracted PBI info is complete and valid
   */
  static validatePBIInfo(pbiInfo: ParsedPBIInfo): boolean {
    return !!(
      pbiInfo.organization &&
      pbiInfo.project &&
      pbiInfo.workItemId &&
      pbiInfo.workItemId > 0 &&
      pbiInfo.url
    );
  }
}