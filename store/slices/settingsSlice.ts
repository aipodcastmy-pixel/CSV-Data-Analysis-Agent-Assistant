import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { Settings } from '../../types';
import { getSettings, saveSettings } from '../../storageService';

export interface ISettingsSlice {
    settings: Settings;
    isApiKeySet: boolean;
    handleSaveSettings: (newSettings: Settings) => void;
}

export const createSettingsSlice: StateCreator<AppStore, [], [], ISettingsSlice> = (set) => ({
    settings: getSettings(),
    isApiKeySet: (() => {
        const settings = getSettings();
        if (settings.provider === 'google') return !!settings.geminiApiKey;
        return !!settings.openAIApiKey;
    })(),

    handleSaveSettings: (newSettings) => {
        saveSettings(newSettings);
        const isSet = newSettings.provider === 'google'
            ? !!newSettings.geminiApiKey
            : !!newSettings.openAIApiKey;
        set({ settings: newSettings, isApiKeySet: isSet });
    },
});
