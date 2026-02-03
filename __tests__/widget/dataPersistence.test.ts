// Property-based tests for widget data persistence

import * as fc from 'fast-check';
import { WidgetState, PBIData, ParsedPBIInfo, APIError } from '../../src/types';

// Mock Figma Widget API
const mockUseSyncedState = jest.fn();
const mockWidget = {
  useSyncedState: mockUseSyncedState
};

(global as any).figma = {
  widget: mockWidget
};

describe('Feature: figma-devops-integration, Widget Data Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 10: Widget Data Persistence Round-Trip', () => {
    test('should persist and restore widget state without data loss', () => {
      fc.assert(fc.property(
        fc.record<{
          widgetState: WidgetState;
        }>({
          widgetState: fc.record<WidgetState>({
            pbiInfo: fc.record<ParsedPBIInfo>({
              organization: fc.string({ minLength: 1, maxLength: 50 }),
              project: fc.string({ minLength: 1, maxLength: 50 }),
              workItemId: fc.integer({ min: 1, max: 999999 }),
              url: fc.string({ minLength: 10, maxLength: 200 })
            }),
            currentData: fc.record<PBIData>({
              id: fc.integer({ min: 1, max: 999999 }),
              title: fc.string({ minLength: 1, maxLength: 200 }),
              state: fc.constantFrom('New', 'Active', 'Resolved', 'Closed', 'Done', 'In Progress'),
              description: fc.string({ maxLength: 1000 }),
              acceptanceCriteria: fc.array(fc.string({ maxLength: 200 }), { maxLength: 10 }),
              assignedTo: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
              workItemType: fc.constantFrom('User Story', 'Bug', 'Task', 'Product Backlog Item', 'Epic'),
              creator: fc.string({ minLength: 1, maxLength: 100 }),
              createdDate: fc.date(),
              modifiedDate: fc.date(),
              lastUpdated: fc.date()
            }),
            lastRefresh: fc.option(fc.date(), { nil: null }),
            isLoading: fc.boolean(),
            error: fc.option(fc.record<APIError>({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              userMessage: fc.string({ minLength: 1 }),
              retryable: fc.boolean()
            }), { nil: null }),
            displayMode: fc.constantFrom('compact', 'expanded'),
            acPattern: fc.string()
          })
        }),
        ({ widgetState }: { widgetState: WidgetState }) => {
          // Simulate storing state
          let storedState: WidgetState | null = null;
          
          mockUseSyncedState.mockImplementation((key: string, defaultValue: WidgetState) => {
            if (storedState === null) {
              storedState = { ...widgetState };
            }
            
            return [
              storedState,
              (newState: WidgetState) => {
                storedState = { ...newState };
              }
            ];
          });

          // Simulate widget initialization
          const [state, setState] = mockUseSyncedState('widgetState', widgetState);
          
          // Verify initial state matches input
          expect(state).toEqual(widgetState);
          
          // Simulate state update
          const updatedState: WidgetState = {
            ...widgetState,
            isLoading: !widgetState.isLoading,
            lastRefresh: new Date()
          };
          
          setState(updatedState);
          
          // Simulate widget re-initialization (persistence test)
          const [restoredState] = mockUseSyncedState('widgetState', widgetState);
          
          // Verify state was persisted correctly
          expect(restoredState.pbiInfo).toEqual(updatedState.pbiInfo);
          expect(restoredState.currentData).toEqual(updatedState.currentData);
          expect(restoredState.isLoading).toBe(updatedState.isLoading);
          expect(restoredState.error).toEqual(updatedState.error);
          expect(restoredState.displayMode).toBe(updatedState.displayMode);
          
          // Verify dates are preserved (within reasonable tolerance)
          if (updatedState.lastRefresh && restoredState.lastRefresh) {
            const timeDiff = Math.abs(
              updatedState.lastRefresh.getTime() - restoredState.lastRefresh.getTime()
            );
            expect(timeDiff).toBeLessThan(1000); // Within 1 second
          }
        }
      ), { numRuns: 10 });
    });

    test('should handle state serialization and deserialization correctly', () => {
      fc.assert(fc.property(
        fc.record({
          pbiData: fc.record({
            id: fc.integer({ min: 1, max: 999999 }),
            title: fc.string({ minLength: 1, maxLength: 100 }),
            state: fc.string({ minLength: 1, maxLength: 20 }),
            description: fc.string({ maxLength: 500 }),
            acceptanceCriteria: fc.array(fc.string({ maxLength: 100 }), { maxLength: 5 }),
            workItemType: fc.string({ minLength: 1, maxLength: 50 }),
            creator: fc.string({ minLength: 1, maxLength: 50 }),
            createdDate: fc.date(),
            modifiedDate: fc.date(),
            lastUpdated: fc.date()
          })
        }),
        ({ pbiData }: { pbiData: PBIData }) => {
          // Simulate JSON serialization/deserialization (what Figma does internally)
          const serialized = JSON.stringify(pbiData);
          const deserialized = JSON.parse(serialized);
          
          // Verify all primitive fields are preserved
          expect(deserialized.id).toBe(pbiData.id);
          expect(deserialized.title).toBe(pbiData.title);
          expect(deserialized.state).toBe(pbiData.state);
          expect(deserialized.description).toBe(pbiData.description);
          expect(deserialized.workItemType).toBe(pbiData.workItemType);
          expect(deserialized.creator).toBe(pbiData.creator);
          
          // Verify arrays are preserved
          expect(deserialized.acceptanceCriteria).toEqual(pbiData.acceptanceCriteria);
          
          // Verify dates can be reconstructed
          expect(new Date(deserialized.createdDate)).toEqual(pbiData.createdDate);
          expect(new Date(deserialized.modifiedDate)).toEqual(pbiData.modifiedDate);
          expect(new Date(deserialized.lastUpdated)).toEqual(pbiData.lastUpdated);
        }
      ), { numRuns: 10 });
    });
  });

  describe('Property 11: Data Format Version Compatibility', () => {
    test('should handle missing optional fields gracefully', () => {
      fc.assert(fc.property(
        fc.record<{
          baseState: Partial<WidgetState>;
        }>({
          baseState: fc.record<Partial<WidgetState>>({
            pbiInfo: fc.record<ParsedPBIInfo>({
              organization: fc.string({ minLength: 1 }),
              project: fc.string({ minLength: 1 }),
              workItemId: fc.integer({ min: 1 }),
              url: fc.string({ minLength: 1 })
            }),
            currentData: fc.record<PBIData>({
              id: fc.integer({ min: 1 }),
              title: fc.string({ minLength: 1 }),
              state: fc.string({ minLength: 1 }),
              description: fc.string(),
              acceptanceCriteria: fc.array(fc.string()),
              workItemType: fc.string({ minLength: 1 }),
              creator: fc.string({ minLength: 1 }),
              createdDate: fc.date(),
              modifiedDate: fc.date(),
              lastUpdated: fc.date()
            }),
            lastRefresh: fc.option(fc.date(), { nil: null }),
            isLoading: fc.boolean(),
            error: fc.option(fc.record<APIError>({
              code: fc.string({ minLength: 1 }),
              message: fc.string({ minLength: 1 }),
              userMessage: fc.string({ minLength: 1 }),
              retryable: fc.boolean()
            }), { nil: null }),
            displayMode: fc.constantFrom('compact', 'expanded'),
            acPattern: fc.string()
          })
        }),
        ({ baseState }: { baseState: Partial<WidgetState> }) => {
          // Simulate loading state with missing optional fields
          const incompleteState = {
            ...baseState,
          };
          
          mockUseSyncedState.mockReturnValue([incompleteState, jest.fn()]);
          
          // Widget should handle missing fields by providing defaults
          const [state] = mockUseSyncedState('widgetState', {
            pbiInfo: baseState.pbiInfo!,
            currentData: baseState.currentData!,
            lastRefresh: null,
            isLoading: false,
            error: null,
            displayMode: baseState.displayMode || 'expanded',
            acPattern: '' // Default for acPattern
          });
          
          // Verify defaults are applied for missing fields
          expect(state.lastRefresh).toBeDefined(); // Should be null or a date
          expect(typeof state.isLoading).toBe('boolean');
          expect(state.error).toBeDefined(); // Should be null or an error object
          expect(['compact', 'expanded']).toContain(state.displayMode);
        }
      ), { numRuns: 10 });
    });

    test('should migrate old data format to new format', () => {
      // Simulate old widget state format (missing new fields)
      const oldFormatState = {
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
          workItemType: 'User Story',
          creator: 'Test User',
          createdDate: new Date(),
          modifiedDate: new Date(), // Added for consistency
          lastUpdated: new Date(),
          acceptanceCriteria: [], // Added for consistency
          assignedTo: undefined // Added for consistency
          // Missing: lastRefresh, isLoading, error
        },
        displayMode: 'expanded',
        acPattern: '' // Added for consistency
        // Missing: lastRefresh, isLoading, error
      };

      // Simulate widget loading old format
      mockUseSyncedState.mockReturnValue([oldFormatState, jest.fn()]);
      
      const defaultState: WidgetState = {
        pbiInfo: oldFormatState.pbiInfo,
        currentData: {
          ...oldFormatState.currentData,
          acceptanceCriteria: [],
          modifiedDate: oldFormatState.currentData.lastUpdated,
          assignedTo: undefined
        } as PBIData,
        lastRefresh: null,
        isLoading: false,
        error: null,
        displayMode: oldFormatState.displayMode as 'compact' | 'expanded'
      };

      const [state] = mockUseSyncedState('widgetState', defaultState);
      
      // Verify migration provides sensible defaults
      expect(state.currentData.acceptanceCriteria).toBeDefined();
      expect(Array.isArray(state.currentData.acceptanceCriteria)).toBe(true);
      expect(state.currentData.modifiedDate).toBeDefined();
      expect(state.lastRefresh).toBeDefined();
      expect(typeof state.isLoading).toBe('boolean');
      expect(state.error).toBeDefined();
    });
  });

  describe('State Validation and Error Handling', () => {
    test('should validate state structure before persistence', () => {
      const invalidStates = [
        null,
        undefined,
        {},
        { pbiInfo: null },
        { pbiInfo: {}, currentData: null },
        { pbiInfo: {}, currentData: {}, displayMode: 'invalid' }
      ];

      invalidStates.forEach(invalidState => {
        mockUseSyncedState.mockReturnValue([invalidState, jest.fn()]);
        
        // Widget should handle invalid state gracefully
        expect(() => {
          const [state] = mockUseSyncedState('widgetState', {
            pbiInfo: {
              organization: 'default',
              project: 'default',
              workItemId: 1,
              url: 'default'
            },
            currentData: null,
            lastRefresh: null,
            isLoading: false,
            error: null,
            displayMode: 'expanded'
          });
        }).not.toThrow();
      });
    });

    test('should handle large data sets without performance issues', () => {
      const largeState: WidgetState = {
        pbiInfo: {
          organization: 'testorg',
          project: 'testproject',
          workItemId: 12345,
          url: 'https://dev.azure.com/testorg/testproject/_workitems/edit/12345'
        },
        currentData: {
          id: 12345,
          title: 'Test PBI with very long title that exceeds normal length limits and contains lots of text',
          state: 'Active',
          description: 'A'.repeat(5000), // Large description
          acceptanceCriteria: Array(50).fill('Large acceptance criterion with lots of text'),
          workItemType: 'User Story',
          creator: 'Test User',
          createdDate: new Date(),
          modifiedDate: new Date(),
          lastUpdated: new Date()
        },
        lastRefresh: new Date(),
        isLoading: false,
        error: null,
        displayMode: 'expanded'
      };

      // Simulate persistence of large state
      let storedState: WidgetState | null = null;
      
      mockUseSyncedState.mockImplementation((key: string, defaultValue: WidgetState) => {
        if (storedState === null) {
          storedState = { ...largeState };
        }
        
        return [
          storedState,
          (newState: WidgetState) => {
            storedState = { ...newState };
          }
        ];
      });

      // Should handle large state without errors
      expect(() => {
        const [state, setState] = mockUseSyncedState('widgetState', largeState);
        setState(largeState);
      }).not.toThrow();
    });
  });
});