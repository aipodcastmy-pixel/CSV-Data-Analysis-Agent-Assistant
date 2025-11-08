import React, { useState, useMemo, useEffect } from 'react';
import { CsvData, SortConfig, CsvRow } from '../types';
import { SpreadsheetTable } from './SpreadsheetTable';
import { useAppStore } from '../store/useAppStore';
import { executeJavaScriptFilter } from '../utils/dataProcessor';

interface SpreadsheetPanelProps {
    isVisible: boolean;
}

const SearchIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

const AiIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const CloseIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


export const SpreadsheetPanel: React.FC<SpreadsheetPanelProps> = ({ isVisible }) => {
    const {
        csvData,
        spreadsheetFilterFunction,
        aiFilterExplanation,
        isAiFiltering,
        handleNaturalLanguageQuery,
        clearAiFilter,
    } = useAppStore(state => ({
        csvData: state.csvData,
        spreadsheetFilterFunction: state.spreadsheetFilterFunction,
        aiFilterExplanation: state.aiFilterExplanation,
        isAiFiltering: state.isAiFiltering,
        handleNaturalLanguageQuery: state.handleNaturalLanguageQuery,
        clearAiFilter: state.clearAiFilter,
    }));
    const onToggleVisibility = () => useAppStore.getState().setIsSpreadsheetVisible(!isVisible);

    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [filterText, setFilterText] = useState('');
    
    const headers = useMemo(() => csvData?.data.length > 0 ? Object.keys(csvData.data[0]) : [], [csvData?.data]);
    const [columnWidths, setColumnWidths] = useState<{[key: string]: number}>({});

    useEffect(() => {
        if (!csvData) return;
        const initialWidths: {[key: string]: number} = {};
        headers.forEach(h => {
            const headerLength = h.length * 8 + 30; // Estimate width based on text
            const sampleDataLength = String(csvData.data[0]?.[h] || '').length * 7;
            initialWidths[h] = Math.max(120, headerLength, sampleDataLength);
        });
        setColumnWidths(initialWidths);
    }, [headers, csvData]);


    const handleSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleColumnResizeStart = (header: string, e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = columnWidths[header];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = startWidth + (moveEvent.clientX - startX);
            if (newWidth > 60) { // Min width
                setColumnWidths(prev => ({ ...prev, [header]: newWidth }));
            }
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };

        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleQuerySubmit = () => {
        if (filterText.trim()) {
            handleNaturalLanguageQuery(filterText.trim());
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleQuerySubmit();
        }
    };

    const processedData = useMemo(() => {
        if (!csvData) return [];
        let dataToProcess: CsvRow[] = [...csvData.data];

        // AI Filtering
        if (spreadsheetFilterFunction) {
            try {
                dataToProcess = executeJavaScriptFilter(dataToProcess, spreadsheetFilterFunction);
            } catch (error) {
                console.error("AI filter execution failed:", error);
                // Maybe show an error to the user in a future version
            }
        }
        // Simple text filtering
        else if (filterText) {
            const lowercasedFilter = filterText.toLowerCase();
            dataToProcess = dataToProcess.filter(row =>
                Object.values(row).some(value =>
                    String(value).toLowerCase().includes(lowercasedFilter)
                )
            );
        }

        // Sorting
        if (sortConfig !== null) {
            dataToProcess.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
                
                // Prioritize numeric sorting
                const numA = typeof aValue === 'number' ? aValue : parseFloat(String(aValue).replace(/[^0-9.-]+/g,""));
                const numB = typeof bValue === 'number' ? bValue : parseFloat(String(bValue).replace(/[^0-9.-]+/g,""));

                if (!isNaN(numA) && !isNaN(numB)) {
                     return sortConfig.direction === 'ascending' ? numA - numB : numB - numA;
                }
                
                const strA = String(aValue).toLowerCase();
                const strB = String(bValue).toLowerCase();

                if (strA < strB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (strA > strB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }

        return dataToProcess;
    }, [csvData, sortConfig, filterText, spreadsheetFilterFunction]);
    
    if (!csvData) return null;

    return (
        <div id="raw-data-explorer" className="bg-white rounded-lg shadow-lg flex flex-col transition-all duration-300 border border-slate-200">
            <button
                onClick={onToggleVisibility}
                className="flex justify-between items-center p-4 cursor-pointer w-full text-left rounded-t-lg hover:bg-slate-50"
                aria-expanded={isVisible}
            >
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Raw Data Explorer</h3>
                    <p className="text-sm text-slate-500">File: {csvData.fileName}</p>
                </div>
                <ChevronIcon isOpen={isVisible} />
            </button>
            
            {isVisible && (
                <div className="flex flex-col h-full p-4 pt-0">
                    <div className="flex items-center space-x-2 mb-2">
                        <div className="relative flex-grow">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon />
                            </div>
                            <input
                                type="text"
                                placeholder="Search table or ask AI (e.g., 'show rows where column_3 > 100')"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="bg-white border border-slate-300 rounded-md py-1.5 pl-10 pr-4 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                            />
                        </div>
                        <button 
                            onClick={handleQuerySubmit}
                            disabled={isAiFiltering || !filterText.trim()}
                            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
                            title="Use AI to filter data based on your query"
                        >
                            {isAiFiltering ? <LoadingSpinner /> : <AiIcon />}
                            <span>Ask AI</span>
                        </button>
                    </div>

                    {aiFilterExplanation && (
                        <div className="bg-blue-50 text-blue-800 border border-blue-200 rounded-md p-2 text-sm flex justify-between items-center mb-2">
                            <p>
                                <span className="font-semibold">AI Filter:</span> {aiFilterExplanation}
                            </p>
                            <button onClick={clearAiFilter} className="p-1 rounded-full hover:bg-blue-200" title="Clear AI filter">
                                <CloseIcon />
                            </button>
                        </div>
                    )}

                    <div className="flex-grow overflow-auto border border-slate-200 rounded-md" style={{maxHeight: '60vh'}}>
                         <SpreadsheetTable 
                            data={processedData}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            columnWidths={columnWidths}
                            onColumnResizeStart={handleColumnResizeStart}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};