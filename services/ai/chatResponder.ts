import { ColumnProfile, ChatMessage, CardContext, Settings, AppView, CsvRow, DataPreparationPlan, AiChatResponse, StopReason } from '../../types';
import { callGemini, callOpenAI } from './apiClient';
import { multiActionChatResponseSchema } from './schemas';
import { createChatPrompt } from '../promptTemplates';
import OpenAI from 'openai';

export const generateChatResponse = async (
    columns: ColumnProfile[],
    chatHistory: ChatMessage[],
    userPrompt: string,
    cardContext: CardContext[],
    settings: Settings,
    aiCoreAnalysisSummary: string | null,
    rawDataSample: CsvRow[],
    longTermMemory: string[],
    dataPreparationPlan: DataPreparationPlan | null,
    selfCorrectionFeedback: string | null
): Promise<AiChatResponse> => {
    const isApiKeySet = (settings.provider === 'google' && !!settings.geminiApiKey) || (settings.provider === 'openai' && !!settings.openAIApiKey);
    if (!isApiKeySet) {
        return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.', thought: 'API key is missing, so I must inform the user.' }] };
    }
    
    try {
        let jsonStr: string;
        let apiStopReason: StopReason;
        const promptContent = createChatPrompt(
            columns, chatHistory, userPrompt, cardContext, settings.language, 
            aiCoreAnalysisSummary, rawDataSample, longTermMemory, dataPreparationPlan,
            selfCorrectionFeedback
        );

        if (settings.provider === 'openai') {
            const systemPrompt = `You are an expert data analyst and business strategist, required to operate using a Reason-Act (ReAct) framework. For every action you take, you must first explain your reasoning in the 'thought' field, and then define the action itself. Your goal is to respond to the user by providing insightful analysis and breaking down your response into a sequence of these thought-action pairs. Your final conversational responses should be in ${settings.language}.
Your output MUST be a single JSON object with an "actions" key containing an array of action objects.`;
            
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
            const { content, stopReason } = await callOpenAI(settings, messages, true);
            jsonStr = content;
            apiStopReason = stopReason;

        } else { // Google Gemini
            const { content, stopReason } = await callGemini(settings, promptContent, multiActionChatResponseSchema);
            jsonStr = content;
            apiStopReason = stopReason;
        }

        const chatResponse = JSON.parse(jsonStr) as AiChatResponse;
        chatResponse.stopReason = apiStopReason;

        if (!chatResponse.actions || !Array.isArray(chatResponse.actions)) {
            throw new Error("Invalid response structure from AI: 'actions' array not found.");
        }
        return chatResponse;
    } catch (error) {
        console.error("Error generating chat response:", error);
        throw new Error(`Failed to get a valid response from the AI. ${error instanceof Error ? error.message : ''}`);
    }
};
