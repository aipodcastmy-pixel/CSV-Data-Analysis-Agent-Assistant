import { GoogleGenAI, GenerateContentResponse, FinishReason } from "@google/genai";
import OpenAI from 'openai';
import { Settings, StopReason } from '../../types';

// Helper for retrying API calls
export const withRetry = async <T>(fn: () => Promise<T>, retries = 2): Promise<T> => {
    let lastError: Error | undefined;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            console.warn(`API call failed, retrying... (${i + 1}/${retries})`, error);
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 500));
            }
        }
    }
    throw lastError;
};

/**
 * Parses a string that is expected to contain a JSON array, but might be malformed.
 * Handles cases where the array is wrapped in markdown, is inside an object, or is just a single object.
 * @param responseText The raw text response from the AI.
 * @returns A parsed array of objects.
 */
export const robustlyParseJsonArray = (responseText: string): any[] => {
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


const mapOpenAIStopReason = (reason: OpenAI.Chat.Completions.ChatCompletion.Choice['finish_reason'] | null): StopReason => {
    switch (reason) {
        case 'stop': return 'stop';
        case 'length': return 'max_tokens';
        case 'tool_calls': return 'tool_calls';
        case 'content_filter': return 'safety';
        default: return 'unknown';
    }
};

export const callOpenAI = async (settings: Settings, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], useJsonFormat: boolean): Promise<{ content: string; stopReason: StopReason; }> => {
    if (!settings.openAIApiKey) throw new Error("OpenAI API key is not set.");
    const openai = new OpenAI({ apiKey: settings.openAIApiKey, dangerouslyAllowBrowser: true });
    
    const response: OpenAI.Chat.ChatCompletion = await withRetry(() => openai.chat.completions.create({
        model: settings.model,
        messages: messages,
        response_format: useJsonFormat ? { type: 'json_object' } : undefined,
    }));
    
    const content = response.choices[0].message.content;
    const stopReason = mapOpenAIStopReason(response.choices[0].finish_reason);

    if (!content) throw new Error("OpenAI returned an empty response.");
    return { content, stopReason };
}

const mapGeminiStopReason = (reason?: FinishReason): StopReason => {
    switch (reason) {
        case FinishReason.STOP: return 'stop';
        case FinishReason.MAX_TOKENS: return 'max_tokens';
        case FinishReason.SAFETY: return 'safety';
        case FinishReason.RECITATION: return 'recitation';
        case FinishReason.OTHER: return 'other';
        default: return 'unknown';
    }
};

export const callGemini = async (settings: Settings, prompt: string, schema?: any): Promise<{ content: string; stopReason: StopReason; }> => {
    if (!settings.geminiApiKey) throw new Error("Gemini API key is not set.");
    const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
    
    // The Gemini API works better if the schema instruction is part of the main prompt text, not just in config.
    const finalPrompt = `${prompt}\n${schema ? 'Your response must be a valid JSON object adhering to the provided schema.' : ''}`;

    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
        model: settings.model,
        contents: finalPrompt,
        config: schema ? {
            responseMimeType: 'application/json',
            responseSchema: schema,
        } : undefined,
    }));
    
    const content = response.text.trim();
    const stopReason = mapGeminiStopReason(response.candidates?.[0]?.finishReason);
    
    return { content, stopReason };
}
