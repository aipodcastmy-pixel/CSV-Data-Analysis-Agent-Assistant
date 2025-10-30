import React from 'react';
import { AnalysisCardData } from '../types';
import { AnalysisCard } from './AnalysisCard';
import { FinalSummary } from './FinalSummary';


interface AnalysisPanelProps {
    cards: AnalysisCardData[];
    finalSummary: string | null;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ cards, finalSummary }) => {
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
                    <AnalysisCard key={card.id} cardData={card} />
                ))}
            </div>
        </div>
    );
};