
export type CsvRow = { [key: string]: string | number };

// Changed from CsvRow[] to an object to include filename metadata
export interface CsvData {
    fileName: string;
    data: CsvRow[];
}

export interface ColumnProfile {
    name: string;
    type: 'numerical' | 'categorical';
    uniqueValues?: number;
    valueRange?: [number, number];
    missingPercentage?: number;
}

export type ChartType = 'bar' | 'line' | 'pie';
export type AggregationType = 'sum' | 'count' | 'avg';

export interface AnalysisPlan {
    chartType: ChartType;
    title: string;
    description: string;
    aggregation: AggregationType;
    groupByColumn: string;
    valueColumn?: string; // Optional for 'count' aggregation
}

export interface AnalysisCardData {
    id: string;
    plan: AnalysisPlan;
    aggregatedData: CsvRow[];
    summary: string;
    displayChartType: ChartType;
    isDataVisible: boolean;
    topN: number | null; // For Top N filtering
    hideOthers: boolean; // For hiding the 'Others' category in Top N
}

export interface ProgressMessage {
    text: string;
    type: 'system' | 'error';
    timestamp: Date;
}

export interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
    isError?: boolean; // To style error messages in the chat
}

export interface Settings {
    apiKey: string;
    model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
    language: 'English' | 'Mandarin' | 'Spanish' | 'Japanese' | 'French';
}

export interface AppState {
    isBusy: boolean;
    progressMessages: ProgressMessage[];
    csvData: CsvData | null;
    columnProfiles: ColumnProfile[];
    analysisCards: AnalysisCardData[];
    chatHistory: ChatMessage[];
    finalSummary: string | null;
}

export interface DomAction {
    toolName: 'highlightCard' | 'changeCardChartType' | 'showCardData';
    args: { [key: string]: any };
}

export interface AiAction {
  responseType: 'plan_creation' | 'text_response' | 'dom_action';
  plan?: AnalysisPlan;
  text?: string;
  domAction?: DomAction;
}

export interface AiChatResponse {
    actions: AiAction[];
}

export interface DataPreparationPlan {
    explanation: string;
    jsFunctionBody: string | null;
}

// For Session History
export interface Report {
    id: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
    appState: AppState;
}

export interface ReportListItem {
    id: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
}

// For providing richer context to the AI
export interface CardContext {
    id: string;
    title: string;
    aggregatedDataSample: CsvRow[];
}
