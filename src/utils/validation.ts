// Data validation utilities

import { PBIData, APIError } from '../types';

export class ValidationService {
  /**
   * Validates PBI data completeness and format
   */
  static validatePBIData(data: unknown): data is PBIData {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;

    if (!d || typeof d !== 'object') {
      return false;
    }

    const required = ['id', 'title', 'state', 'description', 'workItemType'];
    for (const field of required) {
      if (!(field in d) || d[field] === null || d[field] === undefined) {
        return false;
      }
    }

    // Validate types
    if (typeof d.id !== 'number' || d.id <= 0) {
      return false;
    }

    if (typeof d.title !== 'string' || d.title.trim().length === 0) {
      return false;
    }

    if (typeof d.state !== 'string' || d.state.trim().length === 0) {
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
  static validateAPIError(error: unknown): error is APIError {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = error as any;
    return !!(
      e &&
      typeof e === 'object' &&
      typeof e.code === 'string' &&
      typeof e.message === 'string' &&
      typeof e.userMessage === 'string' &&
      typeof e.retryable === 'boolean'
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