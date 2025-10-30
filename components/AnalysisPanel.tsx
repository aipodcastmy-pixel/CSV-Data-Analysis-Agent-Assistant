
import React from 'react';
import { AnalysisCardData, ChartType } from '../types';
import { AnalysisCard } from './AnalysisCard';
import { FinalSummary } from './FinalSummary';


interface AnalysisPanelProps {
    cards: AnalysisCardData[];
    finalSummary: string | null;
    onChartTypeChange: (cardId: string, newType: ChartType) => void;
    onToggleDataVisibility: (cardId: string) => void;
    onTopNChange: (cardId: string, topN: number | null) => void;
    onHideOthersChange: (cardId: string, hide: boolean) => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ cards, finalSummary, onChartTypeChange, onToggleDataVisibility, onTopNChange, onHideOthersChange }) => {
    if (cards.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-600 rounded-lg">
                <p className="text-gray-400">Your analysis results will appear here.</p>
            </div>
        );
    }

    return (
        <div>
            {finalSummary && <FinalSummary summary={finalSummary} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 mt-6">
                {cards.map((card) => (
                    <AnalysisCard 
                        key={card.id} 
                        cardData={card} 
                        onChartTypeChange={onChartTypeChange}
                        onToggleDataVisibility={onToggleDataVisibility}
                        onTopNChange={onTopNChange}
                        onHideOthersChange={onHideOthersChange}
                    />
                ))}
            </div>
        </div>
    );
};