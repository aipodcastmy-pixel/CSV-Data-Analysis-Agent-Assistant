
import { CsvData, ColumnProfile, Settings, DataPreparationPlan } from '../../types';
import { callGemini, callOpenAI } from './apiClient';
import { dataPreparationSchema } from './schemas';
import { createDataPreparationPrompt } from '../promptTemplates';

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
                
                const messages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptContent }
                ];
                jsonStr = await callOpenAI(settings, messages, true);

            } else { // Google Gemini
                if (!settings.geminiApiKey) return { explanation: "No transformation needed as Gemini API key is not set.", jsFunctionBody: null, outputColumns: columns };
                jsonStr = await callGemini(settings, promptContent, dataPreparationSchema);
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
