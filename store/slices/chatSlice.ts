import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { DomAction, ChartType, ChatMessage, AnalysisPlan, ClarificationOption } from '../../types';
import { generateChatResponse, generateFilterFunction } from '../../services/aiService';
import { vectorStore } from '../../services/vectorStore';
import { validateAction } from '../../services/ai/toolValidator';
import { profileData, executeJavaScriptDataTransform } from '../../utils/dataProcessor';


export interface IChatSlice {
    isAiFiltering: boolean;
    executeDomAction: (action: DomAction) => void;
    handleChatMessage: (message: string) => Promise<void>;
    handleClarificationResponse: (userChoice: ClarificationOption) => Promise<void>;
    handleNaturalLanguageQuery: (query: string) => Promise<void>;
    clearAiFilter: () => void;
}

export const createChatSlice: StateCreator<AppStore, [], [], IChatSlice> = (set, get) => ({
    isAiFiltering: false,
    executeDomAction: (action) => {
        get().addProgress(`AI is performing action: ${action.toolName}...`);
        set(prev => {
            const cardIndex = prev.analysisCards.findIndex(c => c.id === action.args.cardId);
            if (cardIndex === -1) return {};
            const newCards = [...prev.analysisCards];
            switch(action.toolName) {
                case 'highlightCard': {
                    const el = document.getElementById(action.args.cardId);
                    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-4', 'ring-blue-500'); setTimeout(() => el.classList.remove('ring-4', 'ring-blue-500'), 2500); }
                    break;
                }
                case 'changeCardChartType': newCards[cardIndex].displayChartType = action.args.newType as ChartType; break;
                case 'showCardData': newCards[cardIndex].isDataVisible = action.args.visible; break;
                case 'filterCard': newCards[cardIndex].filter = action.args.values.length > 0 ? { column: action.args.column, values: action.args.values } : undefined; break;
            }
            return { analysisCards: newCards };
        });
    },
    handleChatMessage: async (message) => {
        if (!get().isApiKeySet) { get().addProgress('API Key not set.', 'error'); get().setIsSettingsModalOpen(true); return; }
        set(prev => ({ isBusy: true, chatHistory: [...prev.chatHistory, { sender: 'user', text: message, timestamp: new Date(), type: 'user_message' }], pendingClarification: null }));
        let selfCorrectionFeedback: string | null = null;
        for (let i = 0; i <= 2; i++) {
            try {
                const cardContext = get().analysisCards.map(c => ({ id: c.id, title: c.plan.title, aggregatedDataSample: c.aggregatedData.slice(0, 100) }));
                const longTermMemory = (await vectorStore.search(message, 3)).map(m => m.text);
                const response = await generateChatResponse(get().columnProfiles, get().chatHistory, message, cardContext, get().settings, get().aiCoreAnalysisSummary, (get().csvData?.data || []).slice(0, 20), longTermMemory, get().dataPreparationPlan, selfCorrectionFeedback);
                const validationErrors = response.actions.map(a => validateAction(a, { cardIds: get().analysisCards.map(c => c.id) })).filter(v => !v.isValid).map(v => v.errors);
                if (validationErrors.length > 0) {
                    if (i === 2) throw new Error("AI failed to provide a valid action after multiple attempts.");
                    selfCorrectionFeedback = `Your last response failed. Fix these errors:\n${validationErrors.join('\n')}`;
                    get().addProgress(`AI response invalid. Retrying (Attempt ${i + 2}/3)...`);
                    continue;
                }
                for (const action of response.actions) {
                    if (action.thought) get().addProgress(`AI Thought: ${action.thought}`);
                    switch (action.responseType) {
                        case 'text_response': if (action.text) set(prev => ({ chatHistory: [...prev.chatHistory, { sender: 'ai', text: action.text!, timestamp: new Date(), type: 'ai_message', cardId: action.cardId }] })); break;
                        case 'plan_creation': if (action.plan && get().csvData) { set(prev => ({ chatHistory: [...prev.chatHistory, { sender: 'ai', text: `Okay, creating a chart for "${action.plan!.title}".`, timestamp: new Date(), type: 'ai_plan_start' }] })); const cards = await get().runAnalysisPipeline([action.plan], get().csvData!, true); if (cards.length > 0) set(prev => ({ chatHistory: [...prev.chatHistory, ...cards.map((c): ChatMessage => ({ sender: 'ai', text: c.summary.split('---')[0]?.trim() || 'New chart created.', timestamp: new Date(), type: 'ai_message', cardId: c.id }))] })); } break;
                        case 'dom_action': if (action.domAction) get().executeDomAction(action.domAction); break;
                        case 'execute_js_code': if (action.code?.jsFunctionBody && get().csvData) { const data = executeJavaScriptDataTransform(get().csvData!.data, action.code!.jsFunctionBody); const newData = { ...get().csvData!, data }; set({ csvData: newData, columnProfiles: profileData(data) }); await get().regenerateAnalyses(newData); } break;
                        case 'filter_spreadsheet': if (action.args?.query) { get().addProgress(`AI is filtering data explorer.`); await get().handleNaturalLanguageQuery(action.args.query); set({ isSpreadsheetVisible: true }); setTimeout(() => document.getElementById('raw-data-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100); } break;
                        case 'clarification_request': if (action.clarification) { set(prev => ({ pendingClarification: action.clarification, chatHistory: [...prev.chatHistory, { sender: 'ai', text: action.clarification!.question, timestamp: new Date(), type: 'ai_clarification', clarificationRequest: action.clarification }] })); set({ isBusy: false }); return; } break;
                    }
                }
                set({ isBusy: false }); return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                get().addProgress(`Error: ${errorMessage}`, 'error');
                set(prev => ({ chatHistory: [...prev.chatHistory, { sender: 'ai', text: `Sorry, I encountered an issue: ${errorMessage}`, timestamp: new Date(), type: 'ai_message', isError: true }] }));
                break;
            }
        }
        set({ isBusy: false });
    },
    handleClarificationResponse: async (userChoice) => {
        const { pendingClarification, csvData } = get();
        if (!pendingClarification || !csvData) return;
        set(prev => ({ isBusy: true, chatHistory: [...prev.chatHistory, { sender: 'user', text: `Selected: ${userChoice.label}`, timestamp: new Date(), type: 'user_message' }], pendingClarification: null, }));
        try {
            let completedPlan: Partial<AnalysisPlan>;
            if (pendingClarification.targetProperty === 'merge') {
                const planFragment = JSON.parse(userChoice.value);
                completedPlan = { ...pendingClarification.pendingPlan, ...planFragment };
            } else {
                completedPlan = { ...pendingClarification.pendingPlan, [pendingClarification.targetProperty]: userChoice.value };
            }
            completedPlan.title = userChoice.label; completedPlan.description = `Analysis of ${userChoice.label}.`;
            if (!completedPlan.aggregation) completedPlan.aggregation = completedPlan.valueColumn ? 'sum' : 'count';
            if (!completedPlan.chartType) completedPlan.chartType = 'bar';
            set(prev => ({ chatHistory: [...prev.chatHistory, { sender: 'ai', text: `Okay, creating a chart for "${completedPlan.title}".`, timestamp: new Date(), type: 'ai_plan_start' }] }));
            const createdCards = await get().runAnalysisPipeline([completedPlan as AnalysisPlan], csvData, true);
            if (createdCards.length > 0) {
                set(prev => ({ chatHistory: [...prev.chatHistory, ...createdCards.map((c): ChatMessage => ({ sender: 'ai', text: c.summary.split('---')[0]?.trim() || 'New chart created.', timestamp: new Date(), type: 'ai_message', cardId: c.id }))] }));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            get().addProgress(`Error processing clarification: ${errorMessage}`, 'error');
            set(prev => ({ chatHistory: [...prev.chatHistory, { sender: 'ai', text: `Sorry, an error occurred: ${errorMessage}`, timestamp: new Date(), type: 'ai_message', isError: true }] }));
        } finally {
            set({ isBusy: false });
        }
    },
    handleNaturalLanguageQuery: async (query) => {
        if (!get().isApiKeySet || !get().csvData) return get().addProgress('Cannot perform AI query: API Key/data missing.', 'error');
        set({ isAiFiltering: true, spreadsheetFilterFunction: null, aiFilterExplanation: null });
        get().addProgress(`AI is processing your data query: "${query}"...`);
        try {
            const response = await generateFilterFunction(query, get().columnProfiles, get().csvData!.data.slice(0, 5), get().settings);
            set({ spreadsheetFilterFunction: response.jsFunctionBody, aiFilterExplanation: response.explanation });
            get().addProgress(`AI filter applied: ${response.explanation}`);
        } catch (error) {
            get().addProgress(`AI query failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            set({ isAiFiltering: false });
        }
    },
    clearAiFilter: () => {
        set({ spreadsheetFilterFunction: null, aiFilterExplanation: null });
        get().addProgress('AI data filter cleared.');
    },
});
