import { create } from 'zustand';
import { Report, AppState, ReportListItem } from '../types';
import { getReport, saveReport, CURRENT_SESSION_KEY } from '../storageService';
import { vectorStore } from '../services/vectorStore';

import { createUISlice, IUISlice } from './slices/uiSlice';
import { createSettingsSlice, ISettingsSlice } from './slices/settingsSlice';
import { createHistorySlice, IHistorySlice } from './slices/historySlice';
import { createCardSlice, ICardSlice } from './slices/cardSlice';
import { createDataSlice, IDataSlice } from './slices/dataSlice';
import { createChatSlice, IChatSlice } from './slices/chatSlice';

export const initialAppState: AppState = {
    currentView: 'file_upload',
    isBusy: false,
    progressMessages: [],
    csvData: null,
    columnProfiles: [],
    analysisCards: [],
    chatHistory: [],
    finalSummary: null,
    aiCoreAnalysisSummary: null,
    dataPreparationPlan: null,
    initialDataSample: null,
    vectorStoreDocuments: [],
    spreadsheetFilterFunction: null,
    aiFilterExplanation: null,
    pendingClarification: null,
};

// Combine all state and action types into a single AppStore type
export type AppStore = AppState & 
    IUISlice & 
    ISettingsSlice & 
    IHistorySlice & 
    ICardSlice & 
    IDataSlice & 
    IChatSlice & 
{
    init: () => void;
    // Add reportsList to the top-level type for history slice to access
    reportsList: ReportListItem[];
};

export const useAppStore = create<AppStore>()((set, get, store) => ({
    ...initialAppState,
    reportsList: [], // Initial value for reportsList

    // Combine all slices
    // FIX: Pass the `store` argument to all slice creators.
    ...createUISlice(set, get, store),
    ...createSettingsSlice(set, get, store),
    ...createHistorySlice(set, get, store),
    ...createCardSlice(set, get, store),
    ...createDataSlice(set, get, store),
    ...createChatSlice(set, get, store),

    // Global init function
    init: async () => {
        const currentSession = await getReport(CURRENT_SESSION_KEY);
        if (currentSession) {
            set({
                ...currentSession.appState,
                currentView: currentSession.appState.csvData ? 'analysis_dashboard' : 'file_upload',
            });
            if (currentSession.appState.vectorStoreDocuments && vectorStore.getIsInitialized()) {
                vectorStore.rehydrate(currentSession.appState.vectorStoreDocuments);
                get().addProgress('Restored AI long-term memory from last session.');
            }
        }
        await get().loadReportsList();
    },
}));

// Auto-save current session to IndexedDB periodically
setInterval(async () => {
    const state = useAppStore.getState();
    if (state.csvData && state.csvData.data.length > 0) {
        const stateToSave: AppState = {
            currentView: state.currentView, isBusy: state.isBusy, progressMessages: state.progressMessages,
            csvData: state.csvData, columnProfiles: state.columnProfiles, analysisCards: state.analysisCards,
            chatHistory: state.chatHistory, finalSummary: state.finalSummary, aiCoreAnalysisSummary: state.aiCoreAnalysisSummary,
            dataPreparationPlan: state.dataPreparationPlan, initialDataSample: state.initialDataSample,
            vectorStoreDocuments: vectorStore.getDocuments(), spreadsheetFilterFunction: state.spreadsheetFilterFunction,
            aiFilterExplanation: state.aiFilterExplanation, pendingClarification: state.pendingClarification,
        };
        const currentReport: Report = {
            id: CURRENT_SESSION_KEY, filename: state.csvData.fileName || 'Current Session',
            createdAt: (await getReport(CURRENT_SESSION_KEY))?.createdAt || new Date(),
            updatedAt: new Date(), appState: stateToSave,
        };
        await saveReport(currentReport);
    }
}, 2000);