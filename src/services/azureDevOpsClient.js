// Azure DevOps API client for PAT validation and PBI data retrieval
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { ValidationService } from '../utils/validation';
export class AzureDevOpsClient {
    /**
     * Validates a PAT by attempting to access the organization's projects
     * @param pat Personal Access Token
     * @param organization Azure DevOps organization name
     * @returns True if PAT is valid and has required permissions
     */
    static validatePAT(pat, organization) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const url = `${this.BASE_URL}/${organization}/_apis/projects?api-version=${this.API_VERSION}`;
                const response = yield fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': this.createAuthHeader(pat),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                // Check if request was successful
                return response.ok;
            }
            catch (error) {
                console.error('PAT validation failed:', error);
                return false;
            }
        });
    }
    /**
     * Retrieves PBI data from Azure DevOps
     * @param pbiInfo Parsed PBI information
     * @param pat Personal Access Token
     * @returns PBI data or throws APIError
     */
    static getPBIData(pbiInfo, pat) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const url = `${this.BASE_URL}/${pbiInfo.organization}/${pbiInfo.project}/_apis/wit/workitems/${pbiInfo.workItemId}?api-version=${this.API_VERSION}`;
                const response = yield fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': this.createAuthHeader(pat),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                if (!response.ok) {
                    throw yield this.handleAPIError(response);
                }
                const workItem = yield response.json();
                return this.transformWorkItem(workItem);
            }
            catch (error) {
                if (error instanceof Error && 'code' in error) {
                    throw error; // Re-throw APIError
                }
                throw ValidationService.createAPIError('NETWORK_ERROR', `Network request failed: ${error}`, 'Unable to connect to Azure DevOps. Please check your internet connection.', true);
            }
        });
    }
    /**
     * Creates Basic authentication header for Azure DevOps API
     * @param pat Personal Access Token
     * @returns Authorization header value
     */
    static createAuthHeader(pat) {
        // Azure DevOps uses empty username with PAT as password
        const credentials = btoa(`:${pat}`);
        return `Basic ${credentials}`;
    }
    /**
     * Handles API error responses and creates appropriate APIError objects
     * @param response Failed HTTP response
     * @returns APIError with appropriate error details
     */
    static handleAPIError(response) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const status = response.status;
            try {
                const errorBody = yield response.json();
                const message = errorBody.message || ((_a = errorBody.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown API error';
                switch (status) {
                    case 401:
                        return ValidationService.createAPIError('INVALID_PAT', `Authentication failed: ${message}`, 'Your Personal Access Token is invalid or expired. Please update your credentials.', false);
                    case 403:
                        return ValidationService.createAPIError('INSUFFICIENT_PERMISSIONS', `Access denied: ${message}`, 'Your Personal Access Token lacks the required permissions to access this work item.', false);
                    case 404:
                        return ValidationService.createAPIError('WORK_ITEM_NOT_FOUND', `Work item not found: ${message}`, 'The specified work item does not exist or you do not have access to it.', false);
                    case 429:
                        return ValidationService.createAPIError('RATE_LIMIT_EXCEEDED', `Rate limit exceeded: ${message}`, 'Too many requests. Please wait a moment before trying again.', true);
                    case 500:
                    case 502:
                    case 503:
                    case 504:
                        return ValidationService.createAPIError('SERVER_ERROR', `Server error (${status}): ${message}`, 'Azure DevOps service is temporarily unavailable. Please try again later.', true);
                    default:
                        return ValidationService.createAPIError('API_ERROR', `HTTP ${status}: ${message}`, 'An unexpected error occurred while accessing Azure DevOps.', false);
                }
            }
            catch (parseError) {
                return ValidationService.createAPIError('API_ERROR', `HTTP ${status}: Unable to parse error response`, 'An unexpected error occurred while accessing Azure DevOps.', status >= 500);
            }
        });
    }
    /**
     * Transforms Azure DevOps work item response to our PBIData format
     * @param workItem Raw work item from Azure DevOps API
     * @returns Formatted PBI data
     */
    static transformWorkItem(workItem) {
        var _a, _b;
        const fields = workItem.fields || {};
        // Extract acceptance criteria and convert from HTML
        const acceptanceCriteria = this.extractAcceptanceCriteria(fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '');
        return {
            id: workItem.id,
            title: fields['System.Title'] || 'Untitled Work Item',
            state: fields['System.State'] || 'Unknown',
            description: ValidationService.sanitizeHTML(fields['System.Description'] || ''),
            acceptanceCriteria,
            assignedTo: (_a = fields['System.AssignedTo']) === null || _a === void 0 ? void 0 : _a.displayName,
            lastUpdated: new Date(fields['System.ChangedDate'] || fields['System.CreatedDate'] || Date.now()),
            workItemType: fields['System.WorkItemType'] || 'Unknown',
            creator: ((_b = fields['System.CreatedBy']) === null || _b === void 0 ? void 0 : _b.displayName) || 'Unknown',
            createdDate: new Date(fields['System.CreatedDate'] || Date.now()),
            modifiedDate: new Date(fields['System.ChangedDate'] || fields['System.CreatedDate'] || Date.now())
        };
    }
    /**
     * Extracts and formats acceptance criteria from HTML content
     * @param htmlContent HTML content from Azure DevOps
     * @returns Array of acceptance criteria strings
     */
    static extractAcceptanceCriteria(htmlContent) {
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
AzureDevOpsClient.API_VERSION = '7.1';
AzureDevOpsClient.BASE_URL = 'https://dev.azure.com';
