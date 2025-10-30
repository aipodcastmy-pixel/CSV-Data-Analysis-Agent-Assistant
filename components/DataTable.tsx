
import React from 'react';
import { CsvData } from '../types';

interface DataTableProps {
    data: CsvData;
}

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
    if (!data || data.length === 0) {
        return <p className="text-gray-400">No data to display.</p>;
    }

    const headers = Object.keys(data[0]);
    
    // Check if value is a number and format it
    const formatValue = (value: string | number) => {
        if (typeof value === 'number') {
            return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return value;
    };

    return (
        <div className="w-full text-sm">
            <table className="w-full text-left">
                <thead className="bg-gray-700 text-gray-300">
                    <tr>
                        {headers.map(header => (
                            <th key={header} className="p-2 font-semibold">{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-gray-800">
                    {data.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-gray-700 last:border-b-0">
                            {headers.map(header => (
                                <td key={`${rowIndex}-${header}`} className="p-2 text-gray-400">
                                    {formatValue(row[header])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
