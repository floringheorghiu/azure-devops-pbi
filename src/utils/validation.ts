// Data validation utilities

import { PBIData, APIError } from '../types';

export class ValidationService {
  /**
   * Validates PBI data completeness and format
   */
  static validatePBIData(data: any): data is PBIData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const required = ['id', 'title', 'state', 'description', 'workItemType'];
    for (const field of required) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        return false;
      }
    }

    // Validate types
    if (typeof data.id !== 'number' || data.id <= 0) {
      return false;
    }

    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      return false;
    }

    if (typeof data.state !== 'string' || data.state.trim().length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Sanitizes HTML content for safe display in Figma widgets
   */
  static sanitizeHTML(html: string): string {
    if (!html) return '';

    // Remove script tags and event handlers
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/on\w+="[^"]*"/gi, '');
    sanitized = sanitized.replace(/on\w+='[^']*'/gi, '');
    
    // Convert basic HTML tags to plain text
    sanitized = sanitized.replace(/<p[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/p>/gi, '\n');
    sanitized = sanitized.replace(/<br\s*\/?>/gi, '\n');
    sanitized = sanitized.replace(/<div[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/div>/gi, '\n');
    
    // Remove list tags but keep content
    sanitized = sanitized.replace(/<ul[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/ul>/gi, '');
    sanitized = sanitized.replace(/<ol[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/ol>/gi, '');
    sanitized = sanitized.replace(/<li[^>]*>/gi, '• ');
    sanitized = sanitized.replace(/<\/li>/gi, '\n');
    
    // Remove any remaining HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Convert common HTML entities
    sanitized = sanitized.replace(/&lt;/g, '<');
    sanitized = sanitized.replace(/&gt;/g, '>');
    sanitized = sanitized.replace(/&amp;/g, '&');
    sanitized = sanitized.replace(/&quot;/g, '"');
    sanitized = sanitized.replace(/&#39;/g, "'");
    sanitized = sanitized.replace(/&nbsp;/g, ' ');

    // Clean up multiple newlines and whitespace
    sanitized = sanitized.replace(/\n\s*\n/g, '\n');
    sanitized = sanitized.replace(/^\s+|\s+$/g, '');

    return sanitized;
  }

  /**
   * Truncates text to specified length with ellipsis
   */
  static truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Validates API error structure
   */
  static validateAPIError(error: any): error is APIError {
    return !!(
      error &&
      typeof error === 'object' &&
      typeof error.code === 'string' &&
      typeof error.message === 'string' &&
      typeof error.userMessage === 'string' &&
      typeof error.retryable === 'boolean'
    );
  }

  /**
   * Creates a standardized API error
   */
  static createAPIError(
    code: string,
    message: string,
    userMessage: string,
    retryable: boolean = false
  ): APIError {
    return {
      code,
      message,
      userMessage,
      retryable
    };
  }
}