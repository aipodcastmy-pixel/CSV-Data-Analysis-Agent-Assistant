import { CsvData, ColumnProfile, Settings, AnalysisPlan, CsvRow, AggregationType } from '../../types';
import { callGemini, callOpenAI, robustlyParseJsonArray } from './apiClient';
import { planSchema } from './schemas';
import { createCandidatePlansPrompt, createRefinePlansPrompt } from '../promptTemplates';
import { executePlan } from '../../utils/dataProcessor';
import OpenAI from 'openai';

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

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
        const { content } = await callOpenAI(settings, messages, true);
        plans = robustlyParseJsonArray(content);
    
    } else { // Google Gemini
        const { content } = await callGemini(settings, promptContent, planSchema);
        plans = robustlyParseJsonArray(content);
    }

    return plans;
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
        
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
        const { content } = await callOpenAI(settings, messages, true);
        rawPlans = robustlyParseJsonArray(content);

    } else { // Google Gemini
        const { content } = await callGemini(settings, promptContent, planSchema);
        rawPlans = robustlyParseJsonArray(content);
    }
    
    // FIX: Normalize the AI's response. The AI sometimes returns the full { plan, aggregatedSample }
    // object instead of just the plan. This extracts the `plan` object if it exists.
    const normalizedPlans = rawPlans.map(p => {
        if (p && p.plan && typeof p.plan === 'object') {
            return p.plan;
        }
        return p;
    });

    return normalizedPlans;
};


export const generateAnalysisPlans = async (
    columns: ColumnProfile[], 
    sampleData: CsvData['data'],
    settings: Settings
): Promise<AnalysisPlan[]> => {
    const isApiKeySet = (settings.provider === 'google' && !!settings.geminiApiKey) || (settings.provider === 'openai' && !!settings.openAIApiKey);
    if (!isApiKeySet) throw new Error("API Key not provided.");

    try {
        // Step 1: Generate a broad list of candidate plans
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
                console.warn(`Execution of plan "${plan.title}" failed during review stage:`, e);
                return null;
            }
        }).filter((p): p is { plan: AnalysisPlan; aggregatedSample: CsvRow[] } => p !== null);
        
        if (plansWithDataForReview.length === 0) {
            console.warn("No candidate plans produced data for AI review, returning initial valid candidates.");
            return candidatePlans.slice(0, 4);
        }
        
        // Step 3: AI Quality Gate - Ask AI to review and refine the plans
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
