
import React, { useRef, useState, useMemo } from 'react';
import { AnalysisCardData, ChartType } from '../types';
import { ChartRenderer, ChartRendererHandle } from './ChartRenderer';
import { DataTable } from './DataTable';
import { exportToPng, exportToCsv, exportToHtml } from '../utils/exportUtils';
import { ChartTypeSwitcher } from './ChartTypeSwitcher';
import { applyTopNWithOthers } from '../utils/dataProcessor';

interface AnalysisCardProps {
    cardData: AnalysisCardData;
    onChartTypeChange: (cardId: string, newType: ChartType) => void;
    onToggleDataVisibility: (cardId: string) => void;
    onTopNChange: (cardId: string, topN: number | null) => void;
    onHideOthersChange: (cardId: string, hide: boolean) => void;
}

const ExportIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

const ResetZoomIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      <path d="M12.293 5.293a1 1 0 011.414 0l2 2a1 1 0 01-1.414 1.414L13 7.414V10a1 1 0 11-2 0V7.414l-1.293 1.293a1 1 0 01-1.414-1.414l2-2zM7.707 14.707a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L7 12.586V10a1 1 0 112 0v2.586l1.293-1.293a1 1 0 011.414 1.414l-2 2z" />
    </svg>
);

const ClearSelectionIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);


export const AnalysisCard: React.FC<AnalysisCardProps> = ({ cardData, onChartTypeChange, onToggleDataVisibility, onTopNChange, onHideOthersChange }) => {
    const { id, plan, aggregatedData, summary, displayChartType, isDataVisible, topN, hideOthers } = cardData;
    const cardRef = useRef<HTMLDivElement>(null);
    const chartRendererRef = useRef<ChartRendererHandle>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [isZoomed, setIsZoomed] = useState(false);
    const [showSelectionDetails, setShowSelectionDetails] = useState(true);
    
    const summaryParts = summary.split('---');
    const englishSummary = summaryParts[0]?.trim();
    const mandarinSummary = summaryParts[1]?.trim();

    const valueKey = plan.valueColumn || 'count';
    
    // Memoize the data transformation to prevent unnecessary re-renders of the chart
    const dataForDisplay = useMemo(() => {
        let data = topN ? applyTopNWithOthers(aggregatedData, plan.groupByColumn, valueKey, topN) : aggregatedData;
        if (topN && hideOthers) {
            data = data.filter(row => row[plan.groupByColumn] !== 'Others');
        }
        return data;
    }, [aggregatedData, topN, hideOthers, plan.groupByColumn, valueKey]);


    const handleExport = async (format: 'png' | 'csv' | 'html') => {
        if (!cardRef.current) return;
        setIsExporting(true);
        try {
            switch(format) {
                case 'png':
                    await exportToPng(cardRef.current, plan.title);
                    break;
                case 'csv':
                    exportToCsv(dataForDisplay, plan.title);
                    break;
                case 'html':
                    await exportToHtml(cardRef.current, plan.title, dataForDisplay, summary);
                    break;
            }
        } finally {
            setIsExporting(false);
        }
    };

    const handleChartClick = (index: number, event: MouseEvent) => {
        const isMultiSelect = event.ctrlKey || event.metaKey;
        setSelectedIndices(prev => {
            if (isMultiSelect) {
                const newSelection = prev.includes(index)
                    ? prev.filter(i => i !== index)
                    : [...prev, index];
                return newSelection.sort((a,b) => a-b);
            }
            return prev.includes(index) ? [] : [index];
        });
    };

    const handleResetZoom = () => {
        chartRendererRef.current?.resetZoom();
    };

    const clearSelection = () => {
        setSelectedIndices([]);
    };

    const handleTopNChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value === 'all' ? null : parseInt(e.target.value, 10);
        onTopNChange(id, value);
    };
    
    const selectedData = selectedIndices.map(index => dataForDisplay[index]);

    return (
        <div ref={cardRef} id={id} className="bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col transition-all duration-300 hover:shadow-blue-500/20">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-grow mr-4">
                     <h3 className="text-lg font-bold text-white">{plan.title}</h3>
                     <p className="text-sm text-gray-400">{plan.description}</p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                    <ChartTypeSwitcher currentType={displayChartType} onChange={(newType) => onChartTypeChange(id, newType)} />
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
            </div>
           
            <div className="flex-grow h-64 my-4 relative">
                 <ChartRenderer 
                    ref={chartRendererRef}
                    chartType={displayChartType} 
                    data={dataForDisplay} 
                    groupByKey={plan.groupByColumn}
                    valueKey={valueKey}
                    selectedIndices={selectedIndices}
                    onElementClick={handleChartClick}
                    onZoomChange={setIsZoomed}
                />
                 <div className="absolute top-1 right-1 flex items-center space-x-1">
                    {selectedIndices.length > 0 && (
                         <button onClick={clearSelection} title="Clear selection" className="p-1 bg-gray-700/50 text-gray-300 rounded-full hover:bg-gray-600 hover:text-white transition-all">
                            <ClearSelectionIcon />
                        </button>
                    )}
                    {isZoomed && (
                        <button onClick={handleResetZoom} title="Reset zoom" className="p-1 bg-gray-700/50 text-gray-300 rounded-full hover:bg-gray-600 hover:text-white transition-all">
                            <ResetZoomIcon />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="bg-gray-900/50 p-3 rounded-md text-sm flex-grow">
                    <p className="font-semibold text-blue-300 mb-1">AI Summary</p>
                    <p className="text-gray-300">{englishSummary}</p>
                    {mandarinSummary && <p className="text-gray-400 mt-2">{mandarinSummary}</p>}
                </div>
                {aggregatedData.length > 5 && (
                    <div className="ml-4 flex-shrink-0">
                        <label htmlFor={`top-n-${id}`} className="text-xs text-gray-400 block mb-1">Show Top</label>
                        <select
                            id={`top-n-${id}`}
                            value={topN || 'all'}
                            onChange={handleTopNChange}
                            className="bg-gray-700 border border-gray-600 text-white text-xs rounded-md p-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="all">All</option>
                            <option value="5">Top 5</option>
                            <option value="10">Top 10</option>
                            <option value="20">Top 20</option>
                        </select>
                         {topN && (
                            <div className="mt-2">
                                <label htmlFor={`hide-others-${id}`} className="flex items-center space-x-2 text-xs text-gray-400">
                                    <input
                                        type="checkbox"
                                        id={`hide-others-${id}`}
                                        checked={hideOthers}
                                        onChange={(e) => onHideOthersChange(id, e.target.checked)}
                                        className="bg-gray-700 border-gray-600 rounded focus:ring-blue-500 text-blue-500"
                                    />
                                    <span>Hide "Others"</span>
                                </label>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedIndices.length > 0 && (
                <div className="mt-4 bg-gray-900/50 p-3 rounded-md text-sm">
                     <button onClick={() => setShowSelectionDetails(!showSelectionDetails)} className="w-full text-left font-semibold text-blue-300 mb-1">
                        {showSelectionDetails ? '▾' : '▸'} Selection Details ({selectedIndices.length} items)
                    </button>
                    {showSelectionDetails && <DataTable data={selectedData} />}
                </div>
            )}

            <div className="mt-4">
                <button onClick={() => onToggleDataVisibility(id)} className="text-sm text-blue-400 hover:underline">
                    {isDataVisible ? 'Hide' : 'Show'} Full Data Table
                </button>
                {isDataVisible && (
                     <div className="mt-2 max-h-48 overflow-y-auto">
                        <DataTable data={dataForDisplay} />
                    </div>
                )}
            </div>
        </div>
    );
};
