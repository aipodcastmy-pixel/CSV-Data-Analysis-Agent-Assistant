import { ColumnProfile, CsvRow, Settings, AiFilterResponse } from '../../types';
import { callGemini, callOpenAI } from './apiClient';
import { filterFunctionSchema } from './schemas';
import { createFilterFunctionPrompt } from '../promptTemplates';
import OpenAI from 'openai';

export const generateFilterFunction = async (
    query: string,
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings
): Promise<AiFilterResponse> => {
    
    let lastError: Error | undefined;

    for(let i=0; i < 2; i++) { // Self-correction loop: 1 initial attempt + 1 retry
        try {
            let jsonStr: string;
            const promptContent = createFilterFunctionPrompt(query, columns, sampleData);

            if (settings.provider === 'openai') {
                const systemPrompt = "You are an expert data analyst. Your task is to convert a user's natural language query into a JavaScript filter function body for a dataset. You MUST respond with a single valid JSON object, and nothing else. The JSON object must adhere to the provided schema.";
                
                const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: promptContent }
                ];
                const { content } = await callOpenAI(settings, messages, true);
                jsonStr = content;

            } else { // Google Gemini
                const { content } = await callGemini(settings, promptContent, filterFunctionSchema);
                jsonStr = content;
            }
            
            const response = JSON.parse(jsonStr) as AiFilterResponse;

            // Basic validation
            if (response.jsFunctionBody && response.explanation) {
                return response;
            }
            throw new Error("AI response was missing required fields 'jsFunctionBody' or 'explanation'.");
        
        } catch (error) {
            console.error(`Error in filter function generation (Attempt ${i+1}):`, error);
            lastError = error as Error;
        }
    }

    throw new Error(`AI failed to generate a valid filter function. Last error: ${lastError?.message}`);
};
