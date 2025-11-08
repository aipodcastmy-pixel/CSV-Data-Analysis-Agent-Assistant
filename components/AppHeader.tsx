import React from 'react';
import { NewIcon, HistoryIcon, ShowAssistantIcon } from './Icons';

interface AppHeaderProps {
    onNewSession: () => void;
    onOpenHistory: () => void;
    isAsideVisible: boolean;
    onShowAssistant: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ onNewSession, onOpenHistory, isAsideVisible, onShowAssistant }) => {
    return (
        <header className="mb-6 flex justify-between items-start flex-shrink-0">
            <div className="max-w-xs">
                <h1 className="text-xl font-extrabold text-slate-900 leading-tight">CSV Data Analysis Agent</h1>
            </div>
             <div className="flex items-center space-x-2">
                 <button
                    onClick={onNewSession}
                    className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    title="Start a new analysis session"
                >
                   <NewIcon />
                   <span className="hidden sm:inline">New</span>
                </button>
                <button 
                    onClick={onOpenHistory}
                    className="flex items-center space-x-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                    title="View analysis history"
                >
                   <HistoryIcon />
                   <span className="hidden sm:inline">History</span>
                </button>
                {!isAsideVisible && (
                     <button
                        onClick={onShowAssistant}
                        className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        aria-label="Show Assistant Panel"
                        title="Show Assistant Panel"
                    >
                        <ShowAssistantIcon />
                    </button>
                )}
            </div>
        </header>
    );
};
