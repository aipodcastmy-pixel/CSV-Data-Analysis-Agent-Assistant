import { AiAction, AnalysisPlan, AggregationType, DomAction, ClarificationRequest } from '../../types';

const ALLOWED_AGGREGATIONS: Set<AggregationType> = new Set(['sum', 'count', 'avg']);

const validatePlanCreation = (plan: AnalysisPlan | undefined): string[] => {
    const errors: string[] = [];
    if (!plan || typeof plan !== 'object') {
        errors.push('The "plan" object is missing or invalid.');
        return errors;
    }

    if (!plan.title) errors.push('"plan.title" is a required string.');
    if (!plan.chartType) errors.push('"plan.chartType" is a required string.');

    if (plan.chartType === 'scatter') {
        if (!plan.xValueColumn) errors.push("For scatter plots, 'xValueColumn' is required.");
        if (!plan.yValueColumn) errors.push("For scatter plots, 'yValueColumn' is required.");
        if (plan.aggregation) errors.push("For scatter plots, 'aggregation' must not be provided.");
        if (plan.groupByColumn) errors.push("For scatter plots, 'groupByColumn' must not be provided.");
    } else if (plan.chartType === 'combo') {
        if (!plan.groupByColumn) errors.push("For combo charts, 'groupByColumn' is required.");
        if (!plan.valueColumn) errors.push("For combo charts, 'valueColumn' is required.");
        if (!plan.aggregation) errors.push("For combo charts, 'aggregation' is required.");
        if (!plan.secondaryValueColumn) errors.push("For combo charts, 'secondaryValueColumn' is required.");
        if (!plan.secondaryAggregation) errors.push("For combo charts, 'secondaryAggregation' is required.");
        if (plan.aggregation && !ALLOWED_AGGREGATIONS.has(plan.aggregation)) {
            errors.push(`Unsupported aggregation type '${plan.aggregation}'. Must be one of: ${[...ALLOWED_AGGREGATIONS].join(', ')}.`);
        }
        if (plan.secondaryAggregation && !ALLOWED_AGGREGATIONS.has(plan.secondaryAggregation)) {
            errors.push(`Unsupported secondaryAggregation type '${plan.secondaryAggregation}'. Must be one of: ${[...ALLOWED_AGGREGATIONS].join(', ')}.`);
        }
    } else { // bar, line, pie, doughnut
        if (!plan.aggregation) errors.push(`For '${plan.chartType}' charts, 'aggregation' is required.`);
        if (!plan.groupByColumn) errors.push(`For '${plan.chartType}' charts, 'groupByColumn' is required.`);
        if (plan.aggregation && !ALLOWED_AGGREGATIONS.has(plan.aggregation)) {
            errors.push(`Unsupported aggregation type '${plan.aggregation}'. Must be one of: ${[...ALLOWED_AGGREGATIONS].join(', ')}.`);
        }
        if (plan.aggregation !== 'count' && !plan.valueColumn) {
            errors.push(`For '${plan.aggregation}' aggregation, 'valueColumn' is required.`);
        }
    }
    return errors;
};

const validateDomAction = (domAction: DomAction | undefined, context: { cardIds: string[] }): string[] => {
    const errors: string[] = [];
    if (!domAction) {
        errors.push('The "domAction" object is missing for a "dom_action" responseType.');
        return errors;
    }
    if (!domAction.toolName) errors.push('"domAction.toolName" is required.');
    if (!domAction.args || !domAction.args.cardId) {
        errors.push('"domAction.args.cardId" is required.');
    } else if (!context.cardIds.includes(domAction.args.cardId)) {
        errors.push(`"domAction.args.cardId" ('${domAction.args.cardId}') is invalid. It must be one of the existing card IDs: [${context.cardIds.join(', ')}].`);
    }

    if (domAction.toolName === 'changeCardChartType' && !domAction.args.newType) {
        errors.push("For 'changeCardChartType', 'domAction.args.newType' is required.");
    }
    if (domAction.toolName === 'showCardData' && typeof domAction.args.visible !== 'boolean') {
        errors.push("For 'showCardData', 'domAction.args.visible' is required and must be a boolean.");
    }
    if (domAction.toolName === 'filterCard') {
        if (!domAction.args.column) errors.push("For 'filterCard', 'domAction.args.column' is required.");
        if (!Array.isArray(domAction.args.values)) errors.push("For 'filterCard', 'domAction.args.values' is required and must be an array.");
    }
    return errors;
};

const validateExecuteJsCode = (code: { explanation: string; jsFunctionBody: string; } | undefined): string[] => {
    const errors: string[] = [];
    if (!code) errors.push('The "code" object is missing for an "execute_js_code" responseType.');
    else {
        if (!code.explanation) errors.push('"code.explanation" is required.');
        if (!code.jsFunctionBody) errors.push('"code.jsFunctionBody" is required.');
    }
    return errors;
};

const validateFilterSpreadsheet = (args: { query: string; } | undefined): string[] => {
    const errors: string[] = [];
    if (!args) errors.push('The "args" object is missing for a "filter_spreadsheet" responseType.');
    else if (!args.query) errors.push('"args.query" is required.');
    return errors;
};

const validateClarificationRequest = (clarification: ClarificationRequest | undefined): string[] => {
    const errors: string[] = [];
    if (!clarification) {
        errors.push('The "clarification" object is missing for a "clarification_request" responseType.');
        return errors;
    }
    if (!clarification.question) errors.push('"clarification.question" is required.');
    if (!clarification.pendingPlan) errors.push('"clarification.pendingPlan" is required.');
    if (!clarification.targetProperty) errors.push('"clarification.targetProperty" is required.');
    if (!Array.isArray(clarification.options) || clarification.options.length === 0) {
        errors.push('"clarification.options" must be a non-empty array.');
    } else {
        clarification.options.forEach((opt, i) => {
            if (!opt.label) errors.push(`Option ${i} is missing "label".`);
            if (!opt.value) errors.push(`Option ${i} is missing "value".`);
        });
    }
    return errors;
};

export const validateAction = (action: AiAction, context: { cardIds: string[] }): { isValid: boolean; errors: string } => {
    const allErrors: string[] = [];
    if (!action.thought) {
        allErrors.push("The 'thought' field is mandatory for every action.");
    }
    if (!action.responseType) {
        allErrors.push("The 'responseType' field is mandatory for every action.");
    }

    switch (action.responseType) {
        case 'plan_creation':
            allErrors.push(...validatePlanCreation(action.plan));
            break;
        case 'dom_action':
            allErrors.push(...validateDomAction(action.domAction, context));
            break;
        case 'execute_js_code':
            allErrors.push(...validateExecuteJsCode(action.code));
            break;
        case 'filter_spreadsheet':
            allErrors.push(...validateFilterSpreadsheet(action.args));
            break;
        case 'clarification_request':
            allErrors.push(...validateClarificationRequest(action.clarification));
            break;
        case 'text_response':
            if (!action.text) allErrors.push('The "text" field is required for "text_response".');
            if (action.cardId && !context.cardIds.includes(action.cardId)) {
                allErrors.push(`"cardId" ('${action.cardId}') is invalid. It must be one of the existing card IDs: [${context.cardIds.join(', ')}].`);
            }
            break;
    }

    if (allErrors.length > 0) {
        const title = action.plan?.title || action.domAction?.toolName || action.responseType;
        return { isValid: false, errors: `- Action "${title}" (thought: "${action.thought || 'N/A'}") failed validation:\n  - ${allErrors.join('\n  - ')}` };
    }
    return { isValid: true, errors: '' };
};
