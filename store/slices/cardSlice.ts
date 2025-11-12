import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';
import { ChartType } from '../../types';

export interface ICardSlice {
    handleChartTypeChange: (cardId: string, newType: ChartType) => void;
    handleToggleDataVisibility: (cardId: string) => void;
    handleTopNChange: (cardId: string, topN: number | null) => void;
    handleHideOthersChange: (cardId: string, hide: boolean) => void;
    handleToggleLegendLabel: (cardId: string, label: string) => void;
    handleShowCardFromChat: (cardId: string) => void;
}

export const createCardSlice: StateCreator<AppStore, [], [], ICardSlice> = (set) => ({
    handleChartTypeChange: (cardId, newType) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, displayChartType: newType} : c) })),
    handleToggleDataVisibility: (cardId) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, isDataVisible: !c.isDataVisible} : c) })),
    handleTopNChange: (cardId, topN) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, topN: topN} : c) })),
    handleHideOthersChange: (cardId, hide) => set(state => ({ analysisCards: state.analysisCards.map(c => c.id === cardId ? {...c, hideOthers: hide} : c) })),
    handleToggleLegendLabel: (cardId, label) => {
        set(state => ({
            analysisCards: state.analysisCards.map(c => {
                if (c.id === cardId) {
                    const currentHidden = c.hiddenLabels || [];
                    const newHidden = currentHidden.includes(label) ? currentHidden.filter(l => l !== label) : [...currentHidden, label];
                    return { ...c, hiddenLabels: newHidden };
                }
                return c;
            })
        }));
    },
    handleShowCardFromChat: (cardId) => {
        const element = document.getElementById(cardId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-4', 'ring-blue-500', 'transition-all', 'duration-500');
            setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500'), 2500);
        }
    },
});
