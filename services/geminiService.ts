

// Fix: Import GenerateContentResponse to correctly type the API response.
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisPlan, CsvData, ColumnProfile, AnalysisCardData, AiChatResponse, ChatMessage, Settings, DataPreparationPlan, CardContext } from '../types';

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

const dataPreparationSchema = {
    type: Type.OBJECT,
    properties: {
        explanation: { type: Type.STRING, description: "A brief, user-facing explanation of the transformations that will be applied to the data (e.g., 'Removed 3 summary rows and reshaped the data from a cross-tab format')." },
        jsFunctionBody: {
            type: Type.STRING,
            description: "The body of a JavaScript function that takes one argument `data` (an array of objects) and returns the transformed array of objects. This code will be executed to clean and reshape the data. If no transformation is needed, this should be null."
        }
    },
    required: ['explanation']
};

export const generateDataPreparationPlan = async (
    columns: ColumnProfile[],
    sampleData: CsvData['data'],
    settings: Settings
): Promise<DataPreparationPlan> => {
    if (!settings.apiKey) return { explanation: "No transformation needed.", jsFunctionBody: null };
    
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const columnNames = columns.map(c => c.name).join(', ');
    
    const prompt = `
        You are an expert data engineer. Your task is to analyze a raw dataset and, if necessary, provide the body of a JavaScript function to clean and reshape it into a tidy, analysis-ready format.

        A tidy format has:
        1.  Each variable as a column.
        2.  Each observation as a row.
        3.  Each type of observational unit as a table.

        Common problems to fix:
        - **Summary Rows**: Filter out rows containing words like 'Total', 'Subtotal', 'Grand Total'.
        - **Crosstab/Wide Format**: Unpivot data where column headers are values (e.g., years, regions, quarters).
        - **Multi-header Rows**: Skip initial rows that are part of a complex header until the true header row is found (though PapaParse often handles this, assume the data arg is the parsed result and may contain junk rows at the start).

        Dataset Columns: ${columnNames}

        Sample Data (up to 20 rows):
        ${JSON.stringify(sampleData, null, 2)}

        Your task:
        1.  Analyze the sample data and column names.
        2.  Determine if any cleaning or reshaping is required.
        3.  If yes, write the body of a JavaScript function to perform the transformation. This function receives one argument, \`data\`, which is the full dataset as an array of objects.
        4.  Provide a concise, user-facing 'explanation' of what the function will do.
        5.  If NO transformation is needed, return the explanation "No data transformation needed." and set 'jsFunctionBody' to null.

        **CRITICAL REQUIREMENT**: The JavaScript code you generate **MUST** include a \`return\` statement as its final operation to return the transformed array. For example: \`return myCleanedData;\`. If you do not include a \`return\` statement, the application will fail.

        **Example 1: Cleaning needed**
        - Data has a "Grand Total" row.
        - Explanation: "Removed 1 summary row from the dataset."
        - jsFunctionBody: "return data.filter(row => !row['Region'] || !row['Region'].toLowerCase().includes('total'));"

        **Example 2: Reshaping needed (crosstab)**
        - Columns: ['Product', 'Q1_Sales', 'Q2_Sales']
        - Explanation: "Reshaped the data from a wide (crosstab) format to a long format for analysis."
        - jsFunctionBody: "const reshapedData = [];\\ndata.forEach(row => {\\n    const valueColumns = ['Q1_Sales', 'Q2_Sales'];\\n    valueColumns.forEach(valueCol => {\\n        const newRow = {\\n            'Product': row['Product'],\\n            'Quarter': valueCol,\\n            'Sales': row[valueCol]\\n        };\\n        reshapedData.push(newRow);\\n    });\\n});\\nreturn reshapedData;"

        Your response must be a valid JSON object adhering to the provided schema. The 'jsFunctionBody' should be a single-line JSON string (use \\n for newlines if needed).
    `;

    try {
        // Fix: Explicitly type the response to avoid 'unknown' type on .text property.
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: dataPreparationSchema,
            },
        }));
        
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as DataPreparationPlan;

    } catch (error) {
        console.error("Error creating data preparation plan:", error);
        return { explanation: "AI analysis for data preparation failed.", jsFunctionBody: null };
    }
};

export const generateAnalysisPlans = async (
    columns: ColumnProfile[], 
    sampleData: CsvData['data'],
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
        // Fix: Explicitly type the response to avoid 'unknown' type on .text property.
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: planSchema,
            },
        }));

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

export const generateSummary = async (title: string, data: CsvData['data'], settings: Settings): Promise<string> => {
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
        // Fix: Explicitly type the response to avoid 'unknown' type on .text property.
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model,
            contents: prompt,
        }));
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
        // Fix: Explicitly type the response to avoid 'unknown' type on .text property.
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model === 'gemini-2.5-pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
            contents: prompt,
        }));
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


const multiActionChatResponseSchema = {
    type: Type.OBJECT,
    properties: {
        actions: {
            type: Type.ARRAY,
            description: "A sequence of actions for the assistant to perform.",
            items: {
                type: Type.OBJECT,
                properties: {
                    responseType: { type: Type.STRING, enum: ['text_response', 'plan_creation', 'dom_action'] },
                    text: { type: Type.STRING, description: "A conversational text response to the user. Required for 'text_response'." },
                    plan: {
                        ...singlePlanSchema,
                        description: "Analysis plan object. Required for 'plan_creation'."
                    },
                    domAction: {
                        type: Type.OBJECT,
                        description: "A DOM manipulation action for the frontend to execute. Required for 'dom_action'.",
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
    settings: Settings
): Promise<AiChatResponse> => {
    if (!settings.apiKey) {
        return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.' }] };
    }

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });

    const categoricalCols = columns.filter(c => c.type === 'categorical').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical').map(c => c.name);
    const history = chatHistory.map(m => `${m.sender}: ${m.text}`).join('\n');

    const prompt = `
        You are a helpful and conversational data analysis assistant. Your task is to respond to the user by breaking down their request into a sequence of actions. Your responses should be in ${settings.language}.

        Your entire knowledge base consists of the user's data and the analysis cards currently on the screen.

        You have access to a dataset with:
        - Categorical columns: ${categoricalCols.join(', ')}
        - Numerical columns: ${numericalCols.join(', ')}

        The following analysis cards are currently displayed on the screen. Each card has an ID, a title, and a sample of its aggregated data. Use this data sample to answer questions about the card's content.
        ${cardContext.length > 0 ? JSON.stringify(cardContext, null, 2) : "No cards yet."}

        Conversation history:
        ${history}

        The user's latest message is: "${userPrompt}"

        Your task is to respond by creating a sequence of one or more actions. You have three action types:
        1.  **text_response**: For general conversation, questions, or comments. Use this to explain a chart's data.
        2.  **plan_creation**: If the user asks for a NEW chart or data aggregation.
        3.  **dom_action**: If the user wants to INTERACT with an EXISTING card (e.g., "highlight," "show data for," "change to pie chart").

        Available 'dom_action' tools:
        - **highlightCard**: Scrolls to and highlights a card. Args: { "cardId": "..." }.
        - **changeCardChartType**: Changes a card's chart. Args: { "cardId": "...", "newType": "bar" | "line" | "pie" }.
        - **showCardData**: Shows/hides the data table for a card. Args: { "cardId": "...", "visible": boolean }.

        Decision-making process:
        - THINK STEP-BY-STEP. A single user request might require multiple actions.
        - **Multi-step example**: If user says "Highlight the monthly sales card and explain the trend", you must return THREE actions in the array:
            1. A 'text_response' action that says something like "Certainly, I'll highlight that card for you."
            2. A 'dom_action' to 'highlightCard' for the correct cardId.
            3. A 'text_response' action with the explanation of the trend (which you derive from the aggregatedDataSample for that card).
        - Always prefer to be conversational. Use 'text_response' actions to acknowledge the user and explain what you are doing.
        - If the user asks a question about a card's data, use the provided 'aggregatedDataSample' to find the answer and respond with a 'text_response'.

        Your output MUST be a single JSON object with an "actions" key containing an array of action objects.
    `;

    try {
        // Fix: Explicitly type the response to avoid 'unknown' type on .text property.
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: multiActionChatResponseSchema,
            },
        }));

        const jsonStr = response.text.trim();
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
