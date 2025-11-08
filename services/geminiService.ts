// This service now handles both Google Gemini and OpenAI models.
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import OpenAI from 'openai';
import { AnalysisPlan, CsvData, ColumnProfile, AnalysisCardData, AiChatResponse, ChatMessage, Settings, DataPreparationPlan, CardContext, CsvRow, AppView, AggregationType } from '../types';
import { executePlan } from "../utils/dataProcessor";
import {
    createDataPreparationPrompt,
    createCandidatePlansPrompt,
    createRefinePlansPrompt,
    createSummaryPrompt,
    createCoreAnalysisPrompt,
    createProactiveInsightPrompt,
    createFinalSummaryPrompt,
    createChatPrompt,
} from './promptTemplates';

const ALLOWED_AGGREGATIONS: Set<AggregationType> = new Set(['sum', 'count', 'avg']);

// Helper for retrying API calls
const withRetry = async <T>(fn: () => Promise<T>, retries = 2): Promise<T> => {
    let lastError: Error | undefined;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            console.warn(`API call failed, retrying... (${i + 1}/${retries})`, error);
            // Optional: add a small delay before retrying
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 500));
            }
        }
    }
    throw lastError;
};

// Helper to validate a plan object from the AI
const isValidPlan = (plan: any): plan is AnalysisPlan => {
    if (!plan || typeof plan !== 'object' || !plan.chartType || !plan.title) {
        console.warn('Skipping invalid plan: missing chartType or title.', plan);
        return false;
    }
    if (plan.chartType === 'scatter') {
        if (!plan.xValueColumn || !plan.yValueColumn) {
            console.warn('Skipping invalid scatter plot plan: missing xValueColumn or yValueColumn.', plan);
            return false;
        }
    } else {
        if (!plan.aggregation || !plan.groupByColumn) {
            console.warn(`Skipping invalid plan: missing aggregation or groupByColumn for chart type ${plan.chartType}.`, plan);
            return false;
        }
        if (!ALLOWED_AGGREGATIONS.has(plan.aggregation)) {
            console.warn(`Skipping invalid plan: unsupported aggregation type "${plan.aggregation}".`, plan);
            return false;
        }
        if (plan.aggregation !== 'count' && !plan.valueColumn) {
            console.warn('Skipping invalid plan: missing valueColumn for sum/avg aggregation.', plan);
            return false;
        }
    }
    return true;
};

/**
 * Parses a string that is expected to contain a JSON array, but might be malformed.
 * Handles cases where the array is wrapped in markdown, is inside an object, or is just a single object.
 * @param responseText The raw text response from the AI.
 * @returns A parsed array of objects.
 */
const robustlyParseJsonArray = (responseText: string): any[] => {
    let content = responseText.trim();

    // 1. Try to extract JSON from markdown code blocks
    const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        content = markdownMatch[1];
    }

    try {
        const resultObject = JSON.parse(content);

        // Case 1: The result is already an array.
        if (Array.isArray(resultObject)) {
            return resultObject;
        }

        if (typeof resultObject === 'object' && resultObject !== null) {
            // Case 2: The result is an object containing an array.
            // Find the first value that is an array and return it.
            const nestedArray = Object.values(resultObject).find(v => Array.isArray(v));
            if (nestedArray && Array.isArray(nestedArray)) {
                return nestedArray;
            }
            
            // Case 3: The result is a single plan object, not in an array.
            if ('chartType' in resultObject && 'title' in resultObject) {
                return [resultObject];
            }
        }
    } catch (e) {
        console.error("Failed to parse AI response as JSON:", e, "Content:", content);
        throw new Error(`AI response could not be parsed as JSON. Content starts with: "${content.substring(0, 150)}..."`);
    }

    throw new Error("Response did not contain a recognizable JSON array or object of plans.");
};


const planSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply. Omit for scatter plots.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (categorical). Omit for scatter plots.' },
      valueColumn: { type: Type.STRING, description: 'The column for aggregation (numerical). Not needed for "count".' },
      xValueColumn: { type: Type.STRING, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
      yValueColumn: { type: Type.STRING, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
      defaultTopN: { type: Type.INTEGER, description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
      defaultHideOthers: { type: Type.BOOLEAN, description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    },
    required: ['chartType', 'title', 'description'],
  },
};

const columnProfileSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "The column name." },
        type: { type: Type.STRING, enum: ['numerical', 'categorical', 'date', 'time', 'currency', 'percentage'], description: "The data type of the column. Identify specific types like 'date', 'currency', etc., where possible." },
    },
    required: ['name', 'type'],
};

const dataPreparationSchema = {
    type: Type.OBJECT,
    properties: {
        explanation: { type: Type.STRING, description: "A brief, user-facing explanation of the transformations that will be applied to the data (e.g., 'Removed 3 summary rows and reshaped the data from a cross-tab format')." },
        jsFunctionBody: {
            type: Type.STRING,
            description: "The body of a JavaScript function that takes two arguments `data` (an array of objects) and `_util` (a helper object) and returns the transformed array of objects. This code will be executed to clean and reshape the data. If no transformation is needed, this should be null."
        },
        outputColumns: {
            type: Type.ARRAY,
            description: "A list of column profiles describing the structure of the data AFTER the transformation. If no transformation is performed, this should be the same as the input column profiles.",
            items: columnProfileSchema,
        },
    },
    required: ['explanation', 'outputColumns']
};

export const generateDataPreparationPlan = async (
    columns: ColumnProfile[],
    sampleData: CsvData['data'],
    settings: Settings
): Promise<DataPreparationPlan> => {
    
    let lastError: Error | undefined;

    for(let i=0; i < 3; i++) { // Self-correction loop: 1 initial attempt + 2 retries
        try {
            let jsonStr: string;
            const promptContent = createDataPreparationPrompt(columns, sampleData, lastError);

            if (settings.provider === 'openai') {
                if (!settings.openAIApiKey) return { explanation: "No transformation needed as API key is not set.", jsFunctionBody: null, outputColumns: columns };
                const systemPrompt = "You are an expert data engineer. Your task is to analyze a raw dataset and, if necessary, provide a JavaScript function to clean and reshape it into a tidy, analysis-ready format. CRITICALLY, you must also provide the schema of the NEW, transformed data with detailed data types.\nYou MUST respond with a single valid JSON object, and nothing else. The JSON object must adhere to the provided schema.";
                
                const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
                // FIX: Explicitly type the response from the OpenAI API call.
                const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
                    model: settings.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: promptContent }
                    ],
                    response_format: { type: 'json_object' }
                }));

                if (!response.choices[0].message.content) {
                    throw new Error("OpenAI returned an empty response.");
                }
                jsonStr = response.choices[0].message.content;

            } else { // Google Gemini
                // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const prompt = `${promptContent}\nYour response must be a valid JSON object adhering to the provided schema.`;

                const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                    model: settings.model,
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: dataPreparationSchema,
                    },
                }));
                jsonStr = response.text.trim();
            }
            
            const plan = JSON.parse(jsonStr) as DataPreparationPlan;

            // Test execution before returning
            if (plan.jsFunctionBody) {
                try {
                    // This is a mock execution to validate syntax, the real one happens in dataProcessor
                    const mockUtil = { 
                        parseNumber: (v: any) => parseFloat(String(v).replace(/[$,%]/g, '')) || 0,
                        splitNumericString: (v: string) => v.split(','), // Simple mock
                    };
                    const transformFunction = new Function('data', '_util', plan.jsFunctionBody);
                    const sampleResult = transformFunction(sampleData, mockUtil);
                    if (!Array.isArray(sampleResult)) {
                        throw new Error("Generated function did not return an array.");
                    }
                    return plan; // Success
                } catch (e) {
                    lastError = e as Error;
                    console.warn(`AI self-correction attempt ${i + 1} failed due to JS execution error. Retrying...`, lastError);
                    continue; // Go to next iteration of the loop to ask AI to fix code
                }
            }
            // If no code, ensure output columns match input columns if AI forgot.
            if (!plan.jsFunctionBody && (!plan.outputColumns || plan.outputColumns.length === 0)) {
                plan.outputColumns = columns;
            }
            return plan; // No function body, success.
        
        } catch (error) {
            console.error(`Error in data preparation plan generation (Attempt ${i+1}):`, error);
            lastError = error as Error;
        }
    }

    throw new Error(`AI failed to generate a valid data preparation plan after multiple attempts. Last error: ${lastError?.message}`);
};

const generateCandidatePlans = async (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    numPlans: number
): Promise<AnalysisPlan[]> => {
    const categoricalCols = columns.filter(c => c.type === 'categorical' || c.type === 'date' || c.type === 'time').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage').map(c => c.name);
    
    let plans: AnalysisPlan[];
    const promptContent = createCandidatePlansPrompt(categoricalCols, numericalCols, sampleData, numPlans);

    if (settings.provider === 'openai') {
        const systemPrompt = `You are a senior business intelligence analyst specializing in ERP and financial data. Your task is to generate a diverse list of insightful analysis plan candidates for a given dataset by identifying common data patterns.
You MUST respond with a single valid JSON object with a single key "plans" that contains an array of plan objects, and nothing else. The JSON object must adhere to the provided schema.`;

        const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
        // FIX: Explicitly type the response from the OpenAI API call.
        const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
            model: settings.model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
            response_format: { type: 'json_object' }
        }));
        
        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error("OpenAI returned an empty response.");
        }
        
        plans = robustlyParseJsonArray(content);
    
    } else { // Google Gemini
        // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `${promptContent}\nYour response must be a valid JSON array of plan objects. Do not include any other text or explanations.`;
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: planSchema,
            },
        }));
        plans = robustlyParseJsonArray(response.text.trim());
    }

    return plans.filter(isValidPlan);
};

// Helper function for the second step: the AI Quality Gate
const refineAndConfigurePlans = async (
    plansWithData: { plan: AnalysisPlan; aggregatedSample: CsvRow[] }[],
    settings: Settings
): Promise<AnalysisPlan[]> => {
    let rawPlans: any[];
    const promptContent = createRefinePlansPrompt(plansWithData);

    if(settings.provider === 'openai') {
        const systemPrompt = `You are a Quality Review Data Analyst. Your job is to review a list of proposed analysis plans and their data samples. Your goal is to select ONLY the most insightful and readable charts for the end-user, and configure them for the best default view.
You MUST respond with a single valid JSON object with a single key "plans" that contains an array of ONLY the good, configured plan objects. Do not include the discarded plans. The JSON object must adhere to the provided schema.`;
        
        const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
        // FIX: Explicitly type the response from the OpenAI API call.
        const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
            model: settings.model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
            response_format: { type: 'json_object' }
        }));
        
        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error("OpenAI returned an empty response.");
        }
        
        rawPlans = robustlyParseJsonArray(content);

    } else { // Google Gemini
        // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const prompt = `${promptContent}\nYour response must be a valid JSON array of the refined and configured plan objects, adhering to the provided schema. Do not include any other text or explanations.`;
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: planSchema,
            },
        }));
        rawPlans = robustlyParseJsonArray(response.text.trim());
    }
    
    // FIX: Normalize the AI's response. The AI sometimes returns the full { plan, aggregatedSample }
    // object instead of just the plan. This extracts the `plan` object if it exists.
    const normalizedPlans = rawPlans.map(p => {
        if (p && p.plan && typeof p.plan === 'object') {
            return p.plan;
        }
        return p;
    });

    return normalizedPlans.filter(isValidPlan);
};


export const generateAnalysisPlans = async (
    columns: ColumnProfile[], 
    sampleData: CsvData['data'],
    settings: Settings
): Promise<AnalysisPlan[]> => {
    // Fix: Update API key check logic. For Google, assume key is present via env vars.
    const isApiKeySet = settings.provider === 'google' || !!settings.openAIApiKey;
    if (!isApiKeySet) throw new Error("API Key not provided.");

    try {
        // Step 1: Generate a broad list of candidate plans (already validated inside the function)
        const candidatePlans = await generateCandidatePlans(columns, sampleData, settings, 12);
        if (candidatePlans.length === 0) return [];

        // Step 2: Execute plans on sample data to get data for the AI to review
        const sampleCsvData = { fileName: 'sample', data: sampleData };
        const plansWithDataForReview = candidatePlans.map(plan => {
            try {
                const aggregatedSample = executePlan(sampleCsvData, plan);
                // A plan is only viable for review if it produces data.
                if (aggregatedSample.length > 0) {
                    return { plan, aggregatedSample: aggregatedSample.slice(0, 20) }; // Limit sample size for the prompt
                }
                return null;
            } catch (e) {
                // This catch is a safeguard, but isValidPlan should prevent most errors.
                console.warn(`Execution of plan "${plan.title}" failed during review stage:`, e);
                return null;
            }
        }).filter((p): p is { plan: AnalysisPlan; aggregatedSample: CsvRow[] } => p !== null);
        
        if (plansWithDataForReview.length === 0) {
            console.warn("No candidate plans produced data for AI review, returning initial valid candidates.");
            return candidatePlans.slice(0, 4);
        }
        
        // Step 3: AI Quality Gate - Ask AI to review and refine the plans (already validated inside the function)
        const refinedPlans = await refineAndConfigurePlans(plansWithDataForReview, settings);

        // Ensure we have a minimum number of plans
        let finalPlans = refinedPlans;
        if (finalPlans.length < 4 && candidatePlans.length > finalPlans.length) {
            const refinedPlanTitles = new Set(finalPlans.map(p => p.title));
            const fallbackPlans = candidatePlans.filter(p => !refinedPlanTitles.has(p.title));
            const needed = 4 - finalPlans.length;
            finalPlans.push(...fallbackPlans.slice(0, needed));
        }

        return finalPlans.slice(0, 12); // Return between 4 and 12 of the best plans

    } catch (error) {
        console.error("Error during two-step analysis plan generation:", error);
        // Fallback to simpler generation if the complex one fails
        try {
            return await generateCandidatePlans(columns, sampleData, settings, 8);
        } catch (fallbackError) {
             console.error("Fallback plan generation also failed:", fallbackError);
             throw new Error("Failed to generate any analysis plans from AI.");
        }
    }
};


export const generateSummary = async (title: string, data: CsvData['data'], settings: Settings): Promise<string> => {
    // Fix: Update API key check logic. For Google, assume key is present via env vars.
    const isApiKeySet = settings.provider === 'google' || !!settings.openAIApiKey;
    if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';
    
    try {
        const promptContent = createSummaryPrompt(title, data, settings.language);
        if (settings.provider === 'openai') {
            const systemPrompt = `You are a business intelligence analyst. Your response must be only the summary text in the specified format. The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning. For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."`;

            const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
            // FIX: Explicitly type the response from the OpenAI API call.
            const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
            }));
            return response.choices[0].message.content || 'No summary generated.';

        } else { // Google Gemini
            // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `${promptContent}\nYour response must be only the summary text in the specified format.`;

            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model,
                contents: prompt,
            }));
            return response.text;
        }
    } catch (error) {
        console.error("Error generating summary:", error);
        return "Failed to generate AI summary.";
    }
};

// NEW: Function for the AI to create its core analysis summary (transparent thinking)
export const generateCoreAnalysisSummary = async (cardContext: CardContext[], columns: ColumnProfile[], settings: Settings): Promise<string> => {
    // Fix: Update API key check logic. For Google, assume key is present via env vars.
    const isApiKeySet = settings.provider === 'google' || !!settings.openAIApiKey;
    if (!isApiKeySet || cardContext.length === 0) return "Could not generate an initial analysis summary.";

    try {
        const promptContent = createCoreAnalysisPrompt(cardContext, columns, settings.language);
        if (settings.provider === 'openai') {
            const systemPrompt = `You are a senior data analyst. After performing an initial automated analysis of a dataset, your task is to create a concise "Core Analysis Briefing". This briefing will be shown to the user and will serve as the shared foundation of understanding for your conversation.
Your briefing should cover:
1.  **Primary Subject**: What is this data fundamentally about? (e.g., "This dataset appears to be about online sales transactions...")
2.  **Key Metrics**: What are the most important numerical columns? (e.g., "...where the key metrics are 'Sale_Amount' and 'Profit'.")
3.  **Core Dimensions**: What are the main categorical columns used for analysis? (e.g., "The data is primarily broken down by 'Region' and 'Product_Category'.")
4.  **Suggested Focus**: Based on the initial charts, what should be the focus of further analysis? (e.g., "Future analysis should focus on identifying the most profitable regions and product categories.")
Produce a single, concise paragraph in ${settings.language}. This is your initial assessment that you will share with your human counterpart.`;
            
            const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
            // FIX: Explicitly type the response from the OpenAI API call.
            const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
            }));
            return response.choices[0].message.content || 'No summary generated.';

        } else { // Google Gemini
            // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model,
                contents: promptContent,
            }));
            return response.text;
        }
    } catch (error) {
        console.error("Error generating core analysis summary:", error);
        return "An error occurred while the AI was forming its initial analysis.";
    }
};

const proactiveInsightSchema = {
    type: Type.OBJECT,
    properties: {
        insight: { type: Type.STRING, description: "A concise, user-facing message describing the single most important finding." },
        cardId: { type: Type.STRING, description: "The ID of the card where this insight was observed." },
    },
    required: ['insight', 'cardId'],
};

export const generateProactiveInsights = async (cardContext: CardContext[], settings: Settings): Promise<{ insight: string; cardId: string; } | null> => {
    // Fix: Update API key check logic. For Google, assume key is present via env vars.
    const isApiKeySet = settings.provider === 'google' || !!settings.openAIApiKey;
    if (!isApiKeySet || cardContext.length === 0) return null;

    try {
        let jsonStr: string;
        const promptContent = createProactiveInsightPrompt(cardContext, settings.language);

        if (settings.provider === 'openai') {
             const systemPrompt = `You are a proactive data analyst. Review the following summaries of data visualizations. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications. Your response must be a single JSON object with 'insight' and 'cardId' keys.`;
            
            const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
            // FIX: Explicitly type the response from the OpenAI API call.
            const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
                response_format: { type: 'json_object' }
            }));
            
            const content = response.choices[0].message.content;
            if (!content) {
                throw new Error("OpenAI returned an empty response.");
            }
            jsonStr = content;
        
        } else { // Google Gemini
            // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `${promptContent}\nYour response must be a valid JSON object adhering to the provided schema.`;

            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: proactiveInsightSchema,
                },
            }));
            jsonStr = response.text.trim();
        }
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Error generating proactive insight:", error);
        return null;
    }
};


export const generateFinalSummary = async (cards: AnalysisCardData[], settings: Settings): Promise<string> => {
    // Fix: Update API key check logic. For Google, assume key is present via env vars.
    const isApiKeySet = settings.provider === 'google' || !!settings.openAIApiKey;
    if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';

    const summaries = cards.map(card => {
        const summaryText = card.summary.split('---')[0]; // Prioritize the first language part of the summary
        return `Chart Title: ${card.plan.title}\nSummary: ${summaryText}`;
    }).join('\n\n');
    
    try {
        const promptContent = createFinalSummaryPrompt(summaries, settings.language);
        if (settings.provider === 'openai') {
            const systemPrompt = `You are a senior business strategist. You have been provided with several automated data analyses.
Your task is to synthesize these individual findings into a single, high-level executive summary in ${settings.language}.
Please provide a concise, overarching summary that connects the dots between these analyses. 
Identify the most critical business insights, potential opportunities, or risks revealed by the data as a whole.
Do not just repeat the individual summaries. Create a new, synthesized narrative.
Your response should be a single paragraph of insightful business analysis.`;
            
            const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
            // FIX: Explicitly type the response from the OpenAI API call.
            const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
            }));
            return response.choices[0].message.content || 'No final summary generated.';

        } else { // Google Gemini
            // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model,
                contents: promptContent,
            }));
            return response.text;
        }
    } catch (error) {
        console.error("Error generating final summary:", error);
        return "Failed to generate the final AI summary.";
    }
}

const singlePlanSchema = {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply. Omit for scatter plots.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (categorical). Omit for scatter plots.' },
      valueColumn: { type: Type.STRING, description: 'The column for aggregation (numerical). Not needed for "count".' },
      xValueColumn: { type: Type.STRING, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
      yValueColumn: { type: Type.STRING, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
      defaultTopN: { type: Type.INTEGER, description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
      defaultHideOthers: { type: Type.BOOLEAN, description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    },
    required: ['chartType', 'title', 'description'],
};


const multiActionChatResponseSchema = {
    type: Type.OBJECT,
    properties: {
        actions: {
            type: Type.ARRAY,
            description: "A sequence of actions for the assistant to perform.",
            items: {
                type: Type.OBJECT,
                properties: {
                    thought: { type: Type.STRING, description: "The AI's reasoning or thought process before performing the action. This explains *why* this action is being taken. This is a mandatory part of the ReAct pattern." },
                    responseType: { type: Type.STRING, enum: ['text_response', 'plan_creation', 'dom_action', 'execute_js_code', 'proceed_to_analysis'] },
                    text: { type: Type.STRING, description: "A conversational text response to the user. Required for 'text_response'." },
                    cardId: { type: Type.STRING, description: "Optional. The ID of the card this text response refers to. Used to link text to a specific chart." },
                    plan: {
                        ...singlePlanSchema,
                        description: "Analysis plan object. Required for 'plan_creation'."
                    },
                    domAction: {
                        type: Type.OBJECT,
                        description: "A DOM manipulation action for the frontend to execute. Required for 'dom_action'.",
                        properties: {
                            toolName: { type: Type.STRING, enum: ['highlightCard', 'changeCardChartType', 'showCardData', 'filterCard'] },
                            args: {
                                type: Type.OBJECT,
                                description: 'Arguments for the tool. e.g., { cardId: "..." }',
                                properties: {
                                    cardId: { type: Type.STRING, description: 'The ID of the target analysis card.' },
                                    newType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'], description: "For 'changeCardChartType'." },
                                    visible: { type: Type.BOOLEAN, description: "For 'showCardData'." },
                                    column: { type: Type.STRING, description: "For 'filterCard', the column to filter on." },
                                    values: { type: Type.ARRAY, items: { type: Type.STRING }, description: "For 'filterCard', the values to include." },
                                },
                                required: ['cardId'],
                            },
                        },
                        required: ['toolName', 'args']
                    },
                    code: {
                        type: Type.OBJECT,
                        description: "For 'execute_js_code', the code to run.",
                        properties: {
                            explanation: { type: Type.STRING, description: "A brief, user-facing explanation of what the code will do." },
                            jsFunctionBody: { type: Type.STRING, description: "The body of a JavaScript function that takes 'data' and returns the transformed 'data'." },
                        },
                        required: ['explanation', 'jsFunctionBody']
                    }
                },
                required: ['responseType', 'thought']
            }
        }
    },
    required: ['actions']
};


export const generateChatResponse = async (
    columns: ColumnProfile[],
    chatHistory: ChatMessage[],
    userPrompt: string,
    cardContext: CardContext[],
    settings: Settings,
    aiCoreAnalysisSummary: string | null,
    currentView: AppView,
    rawDataSample: CsvRow[],
    longTermMemory: string[],
    dataPreparationPlan: DataPreparationPlan | null
): Promise<AiChatResponse> => {
    // Fix: Update API key check logic. For Google, assume key is present via env vars.
    const isApiKeySet = settings.provider === 'google' || !!settings.openAIApiKey;
    if (!isApiKeySet) {
        return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.', thought: 'API key is missing, so I must inform the user.' }] };
    }
    
    try {
        let jsonStr: string;
        const promptContent = createChatPrompt(
            columns, chatHistory, userPrompt, cardContext, settings.language, 
            aiCoreAnalysisSummary, rawDataSample, longTermMemory, dataPreparationPlan
        );

        if (settings.provider === 'openai') {
            const systemPrompt = `You are an expert data analyst and business strategist, required to operate using a Reason-Act (ReAct) framework. For every action you take, you must first explain your reasoning in the 'thought' field, and then define the action itself. Your goal is to respond to the user by providing insightful analysis and breaking down your response into a sequence of these thought-action pairs. Your final conversational responses should be in ${settings.language}.
Your output MUST be a single JSON object with an "actions" key containing an array of action objects.`;
            
            const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
            // FIX: Explicitly type the response from the OpenAI API call.
            const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }],
                response_format: { type: 'json_object' }
            }));

            const content = response.choices[0].message.content;
            if (!content) {
                throw new Error("OpenAI returned an empty response.");
            }
            jsonStr = content;

        } else { // Google Gemini
            // Fix: Use process.env.API_KEY for Gemini API key as per guidelines.
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `${promptContent}\nYour output MUST be a single JSON object with an "actions" key containing an array of action objects.`;
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: multiActionChatResponseSchema,
                },
            }));
            jsonStr = response.text.trim();
        }

        const chatResponse = JSON.parse(jsonStr) as AiChatResponse;

        if (!chatResponse.actions || !Array.isArray(chatResponse.actions)) {
            throw new Error("Invalid response structure from AI: 'actions' array not found.");
        }
        return chatResponse;
    } catch (error) {
        console.error("Error generating chat response:", error);
        throw new Error(`Failed to get a valid response from the AI. ${error instanceof Error ? error.message : ''}`);
    }
};