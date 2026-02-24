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

const getLastNDates = (days) => {
  const today = new Date();
  const result = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString(undefined, {
      weekday: "short",
    });
    result.push({ iso, label });
  }

  return result;
};

const renderWeeklySummary = (cells) => {
  const grid = $("weekly-grid");
  const header = $("weekly-day-header");
  if (!grid || !header) return;

  const days = getLastNDates(7);

  header.innerHTML = "";
  days.forEach((d) => {
    const el = document.createElement("div");
    el.className = "weekly-day-name";
    el.textContent = d.label;
    header.appendChild(el);
  });

  if (!cells.length) {
    grid.innerHTML =
      '<p class="loading-text">No activity in the last 7 days. Add an expense to see this view.</p>';
    return;
  }

  const byCategory = new Map();
  cells.forEach((cell) => {
    const key = cell.category || "Uncategorized";
    if (!byCategory.has(key)) {
      byCategory.set(key, []);
    }
    byCategory.get(key).push(cell);
  });

  const totals = cells.map((c) => c.total || 0);
  const maxTotal = Math.max(...totals, 0);

  const categories = Array.from(byCategory.keys()).sort();

  grid.innerHTML = "";

  categories.forEach((category) => {
    const rowEl = document.createElement("div");
    rowEl.className = "weekly-row";

    const labelEl = document.createElement("div");
    labelEl.className = "weekly-row-label";
    labelEl.textContent = category;

    const stripEl = document.createElement("div");
    stripEl.className = "weekly-day-strip";

    const dataForCategory = byCategory.get(category) || [];

    days.forEach((d) => {
      const cellData = dataForCategory.find((c) => c.date === d.iso);

      const cellEl = document.createElement("div");
      cellEl.className = "weekly-day-cell";

      if (cellData && cellData.total > 0 && maxTotal > 0) {
        const ratio = cellData.total / maxTotal;
        let intensity = "low";
        if (ratio >= 0.66) {
          intensity = "high";
        } else if (ratio >= 0.33) {
          intensity = "medium";
        }
        cellEl.classList.add(`weekly-${intensity}`);
        cellEl.title = `${d.label}: ${formatCurrency(cellData.total)} in ${category}`;
      } else {
        cellEl.classList.add("weekly-empty");
        cellEl.title = `${d.label}: no spending in ${category}`;
      }

      stripEl.appendChild(cellEl);
    });

    rowEl.appendChild(labelEl);
    rowEl.appendChild(stripEl);
    grid.appendChild(rowEl);
  });
};

const loadWeeklySummary = async () => {
  const grid = $("weekly-grid");
  if (!grid) return;

  grid.innerHTML = '<p class="loading-text">Loading weekly overview...</p>';

  try {
    const cells = await apiGet("/api/summary/weekly", { days: 7 });
    renderWeeklySummary(cells);
  } catch (error) {
    console.error(error);
    grid.innerHTML =
      '<p class="loading-text">Could not load weekly overview right now.</p>';
  }
};

let monthlyChart;

const buildTrendChart = (labels, values) => {
  const canvas = document.getElementById("monthly-chart");
  if (!canvas || !(window.Chart instanceof Object)) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const data = {
    labels,
    datasets: [
      {
        label: "Total spent",
        data: values,
        borderColor: "#4ECDC4",
        backgroundColor: "rgba(78, 205, 196, 0.15)",
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctxTooltip) => formatCurrency(ctxTooltip.parsed.y || 0),
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true,
        },
      },
      y: {
        grid: {
          color: "rgba(0, 0, 0, 0.04)",
        },
        ticks: {
          callback: (value) => formatCurrency(value),
        },
      },
    },
  };

  if (monthlyChart) {
    monthlyChart.data = data;
    monthlyChart.options = options;
    monthlyChart.update();
  } else {
    monthlyChart = new Chart(ctx, {
      type: "line",
      data,
      options,
    });
  }
};

const setActiveTrendButton = (months) => {
  const buttons = document.querySelectorAll(".trend-range-button");
  buttons.forEach((btn) => {
    const value = Number(btn.getAttribute("data-trend-months") || "0");
    const isActive = value === months;
    btn.classList.toggle("trend-range-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
};

const loadMonthlyTrend = async (months = 12) => {
  const wrapper = document.querySelector(".trend-chart-wrapper");
  if (!wrapper) return;

  const category = $("filter-category")?.value || "";

  try {
    const rows = await apiGet("/api/summary/monthly", {
      months,
      category,
    });

    if (!rows.length) {
      wrapper.classList.add("trend-empty");
      if (monthlyChart) {
        monthlyChart.destroy();
        monthlyChart = null;
      }
      return;
    }

    wrapper.classList.remove("trend-empty");

    const labels = rows.map((row) =>
      new Date(row.month).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      }),
    );
    const values = rows.map((row) => row.total || 0);

    buildTrendChart(labels, values);
  } catch (error) {
    console.error(error);
  }
};

const handleTrendRangeButtons = () => {
  const buttons = document.querySelectorAll(".trend-range-button");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = Number(btn.getAttribute("data-trend-months") || "12");
      setActiveTrendButton(value);
      await loadMonthlyTrend(value);
    });
  });
};

const initNav = () => {
  const links = document.querySelectorAll(".app-nav-link");
  if (!links.length) return;

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("data-section");
      if (!targetId) return;

      const section = document.getElementById(targetId);
      if (!section) return;

      event.preventDefault();

      links.forEach((l) => l.classList.remove("app-nav-link-active"));
      link.classList.add("app-nav-link-active");

      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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

const updateNavUser = (user) => {
  const navUser = document.getElementById("nav-user");
  const status = document.getElementById("auth-status");
  const logoutButton = document.getElementById("logout-button");
  if (!navUser || !status || !logoutButton) return;

  if (!user) {
    navUser.textContent = "Guest";
    status.textContent = "You are browsing as a guest.";
    logoutButton.hidden = true;
    return;
  }

  const label = user.email || user.phone || `User #${user.id}`;
  navUser.innerHTML = `<span class="app-nav-user-pill">${label}</span>`;
  status.textContent = `Signed in as ${label}`;
  logoutButton.hidden = false;
};

const fetchCurrentUser = async () => {
  try {
    const data = await apiGet("/api/auth/me");
    updateNavUser(data.user);
  } catch {
    updateNavUser(null);
  }
};

const handleAuthForms = () => {
  const googleForm = document.getElementById("google-login-form");
  const phoneForm = document.getElementById("phone-login-form");
  const logoutButton = document.getElementById("logout-button");

  if (googleForm) {
    googleForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const emailInput = document.getElementById("google-email");
      const email = emailInput?.value.trim();
      if (!email) return;

      try {
        const { user } = await apiPost("/api/auth/google-dev", { email });
        updateNavUser(user);
      } catch (error) {
        console.error(error);
        showNotification("Google login failed (demo mode).", "error");
      }
    });
  }

  if (phoneForm) {
    phoneForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const phoneInput = document.getElementById("phone-number");
      const phone = phoneInput?.value.trim();
      if (!phone) return;

      try {
        const { user } = await apiPost("/api/auth/phone", { phone });
        updateNavUser(user);
      } catch (error) {
        console.error(error);
        showNotification("Phone login failed (demo mode).", "error");
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await apiPost("/api/auth/logout", {});
      } catch {
        // ignore
      }
      updateNavUser(null);
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
  handleTrendRangeButtons();
  initNav();
  handleAuthForms();
  await fetchCurrentUser();

  const currencySelect = $("currency-select");
  if (currencySelect) {
    currencySelect.addEventListener("change", () => {
      loadAllData();
      loadWeeklySummary();
      loadMonthlyTrend();
    });
  }

  await loadAllData();
  await loadWeeklySummary();
  await loadMonthlyTrend(12);
});

