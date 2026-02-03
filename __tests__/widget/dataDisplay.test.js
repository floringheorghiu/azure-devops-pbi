// Property-based tests for PBI data display
import * as fc from 'fast-check';
describe('Feature: figma-devops-integration, PBI Data Display', () => {
    describe('Property 8: PBI Data Display Completeness', () => {
        test('should display all required PBI fields without data loss', () => {
            fc.assert(fc.property(fc.record({
                pbiData: fc.record({
                    id: fc.integer({ min: 1, max: 999999 }),
                    title: fc.string({ minLength: 1, maxLength: 200 }),
                    state: fc.constantFrom('New', 'Active', 'Resolved', 'Closed', 'Done', 'In Progress', 'To Do'),
                    description: fc.string({ maxLength: 1000 }),
                    acceptanceCriteria: fc.array(fc.string({ minLength: 1, maxLength: 200 }), { maxLength: 10 }),
                    assignedTo: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
                    workItemType: fc.constantFrom('User Story', 'Bug', 'Task', 'Product Backlog Item', 'Epic', 'Feature'),
                    creator: fc.string({ minLength: 1, maxLength: 100 }),
                    createdDate: fc.date(),
                    modifiedDate: fc.date(),
                    lastUpdated: fc.date()
                }),
                displayMode: fc.constantFrom('compact', 'expanded')
            }), ({ pbiData, displayMode }) => {
                // Simulate widget display rendering
                const displayData = renderPBIData(pbiData, displayMode);
                // Verify all required fields are present in display
                expect(displayData.id).toBe(pbiData.id);
                expect(displayData.title).toBe(pbiData.title);
                expect(displayData.state).toBe(pbiData.state);
                expect(displayData.workItemType).toBe(pbiData.workItemType);
                expect(displayData.creator).toBe(pbiData.creator);
                // Verify dates are formatted properly
                expect(displayData.createdDate).toBeInstanceOf(Date);
                expect(displayData.modifiedDate).toBeInstanceOf(Date);
                expect(displayData.lastUpdated).toBeInstanceOf(Date);
                // Verify optional fields are handled correctly
                if (pbiData.assignedTo) {
                    expect(displayData.assignedTo).toBe(pbiData.assignedTo);
                }
                else {
                    expect(displayData.assignedTo).toBeUndefined();
                }
                // Verify arrays are preserved
                expect(displayData.acceptanceCriteria).toEqual(pbiData.acceptanceCriteria);
                // Verify display mode affects rendering
                if (displayMode === 'compact') {
                    // Compact mode should truncate long content
                    expect(displayData.displayTitle.length).toBeLessThanOrEqual(40);
                }
                else {
                    // Expanded mode should show more content
                    expect(displayData.displayDescription.length).toBeLessThanOrEqual(200);
                }
            }), { numRuns: 10 });
        });
        test('should handle special characters and HTML content safely', () => {
            fc.assert(fc.property(fc.record({
                title: fc.string({ minLength: 1, maxLength: 100 }).map(s => s + fc.sample(fc.constantFrom('<script>', '&lt;', '&gt;', '"', "'", '&amp;'), 1)[0]),
                description: fc.string({ maxLength: 500 }).map(s => s + '<p>HTML content</p><script>alert("xss")</script>'),
                acceptanceCriteria: fc.array(fc.string({ maxLength: 100 }).map(s => s + '<b>Bold</b> & special chars'), { maxLength: 5 })
            }), ({ title, description, acceptanceCriteria }) => {
                const pbiData = {
                    id: 12345,
                    title,
                    state: 'Active',
                    description,
                    acceptanceCriteria,
                    workItemType: 'User Story',
                    creator: 'Test User',
                    createdDate: new Date(),
                    modifiedDate: new Date(),
                    lastUpdated: new Date()
                };
                const displayData = renderPBIData(pbiData, 'expanded');
                // Verify HTML is sanitized
                expect(displayData.displayTitle).not.toContain('<script>');
                expect(displayData.displayDescription).not.toContain('<script>');
                expect(displayData.displayDescription).not.toContain('alert(');
                // Verify HTML entities are handled
                expect(displayData.displayTitle).not.toContain('&lt;');
                expect(displayData.displayTitle).not.toContain('&gt;');
                expect(displayData.displayTitle).not.toContain('&amp;');
                // Verify acceptance criteria are sanitized
                displayData.displayAcceptanceCriteria.forEach(criterion => {
                    expect(criterion).not.toContain('<script>');
                    expect(criterion).not.toContain('<b>'); // HTML tags should be removed
                });
            }), { numRuns: 10 });
        });
        test('should truncate long content appropriately for display modes', () => {
            fc.assert(fc.property(fc.record({
                longTitle: fc.string({ minLength: 100, maxLength: 500 }),
                longDescription: fc.string({ minLength: 500, maxLength: 2000 }),
                manyAcceptanceCriteria: fc.array(fc.string({ minLength: 50, maxLength: 200 }), { minLength: 10, maxLength: 20 })
            }), ({ longTitle, longDescription, manyAcceptanceCriteria }) => {
                const pbiData = {
                    id: 12345,
                    title: longTitle,
                    state: 'Active',
                    description: longDescription,
                    acceptanceCriteria: manyAcceptanceCriteria,
                    workItemType: 'User Story',
                    creator: 'Test User',
                    createdDate: new Date(),
                    modifiedDate: new Date(),
                    lastUpdated: new Date()
                };
                // Test compact mode truncation
                const compactDisplay = renderPBIData(pbiData, 'compact');
                expect(compactDisplay.displayTitle.length).toBeLessThanOrEqual(43); // 40 + "..."
                // Test expanded mode truncation
                const expandedDisplay = renderPBIData(pbiData, 'expanded');
                expect(expandedDisplay.displayDescription.length).toBeLessThanOrEqual(203); // 200 + "..."
                // Test acceptance criteria limiting
                expect(expandedDisplay.displayAcceptanceCriteria.length).toBeLessThanOrEqual(3);
                if (manyAcceptanceCriteria.length > 3) {
                    expect(expandedDisplay.hasMoreCriteria).toBe(true);
                    expect(expandedDisplay.additionalCriteriaCount).toBe(manyAcceptanceCriteria.length - 3);
                }
            }), { numRuns: 10 });
        });
        test('should format dates consistently across different locales', () => {
            fc.assert(fc.property(fc.record({
                createdDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
                modifiedDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
                lastUpdated: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') })
            }), ({ createdDate, modifiedDate, lastUpdated }) => {
                const pbiData = {
                    id: 12345,
                    title: 'Test PBI',
                    state: 'Active',
                    description: 'Test description',
                    acceptanceCriteria: [],
                    workItemType: 'User Story',
                    creator: 'Test User',
                    createdDate,
                    modifiedDate,
                    lastUpdated
                };
                const displayData = renderPBIData(pbiData, 'expanded');
                // Verify dates are formatted as strings
                expect(typeof displayData.formattedCreatedDate).toBe('string');
                expect(typeof displayData.formattedModifiedDate).toBe('string');
                expect(typeof displayData.formattedLastUpdated).toBe('string');
                // Verify relative time formatting
                expect(typeof displayData.relativeLastUpdated).toBe('string');
                expect(displayData.relativeLastUpdated.length).toBeGreaterThan(0);
                // Verify date formats are consistent
                const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$|^[A-Za-z]{3} \d{1,2}, \d{4}$/;
                expect(displayData.formattedCreatedDate).toMatch(dateRegex);
            }), { numRuns: 10 });
        });
    });
    describe('State Color and Visual Indicators', () => {
        test('should assign appropriate colors to different work item states', () => {
            const stateColorMappings = [
                { state: 'New', expectedColor: '#3182ce' },
                { state: 'Active', expectedColor: '#38a169' },
                { state: 'Resolved', expectedColor: '#805ad5' },
                { state: 'Closed', expectedColor: '#718096' },
                { state: 'Done', expectedColor: '#38a169' },
                { state: 'In Progress', expectedColor: '#ed8936' },
                { state: 'To Do', expectedColor: '#3182ce' }
            ];
            stateColorMappings.forEach(({ state, expectedColor }) => {
                const color = getStateColor(state);
                expect(color).toBe(expectedColor);
            });
        });
        test('should handle unknown states with default color', () => {
            fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter(s => !['New', 'Active', 'Resolved', 'Closed', 'Done', 'In Progress', 'To Do'].includes(s)), (unknownState) => {
                const color = getStateColor(unknownState);
                expect(color).toBe('#718096'); // Default color
            }), { numRuns: 10 });
        });
    });
    describe('Content Sanitization', () => {
        test('should remove dangerous HTML while preserving safe formatting', () => {
            const dangerousContent = [
                '<script>alert("xss")</script>Normal content',
                '<p>Safe paragraph</p><script>malicious()</script>',
                'Content with <b>bold</b> and <i>italic</i> text',
                '<div onclick="malicious()">Clickable div</div>',
                '<a href="javascript:alert()">Malicious link</a>',
                'Normal text with &lt;escaped&gt; entities'
            ];
            dangerousContent.forEach(content => {
                const sanitized = sanitizeHTMLContent(content);
                // Should remove script tags
                expect(sanitized).not.toContain('<script>');
                expect(sanitized).not.toContain('</script>');
                expect(sanitized).not.toContain('alert(');
                expect(sanitized).not.toContain('javascript:');
                // Should remove event handlers
                expect(sanitized).not.toContain('onclick=');
                expect(sanitized).not.toContain('onload=');
                // Should preserve safe content
                if (content.includes('Normal content')) {
                    expect(sanitized).toContain('Normal content');
                }
            });
        });
    });
});
// Helper functions for testing (these would be imported from the actual widget code)
function renderPBIData(pbiData, displayMode) {
    return {
        id: pbiData.id,
        title: pbiData.title,
        state: pbiData.state,
        workItemType: pbiData.workItemType,
        creator: pbiData.creator,
        assignedTo: pbiData.assignedTo,
        acceptanceCriteria: pbiData.acceptanceCriteria,
        createdDate: pbiData.createdDate,
        modifiedDate: pbiData.modifiedDate,
        lastUpdated: pbiData.lastUpdated,
        // Display-specific fields
        displayTitle: truncateText(pbiData.title, displayMode === 'compact' ? 40 : 100),
        displayDescription: truncateText(pbiData.description, displayMode === 'compact' ? 50 : 200),
        displayAcceptanceCriteria: pbiData.acceptanceCriteria.slice(0, displayMode === 'compact' ? 1 : 3),
        hasMoreCriteria: pbiData.acceptanceCriteria.length > (displayMode === 'compact' ? 1 : 3),
        additionalCriteriaCount: Math.max(0, pbiData.acceptanceCriteria.length - (displayMode === 'compact' ? 1 : 3)),
        // Formatted dates
        formattedCreatedDate: pbiData.createdDate.toLocaleDateString(),
        formattedModifiedDate: pbiData.modifiedDate.toLocaleDateString(),
        formattedLastUpdated: pbiData.lastUpdated.toLocaleDateString(),
        relativeLastUpdated: formatRelativeTime(pbiData.lastUpdated)
    };
}
function getStateColor(state) {
    const stateColors = {
        'New': '#3182ce',
        'Active': '#38a169',
        'Resolved': '#805ad5',
        'Closed': '#718096',
        'Removed': '#e53e3e',
        'Done': '#38a169',
        'To Do': '#3182ce',
        'In Progress': '#ed8936',
        'default': '#718096'
    };
    return stateColors[state] || stateColors.default;
}
function truncateText(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.substring(0, maxLength - 3) + '...';
}
function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMins < 1)
        return 'just now';
    if (diffMins < 60)
        return `${diffMins}m ago`;
    if (diffHours < 24)
        return `${diffHours}h ago`;
    if (diffDays < 7)
        return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
function sanitizeHTMLContent(html) {
    if (!html)
        return '';
    // Remove script tags and event handlers
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/on\w+="[^"]*"/gi, '');
    sanitized = sanitized.replace(/on\w+='[^']*'/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');
    // Convert basic HTML tags to plain text
    sanitized = sanitized.replace(/<p[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/p>/gi, '\n');
    sanitized = sanitized.replace(/<br\s*\/?>/gi, '\n');
    sanitized = sanitized.replace(/<div[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/div>/gi, '\n');
    // Remove remaining HTML tags but keep content
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    // Convert common HTML entities
    sanitized = sanitized.replace(/&lt;/g, '<');
    sanitized = sanitized.replace(/&gt;/g, '>');
    sanitized = sanitized.replace(/&amp;/g, '&');
    sanitized = sanitized.replace(/&quot;/g, '"');
    sanitized = sanitized.replace(/&#39;/g, "'");
    sanitized = sanitized.replace(/&nbsp;/g, ' ');
    return sanitized.trim();
}
