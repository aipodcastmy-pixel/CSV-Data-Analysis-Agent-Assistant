

import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisPlan, CsvData, ColumnProfile, AnalysisCardData, AiChatResponse, ChatMessage, Settings } from '../types';

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
    settings: Settings,
    userPrompt?: string,
    numPlans: number = 4
): Promise<AnalysisPlan[]> => {
    if (!settings.apiKey) throw new Error("API Key not provided.");
    
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

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
        
        For each plan, choose the most appropriate chartType ('bar', 'line', 'pie'). 
        - Use 'line' for time series trends (e.g., grouping by date/month/year).
        - Use 'pie' for part-to-whole compositions, ideally with 6 or fewer categories.
        - Use 'bar' for most other comparisons between categories.
        - For 'count' aggregations, you do not need a valueColumn.
        - For 'sum' and 'avg', you must specify a valueColumn from the numerical columns.
        - The groupByColumn must be from the categorical columns.
        - Do not create plans that are too granular or have too many groups (e.g., grouping by a unique ID).
        
        Your response must be a valid JSON array of plan objects, adhering to the provided schema. Do not include any other text or explanations.
    `;

    try {
        const response = await ai.models.generateContent({
            model: settings.model,
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

export const generateSummary = async (title: string, data: CsvData, settings: Settings): Promise<string> => {
     if (!settings.apiKey) return 'AI Summaries are disabled. No API Key provided.';
    
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

    const languageInstruction = settings.language === 'Mandarin' 
        ? `Provide a concise, insightful summary in two languages, separated by '---'.\nFormat: English Summary --- Mandarin Summary`
        : `Provide a concise, insightful summary in ${settings.language}.`;


    const prompt = `
        You are a business intelligence analyst.
        The following data is for a chart titled "${title}".
        Data:
        ${JSON.stringify(data.slice(0, 10), null, 2)} 
        ${data.length > 10 ? `(...and ${data.length - 10} more rows)` : ''}

        ${languageInstruction}

        The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning.
        For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."
        Your response must be only the summary text in the specified format.
    `;

    try {
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating summary:", error);
        return "Failed to generate AI summary.";
    }
};

export const generateFinalSummary = async (cards: AnalysisCardData[], settings: Settings): Promise<string> => {
    if (!settings.apiKey) return 'AI Summaries are disabled. No API Key provided.';

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

    const summaries = cards.map(card => {
        const summaryText = card.summary.split('---')[0]; // Prioritize the first language part of the summary
        return `Chart Title: ${card.plan.title}\nSummary: ${summaryText}`;
    }).join('\n\n');

    const prompt = `
        You are a senior business strategist. You have been provided with several automated data analyses.
        Your task is to synthesize these individual findings into a single, high-level executive summary in ${settings.language}.

        Here are the individual analysis summaries (they are in English):
        ${summaries}

        Please provide a concise, overarching summary that connects the dots between these analyses. 
        Identify the most critical business insights, potential opportunities, or risks revealed by the data as a whole.
        Do not just repeat the individual summaries. Create a new, synthesized narrative.
        Your response should be a single paragraph of insightful business analysis.
    `;

    try {
        const response = await ai.models.generateContent({
            model: settings.model === 'gemini-2.5-pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating final summary:", error);
        return "Failed to generate the final AI summary.";
    }
}

const singlePlanSchema = {
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
};


const chatResponseSchema = {
    type: Type.OBJECT,
    properties: {
        responseType: { type: Type.STRING, enum: ['text_response', 'plan_creation', 'dom_action'] },
        text: { type: Type.STRING, description: "A conversational text response to the user. This can accompany a 'plan_creation' or 'dom_action' to provide context." },
        plan: {
            ...singlePlanSchema,
            description: "Analysis plan object. Use ONLY if responseType is 'plan_creation'."
        },
        domAction: {
            type: Type.OBJECT,
            description: "A DOM manipulation action for the frontend to execute. Use ONLY if responseType is 'dom_action'.",
            properties: {
                toolName: { type: Type.STRING, enum: ['highlightCard', 'changeCardChartType', 'showCardData'] },
                args: { 
                    type: Type.OBJECT,
                    description: 'Arguments for the tool. e.g., { cardId: "..." }',
                    properties: {
                        cardId: { type: Type.STRING, description: 'The ID of the target analysis card.' },
                        newType: { type: Type.STRING, enum: ['bar', 'line', 'pie'], description: "The new chart type. Required for 'changeCardChartType'." },
                        visible: { type: Type.BOOLEAN, description: "Whether to show or hide the data table. Required for 'showCardData'." },
                    },
                    required: ['cardId'],
                },
            },
            required: ['toolName', 'args']
        }
    },
    required: ['responseType']
};


export const generateChatResponse = async (
    columns: ColumnProfile[], 
    sampleData: CsvData,
    chatHistory: ChatMessage[],
    userPrompt: string,
    existingCards: {id: string, title: string}[],
    settings: Settings
): Promise<AiChatResponse> => {
    if (!settings.apiKey) {
        return { responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.' };
    }
    
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

    const categoricalCols = columns.filter(c => c.type === 'categorical').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical').map(c => c.name);
    const history = chatHistory.map(m => `${m.sender}: ${m.text}`).join('\n');

    const prompt = `
        You are a helpful and conversational data analysis assistant integrated into a web application. Your responses should be in ${settings.language}.
        
        You have access to a dataset with:
        - Categorical columns: ${categoricalCols.join(', ')}
        - Numerical columns: ${numericalCols.join(', ')}
        
        Sample Data (first 5 rows):
        ${JSON.stringify(sampleData, null, 2)}

        The following analysis cards are currently displayed on the screen:
        ${existingCards.length > 0 ? JSON.stringify(existingCards) : "No cards yet."}
        
        Conversation history:
        ${history}
        
        The user's latest message is: "${userPrompt}"
        
        Your task is to respond intelligently. You have three response options:
        1.  **text_response**: For general conversation, questions, or comments.
        2.  **plan_creation**: If the user asks for a NEW chart, visualization, or data aggregation not already present.
        3.  **dom_action**: If the user wants to INTERACT with an EXISTING card (e.g., "highlight," "show data for," "change to pie chart"). Use this to guide the user.

        Here are the available 'dom_action' tools:
        - **highlightCard**: Scrolls to and highlights a card. Args: { "cardId": "..." }.
        - **changeCardChartType**: Changes a card's chart. Args: { "cardId": "...", "newType": "bar" | "line" | "pie" }.
        - **showCardData**: Shows or hides the data table for a card. Args: { "cardId": "...", "visible": boolean }.

        Decision-making process:
        - If the user asks for a new analysis (e.g., "show me sales by year"), use 'plan_creation'.
        - If the user refers to an existing card (e.g., "highlight the sales by region card" or "for that last card, show the data"), find the correct 'cardId' from the list above and use 'dom_action'.
        - If the user is just chatting (e.g., "thank you", "what is the highest sale?"), use 'text_response'.
        - When using 'dom_action' or 'plan_creation', you can also provide a 'text' property in ${settings.language} to explain what you're doing. For example, "Sure, I'm highlighting the sales card for you now."
        
        Your output MUST be a single JSON object matching the provided schema.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: chatResponseSchema,
            },
        });

        const jsonStr = response.text.trim();
        const chatResponse = JSON.parse(jsonStr) as AiChatResponse;

        // Basic validation
        if (!chatResponse.responseType || (!chatResponse.plan && !chatResponse.text && !chatResponse.domAction)) {
             throw new Error("Invalid response structure from AI.");
        }
        return chatResponse;
    } catch (error) {
        console.error("Error generating chat response:", error);
        throw new Error("Failed to get a valid response from the AI.");
    }
};