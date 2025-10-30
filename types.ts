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