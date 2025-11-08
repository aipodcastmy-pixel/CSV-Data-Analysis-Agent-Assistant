
import { CsvData, ColumnProfile, Settings, AnalysisCardData, CardContext, CsvRow } from '../../types';
import { callGemini, callOpenAI } from './apiClient';
import { proactiveInsightSchema } from './schemas';
import { createSummaryPrompt, createCoreAnalysisPrompt, createProactiveInsightPrompt, createFinalSummaryPrompt } from '../promptTemplates';

export const generateSummary = async (title: string, data: CsvRow[], settings: Settings): Promise<string> => {
    const isApiKeySet = (settings.provider === 'google' && !!settings.geminiApiKey) || (settings.provider === 'openai' && !!settings.openAIApiKey);
    if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';
    
    try {
        const promptContent = createSummaryPrompt(title, data, settings.language);
        if (settings.provider === 'openai') {
            const systemPrompt = `You are a business intelligence analyst. Your response must be only the summary text in the specified format. The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning. For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."`;
            
            const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
            return await callOpenAI(settings, messages, false) || 'No summary generated.';

        } else { // Google Gemini
            return await callGemini(settings, promptContent);
        }
    } catch (error) {
        console.error("Error generating summary:", error);
        return "Failed to generate AI summary.";
    }
};

export const generateCoreAnalysisSummary = async (cardContext: CardContext[], columns: ColumnProfile[], settings: Settings): Promise<string> => {
    const isApiKeySet = (settings.provider === 'google' && !!settings.geminiApiKey) || (settings.provider === 'openai' && !!settings.openAIApiKey);
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
            
            const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
            return await callOpenAI(settings, messages, false) || 'No summary generated.';

        } else { // Google Gemini
            return await callGemini(settings, promptContent);
        }
    } catch (error) {
        console.error("Error generating core analysis summary:", error);
        return "An error occurred while the AI was forming its initial analysis.";
    }
};

export const generateProactiveInsights = async (cardContext: CardContext[], settings: Settings): Promise<{ insight: string; cardId: string; } | null> => {
    const isApiKeySet = (settings.provider === 'google' && !!settings.geminiApiKey) || (settings.provider === 'openai' && !!settings.openAIApiKey);
    if (!isApiKeySet || cardContext.length === 0) return null;

    try {
        let jsonStr: string;
        const promptContent = createProactiveInsightPrompt(cardContext, settings.language);

        if (settings.provider === 'openai') {
             const systemPrompt = `You are a proactive data analyst. Review the following summaries of data visualizations. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications. Your response must be a single JSON object with 'insight' and 'cardId' keys.`;
            
            const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
            jsonStr = await callOpenAI(settings, messages, true);
        
        } else { // Google Gemini
            jsonStr = await callGemini(settings, promptContent, proactiveInsightSchema);
        }
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Error generating proactive insight:", error);
        return null;
    }
};

export const generateFinalSummary = async (cards: AnalysisCardData[], settings: Settings): Promise<string> => {
    const isApiKeySet = (settings.provider === 'google' && !!settings.geminiApiKey) || (settings.provider === 'openai' && !!settings.openAIApiKey);
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
            
            const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptContent }];
            return await callOpenAI(settings, messages, false) || 'No final summary generated.';

        } else { // Google Gemini
            return await callGemini(settings, promptContent);
        }
    } catch (error) {
        console.error("Error generating final summary:", error);
        return "Failed to generate the final AI summary.";
    }
}
