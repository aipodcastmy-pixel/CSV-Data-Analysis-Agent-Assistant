import { Type } from "@google/genai";

export const planSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply. Omit for scatter plots.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (categorical). Omit for scatter plots.' },
      valueColumn: { type: Type.STRING, description: 'The column for aggregation (numerical). Not needed for "count".' },
      xValueColumn: { type: Type.STRING, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
      yValueColumn: { type: Type.STRING, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
      secondaryValueColumn: { type: Type.STRING, description: 'For combo charts, the secondary column for aggregation (numerical).' },
      secondaryAggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'For combo charts, the aggregation for the secondary value column.' },
      defaultTopN: { type: Type.INTEGER, description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
      defaultHideOthers: { type: Type.BOOLEAN, description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    },
    required: ['chartType', 'title', 'description'],
  },
};

export const columnProfileSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "The column name." },
        type: { type: Type.STRING, enum: ['numerical', 'categorical', 'date', 'time', 'currency', 'percentage'], description: "The data type of the column. Identify specific types like 'date', 'currency', etc., where possible." },
    },
    required: ['name', 'type'],
};

export const dataPreparationSchema = {
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

export const proactiveInsightSchema = {
    type: Type.OBJECT,
    properties: {
        insight: { type: Type.STRING, description: "A concise, user-facing message describing the single most important finding." },
        cardId: { type: Type.STRING, description: "The ID of the card where this insight was observed." },
    },
    required: ['insight', 'cardId'],
};

export const singlePlanSchema = {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply. Omit for scatter plots.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (categorical). Omit for scatter plots.' },
      valueColumn: { type: Type.STRING, description: 'The column for aggregation (numerical). Not needed for "count".' },
      xValueColumn: { type: Type.STRING, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
      yValueColumn: { type: Type.STRING, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
      secondaryValueColumn: { type: Type.STRING, description: 'For combo charts, the secondary column for aggregation (numerical).' },
      secondaryAggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'For combo charts, the aggregation for the secondary value column.' },
      defaultTopN: { type: Type.INTEGER, description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
      defaultHideOthers: { type: Type.BOOLEAN, description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    },
    required: ['chartType', 'title', 'description'],
};

export const multiActionChatResponseSchema = {
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
                                    newType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter', 'combo'], description: "For 'changeCardChartType'." },
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