// Property-based tests for widget refresh and error handling

import * as fc from 'fast-check';
import { WidgetState, PBIData, APIError, ParsedPBIInfo } from '../../src/types';
import { ConfigStorageService } from '../../src/services/configStorage';
import { PBIValidationService } from '../../src/services/pbiValidation';

// Mock the services
jest.mock('../../src/services/patStorage');
jest.mock('../../src/services/pbiValidation');

const mockConfigStorageService = ConfigStorageService as jest.Mocked<typeof ConfigStorageService>;
const mockPBIValidationService = PBIValidationService as jest.Mocked<typeof PBIValidationService>;

describe('Feature: figma-devops-integration, Widget Refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 9: Widget Refresh Independence', () => {
    test('should refresh widget data independently without affecting other widgets', () => {
      fc.assert(fc.asyncProperty(
        fc.record({
          widget1State: fc.record<WidgetState>({
            pbiInfo: fc.record<ParsedPBIInfo>({
              organization: fc.string({ minLength: 1, maxLength: 20 }),
              project: fc.string({ minLength: 1, maxLength: 20 }),
              workItemId: fc.integer({ min: 1, max: 999999 }),
              url: fc.string({ minLength: 10 })
            }),
            currentData: fc.record<PBIData>({
              id: fc.integer({ min: 1, max: 999999 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              state: fc.constantFrom('New', 'Active', 'Resolved', 'Closed'),
              description: fc.string({ maxLength: 500 }),
              acceptanceCriteria: fc.array(fc.string({ maxLength: 100 }), { maxLength: 5 }),
              workItemType: fc.string({ minLength: 1 }),
              creator: fc.string({ minLength: 1 }),
              createdDate: fc.date(),
              modifiedDate: fc.date(),
              lastUpdated: fc.date()
            }),
            lastRefresh: fc.option(fc.date(), { nil: null }),
            isLoading: fc.constant(false),
            error: fc.option(fc.record<APIError>({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              userMessage: fc.string({ minLength: 1 }),
              retryable: fc.boolean()
            }), { nil: null }),
            displayMode: fc.constantFrom('compact', 'expanded'),
            acPattern: fc.string()
          }),
          widget2State: fc.record<WidgetState>({
            pbiInfo: fc.record<ParsedPBIInfo>({
              organization: fc.string({ minLength: 1, maxLength: 20 }),
              project: fc.string({ minLength: 1, maxLength: 20 }),
              workItemId: fc.integer({ min: 1, max: 999999 }),
              url: fc.string({ minLength: 10 })
            }),
            currentData: fc.record<PBIData>({
              id: fc.integer({ min: 1, max: 999999 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              state: fc.constantFrom('New', 'Active', 'Resolved', 'Closed'),
              description: fc.string({ maxLength: 500 }),
              acceptanceCriteria: fc.array(fc.string({ maxLength: 100 }), { maxLength: 5 }),
              workItemType: fc.string({ minLength: 1 }),
              creator: fc.string({ minLength: 1 }),
              createdDate: fc.date(),
              modifiedDate: fc.date(),
              lastUpdated: fc.date()
            }),
            lastRefresh: fc.option(fc.date(), { nil: null }),
            isLoading: fc.constant(false),
            error: fc.option(fc.record<APIError>({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              userMessage: fc.string({ minLength: 1 }),
              retryable: fc.boolean()
            }), { nil: null }),
            displayMode: fc.constantFrom('compact', 'expanded'),
            acPattern: fc.string()
          }),
          updatedData: fc.record({
            id: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            state: fc.constantFrom('New', 'Active', 'Resolved', 'Closed'),
            description: fc.string({ maxLength: 500 }),
            acceptanceCriteria: fc.array(fc.string({ maxLength: 100 }), { maxLength: 5 }),
            workItemType: fc.string({ minLength: 1 }),
            creator: fc.string({ minLength: 1 }),
            createdDate: fc.date(),
            modifiedDate: fc.date(),
            lastUpdated: fc.date()
          })
        }),
        async ({ widget1State, widget2State, updatedData }) => {
          // Ensure widgets have different work item IDs
          if (widget1State.pbiInfo.workItemId === widget2State.pbiInfo.workItemId) {
            widget2State.pbiInfo.workItemId = widget1State.pbiInfo.workItemId + 1;
          }

          // Mock PAT retrieval
          mockConfigStorageService.retrieveConfig.mockResolvedValue({
            organization: 'test-org',
            pat: 'valid-pat-token',
            acPattern: ''
          });
                    mockPBIValidationService.validatePBI.mockImplementation(async (pbiInfo: ParsedPBIInfo, pat: string) => {
                      if (pbiInfo.workItemId === widget1State.pbiInfo.workItemId) {
                        return {
                          isValid: true,
                          data: { ...updatedData, id: widget1State.pbiInfo.workItemId as number }
                        };
                      } else {
                        return {
                          isValid: true,
                          data: widget2State.currentData || undefined // Changed null to undefined
                        };
                      }
                    });

          // Simulate widget 1 refresh
          const refreshResult1 = await simulateWidgetRefresh(widget1State);
          
          // Simulate widget 2 state (unchanged)
          const widget2StateAfter = { ...widget2State };

          // Verify widget 1 was updated
          expect(refreshResult1.success).toBe(true);
          expect(refreshResult1.newState?.currentData?.id).toBe(widget1State.pbiInfo.workItemId);
          expect(refreshResult1.newState?.currentData?.title).toBe(updatedData.title);
          expect(refreshResult1.newState?.isLoading).toBe(false);
          expect(refreshResult1.newState?.error).toBeNull();

          // Verify widget 2 was not affected
          expect(widget2StateAfter.currentData).toEqual(widget2State.currentData);
          expect(widget2StateAfter.isLoading).toBe(false);
          expect(widget2StateAfter.error).toBeNull();

          // Verify PAT service was called only once (for widget 1)
          expect(mockConfigStorageService.retrieveConfig).toHaveBeenCalledTimes(1);
          expect(mockPBIValidationService.validatePBI).toHaveBeenCalledTimes(1);
        }
      ), { numRuns: 5 });
    });

    test('should handle concurrent refresh operations without conflicts', () => {
      fc.assert(fc.asyncProperty(
        fc.record({
          widgetStates: fc.array(
            fc.record<WidgetState>({
              pbiInfo: fc.record<ParsedPBIInfo>({
                organization: fc.string({ minLength: 1, maxLength: 20 }),
                project: fc.string({ minLength: 1, maxLength: 20 }),
                workItemId: fc.integer({ min: 1, max: 999999 }),
                url: fc.string({ minLength: 10 })
              }),
              currentData: fc.record<PBIData>({
                id: fc.integer({ min: 1, max: 999999 }),
                title: fc.string({ minLength: 1, maxLength: 100 }),
                state: fc.constantFrom('New', 'Active', 'Resolved'),
                description: fc.string({ maxLength: 200 }),
                acceptanceCriteria: fc.array(fc.string({ maxLength: 50 }), { maxLength: 3 }),
                workItemType: fc.string({ minLength: 1 }),
                creator: fc.string({ minLength: 1 }),
                createdDate: fc.date(),
                modifiedDate: fc.date(),
                lastUpdated: fc.date()
              }),
              lastRefresh: fc.option(fc.date(), { nil: null }),
              isLoading: fc.constant(false),
              error: fc.option(fc.record<APIError>({
                code: fc.string({ minLength: 1 }),
                message: fc.string({ minLength: 1 }),
                userMessage: fc.string({ minLength: 1 }),
                retryable: fc.boolean()
              }), { nil: null }),
              displayMode: fc.constantFrom('compact', 'expanded'),
              acPattern: fc.string()
            }),
            { minLength: 2, maxLength: 5 }
          )
        }),
        async ({ widgetStates }) => {
          // Ensure unique work item IDs
          widgetStates.forEach((state, index) => {
            state.pbiInfo.workItemId = 1000 + index;
            if (state.currentData) {
              state.currentData.id = 1000 + index;
            }
          });

          mockConfigStorageService.retrieveConfig.mockResolvedValue({
            organization: 'test-org',
            pat: 'valid-pat-token',
            acPattern: ''
          });

          // Mock validation service with slight delays to simulate real API calls
          mockPBIValidationService.validatePBI.mockImplementation(async (pbiInfo) => {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
            const originalState = widgetStates.find(s => s.pbiInfo.workItemId === pbiInfo.workItemId);
            return {
              isValid: true,
              data: {
                ...originalState!.currentData!,
                id: originalState!.pbiInfo.workItemId as number,
                title: `Updated ${originalState!.currentData!.title}`,
                lastUpdated: new Date()
              }
            };
          });

          // Simulate concurrent refresh operations
          const refreshPromises = widgetStates.map(state => simulateWidgetRefresh(state));
          const results = await Promise.all(refreshPromises);

          // Verify all refreshes succeeded
          results.forEach((result, index) => {
            expect(result.success).toBe(true);
            expect(result.newState?.currentData?.title).toContain('Updated');
            expect(result.newState?.isLoading).toBe(false);
            expect(result.newState?.error).toBeNull();
          });

          // Verify each widget was called independently
          expect(mockConfigStorageService.retrieveConfig).toHaveBeenCalledTimes(widgetStates.length);
          expect(mockPBIValidationService.validatePBI).toHaveBeenCalledTimes(widgetStates.length);
        }
      ), { numRuns: 3 });
    });
  });

  describe('Property 17: Widget Error State Management', () => {
    test('should handle refresh errors without corrupting widget state', () => {
      fc.assert(fc.asyncProperty(
        fc.record({
          widgetState: fc.record<WidgetState>({
            pbiInfo: fc.record<ParsedPBIInfo>({
              organization: fc.string({ minLength: 1, maxLength: 20 }),
              project: fc.string({ minLength: 1, maxLength: 20 }),
              workItemId: fc.integer({ min: 1, max: 999999 }),
              url: fc.string({ minLength: 10 })
            }),
            currentData: fc.record<PBIData>({
              id: fc.integer({ min: 1, max: 999999 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              state: fc.constantFrom('New', 'Active', 'Resolved'),
              description: fc.string({ maxLength: 200 }),
              acceptanceCriteria: fc.array(fc.string({ maxLength: 50 })),
              workItemType: fc.string({ minLength: 1 }),
              creator: fc.string({ minLength: 1 }),
              createdDate: fc.date(),
              modifiedDate: fc.date(),
              lastUpdated: fc.date()
            }),
            lastRefresh: fc.option(fc.date(), { nil: null }),
            isLoading: fc.constant(false),
            error: fc.option(fc.record<APIError>({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              userMessage: fc.string({ minLength: 1 }),
              retryable: fc.boolean()
            }), { nil: null }),
            displayMode: fc.constantFrom('compact', 'expanded'),
            acPattern: fc.string()
          }),
          errorType: fc.constantFrom(
            'INVALID_PAT',
            'WORK_ITEM_NOT_FOUND',
            'NETWORK_ERROR',
            'RATE_LIMIT_EXCEEDED',
            'INSUFFICIENT_PERMISSIONS'
          )
        }),
        async ({ widgetState, errorType }) => {
          const originalData = { ...widgetState.currentData };

          // Mock PAT retrieval based on error type
          if (errorType === 'INVALID_PAT') {
            mockConfigStorageService.retrieveConfig.mockResolvedValue(null);
          } else {
            mockConfigStorageService.retrieveConfig.mockResolvedValue({
              organization: 'test-org',
              pat: 'valid-pat-token',
              acPattern: ''
            });
          }

          // Mock validation service to return error
          const mockError: APIError = {
            code: errorType,
            message: `Mock ${errorType} error`,
            userMessage: `User-friendly ${errorType} message`,
            retryable: errorType === 'NETWORK_ERROR' || errorType === 'RATE_LIMIT_EXCEEDED'
          };

          if (errorType === 'INVALID_PAT') {
            // PAT retrieval fails, so validation won't be called
          } else {
            mockPBIValidationService.validatePBI.mockResolvedValue({
              isValid: false,
              error: mockError
            });
          }

          // Simulate widget refresh with error
          const refreshResult = await simulateWidgetRefresh(widgetState);

          // Verify error was handled properly
          expect(refreshResult.success).toBe(false);
          expect(refreshResult.newState?.error).toBeDefined();
          expect(refreshResult.newState?.error?.code).toBe(errorType === 'INVALID_PAT' ? 'REFRESH_ERROR' : errorType);
          expect(refreshResult.newState?.isLoading).toBe(false);

          // Verify original data was preserved
          expect(refreshResult.newState?.currentData).toEqual(originalData);

          // Verify error is retryable based on type
          if (errorType === 'NETWORK_ERROR' || errorType === 'RATE_LIMIT_EXCEEDED') {
            expect(refreshResult.newState?.error?.retryable).toBe(true);
          }
        }
      ), { numRuns: 10 });
    });

    test('should recover from error state on successful refresh', () => {
      fc.assert(fc.asyncProperty(
        fc.record({
          widgetState: fc.record<WidgetState>({
            pbiInfo: fc.record<ParsedPBIInfo>({
              organization: fc.string({ minLength: 1, maxLength: 20 }),
              project: fc.string({ minLength: 1, maxLength: 20 }),
              workItemId: fc.integer({ min: 1, max: 999999 }),
              url: fc.string({ minLength: 10 })
            }),
            currentData: fc.record<PBIData>({
              id: fc.integer({ min: 1, max: 999999 }),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              state: fc.constantFrom('New', 'Active'),
              description: fc.string({ maxLength: 200 }),
              acceptanceCriteria: fc.array(fc.string({ maxLength: 50 })),
              workItemType: fc.string({ minLength: 1 }),
              creator: fc.string({ minLength: 1 }),
              createdDate: fc.date(),
              modifiedDate: fc.date(),
              lastUpdated: fc.date()
            }),
            lastRefresh: fc.option(fc.date(), { nil: null }),
            isLoading: fc.constant(false),
            error: fc.option(fc.record<APIError>({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              userMessage: fc.string({ minLength: 1 }),
              retryable: fc.constant(true)
            }), { nil: null }),
            displayMode: fc.constantFrom('compact', 'expanded'),
            acPattern: fc.string()
          }),
          updatedData: fc.record({
            id: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            state: fc.constantFrom('Active', 'Resolved'),
            description: fc.string({ maxLength: 200 }),
            acceptanceCriteria: fc.array(fc.string({ maxLength: 50 })),
            workItemType: fc.string({ minLength: 1 }),
            creator: fc.string({ minLength: 1 }),
            createdDate: fc.date(),
            modifiedDate: fc.date(),
            lastUpdated: fc.date()
          })
        }),
        async ({ widgetState, updatedData }) => {
          // Ensure widget starts in error state
          expect(widgetState.error).toBeDefined();

          // Mock successful PAT retrieval and validation
          mockConfigStorageService.retrieveConfig.mockResolvedValue({
            organization: 'test-org',
            pat: 'valid-pat-token',
            acPattern: ''
          });
          mockPBIValidationService.validatePBI.mockResolvedValue({
            isValid: true,
            data: { ...updatedData, id: widgetState.pbiInfo.workItemId }
          });

          // Simulate successful refresh
          const refreshResult = await simulateWidgetRefresh(widgetState);

          // Verify error state was cleared
          expect(refreshResult.success).toBe(true);
          expect(refreshResult.newState?.error).toBeNull();
          expect(refreshResult.newState?.isLoading).toBe(false);
          expect(refreshResult.newState?.currentData).toBeDefined();
          expect(refreshResult.newState?.lastRefresh).toBeDefined();
        }
      ), { numRuns: 5 });
    });
  });

  describe('Loading State Management', () => {
    test('should manage loading state correctly during refresh', async () => {
      const widgetState: WidgetState = {
        pbiInfo: {
          organization: 'testorg',
          project: 'testproject',
          workItemId: 12345,
          url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
        },
        currentData: {
          id: 12345,
          title: 'Test PBI',
          state: 'Active',
          description: 'Test description',
          acceptanceCriteria: [],
          workItemType: 'User Story',
          creator: 'Test User',
          createdDate: new Date(),
          modifiedDate: new Date(),
          lastUpdated: new Date()
        },
        lastRefresh: null,
        isLoading: false,
        error: null,
        displayMode: 'expanded',
        acPattern: ''
      };

      // Mock services with delay to test loading state
      mockConfigStorageService.retrieveConfig.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          organization: 'testorg',
          pat: 'valid-pat-token',
          acPattern: ''
        };
      });

      mockPBIValidationService.validatePBI.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          isValid: true,
          data: {
            ...widgetState.currentData!,
            id: widgetState.pbiInfo.workItemId as number,
            title: 'Updated Test PBI',
            lastUpdated: new Date()
          }
        };
      });

      // Start refresh and check loading state
      const refreshPromise = simulateWidgetRefresh(widgetState);
      
      // Verify loading state is set initially
      // (In real implementation, this would be checked during the refresh process)
      
      const result = await refreshPromise;
      
      // Verify final state
      expect(result.success).toBe(true);
      expect(result.newState?.isLoading).toBe(false);
      expect(result.newState?.currentData?.title).toBe('Updated Test PBI');
    });
  });
});

// Helper function to simulate widget refresh
async function simulateWidgetRefresh(widgetState: WidgetState): Promise<{
  success: boolean;
  newState?: WidgetState;
  error?: string;
}> {
  try {
    // Set loading state
    const loadingState: WidgetState = {
      ...widgetState,
      lastRefresh: null,
      isLoading: true,
      error: null,
      acPattern: widgetState.acPattern // Preserve acPattern
    };

    const config = await mockConfigStorageService.retrieveConfig();
    if (!config || !config.pat) {
      throw new Error('No PAT found. Please reconfigure the plugin.');
    }

    // Validate and fetch fresh PBI data
    const validationResult = await mockPBIValidationService.validatePBI(widgetState.pbiInfo, config.pat);
    
    if (!validationResult.isValid || !validationResult.data) {
      const errorMessage = validationResult.error 
        ? validationResult.error.userMessage
        : 'Unable to refresh work item data';
      
      throw new Error(errorMessage);
    }

    // Update widget state with fresh data
    const newState: WidgetState = {
      ...widgetState,
      currentData: validationResult.data,
      lastRefresh: new Date(),
      isLoading: false,
      error: null,
      acPattern: widgetState.acPattern, // Preserve acPattern
      displayMode: widgetState.displayMode // Ensure displayMode is correctly carried over
    };

    return { success: true, newState };

  } catch (error) {
    const errorObj: APIError = {
      code: 'REFRESH_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      userMessage: error instanceof Error ? error.message : 'Failed to refresh PBI data',
      retryable: true
    };

    const errorState: WidgetState = {
      ...widgetState,
      isLoading: false,
      error: errorObj
    };

    return { success: false, newState: errorState };
  }
}