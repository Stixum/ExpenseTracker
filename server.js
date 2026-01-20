const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(__dirname));

// Initialize data file if it doesn't exist
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = {
            expenses: [],
            recurring: [],
            categories: [
                'Housing',
                'Utilities',
                'Credit Cards / Bills',
                'Groceries',
                'Dining',
                'Transportation',
                'Entertainment',
                'Other'
            ]
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
}

function readData() {
    initDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get expenses for a month
app.get('/api/expenses', (req, res) => {
    const { month } = req.query; // Format: 2026-01
    const data = readData();

    if (month) {
        const filtered = data.expenses.filter(exp => exp.date.startsWith(month));
        res.json(filtered);
    } else {
        res.json(data.expenses);
    }
});

// Add expense
app.post('/api/expenses', (req, res) => {
    const data = readData();
    const expense = {
        id: uuidv4(),
        date: req.body.date,
        description: req.body.description,
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        paidBy: req.body.paidBy,
        shared: req.body.shared,
        recurringId: req.body.recurringId || null
    };
    data.expenses.push(expense);
    writeData(data);
    res.json(expense);
});

// Update expense
app.put('/api/expenses/:id', (req, res) => {
    const data = readData();
    const index = data.expenses.findIndex(exp => exp.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Expense not found' });
    }

    data.expenses[index] = {
        ...data.expenses[index],
        date: req.body.date,
        description: req.body.description,
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        paidBy: req.body.paidBy,
        shared: req.body.shared
    };
    writeData(data);
    res.json(data.expenses[index]);
});

// Delete expense
app.delete('/api/expenses/:id', (req, res) => {
    const data = readData();
    const index = data.expenses.findIndex(exp => exp.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Expense not found' });
    }

    data.expenses.splice(index, 1);
    writeData(data);
    res.json({ success: true });
});

// Get recurring templates
app.get('/api/recurring', (req, res) => {
    const data = readData();
    res.json(data.recurring);
});

// Add recurring template
app.post('/api/recurring', (req, res) => {
    const data = readData();
    const template = {
        id: uuidv4(),
        description: req.body.description,
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        paidBy: req.body.paidBy,
        shared: req.body.shared,
        dayOfMonth: parseInt(req.body.dayOfMonth)
    };
    data.recurring.push(template);
    writeData(data);
    res.json(template);
});

// Update recurring template
app.put('/api/recurring/:id', (req, res) => {
    const data = readData();
    const index = data.recurring.findIndex(rec => rec.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Template not found' });
    }

    data.recurring[index] = {
        ...data.recurring[index],
        description: req.body.description,
        amount: parseFloat(req.body.amount),
        category: req.body.category,
        paidBy: req.body.paidBy,
        shared: req.body.shared,
        dayOfMonth: parseInt(req.body.dayOfMonth)
    };
    writeData(data);
    res.json(data.recurring[index]);
});

// Delete recurring template
app.delete('/api/recurring/:id', (req, res) => {
    const data = readData();
    const index = data.recurring.findIndex(rec => rec.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Template not found' });
    }

    data.recurring.splice(index, 1);
    writeData(data);
    res.json({ success: true });
});

// Apply recurring templates to a month
app.post('/api/recurring/apply', (req, res) => {
    const { month } = req.query; // Format: 2026-01
    if (!month) {
        return res.status(400).json({ error: 'Month parameter required' });
    }

    const data = readData();
    const applied = [];

    for (const template of data.recurring) {
        // Check if already applied this month
        const exists = data.expenses.some(exp =>
            exp.recurringId === template.id && exp.date.startsWith(month)
        );

        if (!exists) {
            // Calculate date with proper day handling
            const [year, mon] = month.split('-');
            const daysInMonth = new Date(year, mon, 0).getDate();
            const day = Math.min(template.dayOfMonth, daysInMonth);
            const date = `${month}-${String(day).padStart(2, '0')}`;

            const expense = {
                id: uuidv4(),
                date: date,
                description: template.description,
                amount: template.amount,
                category: template.category,
                paidBy: template.paidBy,
                shared: template.shared,
                recurringId: template.id
            };
            data.expenses.push(expense);
            applied.push(expense);
        }
    }

    writeData(data);
    res.json({ applied: applied.length, expenses: applied });
});

// Get categories
app.get('/api/categories', (req, res) => {
    const data = readData();
    res.json(data.categories);
});

app.listen(PORT, () => {
    initDataFile();
    console.log(`Expense Tracker server running at http://localhost:${PORT}`);
});
