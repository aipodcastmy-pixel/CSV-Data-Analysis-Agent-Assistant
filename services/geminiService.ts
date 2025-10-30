import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisPlan, CsvData, ColumnProfile, AnalysisCardData } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.warn("API_KEY environment variable not set. AI features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

const planSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (must be a categorical column).' },
      valueColumn: { type: Type.STRING, description: 'The column to apply the aggregation on (must be a numerical column). Not needed for "count".' },
    },
    required: ['chartType', 'title', 'description', 'aggregation', 'groupByColumn'],
  },
};

export const generateAnalysisPlans = async (
    columns: ColumnProfile[], 
    sampleData: CsvData,
    userPrompt?: string,
    numPlans: number = 4
): Promise<AnalysisPlan[]> => {
    if (!API_KEY) return [];

    const categoricalCols = columns.filter(c => c.type === 'categorical').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical').map(c => c.name);

    const prompt = `
        You are an expert data analyst. Your task is to generate insightful analysis plans for a given dataset.
        
        Dataset columns:
        - Categorical: ${categoricalCols.join(', ')}
        - Numerical: ${numericalCols.join(', ')}
        
        Sample Data (first 5 rows):
        ${JSON.stringify(sampleData, null, 2)}
        
        ${userPrompt ? `Based on the user's request: "${userPrompt}"` : ''}

        Please generate ${numPlans} diverse and meaningful analysis plan(s). 
        Focus on creating standard business intelligence visualizations. For example, summing sales by region, counting customers by month, or averaging scores by team.
        - For 'count' aggregations, you do not need a valueColumn.
        - For 'sum' and 'avg', you must specify a valueColumn from the numerical columns.
        - The groupByColumn must be from the categorical columns.
        - Do not create plans that are too granular or have too many groups (e.g., grouping by a unique ID).
        
        Your response must be a valid JSON array of plan objects, adhering to the provided schema. Do not include any other text or explanations.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: planSchema,
            },
        });

        const jsonStr = response.text.trim();
        const plans = JSON.parse(jsonStr);

        // Basic validation
        return plans.filter((p: any) => 
            p.chartType && p.title && p.aggregation && p.groupByColumn
        );
    } catch (error) {
        console.error("Error generating analysis plans:", error);
        throw new Error("Failed to generate analysis plans from AI.");
    }
};

export const generateSummary = async (title: string, data: CsvData): Promise<string> => {
     if (!API_KEY) return 'AI Summaries are disabled. No API Key provided.';

    const prompt = `
        You are a business intelligence analyst.
        The following data is for a chart titled "${title}".
        Data:
        ${JSON.stringify(data.slice(0, 10), null, 2)} 
        ${data.length > 10 ? `(...and ${data.length - 10} more rows)` : ''}

        Provide a concise, insightful summary in two languages, separated by '---'.
        Format: English Summary --- Mandarin Summary

        The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning.
        For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."
        Your response must be only the summary text in the specified format.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating summary:", error);
        return "Failed to generate AI summary.";
    }
};

export const generateFinalSummary = async (cards: AnalysisCardData[]): Promise<string> => {
    if (!API_KEY) return 'AI Summaries are disabled. No API Key provided.';

    const summaries = cards.map(card => `Chart Title: ${card.plan.title}\nSummary: ${card.summary.split('---')[0]}`).join('\n\n');

    const prompt = `
        You are a senior business strategist. You have been provided with several automated data analyses.
        Your task is to synthesize these individual findings into a single, high-level executive summary.

        Here are the individual analysis summaries:
        ${summaries}

        Please provide a concise, overarching summary that connects the dots between these analyses. 
        Identify the most critical business insights, potential opportunities, or risks revealed by the data as a whole.
        Do not just repeat the individual summaries. Create a new, synthesized narrative.
        Your response should be a single paragraph of insightful business analysis.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', // Using a more powerful model for better synthesis
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating final summary:", error);
        return "Failed to generate the final AI summary.";
    }
}