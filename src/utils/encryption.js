// Encryption utilities for PAT security
// Note: In a real implementation, you would use a proper encryption library
// For this demo, we'll use a simple encoding approach with Figma's clientStorage security
export class EncryptionService {
    /**
     * Encrypts a Personal Access Token for secure storage
     * @param token The PAT to encrypt
     * @returns Encrypted token string
     */
    static encryptPAT(token) {
        // In a production environment, use proper encryption
        // For now, we'll use base64 encoding with a simple transformation
        const combined = `${this.ENCRYPTION_KEY}:${token}`;
        return btoa(combined);
    }
    /**
     * Decrypts a stored PAT
     * @param encryptedToken The encrypted token
     * @returns Decrypted PAT or null if invalid
     */
    static decryptPAT(encryptedToken) {
        try {
            const decoded = atob(encryptedToken);
            const [key, token] = decoded.split(':');
            if (key !== this.ENCRYPTION_KEY) {
                return null;
            }
            return token;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Validates PAT format (Azure DevOps PATs are typically 52 characters)
     * @param token The token to validate
     * @returns True if format is valid
     */
    static validatePATFormat(token) {
        // Azure DevOps PATs are base64-encoded and typically 52 characters
        const patRegex = /^[A-Za-z0-9+/]{52}$/;
        return patRegex.test(token);
    }
}
EncryptionService.ENCRYPTION_KEY = 'azure-devops-pbi-plugin-key';
