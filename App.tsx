import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { SettingsModal } from './components/SettingsModal';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, AppState, ColumnProfile, AiChatResponse, ChartType, DomAction, Settings } from './types';
import { processCsv, profileData, executePlan } from './utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary, generateChatResponse } from './services/geminiService';
import { getSession, saveSession, getSettings, saveSettings } from './storageService';

const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;

const ShowAssistantIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
    const [settings, setSettings] = useState<Settings>(getSettings);

    const isResizingRef = useRef(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        const loadInitialData = async () => {
            const savedState = await getSession();
            if (savedState && isMounted.current) {
                setAppState(savedState);
            }
        };
        loadInitialData();
        setSettings(getSettings());

        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (appState.csvData || appState.analysisCards.length > 0) {
            saveSession(appState);
        }
    }, [appState]);
    
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
        setAppState({
            isBusy: true,
            useCloudAI: appState.useCloudAI,
            progressMessages: [],
            csvData: null,
            columnProfiles: [],
            analysisCards: [],
            chatHistory: [],
            finalSummary: null,
        });
        
        try {
            addProgress('Parsing CSV file...');
            const data = await processCsv(file);
            if (!isMounted.current) return;
            setAppState(prev => ({ ...prev, csvData: data }));
            addProgress(`Parsed ${data.length} rows.`);

            addProgress('Profiling data columns...');
            const profiles = profileData(data);
            if (!isMounted.current) return;
            setAppState(prev => ({ ...prev, columnProfiles: profiles }));
            addProgress('Data profiling complete.');
            
            if (appState.useCloudAI) {
                if (!settings.apiKey) {
                    addProgress('API Key not set. Please add your Gemini API Key in the settings.', 'error');
                    setIsSettingsModalOpen(true);
                } else {
                    addProgress('AI is generating analysis plans...');
                    const plans = await generateAnalysisPlans(profiles, data.slice(0, 5), settings);
                    addProgress(`AI proposed ${plans.length} plans.`);
                    await runAnalysisPipeline(plans, data, false);
                }
            } else {
                 addProgress('Cloud AI is disabled. Manual analysis via chat is available.');
            }

        } catch (error) {
            console.error('File processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error: ${errorMessage}`, 'error');
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
                addProgress('Analysis complete. Ready for chat.');
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
            const chatResponse: AiChatResponse = await generateChatResponse(
                appState.columnProfiles,
                appState.csvData.slice(0, 5),
                appState.chatHistory,
                message,
                appState.analysisCards.map(c => ({id: c.id, title: c.plan.title})),
                settings
            );

            if (chatResponse.responseType === 'plan_creation' && chatResponse.plan) {
                const newPlan = chatResponse.plan;
                addProgress(`AI created a new plan: "${newPlan.title}"`);
                await runAnalysisPipeline([newPlan], appState.csvData, true);
                
                if (isMounted.current) {
                    const aiMessage: ChatMessage = { 
                        sender: 'ai', 
                        text: `I've created a new analysis for "${newPlan.title}". You can see it in the main panel.`, 
                        timestamp: new Date() 
                    };
                    setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                }
            } else if (chatResponse.responseType === 'text_response' && chatResponse.text) {
                const textResponse = chatResponse.text;
                if (isMounted.current) {
                    const aiMessage: ChatMessage = { sender: 'ai', text: textResponse, timestamp: new Date() };
                    setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                }
                addProgress('AI responded.');
            } else if (chatResponse.responseType === 'dom_action' && chatResponse.domAction) {
                executeDomAction(chatResponse.domAction);
                if (isMounted.current) {
                    const aiMessage: ChatMessage = { 
                        sender: 'ai', 
                        text: chatResponse.text || `Okay, I've performed the action: ${chatResponse.domAction.toolName}.`, 
                        timestamp: new Date() 
                    };
                    setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                }
            } else {
                throw new Error("AI returned an unexpected response format.");
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

    const { isBusy, progressMessages, csvData, analysisCards, chatHistory, finalSummary, useCloudAI } = appState;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-gray-900 text-gray-200 font-sans">
            <SettingsModal 
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                onSave={handleSaveSettings}
                currentSettings={settings}
            />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <header className="mb-6">
                    <h1 className="text-3xl font-bold text-white">🧠 CSV Data Analysis AI Assistant</h1>
                    <p className="text-gray-400 mt-1">Upload → Auto-Analyze → Visualize → Summarize → Chat</p>
                </header>
                {csvData ? (
                    <AnalysisPanel 
                        cards={analysisCards} 
                        finalSummary={finalSummary}
                        onChartTypeChange={handleChartTypeChange}
                        onToggleDataVisibility={handleToggleDataVisibility}
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