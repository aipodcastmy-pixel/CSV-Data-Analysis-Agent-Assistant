import { create } from 'zustand';
// Fix: Import MouseEvent from React and alias it to resolve the type error.
import type { MouseEvent as ReactMouseEvent } from 'react';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, AppState, ColumnProfile, AiAction, CardContext, ChartType, DomAction, Settings, Report, ReportListItem, AppView, CsvRow, DataPreparationPlan, AiFilterResponse, ClarificationRequest, ClarificationOption } from '../types';
import { processCsv, profileData, executePlan, executeJavaScriptDataTransform } from '../utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary, generateChatResponse, generateDataPreparationPlan, generateCoreAnalysisSummary, generateProactiveInsights, generateFilterFunction } from '../services/aiService';
import { getReportsList, saveReport, getReport, deleteReport, getSettings, saveSettings, CURRENT_SESSION_KEY } from '../storageService';
import { vectorStore } from '../services/vectorStore';

const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;
const MIN_MAIN_WIDTH = 600;

const initialAppState: AppState = {
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

interface StoreState extends AppState {
    isAsideVisible: boolean;
    asideWidth: number;
    isSpreadsheetVisible: boolean;
    isDataPrepDebugVisible: boolean;
    isSettingsModalOpen: boolean;
    isHistoryPanelOpen: boolean;
    isMemoryPanelOpen: boolean;
    isAiFiltering: boolean; // For spreadsheet AI filter loading state
    settings: Settings;
    reportsList: ReportListItem[];
    isResizing: boolean;
    isApiKeySet: boolean;
    pendingClarification: ClarificationRequest | null;
}

interface StoreActions {
    init: () => void;
    addProgress: (message: string, type?: 'system' | 'error') => void;
    loadReportsList: () => Promise<void>;
    handleSaveSettings: (newSettings: Settings) => void;
    handleAsideMouseDown: (e: ReactMouseEvent) => void;
    runAnalysisPipeline: (plans: AnalysisPlan[], data: CsvData, isChatRequest?: boolean) => Promise<AnalysisCardData[]>;
    handleInitialAnalysis: (dataForAnalysis: CsvData) => Promise<void>;
    handleFileUpload: (file: File) => Promise<void>;
    regenerateAnalyses: (newData: CsvData) => Promise<void>;
    executeDomAction: (action: DomAction) => void;
    handleChatMessage: (message: string) => Promise<void>;
    handleClarificationResponse: (userChoice: ClarificationOption) => Promise<void>;
    handleNaturalLanguageQuery: (query: string) => Promise<void>;
    clearAiFilter: () => void;
    handleChartTypeChange: (cardId: string, newType: ChartType) => void;
    handleToggleDataVisibility: (cardId: string) => void;
    handleTopNChange: (cardId: string, topN: number | null) => void;
    handleHideOthersChange: (cardId: string, hide: boolean) => void;
    handleToggleLegendLabel: (cardId: string, label: string) => void;
    handleLoadReport: (id: string) => Promise<void>;
    handleDeleteReport: (id: string) => Promise<void>;
    handleShowCardFromChat: (cardId: string) => void;
    handleNewSession: () => Promise<void>;
    // Simple setters
    setIsAsideVisible: (isVisible: boolean) => void;
    setAsideWidth: (width: number) => void;
    setIsSpreadsheetVisible: (isVisible: boolean) => void;
    setIsDataPrepDebugVisible: (isVisible: boolean) => void;
    setIsSettingsModalOpen: (isOpen: boolean) => void;
    setIsHistoryPanelOpen: (isOpen: boolean) => void;
    setIsMemoryPanelOpen: (isOpen: boolean) => void;
    setIsResizing: (isResizing: boolean) => void;
}

export const useAppStore = create<StoreState & StoreActions>((set, get) => ({
    ...initialAppState,
    isAsideVisible: true,
    asideWidth: window.innerWidth / 4 > MIN_ASIDE_WIDTH ? window.innerWidth / 4 : MIN_ASIDE_WIDTH,
    isSpreadsheetVisible: true,
    isDataPrepDebugVisible: false,
    isSettingsModalOpen: false,
    isHistoryPanelOpen: false,
    isMemoryPanelOpen: false,
    isAiFiltering: false,
    settings: getSettings(),
    reportsList: [],
    isResizing: false,
    isApiKeySet: (() => {
        const settings = getSettings();
        if (settings.provider === 'google') {
            return !!settings.geminiApiKey;
        }
        return !!settings.openAIApiKey;
    })(),
    pendingClarification: null,

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

    // FIX: Explicitly type the 'type' parameter to match the ProgressMessage interface.
    addProgress: (message: string, type: 'system' | 'error' = 'system') => {
        const newMessage: ProgressMessage = { text: message, type, timestamp: new Date() };
        set(state => ({ progressMessages: [...state.progressMessages, newMessage] }));
    },
    
    loadReportsList: async () => {
        const list = await getReportsList();
        set({ reportsList: list });
    },

    handleSaveSettings: (newSettings) => {
        saveSettings(newSettings);
        const isSet = newSettings.provider === 'google'
            ? !!newSettings.geminiApiKey
            : !!newSettings.openAIApiKey;
        set({ 
            settings: newSettings,
            isApiKeySet: isSet,
        });
    },

    handleAsideMouseDown: (e) => {
        e.preventDefault();
        get().setIsResizing(true);
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const maxAllowedAsideWidth = window.innerWidth - MIN_MAIN_WIDTH;
            let newWidth = window.innerWidth - moveEvent.clientX;
            newWidth = Math.max(MIN_ASIDE_WIDTH, newWidth);
            newWidth = Math.min(MAX_ASIDE_WIDTH, newWidth, maxAllowedAsideWidth);
            get().setAsideWidth(newWidth);
        };
        const handleMouseUp = () => {
            get().setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    },
    
    runAnalysisPipeline: async (plans, data, isChatRequest = false) => {
        // Implementation moved from useApp hook
        let isFirstCardInPipeline = true;
        const addProgress = get().addProgress;
        const settings = get().settings;

        const processPlan = async (plan: AnalysisPlan) => {
             try {
                addProgress(`Executing plan: ${plan.title}...`);
                const aggregatedData = executePlan(data, plan);
                if (aggregatedData.length === 0) {
                    addProgress(`Skipping "${plan.title}" due to empty result.`, 'error');
                    return null;
                }
                
                addProgress(`AI is summarizing: ${plan.title}...`);
                const summary = await generateSummary(plan.title, aggregatedData, settings);

                const categoryCount = aggregatedData.length;
                const shouldApplyDefaultTop8 = plan.chartType !== 'scatter' && categoryCount > 15;

                const newCard: AnalysisCardData = {
                    id: `card-${Date.now()}-${Math.random()}`,
                    plan: plan,
                    aggregatedData: aggregatedData,
                    summary: summary,
                    displayChartType: plan.chartType,
                    isDataVisible: false,
                    topN: shouldApplyDefaultTop8 ? 8 : (plan.defaultTopN || null),
                    hideOthers: shouldApplyDefaultTop8 ? true : (plan.defaultHideOthers || false),
                    disableAnimation: isChatRequest || !isFirstCardInPipeline || get().analysisCards.length > 0,
                    hiddenLabels: [],
                };
                
                set(prev => ({ analysisCards: [...prev.analysisCards, newCard] }));

                const cardMemoryText = `[Chart: ${plan.title}] Description: ${plan.description}. AI Summary: ${summary.split('---')[0]}`;
                await vectorStore.addDocument({ id: newCard.id, text: cardMemoryText });
                addProgress(`View #${newCard.id.slice(-6)} indexed for long-term memory.`);

                isFirstCardInPipeline = false; 
                addProgress(`Saved as View #${newCard.id.slice(-6)}`);
                return newCard;
            } catch (error) {
                console.error('Error executing plan:', plan.title, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                addProgress(`Error executing plan "${plan.title}": ${errorMessage}`, 'error');
                return null;
            }
        };
        
        const createdCards = (await Promise.all(plans.map(processPlan))).filter((c): c is AnalysisCardData => c !== null);

        if (!isChatRequest && createdCards.length > 0) {
            addProgress('AI is forming its core understanding of the data...');

            const cardContext: CardContext[] = createdCards.map(c => ({
                id: c.id,
                title: c.plan.title,
                aggregatedDataSample: c.aggregatedData.slice(0, 10),
            }));

            const coreSummary = await generateCoreAnalysisSummary(cardContext, get().columnProfiles, settings);
            
            const thinkingMessage: ChatMessage = { sender: 'ai', text: coreSummary, timestamp: new Date(), type: 'ai_thinking' };
            set(prev => ({
                aiCoreAnalysisSummary: coreSummary,
                chatHistory: [...prev.chatHistory, thinkingMessage],
            }));
                
            addProgress("Indexing core analysis for long-term memory...");
            await vectorStore.addDocument({ id: 'core-summary', text: `Core Analysis Summary: ${coreSummary}` });
            addProgress("Core analysis indexed.");
            
            addProgress('AI is looking for key insights...');
            const proactiveInsight = await generateProactiveInsights(cardContext, settings);
            
            if (proactiveInsight) {
                const insightMessage: ChatMessage = {
                    sender: 'ai',
                    text: proactiveInsight.insight,
                    timestamp: new Date(),
                    type: 'ai_proactive_insight',
                    cardId: proactiveInsight.cardId,
                };
                set(prev => ({ chatHistory: [...prev.chatHistory, insightMessage] }));
                addProgress(`AI proactively identified an insight in View #${proactiveInsight.cardId.slice(-6)}.`);
            }

            const finalSummaryText = await generateFinalSummary(createdCards, settings);
            set({ finalSummary: finalSummaryText });
            addProgress('Overall summary generated.');
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
            
            if (plans.length > 0) {
                await get().runAnalysisPipeline(plans, dataForAnalysis, false);
            } else {
                get().addProgress('AI did not propose any analysis plans.', 'error');
            }
        } catch (error) {
            console.error('Analysis pipeline error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`Error during analysis: ${errorMessage}`, 'error');
        } finally {
            set({ isBusy: false });
            get().addProgress('Analysis complete. Ready for chat.');
        }
    },

    handleFileUpload: async (file) => {
        // Implementation moved from useApp hook
        const currentState = get();
        if (currentState.csvData && currentState.csvData.data.length > 0) {
             const existingSession = await getReport(CURRENT_SESSION_KEY);
             if (existingSession) {
                const archiveId = `report-${existingSession.createdAt.getTime()}`;
                const sessionToArchive: Report = { ...existingSession, id: archiveId, updatedAt: new Date() };
                await saveReport(sessionToArchive);
             }
        }
        
        vectorStore.clear();
        await deleteReport(CURRENT_SESSION_KEY);
        await get().loadReportsList();

        set({ ...initialAppState, isBusy: true, csvData: { fileName: file.name, data: [] } });
        
        try {
            get().addProgress('Parsing CSV file...');
            const parsedData = await processCsv(file);
            get().addProgress(`Parsed ${parsedData.data.length} rows.`);

            set({ initialDataSample: parsedData.data.slice(0, 20) });
            
            let dataForAnalysis = parsedData;
            let profiles: ColumnProfile[];
            let prepPlan: DataPreparationPlan | null = null;

            if (get().isApiKeySet) {
                await vectorStore.init(get().addProgress);
                get().addProgress('AI is analyzing data for cleaning and reshaping...');
                const initialProfiles = profileData(dataForAnalysis.data);
                prepPlan = await generateDataPreparationPlan(initialProfiles, dataForAnalysis.data.slice(0, 20), get().settings);
                
                if (prepPlan && prepPlan.jsFunctionBody) {
                    get().addProgress(`AI Plan: ${prepPlan.explanation}`);
                    get().addProgress('Executing AI data transformation...');
                    dataForAnalysis.data = executeJavaScriptDataTransform(dataForAnalysis.data, prepPlan.jsFunctionBody);
                    get().addProgress(`Transformation complete.`);
                } else {
                     get().addProgress('AI found no necessary data transformations.');
                }
                profiles = prepPlan.outputColumns;
                
                if (dataForAnalysis.data.length === 0) throw new Error('Dataset empty after transformation.');
                
                 set({ 
                    csvData: dataForAnalysis, 
                    columnProfiles: profiles,
                    dataPreparationPlan: prepPlan,
                    currentView: 'analysis_dashboard'
                });
                await get().handleInitialAnalysis(dataForAnalysis);
            } else {
                 get().addProgress(`API Key not set. Please add it in the settings.`, 'error');
                 get().setIsSettingsModalOpen(true);
                 profiles = profileData(dataForAnalysis.data);
                 set({ csvData: dataForAnalysis, columnProfiles: profiles, isBusy: false, currentView: 'analysis_dashboard' });
            }
        } catch (error) {
            console.error('File processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`File Processing Error: ${errorMessage}`, 'error');
            set({ isBusy: false, currentView: 'file_upload' });
        }
    },

    regenerateAnalyses: async (newData) => {
        // Implementation moved from useApp hook
        get().addProgress('Data has changed. Regenerating all analysis cards...');
        set({ isBusy: true, analysisCards: [], finalSummary: null });
        
        try {
            const existingPlans = get().analysisCards.map(card => card.plan);
            if (existingPlans.length > 0) {
                const newCards = await get().runAnalysisPipeline(existingPlans, newData, true);
                if (newCards.length > 0) {
                    const newFinalSummary = await generateFinalSummary(newCards, get().settings);
                    set({ finalSummary: newFinalSummary });
                    get().addProgress('All analysis cards have been updated.');
                }
            }
        } catch (error) {
             console.error("Error regenerating analyses:", error);
             const errorMessage = error instanceof Error ? error.message : String(error);
             get().addProgress(`Error updating analyses: ${errorMessage}`, 'error');
        } finally {
             set({ isBusy: false });
        }
    },
    
    executeDomAction: (action) => {
        // Implementation moved from useApp hook
        get().addProgress(`AI is performing action: ${action.toolName}...`);
        
        set(prev => {
            const newCards = [...prev.analysisCards];
            let cardUpdated = false;

            switch(action.toolName) {
                case 'highlightCard': {
                    const cardId = action.args.cardId;
                    const element = document.getElementById(cardId);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
                        setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500'), 2500);
                    }
                    break;
                }
                case 'changeCardChartType': {
                    const { cardId, newType } = action.args;
                    const cardIndex = newCards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        newCards[cardIndex].displayChartType = newType as ChartType;
                        cardUpdated = true;
                    }
                    break;
                }
                case 'showCardData': {
                     const { cardId, visible } = action.args;
                     const cardIndex = newCards.findIndex(c => c.id === cardId);
                     if (cardIndex > -1) {
                         newCards[cardIndex].isDataVisible = visible;
                         cardUpdated = true;
                     }
                     break;
                }
                 case 'filterCard': {
                    const { cardId, column, values } = action.args;
                    const cardIndex = newCards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        newCards[cardIndex].filter = values.length > 0 ? { column, values } : undefined;
                        cardUpdated = true;
                    }
                    break;
                }
            }
            if (cardUpdated) return { analysisCards: newCards };
            return {};
        });
    },

    handleChatMessage: async (message) => {
        if (!get().isApiKeySet) {
            get().addProgress('API Key not set.', 'error');
            get().setIsSettingsModalOpen(true);
            return;
        }

        const newChatMessage: ChatMessage = { sender: 'user', text: message, timestamp: new Date(), type: 'user_message' };
        set(prev => ({ isBusy: true, chatHistory: [...prev.chatHistory, newChatMessage], pendingClarification: null }));

        try {
            const cardContext: CardContext[] = get().analysisCards.map(c => ({
                id: c.id, title: c.plan.title, aggregatedDataSample: c.aggregatedData.slice(0, 100),
            }));
            const response = await generateChatResponse(
                get().columnProfiles, 
                get().chatHistory, 
                message, 
                cardContext, 
                get().settings,
                get().aiCoreAnalysisSummary, 
                get().currentView,
                (get().csvData?.data || []).slice(0, 20), 
                [], 
                get().dataPreparationPlan
            );
            
            for (const action of response.actions) {
                if (action.thought) get().addProgress(`AI Thought: ${action.thought}`);
                switch (action.responseType) {
                    case 'text_response':
                        if (action.text) {
                            const aiMessage: ChatMessage = { sender: 'ai', text: action.text, timestamp: new Date(), type: 'ai_message', cardId: action.cardId };
                            set(prev => ({ chatHistory: [...prev.chatHistory, aiMessage] }));
                        }
                        break;
                    case 'plan_creation':
                        if (action.plan && get().csvData) {
                            await get().runAnalysisPipeline([action.plan], get().csvData!, true);
                        }
                        break;
                    case 'dom_action':
                        if (action.domAction) get().executeDomAction(action.domAction);
                        break;
                    case 'execute_js_code':
                        if (action.code?.jsFunctionBody && get().csvData) {
                            const newDataArray = executeJavaScriptDataTransform(get().csvData!.data, action.code!.jsFunctionBody);
                            const newData: CsvData = { ...get().csvData!, data: newDataArray };
                            set({ csvData: newData, columnProfiles: profileData(newData.data) });
                            await get().regenerateAnalyses(newData);
                        }
                        break;
                    case 'filter_spreadsheet':
                        if (action.args?.query) {
                            get().addProgress(`AI is filtering the data explorer based on your request.`);
                            await get().handleNaturalLanguageQuery(action.args.query);
                            set({ isSpreadsheetVisible: true });
                            setTimeout(() => {
                                document.getElementById('raw-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 100);
                        }
                        break;
                    case 'clarification_request':
                        if (action.clarification) {
                            const clarificationMessage: ChatMessage = {
                                sender: 'ai',
                                text: action.clarification.question,
                                timestamp: new Date(),
                                type: 'ai_clarification',
                                clarificationRequest: action.clarification,
                            };
                            set(prev => ({
                                pendingClarification: action.clarification,
                                chatHistory: [...prev.chatHistory, clarificationMessage]
                            }));
                            set({ isBusy: false });
                            return; 
                        }
                        break;
                }
            }
        } catch(error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`Error: ${errorMessage}`, 'error');
            const aiMessage: ChatMessage = { sender: 'ai', text: `Sorry, an error occurred: ${errorMessage}`, timestamp: new Date(), type: 'ai_message', isError: true };
            set(prev => ({ chatHistory: [...prev.chatHistory, aiMessage] }));
        } finally {
            if (get().pendingClarification === null) {
                set({ isBusy: false });
            }
        }
    },

    handleClarificationResponse: async (userChoice) => {
        const { pendingClarification, csvData } = get();
        if (!pendingClarification || !csvData) return;

        console.log('[DEBUG] AI Clarification Pending Plan:', JSON.stringify(pendingClarification, null, 2));
    
        const userResponseMessage: ChatMessage = {
            sender: 'user',
            text: `Selected: ${userChoice.label}`,
            timestamp: new Date(),
            type: 'user_message',
        };
        set(prev => ({
            isBusy: true,
            chatHistory: [...prev.chatHistory, userResponseMessage],
            pendingClarification: null, 
        }));
    
        try {
            const { pendingPlan, targetProperty } = pendingClarification;
            
            const completedPlan = {
                ...pendingPlan,
                [targetProperty]: userChoice.value,
            } as AnalysisPlan;

            console.log('[DEBUG] Plan after user clarification:', JSON.stringify(completedPlan, null, 2));
            
            if (!completedPlan.title) completedPlan.title = `Analysis of ${userChoice.label}`;
            if (!completedPlan.description) completedPlan.description = `A chart showing an analysis of ${userChoice.label}.`;
    
            if (completedPlan.chartType !== 'scatter' && (!completedPlan.chartType || !completedPlan.groupByColumn || !completedPlan.aggregation)) {
                 const missingFields = ['chartType', 'groupByColumn', 'aggregation'].filter(f => !(completedPlan as any)[f]);
                 throw new Error(`The clarified plan is still missing required fields like ${missingFields.join(', ')}.`);
            }
    
            const planMessage: ChatMessage = { sender: 'ai', text: `Okay, creating a chart for "${completedPlan.title}".`, timestamp: new Date(), type: 'ai_plan_start' };
            set(prev => ({ chatHistory: [...prev.chatHistory, planMessage] }));
    
            await get().runAnalysisPipeline([completedPlan], csvData, true);
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`Error processing clarification: ${errorMessage}`, 'error');
            const aiMessage: ChatMessage = { sender: 'ai', text: `Sorry, an error occurred while creating the chart: ${errorMessage}`, timestamp: new Date(), type: 'ai_message', isError: true };
            set(prev => ({ chatHistory: [...prev.chatHistory, aiMessage] }));
        } finally {
            set({ isBusy: false });
        }
    },

    handleNaturalLanguageQuery: async (query) => {
        if (!get().isApiKeySet || !get().csvData) {
            get().addProgress('Cannot perform AI query: API Key is not set or no data is loaded.', 'error');
            return;
        }

        set({ isAiFiltering: true, spreadsheetFilterFunction: null, aiFilterExplanation: null });
        get().addProgress(`AI is processing your data query: "${query}"...`);

        try {
            const response: AiFilterResponse = await generateFilterFunction(
                query,
                get().columnProfiles,
                get().csvData!.data.slice(0, 5),
                get().settings
            );

            set({
                spreadsheetFilterFunction: response.jsFunctionBody,
                aiFilterExplanation: response.explanation,
            });
            get().addProgress(`AI filter applied: ${response.explanation}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`AI query failed: ${errorMessage}`, 'error');
        } finally {
            set({ isAiFiltering: false });
        }
    },

    clearAiFilter: () => {
        set({ spreadsheetFilterFunction: null, aiFilterExplanation: null });
        get().addProgress('AI data filter cleared.');
    },
    
    handleChartTypeChange: (cardId, newType) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, displayChartType: newType} : c)
        }));
    },
    
    handleToggleDataVisibility: (cardId) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, isDataVisible: !c.isDataVisible} : c)
        }));
    },
    
    handleTopNChange: (cardId, topN) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, topN: topN} : c)
        }));
    },
    
    handleHideOthersChange: (cardId, hide) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, hideOthers: hide} : c)
        }));
    },
    
    handleToggleLegendLabel: (cardId, label) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => {
                if (c.id === cardId) {
                    const currentHidden = c.hiddenLabels || [];
                    const newHidden = currentHidden.includes(label) ? currentHidden.filter(l => l !== label) : [...currentHidden, label];
                    return { ...c, hiddenLabels: newHidden };
                }
                return c;
            })
        }));
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
    
    handleShowCardFromChat: (cardId) => {
        const element = document.getElementById(cardId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
            setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500'), 2500);
        }
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
        set(initialAppState);
        await get().loadReportsList();
    },

    // Simple setters
    setIsAsideVisible: (isVisible) => set({ isAsideVisible: isVisible }),
    setAsideWidth: (width) => set({ asideWidth: width }),
    setIsSpreadsheetVisible: (isVisible) => set({ isSpreadsheetVisible: isVisible }),
    setIsDataPrepDebugVisible: (isVisible) => set({ isDataPrepDebugVisible: isVisible }),
    setIsSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
    setIsHistoryPanelOpen: (isOpen) => set({ isHistoryPanelOpen: isOpen }),
    setIsMemoryPanelOpen: (isOpen) => set({ isMemoryPanelOpen: isOpen }),
    setIsResizing: (isResizing) => set({ isResizing: isResizing }),
}));

// Auto-save current session to IndexedDB periodically
setInterval(async () => {
    const state = useAppStore.getState();
    if (state.csvData && state.csvData.data.length > 0) {
        // Fix: Only include serializable state properties in the report.
        // This prevents a "DataCloneError" by excluding functions (actions) from the saved object.
        const stateToSave: AppState = {
            currentView: state.currentView,
            isBusy: state.isBusy,
            progressMessages: state.progressMessages,
            csvData: state.csvData,
            columnProfiles: state.columnProfiles,
            analysisCards: state.analysisCards,
            chatHistory: state.chatHistory,
            finalSummary: state.finalSummary,
            aiCoreAnalysisSummary: state.aiCoreAnalysisSummary,
            dataPreparationPlan: state.dataPreparationPlan,
            initialDataSample: state.initialDataSample,
            vectorStoreDocuments: vectorStore.getDocuments(),
            spreadsheetFilterFunction: state.spreadsheetFilterFunction,
            aiFilterExplanation: state.aiFilterExplanation,
            pendingClarification: state.pendingClarification,
        };

        const currentReport: Report = {
            id: CURRENT_SESSION_KEY,
            filename: state.csvData.fileName || 'Current Session',
            createdAt: (await getReport(CURRENT_SESSION_KEY))?.createdAt || new Date(),
            updatedAt: new Date(),
            appState: stateToSave,
        };
        await saveReport(currentReport);
    }
}, 2000);