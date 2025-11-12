import React from 'react';
import Masonry from 'react-masonry-css';
import { AnalysisCard } from './AnalysisCard';
import { FinalSummary } from './FinalSummary';
import { useAppStore } from '../store/useAppStore';

const breakpointColumnsObj = {
  default: 1,
  1024: 2, // lg breakpoint
  1536: 3  // 2xl breakpoint
};

export const AnalysisPanel: React.FC = () => {
    const cards = useAppStore(state => state.analysisCards);
    const finalSummary = useAppStore(state => state.finalSummary);

    if (cards.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                 <div className="text-center p-4">
                    <p className="text-slate-500">Your analysis results will appear here.</p>
                    <p className="text-slate-400 text-sm mt-2">The AI is generating the initial analysis...</p>
                 </div>
            </div>
        );
    }

    return (
        <div className="p-1">
            {finalSummary && <FinalSummary summary={finalSummary} />}
            <Masonry
                breakpointCols={breakpointColumnsObj}
                className="masonry-grid mt-6"
                columnClassName="masonry-grid-column"
            >
                {cards.map((card) => (
                    <div key={card.id} className="mb-6">
                        <AnalysisCard 
                            cardId={card.id}
                        />
                    </div>
                ))}
            </Masonry>
        </div>
    );
};