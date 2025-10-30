export type CsvRow = { [key: string]: string | number };
export type CsvData = CsvRow[];

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
    aggregatedData: CsvData;
    summary: string;
    displayChartType: ChartType;
    isDataVisible: boolean;
    topN: number | null; // For Top N filtering
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
}

export interface Settings {
    apiKey: string;
    model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
    language: 'English' | 'Mandarin' | 'Spanish' | 'Japanese' | 'French';
}

export interface AppState {
    isBusy: boolean;
    useCloudAI: boolean;
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

export interface AiChatResponse {
  responseType: 'plan_creation' | 'text_response' | 'dom_action';
  plan?: AnalysisPlan;
  text?: string;
  domAction?: DomAction;
}

export interface UnpivotPlan {
    indexColumns: string[];
    valueColumns: string[];
    variableColumnName: string;
    valueColumnName: string;
}

export interface DataStructureAnalysis {
    format: 'tidy' | 'crosstab';
    unpivotPlan?: UnpivotPlan;
}

export interface CleaningRule {
    column: string;
    contains?: string;
    equals?: string;
    startsWith?: string;
}

export interface CleaningPlan {
    excludeRows: CleaningRule[];
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
