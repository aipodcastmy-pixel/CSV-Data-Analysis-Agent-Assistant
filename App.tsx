
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { SettingsModal } from './components/SettingsModal';
import { HistoryPanel } from './components/HistoryPanel';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, AppState, ColumnProfile, AiAction, CardContext, ChartType, DomAction, Settings, Report, ReportListItem } from './types';
import { processCsv, profileData, executePlan, executeJavaScriptDataTransform } from './utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary, generateChatResponse, generateDataPreparationPlan } from './services/geminiService';
import { getReportsList, saveReport, getReport, deleteReport, getSettings, saveSettings, CURRENT_SESSION_KEY } from './storageService';

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

    const isResizingRef = useRef(false);
    const isMounted = useRef(false);

    // Load current session or reports list on initial mount
    useEffect(() => {
        isMounted.current = true;
        const loadInitialData = async () => {
            const currentSession = await getReport(CURRENT_SESSION_KEY);
            if (isMounted.current) {
                if (currentSession) {
                    setAppState(currentSession.appState);
                }
                // Always load the history list on start
                loadReportsList();
            }
        };
        loadInitialData();
        return () => { isMounted.current = false; };
    }, []);

    // Debounced saving of the current session state
    useEffect(() => {
        if (!isMounted.current) return;
        
        const saveCurrentState = async () => {
            // Only save if there's actual data to prevent saving empty sessions
            if (appState.csvData && appState.csvData.data.length > 0) {
                 const existingReport = await getReport(CURRENT_SESSION_KEY);
                 const currentReport: Report = {
                    id: CURRENT_SESSION_KEY,
                    filename: appState.csvData.fileName || 'current_session',
                    // Preserve the original creation date on subsequent saves
                    createdAt: existingReport?.createdAt || new Date(),
                    updatedAt: new Date(),
                    appState: appState,
                };
                await saveReport(currentReport);
            }
        };
        const debounceSave = setTimeout(saveCurrentState, 1000);
        return () => clearTimeout(debounceSave);
    }, [appState]);

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
                
                addProgress(`AI is summarizing: ${plan.title}...`);
                const summary = await generateSummary(plan.title, aggregatedData, settings);

                const newCard: AnalysisCardData = {
                    id: `card-${Date.now()}-${Math.random()}`,
                    plan: plan,
                    aggregatedData: aggregatedData,
                    summary: summary,
                    displayChartType: plan.chartType,
                    isDataVisible: false,
                    topN: null,
                    hideOthers: false,
                };
                newCards.push(newCard);
                if (isMounted.current) {
                    setAppState(prev => ({ ...prev, analysisCards: isChatRequest ? [...prev.analysisCards, newCard] : newCards }));
                }
                addProgress(`Saved as View #${newCard.id.slice(-6)}`);
            } catch (error) {
                console.error('Error executing plan:', plan.title, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                addProgress(`Error executing plan "${plan.title}": ${errorMessage}`, 'error');
            }
        }

        if (newCards.length > 0 && !isChatRequest) {
            addProgress('AI is generating final summary...');
            const finalSummaryText = await generateFinalSummary(newCards, settings);
            if(isMounted.current) {
                setAppState(prev => ({...prev, finalSummary: finalSummaryText}));
            }
            addProgress('Overall summary generated.');
        }

        return newCards;
    }, [addProgress, settings]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!isMounted.current) return;

        // Archive the current session using the current state BEFORE resetting it.
        if (appState.csvData && appState.csvData.data.length > 0) {
            const archiveId = `report-${Date.now()}`;
            const existingSession = await getReport(CURRENT_SESSION_KEY);
            const sessionToArchive: Report = {
                id: archiveId,
                filename: appState.csvData.fileName,
                createdAt: existingSession?.createdAt || new Date(),
                updatedAt: new Date(),
                appState: appState,
            };
            await saveReport(sessionToArchive);
            await deleteReport(CURRENT_SESSION_KEY);
        }
        
        await loadReportsList();

        const initialState: AppState = {
            isBusy: true,
            progressMessages: [],
            csvData: { fileName: file.name, data: [] },
            columnProfiles: [],
            analysisCards: [],
            chatHistory: [],
            finalSummary: null,
        };
        setAppState(initialState);
        
        try {
            addProgress('Parsing CSV file...');
            const parsedData = await processCsv(file);
            if (!isMounted.current) return;
            addProgress(`Parsed ${parsedData.data.length} rows.`);

            let dataForAnalysis = parsedData;
            let profiles: ColumnProfile[];

            if (settings.apiKey) {
                addProgress('AI is analyzing data for cleaning and reshaping...');
                const initialProfiles = profileData(dataForAnalysis.data);
                
                const prepPlan = await generateDataPreparationPlan(initialProfiles, dataForAnalysis.data.slice(0, 20), settings);
                
                if (prepPlan && prepPlan.jsFunctionBody) {
                    addProgress(`AI Plan: ${prepPlan.explanation}`);
                    addProgress('Executing AI data transformation...');
                    const originalRowCount = dataForAnalysis.data.length;
                    dataForAnalysis.data = executeJavaScriptDataTransform(dataForAnalysis.data, prepPlan.jsFunctionBody);
                    const newRowCount = dataForAnalysis.data.length;
                    addProgress(`Transformation complete. Row count changed from ${originalRowCount} to ${newRowCount}.`);
                } else {
                     addProgress('AI found no necessary data transformations.');
                }
                
                if (dataForAnalysis.data.length === 0) {
                    addProgress('The dataset is empty after AI transformation. Halting analysis.', 'error');
                    throw new Error('The dataset became empty after AI-driven cleaning or reshaping.');
                }

                addProgress('Profiling prepared data...');
                profiles = profileData(dataForAnalysis.data);
                addProgress('Profiling complete.');

                if (!isMounted.current) return;
                setAppState(prev => ({ ...prev, csvData: dataForAnalysis, columnProfiles: profiles }));

                addProgress('AI is generating analysis plans...');
                const plans = await generateAnalysisPlans(profiles, dataForAnalysis.data.slice(0, 5), settings);
                addProgress(`AI proposed ${plans.length} plans.`);
                await runAnalysisPipeline(plans, dataForAnalysis, false);

            } else {
                 addProgress('API Key not set. Please add your Gemini API Key in the settings.', 'error');
                 setIsSettingsModalOpen(true);
                 // Still profile and show data, just without AI analysis
                 profiles = profileData(dataForAnalysis.data);
                 addProgress('Profiling data columns...');
                 addProgress('Data profiling complete.');
                 setAppState(prev => ({ ...prev, csvData: dataForAnalysis, columnProfiles: profiles }));
            }

        } catch (error) {
            console.error('File processing error:', error);
            let errorMessage = error instanceof Error ? error.message : String(error);

            // Provide a more user-friendly message for the specific data prep failure case.
            if (error instanceof Error && error.message.startsWith('AI failed to generate a valid data preparation plan')) {
                errorMessage = `The AI failed to prepare your data for analysis, even after several self-correction attempts. This can happen with very unusual or complex file formats. Please check the file or try another one. Final error: ${error.message}`;
            }
            
            addProgress(`File Processing Error: ${errorMessage}`, 'error');

        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
                addProgress('Analysis complete. Ready for chat.');
            }
        }
    }, [appState, addProgress, runAnalysisPipeline, settings]);

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
            
            const cardContext: CardContext[] = appState.analysisCards.map(c => ({
                id: c.id,
                title: c.plan.title,
                aggregatedDataSample: c.aggregatedData.slice(0, 10),
            }));

            const response = await generateChatResponse(
                appState.columnProfiles,
                appState.chatHistory,
                message,
                cardContext,
                settings
            );

            const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
            const actions = response.actions;

            for (const action of actions) {
                if (!isMounted.current) break;
                switch (action.responseType) {
                    case 'text_response':
                        if (action.text && isMounted.current) {
                            const aiMessage: ChatMessage = { sender: 'ai', text: action.text, timestamp: new Date() };
                            setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                        }
                        break;
                    case 'plan_creation':
                        if (action.plan && appState.csvData) {
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
                    await sleep(750);
                }
            }

        } catch(error) {
            console.error('Chat processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error processing chat: ${errorMessage}`, 'error');
            if (isMounted.current) {
                const aiMessage: ChatMessage = { 
                    sender: 'ai', 
                    text: `Sorry, I had trouble with that request: ${errorMessage}. Could you try rephrasing it?`, 
                    timestamp: new Date(),
                    isError: true,
                };
                setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
            }
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
            }
        }
    }, [appState, addProgress, runAnalysisPipeline, settings]);
    
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

    const handleHideOthersChange = (cardId: string, hide: boolean) => {
        setAppState(prev => ({
            ...prev,
            analysisCards: prev.analysisCards.map(c => c.id === cardId ? {...c, hideOthers: hide} : c)
        }));
    };

    const handleLoadReport = async (id: string) => {
        addProgress(`Loading report ${id}...`);
        const report = await getReport(id);
        if (report && isMounted.current) {
            setAppState(report.appState);
            setIsHistoryPanelOpen(false);
            addProgress(`Report "${report.filename}" loaded successfully.`);
        } else {
            addProgress(`Failed to load report ${id}.`, 'error');
        }
    };

    const handleDeleteReport = async (id: string) => {
        await deleteReport(id);
        await loadReportsList();
    };


    const { isBusy, progressMessages, csvData, analysisCards, chatHistory, finalSummary } = appState;

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
                        <h1 className="text-3xl font-bold text-white">🧠 CSV Data Analysis Agent</h1>
                        <p className="text-gray-400 mt-1">Upload → Auto-Analyze → Visualize → Summarize → Chat</p>
                    </div>
                     <div className="flex items-center space-x-2">
                        <button 
                            onClick={() => {loadReportsList(); setIsHistoryPanelOpen(true);}}
                            className="flex items-center space-x-2 px-3 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors"
                            title="View analysis history"
                        >
                           <HistoryIcon />
                           <span className="hidden sm:inline">History</span>
                        </button>
                    </div>
                </header>
                {csvData && csvData.data.length > 0 ? (
                    <AnalysisPanel 
                        cards={analysisCards} 
                        finalSummary={finalSummary}
                        onChartTypeChange={handleChartTypeChange}
                        onToggleDataVisibility={handleToggleDataVisibility}
                        onTopNChange={handleTopNChange}
                        onHideOthersChange={handleHideOthersChange}
                    />
                ) : (
                    <FileUpload 
                        onFileUpload={handleFileUpload} 
                        isBusy={isBusy}
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
                            isApiKeySet={!!settings.apiKey}
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
