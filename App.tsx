
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { SettingsModal } from './components/SettingsModal';
import { HistoryPanel } from './components/HistoryPanel';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, AppState, ColumnProfile, AiChatResponse, ChartType, DomAction, Settings, Report, ReportListItem } from './types';
import { processCsv, profileData, executePlan, executeJavaScriptDataTransform } from './utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary, generateChatResponse, generateDataPreparationPlan } from './services/geminiService';
import { getReportsList, saveReport, getReport, deleteReport, getSettings, saveSettings } from './storageService';

const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;

const ShowAssistantIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);

const HistoryIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>({
        isBusy: false,
        useCloudAI: true,
        progressMessages: [],
        csvData: null,
        columnProfiles: [],
        analysisCards: [],
        chatHistory: [],
        finalSummary: null,
    });
    
    const [isAsideVisible, setIsAsideVisible] = useState(true);
    const [asideWidth, setAsideWidth] = useState(window.innerWidth / 4 > MIN_ASIDE_WIDTH ? window.innerWidth / 4 : MIN_ASIDE_WIDTH);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(() => getSettings());
    const [reportsList, setReportsList] = useState<ReportListItem[]>([]);
    const [currentReportId, setCurrentReportId] = useState<string | null>(null);

    const isResizingRef = useRef(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        loadReportsList();
        return () => { isMounted.current = false; };
    }, []);

    useEffect(() => {
        const saveCurrentState = async () => {
            if (currentReportId && isMounted.current) {
                const currentReport = await getReport(currentReportId);
                if (currentReport) {
                    const updatedReport = { ...currentReport, appState: appState, updatedAt: new Date() };
                    await saveReport(updatedReport);
                }
            }
        };
        const debounceSave = setTimeout(saveCurrentState, 500); // Debounce saving
        return () => clearTimeout(debounceSave);
    }, [appState, currentReportId]);

    const loadReportsList = async () => {
        const list = await getReportsList();
        if (isMounted.current) {
            setReportsList(list);
        }
    };
    
    const handleSaveSettings = (newSettings: Settings) => {
        saveSettings(newSettings);
        setSettings(newSettings);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizingRef.current) return;
        let newWidth = window.innerWidth - e.clientX;
        if (newWidth < MIN_ASIDE_WIDTH) newWidth = MIN_ASIDE_WIDTH;
        if (newWidth > MAX_ASIDE_WIDTH) newWidth = MAX_ASIDE_WIDTH;
        setAsideWidth(newWidth);
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';

    }, [handleMouseMove]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    }, [handleMouseMove, handleMouseUp]);


    const addProgress = useCallback((message: string, type: 'system' | 'error' = 'system') => {
        if (!isMounted.current) return;
        const newMessage: ProgressMessage = { text: message, type, timestamp: new Date() };
        setAppState(prev => ({ ...prev, progressMessages: [...prev.progressMessages, newMessage] }));
    }, []);

    const runAnalysisPipeline = useCallback(async (plans: AnalysisPlan[], data: CsvData, isChatRequest: boolean = false) => {
        const newCards: AnalysisCardData[] = [];
        for (const plan of plans) {
            try {
                addProgress(`Executing plan: ${plan.title}...`);
                const aggregatedData = executePlan(data, plan);
                if (aggregatedData.length === 0) {
                    addProgress(`Skipping "${plan.title}" due to empty result.`, 'error');
                    continue;
                }
                
                let summary = 'AI summary disabled or failed.';
                if (appState.useCloudAI) {
                    addProgress(`AI is summarizing: ${plan.title}...`);
                    summary = await generateSummary(plan.title, aggregatedData, settings);
                }

                const newCard: AnalysisCardData = {
                    id: `card-${Date.now()}-${Math.random()}`,
                    plan: plan,
                    aggregatedData: aggregatedData,
                    summary: summary,
                    displayChartType: plan.chartType,
                    isDataVisible: false,
                    topN: null
                };
                newCards.push(newCard);
                if (isMounted.current) {
                    setAppState(prev => ({ ...prev, analysisCards: [...prev.analysisCards, newCard] }));
                }
                addProgress(`Saved as View #${newCard.id.slice(-6)}`);
            } catch (error) {
                console.error('Error executing plan:', plan.title, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                addProgress(`Error executing plan "${plan.title}": ${errorMessage}`, 'error');
            }
        }

        if (newCards.length > 0 && !isChatRequest && appState.useCloudAI) {
            addProgress('AI is generating final summary...');
            const finalSummaryText = await generateFinalSummary(newCards, settings);
            if(isMounted.current) {
                setAppState(prev => ({...prev, finalSummary: finalSummaryText}));
            }
            addProgress('Overall summary generated.');
        }

        return newCards;
    }, [addProgress, appState.useCloudAI, settings]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!isMounted.current) return;
        const initialState: AppState = {
            isBusy: true,
            useCloudAI: appState.useCloudAI,
            progressMessages: [],
            csvData: null,
            columnProfiles: [],
            analysisCards: [],
            chatHistory: [],
            finalSummary: null,
        };
        setAppState(initialState);
        
        const newReport: Report = {
            id: `report-${Date.now()}`,
            filename: file.name,
            createdAt: new Date(),
            updatedAt: new Date(),
            appState: initialState,
        };
        setCurrentReportId(newReport.id);
        
        try {
            addProgress('Parsing CSV file...');
            let rawData = await processCsv(file);
            if (!isMounted.current) return;
            addProgress(`Parsed ${rawData.length} rows.`);

            let dataForAnalysis = rawData;
            let profiles: ColumnProfile[];

            if (appState.useCloudAI && settings.apiKey) {
                addProgress('AI is analyzing data for cleaning and reshaping...');
                const initialProfiles = profileData(rawData);
                const prepPlan = await generateDataPreparationPlan(initialProfiles, rawData.slice(0, 20), settings);
                
                if (prepPlan.jsFunctionBody) {
                    addProgress(`AI Plan: ${prepPlan.explanation}`);
                    addProgress('Executing AI data transformation...');
                    const originalRowCount = dataForAnalysis.length;
                    dataForAnalysis = executeJavaScriptDataTransform(dataForAnalysis, prepPlan.jsFunctionBody);
                    const newRowCount = dataForAnalysis.length;
                    addProgress(`Transformation complete. Row count changed from ${originalRowCount} to ${newRowCount}.`);
                } else {
                     addProgress('AI found no necessary data transformations.');
                }
                
                if (dataForAnalysis.length === 0) {
                    addProgress('The dataset is empty after AI transformation. Halting analysis.', 'error');
                    throw new Error('The dataset became empty after AI-driven cleaning or reshaping.');
                }

                addProgress('Profiling prepared data...');
                profiles = profileData(dataForAnalysis);
                addProgress('Profiling complete.');


                if (!isMounted.current) return;
                setAppState(prev => ({ ...prev, csvData: dataForAnalysis, columnProfiles: profiles }));

                addProgress('AI is generating analysis plans...');
                const plans = await generateAnalysisPlans(profiles, dataForAnalysis.slice(0, 5), settings);
                addProgress(`AI proposed ${plans.length} plans.`);
                await runAnalysisPipeline(plans, dataForAnalysis, false);

            } else {
                 profiles = profileData(dataForAnalysis);
                 addProgress('Profiling data columns...');
                 addProgress('Data profiling complete.');
                 
                 if (appState.useCloudAI && !settings.apiKey) {
                     addProgress('API Key not set. Please add your Gemini API Key in the settings.', 'error');
                     setIsSettingsModalOpen(true);
                 } else {
                    addProgress('Cloud AI is disabled. Manual analysis via chat is available.');
                 }
                 setAppState(prev => ({ ...prev, csvData: dataForAnalysis, columnProfiles: profiles }));
            }

        } catch (error) {
            console.error('File processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error: ${errorMessage}`, 'error');
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
                addProgress('Analysis complete. Ready for chat.');
                await loadReportsList(); // Refresh history
            }
        }
    }, [addProgress, runAnalysisPipeline, appState.useCloudAI, settings]);

    const executeDomAction = (action: DomAction) => {
        addProgress(`AI is performing action: ${action.toolName}...`);
        
        setAppState(prev => {
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
                    } else {
                        addProgress(`Could not find card ID ${cardId} to highlight.`, 'error');
                    }
                    break;
                }
                case 'changeCardChartType': {
                    const { cardId, newType } = action.args;
                    const cardIndex = newCards.findIndex(c => c.id === cardId);
                    if (cardIndex > -1) {
                        newCards[cardIndex].displayChartType = newType as ChartType;
                        cardUpdated = true;
                    } else {
                         addProgress(`Could not find card ID ${cardId} to change chart type.`, 'error');
                    }
                    break;
                }
                case 'showCardData': {
                     const { cardId, visible } = action.args;
                     const cardIndex = newCards.findIndex(c => c.id === cardId);
                     if (cardIndex > -1) {
                         newCards[cardIndex].isDataVisible = visible;
                         cardUpdated = true;
                     } else {
                         addProgress(`Could not find card ID ${cardId} to show data for.`, 'error');
                     }
                     break;
                }
                default:
                     addProgress(`Unknown DOM action: ${action.toolName}`, 'error');
            }

            if (cardUpdated) {
                return { ...prev, analysisCards: newCards };
            }
            return prev;
        });
    }

     const handleChatMessage = useCallback(async (message: string) => {
        if (!appState.csvData || !appState.columnProfiles.length) {
            addProgress("Please upload a CSV file first.", "error");
            return;
        }
        if (!appState.useCloudAI) {
            addProgress('Cloud AI is disabled. Cannot process chat requests.', 'error');
            return;
        }
        if (!settings.apiKey) {
            addProgress('API Key not set. Please add your Gemini API Key in the settings.', 'error');
            setIsSettingsModalOpen(true);
            return;
        }

        if (!isMounted.current) return;
        const newChatMessage: ChatMessage = { sender: 'user', text: message, timestamp: new Date() };
        setAppState(prev => ({ ...prev, isBusy: true, chatHistory: [...prev.chatHistory, newChatMessage] }));

        try {
            addProgress('AI is thinking...');
            const response: AiChatResponse = await generateChatResponse(
                appState.columnProfiles,
                appState.csvData.slice(0, 5),
                appState.chatHistory,
                message,
                appState.analysisCards.map(c => ({id: c.id, title: c.plan.title})),
                settings
            );

            const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
            const actions = response.actions;

            for (const action of actions) {
                switch (action.responseType) {
                    case 'text_response':
                        if (action.text && isMounted.current) {
                            const aiMessage: ChatMessage = { sender: 'ai', text: action.text, timestamp: new Date() };
                            setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                        }
                        break;
                    case 'plan_creation':
                        if (action.plan) {
                            await runAnalysisPipeline([action.plan], appState.csvData, true);
                        }
                        break;
                    case 'dom_action':
                        if (action.domAction) {
                            executeDomAction(action.domAction);
                        }
                        break;
                    default:
                        console.warn('Unknown AI action type:', (action as any).responseType);
                }

                if (actions.length > 1) {
                    await sleep(750); // Delay for a more natural step-by-step feel
                }
            }

        } catch(error) {
            console.error('Chat processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error processing chat: ${errorMessage}`, 'error');
            if (isMounted.current) {
                const aiMessage: ChatMessage = { sender: 'ai', text: `Sorry, I had trouble with that request. Could you try rephrasing it?`, timestamp: new Date() };
                setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
            }
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
            }
        }
    }, [appState.csvData, appState.columnProfiles, appState.useCloudAI, appState.chatHistory, appState.analysisCards, addProgress, runAnalysisPipeline, settings]);
    
    const toggleCloudAI = () => {
        setAppState(prev => ({...prev, useCloudAI: !prev.useCloudAI}));
    }
    
    const handleChartTypeChange = (cardId: string, newType: ChartType) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, displayChartType: newType} : c)
        }))
    }
    
    const handleToggleDataVisibility = (cardId: string) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, isDataVisible: !c.isDataVisible} : c)
        }))
    }

    const handleTopNChange = (cardId: string, topN: number | null) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, topN: topN} : c)
        }));
    };

    const handleLoadReport = async (id: string) => {
        const report = await getReport(id);
        if (report && isMounted.current) {
            setAppState(report.appState);
            setCurrentReportId(id);
            setIsHistoryPanelOpen(false);
        }
    };

    const handleDeleteReport = async (id: string) => {
        await deleteReport(id);
        if (currentReportId === id) {
            setCurrentReportId(null);
            setAppState({
                isBusy: false, useCloudAI: appState.useCloudAI, progressMessages: [], csvData: null, 
                columnProfiles: [], analysisCards: [], chatHistory: [], finalSummary: null
            });
        }
        await loadReportsList();
    };


    const { isBusy, progressMessages, csvData, analysisCards, chatHistory, finalSummary, useCloudAI } = appState;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-gray-900 text-gray-200 font-sans">
            <SettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                onSave={handleSaveSettings}
                currentSettings={settings}
            />
            <HistoryPanel
                isOpen={isHistoryPanelOpen}
                onClose={() => setIsHistoryPanelOpen(false)}
                reports={reportsList}
                onLoadReport={handleLoadReport}
                onDeleteReport={handleDeleteReport}
            />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <header className="mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-white">🧠 CSV Data Analysis AI Assistant</h1>
                        <p className="text-gray-400 mt-1">Upload → Auto-Analyze → Visualize → Summarize → Chat</p>
                    </div>
                    <button 
                        onClick={() => setIsHistoryPanelOpen(true)}
                        className="flex items-center space-x-2 px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors"
                        title="View analysis history"
                    >
                       <HistoryIcon />
                       <span className="hidden sm:inline">History</span>
                    </button>
                </header>
                {csvData ? (
                    <AnalysisPanel 
                        cards={analysisCards} 
                        finalSummary={finalSummary}
                        onChartTypeChange={handleChartTypeChange}
                        onToggleDataVisibility={handleToggleDataVisibility}
                        onTopNChange={handleTopNChange}
                    />
                ) : (
                    <FileUpload 
                        onFileUpload={handleFileUpload} 
                        isBusy={isBusy}
                        useCloudAI={useCloudAI}
                        isApiKeySet={!!settings.apiKey}
                    />
                )}
            </main>
            
            {isAsideVisible ? (
                <>
                    <div onMouseDown={handleMouseDown} className="hidden md:block w-1.5 cursor-col-resize bg-gray-700 hover:bg-brand-secondary transition-colors duration-200"/>
                    <aside className="w-full md:w-auto bg-gray-800 flex flex-col h-full border-l border-gray-700" style={{ width: asideWidth }}>
                        <ChatPanel 
                            progressMessages={progressMessages} 
                            chatHistory={chatHistory}
                            isBusy={isBusy} 
                            onSendMessage={handleChatMessage} 
                            useCloudAI={useCloudAI}
                            toggleCloudAI={toggleCloudAI}
                            onToggleVisibility={() => setIsAsideVisible(false)}
                            onOpenSettings={() => setIsSettingsModalOpen(true)}
                        />
                    </aside>
                </>
            ) : (
                 <div className="fixed top-4 right-4 z-20">
                    <button
                        onClick={() => setIsAsideVisible(true)}
                        className="p-3 bg-brand-secondary rounded-full text-white shadow-lg hover:bg-brand-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-white transition-all transform hover:scale-110"
                        aria-label="Show Assistant Panel"
                        title="Show Assistant Panel"
                    >
                        <ShowAssistantIcon />
                    </button>
                </div>
            )}
        </div>
    );
};

export default App;