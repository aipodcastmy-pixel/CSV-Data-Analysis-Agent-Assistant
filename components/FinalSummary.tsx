import React from 'react';

interface FinalSummaryProps {
    summary: string;
}

export const FinalSummary: React.FC<FinalSummaryProps> = ({ summary }) => {
    return (
        <div className="bg-gray-800 border border-blue-500/30 rounded-lg shadow-lg p-4 mb-6">
            <h2 className="text-xl font-bold text-white mb-2">📊 Overall Insights</h2>
            <p className="text-gray-300 whitespace-pre-wrap">{summary}</p>
        </div>
    );
};