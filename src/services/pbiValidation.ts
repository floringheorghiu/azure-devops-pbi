// PBI validation service for Azure DevOps integration

import { ParsedPBIInfo, PBIData, APIError } from '../types';
import { AzureDevOpsClient } from './azureDevOpsClient';
import { ValidationService } from '../utils/validation';

export interface PBIValidationResult {
  isValid: boolean;
  data?: PBIData;
  error?: APIError;
}

export class PBIValidationService {
  /**
   * Validates a PBI by checking if it exists and is accessible
   * @param pbiInfo Parsed PBI information
   * @param pat Personal Access Token
   * @returns Validation result with PBI data or error
   */
  static async validatePBI(pbiInfo: ParsedPBIInfo, pat: string): Promise<PBIValidationResult> {
    try {
      // First validate the PBI info structure
      if (!this.validatePBIInfoStructure(pbiInfo)) {
        return {
          isValid: false,
          error: ValidationService.createAPIError(
            'INVALID_PBI_INFO',
            'Invalid PBI information structure',
            'The provided work item information is incomplete or invalid.',
            false
          )
        };
      }

      // Attempt to retrieve PBI data from Azure DevOps
      const pbiData = await AzureDevOpsClient.getPBIData(pbiInfo, pat);

      // Validate the retrieved data
      if (!ValidationService.validatePBIData(pbiData)) {
        return {
          isValid: false,
          error: ValidationService.createAPIError(
            'INVALID_PBI_DATA',
            'Retrieved PBI data is incomplete or invalid',
            'The work item data from Azure DevOps is missing required fields.',
            false
          )
        };
      }

      return {
        isValid: true,
        data: pbiData
      };

    } catch (error: unknown) {
      // If it's already an APIError, return it
      if (ValidationService.validateAPIError(error)) {
        return {
          isValid: false,
          error: error as APIError
        };
      }

      // Otherwise, create a generic error
      return {
        isValid: false,
        error: ValidationService.createAPIError(
          'VALIDATION_ERROR',
          `PBI validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'Unable to validate the work item. Please check your connection and try again.',
          true
        )
      };
    }
  }

  /**
   * Validates PBI info structure without making API calls
   * @param pbiInfo PBI information to validate
   * @returns True if structure is valid
   */
  static validatePBIInfoStructure(pbiInfo: ParsedPBIInfo): boolean {
    if (!pbiInfo || typeof pbiInfo !== 'object') {
      return false;
    }

    // Check required fields
    if (!pbiInfo.organization || typeof pbiInfo.organization !== 'string' || pbiInfo.organization.trim().length === 0) {
      return false;
    }

    if (!pbiInfo.project || typeof pbiInfo.project !== 'string' || pbiInfo.project.trim().length === 0) {
      return false;
    }

    if (!pbiInfo.workItemId || typeof pbiInfo.workItemId !== 'number' || pbiInfo.workItemId <= 0) {
      return false;
    }

    if (!pbiInfo.url || typeof pbiInfo.url !== 'string' || pbiInfo.url.trim().length === 0) {
      return false;
    }

    // Validate organization and project names (more permissive Azure DevOps naming rules)
    const nameRegex = /^[a-zA-Z0-9\s\-_.( )]*$/; // More permissive regex

    if (!nameRegex.test(pbiInfo.organization)) {
      return false;
    }

    if (!nameRegex.test(pbiInfo.project)) {
      return false;
    }

    return true;
  }

  /**
   * Checks if a PBI exists without retrieving full data (lightweight validation)
   * @param pbiInfo Parsed PBI information
   * @param pat Personal Access Token
   * @returns True if PBI exists and is accessible
   */
  static async pbiExists(pbiInfo: ParsedPBIInfo, pat: string): Promise<boolean> {
    try {
      const result = await this.validatePBI(pbiInfo, pat);
      return result.isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validates multiple PBIs in batch
   * @param pbiInfos Array of PBI information
   * @param pat Personal Access Token
   * @returns Array of validation results
   */
  static async validateMultiplePBIs(pbiInfos: ParsedPBIInfo[], pat: string): Promise<PBIValidationResult[]> {
    const results: PBIValidationResult[] = [];

    // Process in parallel but limit concurrency to avoid rate limiting
    const batchSize = 3;
    for (let i = 0; i < pbiInfos.length; i += batchSize) {
      const batch = pbiInfos.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(pbiInfo => this.validatePBI(pbiInfo, pat))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Creates user-friendly error messages for common validation failures
   * @param error API error from validation
   * @returns User-friendly error message with guidance
   */
  static createUserFriendlyErrorMessage(error: APIError): string {
    switch (error.code) {
      case 'INVALID_PAT':
        return 'Your Personal Access Token is invalid or expired. Please update your credentials in the plugin settings.';

      case 'WORK_ITEM_NOT_FOUND':
        return 'The work item could not be found. It may have been deleted or you may not have permission to access it.';

      case 'INSUFFICIENT_PERMISSIONS':
        return 'You don\'t have permission to access this work item. Please check with your Azure DevOps administrator.';

      case 'RATE_LIMIT_EXCEEDED':
        return 'Too many requests to Azure DevOps. Please wait a moment and try again.';

      case 'NETWORK_ERROR':
        return 'Unable to connect to Azure DevOps. Please check your internet connection and try again.';

      case 'INVALID_PBI_INFO':
        return 'The work item URL appears to be invalid or incomplete. Please check the URL and try again.';

      case 'INVALID_PBI_DATA':
        return 'The work item data from Azure DevOps is incomplete. This may be a temporary issue - please try again.';

      default:
        return error.userMessage || 'An unexpected error occurred while validating the work item.';
    }
  }
}