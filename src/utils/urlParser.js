// Azure DevOps URL parsing utilities
export class AzureDevOpsURLParser {
    /**
     * Parses various Azure DevOps URL formats to extract PBI information
     * @param url The Azure DevOps URL to parse
     * @returns Parsed PBI information or error
     */
    static parseURL(url) {
        try {
            const trimmedUrl = url.trim();
            const urlObj = new URL(trimmedUrl);
            // Validate that this is an Azure DevOps URL
            if (!this.isAzureDevOpsURL(urlObj)) {
                return {
                    isValid: false,
                    error: 'URL must be from dev.azure.com or visualstudio.com'
                };
            }
            // Extract organization and project from path
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            if (pathParts.length < 2) {
                return {
                    isValid: false,
                    error: 'Invalid URL structure - missing organization or project'
                };
            }
            const organization = pathParts[0];
            const project = pathParts[1];
            // Extract work item ID using various patterns
            const workItemId = this.extractWorkItemId(urlObj);
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
        }
        catch (error) {
            return {
                isValid: false,
                error: 'Malformed URL format'
            };
        }
    }
    /**
     * Checks if URL is from Azure DevOps
     */
    static isAzureDevOpsURL(urlObj) {
        const hostname = urlObj.hostname.toLowerCase();
        return hostname.includes('dev.azure.com') ||
            hostname.includes('visualstudio.com');
    }
    /**
     * Extracts work item ID from various URL patterns
     */
    static extractWorkItemId(urlObj) {
        // Pattern 1: Direct edit URL - /edit/{id}
        const editMatch = urlObj.pathname.match(/\/edit\/(\d+)/);
        if (editMatch) {
            return parseInt(editMatch[1], 10);
        }
        // Pattern 2: Query parameter - ?workitem={id}
        const queryId = urlObj.searchParams.get('workitem');
        if (queryId) {
            const id = parseInt(queryId, 10);
            if (!isNaN(id)) {
                return id;
            }
        }
        // Pattern 3: Board URL with workitem parameter
        const workitemParam = urlObj.searchParams.get('workItem');
        if (workitemParam) {
            const id = parseInt(workitemParam, 10);
            if (!isNaN(id)) {
                return id;
            }
        }
        // Pattern 4: Path-based ID extraction for other formats
        const pathMatch = urlObj.pathname.match(/\/workitems\/(\d+)/);
        if (pathMatch) {
            return parseInt(pathMatch[1], 10);
        }
        return null;
    }
    /**
     * Validates that extracted PBI info is complete and valid
     */
    static validatePBIInfo(pbiInfo) {
        return !!(pbiInfo.organization &&
            pbiInfo.project &&
            pbiInfo.workItemId &&
            pbiInfo.workItemId > 0 &&
            pbiInfo.url);
    }
}
