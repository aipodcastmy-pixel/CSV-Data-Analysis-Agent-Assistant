import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { AnalysisCardData, ChatMessage, ProgressMessage, CsvData, AnalysisPlan, AppState, ColumnProfile } from './types';
import { processCsv, profileData, executePlan } from './utils/dataProcessor';
import { generateAnalysisPlans, generateSummary, generateFinalSummary } from './services/geminiService';
import { getSession, saveSession } from './storageService';

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

        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (appState.csvData || appState.analysisCards.length > 0) {
            saveSession(appState);
        }
    }, [appState]);

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
                    summary = await generateSummary(plan.title, aggregatedData);
                }

                const newCard: AnalysisCardData = {
                    id: `card-${Date.now()}-${Math.random()}`,
                    plan: plan,
                    aggregatedData: aggregatedData,
                    summary: summary,
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
            const finalSummaryText = await generateFinalSummary(newCards);
            if(isMounted.current) {
                setAppState(prev => ({...prev, finalSummary: finalSummaryText}));
            }
            addProgress('Overall summary generated.');
        }

        return newCards;
    }, [addProgress, appState.useCloudAI]);

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
                addProgress('AI is generating analysis plans...');
                const plans = await generateAnalysisPlans(profiles, data.slice(0, 5));
                addProgress(`AI proposed ${plans.length} plans.`);
                await runAnalysisPipeline(plans, data, false);
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
    }, [addProgress, runAnalysisPipeline, appState.useCloudAI]);

     const handleChatMessage = useCallback(async (message: string) => {
        if (!appState.csvData || !appState.columnProfiles.length) {
            addProgress("Please upload a CSV file first.", "error");
            return;
        }

        if (!isMounted.current) return;
        const newChatMessage: ChatMessage = { sender: 'user', text: message, timestamp: new Date() };
        setAppState(prev => ({ ...prev, isBusy: true, chatHistory: [...prev.chatHistory, newChatMessage] }));

        try {
            if (appState.useCloudAI) {
                addProgress('AI is interpreting your request...');
                const newPlans = await generateAnalysisPlans(appState.columnProfiles, appState.csvData.slice(0, 5), message, 1);
                 if (newPlans.length > 0) {
                     addProgress(`AI created a new plan based on your request.`);
                     await runAnalysisPipeline(newPlans, appState.csvData, true);
                     if (isMounted.current) {
                         const aiMessage: ChatMessage = { sender: 'ai', text: `I've created a new analysis for "${newPlans[0].title}". You can see it in the main panel.`, timestamp: new Date() };
                         setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                     }
                 } else {
                     addProgress(`AI could not generate a plan from your request. Please try rephrasing.`);
                      if (isMounted.current) {
                        const aiMessage: ChatMessage = { sender: 'ai', text: `Sorry, I couldn't create a new chart from that request. Could you try rephrasing it?`, timestamp: new Date() };
                        setAppState(prev => ({...prev, chatHistory: [...prev.chatHistory, aiMessage]}));
                    }
                 }
            } else {
                addProgress('Cloud AI is disabled. Cannot process chat requests for new analysis.', 'error');
            }
        } catch(error) {
            console.error('Chat processing error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            addProgress(`Error processing chat: ${errorMessage}`, 'error');
        } finally {
            if (isMounted.current) {
                setAppState(prev => ({ ...prev, isBusy: false }));
            }
        }
    }, [appState.csvData, appState.columnProfiles, appState.useCloudAI, addProgress, runAnalysisPipeline]);
    
    const toggleCloudAI = () => {
        setAppState(prev => ({...prev, useCloudAI: !prev.useCloudAI}));
    }

    const { isBusy, progressMessages, csvData, analysisCards, chatHistory, finalSummary } = appState;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-gray-900 text-gray-200 font-sans">
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <header className="mb-6">
                    <h1 className="text-3xl font-bold text-white">🧠 CSV Data Analysis AI Assistant</h1>
                    <p className="text-gray-400 mt-1">Upload → Auto-Analyze → Visualize → Summarize → Chat</p>
                </header>
                {csvData ? (
                    <AnalysisPanel cards={analysisCards} finalSummary={finalSummary} />
                ) : (
                    <FileUpload onFileUpload={handleFileUpload} isBusy={isBusy} />
                )}
            </main>
            <aside className="w-full md:w-1/3 lg:w-1/4 bg-gray-800 p-4 flex flex-col h-full border-l border-gray-700">
                 <ChatPanel 
                    progressMessages={progressMessages} 
                    chatHistory={chatHistory}
                    isBusy={isBusy} 
                    onSendMessage={handleChatMessage} 
                    useCloudAI={appState.useCloudAI}
                    toggleCloudAI={toggleCloudAI}
                />
            </aside>
        </div>
    );
};

export default App;