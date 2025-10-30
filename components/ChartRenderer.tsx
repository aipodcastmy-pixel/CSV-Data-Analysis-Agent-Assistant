import React, { useEffect, useRef } from 'react';
import { ChartType, CsvData } from '../types';

declare const Chart: any;
declare const ChartZoom: any;

interface ChartRendererProps {
    chartType: ChartType;
    data: CsvData;
    groupByKey: string;
    valueKey: string;
}

const COLORS = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981', '#ef4444'];
const BORDER_COLORS = COLORS.map(c => `${c}B3`);
const BG_COLORS = COLORS.map(c => `${c}4D`);

let zoomPluginRegistered = false;

export const ChartRenderer: React.FC<ChartRendererProps> = ({ chartType, data, groupByKey, valueKey }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    // Register zoom plugin globally but only once
    if (typeof Chart !== 'undefined' && typeof ChartZoom !== 'undefined' && !zoomPluginRegistered) {
        Chart.register(ChartZoom);
        zoomPluginRegistered = true;
    }

    useEffect(() => {
        if (!canvasRef.current) return;
        
        // Destroy previous chart instance if it exists
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const labels = data.map(d => d[groupByKey]);
        const values = data.map(d => d[valueKey]);
        
        const commonOptions = {
            maintainAspectRatio: false,
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#d1d5db' // text-gray-300
                    }
                },
                tooltip: {
                    backgroundColor: '#374151', // bg-gray-700
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb', // text-gray-200
                    borderColor: '#4b5563', // border-gray-600
                    borderWidth: 1,
                },
            },
            scales: {
                x: {
                    ticks: { color: '#9ca3af' }, // text-gray-400
                    grid: { color: '#374151' } // bg-gray-700
                },
                y: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#374151' }
                }
            }
        };

        const zoomOptions = {
             pan: {
                enabled: true,
                mode: 'xy',
             },
             zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'xy',
             }
        };


        switch (chartType) {
            case 'bar':
                chartRef.current = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: valueKey,
                            data: values,
                            backgroundColor: BG_COLORS,
                            borderColor: BORDER_COLORS,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        ...commonOptions,
                        plugins: { ...commonOptions.plugins, zoom: zoomOptions }
                    }
                });
                break;
            case 'line':
                chartRef.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [{
                            label: valueKey,
                            data: values,
                            fill: false,
                            borderColor: COLORS[0],
                            tension: 0.1
                        }]
                    },
                    options: {
                        ...commonOptions,
                        plugins: { ...commonOptions.plugins, zoom: zoomOptions }
                    }
                });
                break;
            case 'pie':
                chartRef.current = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels,
                        datasets: [{
                            label: valueKey,
                            data: values,
                            backgroundColor: BG_COLORS,
                            borderColor: BORDER_COLORS,
                            borderWidth: 1
                        }]
                    },
                    options: {
                        ...commonOptions,
                        scales: { x: { display: false }, y: { display: false } }
                    }
                });
                break;
            default:
                break;
        }

        // Cleanup function
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };

    }, [chartType, data, groupByKey, valueKey]);


    return <canvas ref={canvasRef} />;
};