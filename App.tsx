import React from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { SettingsModal } from './components/SettingsModal';
import { HistoryPanel } from './components/HistoryPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { SpreadsheetPanel } from './components/SpreadsheetPanel';
import { DataPrepDebugPanel } from './components/DataPrepDebugPanel';
import { AppHeader } from './components/AppHeader';
import { useApp } from './hooks/useApp';


const App: React.FC = () => {
    const {
        appState,
        isAsideVisible,
        asideWidth,
        isSpreadsheetVisible,
        isDataPrepDebugVisible,
        isSettingsModalOpen,
        isHistoryPanelOpen,
        isMemoryPanelOpen,
        settings,
        reportsList,
        isResizing,
        isApiKeySet,
        handleSaveSettings,
        handleAsideMouseDown,
        handleFileUpload,
        handleChatMessage,
        handleChartTypeChange,
        handleToggleDataVisibility,
        handleTopNChange,
        handleHideOthersChange,
        handleToggleLegendLabel,
        handleLoadReport,
        handleDeleteReport,
        handleShowCardFromChat,
        handleNewSession,
        setIsAsideVisible,
        setIsSpreadsheetVisible,
        setIsDataPrepDebugVisible,
        setIsSettingsModalOpen,
        setIsHistoryPanelOpen,
        setIsMemoryPanelOpen,
        loadReportsList,
    } = useApp();

    const { isBusy, progressMessages, csvData, analysisCards, chatHistory, finalSummary, currentView } = appState;

    const renderMainContent = () => {
        if (currentView === 'file_upload' || !csvData) {
            return (
                <div className="flex-grow min-h-0">
                    <FileUpload 
                        onFileUpload={handleFileUpload} 
                        isBusy={isBusy}
                        progressMessages={progressMessages}
                        fileName={csvData?.fileName || null}
                        isApiKeySet={isApiKeySet}
                    />
                </div>
            );
        }
        return (
            <div className="flex-grow min-h-0 overflow-y-auto">
                <AnalysisPanel 
                    cards={analysisCards} 
                    finalSummary={finalSummary}
                    onChartTypeChange={handleChartTypeChange}
                    onToggleDataVisibility={handleToggleDataVisibility}
                    onTopNChange={handleTopNChange}
                    onHideOthersChange={handleHideOthersChange}
                    onToggleLegendLabel={handleToggleLegendLabel}
                />
                {appState.dataPreparationPlan && appState.dataPreparationPlan.jsFunctionBody && appState.initialDataSample && (
                    <div className="mt-8">
                        <DataPrepDebugPanel
                            plan={appState.dataPreparationPlan}
                            originalSample={appState.initialDataSample}
                            transformedSample={csvData.data.slice(0, 20)}
                            isVisible={isDataPrepDebugVisible}
                            onToggleVisibility={() => setIsDataPrepDebugVisible(prev => !prev)}
                        />
                    </div>
                )}
                <div className="mt-8">
                    <SpreadsheetPanel
                        csvData={csvData}
                        isVisible={isSpreadsheetVisible}
                        onToggleVisibility={() => setIsSpreadsheetVisible(prev => !prev)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800 font-sans">
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
            <MemoryPanel
                isOpen={isMemoryPanelOpen}
                onClose={() => setIsMemoryPanelOpen(false)}
            />
            <main className="flex-1 overflow-hidden p-4 flex flex-col">
                <AppHeader
                    onNewSession={handleNewSession}
                    onOpenHistory={() => {loadReportsList(); setIsHistoryPanelOpen(true);}}
                    isAsideVisible={isAsideVisible}
                    onShowAssistant={() => setIsAsideVisible(true)}
                />
                {renderMainContent()}
            </main>
            
            {isAsideVisible && (
                <>
                    <div 
                        onMouseDown={handleAsideMouseDown}
                        onDoubleClick={() => setIsAsideVisible(false)}
                        className="hidden md:flex group items-center justify-center w-2.5 cursor-col-resize"
                        title="Drag to resize, double-click to hide"
                    >
                        <div 
                            className={`w-0.5 h-8 bg-slate-300 rounded-full transition-colors duration-200 group-hover:bg-brand-secondary ${isResizing ? '!bg-blue-600' : ''}`} 
                        />
                    </div>
                    <aside className="w-full md:w-auto bg-white flex flex-col h-full border-l border-slate-200" style={{ width: asideWidth }}>
                        <ChatPanel 
                            progressMessages={progressMessages} 
                            chatHistory={chatHistory}
                            isBusy={isBusy} 
                            onSendMessage={handleChatMessage} 
                            isApiKeySet={isApiKeySet}
                            onToggleVisibility={() => setIsAsideVisible(false)}
                            onOpenSettings={() => setIsSettingsModalOpen(true)}
                            onOpenMemory={() => setIsMemoryPanelOpen(true)}
                            onShowCard={handleShowCardFromChat}
                            currentView={currentView}
                        />
                    </aside>
                </>
            )}
        </div>
    );
};

export default App;
