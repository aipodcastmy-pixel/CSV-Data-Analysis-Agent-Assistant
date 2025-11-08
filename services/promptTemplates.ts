import { ColumnProfile, CsvRow, CardContext, Settings, DataPreparationPlan, ChatMessage, AppView } from '../types';

// Centralized rules to avoid repetition
const commonRules = {
    numberParsing: `- **CRITICAL RULE on NUMBER PARSING**: This is the most common source of errors. To handle numbers that might be formatted as strings (e.g., "$1,234.56", "50%"), you are provided with a safe utility function: \`_util.parseNumber(value)\`.
    - **YOU MUST use \`_util.parseNumber(value)\` for ALL numeric conversions.**
    - **DO NOT use \`parseInt()\`, \`parseFloat()\`, or \`Number()\` directly.** The provided utility is guaranteed to handle various formats correctly.`,
    splitNumeric: `- **CRITICAL RULE on SPLITTING NUMERIC STRINGS**: If you encounter a single string field that contains multiple comma-separated numbers (which themselves may contain commas as thousand separators, e.g., "1,234.50,5,678.00,-9,123.45"), you are provided a utility \`_util.splitNumericString(value)\` to correctly split the string into an array of number strings.
    - **YOU MUST use this utility for this specific case.**
    - **DO NOT use a simple \`string.split(',')\`**, as this will incorrectly break up numbers.
    - **Example**: To parse a field 'MonthlyValues' containing "1,500.00,2,000.00", your code should be: \`const values = _util.splitNumericString(row.MonthlyValues);\` This will correctly return \`['1,500.00', '2,000.00']\`.`,
    dataVsSummaries: `- **Distinguishing Data from Summaries**: Your most critical task is to differentiate between valid data rows and non-data rows (like summaries or metadata).
    - A row is likely **valid data** if it has a value in its primary identifier column(s) (e.g., 'Account Code', 'Product ID') and in its metric columns.
    - **CRITICAL: Do not confuse hierarchical data with summary rows.** Look for patterns in identifier columns where one code is a prefix of another (e.g., '50' is a parent to '5010'). These hierarchical parent rows are **valid data** representing a higher level of aggregation and MUST be kept. Your role is to reshape the data, not to pre-summarize it by removing these levels.
    - A row is likely **non-data** and should be removed if it's explicitly a summary (e.g., contains 'Total', 'Subtotal' in a descriptive column) OR if it's metadata (e.g., the primary identifier column is empty but other columns contain text, like a section header).`,
};

export const createDataPreparationPrompt = (columns: ColumnProfile[], sampleData: CsvRow[], lastError?: Error): string => `
    You are an expert data engineer. Your task is to analyze a raw dataset and, if necessary, provide a JavaScript function to clean and reshape it into a tidy, analysis-ready format. CRITICALLY, you must also provide the schema of the NEW, transformed data with detailed data types.
    A tidy format has: 1. Each variable as a column. 2. Each observation as a row.
    
    Common problems to fix:
    ${commonRules.numberParsing}
    ${commonRules.splitNumeric}
    ${commonRules.dataVsSummaries}
    - **Crosstab/Wide Format**: Unpivot data where column headers are values (e.g., years, regions).
    - **Multi-header Rows**: Skip initial junk rows.

    Dataset Columns (Initial Schema):
    ${JSON.stringify(columns, null, 2)}
    Sample Data (up to 20 rows):
    ${JSON.stringify(sampleData, null, 2)}
    ${lastError ? `On the previous attempt, your generated code failed with this error: "${lastError.message}". Please analyze the error and the data, then provide a corrected response.` : ''}
    
    Your task:
    1.  **Analyze**: Look at the initial schema and sample data.
    2.  **Plan Transformation**: Decide if cleaning or reshaping is needed. If you identify date or time columns as strings, your function should attempt to parse them into a standard format (e.g., 'YYYY-MM-DD' for dates).
    3.  **Define Output Schema**: Determine the exact column names and types of the data AFTER your transformation. This is the MOST important step. Be as specific as possible with the types. Use 'categorical' for text labels, 'numerical' for general numbers, but you MUST identify and use the more specific types where they apply:
        - **'date'**: For columns containing dates (e.g., "2023-10-26", "10/26/2023").
        - **'time'**: For columns with time values (e.g., "14:30:00").
        - **'currency'**: For columns representing money, especially if they contain symbols like '$' or ','.
        - **'percentage'**: For columns with '%' symbols or values that are clearly percentages.
    4.  **Write Code**: If transformation is needed, write the body of a JavaScript function. This function receives two arguments, \`data\` and \`_util\`, and must return the transformed array of objects.
    5.  **Explain**: Provide a concise 'explanation' of what you did.

    **CRITICAL REQUIREMENTS:**
    - You MUST provide the \`outputColumns\` array. If you don't transform the data, \`outputColumns\` should be identical to the initial schema (but with more specific types if you identified them). If you do transform it, it must accurately reflect the new structure your code creates.
    - Your JavaScript code MUST include a \`return\` statement as its final operation.

    **Example: Reshaping and identifying types using the utility**
    - Initial Data: [{'Product': 'A', 'DateStr': 'Oct 26 2023', 'Revenue': '$1,500.00'}]
    - Explanation: "Standardized the date format and converted the revenue column to a number."
    - jsFunctionBody: "return data.map(row => ({ ...row, DateStr: new Date(row.DateStr).toISOString().split('T')[0], Revenue: _util.parseNumber(row.Revenue) }));"
    - outputColumns: [{'name': 'Product', 'type': 'categorical'}, {'name': 'DateStr', 'type': 'date'}, {'name': 'Revenue', 'type': 'currency'}]
`;

export const createFilterFunctionPrompt = (query: string, columns: ColumnProfile[], sampleData: CsvRow[]): string => `
    You are an expert data analyst. Your task is to convert a user's natural language query into a JavaScript filter function body for a dataset.
    
    **User Query:** "${query}"
    
    **Dataset Columns (Schema):**
    ${JSON.stringify(columns, null, 2)}
    
    **Sample Data (first 5 rows):**
    ${JSON.stringify(sampleData, null, 2)}
    
    **CRITICAL Rules for Code Generation:**
    ${commonRules.numberParsing}
    - When comparing strings, convert both the data and the comparison value to the same case (e.g., lower case) using \`.toLowerCase()\` to ensure case-insensitive matching.
    - For date comparisons, you can use \`new Date(row.date_column) > new Date('YYYY-MM-DD')\`.
    - The function you write will be the body of a new Function that receives 'data' (the full array of objects) and '_util'.
    - Your function body MUST start with \`return data.filter(row => ...);\`.
    
    **Your Task:**
    1.  **Analyze Query:** Understand the user's intent. Identify columns, values, and operators (e.g., >, <, =, contains).
    2.  **Write JS Code:** Write a single line of JavaScript that filters the data array.
    3.  **Explain:** Briefly explain the filter you created in plain language.
    
    **Example:**
    - User Query: "show me all rows where sales > 5000 and region is North America"
    - Columns: [{ name: 'sales', type: 'currency' }, { name: 'region', type: 'categorical' }]
    - Your Response (JSON):
    {
      "explanation": "Filtering for rows where 'sales' is greater than 5000 and 'region' is 'North America'.",
      "jsFunctionBody": "return data.filter(row => _util.parseNumber(row.sales) > 5000 && row.region.toLowerCase() === 'north america');"
    }
`;

export const createCandidatePlansPrompt = (categoricalCols: string[], numericalCols: string[], sampleData: CsvRow[], numPlans: number): string => `
    You are a senior business intelligence analyst specializing in ERP and financial data. Your task is to generate a diverse list of insightful analysis plan candidates for a given dataset by identifying common data patterns.
    
    Dataset columns:
    - Categorical: ${categoricalCols.join(', ')}
    - Numerical: ${numericalCols.join(', ')}
    Sample Data (first 5 rows):
    ${JSON.stringify(sampleData, null, 2)}
    
    Please generate up to ${numPlans} diverse analysis plans.
    
    **CRITICAL: Think like a Business/ERP Analyst.**
    1.  **Identify Key Metrics**: First, find the columns that represent measurable values. Look for names like 'VALUE', 'AMOUNT', 'SALES', 'COST', 'QUANTITY', 'PRICE'. These are almost always the columns you should be aggregating (e.g., using 'sum' or 'avg').
    2.  **Identify Dimensions**: Next, find columns that describe the data. Look for names ending in 'CODE', 'ID', 'TYPE', 'CATEGORY', or containing 'NAME', 'DESCRIPTION', 'PROJECT', 'REGION'. These are your primary grouping columns (dimensions).
    3.  **Find Relationships**: Codes and descriptions often go together (e.g., 'PROJECT_CODE' and 'PROJECT_DESCRIPTION'). A very valuable analysis is to group by a description column (which is more human-readable for a chart) and sum a value column.
    4.  **Prioritize High-Value Aggregations**: Focus on creating plans that answer common business questions like 'What are our top revenue sources?', 'Where are the biggest costs?', or 'How are items distributed across categories?'. A simple 'count' is less valuable than a 'sum' of a 'VALUE' or 'AMOUNT' column.
    
    **Example Task**: Given columns ['CODE', 'DESCRIPTION', 'PROJECT_CODE', 'VALUE'], a HIGH-QUALITY plan would be:
    - Title: "Sum of VALUE by DESCRIPTION"
    - Aggregation: 'sum'
    - groupByColumn: 'DESCRIPTION'
    - valueColumn: 'VALUE'
    - Chart Type: 'bar'
    
    For each plan, choose the most appropriate chartType ('bar', 'line', 'pie', 'doughnut', 'scatter', 'combo'). 
    - Use 'line' for time series trends.
    - Use 'bar' for most categorical comparisons, especially for "top X" style reports.
    - Use 'pie' or 'doughnut' for compositions with few categories.
    - Use 'scatter' to show the relationship between two numerical variables.
    - **Use 'combo' (bar + line) to compare two different metrics against the same category (e.g., sum of 'Sales' as bars and average of 'Profit' as a line). You MUST provide both a primary and secondary value column and aggregation for combo charts.**
    
    Rules:
    - For 'scatter' plots, you MUST provide 'xValueColumn' and 'yValueColumn' (both numerical) and you MUST NOT provide 'aggregation' or 'groupByColumn'.
    - For 'combo' charts, you MUST provide 'groupByColumn', 'valueColumn', 'aggregation', 'secondaryValueColumn', and 'secondaryAggregation'.
    - **CRITICAL**: Only use one of the following aggregation types: 'sum', 'count', 'avg'. Do NOT use other statistical measures like 'stddev', 'variance', 'median', etc.
    - Do not create plans that are too granular (e.g., grouping by a unique ID column if there are thousands of them).
`;

export const createRefinePlansPrompt = (plansWithData: { plan: any; aggregatedSample: CsvRow[] }[]): string => `
    You are a Quality Review Data Analyst. Your job is to review a list of proposed analysis plans and their data samples. Your goal is to select ONLY the most insightful and readable charts for the end-user, and configure them for the best default view.
    
    **Review Criteria & Rules:**
    1.  **Discard Low-Value Charts**: This is your most important task. You MUST discard any plan that is not genuinely insightful.
        - **Example of a low-value chart**: A bar chart where all values are nearly identical (e.g., [77, 77, 77, 76, 78]). This shows uniformity but is not a useful visualization. DISCARD IT.
        - **Example of another low-value chart**: A pie/doughnut chart where one category makes up over 95% of the total. This is not insightful. DISCARD IT.
    2.  **Discard Unreadable Charts**: If a chart groups by a high-cardinality column resulting in too many categories to be readable (e.g., more than 50 tiny bars), discard it unless it's a clear time-series line chart.
    3.  **Configure for Readability**: For good, insightful charts that have a moderate number of categories (e.g., 15 to 50), you MUST add default settings to make them readable. Set \`defaultTopN\` to 8 and \`defaultHideOthers\` to \`true\`.
    4.  **Keep Good Charts**: If a chart is insightful and has a reasonable number of categories (e.g., under 15), keep it as is without adding default settings.
    5.  **Return the Result**: Your final output must be an array of ONLY the good, configured plan objects. Do not include the discarded plans.
    
    **Proposed Plans and Data Samples:**
    ${JSON.stringify(plansWithData, null, 2)}
`;

export const createSummaryPrompt = (title: string, data: CsvRow[], language: Settings['language']): string => {
    const languageInstruction = language === 'Mandarin' 
        ? `Provide a concise, insightful summary in two languages, separated by '---'.\nFormat: English Summary --- Mandarin Summary`
        : `Provide a concise, insightful summary in ${language}.`;
    
    return `
        You are a business intelligence analyst.
        The following data is for a chart titled "${title}".
        Data:
        ${JSON.stringify(data.slice(0, 10), null, 2)} 
        ${data.length > 10 ? `(...and ${data.length - 10} more rows)` : ''}
        ${languageInstruction}
        The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning.
        For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."
    `;
};

export const createCoreAnalysisPrompt = (cardContext: CardContext[], columns: ColumnProfile[], language: Settings['language']): string => `
    You are a senior data analyst. After performing an initial automated analysis of a dataset, your task is to create a concise "Core Analysis Briefing". This briefing will be shown to the user and will serve as the shared foundation of understanding for your conversation.
    Based on the columns and the analysis cards you have just generated, summarize the dataset's primary characteristics.
    Your briefing should cover:
    1.  **Primary Subject**: What is this data fundamentally about? (e.g., "This dataset appears to be about online sales transactions...")
    2.  **Key Metrics**: What are the most important numerical columns? (e.g., "...where the key metrics are 'Sale_Amount' and 'Profit'.")
    3.  **Core Dimensions**: What are the main categorical columns used for analysis? (e.g., "The data is primarily broken down by 'Region' and 'Product_Category'.")
    4.  **Suggested Focus**: Based on the initial charts, what should be the focus of further analysis? (e.g., "Future analysis should focus on identifying the most profitable regions and product categories.")
    
    **Available Information:**
    - **Dataset Columns**: ${JSON.stringify(columns.map(c => c.name))}
    - **Generated Analysis Cards**: ${JSON.stringify(cardContext, null, 2)}
    
    Produce a single, concise paragraph in ${language}. This is your initial assessment that you will share with your human counterpart.
`;

export const createProactiveInsightPrompt = (cardContext: CardContext[], language: Settings['language']): string => `
    You are a proactive data analyst. Review the following summaries of data visualizations you have created. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications.
    
    **Generated Analysis Cards & Data Samples:**
    ${JSON.stringify(cardContext, null, 2)}

    Your Task:
    1.  **Analyze**: Review all the cards provided.
    2.  **Identify**: Find the ONE most important finding. Don't list everything, just the top insight.
    3.  **Formulate**: Write a concise, user-facing message in ${language} that explains this insight (e.g., "I noticed that sales in August were unusually high, you might want to investigate what caused this spike.").
    4.  **Respond**: Return a JSON object containing this message and the ID of the card it relates to.
`;

export const createFinalSummaryPrompt = (summaries: string, language: Settings['language']): string => `
    You are a senior business strategist. You have been provided with several automated data analyses.
    Your task is to synthesize these individual findings into a single, high-level executive summary in ${language}.
    Here are the individual analysis summaries (they are in English):
    ${summaries}
    Please provide a concise, overarching summary that connects the dots between these analyses. 
    Identify the most critical business insights, potential opportunities, or risks revealed by the data as a whole.
    Do not just repeat the individual summaries. Create a new, synthesized narrative.
    Your response should be a single paragraph of insightful business analysis.
`;


export const createChatPrompt = (
    columns: ColumnProfile[],
    chatHistory: ChatMessage[],
    userPrompt: string,
    cardContext: CardContext[],
    language: Settings['language'],
    aiCoreAnalysisSummary: string | null,
    rawDataSample: CsvRow[],
    longTermMemory: string[],
    dataPreparationPlan: DataPreparationPlan | null
): string => {
    const categoricalCols = columns.filter(c => c.type === 'categorical' || c.type === 'date' || c.type === 'time').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage').map(c => c.name);
    const recentHistory = chatHistory.slice(-10).map(m => `${m.sender === 'ai' ? 'You' : 'User'}: ${m.text}`).join('\n');

    return `
        You are an expert data analyst and business strategist, required to operate using a Reason-Act (ReAct) framework. For every action you take, you must first explain your reasoning in the 'thought' field, and then define the action itself. Your goal is to respond to the user by providing insightful analysis and breaking down your response into a sequence of these thought-action pairs. Your final conversational responses should be in ${language}.
        
        **CORE ANALYSIS BRIEFING (Your Internal Summary):**
        ---
        ${aiCoreAnalysisSummary || "No core analysis has been performed yet."}
        ---
        **DATA PREPARATION LOG (How the raw data was initially cleaned):**
        ---
        ${dataPreparationPlan ? `Explanation: ${dataPreparationPlan.explanation}\nCode Executed: \`\`\`javascript\n${dataPreparationPlan.jsFunctionBody}\n\`\`\`` : "No AI-driven data preparation was performed."}
        ---
        **LONG-TERM MEMORY (Relevant past context, ordered by relevance):**
        ---
        ${longTermMemory.length > 0 ? longTermMemory.join('\n---\n') : "No specific long-term memories seem relevant to this query."}
        ---
        **Your Knowledge Base (Real-time Info):**
        - **Dataset Columns**:
            - Categorical: ${categoricalCols.join(', ')}
            - Numerical: ${numericalCols.join(', ')}
        - **Analysis Cards on Screen (Sample of up to 100 rows each)**:
            ${cardContext.length > 0 ? JSON.stringify(cardContext, null, 2) : "No cards yet."}
        - **Raw Data Sample (first 20 rows):**
            ${rawDataSample.length > 0 ? JSON.stringify(rawDataSample, null, 2) : "No raw data available."}

        **Recent Conversation (for flow):**
        ${recentHistory}

        **The user's latest message is:** "${userPrompt}"

        **Your Available Actions & Tools:**
        You MUST respond by creating a sequence of one or more actions in a JSON object.
        1.  **text_response**: For conversation. If your text explains a specific card, you MUST include its 'cardId'.
        2.  **plan_creation**: To create a NEW chart.
            - **CRITICAL**: For any chart type other than 'scatter', you MUST provide 'groupByColumn' and 'aggregation'.
            - **CRITICAL**: For 'scatter' charts, you MUST provide 'xValueColumn' and 'yValueColumn', and you must NOT provide 'groupByColumn' or 'aggregation'.
            - **CRITICAL**: For 'combo' charts, you MUST provide all fields: 'groupByColumn', 'valueColumn', 'aggregation', 'secondaryValueColumn', and 'secondaryAggregation'.
            - Use a 'defaultTopN' of 8 for readability on high-cardinality columns.
        3.  **dom_action**: To INTERACT with an EXISTING card ('highlightCard', 'changeCardChartType', 'showCardData', 'filterCard').
        4.  **execute_js_code**: For PERMANENT data transformations (creating new columns, deleting rows). This action WILL modify the main dataset and cause ALL charts to regenerate. Use it for requests like "Remove all data from the USA".
        5.  **filter_spreadsheet**: For TEMPORARY, exploratory filtering of the Raw Data Explorer view. This action does NOT modify the main dataset and does NOT affect the analysis cards. Use it for requests like "show me record ORD1001" or "find all entries for Hannah".
        6.  **clarification_request**: To ask the user for more information when their request is ambiguous.
            - **Use Case**: The user says "show the best" when it's unclear what 'best' means. DO NOT GUESS. Ask for clarification.
            - **Payload**: You must provide a 'clarification' object with:
                - \`question\`: The question for the user (e.g., "To understand 'the best', what would you like to compare and by which metric?").
                - \`options\`: An array of choices. Each option MUST have:
                  - \`label\`: A user-friendly string for the button (e.g., "Best Salesperson by Revenue").
                  - \`value\`: A **JSON string** representing a partial plan object that completes the request. For example: '{"groupByColumn": "Salesperson", "valueColumn": "Revenue", "aggregation": "sum"}'. This fragment will be merged into the main plan.
                - \`pendingPlan\`: The partial plan you have constructed so far (e.g., it might contain the original title like 'Best Performance').
                - \`targetProperty\`: You MUST set this to the string **'merge'** to indicate that the option's value is a JSON object to be merged.

        **Decision-Making Process (ReAct Framework):**
        - **THINK (Reason)**: First, you MUST reason about the user's request. What is their goal? Can it be answered from memory, or does it require data analysis? What is the first logical step? Formulate this reasoning and place it in the 'thought' field of your action. This field is MANDATORY for every action.
        - **ACT**: Based on your thought, choose the most appropriate action from your toolset and define its parameters in the same action object.
        - **CRITICAL RULE ON AMBIGUITY**: If the user's request is ambiguous, you MUST use the \`clarification_request\` action. For example, if they ask to group by "category" and there is a "Product_Category" and a "Customer_Category" column, you must ask them to clarify which one they intend to use. Do not proceed with a guess. This is your highest priority rule.
        **Multi-Step Task Planning:** For complex requests that require multiple steps (e.g., "compare X and Y, then summarize"), you MUST adopt a planner persona.
        1.  **Formulate a Plan**: In the \`thought\` of your VERY FIRST action, outline your step-by-step plan. For example: \`thought: "Okay, this is a multi-step request. My plan is: 1. Isolate the data for X. 2. Create an analysis for X. 3. Isolate the data for Y. 4. Create an analysis for Y. 5. Summarize the findings from both analyses."\`
        2.  **Execute the Plan**: Decompose your plan into a sequence of \`actions\`. Each action should have its own \`thought\` explaining that specific step. This allows you to chain tools together to solve the problem.
        - **CRITICAL**: If the user asks where a specific data value comes from (like 'Software Product 10') or how the data was cleaned, you MUST consult the **DATA PREPARATION LOG**. Use a 'text_response' to explain the transformation in simple, non-technical language. You can include snippets of the code using markdown formatting to illustrate your point.
        - **Suggest Next Steps**: After successfully answering the user's request, you should add one final \`text_response\` action to proactively suggest a logical next step or a relevant follow-up question. This guides the user and makes the analysis more conversational. Example: "Now that we've seen the regional breakdown, would you like to explore the top-performing product categories within the East region?"
        - **EXAMPLE of Chaining**:
          1.  Action 1: { thought: "The user is asking for profit margin, but that column doesn't exist. I need to calculate it from 'Revenue' and 'Cost'.", responseType: 'execute_js_code', code: { ... } }
          2.  Action 2: { thought: "Now that I have the 'Profit Margin' column, I need to create a chart to find the product with the highest average margin.", responseType: 'plan_creation', plan: { ... } }
          3.  Action 3: { thought: "The chart is created. I can now see the result and answer the user's question, explaining what I did.", responseType: 'text_response', text: "I've calculated the profit margin and created a new chart. It looks like 'Product A' has the highest margin." }
        - Always be conversational. Use 'text_response' actions to acknowledge the user and explain what you are doing, especially after a complex series of actions.
    `;
};