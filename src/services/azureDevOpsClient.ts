import { base64Encode } from '../utils/encryption';
import { ParsedPBIInfo, PBIData, APIError } from '../types';
import { ValidationService } from '../utils/validation';

export class AzureDevOpsClient {
  private static readonly API_VERSION = '7.1';
  private static readonly BASE_URL = 'https://azure-devops-proxy.adosync.workers.dev/api/pbi';

  /**
   * Validates a PAT by attempting to access the organization's projects
   * @param pat Personal Access Token
   * @param organization Azure DevOps organization name
   * @returns True if PAT is valid and has required permissions
   */
  static async validatePAT(pat: string, organization: string): Promise<boolean> {
    try {
      const url = `${this.BASE_URL}/${organization}/_apis/projects?api-version=${this.API_VERSION}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.createAuthHeader(pat),
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      // Check if request was successful
      return response.ok;
    } catch (error: unknown) {
      console.error('PAT validation failed:', error);
      return false;
    }
  }

  /**
   * Creates Basic authentication header for Azure DevOps API
   * @param pat Personal Access Token
   * @returns Authorization header value
   */
  private static createAuthHeader(pat: string): string {
    // Aggressively clean PAT: remove any non-alphanumeric characters (Azure PATs are usually alphanumeric)
    // If PATs can contain symbols, we should verify, but for now this fixes the "invisible char" issue.
    const cleanPat = pat.replace(/[^a-zA-Z0-9]/g, '');

    if (cleanPat.length !== pat.length) {
      console.warn(`AzureDevOpsClient: Sanitized ${pat.length - cleanPat.length} invalid characters from PAT`);
      console.log(`AzureDevOpsClient: Original Len: ${pat.length}, Clean Len: ${cleanPat.length}`);
    }

    const credentials = base64Encode(`:${cleanPat}`);
    return `Basic ${credentials}`;
  }

  /**
   * Retrieves PBI data from Azure DevOps
   * @param pbiInfo Parsed PBI information
   * @param pat Personal Access Token
   * @returns PBI data or throws APIError
   */
  static async getPBIData(pbiInfo: ParsedPBIInfo, pat: string): Promise<PBIData> {
    console.log('AzureDevOpsClient: Starting fetch for', pbiInfo.workItemId);

    try {
      // Encode URL components to handle spaces in Project names
      const org = encodeURIComponent(pbiInfo.organization);
      const proj = encodeURIComponent(pbiInfo.project);
      const url = `${this.BASE_URL}/${org}/${proj}/_apis/wit/workitems/${pbiInfo.workItemId}?api-version=${this.API_VERSION}`;

      console.log(`AzureDevOpsClient: Fetching URL: ${url}`);

      const authHeader = this.createAuthHeader(pat);
      console.log(`AzureDevOpsClient: Auth Header generated (Len: ${authHeader.length})`);

      // Use Promise.race for timeout since AbortController is not supported in Figma's QuickJS
      const fetchPromise = fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 10 seconds')), 10000);
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      console.log('AzureDevOpsClient: Response received', response.status); // TRACE API

      if (!response.ok) {
        throw await this.handleAPIError(response);
      }

      const workItem = await response.json();
      return this.transformWorkItem(workItem);

    } catch (error: unknown) {
      console.error('getPBIData: Error caught during PBI data retrieval:', error);
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw APIError
      }

      throw ValidationService.createAPIError(
        'NETWORK_ERROR',
        `Network request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'Unable to connect to Azure DevOps. Please check your internet connection.',
        true
      );
    }
  }

  /**
   * Creates Basic authentication header for Azure DevOps API
   * @param pat Personal Access Token
   * @returns Authorization header value
   */


  /**
   * Handles API error responses and creates appropriate APIError objects
   * @param response Failed HTTP response
   * @returns APIError with appropriate error details
   */
  private static async handleAPIError(response: Response): Promise<APIError> {
    const status = response.status;

    try {
      const errorBody = await response.json();
      const message = errorBody.message || errorBody.error?.message || 'Unknown API error';

      switch (status) {
        case 401:
          return ValidationService.createAPIError(
            'INVALID_PAT',
            `Authentication failed: ${message}`,
            'Your Personal Access Token is invalid or expired. Please update your credentials.',
            false
          );

        case 403:
          return ValidationService.createAPIError(
            'INSUFFICIENT_PERMISSIONS',
            `Access denied: ${message}`,
            'Your Personal Access Token lacks the required permissions to access this work item.',
            false
          );

        case 404:
          return ValidationService.createAPIError(
            'WORK_ITEM_NOT_FOUND',
            `Work item not found: ${message}`,
            'The specified work item does not exist or you do not have access to it.',
            false
          );

        case 429:
          return ValidationService.createAPIError(
            'RATE_LIMIT_EXCEEDED',
            `Rate limit exceeded: ${message}`,
            'Too many requests. Please wait a moment before trying again.',
            true
          );

        case 500:
        case 502:
        case 503:
        case 504:
          return ValidationService.createAPIError(
            'SERVER_ERROR',
            `Server error (${status}): ${message}`,
            'Azure DevOps service is temporarily unavailable. Please try again later.',
            true
          );

        default:
          return ValidationService.createAPIError(
            'API_ERROR',
            `HTTP ${status}: ${message}`,
            'An unexpected error occurred while accessing Azure DevOps.',
            false
          );
      }
    } catch (parseError: unknown) {
      console.error('handleAPIError: Error parsing error response:', parseError);
      return ValidationService.createAPIError(
        'API_ERROR',
        `HTTP ${status}: Unable to parse error response`,
        'An unexpected error occurred while accessing Azure DevOps.',
        status >= 500
      );
    }
  }

  /**
   * Transforms Azure DevOps work item response to our PBIData format
   * @param workItem Raw work item from Azure DevOps API
   * @returns Formatted PBI data
   */
  private static transformWorkItem(workItem: any): PBIData {
    const fields = workItem.fields || {};

    // Extract acceptance criteria and convert from HTML
    const acceptanceCriteria = this.extractAcceptanceCriteria(
      fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || ''
    );

    return {
      id: workItem.id,
      title: fields['System.Title'] || 'Untitled Work Item',
      state: fields['System.State'] || 'Unknown',
      description: ValidationService.sanitizeHTML(fields['System.Description'] || ''),
      acceptanceCriteria,
      assignedTo: fields['System.AssignedTo']?.displayName,
      lastUpdated: new Date(fields['System.ChangedDate'] || fields['System.CreatedDate'] || Date.now()),
      workItemType: fields['System.WorkItemType'] || 'Unknown',
      creator: fields['System.CreatedBy']?.displayName || 'Unknown',
      createdDate: new Date(fields['System.CreatedDate'] || Date.now()),
      modifiedDate: new Date(fields['System.ChangedDate'] || fields['System.CreatedDate'] || Date.now()),
      // New fields mapping
      tags: (fields['System.Tags'] || '').split(';').map((t: string) => t.trim()).filter((t: string) => t),
      areaPath: fields['System.AreaPath'] || '',
      iterationPath: fields['System.IterationPath'] || '',
      boardColumn: fields['System.BoardColumn'] || '',
      boardColumnDone: fields['System.BoardColumnDone'] || false,
      changedBy: fields['System.ChangedBy']?.displayName || 'Unknown'
    };
  }

  /**
   * Extracts and formats acceptance criteria from HTML content
   * @param htmlContent HTML content from Azure DevOps
   * @returns Array of acceptance criteria strings
   */
  private static extractAcceptanceCriteria(htmlContent: string): string[] {
    if (!htmlContent) {
      return [];
    }

    // Sanitize HTML first
    const sanitized = ValidationService.sanitizeHTML(htmlContent);

    // Split by common delimiters and clean up
    const criteria = sanitized
      .split(/\n|<br\s*\/?>|<\/p>|<\/li>|<\/div>/i)
      .map(criterion => criterion.replace(/<[^>]*>/g, '').trim())
      .filter(criterion => criterion.length > 0 && !criterion.match(/^<\w+/));

    return criteria.length > 0 ? criteria : [sanitized];
  }
}