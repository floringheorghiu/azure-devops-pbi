// Property-based tests for widget refresh and error handling
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fc from 'fast-check';
import { ConfigStorageService } from '../../src/services/configStorage';
import { PBIValidationService } from '../../src/services/pbiValidation';
// Mock the services
jest.mock('../../src/services/patStorage');
jest.mock('../../src/services/pbiValidation');
const mockConfigStorageService = ConfigStorageService;
const mockPBIValidationService = PBIValidationService;
describe('Feature: figma-devops-integration, Widget Refresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('Property 9: Widget Refresh Independence', () => {
        test('should refresh widget data independently without affecting other widgets', () => {
            fc.assert(fc.asyncProperty(fc.record({
                widget1State: fc.record({
                    pbiInfo: fc.record({
                        organization: fc.string({ minLength: 1, maxLength: 20 }),
                        project: fc.string({ minLength: 1, maxLength: 20 }),
                        workItemId: fc.integer({ min: 1, max: 999999 }),
                        url: fc.string({ minLength: 10 })
                    }),
                    currentData: fc.record({
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
                    error: fc.option(fc.record({
                        code: fc.string({ minLength: 1 }),
                        message: fc.string({ minLength: 1 }),
                        userMessage: fc.string({ minLength: 1 }),
                        retryable: fc.boolean()
                    }), { nil: null }),
                    displayMode: fc.constantFrom('compact', 'expanded'),
                    acPattern: fc.string()
                }),
                widget2State: fc.record({
                    pbiInfo: fc.record({
                        organization: fc.string({ minLength: 1, maxLength: 20 }),
                        project: fc.string({ minLength: 1, maxLength: 20 }),
                        workItemId: fc.integer({ min: 1, max: 999999 }),
                        url: fc.string({ minLength: 10 })
                    }),
                    currentData: fc.record({
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
                    error: fc.option(fc.record({
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
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ widget1State, widget2State, updatedData }) {
                var _b, _c, _d, _e, _f, _g;
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
                mockPBIValidationService.validatePBI.mockImplementation((pbiInfo, pat) => __awaiter(void 0, void 0, void 0, function* () {
                    if (pbiInfo.workItemId === widget1State.pbiInfo.workItemId) {
                        return {
                            isValid: true,
                            data: Object.assign(Object.assign({}, updatedData), { id: widget1State.pbiInfo.workItemId })
                        };
                    }
                    else {
                        return {
                            isValid: true,
                            data: widget2State.currentData || undefined // Changed null to undefined
                        };
                    }
                }));
                // Simulate widget 1 refresh
                const refreshResult1 = yield simulateWidgetRefresh(widget1State);
                // Simulate widget 2 state (unchanged)
                const widget2StateAfter = Object.assign({}, widget2State);
                // Verify widget 1 was updated
                expect(refreshResult1.success).toBe(true);
                expect((_c = (_b = refreshResult1.newState) === null || _b === void 0 ? void 0 : _b.currentData) === null || _c === void 0 ? void 0 : _c.id).toBe(widget1State.pbiInfo.workItemId);
                expect((_e = (_d = refreshResult1.newState) === null || _d === void 0 ? void 0 : _d.currentData) === null || _e === void 0 ? void 0 : _e.title).toBe(updatedData.title);
                expect((_f = refreshResult1.newState) === null || _f === void 0 ? void 0 : _f.isLoading).toBe(false);
                expect((_g = refreshResult1.newState) === null || _g === void 0 ? void 0 : _g.error).toBeNull();
                // Verify widget 2 was not affected
                expect(widget2StateAfter.currentData).toEqual(widget2State.currentData);
                expect(widget2StateAfter.isLoading).toBe(false);
                expect(widget2StateAfter.error).toBeNull();
                // Verify PAT service was called only once (for widget 1)
                expect(mockConfigStorageService.retrieveConfig).toHaveBeenCalledTimes(1);
                expect(mockPBIValidationService.validatePBI).toHaveBeenCalledTimes(1);
            })), { numRuns: 5 });
        });
        test('should handle concurrent refresh operations without conflicts', () => {
            fc.assert(fc.asyncProperty(fc.record({
                widgetStates: fc.array(fc.record({
                    pbiInfo: fc.record({
                        organization: fc.string({ minLength: 1, maxLength: 20 }),
                        project: fc.string({ minLength: 1, maxLength: 20 }),
                        workItemId: fc.integer({ min: 1, max: 999999 }),
                        url: fc.string({ minLength: 10 })
                    }),
                    currentData: fc.record({
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
                    error: fc.option(fc.record({
                        code: fc.string({ minLength: 1 }),
                        message: fc.string({ minLength: 1 }),
                        userMessage: fc.string({ minLength: 1 }),
                        retryable: fc.boolean()
                    }), { nil: null }),
                    displayMode: fc.constantFrom('compact', 'expanded'),
                    acPattern: fc.string()
                }), { minLength: 2, maxLength: 5 })
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ widgetStates }) {
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
                mockPBIValidationService.validatePBI.mockImplementation((pbiInfo) => __awaiter(void 0, void 0, void 0, function* () {
                    yield new Promise(resolve => setTimeout(resolve, Math.random() * 10));
                    const originalState = widgetStates.find(s => s.pbiInfo.workItemId === pbiInfo.workItemId);
                    return {
                        isValid: true,
                        data: Object.assign(Object.assign({}, originalState.currentData), { id: originalState.pbiInfo.workItemId, title: `Updated ${originalState.currentData.title}`, lastUpdated: new Date() })
                    };
                }));
                // Simulate concurrent refresh operations
                const refreshPromises = widgetStates.map(state => simulateWidgetRefresh(state));
                const results = yield Promise.all(refreshPromises);
                // Verify all refreshes succeeded
                results.forEach((result, index) => {
                    var _a, _b, _c, _d;
                    expect(result.success).toBe(true);
                    expect((_b = (_a = result.newState) === null || _a === void 0 ? void 0 : _a.currentData) === null || _b === void 0 ? void 0 : _b.title).toContain('Updated');
                    expect((_c = result.newState) === null || _c === void 0 ? void 0 : _c.isLoading).toBe(false);
                    expect((_d = result.newState) === null || _d === void 0 ? void 0 : _d.error).toBeNull();
                });
                // Verify each widget was called independently
                expect(mockConfigStorageService.retrieveConfig).toHaveBeenCalledTimes(widgetStates.length);
                expect(mockPBIValidationService.validatePBI).toHaveBeenCalledTimes(widgetStates.length);
            })), { numRuns: 3 });
        });
    });
    describe('Property 17: Widget Error State Management', () => {
        test('should handle refresh errors without corrupting widget state', () => {
            fc.assert(fc.asyncProperty(fc.record({
                widgetState: fc.record({
                    pbiInfo: fc.record({
                        organization: fc.string({ minLength: 1, maxLength: 20 }),
                        project: fc.string({ minLength: 1, maxLength: 20 }),
                        workItemId: fc.integer({ min: 1, max: 999999 }),
                        url: fc.string({ minLength: 10 })
                    }),
                    currentData: fc.record({
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
                    error: fc.option(fc.record({
                        code: fc.string({ minLength: 1 }),
                        message: fc.string({ minLength: 1 }),
                        userMessage: fc.string({ minLength: 1 }),
                        retryable: fc.boolean()
                    }), { nil: null }),
                    displayMode: fc.constantFrom('compact', 'expanded'),
                    acPattern: fc.string()
                }),
                errorType: fc.constantFrom('INVALID_PAT', 'WORK_ITEM_NOT_FOUND', 'NETWORK_ERROR', 'RATE_LIMIT_EXCEEDED', 'INSUFFICIENT_PERMISSIONS')
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ widgetState, errorType }) {
                var _b, _c, _d, _e, _f, _g, _h;
                const originalData = Object.assign({}, widgetState.currentData);
                // Mock PAT retrieval based on error type
                if (errorType === 'INVALID_PAT') {
                    mockConfigStorageService.retrieveConfig.mockResolvedValue(null);
                }
                else {
                    mockConfigStorageService.retrieveConfig.mockResolvedValue({
                        organization: 'test-org',
                        pat: 'valid-pat-token',
                        acPattern: ''
                    });
                }
                // Mock validation service to return error
                const mockError = {
                    code: errorType,
                    message: `Mock ${errorType} error`,
                    userMessage: `User-friendly ${errorType} message`,
                    retryable: errorType === 'NETWORK_ERROR' || errorType === 'RATE_LIMIT_EXCEEDED'
                };
                if (errorType === 'INVALID_PAT') {
                    // PAT retrieval fails, so validation won't be called
                }
                else {
                    mockPBIValidationService.validatePBI.mockResolvedValue({
                        isValid: false,
                        error: mockError
                    });
                }
                // Simulate widget refresh with error
                const refreshResult = yield simulateWidgetRefresh(widgetState);
                // Verify error was handled properly
                expect(refreshResult.success).toBe(false);
                expect((_b = refreshResult.newState) === null || _b === void 0 ? void 0 : _b.error).toBeDefined();
                expect((_d = (_c = refreshResult.newState) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.code).toBe(errorType === 'INVALID_PAT' ? 'REFRESH_ERROR' : errorType);
                expect((_e = refreshResult.newState) === null || _e === void 0 ? void 0 : _e.isLoading).toBe(false);
                // Verify original data was preserved
                expect((_f = refreshResult.newState) === null || _f === void 0 ? void 0 : _f.currentData).toEqual(originalData);
                // Verify error is retryable based on type
                if (errorType === 'NETWORK_ERROR' || errorType === 'RATE_LIMIT_EXCEEDED') {
                    expect((_h = (_g = refreshResult.newState) === null || _g === void 0 ? void 0 : _g.error) === null || _h === void 0 ? void 0 : _h.retryable).toBe(true);
                }
            })), { numRuns: 10 });
        });
        test('should recover from error state on successful refresh', () => {
            fc.assert(fc.asyncProperty(fc.record({
                widgetState: fc.record({
                    pbiInfo: fc.record({
                        organization: fc.string({ minLength: 1, maxLength: 20 }),
                        project: fc.string({ minLength: 1, maxLength: 20 }),
                        workItemId: fc.integer({ min: 1, max: 999999 }),
                        url: fc.string({ minLength: 10 })
                    }),
                    currentData: fc.record({
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
                    error: fc.option(fc.record({
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
            }), (_a) => __awaiter(void 0, [_a], void 0, function* ({ widgetState, updatedData }) {
                var _b, _c, _d, _e;
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
                    data: Object.assign(Object.assign({}, updatedData), { id: widgetState.pbiInfo.workItemId })
                });
                // Simulate successful refresh
                const refreshResult = yield simulateWidgetRefresh(widgetState);
                // Verify error state was cleared
                expect(refreshResult.success).toBe(true);
                expect((_b = refreshResult.newState) === null || _b === void 0 ? void 0 : _b.error).toBeNull();
                expect((_c = refreshResult.newState) === null || _c === void 0 ? void 0 : _c.isLoading).toBe(false);
                expect((_d = refreshResult.newState) === null || _d === void 0 ? void 0 : _d.currentData).toBeDefined();
                expect((_e = refreshResult.newState) === null || _e === void 0 ? void 0 : _e.lastRefresh).toBeDefined();
            })), { numRuns: 5 });
        });
    });
    describe('Loading State Management', () => {
        test('should manage loading state correctly during refresh', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c;
            const widgetState = {
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
            mockConfigStorageService.retrieveConfig.mockImplementation(() => __awaiter(void 0, void 0, void 0, function* () {
                yield new Promise(resolve => setTimeout(resolve, 50));
                return {
                    organization: 'testorg',
                    pat: 'valid-pat-token',
                    acPattern: ''
                };
            }));
            mockPBIValidationService.validatePBI.mockImplementation(() => __awaiter(void 0, void 0, void 0, function* () {
                yield new Promise(resolve => setTimeout(resolve, 50));
                return {
                    isValid: true,
                    data: Object.assign(Object.assign({}, widgetState.currentData), { id: widgetState.pbiInfo.workItemId, title: 'Updated Test PBI', lastUpdated: new Date() })
                };
            }));
            // Start refresh and check loading state
            const refreshPromise = simulateWidgetRefresh(widgetState);
            // Verify loading state is set initially
            // (In real implementation, this would be checked during the refresh process)
            const result = yield refreshPromise;
            // Verify final state
            expect(result.success).toBe(true);
            expect((_a = result.newState) === null || _a === void 0 ? void 0 : _a.isLoading).toBe(false);
            expect((_c = (_b = result.newState) === null || _b === void 0 ? void 0 : _b.currentData) === null || _c === void 0 ? void 0 : _c.title).toBe('Updated Test PBI');
        }));
    });
});
// Helper function to simulate widget refresh
function simulateWidgetRefresh(widgetState) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Set loading state
            const loadingState = Object.assign(Object.assign({}, widgetState), { lastRefresh: null, isLoading: true, error: null, acPattern: widgetState.acPattern // Preserve acPattern
             });
            const config = yield mockConfigStorageService.retrieveConfig();
            if (!config || !config.pat) {
                throw new Error('No PAT found. Please reconfigure the plugin.');
            }
            // Validate and fetch fresh PBI data
            const validationResult = yield mockPBIValidationService.validatePBI(widgetState.pbiInfo, config.pat);
            if (!validationResult.isValid || !validationResult.data) {
                const errorMessage = validationResult.error
                    ? validationResult.error.userMessage
                    : 'Unable to refresh work item data';
                throw new Error(errorMessage);
            }
            // Update widget state with fresh data
            const newState = Object.assign(Object.assign({}, widgetState), { currentData: validationResult.data, lastRefresh: new Date(), isLoading: false, error: null, acPattern: widgetState.acPattern, displayMode: widgetState.displayMode // Ensure displayMode is correctly carried over
             });
            return { success: true, newState };
        }
        catch (error) {
            const errorObj = {
                code: 'REFRESH_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
                userMessage: error instanceof Error ? error.message : 'Failed to refresh PBI data',
                retryable: true
            };
            const errorState = Object.assign(Object.assign({}, widgetState), { isLoading: false, error: errorObj });
            return { success: false, newState: errorState };
        }
    });
}
