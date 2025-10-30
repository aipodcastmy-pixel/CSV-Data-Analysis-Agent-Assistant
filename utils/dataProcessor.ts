import { CsvData, CsvRow, AnalysisPlan, ColumnProfile, AggregationType, UnpivotPlan, CleaningPlan, CleaningRule } from '../types';

declare const Papa: any;

// CSV formula injection prevention
const sanitizeValue = (value: string): string => {
    if (typeof value === 'string' && value.startsWith('=')) {
        return `'${value}`;
    }
    return value;
};

const parseNumericValue = (value: any): number | null => {
    if (value === null || value === undefined || String(value).trim() === '') {
        return null;
    }
    const cleanedString = String(value)
        .replace(/[$€,]/g, '')
        .trim();
    
    const num = Number(cleanedString);
    return isNaN(num) ? null : num;
};

export const applyTopNWithOthers = (data: CsvData, groupByKey: string, valueKey: string, topN: number): CsvData => {
    if (data.length <= topN) {
        return data;
    }

    const sortedData = [...data].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));
    
    const topData = sortedData.slice(0, topN -1);
    const otherData = sortedData.slice(topN -1);

    if (otherData.length > 0) {
        const otherSum = otherData.reduce((acc, row) => acc + (Number(row[valueKey]) || 0), 0);
        const othersRow: CsvRow = {
            [groupByKey]: 'Others',
            [valueKey]: otherSum,
        };
        return [...topData, othersRow];
    }
    
    return topData;
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
        let numericCount = 0;
        
        for (const value of values) {
            const parsedNum = parseNumericValue(value);
            if (value !== null && String(value).trim() !== '') {
                if (parsedNum === null) {
                    isNumerical = false;
                    break;
                }
                numericCount++;
            }
        }

        if (isNumerical && numericCount > 0) {
            const numericValues = values.map(parseNumericValue).filter((v): v is number => v !== null);
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
                missingPercentage: (values.filter(v => v === null || String(v).trim() === '').length / data.length) * 100
             });
        }
    }
    return profiles;
};

export const unpivotData = (data: CsvData, plan: UnpivotPlan): CsvData => {
    const { indexColumns, valueColumns, variableColumnName, valueColumnName } = plan;
    const reshapedData: CsvData = [];

    data.forEach(row => {
        const baseObject: CsvRow = {};
        indexColumns.forEach(col => {
            baseObject[col] = row[col];
        });

        valueColumns.forEach(valueCol => {
            if (row.hasOwnProperty(valueCol)) {
                const newRow = { ...baseObject };
                newRow[variableColumnName] = valueCol;
                newRow[valueColumnName] = row[valueCol];
                reshapedData.push(newRow);
            }
        });
    });

    return reshapedData;
};

export const cleanData = (data: CsvData, plan: CleaningPlan): CsvData => {
    const { excludeRows } = plan;
    if (excludeRows.length === 0) return data;

    return data.filter(row => {
        for (const rule of excludeRows) {
            const cellValue = row[rule.column];
            if (cellValue === undefined || cellValue === null) continue;

            const cellValueStr = String(cellValue).trim().toLowerCase();
            
            if (rule.contains && cellValueStr.includes(rule.contains.toLowerCase())) return false; // Exclude if it matches
            if (rule.equals && cellValueStr === rule.equals.toLowerCase()) return false;
            if (rule.startsWith && cellValueStr.startsWith(rule.startsWith.toLowerCase())) return false;
        }
        return true; // Keep if no rules match
    });
};

export const executePlan = (data: CsvData, plan: AnalysisPlan): CsvData => {
    const { groupByColumn, valueColumn, aggregation } = plan;

    const groups: { [key: string]: number[] } = {};

    data.forEach(row => {
        const groupKey = String(row[groupByColumn]);
        if (groupKey === 'undefined' || groupKey === 'null') return; // Skip rows with no group key
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }

        if (valueColumn) {
            const value = parseNumericValue(row[valueColumn]);
            if (value !== null) {
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
                const sum = values.reduce((acc, val) => acc + val, 0);
                resultValue = values.length > 0 ? sum / values.length : 0;
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
