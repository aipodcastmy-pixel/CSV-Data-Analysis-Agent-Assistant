# 🧠 CSV Data Analysis AI Assistant

An intelligent, private, web-based AI assistant that automates CSV data analysis. Upload a `.csv` file and let the agent auto-read, understand, and generate multiple aggregated views, interactive charts, and business intelligence-style reports — all locally in your browser for maximum privacy.

This advanced tool allows users to have a conversation with their data, asking for specific analyses, getting summaries, and even directing the AI to manipulate the UI to better highlight insights.

## ✨ Key Features

*   **Local First & Private**: All CSV processing and data aggregation happens directly in your browser. Your data never leaves your computer unless you enable Cloud AI.
*   **Configurable AI Settings**:
    *   Securely use your own Google Gemini API key.
    *   Switch between `gemini-2.5-flash` (fast) and `gemini-2.5-pro` (powerful).
    *   Choose the agent's response language.
*   **Automated Data Profiling**: Automatically detects column types (numerical vs. categorical) to understand the dataset's structure.
*   **AI-Powered Analysis Generation**: On file upload, the AI assistant proactively generates a set of diverse and insightful analysis plans and visualizes them as cards.
*   **Interactive & Customizable Charts**:
    *   Switch between Bar, Line, and Pie charts on-the-fly for any analysis.
    *   Zoom and pan on charts to explore dense data.
    *   Click on data points to see details and multi-select for comparison.
*   **Conversational AI Chat**: Engage in a dialogue with the AI. Ask for new analyses, inquire about data points, or request summaries. The AI maintains conversation context.
*   **🤖 AI-Powered UI Interaction**: The assistant can directly interact with the UI to guide your analysis. It can:
    *   **Highlight Cards**: Asks the AI to "highlight the card showing sales by region" and it will scroll to it and add a visual highlight.
    *   **Change Visualizations**: Tell the AI to "change the monthly users chart to a line graph".
    *   **Show Raw Data**: Ask to "show me the data for the top products card".
*   **Comprehensive Export Options**: Export any analysis card as a PNG image, a CSV file of the aggregated data, or a full HTML report.
*   **Responsive Design**: A clean, modern interface that works seamlessly on different screen sizes, with a resizable and collapsible assistant panel.

## ⚙️ Configuration

To use the AI-powered features, you need to configure your own Gemini API Key.

1.  Click the **Settings** icon (⚙️) in the top-right of the Assistant panel.
2.  **API Key**: Paste your Google Gemini API key into the input field. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).
3.  **AI Model**: Choose between `gemini-2.5-flash` (faster, for general tasks) and `gemini-2.5-pro` (more powerful, for complex analysis).
4.  **Agent Language**: Select the primary language for the AI's responses and summaries.

Your settings are saved securely in your browser's local storage and are never transmitted anywhere else.

## 🚀 How to Use

1.  **Configure your API Key**: Before you begin, open the settings (⚙️) and add your Gemini API Key.
2.  **Upload a CSV file**: Drag and drop your file or use the file selector.
3.  **Review Auto-Analysis**: If Cloud AI is enabled, the assistant will automatically generate several analysis cards.
4.  **Interact with Charts**:
    *   Use the icons on a card to switch between bar, line, and pie charts.
    *   Use your mouse wheel to zoom and click-and-drag to pan on complex charts.
    *   Click on bars, slices, or points to select them and see detailed data. Hold `Ctrl` or `Cmd` to multi-select.
5.  **Chat with the Assistant**:
    *   Open the side panel to chat. Ask for a new view (e.g., "Count of products by category").
    *   Ask a question about the data (e.g., "What's the average order value?").
    *   Ask the AI to guide you (e.g., "Highlight the most important chart" or "Show me the data for regional sales").
6.  **Export Your Findings**: Use the export menu on any card to save your work as a PNG, CSV, or a full HTML report.

## 🛠️ Tech Stack

*   **Frontend**: React, TypeScript, Tailwind CSS
*   **AI**: Google Gemini API (`gemini-2.5-flash` and `gemini-2.5-pro`)
*   **Charting**: Chart.js with `chartjs-plugin-zoom`
*   **CSV Parsing**: PapaParse
*   **Local Storage**: IndexedDB (for session data) & LocalStorage (for settings) via the `idb` library.