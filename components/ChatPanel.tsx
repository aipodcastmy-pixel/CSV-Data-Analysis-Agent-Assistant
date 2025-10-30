
import React, { useState, useEffect, useRef } from 'react';
import { ProgressMessage, ChatMessage } from '../types';

interface ChatPanelProps {
    progressMessages: ProgressMessage[];
    chatHistory: ChatMessage[];
    isBusy: boolean;
    onSendMessage: (message: string) => void;
    isApiKeySet: boolean;
    onToggleVisibility: () => void;
    onOpenSettings: () => void;
}

const HideIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

const SettingsIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);


export const ChatPanel: React.FC<ChatPanelProps> = ({ progressMessages, chatHistory, isBusy, onSendMessage, isApiKeySet, onToggleVisibility, onOpenSettings }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const timeline = [...progressMessages, ...chatHistory]
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [timeline]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isBusy) {
            onSendMessage(input.trim());
            setInput('');
        }
    };

    const renderMessage = (item: ProgressMessage | ChatMessage, index: number) => {
        if ('sender' in item) { // It's a ChatMessage
            const msg = item as ChatMessage;
            if (msg.sender === 'user') {
                return (
                    <div key={`chat-${index}`} className="flex justify-end">
                        <div className="bg-blue-600 rounded-lg px-3 py-2 max-w-xs lg:max-w-md">
                            <p className="text-sm text-white">{msg.text}</p>
                        </div>
                    </div>
                );
            }
            // AI message
            return (
                <div key={`chat-${index}`} className="flex">
                    <div className={`rounded-lg px-3 py-2 max-w-xs lg:max-w-md ${msg.isError ? 'bg-red-900/50' : 'bg-gray-700'}`}>
                         <p className={`text-sm ${msg.isError ? 'text-red-300' : 'text-gray-200'}`}>{msg.text}</p>
                    </div>
                </div>
            );
        } else { // It's a ProgressMessage
            const msg = item as ProgressMessage;
             return (
                 <div key={`prog-${index}`} className={`flex text-xs ${msg.type === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                    <span className="mr-2 text-gray-500">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{msg.text}</span>
                </div>
            )
        }
    }

    return (
        <div className="flex flex-col h-full bg-gray-800 rounded-lg md:rounded-none">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Assistant</h2>
                 <div className="flex items-center space-x-3">
                    <button
                        onClick={onOpenSettings}
                        className="p-1 text-gray-400 rounded-full hover:bg-gray-700 hover:text-white transition-colors"
                        title="Settings"
                        aria-label="Open Settings"
                    >
                        <SettingsIcon />
                    </button>
                    <button 
                        onClick={onToggleVisibility} 
                        className="p-1 text-gray-400 rounded-full hover:bg-gray-700 hover:text-white transition-colors"
                        title="Hide Panel"
                        aria-label="Hide Assistant Panel"
                    >
                        <HideIcon />
                    </button>
                </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {timeline.map(renderMessage)}

                {isBusy && (
                    <div className="flex items-center text-blue-400">
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-700">
                <form onSubmit={handleSend}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isApiKeySet ? "Ask for a new analysis..." : "Set API Key in settings to chat"}
                        disabled={isBusy || !isApiKeySet}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                </form>
                 <div className="text-xs text-gray-500 mt-2">
                    Examples: "Sum of sales by region", "Monthly user growth trend"
                </div>
            </div>
        </div>
    );
};
