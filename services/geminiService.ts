

import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisPlan, CsvData, ColumnProfile, AnalysisCardData, AiChatResponse, ChatMessage, Settings, DataStructureAnalysis, CleaningPlan } from '../types';

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

const dataStructureSchema = {
    type: Type.OBJECT,
    properties: {
        format: { type: Type.STRING, enum: ['tidy', 'crosstab'], description: 'The detected format of the data.' },
        unpivotPlan: {
            type: Type.OBJECT,
            description: "Required if format is 'crosstab'. Defines how to unpivot the data.",
            properties: {
                indexColumns: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Columns to keep as is (e.g., 'Date', 'Product ID')." },
                valueColumns: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Columns to be unpivoted (e.g., 'Q1_Sales', 'Q2_Sales', 'Region_A', 'Region_B')." },
                variableColumnName: { type: Type.STRING, description: "The name for the new column created from the headers of valueColumns (e.g., 'Quarter', 'Region')." },
                valueColumnName: { type: Type.STRING, description: "The name for the new column that will hold the values from valueColumns (e.g., 'Sales', 'Amount')." },
            },
            required: ['indexColumns', 'valueColumns', 'variableColumnName', 'valueColumnName'],
        },
    },
    required: ['format'],
};

const cleaningPlanSchema = {
    type: Type.OBJECT,
    properties: {
        excludeRows: {
            type: Type.ARRAY,
            description: "A list of rules to identify rows that should be excluded from analysis.",
            items: {
                type: Type.OBJECT,
                properties: {
                    column: { type: Type.STRING, description: "The column to check the rule against." },
                    contains: { type: Type.STRING, description: "Exclude row if the column value contains this substring (case-insensitive)." },
                    equals: { type: Type.STRING, description: "Exclude row if the column value exactly equals this string." },
                    startsWith: { type: Type.STRING, description: "Exclude row if the column value starts with this substring." },
                },
                required: ['column']
            }
        }
    },
    required: ['excludeRows']
};


export const createDataCleaningPlan = async (
    columns: ColumnProfile[],
    sampleData: CsvData,
    settings: Settings
): Promise<CleaningPlan> => {
     if (!settings.apiKey) return { excludeRows: [] };

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const columnNames = columns.map(c => c.name).join(', ');

    const prompt = `
        You are a data quality analyst. Your task is to identify and create rules to exclude non-data rows from a dataset, such as summary rows (totals, subtotals), empty rows, or report footers.

        Dataset Columns: ${columnNames}

        Sample Data:
        ${JSON.stringify(sampleData, null, 2)}

        Analysis:
        1.  Scan the sample data for rows that are clearly not individual data entries.
        2.  Look for keywords like 'Total', 'Subtotal', 'Grand Total', 'Summary' in any of the columns. These often indicate summary rows.
        3.  Also look for rows where key columns are empty, which might indicate a separator or footer row.
        4.  For each type of row to exclude, create a simple, robust rule. Prefer 'contains' for flexibility. For example, if a row in the 'Product' column says "Grand Total", a good rule is { "column": "Product", "contains": "Total" }.

        Example:
        - Sample Row: { "Region": "Grand Total", "Sales": 50000 }
        - Result: { "excludeRows": [{ "column": "Region", "contains": "Total" }] }

        Example:
        - Sample Row: { "Date": null, "Region": null, "Sales": null }
        - This is likely a blank row, but it's hard to make a specific rule. Only create rules for rows with clear text indicators like 'Total'.

        If no such rows are found, return an empty 'excludeRows' array.
        Your response must be a valid JSON object adhering to the provided schema.
    `;

    try {
         const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: cleaningPlanSchema,
            },
        });
        
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as CleaningPlan;
    } catch (error) {
        console.error("Error creating data cleaning plan:", error);
        return { excludeRows: [] }; // Return empty plan on error
    }
};

export const analyzeDataStructure = async (
    columns: ColumnProfile[],
    sampleData: CsvData,
    settings: Settings
): Promise<DataStructureAnalysis> => {
    if (!settings.apiKey) return { format: 'tidy' };

    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const columnNames = columns.map(c => c.name);

    const prompt = `
        You are a data structure analyst. Your task is to determine if a dataset is in a 'tidy' (long) format or a 'crosstab' (wide) format.

        - **Tidy Data**: Each row is a single observation. Each column is a variable. This is the standard format.
        - **Crosstab Data**: Some column headers are values, not variables. For example, columns named '2022', '2023', 'Q1', 'Q2', or 'USA', 'Canada'. This data needs to be "unpivoted" or "melted" to be useful for standard analysis.

        Dataset Columns: ${columnNames.join(', ')}

        Sample Data:
        ${JSON.stringify(sampleData, null, 2)}

        Analysis:
        1.  Examine the column names. Do they look like categories (e.g., years, regions, quarters)?
        2.  If it looks like a crosstab, identify the 'indexColumns' (columns that uniquely identify a row, like 'Product' or 'Employee Name') and the 'valueColumns' (the columns that should be unpivoted).
        3.  Propose a sensible 'variableColumnName' (for the headers of the value columns) and a 'valueColumnName' (for the cell values).

        Example 1:
        - Columns: ['Product', 'Q1_Sales', 'Q2_Sales']
        - Result: format: 'crosstab', unpivotPlan: { indexColumns: ['Product'], valueColumns: ['Q1_Sales', 'Q2_Sales'], variableColumnName: 'Quarter', valueColumnName: 'Sales' }

        Example 2:
        - Columns: ['Date', 'Region', 'Sales']
        - Result: format: 'tidy'

        Example 3:
        - Columns: ['Department', 'Jan', 'Feb', 'Mar']
        - Result: format: 'crosstab', unpivotPlan: { indexColumns: ['Department'], valueColumns: ['Jan', 'Feb', 'Mar'], variableColumnName: 'Month', valueColumnName: 'Value' }
        
        Your response must be a valid JSON object adhering to the provided schema.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: dataStructureSchema,
            },
        });
        
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as DataStructureAnalysis;
    } catch (error) {
        console.error("Error analyzing data structure:", error);
        // Default to tidy format on failure to avoid breaking the pipeline
        return { format: 'tidy' };
    }
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
    sampleData: CsvData,
    chatHistory: ChatMessage[],
    userPrompt: string,
    existingCards: { id: string, title: string }[],
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

        You have access to a dataset with:
        - Categorical columns: ${categoricalCols.join(', ')}
        - Numerical columns: ${numericalCols.join(', ')}

        The following analysis cards are currently displayed on the screen:
        ${existingCards.length > 0 ? JSON.stringify(existingCards) : "No cards yet."}

        Conversation history:
        ${history}

        The user's latest message is: "${userPrompt}"

        Your task is to respond by creating a sequence of one or more actions. You have three action types:
        1.  **text_response**: For general conversation, questions, or comments.
        2.  **plan_creation**: If the user asks for a NEW chart or data aggregation.
        3.  **dom_action**: If the user wants to INTERACT with an EXISTING card (e.g., "highlight," "show data for," "change to pie chart").

        Available 'dom_action' tools:
        - **highlightCard**: Scrolls to and highlights a card. Args: { "cardId": "..." }.
        - **changeCardChartType**: Changes a card's chart. Args: { "cardId": "...", "newType": "bar" | "line" | "pie" }.
        - **showCardData**: Shows/hides the data table for a card. Args: { "cardId": "...", "visible": boolean }.

        Decision-making process:
        - THINK STEP-BY-STEP. A single user request might require multiple actions.
        - If the user asks to see something and then explain it, this is a multi-step action.
        - **Multi-step example**: If user says "Highlight the monthly sales card and explain the trend", you must return TWO actions in the array:
            1. A 'text_response' action that says something like "Certainly, I'll highlight that card for you."
            2. A 'dom_action' to 'highlightCard' for the correct cardId.
            3. A 'text_response' action with the explanation of the trend.
        - Always prefer to be conversational. Use 'text_response' actions to acknowledge the user and explain what you are doing.
        - If the user asks for a new analysis, use a 'text_response' to confirm, then a 'plan_creation' action.
        - If the user is just chatting (e.g., "thank you"), use a single 'text_response'.

        Your output MUST be a single JSON object with an "actions" key containing an array of action objects.
    `;

    try {
        const response = await ai.models.generateContent({
            model: settings.model,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: multiActionChatResponseSchema,
            },
        });

        const jsonStr = response.text.trim();
        const chatResponse = JSON.parse(jsonStr) as AiChatResponse;

        if (!chatResponse.actions || !Array.isArray(chatResponse.actions)) {
            throw new Error("Invalid response structure from AI: 'actions' array not found.");
        }
        return chatResponse;
    } catch (error) {
        console.error("Error generating chat response:", error);
        throw new Error("Failed to get a valid response from the AI.");
    }
};
