import React, { useState, useEffect, useRef } from 'react';
import { ProgressMessage, ChatMessage } from '../types';

interface ChatPanelProps {
    progressMessages: ProgressMessage[];
    chatHistory: ChatMessage[];
    isBusy: boolean;
    onSendMessage: (message: string) => void;
    useCloudAI: boolean;
    toggleCloudAI: () => void;
}

const Toggle: React.FC<{ checked: boolean, onChange: () => void }> = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
    </label>
);

export const ChatPanel: React.FC<ChatPanelProps> = ({ progressMessages, chatHistory, isBusy, onSendMessage, useCloudAI, toggleCloudAI }) => {
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
                    <div className="bg-gray-700 rounded-lg px-3 py-2 max-w-xs lg:max-w-md">
                         <p className="text-sm text-gray-200">{msg.text}</p>
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
        <div className="flex flex-col h-full bg-gray-800 rounded-lg">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-white">Assistant</h2>
                 <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-400">Cloud AI</span>
                    <Toggle checked={useCloudAI} onChange={toggleCloudAI} />
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
                        placeholder={useCloudAI ? "Ask for a new analysis..." : "Enable Cloud AI to chat"}
                        disabled={isBusy || !useCloudAI}
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