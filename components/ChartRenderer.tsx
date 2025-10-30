
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { ChartType, CsvRow } from '../types';

declare const Chart: any;
declare const ChartZoom: any;

export interface ChartRendererHandle {
    resetZoom: () => void;
}
interface ChartRendererProps {
    chartType: ChartType;
    data: CsvRow[];
    groupByKey: string;
    valueKey: string;
    selectedIndices: number[];
    onElementClick: (index: number, event: MouseEvent) => void;
    onZoomChange: (isZoomed: boolean) => void;
}

// Updated color palette for better distinction and accessibility (Tableau 10)
const COLORS = ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
const BORDER_COLORS = COLORS.map(c => `${c}B3`);
const BG_COLORS = COLORS.map(c => `${c}4D`);

const HIGHLIGHT_COLOR = '#3b82f6'; // blue-500
const HIGHLIGHT_BORDER_COLOR = '#2563eb'; // blue-600
const DESELECTED_COLOR = 'rgba(107, 114, 128, 0.2)';
const DESELECTED_BORDER_COLOR = 'rgba(107, 114, 128, 0.5)';

let zoomPluginRegistered = false;

export const ChartRenderer = forwardRef<ChartRendererHandle, ChartRendererProps>(({ chartType, data, groupByKey, valueKey, selectedIndices, onElementClick, onZoomChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    // Register zoom plugin globally but only once
    if (typeof Chart !== 'undefined' && typeof ChartZoom !== 'undefined' && !zoomPluginRegistered) {
        Chart.register(ChartZoom);
        zoomPluginRegistered = true;
    }

    useImperativeHandle(ref, () => ({
        resetZoom: () => {
            chartRef.current?.resetZoom();
        }
    }));

    useEffect(() => {
        if (!canvasRef.current) return;
        
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const labels = data.map(d => d[groupByKey]);
        const values = data.map(d => d[valueKey]);

        const hasSelection = selectedIndices.length > 0;
        
        const getColors = (baseColors: string[]) => hasSelection
            ? data.map((_, i) => selectedIndices.includes(i) ? HIGHLIGHT_COLOR : DESELECTED_COLOR)
            : baseColors;

        const getBorderColors = (baseColors: string[]) => hasSelection
            ? data.map((_, i) => selectedIndices.includes(i) ? HIGHLIGHT_BORDER_COLOR : DESELECTED_BORDER_COLOR)
            : baseColors;

        const isChartZoomedOrPanned = (chart: any) => {
            if (!chart || !chart.scales || !chart.scales.x) return false;
            // A bit of a hacky way to check for pan/zoom by comparing current scales to initial scales.
            // chart.getZoomLevel() > 1 works for zoom, but not for pan.
            const initialXScale = chart.getInitialScaleBounds().x;
            const currentXScale = { min: chart.scales.x.min, max: chart.scales.x.max };
            return initialXScale.min !== currentXScale.min || initialXScale.max !== currentXScale.max;
        };
        
        const commonOptions = {
            maintainAspectRatio: false,
            responsive: true,
            onClick: (event: MouseEvent, elements: any[]) => {
                if (elements.length > 0) {
                    onElementClick(elements[0].index, event);
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#d1d5db' 
                    }
                },
                tooltip: {
                    backgroundColor: '#374151', 
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#4b5563', 
                    borderWidth: 1,
                },
            },
            scales: {
                x: {
                    ticks: { 
                        color: '#9ca3af',
                        callback: function(value: number | string) {
                            const label = this.getLabelForValue(Number(value));
                            if (typeof label === 'string' && label.length > 30) {
                                return label.substring(0, 27) + '...';
                            }
                            return label;
                        }
                    },
                    grid: { color: '#374151' } 
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
                onPanComplete: ({ chart }: {chart: any}) => onZoomChange(isChartZoomedOrPanned(chart)),
             },
             zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                mode: 'xy',
                onZoomComplete: ({ chart }: {chart: any}) => onZoomChange(isChartZoomedOrPanned(chart)),
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
                            backgroundColor: getColors(BG_COLORS),
                            borderColor: getBorderColors(BORDER_COLORS),
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
                            borderColor: hasSelection ? DESELECTED_BORDER_COLOR : COLORS[0],
                            pointBackgroundColor: getColors([COLORS[0]]),
                            pointBorderColor: getBorderColors([BORDER_COLORS[0]]),
                            pointRadius: hasSelection ? 5 : 3,
                            pointHoverRadius: 7,
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
                            backgroundColor: getColors(BG_COLORS),
                            borderColor: getBorderColors(BORDER_COLORS),
                            borderWidth: 1,
                            offset: hasSelection ? data.map((_, i) => selectedIndices.includes(i) ? 20 : 0) : 0,
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

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };

    }, [chartType, data, groupByKey, valueKey, selectedIndices, onElementClick, onZoomChange]);


    return <canvas ref={canvasRef} />;
});
