const API_BASE = "";

const $ = (id) => document.getElementById(id);

const formatCurrency = (amount) => {
  const currencySelect = $("currency-select");
  const code = currencySelect?.value || "USD";

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return `${code} ${Number(amount || 0).toFixed(2)}`;
  }
};

const showNotification = (message, type = "success") => {
  const el = $("notification");
  if (!el) return;

  el.textContent = message;
  el.classList.remove("success", "error");
  el.classList.add(type);
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 3500);
};

const apiGet = async (path, params = {}) => {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`GET ${path} failed`);
  }
  return response.json();
};

const apiPost = async (path, body) => {
  const response = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody.message || `POST ${path} failed`;
    throw new Error(message);
  }

  return response.json();
};

const renderExpenses = (expenses) => {
  const container = $("expenses-list");
  if (!container) return;

  if (!expenses.length) {
    container.innerHTML =
      '<p class="loading-text">No expenses yet. Add your first one above! ✨</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  expenses.forEach((exp) => {
    const item = document.createElement("div");
    item.className = "expense-item";

    const info = document.createElement("div");
    info.className = "expense-info";

    const desc = document.createElement("div");
    desc.className = "expense-description";
    desc.textContent = exp.description;

    const category = document.createElement("div");
    category.className = "expense-category";
    category.textContent = exp.category || "Uncategorized";

    const date = document.createElement("div");
    date.className = "expense-date";
    date.textContent = new Date(exp.expense_date || exp.created_at).toLocaleDateString();

    info.appendChild(desc);
    info.appendChild(category);
    info.appendChild(date);

    const amount = document.createElement("div");
    amount.className = "expense-amount";
    amount.textContent = formatCurrency(exp.amount);

    const currency = document.createElement("div");
    currency.className = "expense-currency";
    currency.textContent = (exp.currency || $("currency-select")?.value || "USD").toUpperCase();

    item.appendChild(info);
    item.appendChild(amount);
    item.appendChild(currency);

    fragment.appendChild(item);
  });

  container.innerHTML = "";
  container.appendChild(fragment);
};

const renderStats = (stats) => {
  const total = $("total-spent");
  const avg = $("average-spent");
  const highest = $("highest-spent");
  const count = $("total-count");

  if (total) total.textContent = formatCurrency(stats.total || 0);
  if (avg) avg.textContent = formatCurrency(stats.average || 0);
  if (highest) highest.textContent = formatCurrency(stats.highest || 0);
  if (count) count.textContent = `${stats.count || 0} expenses`;
};

const renderBreakdown = (rows) => {
  const container = $("category-breakdown");
  if (!container) return;

  if (!rows.length) {
    container.innerHTML =
      '<p class="loading-text">No data yet. Your categories will appear here once you add expenses.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "category-card";

    const name = document.createElement("div");
    name.className = "category-name";
    name.textContent = row.category;

    const total = document.createElement("div");
    total.className = "category-total";
    total.textContent = formatCurrency(row.total);

    const count = document.createElement("div");
    count.className = "category-count";
    count.textContent = `${row.count} item${row.count === 1 ? "" : "s"}`;

    card.appendChild(name);
    card.appendChild(total);
    card.appendChild(count);

    fragment.appendChild(card);
  });

  container.innerHTML = "";
  container.appendChild(fragment);
};

const loadAllData = async () => {
  const expensesList = $("expenses-list");
  const categoryGrid = $("category-breakdown");

  if (expensesList) {
    expensesList.innerHTML = '<p class="loading-text">Loading expenses...</p>';
  }
  if (categoryGrid) {
    categoryGrid.innerHTML = '<p class="loading-text">Loading categories...</p>';
  }

  const filterCategory = $("filter-category")?.value || "";
  const startDate = $("filter-start-date")?.value || "";
  const endDate = $("filter-end-date")?.value || "";

  try {
    const [expenses, stats, breakdown] = await Promise.all([
      apiGet("/api/expenses", {
        category: filterCategory,
        startDate,
        endDate,
      }),
      apiGet("/api/expenses/stats"),
      apiGet("/api/expenses/breakdown"),
    ]);

    renderExpenses(expenses);
    renderStats(stats);
    renderBreakdown(breakdown);
  } catch (error) {
    console.error(error);
    showNotification("Failed to load data from the server.", "error");
  }
};

const handleFormSubmit = () => {
  const form = $("expense-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const description = $("description")?.value.trim();
    const amount = Number($("amount")?.value || 0);
    const category = $("category")?.value || "";
    const date = $("expense-date")?.value;
    const currency = $("currency-select")?.value || "USD";

    if (!description || !amount || !date || !category) {
      showNotification("Please fill in all required fields.", "error");
      return;
    }

    try {
      await apiPost("/api/expenses", {
        description,
        amount,
        category,
        currency,
        date,
      });

      showNotification("Expense added successfully! 🎉", "success");
      form.reset();

      const today = new Date().toISOString().split("T")[0];
      if ($("expense-date")) {
        $("expense-date").value = today;
      }

      await loadAllData();
    } catch (error) {
      console.error(error);
      showNotification(error.message || "Failed to add expense.", "error");
    }
  });
};

const handleFilters = () => {
  const applyBtn = $("apply-filter");
  const resetBtn = $("reset-filter");

  if (applyBtn) {
    applyBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      await loadAllData();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", async (event) => {
      event.preventDefault();

      if ($("filter-category")) $("filter-category").value = "";
      if ($("filter-start-date")) $("filter-start-date").value = "";
      if ($("filter-end-date")) $("filter-end-date").value = "";

      await loadAllData();
    });
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const today = new Date().toISOString().split("T")[0];
  if ($("expense-date")) {
    $("expense-date").value = today;
  }

  handleFormSubmit();
  handleFilters();

  const currencySelect = $("currency-select");
  if (currencySelect) {
    currencySelect.addEventListener("change", () => {
      loadAllData();
    });
  }

  await loadAllData();
});

