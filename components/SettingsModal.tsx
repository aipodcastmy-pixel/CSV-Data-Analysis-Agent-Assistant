import React, { useState, useEffect } from 'react';
import { Settings } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (settings: Settings) => void;
    currentSettings: Settings;
}

const languages: Settings['language'][] = ['English', 'Mandarin', 'Spanish', 'Japanese', 'French'];
const models: Settings['model'][] = ['gemini-2.5-flash', 'gemini-2.5-pro'];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentSettings }) => {
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

    return (
        <div 
            className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div 
                className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md border border-gray-700"
                onClick={e => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-white mb-4">Settings</h2>
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300">
                            Gemini API Key
                        </label>
                        <input
                            type="password"
                            id="apiKey"
                            name="apiKey"
                            value={settings.apiKey}
                            onChange={handleInputChange}
                            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter your API key"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="model" className="block text-sm font-medium text-gray-300">
                            AI Model
                        </label>
                        <select
                            id="model"
                            name="model"
                            value={settings.model}
                            onChange={handleInputChange}
                            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {models.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))}
                        </select>
                         <p className="text-xs text-gray-500 mt-1">
                            `pro` is more powerful, `flash` is faster.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="language" className="block text-sm font-medium text-gray-300">
                            Agent Language
                        </label>
                        <select
                            id="language"
                            name="language"
                            value={settings.language}
                            onChange={handleInputChange}
                            className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {languages.map(lang => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </select>
                         <p className="text-xs text-gray-500 mt-1">
                            Primary language for AI summaries and chat responses.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors"
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
