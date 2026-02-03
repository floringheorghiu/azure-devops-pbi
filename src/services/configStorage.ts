import { encryptPAT, decryptPAT, validatePATFormat } from '../utils/encryption';
import { StoredConfig } from '../types';

export class ConfigStorageService {
  private static readonly STORAGE_KEY = 'azure_devops_config';

  /**
   * Stores config securely in Figma's clientStorage
   * @param config The configuration object to store
   */
  static async storeConfig(config: { organization: string; pat: string; acPattern?: string; visibleFields?: Record<string, boolean> }): Promise<void> {
    try {
      // Validate PAT if it's being updated (non-empty)
      if (config.pat && !validatePATFormat(config.pat)) {
        throw new Error('Invalid PAT format.');
      }

      let encryptedPat = '';

      if (config.pat) {
        // New PAT provided
        encryptedPat = await encryptPAT(config.pat);
      } else {
        // Use existing PAT
        const existingRaw = await figma.clientStorage.getAsync(this.STORAGE_KEY);
        if (existingRaw) {
          const parsed = JSON.parse(existingRaw);
          encryptedPat = parsed.encryptedPat;
        }

        if (!encryptedPat) {
          // If we still don't have a PAT, existing or new, we cannot proceed effectively unless we allow config without PAT (which breaks functionality)
          // But valid usage implies we must have it.
          throw new Error('PAT is required.');
        }
      }

      const storedConfig: StoredConfig = {
        organization: config.organization,
        encryptedPat: encryptedPat,
        acPattern: config.acPattern || '',
        visibleFields: config.visibleFields,
        createdAt: new Date(),
      };

      await figma.clientStorage.setAsync(this.STORAGE_KEY, JSON.stringify(storedConfig));
    } catch (error) {
      console.error('Failed to store config:', error);
      throw error;
    }
  }


  /**
   * Updates only the last base URL in the config
   * @param url The url to save
   */
  static async storeLastBaseUrl(url: string): Promise<void> {
    try {
      const existingRaw = await figma.clientStorage.getAsync(this.STORAGE_KEY);
      let storedConfig: StoredConfig;

      if (existingRaw) {
        storedConfig = JSON.parse(existingRaw);
        storedConfig.lastBaseUrl = url;
      } else {
        // Should not happen in normal flow as setup is required first, but safe fallback
        storedConfig = {
          organization: '',
          encryptedPat: '',
          acPattern: '',
          lastBaseUrl: url,
          createdAt: new Date()
        };
      }

      await figma.clientStorage.setAsync(this.STORAGE_KEY, JSON.stringify(storedConfig));
    } catch (error) {
      console.error('Failed to store base URL:', error);
    }
  }

  /**
   * Retrieves and decrypts the stored config
   * @returns The decrypted config or null if not found
   */
  static async retrieveConfig(): Promise<{ organization: string; pat: string; acPattern: string; visibleFields?: Record<string, boolean>; lastBaseUrl?: string } | null> {
    try {
      const storedData = await figma.clientStorage.getAsync(this.STORAGE_KEY);
      if (!storedData) return null;

      const parsedData: StoredConfig = JSON.parse(storedData);
      const pat = await decryptPAT(parsedData.encryptedPat);

      if (!pat) {
        console.warn('Failed to decrypt stored PAT.');
        return null;
      }

      return {
        organization: parsedData.organization,
        pat,
        acPattern: parsedData.acPattern,
        visibleFields: parsedData.visibleFields,
        lastBaseUrl: parsedData.lastBaseUrl
      };
    } catch (error) {
      console.error('Failed to retrieve config:', error);
      return null;
    }
  }

  /**
   * Retrieves non-sensitive parts of the config
   * @returns Config metadata or null if not found
   */
  static async getConfigInfo(): Promise<{ organization: string; acPattern: string; visibleFields?: Record<string, boolean>; pat?: boolean; lastBaseUrl?: string } | null> {
    try {
      const storedData = await figma.clientStorage.getAsync(this.STORAGE_KEY);
      if (!storedData) return null;

      const parsedData: StoredConfig = JSON.parse(storedData);

      return {
        organization: parsedData.organization,
        acPattern: parsedData.acPattern,
        visibleFields: parsedData.visibleFields,
        pat: !!(await decryptPAT(parsedData.encryptedPat)), // Verify if it can be decrypted with current key
        lastBaseUrl: parsedData.lastBaseUrl
      };
    } catch (error) {
      console.error('Failed to retrieve config info:', error);
      return null;
    }
  }

  /**
   * Removes the stored config from clientStorage
   */
  static async clearConfig(): Promise<void> {
    try {
      await figma.clientStorage.deleteAsync(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear config:', error);
      throw error;
    }
  }
}