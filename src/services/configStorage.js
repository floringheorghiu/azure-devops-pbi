// Config storage service using Figma's clientStorage
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { EncryptionService } from '../utils/encryption';
export class ConfigStorageService {
    /**
     * Stores config securely in Figma's clientStorage
     * @param config The configuration object to store
     */
    static storeConfig(config) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!EncryptionService.validatePATFormat(config.pat)) {
                    throw new Error('Invalid PAT format.');
                }
                const encryptedPat = EncryptionService.encryptPAT(config.pat);
                const storedConfig = {
                    organization: config.organization,
                    encryptedPat,
                    acPattern: config.acPattern || '',
                    createdAt: new Date(),
                };
                yield figma.clientStorage.setAsync(this.STORAGE_KEY, JSON.stringify(storedConfig));
            }
            catch (error) {
                console.error('Failed to store config:', error);
                throw error;
            }
        });
    }
    /**
     * Retrieves and decrypts the stored config
     * @returns The decrypted config or null if not found
     */
    static retrieveConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const storedData = yield figma.clientStorage.getAsync(this.STORAGE_KEY);
                if (!storedData)
                    return null;
                const parsedData = JSON.parse(storedData);
                const pat = EncryptionService.decryptPAT(parsedData.encryptedPat);
                if (!pat) {
                    console.warn('Failed to decrypt stored PAT.');
                    return null;
                }
                return {
                    organization: parsedData.organization,
                    pat,
                    acPattern: parsedData.acPattern,
                };
            }
            catch (error) {
                console.error('Failed to retrieve config:', error);
                return null;
            }
        });
    }
    /**
     * Retrieves non-sensitive parts of the config
     * @returns Config metadata or null if not found
     */
    static getConfigInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const storedData = yield figma.clientStorage.getAsync(this.STORAGE_KEY);
                if (!storedData)
                    return null;
                const parsedData = JSON.parse(storedData);
                return {
                    organization: parsedData.organization,
                    acPattern: parsedData.acPattern,
                };
            }
            catch (error) {
                console.error('Failed to retrieve config info:', error);
                return null;
            }
        });
    }
    /**
     * Removes the stored config from clientStorage
     */
    static clearConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield figma.clientStorage.deleteAsync(this.STORAGE_KEY);
            }
            catch (error) {
                console.error('Failed to clear config:', error);
                throw error;
            }
        });
    }
}
ConfigStorageService.STORAGE_KEY = 'azure_devops_config';
