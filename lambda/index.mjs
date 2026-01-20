import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);
const EXPENSES_TABLE = 'ExpenseTracker-Expenses';
const RECURRING_TABLE = 'ExpenseTracker-Recurring';

// CORS headers
const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

export const handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    // HTTP API v2 format
    const method = event.requestContext?.http?.method || event.httpMethod;
    let path = event.rawPath || event.path;
    // Remove stage prefix if present
    path = path.replace(/^\/prod/, '');

    // Handle preflight OPTIONS request
    if (method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Get userId from JWT authorizer
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub ||
                   event.requestContext?.authorizer?.claims?.sub;

    if (!userId) {
        console.log('No userId found in event');
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' })
        };
    }

    try {
        // ============ EXPENSES ENDPOINTS ============

        // GET /expenses - List expenses (optionally filtered by month)
        if (method === 'GET' && path === '/expenses') {
            const month = event.queryStringParameters?.month; // Format: 2026-01

            const result = await docClient.send(new QueryCommand({
                TableName: EXPENSES_TABLE,
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId }
            }));

            let expenses = (result.Items || []).map(item => ({
                id: item.expenseId,
                date: item.date,
                description: item.description,
                amount: item.amount,
                category: item.category,
                paidBy: item.paidBy,
                shared: item.shared,
                recurringId: item.recurringId
            }));

            // Filter by month if provided
            if (month) {
                expenses = expenses.filter(exp => exp.date.startsWith(month));
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(expenses)
            };
        }

        // POST /expenses - Create expense
        if (method === 'POST' && path === '/expenses') {
            const body = JSON.parse(event.body);
            const expenseId = body.id || randomUUID();

            await docClient.send(new PutCommand({
                TableName: EXPENSES_TABLE,
                Item: {
                    userId,
                    expenseId,
                    date: body.date,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    recurringId: body.recurringId || null
                }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    id: expenseId,
                    date: body.date,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    recurringId: body.recurringId || null
                })
            };
        }

        // PUT /expenses/{id} - Update expense
        if (method === 'PUT' && path.match(/^\/expenses\/[^/]+$/)) {
            const expenseId = path.split('/').pop();
            const body = JSON.parse(event.body);

            await docClient.send(new PutCommand({
                TableName: EXPENSES_TABLE,
                Item: {
                    userId,
                    expenseId,
                    date: body.date,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    recurringId: body.recurringId || null
                }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    id: expenseId,
                    date: body.date,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared
                })
            };
        }

        // DELETE /expenses/{id} - Delete expense
        if (method === 'DELETE' && path.match(/^\/expenses\/[^/]+$/)) {
            const expenseId = path.split('/').pop();

            await docClient.send(new DeleteCommand({
                TableName: EXPENSES_TABLE,
                Key: { userId, expenseId }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        // ============ RECURRING ENDPOINTS ============

        // GET /recurring - List recurring templates
        if (method === 'GET' && path === '/recurring') {
            const result = await docClient.send(new QueryCommand({
                TableName: RECURRING_TABLE,
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId }
            }));

            const templates = (result.Items || []).map(item => ({
                id: item.recurringId,
                description: item.description,
                amount: item.amount,
                category: item.category,
                paidBy: item.paidBy,
                shared: item.shared,
                dayOfMonth: item.dayOfMonth
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(templates)
            };
        }

        // POST /recurring - Create recurring template
        if (method === 'POST' && path === '/recurring') {
            const body = JSON.parse(event.body);
            const recurringId = body.id || randomUUID();

            await docClient.send(new PutCommand({
                TableName: RECURRING_TABLE,
                Item: {
                    userId,
                    recurringId,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    dayOfMonth: parseInt(body.dayOfMonth)
                }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    id: recurringId,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    dayOfMonth: parseInt(body.dayOfMonth)
                })
            };
        }

        // PUT /recurring/{id} - Update recurring template
        if (method === 'PUT' && path.match(/^\/recurring\/[^/]+$/)) {
            const recurringId = path.split('/').pop();
            const body = JSON.parse(event.body);

            await docClient.send(new PutCommand({
                TableName: RECURRING_TABLE,
                Item: {
                    userId,
                    recurringId,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    dayOfMonth: parseInt(body.dayOfMonth)
                }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    id: recurringId,
                    description: body.description,
                    amount: parseFloat(body.amount),
                    category: body.category,
                    paidBy: body.paidBy,
                    shared: body.shared,
                    dayOfMonth: parseInt(body.dayOfMonth)
                })
            };
        }

        // DELETE /recurring/{id} - Delete recurring template
        if (method === 'DELETE' && path.match(/^\/recurring\/[^/]+$/)) {
            const recurringId = path.split('/').pop();

            await docClient.send(new DeleteCommand({
                TableName: RECURRING_TABLE,
                Key: { userId, recurringId }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }

        // POST /recurring/apply - Apply recurring templates to a month
        if (method === 'POST' && path === '/recurring/apply') {
            const month = event.queryStringParameters?.month; // Format: 2026-01

            if (!month) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Month parameter required' })
                };
            }

            // Get recurring templates
            const recurringResult = await docClient.send(new QueryCommand({
                TableName: RECURRING_TABLE,
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId }
            }));
            const templates = recurringResult.Items || [];

            // Get existing expenses for this month
            const expensesResult = await docClient.send(new QueryCommand({
                TableName: EXPENSES_TABLE,
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: { ':userId': userId }
            }));
            const existingExpenses = (expensesResult.Items || []).filter(
                exp => exp.date.startsWith(month)
            );

            const applied = [];

            for (const template of templates) {
                // Check if already applied this month
                const exists = existingExpenses.some(
                    exp => exp.recurringId === template.recurringId
                );

                if (!exists) {
                    // Calculate date with proper day handling
                    const [year, mon] = month.split('-');
                    const daysInMonth = new Date(year, mon, 0).getDate();
                    const day = Math.min(template.dayOfMonth, daysInMonth);
                    const date = `${month}-${String(day).padStart(2, '0')}`;

                    const expenseId = randomUUID();
                    const expense = {
                        userId,
                        expenseId,
                        date,
                        description: template.description,
                        amount: template.amount,
                        category: template.category,
                        paidBy: template.paidBy,
                        shared: template.shared,
                        recurringId: template.recurringId
                    };

                    await docClient.send(new PutCommand({
                        TableName: EXPENSES_TABLE,
                        Item: expense
                    }));

                    applied.push({
                        id: expenseId,
                        date,
                        description: template.description,
                        amount: template.amount,
                        category: template.category,
                        paidBy: template.paidBy,
                        shared: template.shared,
                        recurringId: template.recurringId
                    });
                }
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ applied: applied.length, expenses: applied })
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Not found' })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};
