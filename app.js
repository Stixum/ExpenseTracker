// AWS Configuration
const AWS_CONFIG = {
    region: 'us-east-1',
    userPoolId: 'us-east-1_ht0lMz8s1',
    clientId: '2s7jrh68ad4obdlplq23tkls2h',
    apiEndpoint: 'https://1vu0o2j8ej.execute-api.us-east-1.amazonaws.com/prod'
};

// Cognito setup
const poolData = {
    UserPoolId: AWS_CONFIG.userPoolId,
    ClientId: AWS_CONFIG.clientId
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
let currentUser = null;
let idToken = null;

// State
let currentDate = new Date();
let expenses = [];
let recurring = [];

// Static categories (no longer fetched from API)
const categories = [
    'Housing',
    'Utilities',
    'Credit Cards / Bills',
    'Groceries',
    'Dining',
    'Transportation',
    'Entertainment',
    'Other'
];

// DOM Elements
const currentMonthEl = document.getElementById('currentMonth');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const expensesListEl = document.getElementById('expensesList');
const addExpenseBtn = document.getElementById('addExpenseBtn');
const manageRecurringBtn = document.getElementById('manageRecurringBtn');
const applyRecurringBtn = document.getElementById('applyRecurringBtn');

// Expense Modal Elements
const expenseModal = document.getElementById('expenseModal');
const expenseForm = document.getElementById('expenseForm');
const expenseModalTitle = document.getElementById('expenseModalTitle');
const cancelExpenseBtn = document.getElementById('cancelExpense');

// Recurring Modal Elements
const recurringModal = document.getElementById('recurringModal');
const recurringForm = document.getElementById('recurringForm');
const recurringListEl = document.getElementById('recurringList');
const closeRecurringBtn = document.getElementById('closeRecurring');

// Auth elements
const userEmailDisplay = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const userMenu = document.querySelector('.user-menu');

// Authentication Functions
function checkAuthState() {
    currentUser = userPool.getCurrentUser();

    if (currentUser) {
        currentUser.getSession((err, session) => {
            if (err || !session.isValid()) {
                window.location.href = 'login.html';
                return;
            }

            idToken = session.getIdToken().getJwtToken();
            const email = session.getIdToken().payload.email;
            onAuthSuccess(email);
        });
    } else {
        window.location.href = 'login.html';
    }
}

function onAuthSuccess(email) {
    if (userMenu) userMenu.style.display = 'flex';
    if (userEmailDisplay) userEmailDisplay.textContent = email;
    initApp();
}

function logout() {
    if (currentUser) {
        currentUser.signOut();
    }
    window.location.href = 'login.html';
}

// API Request Helper
async function apiRequest(method, path, body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${AWS_CONFIG.apiEndpoint}${path}`, options);

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    return response.json();
}

// Utility Functions
function formatCurrency(amount) {
    return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthString() {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function getMonthDisplay() {
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// API Functions
async function fetchExpenses() {
    try {
        expenses = await apiRequest('GET', `/expenses?month=${getMonthString()}`);
        renderExpenses();
        updateSummary();
    } catch (error) {
        console.error('Failed to load expenses:', error);
        expenses = [];
        renderExpenses();
        updateSummary();
    }
}

async function fetchRecurring() {
    try {
        recurring = await apiRequest('GET', '/recurring');
        renderRecurring();
    } catch (error) {
        console.error('Failed to load recurring templates:', error);
        recurring = [];
        renderRecurring();
    }
}

async function saveExpense(data) {
    const id = document.getElementById('expenseId').value;

    try {
        if (id) {
            await apiRequest('PUT', `/expenses/${id}`, data);
        } else {
            await apiRequest('POST', '/expenses', data);
        }

        closeModal(expenseModal);
        fetchExpenses();
    } catch (error) {
        console.error('Failed to save expense:', error);
        alert('Failed to save expense. Please try again.');
    }
}

async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;

    try {
        await apiRequest('DELETE', `/expenses/${id}`);
        fetchExpenses();
    } catch (error) {
        console.error('Failed to delete expense:', error);
        alert('Failed to delete expense. Please try again.');
    }
}

async function saveRecurring(data) {
    const id = document.getElementById('recurringId').value;

    try {
        if (id) {
            await apiRequest('PUT', `/recurring/${id}`, data);
        } else {
            await apiRequest('POST', '/recurring', data);
        }

        document.getElementById('recurringId').value = '';
        recurringForm.reset();
        resetRecurringToggles();
        fetchRecurring();
    } catch (error) {
        console.error('Failed to save recurring template:', error);
        alert('Failed to save recurring template. Please try again.');
    }
}

async function deleteRecurring(id) {
    if (!confirm('Delete this recurring template?')) return;

    try {
        await apiRequest('DELETE', `/recurring/${id}`);
        fetchRecurring();
    } catch (error) {
        console.error('Failed to delete recurring template:', error);
        alert('Failed to delete recurring template. Please try again.');
    }
}

async function applyRecurring() {
    try {
        const result = await apiRequest('POST', `/recurring/apply?month=${getMonthString()}`);

        if (result.applied > 0) {
            alert(`Applied ${result.applied} recurring expense(s) to ${getMonthDisplay()}`);
            fetchExpenses();
        } else {
            alert('No new recurring expenses to apply (already applied or no templates)');
        }
    } catch (error) {
        console.error('Failed to apply recurring templates:', error);
        alert('Failed to apply recurring templates. Please try again.');
    }
}

// Settlement Calculation
function calculateSettlement() {
    let seanPaid = 0;
    let buffyPaid = 0;
    let seanShare = 0;
    let buffyShare = 0;

    for (const expense of expenses) {
        const amount = expense.amount;

        if (expense.paidBy === 'Sean') {
            seanPaid += amount;
        } else {
            buffyPaid += amount;
        }

        if (expense.shared) {
            // Shared: Split 50/50
            seanShare += amount / 2;
            buffyShare += amount / 2;
        } else {
            // Non-shared: the person who didn't pay owes the full amount
            if (expense.paidBy === 'Sean') {
                buffyShare += amount;
            } else {
                seanShare += amount;
            }
        }
    }

    const total = seanPaid + buffyPaid;

    // Calculate what each person owes the other
    // If they paid less than their share, they owe the difference
    const seanOwesBuffy = Math.max(0, seanShare - seanPaid);
    const buffyOwesSean = Math.max(0, buffyShare - buffyPaid);

    // Net settlement (positive = Buffy owes Sean)
    const settlement = buffyOwesSean - seanOwesBuffy;

    return { total, seanPaid, buffyPaid, seanOwesBuffy, buffyOwesSean, settlement };
}

function updateSummary() {
    const { total, seanPaid, buffyPaid, seanOwesBuffy, buffyOwesSean, settlement } = calculateSettlement();

    document.getElementById('totalExpenses').textContent = formatCurrency(total);
    document.getElementById('seanPaid').textContent = formatCurrency(seanPaid);
    document.getElementById('seanOwes').textContent = formatCurrency(seanOwesBuffy);
    document.getElementById('buffyPaid').textContent = formatCurrency(buffyPaid);
    document.getElementById('buffyOwes').textContent = formatCurrency(buffyOwesSean);

    const settlementEl = document.getElementById('settlementText');
    if (Math.abs(settlement) < 0.01) {
        settlementEl.textContent = 'All settled up!';
        settlementEl.className = '';
    } else if (settlement > 0) {
        settlementEl.textContent = `Buffy owes Sean ${formatCurrency(settlement)}`;
        settlementEl.className = 'owes-sean';
    } else {
        settlementEl.textContent = `Sean owes Buffy ${formatCurrency(Math.abs(settlement))}`;
        settlementEl.className = 'owes-buffy';
    }
}

// Render Functions
function renderExpenses() {
    if (expenses.length === 0) {
        expensesListEl.innerHTML = '<div class="empty-state">No expenses for this month</div>';
        return;
    }

    // Group by category
    const grouped = {};
    for (const expense of expenses) {
        if (!grouped[expense.category]) {
            grouped[expense.category] = [];
        }
        grouped[expense.category].push(expense);
    }

    // Sort expenses by date within each category
    for (const cat of Object.keys(grouped)) {
        grouped[cat].sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    let html = '';
    for (const category of categories) {
        if (!grouped[category]) continue;

        const categoryTotal = grouped[category].reduce((sum, exp) => sum + exp.amount, 0);

        html += `
            <div class="category-group">
                <div class="category-header">
                    <span>${category}</span>
                    <span class="category-total">${formatCurrency(categoryTotal)}</span>
                </div>
                ${grouped[category].map(exp => renderExpenseItem(exp)).join('')}
            </div>
        `;
    }

    expensesListEl.innerHTML = html;
}

function renderExpenseItem(expense) {
    const date = new Date(expense.date + 'T00:00:00');
    const dayStr = date.getDate();
    const payerClass = expense.paidBy.toLowerCase();
    const sharedText = expense.shared ? 'Shared' : 'Not shared';

    return `
        <div class="expense-item">
            <span class="expense-date">${dayStr}</span>
            <span class="expense-description">${expense.description}</span>
            <span class="expense-payer ${payerClass}">${expense.paidBy}</span>
            <span class="expense-shared">${sharedText}</span>
            <span class="expense-amount">${formatCurrency(expense.amount)}</span>
            <div class="expense-actions">
                <button onclick="editExpense('${expense.id}')" title="Edit">Edit</button>
                <button class="delete" onclick="deleteExpense('${expense.id}')" title="Delete">Delete</button>
            </div>
        </div>
    `;
}

function renderRecurring() {
    if (recurring.length === 0) {
        recurringListEl.innerHTML = '<div class="empty-state">No recurring templates</div>';
        return;
    }

    recurringListEl.innerHTML = recurring.map(rec => `
        <div class="recurring-item">
            <div class="recurring-info">
                <div class="name">${rec.description}</div>
                <div class="details">
                    Day ${rec.dayOfMonth} | ${rec.category} | ${rec.paidBy} | ${rec.shared ? 'Shared' : 'Not shared'}
                </div>
            </div>
            <span class="recurring-amount">${formatCurrency(rec.amount)}</span>
            <div class="expense-actions">
                <button onclick="editRecurring('${rec.id}')" title="Edit">Edit</button>
                <button class="delete" onclick="deleteRecurring('${rec.id}')" title="Delete">Delete</button>
            </div>
        </div>
    `).join('');
}

function populateCategoryDropdowns() {
    const expenseCategory = document.getElementById('expenseCategory');
    const recurringCategory = document.getElementById('recurringCategory');

    const options = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');

    expenseCategory.innerHTML = options;
    recurringCategory.innerHTML = options;
}

// Modal Functions
function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

function openAddExpenseModal() {
    expenseModalTitle.textContent = 'Add Expense';
    expenseForm.reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseDate').value = getTodayString();
    document.getElementById('expensePaidBy').value = 'Sean';
    document.getElementById('expenseShared').value = 'true';
    resetExpenseToggles();
    openModal(expenseModal);
}

function editExpense(id) {
    const expense = expenses.find(exp => exp.id === id);
    if (!expense) return;

    expenseModalTitle.textContent = 'Edit Expense';
    document.getElementById('expenseId').value = expense.id;
    document.getElementById('expenseDate').value = expense.date;
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expenseCategory').value = expense.category;
    document.getElementById('expensePaidBy').value = expense.paidBy;
    document.getElementById('expenseShared').value = expense.shared.toString();

    // Update toggle buttons
    updateExpenseToggles(expense.paidBy, expense.shared);

    openModal(expenseModal);
}

function editRecurring(id) {
    const rec = recurring.find(r => r.id === id);
    if (!rec) return;

    document.getElementById('recurringId').value = rec.id;
    document.getElementById('recurringDescription').value = rec.description;
    document.getElementById('recurringAmount').value = rec.amount;
    document.getElementById('recurringDay').value = rec.dayOfMonth;
    document.getElementById('recurringCategory').value = rec.category;
    document.getElementById('recurringPaidBy').value = rec.paidBy;
    document.getElementById('recurringShared').value = rec.shared.toString();

    // Update toggle buttons
    updateRecurringToggles(rec.paidBy, rec.shared);
}

// Toggle Button Functions
function setupToggleButtons() {
    // Expense Modal - Paid By
    document.getElementById('paidBySean').addEventListener('click', () => {
        setToggleActive('paidBySean', 'paidByBuffy', 'expensePaidBy', 'Sean');
    });
    document.getElementById('paidByBuffy').addEventListener('click', () => {
        setToggleActive('paidByBuffy', 'paidBySean', 'expensePaidBy', 'Buffy');
    });

    // Expense Modal - Shared
    document.getElementById('sharedYes').addEventListener('click', () => {
        setToggleActive('sharedYes', 'sharedNo', 'expenseShared', 'true');
    });
    document.getElementById('sharedNo').addEventListener('click', () => {
        setToggleActive('sharedNo', 'sharedYes', 'expenseShared', 'false');
    });

    // Recurring Modal - Paid By
    document.getElementById('recPaidBySean').addEventListener('click', () => {
        setToggleActive('recPaidBySean', 'recPaidByBuffy', 'recurringPaidBy', 'Sean');
    });
    document.getElementById('recPaidByBuffy').addEventListener('click', () => {
        setToggleActive('recPaidByBuffy', 'recPaidBySean', 'recurringPaidBy', 'Buffy');
    });

    // Recurring Modal - Shared
    document.getElementById('recSharedYes').addEventListener('click', () => {
        setToggleActive('recSharedYes', 'recSharedNo', 'recurringShared', 'true');
    });
    document.getElementById('recSharedNo').addEventListener('click', () => {
        setToggleActive('recSharedNo', 'recSharedYes', 'recurringShared', 'false');
    });
}

function setToggleActive(activeId, inactiveId, hiddenId, value) {
    document.getElementById(activeId).classList.add('active');
    document.getElementById(inactiveId).classList.remove('active');
    document.getElementById(hiddenId).value = value;
}

function resetExpenseToggles() {
    document.getElementById('paidBySean').classList.add('active');
    document.getElementById('paidByBuffy').classList.remove('active');
    document.getElementById('sharedYes').classList.add('active');
    document.getElementById('sharedNo').classList.remove('active');
}

function resetRecurringToggles() {
    document.getElementById('recPaidBySean').classList.add('active');
    document.getElementById('recPaidByBuffy').classList.remove('active');
    document.getElementById('recSharedYes').classList.add('active');
    document.getElementById('recSharedNo').classList.remove('active');
}

function updateExpenseToggles(paidBy, shared) {
    if (paidBy === 'Sean') {
        document.getElementById('paidBySean').classList.add('active');
        document.getElementById('paidByBuffy').classList.remove('active');
    } else {
        document.getElementById('paidByBuffy').classList.add('active');
        document.getElementById('paidBySean').classList.remove('active');
    }

    if (shared) {
        document.getElementById('sharedYes').classList.add('active');
        document.getElementById('sharedNo').classList.remove('active');
    } else {
        document.getElementById('sharedNo').classList.add('active');
        document.getElementById('sharedYes').classList.remove('active');
    }
}

function updateRecurringToggles(paidBy, shared) {
    if (paidBy === 'Sean') {
        document.getElementById('recPaidBySean').classList.add('active');
        document.getElementById('recPaidByBuffy').classList.remove('active');
    } else {
        document.getElementById('recPaidByBuffy').classList.add('active');
        document.getElementById('recPaidBySean').classList.remove('active');
    }

    if (shared) {
        document.getElementById('recSharedYes').classList.add('active');
        document.getElementById('recSharedNo').classList.remove('active');
    } else {
        document.getElementById('recSharedNo').classList.add('active');
        document.getElementById('recSharedYes').classList.remove('active');
    }
}

// Event Listeners
function setupEventListeners() {
    // Month Navigation
    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        currentMonthEl.textContent = getMonthDisplay();
        fetchExpenses();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentMonthEl.textContent = getMonthDisplay();
        fetchExpenses();
    });

    // Buttons
    addExpenseBtn.addEventListener('click', openAddExpenseModal);
    manageRecurringBtn.addEventListener('click', () => {
        fetchRecurring();
        openModal(recurringModal);
    });
    applyRecurringBtn.addEventListener('click', applyRecurring);

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Expense Modal
    cancelExpenseBtn.addEventListener('click', () => closeModal(expenseModal));
    expenseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveExpense({
            date: document.getElementById('expenseDate').value,
            description: document.getElementById('expenseDescription').value,
            amount: document.getElementById('expenseAmount').value,
            category: document.getElementById('expenseCategory').value,
            paidBy: document.getElementById('expensePaidBy').value,
            shared: document.getElementById('expenseShared').value === 'true'
        });
    });

    // Recurring Modal
    closeRecurringBtn.addEventListener('click', () => closeModal(recurringModal));
    recurringForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveRecurring({
            description: document.getElementById('recurringDescription').value,
            amount: document.getElementById('recurringAmount').value,
            category: document.getElementById('recurringCategory').value,
            paidBy: document.getElementById('recurringPaidBy').value,
            shared: document.getElementById('recurringShared').value === 'true',
            dayOfMonth: document.getElementById('recurringDay').value
        });
    });

    // Close modals on background click
    expenseModal.addEventListener('click', (e) => {
        if (e.target === expenseModal) closeModal(expenseModal);
    });
    recurringModal.addEventListener('click', (e) => {
        if (e.target === recurringModal) closeModal(recurringModal);
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(expenseModal);
            closeModal(recurringModal);
        }
    });
}

// Interactive Tour
const Tour = {
    currentStep: 0,
    overlay: null,
    tooltip: null,
    highlightedElement: null,

    steps: [
        {
            target: '#addExpenseBtn',
            title: 'Add an Expense',
            text: 'Click here to add a new expense. This opens a form where you can enter the details of any purchase or bill.',
            position: 'bottom'
        },
        {
            target: '#expenseModal .modal-content',
            title: 'Expense Details',
            text: 'Fill in the date, description, amount, and category. Choose who paid and whether it\'s a shared expense (split 50/50) or paid on behalf of the other person.',
            position: 'right',
            beforeShow: () => {
                openAddExpenseModal();
            }
        },
        {
            target: '.expenses-section',
            title: 'Expense List',
            text: 'All expenses for the selected month appear here, grouped by category. You can edit or delete any expense using the buttons on each row.',
            position: 'right'
        },
        {
            target: '.summary-sidebar .card.total',
            title: 'Total Expenses',
            text: 'This shows the combined total of all expenses for the month, regardless of who paid.',
            position: 'left'
        },
        {
            target: '.summary-sidebar .card.sean, .summary-sidebar .card.buffy',
            title: 'Individual Breakdown',
            text: '"Paid" shows what each person actually spent. "Owes" shows what they owe the other person based on their share of expenses.',
            position: 'left',
            multipleTargets: true
        },
        {
            target: '.summary-sidebar .card.settlement',
            title: 'Settlement',
            text: 'This is the bottom line! It calculates the difference between what each person paid and what they owe, showing who needs to pay whom to settle up.',
            position: 'left'
        },
        {
            target: '#manageRecurringBtn',
            title: 'Recurring Expenses',
            text: 'Set up recurring expenses like rent or subscriptions. These templates can be applied to any month with one click using the "Apply" button.',
            position: 'bottom'
        },
        {
            target: '.month-selector',
            title: 'Navigate Months',
            text: 'Use these arrows to move between months. Each month tracks expenses separately, making it easy to review past spending or plan ahead.',
            position: 'bottom'
        }
    ],

    init() {
        this.overlay = document.getElementById('tourOverlay');
        this.tooltip = document.getElementById('tourTooltip');
        this.prevBtn = document.getElementById('tourPrev');

        document.getElementById('helpBtn').addEventListener('click', () => this.start());
        document.getElementById('tourSkip').addEventListener('click', () => this.end());
        document.getElementById('tourNext').addEventListener('click', () => this.next());
        document.getElementById('tourPrev').addEventListener('click', () => this.prev());

        // Close tour on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.end();
            }
        });
    },

    start() {
        this.currentStep = 0;
        this.overlay.classList.add('active');
        document.getElementById('tourTotal').textContent = this.steps.length;
        this.showStep();
    },

    end() {
        this.overlay.classList.remove('active');
        this.clearHighlight();
        closeModal(expenseModal);
        expenseModal.classList.remove('tour-active');
    },

    next() {
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.end();
        } else {
            this.showStep();
        }
    },

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep();
        }
    },

    showStep() {
        const step = this.steps[this.currentStep];

        // Clean up from previous step
        this.clearHighlight();
        closeModal(expenseModal);
        expenseModal.classList.remove('tour-active');

        // Run beforeShow if defined
        if (step.beforeShow) {
            step.beforeShow();
        }

        // Small delay to let DOM settle after any changes
        setTimeout(() => this.positionStep(step), 150);
    },

    positionStep(step) {
        // Update content
        document.getElementById('tourTitle').textContent = step.title;
        document.getElementById('tourText').textContent = step.text;
        document.getElementById('tourStep').textContent = this.currentStep + 1;

        // Update button text on last step
        const nextBtn = document.getElementById('tourNext');
        nextBtn.textContent = this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next';

        // Show/hide back button
        this.prevBtn.classList.toggle('hidden', this.currentStep === 0);

        // Handle multiple targets
        const targets = step.multipleTargets
            ? document.querySelectorAll(step.target)
            : [document.querySelector(step.target)];

        if (!targets[0]) {
            this.next();
            return;
        }

        // Handle modal highlighting specially
        if (step.target.includes('modal')) {
            expenseModal.classList.add('tour-active');
        } else {
            expenseModal.classList.remove('tour-active');
        }

        // Highlight elements
        targets.forEach(el => {
            if (el) {
                el.classList.add('tour-highlight');
            }
        });

        // Position tooltip relative to first target
        const target = targets[0];
        const rect = target.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();

        // Remove old arrow classes
        this.tooltip.classList.remove('arrow-top', 'arrow-bottom', 'arrow-left', 'arrow-right');

        let top, left;
        const padding = 20;

        switch (step.position) {
            case 'bottom':
                top = rect.bottom + padding;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                this.tooltip.classList.add('arrow-top');
                break;
            case 'top':
                top = rect.top - tooltipRect.height - padding;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                this.tooltip.classList.add('arrow-bottom');
                break;
            case 'left':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.left - tooltipRect.width - padding;
                this.tooltip.classList.add('arrow-right');
                break;
            case 'right':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.right + padding;
                this.tooltip.classList.add('arrow-left');
                break;
        }

        // Keep tooltip in viewport
        left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
        top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;
    },

    clearHighlight() {
        document.querySelectorAll('.tour-highlight').forEach(el => {
            el.classList.remove('tour-highlight', 'tour-highlight-bg');
        });
    }
};

// Initialize app after authentication
async function initApp() {
    currentMonthEl.textContent = getMonthDisplay();
    setupEventListeners();
    setupToggleButtons();
    Tour.init();
    populateCategoryDropdowns();
    await fetchExpenses();
}

// Make functions available globally for onclick handlers
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.editRecurring = editRecurring;
window.deleteRecurring = deleteRecurring;

// Start authentication check on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
});
