
import { CsvData, CsvRow, AnalysisPlan, ColumnProfile, AggregationType } from '../types';

declare const Papa: any;

// CSV formula injection prevention
const sanitizeValue = (value: string): string => {
    if (typeof value === 'string' && value.startsWith('=')) {
        return `'${value}`;
    }
    return value;
};

export const processCsv = (file: File): Promise<CsvData> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: true,
            complete: (results: { data: CsvData }) => {
                const sanitizedData = results.data.map(row => {
                    const newRow: CsvRow = {};
                    for (const key in row) {
                        newRow[key] = sanitizeValue(String(row[key]));
                    }
                    return newRow;
                });
                resolve(sanitizedData);
            },
            error: (error: Error) => {
                reject(error);
            },
        });
    });
};

export const profileData = (data: CsvData): ColumnProfile[] => {
    if (data.length === 0) return [];
    const headers = Object.keys(data[0]);
    const profiles: ColumnProfile[] = [];

    for (const header of headers) {
        let isNumerical = true;
        const values = data.map(row => row[header]);
        
        for (const value of values) {
            if (value === null || value === '') continue;
            if (isNaN(Number(value))) {
                isNumerical = false;
                break;
            }
        }

        if (isNumerical) {
            const numericValues = values.map(Number).filter(v => !isNaN(v));
            profiles.push({
                name: header,
                type: 'numerical',
                valueRange: [Math.min(...numericValues), Math.max(...numericValues)],
                missingPercentage: (1 - (numericValues.length / data.length)) * 100,
            });
        } else {
             const uniqueValues = new Set(values.map(String));
             profiles.push({
                name: header,
                type: 'categorical',
                uniqueValues: uniqueValues.size,
                missingPercentage: (values.filter(v => v === null || v === '').length / data.length) * 100
             });
        }
    }
    return profiles;
};

export const executePlan = (data: CsvData, plan: AnalysisPlan): CsvData => {
    const { groupByColumn, valueColumn, aggregation } = plan;

    const groups: { [key: string]: number[] } = {};

    data.forEach(row => {
        const groupKey = String(row[groupByColumn]);
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        if (valueColumn) {
            const value = Number(row[valueColumn]);
            if (!isNaN(value)) {
                groups[groupKey].push(value);
            }
        } else if (aggregation === 'count') {
            // For count, just push a placeholder
            groups[groupKey].push(1);
        }
    });

    const aggregatedResult: CsvData = [];

    for (const key in groups) {
        const values = groups[key];
        let resultValue: number;

        switch (aggregation) {
            case 'sum':
                resultValue = values.reduce((acc, val) => acc + val, 0);
                break;
            case 'count':
                resultValue = values.length;
                break;
            case 'avg':
                resultValue = values.reduce((acc, val) => acc + val, 0) / (values.length || 1);
                break;
            default:
                throw new Error(`Unsupported aggregation type: ${aggregation}`);
        }
        
        const finalValueColumn = valueColumn || 'count';

        aggregatedResult.push({
            [groupByColumn]: key,
            [finalValueColumn]: resultValue,
        });
    }
    
    // Sort by value descending
    const finalValueColumn = valueColumn || 'count';
    return aggregatedResult.sort((a, b) => (Number(b[finalValueColumn]) || 0) - (Number(a[finalValueColumn]) || 0));
};
