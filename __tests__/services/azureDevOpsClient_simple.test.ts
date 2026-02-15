
import { AzureDevOpsClient } from '../../src/services/azureDevOpsClient';
import { decryptPAT, base64Encode } from '../../src/utils/encryption';
import { ParsedPBIInfo } from '../../src/types';

// Mock encryption functions
jest.mock('../../src/utils/encryption', () => ({
    decryptPAT: jest.fn(val => Promise.resolve('decrypted-token')),
    base64Encode: jest.fn(val => 'base64-encoded')
}));

// Mock fetch global
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('AzureDevOpsClient (Simple)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    test('validatePAT should return true for valid token', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200
        });

        const isValid = await AzureDevOpsClient.validatePAT('encrypted-token', 'org');

        expect(isValid).toBe(true);
        // validatePAT uses the PAT directly for header creation, it doesn't decrypt it internally?
        // Let's check source code. 
        // update: validatePAT takes 'pat' string. It calls createAuthHeader(pat).
        // It does NOT call decryptPAT. The usage expectation is that caller decrypts first?
        // Or that 'pat' passed is already decrypted?
        // In the plugin, we decrypt before calling logic.
        // So here we pass a string.

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[0]).toContain('https://azure-devops-proxy.adosync.workers.dev/api/pbi/org/_apis/projects');
    });

    test('validatePAT should return false for invalid token (401)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401
        });

        const isValid = await AzureDevOpsClient.validatePAT('bad-token', 'org');

        expect(isValid).toBe(false);
    });

    test('getPBIData should return transformed PBI data', async () => {
        const mockPBIResponse = {
            id: 123,
            fields: {
                'System.Title': 'Test PBI',
                'System.WorkItemType': 'User Story',
                'System.State': 'Active',
                'System.AssignedTo': { displayName: 'John Doe' },
                'System.Description': '<div>Description</div>',
                'System.CreatedDate': '2023-01-01T00:00:00Z',
                'System.ChangedDate': '2023-01-02T00:00:00Z'
            }
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue(mockPBIResponse)
        });

        const pbiInfo: ParsedPBIInfo = {
            organization: 'org',
            project: 'project',
            workItemId: 123,
            url: 'https://dev.azure.com/org/project/_workitems/edit/123'
        };

        const result = await AzureDevOpsClient.getPBIData(pbiInfo, 'valid-token');

        expect(result).not.toBeNull();
        expect(result.id).toBe(123);
        expect(result.title).toBe('Test PBI');
        expect(result.state).toBe('Active');
        expect(result.assignedTo).toBe('John Doe');

        // Verify URL construction
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockFetch.mock.calls[0];
        expect(callArgs[0]).toContain('https://azure-devops-proxy.adosync.workers.dev/api/pbi/org/project/_apis/wit/workitems/123');
    });

    test('getPBIData should throw error on 404', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: jest.fn().mockResolvedValue({ message: 'Not found' })
        });

        const pbiInfo: ParsedPBIInfo = {
            organization: 'org',
            project: 'project',
            workItemId: 999,
            url: 'https://dev.azure.com/org/project/_workitems/edit/999'
        };

        await expect(AzureDevOpsClient.getPBIData(pbiInfo, 'valid-token'))
            .rejects.toMatchObject({
                code: 'WORK_ITEM_NOT_FOUND',
                message: expect.stringContaining('Work item not found')
            });
    });
});
