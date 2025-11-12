import type { MouseEvent as ReactMouseEvent } from 'react';
import type { StateCreator } from 'zustand';
import type { AppStore } from '../useAppStore';

const MIN_ASIDE_WIDTH = 320;
const MAX_ASIDE_WIDTH = 800;
const MIN_MAIN_WIDTH = 600;

export interface IUISlice {
    isAsideVisible: boolean;
    asideWidth: number;
    isSpreadsheetVisible: boolean;
    isDataPrepDebugVisible: boolean;
    isSettingsModalOpen: boolean;
    isHistoryPanelOpen: boolean;
    isMemoryPanelOpen: boolean;
    isResizing: boolean;
    handleAsideMouseDown: (e: ReactMouseEvent) => void;
    setIsAsideVisible: (isVisible: boolean) => void;
    setIsSpreadsheetVisible: (isVisible: boolean) => void;
    setIsDataPrepDebugVisible: (isVisible: boolean) => void;
    setIsSettingsModalOpen: (isOpen: boolean) => void;
    setIsHistoryPanelOpen: (isOpen: boolean) => void;
    setIsMemoryPanelOpen: (isOpen: boolean) => void;
}

export const createUISlice: StateCreator<AppStore, [], [], IUISlice> = (set) => ({
    isAsideVisible: true,
    asideWidth: window.innerWidth / 4 > MIN_ASIDE_WIDTH ? window.innerWidth / 4 : MIN_ASIDE_WIDTH,
    isSpreadsheetVisible: true,
    isDataPrepDebugVisible: false,
    isSettingsModalOpen: false,
    isHistoryPanelOpen: false,
    isMemoryPanelOpen: false,
    isResizing: false,

    handleAsideMouseDown: (e) => {
        e.preventDefault();
        set({ isResizing: true });
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const maxAllowedAsideWidth = window.innerWidth - MIN_MAIN_WIDTH;
            let newWidth = window.innerWidth - moveEvent.clientX;
            newWidth = Math.max(MIN_ASIDE_WIDTH, newWidth);
            newWidth = Math.min(MAX_ASIDE_WIDTH, newWidth, maxAllowedAsideWidth);
            set({ asideWidth: newWidth });
        };
        const handleMouseUp = () => {
            set({ isResizing: false });
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    },
    
    setIsAsideVisible: (isVisible) => set({ isAsideVisible: isVisible }),
    setIsSpreadsheetVisible: (isVisible) => set({ isSpreadsheetVisible: isVisible }),
    setIsDataPrepDebugVisible: (isVisible) => set({ isDataPrepDebugVisible: isVisible }),
    setIsSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
    setIsHistoryPanelOpen: (isOpen) => set({ isHistoryPanelOpen: isOpen }),
    setIsMemoryPanelOpen: (isOpen) => set({ isMemoryPanelOpen: isOpen }),
});
