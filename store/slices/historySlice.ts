import type { StateCreator } from 'zustand';
// FIX: Import `initialAppState` as a value, not just a type, so it can be used in the `set` function.
import { initialAppState, type AppStore } from '../useAppStore';
import { ReportListItem } from '../../types';
import { getReportsList, saveReport, getReport, deleteReport, CURRENT_SESSION_KEY } from '../../storageService';
import { vectorStore } from '../../services/vectorStore';

export interface IHistorySlice {
    reportsList: ReportListItem[];
    loadReportsList: () => Promise<void>;
    handleLoadReport: (id: string) => Promise<void>;
    handleDeleteReport: (id: string) => Promise<void>;
    handleNewSession: () => Promise<void>;
}

export const createHistorySlice: StateCreator<AppStore, [], [], IHistorySlice> = (set, get) => ({
    reportsList: [],
    loadReportsList: async () => {
        const list = await getReportsList();
        set({ reportsList: list });
    },
    handleLoadReport: async (id) => {
        get().addProgress(`Loading report ${id}...`);
        const report = await getReport(id);
        if (report) {
            vectorStore.clear();
            set({ ...report.appState, currentView: 'analysis_dashboard', isHistoryPanelOpen: false });
            if (report.appState.vectorStoreDocuments) {
                vectorStore.rehydrate(report.appState.vectorStoreDocuments);
            }
            get().addProgress(`Report "${report.filename}" loaded.`);
        } else {
            get().addProgress(`Failed to load report ${id}.`, 'error');
        }
    },
    handleDeleteReport: async (id) => {
        await deleteReport(id);
        await get().loadReportsList();
    },
    handleNewSession: async () => {
        if (get().csvData) {
            const existingSession = await getReport(CURRENT_SESSION_KEY);
            if (existingSession) {
                const archiveId = `report-${existingSession.createdAt.getTime()}`;
                await saveReport({ ...existingSession, id: archiveId, updatedAt: new Date() });
            }
        }
        vectorStore.clear();
        await deleteReport(CURRENT_SESSION_KEY);
        set(initialAppState); // This needs access to the initial state
        await get().loadReportsList();
    },
});