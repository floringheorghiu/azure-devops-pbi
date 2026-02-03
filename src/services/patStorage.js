// PAT storage service using Figma's clientStorage
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
export class PATStorageService {
    /**
     * Stores a PAT securely in Figma's clientStorage
     * @param token The Personal Access Token to store
     * @param organization The Azure DevOps organization
     */
    static storePAT(token, organization) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate PAT format before storing
                if (!EncryptionService.validatePATFormat(token)) {
                    throw new Error('Invalid PAT format. Azure DevOps PATs should be 52 characters long.');
                }
                // Encrypt the token
                const encryptedToken = EncryptionService.encryptPAT(token);
                // Create storage object
                const storedPAT = {
                    encryptedToken,
                    organization,
                    createdAt: new Date(),
                    lastValidated: undefined
                };
                // Store in Figma's clientStorage
                yield figma.clientStorage.setAsync(this.STORAGE_KEY, JSON.stringify(storedPAT));
                console.log('PAT stored successfully (encrypted)');
            }
            catch (error) {
                console.error('Failed to store PAT:', error);
                throw error;
            }
        });
    }
    /**
     * Retrieves and decrypts the stored PAT
     * @returns The decrypted PAT or null if not found/invalid
     */
    static retrievePAT() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const storedData = yield figma.clientStorage.getAsync(this.STORAGE_KEY);
                if (!storedData) {
                    return null;
                }
                const parsedData = JSON.parse(storedData);
                const decryptedToken = EncryptionService.decryptPAT(parsedData.encryptedToken);
                if (!decryptedToken) {
                    console.warn('Failed to decrypt stored PAT - may be corrupted');
                    return null;
                }
                return decryptedToken;
            }
            catch (error) {
                console.error('Failed to retrieve PAT:', error);
                return null;
            }
        });
    }
    /**
     * Retrieves the stored PAT information (without decrypting the token)
     * @returns Stored PAT metadata or null if not found
     */
    static getPATInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const storedData = yield figma.clientStorage.getAsync(this.STORAGE_KEY);
                if (!storedData) {
                    return null;
                }
                const parsedData = JSON.parse(storedData);
                return {
                    organization: parsedData.organization,
                    createdAt: new Date(parsedData.createdAt),
                    lastValidated: parsedData.lastValidated ? new Date(parsedData.lastValidated) : undefined
                };
            }
            catch (error) {
                console.error('Failed to retrieve PAT info:', error);
                return null;
            }
        });
    }
    /**
     * Updates the last validated timestamp for the stored PAT
     */
    static updateLastValidated() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const storedData = yield figma.clientStorage.getAsync(this.STORAGE_KEY);
                if (!storedData) {
                    return;
                }
                const parsedData = JSON.parse(storedData);
                parsedData.lastValidated = new Date();
                yield figma.clientStorage.setAsync(this.STORAGE_KEY, JSON.stringify(parsedData));
            }
            catch (error) {
                console.error('Failed to update last validated timestamp:', error);
            }
        });
    }
    /**
     * Completely removes the stored PAT from clientStorage
     */
    static clearPAT() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield figma.clientStorage.deleteAsync(this.STORAGE_KEY);
                console.log('PAT cleared successfully');
            }
            catch (error) {
                console.error('Failed to clear PAT:', error);
                throw error;
            }
        });
    }
    /**
     * Checks if a PAT is currently stored
     * @returns True if PAT exists in storage
     */
    static hasPAT() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const storedData = yield figma.clientStorage.getAsync(this.STORAGE_KEY);
                return !!storedData;
            }
            catch (error) {
                console.error('Failed to check PAT existence:', error);
                return false;
            }
        });
    }
    /**
     * Validates the stored PAT format and encryption integrity
     * @returns True if stored PAT is valid and can be decrypted
     */
    static validateStoredPAT() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const token = yield this.retrievePAT();
                return token !== null && EncryptionService.validatePATFormat(token);
            }
            catch (error) {
                console.error('Failed to validate stored PAT:', error);
                return false;
            }
        });
    }
}
PATStorageService.STORAGE_KEY = 'azure_devops_pat';
PATStorageService.ORGANIZATION_KEY = 'azure_devops_org';
