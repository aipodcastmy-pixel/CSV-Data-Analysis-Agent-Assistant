
import React, { useRef, useState } from 'react';
import { AnalysisCardData, ChartType, CsvData } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { DataTable } from './DataTable';
import { exportToPng, exportToCsv, exportToHtml } from '../utils/exportUtils';

interface AnalysisCardProps {
    cardData: AnalysisCardData;
}

const ExportIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);


export const AnalysisCard: React.FC<AnalysisCardProps> = ({ cardData }) => {
    const { plan, aggregatedData, summary } = cardData;
    const cardRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [showData, setShowData] = useState(false);
    
    const summaryParts = summary.split('---');
    const englishSummary = summaryParts[0]?.trim();
    const mandarinSummary = summaryParts[1]?.trim();

    const handleExport = async (format: 'png' | 'csv' | 'html') => {
        if (!cardRef.current) return;
        setIsExporting(true);
        try {
            switch(format) {
                case 'png':
                    await exportToPng(cardRef.current, plan.title);
                    break;
                case 'csv':
                    exportToCsv(aggregatedData, plan.title);
                    break;
                case 'html':
                    await exportToHtml(cardRef.current, plan.title, aggregatedData, summary);
                    break;
            }
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div ref={cardRef} className="bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col transition-all duration-300 hover:shadow-blue-500/20">
            <div className="flex justify-between items-start mb-2">
                <div>
                     <h3 className="text-lg font-bold text-white">{plan.title}</h3>
                     <p className="text-sm text-gray-400">{plan.description}</p>
                </div>
                <div className="relative group">
                    <button disabled={isExporting} className="p-2 text-gray-400 hover:text-white transition-colors">
                       <ExportIcon />
                    </button>
                    <div className="absolute right-0 mt-1 w-32 bg-gray-700 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <a onClick={() => handleExport('png')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer">Export as PNG</a>
                        <a onClick={() => handleExport('csv')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer">Export as CSV</a>
                        <a onClick={() => handleExport('html')} className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-600 cursor-pointer">Export as HTML</a>
                    </div>
                </div>
            </div>
           
            <div className="flex-grow h-64 my-4">
                 <ChartRenderer 
                    chartType={plan.chartType} 
                    data={aggregatedData} 
                    groupByKey={plan.groupByColumn}
                    valueKey={plan.valueColumn || 'count'}
                />
            </div>
             <div className="bg-gray-900/50 p-3 rounded-md text-sm">
                <p className="font-semibold text-blue-300 mb-1">AI Summary</p>
                <p className="text-gray-300">{englishSummary}</p>
                {mandarinSummary && <p className="text-gray-400 mt-2">{mandarinSummary}</p>}
            </div>

            <div className="mt-4">
                <button onClick={() => setShowData(!showData)} className="text-sm text-blue-400 hover:underline">
                    {showData ? 'Hide' : 'Show'} Data Table
                </button>
                {showData && (
                     <div className="mt-2 max-h-48 overflow-y-auto">
                        <DataTable data={aggregatedData} />
                    </div>
                )}
            </div>
        </div>
    );
};
