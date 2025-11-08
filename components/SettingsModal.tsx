import React, { useState, useEffect } from 'react';
import { Settings } from '../types';
import { useAppStore } from '../store/useAppStore';

const languages: Settings['language'][] = ['English', 'Mandarin', 'Spanish', 'Japanese', 'French'];
const googleModels: Settings['model'][] = ['gemini-2.5-flash', 'gemini-2.5-pro'];
const openAIModels: Settings['model'][] = ['gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4-turbo'];


export const SettingsModal: React.FC = () => {
    const { isOpen, onClose, onSave, currentSettings } = useAppStore(state => ({
        isOpen: state.isSettingsModalOpen,
        onClose: () => state.setIsSettingsModalOpen(false),
        onSave: state.handleSaveSettings,
        currentSettings: state.settings,
    }));

    const [settings, setSettings] = useState<Settings>(currentSettings);

    useEffect(() => {
        setSettings(currentSettings);
    }, [currentSettings, isOpen]);

    if (!isOpen) {
        return null;
    }

    const handleSave = () => {
        onSave(settings);
        onClose();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleProviderChange = (provider: 'google' | 'openai') => {
        setSettings(prev => {
            const currentModelIsGoogle = googleModels.includes(prev.model as any);
            const currentModelIsOpenAI = openAIModels.includes(prev.model as any);
            
            let newModel = prev.model;
            if (provider === 'google' && !currentModelIsGoogle) {
                newModel = 'gemini-2.5-pro';
            } else if (provider === 'openai' && !currentModelIsOpenAI) {
                newModel = 'gpt-4o';
            }

            return { ...prev, provider, model: newModel as any };
        });
    };


    return (
        <div 
            className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md border border-slate-200"
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-slate-900 mb-6">Settings</h2>
                
                <div className="space-y-6">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            AI Provider
                        </label>
                        <div className="flex space-x-2 rounded-lg bg-slate-200 p-1">
                            <button onClick={() => handleProviderChange('google')} className={`w-full rounded-md py-1.5 text-sm font-medium transition-colors ${settings.provider === 'google' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300'}`}>
                                Google Gemini
                            </button>
                            <button onClick={() => handleProviderChange('openai')} className={`w-full rounded-md py-1.5 text-sm font-medium transition-colors ${settings.provider === 'openai' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300'}`}>
                                OpenAI
                            </button>
                        </div>
                    </div>
                    
                    {/* Fix: Remove Gemini API key input and show an informational message instead, per guidelines. */}
                    {settings.provider === 'google' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700">
                                Gemini API Key
                            </label>
                             <div className="mt-1 text-sm text-slate-700 bg-slate-100 p-3 rounded-md border border-slate-200">
                                The Google Gemini API key is configured securely via an environment variable and is ready to use.
                            </div>
                        </div>
                    )}
                    
                    {settings.provider === 'openai' && (
                         <div>
                            <label htmlFor="openAIApiKey" className="block text-sm font-medium text-slate-700">
                                OpenAI API Key
                            </label>
                            <input
                                type="password"
                                id="openAIApiKey"
                                name="openAIApiKey"
                                value={settings.openAIApiKey}
                                onChange={handleInputChange}
                                className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter your API key (sk-...)"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenAI Platform</a>.
                            </p>
                        </div>
                    )}


                    <div>
                        <label htmlFor="model" className="block text-sm font-medium text-slate-700">
                            AI Model
                        </label>
                         <input
                            type="text"
                            id="model"
                            name="model"
                            value={settings.model}
                            onChange={handleInputChange}
                            list="model-list"
                            className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., gpt-4o"
                        />
                        <datalist id="model-list">
                             {(settings.provider === 'google' ? googleModels : openAIModels).map(model => (
                                <option key={model} value={model} />
                            ))}
                        </datalist>
                         <p className="text-xs text-slate-500 mt-1">
                            Select a suggested model or type a custom one.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="language" className="block text-sm font-medium text-slate-700">
                            Agent Language
                        </label>
                        <select
                            id="language"
                            name="language"
                            value={settings.language}
                            onChange={handleInputChange}
                            className="mt-1 block w-full bg-white border border-slate-300 rounded-md py-2 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {languages.map(lang => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </select>
                         <p className="text-xs text-slate-500 mt-1">
                            Primary language for AI summaries and chat responses.
                        </p>
                    </div>
                </div>

                <div className="mt-8 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};