import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, CardContext } from '../../types';
import { processCsv, profileData, executePlan, executeJavaScriptDataTransform } from '../../utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary, generateDataPreparationPlan, generateCoreAnalysisSummary, generateProactiveInsights } from '../../services/aiService';
import { vectorStore } from '../../services/vectorStore';
import { deleteReport, getReport, saveReport, CURRENT_SESSION_KEY } from '../../storageService';
import { initialAppState } from '../useAppStore';

export interface IDataSlice {
    addProgress: (message: string, type?: 'system' | 'error') => void;
    runAnalysisPipeline: (plans: AnalysisPlan[], data: CsvData, isChatRequest?: boolean) => Promise<AnalysisCardData[]>;
    handleInitialAnalysis: (dataForAnalysis: CsvData) => Promise<void>;
    handleFileUpload: (file: File) => Promise<void>;
    regenerateAnalyses: (newData: CsvData) => Promise<void>;
}

export const createDataSlice: StateCreator<AppStore, [], [], IDataSlice> = (set, get) => ({
    addProgress: (message, type = 'system') => {
        const newMessage: ProgressMessage = { text: message, type, timestamp: new Date() };
        set(state => ({ progressMessages: [...state.progressMessages, newMessage] }));
    },
    runAnalysisPipeline: async (plans, data, isChatRequest = false) => {
        let isFirstCardInPipeline = true;
        const processPlan = async (plan: AnalysisPlan) => {
             try {
                get().addProgress(`Executing plan: ${plan.title}...`);
                const aggregatedData = executePlan(data, plan);
                if (aggregatedData.length === 0) {
                    get().addProgress(`Skipping "${plan.title}" due to empty result.`, 'error');
                    return null;
                }
                get().addProgress(`AI is summarizing: ${plan.title}...`);
                const summary = await generateSummary(plan.title, aggregatedData, get().settings);
                const newCard: AnalysisCardData = {
                    id: `card-${Date.now()}-${Math.random()}`, plan, aggregatedData, summary,
                    displayChartType: plan.chartType, isDataVisible: false,
                    topN: plan.chartType !== 'scatter' && aggregatedData.length > 15 ? 8 : (plan.defaultTopN || null),
                    hideOthers: plan.chartType !== 'scatter' && aggregatedData.length > 15 ? true : (plan.defaultHideOthers || false),
                    disableAnimation: isChatRequest || !isFirstCardInPipeline || get().analysisCards.length > 0, hiddenLabels: [],
                };
                set(prev => ({ analysisCards: [...prev.analysisCards, newCard] }));
                const cardMemoryText = `[Chart: ${plan.title}] Description: ${plan.description}. AI Summary: ${summary.split('---')[0]}`;
                await vectorStore.addDocument({ id: newCard.id, text: cardMemoryText });
                isFirstCardInPipeline = false; 
                get().addProgress(`Saved as View #${newCard.id.slice(-6)}`);
                return newCard;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                get().addProgress(`Error executing plan "${plan.title}": ${errorMessage}`, 'error');
                return null;
            }
        };
        const createdCards = (await Promise.all(plans.map(processPlan))).filter((c): c is AnalysisCardData => c !== null);

        if (!isChatRequest && createdCards.length > 0) {
            get().addProgress('AI is forming its core understanding of the data...');
            const cardContext: CardContext[] = createdCards.map(c => ({ id: c.id, title: c.plan.title, aggregatedDataSample: c.aggregatedData.slice(0, 10) }));
            const coreSummary = await generateCoreAnalysisSummary(cardContext, get().columnProfiles, get().settings);
            set(prev => ({ aiCoreAnalysisSummary: coreSummary, chatHistory: [...prev.chatHistory, { sender: 'ai', text: coreSummary, timestamp: new Date(), type: 'ai_thinking' }] }));
            await vectorStore.addDocument({ id: 'core-summary', text: `Core Analysis Summary: ${coreSummary}` });
            
            get().addProgress('AI is looking for key insights...');
            const proactiveInsight = await generateProactiveInsights(cardContext, get().settings);
            if (proactiveInsight) {
                set(prev => ({ chatHistory: [...prev.chatHistory, { sender: 'ai', text: proactiveInsight.insight, timestamp: new Date(), type: 'ai_proactive_insight', cardId: proactiveInsight.cardId }] }));
            }

            const finalSummaryText = await generateFinalSummary(createdCards, get().settings);
            set({ finalSummary: finalSummaryText });
            get().addProgress('Overall summary generated.');
        }
        return createdCards;
    },
    handleInitialAnalysis: async (dataForAnalysis) => {
        if (!dataForAnalysis) return;
        set({ isBusy: true });
        get().addProgress('Starting main analysis...');
        try {
            get().addProgress('AI is generating analysis plans...');
            const plans = await generateAnalysisPlans(get().columnProfiles, dataForAnalysis.data.slice(0, 5), get().settings);
            get().addProgress(`AI proposed ${plans.length} plans.`);
            if (plans.length > 0) await get().runAnalysisPipeline(plans, dataForAnalysis, false);
            else get().addProgress('AI did not propose any analysis plans.', 'error');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`Error during analysis: ${errorMessage}`, 'error');
        } finally {
            set({ isBusy: false });
            get().addProgress('Analysis complete. Ready for chat.');
        }
    },
    handleFileUpload: async (file) => {
        if (get().csvData?.data.length > 0) {
            const existingSession = await getReport(CURRENT_SESSION_KEY);
            if (existingSession) await saveReport({ ...existingSession, id: `report-${existingSession.createdAt.getTime()}`, updatedAt: new Date() });
        }
        vectorStore.clear();
        await deleteReport(CURRENT_SESSION_KEY);
        set({ ...initialAppState, isBusy: true, csvData: { fileName: file.name, data: [] } });
        try {
            get().addProgress('Parsing CSV file...');
            const parsedData = await processCsv(file);
            get().addProgress(`Parsed ${parsedData.data.length} rows.`);
            set({ initialDataSample: parsedData.data.slice(0, 20) });
            let dataForAnalysis = parsedData;
            
            if (get().isApiKeySet) {
                await vectorStore.init(get().addProgress);
                get().addProgress('AI is analyzing data for cleaning...');
                const prepPlan = await generateDataPreparationPlan(profileData(dataForAnalysis.data), dataForAnalysis.data.slice(0, 20), get().settings);
                if (prepPlan?.jsFunctionBody) {
                    get().addProgress(`AI Plan: ${prepPlan.explanation}`);
                    dataForAnalysis.data = executeJavaScriptDataTransform(dataForAnalysis.data, prepPlan.jsFunctionBody);
                }
                if (dataForAnalysis.data.length === 0) throw new Error('Dataset empty after transformation.');
                set({ csvData: dataForAnalysis, columnProfiles: prepPlan.outputColumns, dataPreparationPlan: prepPlan, currentView: 'analysis_dashboard' });
                await get().handleInitialAnalysis(dataForAnalysis);
            } else {
                get().addProgress(`API Key not set. Please add it in settings.`, 'error');
                get().setIsSettingsModalOpen(true);
                set({ csvData: dataForAnalysis, columnProfiles: profileData(dataForAnalysis.data), isBusy: false, currentView: 'analysis_dashboard' });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`File Processing Error: ${errorMessage}`, 'error');
            set({ isBusy: false, currentView: 'file_upload' });
        }
    },
    regenerateAnalyses: async (newData) => {
        get().addProgress('Data has changed. Regenerating all analysis cards...');
        const existingPlans = get().analysisCards.map(card => card.plan);
        set({ isBusy: true, analysisCards: [], finalSummary: null });
        try {
            if (existingPlans.length > 0) {
                const newCards = await get().runAnalysisPipeline(existingPlans, newData, true);
                if (newCards.length > 0) {
                    set({ finalSummary: await generateFinalSummary(newCards, get().settings) });
                }
            }
        } catch (error) {
            get().addProgress(`Error updating analyses: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            set({ isBusy: false });
        }
    },
});
