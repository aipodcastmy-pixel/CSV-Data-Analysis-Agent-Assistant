import React, { useEffect } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ChatPanel } from './components/ChatPanel';
import { FileUpload } from './components/FileUpload';
import { SettingsModal } from './components/SettingsModal';
import { HistoryPanel } from './components/HistoryPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { SpreadsheetPanel } from './components/SpreadsheetPanel';
import { DataPrepDebugPanel } from './components/DataPrepDebugPanel';
import { AppHeader } from './components/AppHeader';
import { useAppStore } from './store/useAppStore';


const App: React.FC = () => {
    const {
        init,
        currentView,
        csvData,
        isAsideVisible,
        asideWidth,
        isResizing,
        handleAsideMouseDown,
        isDataPrepDebugVisible,
        isSpreadsheetVisible,
        dataPreparationPlan,
        initialDataSample,
    } = useAppStore(state => ({
        init: state.init,
        currentView: state.currentView,
        csvData: state.csvData,
        isAsideVisible: state.isAsideVisible,
        asideWidth: state.asideWidth,
        isResizing: state.isResizing,
        handleAsideMouseDown: state.handleAsideMouseDown,
        isDataPrepDebugVisible: state.isDataPrepDebugVisible,
        isSpreadsheetVisible: state.isSpreadsheetVisible,
        dataPreparationPlan: state.dataPreparationPlan,
        initialDataSample: state.initialDataSample,
    }));
    
    const setIsAsideVisible = useAppStore(state => state.setIsAsideVisible);

    useEffect(() => {
        init();
    }, [init]);

    const renderMainContent = () => {
        if (currentView === 'file_upload' || !csvData) {
            return (
                <div className="flex-grow min-h-0">
                    <FileUpload />
                </div>
            );
        }
        return (
            <div className="flex-grow min-h-0 overflow-y-auto">
                <AnalysisPanel />
                {dataPreparationPlan && dataPreparationPlan.jsFunctionBody && initialDataSample && (
                    <div className="mt-8">
                        <DataPrepDebugPanel isVisible={isDataPrepDebugVisible} />
                    </div>
                )}
                <div className="mt-8">
                    <SpreadsheetPanel isVisible={isSpreadsheetVisible} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-800 font-sans">
            <SettingsModal />
            <HistoryPanel />
            <MemoryPanel />
            <main className="flex-1 overflow-hidden p-4 flex flex-col">
                <AppHeader />
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
                        <ChatPanel />
                    </aside>
                </>
            )}
        </div>
    );
};

export default App;