// Core type definitions for Azure DevOps PBI Integration

export interface ParsedPBIInfo {
  organization: string;
  project: string;
  workItemId: number;
  url: string;
}

export interface PBIData {
  id: number;
  title: string;
  state: string;
  description: string;
  acceptanceCriteria: string[];
  assignedTo?: string;
  lastUpdated: Date;
  workItemType: string;
  creator: string;
  createdDate: Date;
  modifiedDate: Date;
  // New fields
  tags: string[];
  areaPath: string;
  iterationPath: string;
  boardColumn: string;
  boardColumnDone: boolean;
  changedBy: string;
}

export interface APIError {
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
}

export interface StoredConfig {
  encryptedPat: string;
  organization: string;
  acPattern: string;
  createdAt: Date;
  visibleFields?: Record<string, boolean>;
  lastBaseUrl?: string; // Persist the last used URL
}

export interface WidgetState {
  pbiInfo: ParsedPBIInfo;
  currentData: PBIData | null;
  lastRefresh: Date | null;
  isLoading: boolean;
  error: APIError | null;
  displayMode: 'compact' | 'expanded';
  acPattern?: string;
  visibleFields?: Record<string, boolean>;
  customWidth?: number;
}

export interface BackendResponse {
  success: boolean;
  data?: PBIData;
  error?: APIError;
  cached: boolean;
  cacheExpiry?: Date;
}

// Plugin message types
export interface PluginMessage {
  type: 'store-config' | 'create-widget' | 'clear-config' | 'create-mock-widget';
  payload?: any;
}

export interface UIMessage {
  type: 'config-stored' | 'init' | 'error';
  payload?: any;
}