import './src/utils/polyfill'; // Must be first to mock environment for node-forge
import { WidgetState, PBIData, APIError, PluginMessage } from './src/types';
import { ConfigStorageService } from './src/services/configStorage';
import { PBIValidationService } from './src/services/pbiValidation';
import { AzureDevOpsURLParser } from './src/utils/urlParser';

declare const figma: any;
declare const __html__: string;

const { widget } = figma;
const { useSyncedState, usePropertyMenu, useWidgetId, AutoLayout, Text, Rectangle, SVG, h, Fragment, useEffect, waitForTask } = (widget || {}) as any;

// Shared state for routing UI messages to the correct widget instance
let activeInstanceUpdateHandler: ((url: string) => Promise<void>) | null = null;

const WIDGET_VERSION = '3.2.0'; // UI Fix + Versioning + Custom Log Page

const PENDING_PBI_KEY = 'pending_pbi_data';

// --- Utility Functions ---

function getStateColor(state: string): { bg: string; text: string } {
  const stateColors = {
    'New': { bg: '#EBF4FF', text: '#005A9E' },
    'Active': { bg: '#DFF6DD', text: '#107C10' },
    'Resolved': { bg: '#F3F2F1', text: '#1F1F1F' },
    'Closed': { bg: '#F3F2F1', text: '#666' },
    'Done': { bg: '#DFF6DD', text: '#107C10' },
    'To Do': { bg: '#EBF4FF', text: '#005A9E' },
    'In Progress': { bg: '#FFF4CE', text: '#795500' },
    'default': { bg: '#F3F2F1', text: '#1F1F1F' }
  };
  return (stateColors as any)[state] || stateColors.default;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '…';
}

function formatRelativeTime(dateInput: any): string {
  try {
    if (!dateInput) return '';
    // Force conversion to Date object in case it's a plain serialized object
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    const diff = new Date().getTime() - date.getTime();
    const diffMins = Math.floor(diff / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch (e) {
    return '';
  }
}

const handleStoreConfig = async (payload: any) => {
  await ConfigStorageService.storeConfig(payload);
  if (figma.ui) {
    figma.ui.postMessage({ type: 'config-stored', payload: { success: true } });
  }
};

const handleClearConfig = async () => {
  await ConfigStorageService.clearConfig();
};

// ... (previous code)

function PBIWidget() {
  const widgetId = useWidgetId();
  const [widgetState, setWidgetState] = useSyncedState('widgetState', {
    pbiInfo: { organization: '', project: '', workItemId: 0, url: '' },
    currentData: null,
    lastRefresh: null,
    isLoading: false,
    error: null,
    displayMode: 'expanded',
    acPattern: '',
    customWidth: 340, // Default width
    visibleFields: undefined,
    completedAcIndices: []
  } as WidgetState);

  const [expandedAcIndex, setExpandedAcIndex] = useSyncedState('expandedAcIndex', -1);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useSyncedState('isDescriptionExpanded', false);

  // Safely check for pending data in a lifecycle hook
  useEffect(() => {
    // Register this instance as the active listener for UI updates
    activeInstanceUpdateHandler = async (url: string) => {
      await handleUpdatePBI(url);
    };

    // Cleanup
    return () => {
      activeInstanceUpdateHandler = null;
    };
  });

  useEffect(() => {
    if (!widgetState.currentData && !widgetState.isLoading) {
      waitForTask(handleCheckPending());
    }
  }, []); // Run once on mount

  async function handleCheckPending() {
    try {
      const pendingUrl = await figma.clientStorage.getAsync(PENDING_PBI_KEY);
      if (pendingUrl) {
        console.log('Found pending URL:', pendingUrl);
        // Clear it immediately to prevent loops, then try to use it
        await figma.clientStorage.deleteAsync(PENDING_PBI_KEY);
        try {
          await handleUpdatePBI(pendingUrl);
        } catch (innerErr) {
          console.warn('Pending URL was invalid, ignoring:', innerErr);
          // Silent fail: do not set widget state to error
        }
        return;
      }
    } catch (e) {
      console.warn('Check pending failed:', e);
    }
  }

  const handleOpenUI = async () => {
    // Note: In Widget context, we still support opening the UI for configuration
    figma.showUI(__html__, { width: 400, height: 600 });
    const config = await ConfigStorageService.getConfigInfo();
    if (config && figma.ui) {
      figma.ui.postMessage({ type: 'init', payload: { config, isInstance: true, version: WIDGET_VERSION } });
    }
    // Keep internal promise pending to prevent immediate closure if needed
    return new Promise(() => { });
  };

  const handleUpdatePBI = async (url: string) => {
    const parseResult = AzureDevOpsURLParser.parseURL(url);
    if (!parseResult.isValid || !parseResult.data) {
      throw new Error(parseResult.error || 'Invalid URL');
    }

    const config = await ConfigStorageService.retrieveConfig();
    if (!config) throw new Error('Setup required');

    setWidgetState({ ...widgetState, isLoading: true });

    const validation = await PBIValidationService.validatePBI(parseResult.data, config.pat);
    if (!validation.isValid || !validation.data) {
      throw new Error(validation.error?.userMessage || 'Validation failed');
    }

    setWidgetState({
      ...widgetState,
      pbiInfo: parseResult.data,
      currentData: validation.data,
      lastRefresh: new Date(),
      isLoading: false,
      error: null,
      acPattern: config.acPattern || '',
      visibleFields: config.visibleFields
    });
  };

  const handleRefresh = async () => {
    if (widgetState.isLoading) return;

    setWidgetState({ ...widgetState, isLoading: true, error: null });

    try {
      const config = await ConfigStorageService.retrieveConfig();
      if (!config || !config.pat) {
        throw new Error('PAT not found. Please configure the plugin.');
      }

      const validation = await PBIValidationService.validatePBI(widgetState.pbiInfo, config.pat);
      if (!validation.isValid || !validation.data) {
        throw new Error(validation.error?.userMessage || 'Failed to refresh work item.');
      }

      setWidgetState({
        ...widgetState,
        currentData: validation.data,
        lastRefresh: new Date(),
        isLoading: false,
        visibleFields: config.visibleFields // Refresh config too
      });
    } catch (err) {
      setWidgetState({
        ...widgetState,
        isLoading: false,
        error: {
          code: 'REFRESH_ERROR',
          message: (err as any).message,
          userMessage: (err as any).message,
          retryable: true,
        },
      });
    }
  };


  const handleLog = async () => {
    try {
      const currentPageName = figma.currentPage.name;
      await figma.loadAllPagesAsync();

      const config = await ConfigStorageService.retrieveConfig();
      const logPageName = config?.changeLogPageName || "Change Log";

      // 1. Find or create "Change Log" page
      let logPage = figma.root.children.find((p: any) => p.name === logPageName);
      if (!logPage) {
        logPage = figma.createPage();
        logPage.name = logPageName;
      }


      // 2. Find or create the main container frame
      let containerFrame = logPage.children.find((n: any) => n.name === "Change Log Container" && n.type === "FRAME");
      if (!containerFrame) {
        containerFrame = figma.createFrame();
        containerFrame.name = "Change Log Container";
        containerFrame.layoutMode = "VERTICAL";
        containerFrame.counterAxisSizingMode = "AUTO"; // Width adapts (hug)
        containerFrame.primaryAxisSizingMode = "AUTO"; // Height adapts (hug)
        containerFrame.itemSpacing = 24;
        containerFrame.paddingLeft = 40;
        containerFrame.paddingRight = 40;
        containerFrame.paddingTop = 40;
        containerFrame.paddingBottom = 40;
        containerFrame.fills = [{ type: 'SOLID', color: { r: 15 / 255, g: 23 / 255, b: 42 / 255 } }]; // Dark Blue #0F172A
        containerFrame.strokes = [];
        containerFrame.cornerRadius = 0;
        containerFrame.resize(800, 100); // Initial width

        // Add Main Header "Change log"
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        const mainHeader = figma.createText();
        mainHeader.fontName = { family: "Inter", style: "Bold" };
        mainHeader.characters = "Change log";
        mainHeader.fontSize = 32;
        mainHeader.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        mainHeader.layoutAlign = "CENTER";
        containerFrame.appendChild(mainHeader);

        // Add separator line
        const separator = figma.createLine();
        separator.strokeWeight = 1;
        separator.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        separator.layoutAlign = "STRETCH";
        containerFrame.appendChild(separator);

        logPage.appendChild(containerFrame);
      }

      // 3. Find or create group for the source page
      // We look for a Text node with the page name to identify the section
      // OR we can structure it as sub-frames. Let's try to append to a sub-frame or just find the header.
      // Simpler approach: Look for the last "Page Header" in the container.
      // If it doesn't match current page, append new header.
      // If it matches, append entry below it.
      // Actually, user wants grouping. So let's look for a frame named `Page: ${currentPageName}`?
      // Screenshot looks like a flat list with Headers.

      let targetInsertIndex = containerFrame.children.length;
      let foundPageSection = false;

      // Iterate children to find if we already have a section for this page
      // This is tricky in a flat list. Let's create a FRAME for each Page Section to make it easier.

      let pageSectionFrame = containerFrame.children.find((n: any) => n.name === `Section: ${currentPageName}` && n.type === "FRAME");

      if (!pageSectionFrame) {
        pageSectionFrame = figma.createFrame();
        pageSectionFrame.name = `Section: ${currentPageName}`;
        pageSectionFrame.layoutMode = "VERTICAL";
        pageSectionFrame.counterAxisSizingMode = "AUTO";
        pageSectionFrame.primaryAxisSizingMode = "AUTO";
        pageSectionFrame.layoutAlign = "STRETCH";
        pageSectionFrame.itemSpacing = 16;
        pageSectionFrame.fills = []; // Transparent
        pageSectionFrame.strokes = [];

        // Page Header
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        const pageHeader = figma.createText();
        pageHeader.fontName = { family: "Inter", style: "Bold" };
        pageHeader.characters = currentPageName;
        pageHeader.fontSize = 24;
        pageHeader.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        pageSectionFrame.appendChild(pageHeader);

        containerFrame.appendChild(pageSectionFrame);
      }

      // 4. Append log entry to the Page Section Frame
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" }); // For Bold parts if needed

      // Format: November 17, 2025; designer: Florin G.; #2180858: (GM) PAS Details Screen...
      const now = new Date();
      const options: any = { year: 'numeric', month: 'long', day: 'numeric' };
      const dateStr = now.toLocaleDateString('en-US', options);

      const userName = figma.currentUser ? figma.currentUser.name : "Unknown User";
      const pbiId = widgetState.currentData?.id || "?";
      const pbiTitle = widgetState.currentData?.title || "No Title";

      const entryText = figma.createText();
      entryText.fontName = { family: "Inter", style: "Regular" };
      entryText.fontSize = 14;
      entryText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      entryText.layoutAlign = "STRETCH";

      // Construct text content
      const contentString = `${dateStr}; designer: ${userName}; #${pbiId}: ${pbiTitle}`;
      entryText.characters = contentString;

      // Style specifics: Title underlined?
      // Implementation: We find the index of the title and apply text decoration.
      const titleIndex = contentString.indexOf(pbiTitle);
      if (titleIndex !== -1) {
        entryText.setRangeTextDecoration(titleIndex, titleIndex + pbiTitle.length, "UNDERLINE");
        if (widgetId) {
          // @ts-ignore
          entryText.setRangeHyperlink(titleIndex, titleIndex + pbiTitle.length, { type: 'NODE', value: widgetId });
        }
        // Make ID bold? Screenshot shows ID bold-ish or just distinct? Screenshot: "#2180858: ..." looks bold.
        const idString = `#${pbiId}`;
        const idIndex = contentString.indexOf(idString);
        if (idIndex !== -1) {
          entryText.setRangeFontName(idIndex, idIndex + idString.length, { family: "Inter", style: "Bold" });
        }
        entryText.setRangeFontName(titleIndex, titleIndex + pbiTitle.length, { family: "Inter", style: "Bold" });
      } else {
        // Fallback if split fails logic
        entryText.fontName = { family: "Inter", style: "Regular" };
      }

      pageSectionFrame.appendChild(entryText);

      // 5. Toast notification
      figma.notify("Log entry created", { timeout: 2000 });

    } catch (err: any) {
      console.error("Log Error:", err);
      figma.notify("Failed to log entry: " + err.message);
    }
  };

  const handleResize = (delta: number) => {
    const current = widgetState.customWidth || 340;
    const newWidth = Math.max(280, Math.min(800, current + delta)); // Clamp between 280 and 800
    setWidgetState({ ...widgetState, customWidth: newWidth });
  };

  const toggleAcStatus = (index: number) => {
    const currentIndices = widgetState.completedAcIndices || [];
    let newIndices;
    if (currentIndices.includes(index)) {
      newIndices = currentIndices.filter((i: number) => i !== index);
    } else {
      newIndices = [...currentIndices, index];
    }
    setWidgetState({ ...widgetState, completedAcIndices: newIndices });
  };

  const parseAcceptanceCriteria = (data: PBIData): string[] => {
    const acString = data.acceptanceCriteria.join('\n');
    const pattern = widgetState.acPattern || '';
    if (!pattern) {
      return acString.split('\n').filter(ac => ac.trim() !== '');
    }
    try {
      const regex = new RegExp(pattern, 'g');
      return acString.split(regex).filter(ac => ac.trim() !== '');
    } catch (e) {
      console.error('Invalid AC Regex:', e);
      return [acString];
    }
  };

  // Helper to safely strip HTML for Figma Text
  const stripHtml = (html: string) => {
    if (!html) return '';
    let text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return text.trim();
  };

  if (widgetState.isLoading) return <LoadingState />;
  if (widgetState.error) return <ErrorState error={widgetState.error as any} onRetry={handleRefresh} onConfigure={handleOpenUI} />;

  // Smart Widget Empty State
  if (!widgetState.currentData) {
    return (
      <AutoLayout
        direction="vertical"
        padding={24}
        fill="#FFFFFF"
        cornerRadius={12}
        stroke="#E6E6E6"
        spacing={12}
        width={320}
        horizontalAlignItems="center"
        effect={{
          type: 'drop-shadow',
          color: { r: 0, g: 0, b: 0, a: 0.1 },
          offset: { x: 0, y: 4 },
          blur: 12,
        }}
        onClick={() => new Promise(resolve => resolve(null))} // Prevent selection pass-through
      >
        <Text fontSize={16} fontWeight="bold" fill="#333333">Azure DevOps PBI</Text>
        <Text fontSize={12} fill="#666666" width="fill-parent" horizontalAlignText="center">
          Click 'Connect' to load a PBI from URL.
        </Text>

        <AutoLayout
          padding={{ top: 8, bottom: 8, left: 16, right: 16 }}
          fill="#0078D4"
          cornerRadius={6}
          onClick={handleOpenUI}
        >
          <Text fill="#FFFFFF" fontSize={12} fontWeight="bold">Connect PBI</Text>
        </AutoLayout>
      </AutoLayout>
    );
  }

  const parsedACs = parseAcceptanceCriteria(widgetState.currentData);
  const width = widgetState.customWidth || 340;
  const show = widgetState.visibleFields || {
    showType: true, showState: true, showDesc: true, showTags: true,
    showArea: true, showIteration: true, showAssigned: true, showChanged: true, showDone: false
  };

  return (
    <AutoLayout direction="vertical" width={width} cornerRadius={8} fill="#FFF" stroke="#E5E5E5" padding={16} spacing={12}>
      {/* Header: ID and Title */}
      < AutoLayout verticalAlignItems="center" width="fill-parent" spacing={8}>
        < Text fontSize={14} fontWeight={600} width="fill-parent">#{widgetState.currentData.id}: {widgetState.currentData.title}</Text >
      </AutoLayout >

      {/* Meta Row */}
      <AutoLayout spacing={8} wrap={true} width="fill-parent">
        {show.showType && <Text fontSize={11} fill="#666" fontWeight={500}>{widgetState.currentData.workItemType}</Text>}
        {show.showState && <StatePill state={widgetState.currentData.state} />}
        {widgetState.currentData.boardColumn && <StatePill state={widgetState.currentData.boardColumn} isColumn={true} />}
        {show.showDone && widgetState.currentData.boardColumnDone && (
          <AutoLayout padding={{ horizontal: 6, vertical: 2 }} cornerRadius={10} fill="#DFF6DD">
            <Text fontSize={10} fill="#107C10">Done</Text>
          </AutoLayout>
        )}
        {show.showTags && widgetState.currentData.tags && widgetState.currentData.tags.map((tag: string, i: number) => (
          <AutoLayout key={i} padding={{ horizontal: 6, vertical: 2 }} cornerRadius={10} fill="#F3F2F1">
            <Text fontSize={10} fill="#666">{tag}</Text>
          </AutoLayout>
        ))}
      </AutoLayout >

      {/* Context Row */}
      {(show.showArea || show.showIteration) && (
        <AutoLayout direction="vertical" width="fill-parent" spacing={4}>
          {show.showArea && <Text fontSize={10} fill="#888">📂 {widgetState.currentData.areaPath}</Text>}
          {show.showIteration && <Text fontSize={10} fill="#888">📅 {widgetState.currentData.iterationPath}</Text>}
        </AutoLayout>
      )}

      {/* Description */}
      {show.showDesc && widgetState.currentData.description && (
        <AutoLayout
          direction="vertical"
          width="fill-parent"
          spacing={4}
          padding={{ top: 4, bottom: 4 }}
          onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
          cursor="pointer"
          hoverStyle={{ bg: '#FAFAFA' }}
        >
          <Text fontSize={12} fill="#333" width="fill-parent" lineHeight={16}>
            {isDescriptionExpanded
              ? stripHtml(widgetState.currentData.description)
              : truncateText(stripHtml(widgetState.currentData.description), 150)}
          </Text>
        </AutoLayout>
      )}

      {/* Acceptance Criteria */}
      <AutoLayout direction="vertical" width="fill-parent" spacing={4}>
        < Text fontSize={12} fontWeight={600} > Acceptance Criteria</Text >
        {
          parsedACs.map((ac, index) => (
            <AccordionItem
              key={index}
              content={ac}
              isExpanded={index === expandedAcIndex}
              isDone={(widgetState.completedAcIndices || []).includes(index)}
              onClick={() => setExpandedAcIndex(index === expandedAcIndex ? -1 : index)}
              onToggle={() => toggleAcStatus(index)}
            />
          ))
        }
      </AutoLayout >

      {/* Footer Info */}
      <AutoLayout width="fill-parent" verticalAlignItems="center" spacing={8} wrap={true}>
        {show.showAssigned && < Text fontSize={10} fill="#999">Assigned: {widgetState.currentData.assignedTo || 'Unassigned'}</Text>}
        {show.showChanged && < Text fontSize={10} fill="#999"> | Mod: {widgetState.currentData.changedBy}</Text>}
        < Text fontSize={10} fill="#999">
          {widgetState.lastRefresh ? ` | ${formatRelativeTime(widgetState.lastRefresh)}` : ''}
        </Text >
      </AutoLayout >

      {/* Footer Controls */}
      <AutoLayout
        width="fill-parent"
        verticalAlignItems="center"
        horizontalAlignItems="center"
        padding={{ top: 8 }}
      >
        <AutoLayout spacing={8} verticalAlignItems="center">
          <ActionButton label="-" onClick={() => handleResize(-40)} />
          <Text fontSize={10} fill="#999">Width</Text>
          <ActionButton label="+" onClick={() => handleResize(40)} />
        </AutoLayout>

        <Rectangle width="fill-parent" height={1} fill={{ type: 'solid', color: '#000000', opacity: 0 }} />

        <AutoLayout spacing={8}>
          <ActionButton label="View" onClick={() => {
            const url = widgetState.pbiInfo?.url || `https://dev.azure.com/${widgetState.pbiInfo.organization}/${widgetState.pbiInfo.project}/_workitems/edit/${widgetState.pbiInfo.workItemId}`;
            return new Promise(() => figma.openExternal(url));
          }} />
          <ActionButton label="Sync" onClick={handleRefresh} />
          <ActionButton label="Menu" onClick={handleOpenUI} />
          <ActionButton label="Log" onClick={handleLog} />
        </AutoLayout>
      </AutoLayout>
    </AutoLayout >
  );
}

// --- Sub-components ---

const ToggleCheck = ({ isDone, onToggle }: { isDone: boolean, onToggle: () => void }) => (
  <AutoLayout
    width={20}
    height={20}
    cornerRadius={10}
    stroke={isDone ? "#107C10" : "#999999"}
    fill={isDone ? "#107C10" : "#FFFFFF"}
    horizontalAlignItems="center"
    verticalAlignItems="center"
    onClick={(e: any) => {
      // In Figma Widgets, returning a Promise that resolves prevents interactions from bubbling?
      // Actually, standard behavior is touch/click on child handles it.
      return new Promise((resolve) => {
        onToggle();
        resolve(null);
      });
    }}
  >
    {isDone && (
      <SVG
        src={`<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3L4.5 8.5L2 6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
      />
    )}
  </AutoLayout>
);

const AccordionItem = ({ content, isExpanded, isDone, onClick, onToggle, key }: { content: string, isExpanded: boolean, isDone: boolean, onClick: () => void, onToggle: () => void, key?: any }) => (
  <AutoLayout direction="vertical" width="fill-parent" stroke="#EEE" cornerRadius={4} hoverStyle={{ bg: '#F7F7F7' }} cursor="pointer">
    {/* Header Section: Text + Toggle */}
    < AutoLayout
      width="fill-parent"
      padding={8}
      verticalAlignItems="start" // Start alignment for multiline text
      spacing={8}
      direction="horizontal"
      onClick={onClick}
    >
      < Text fontSize={11} width="fill-parent" paragraphIndent={0} lineHeight={16}>
        {isExpanded ? content : truncateText(stripHTMLSimple(content), 50)}
      </Text>

      {/* Toggle Button - Separate interaction */}
      <ToggleCheck isDone={isDone} onToggle={onToggle} />

    </AutoLayout >
  </AutoLayout >
);

const LoadingState = () => <BaseState><Text>Loading PBI...</Text></BaseState>;
const EmptyState = ({ onConfigure }: { onConfigure: () => void }) => (
  <BaseState>
    <AutoLayout direction="vertical" horizontalAlignItems="center" spacing={8}>
      <Text fontWeight={600}>No PBI Loaded</Text>
      <Text fontSize={11} fill="#666" horizontalAlignText="center">Open the 'Azure DevOps' plugin to select a PBI</Text>
      <ActionButton label="Configure" onClick={onConfigure} />
    </AutoLayout >
  </BaseState >
);
const ErrorState = ({ error, onRetry, onConfigure }: { error: any, onRetry: () => void, onConfigure: () => void }) => (
  <BaseState>
    <AutoLayout direction="vertical" horizontalAlignItems="center" spacing={8} padding={16}>
      <Text fill="#D92C2C" horizontalAlignText="center">{(error as any).userMessage || 'An error occurred'}</Text>
      <AutoLayout spacing={12}>
        <Text onClick={onRetry} hoverStyle={{ textDecoration: 'underline' }} cursor="pointer">Retry</Text>
        <Text onClick={onConfigure} hoverStyle={{ textDecoration: 'underline' }} cursor="pointer">Configure</Text>
      </AutoLayout >
    </AutoLayout >
  </BaseState >
);
const BaseState: any = ({ children }: { children: any }) => (
  <AutoLayout width={340} height={200} verticalAlignItems="center" horizontalAlignItems="center" fill="#F7F7F7" cornerRadius={8}>
    {children}
  </AutoLayout >
);


// Helper for Accordion (duplicated strip because scope) or move stripHtml up?
// Move stripHtml logic into utility if possible, or duplicate for safety in this restricted block.
function stripHTMLSimple(html: string) {
  return html.replace(/<[^>]+>/g, '').trim();
}

const StatePill = ({ state, isColumn }: { state: string, isColumn?: boolean }) => (
  <AutoLayout padding={{ horizontal: 6, vertical: 2 }} cornerRadius={10} fill={isColumn ? '#EEE' : getStateColor(state).bg}>
    <Text fontSize={10} fill={isColumn ? '#444' : getStateColor(state).text}>{state}</Text>
  </AutoLayout>
);
const ActionButton = ({ label, onClick }: { label: string, onClick?: () => void }) => (
  <AutoLayout padding={{ horizontal: 8, vertical: 4 }} cornerRadius={4} stroke="#DDD" hoverStyle={{ bg: '#F7F7F7' }} cursor="pointer" onClick={onClick}>
    < Text fontSize={11} > {label}</Text >
  </AutoLayout >
);

// --- Entry Point Logic ---

/**
 * Smart Widget Strategy:
 * - 'containsWidget: true' acts as an implicit widget insertion command.
 * - We remove the global 'run' handler to prevent UI flashing on launch.
 * - The Widget component handles the "Setup" state and opens the UI on demand.
 */

// 1. Setup global message handling (for when the user opens UI from the widget)
figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    switch (msg.type) {
      case 'store-config':
        await handleStoreConfig(msg.payload);
        // If we have an active instance update handler, use it
        if (activeInstanceUpdateHandler) {
          // await activeInstanceUpdateHandler(msg.payload.url); // Does this payload have URL? No, store-config payload is config.
          // Oops, store-config payload does NOT have URL.
          // User flow: Store Config -> then what?
          // If stored, we might want to refresh the active widget if it exists?
          // But refresh needs a URL? 
          // The previous code: await activeInstanceUpdateHandler(msg.payload.url);
          // Check ui.html: sendMessage('store-config', { organization, pat, acPattern, visibleFields }); -> NO URL.
          // So this line `msg.payload.url` will be undefined.
          // We should just refresh the current widget if possible, or do nothing.
          // If we have access to current widget state? We don't from `figma.ui.onmessage` easily unless we stored it.
          // But `activeInstanceUpdateHandler` expects a URL.
          // We can change activeInstanceUpdateHandler to take optional URL?
          // Or just notify 'Config Saved'.

          figma.notify("Configuration saved. Please refresh the widget.");
        } else {
          // Fallback for disconnected UI
          // await figma.clientStorage.setAsync(PENDING_PBI_KEY, ...); // No URL to set
          figma.notify("Config saved.");
        }
        break;
      case 'create-widget':
        // Payload has URL
        if (msg.payload.url) {
          // Fire and forget storage of the base URL
          ConfigStorageService.storeLastBaseUrl(msg.payload.url).catch(console.error);
        }

        if (activeInstanceUpdateHandler) {
          await activeInstanceUpdateHandler(msg.payload.url);
          figma.notify('Widget updated!');
        } else {
          await figma.clientStorage.setAsync(PENDING_PBI_KEY, msg.payload.url);
          figma.notify("PBI Saved! Drag a new widget to see it.");
        }
        break;
      // ...
      // ... (rest of switch)

      case 'clear-config':
        await handleClearConfig();
        break;
    }
  } catch (e: any) {
    figma.notify('Error: ' + e.message);
  }
};

// 2. Widget Context (Always register)
try {
  if (typeof widget !== 'undefined' && widget.register) {
    widget.register(PBIWidget);
    console.log('Azure DevOps Widget Loaded - Version Fix 2.0 - Timestamp: ' + new Date().toISOString());
  }
} catch (e) {
  console.log('Widget registration failed or not supported.');
}