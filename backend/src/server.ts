
import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const staticRoot = path.resolve(process.cwd());
app.use(express.static(staticRoot));

// Root route handler
app.get("/", (req: Request, res: Response) => {
  const user = getUserFromRequest(req);
  if (user) {
    res.sendFile(path.join(staticRoot, "index-ultimate.html"));
    return;
  }
  // not signed in -> show login page
  res.sendFile(path.join(staticRoot, "login.html"));
});

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string | null;
  currency: string | null;
  expense_date: string;
  created_at: string;
}

interface WeeklySummaryRow {
  category: string;
  date: string;
  total: number;
}

interface MonthlySummaryRow {
  month: string;
  total: number;
}

interface AuthUser {
  id: number;
  email: string | null;
  phone: string | null;
  provider: string | null;
}

const createToken = (user: AuthUser) =>
  jwt.sign({ sub: user.id, email: user.email, phone: user.phone }, JWT_SECRET, {
    expiresIn: "7d",
  });

const getUserFromRequest = (req: Request): AuthUser | null => {
  const token = req.cookies?.auth_token as string | undefined;
  if (!token) return null;
  try {
    // jwt.verify can return a string or an object; cast via unknown first to satisfy TS
    const raw = jwt.verify(token, JWT_SECRET) as unknown;
    const payload = raw as { sub?: string | number; email?: string; phone?: string };

    const idNum = typeof payload.sub === "string" ? Number(payload.sub) : payload.sub;
    if (!idNum || Number.isNaN(Number(idNum))) return null;

    return {
      id: Number(idNum),
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      provider: null,
    };
  } catch {
    return null;
  }
};

const ensureSchema = async () => {
  const createExpensesSQL = `
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
      category TEXT,
      currency VARCHAR(10),
      expense_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  const createUsersSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      provider TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createExpensesSQL);
  await pool.query(createUsersSQL);
};

app.get("/api/auth/me", async (req: Request, res: Response) => {
  const user = getUserFromRequest(req);
  if (!user) {
    res.json({ user: null });
    return;
  }

  try {
    const result = await pool.query<AuthUser>(
      "SELECT id, email, phone, provider FROM users WHERE id = $1",
      [user.id],
    );
    if (!result.rowCount) {
      res.json({ user: null });
      return;
    }
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("[GET /api/auth/me] Error", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  res.clearCookie("auth_token", { httpOnly: true, sameSite: "lax" });
  res.json({ success: true });
});

app.post("/api/auth/phone", async (req: Request, res: Response) => {
  try {
    const { phone } = req.body as { phone?: string };
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      res.status(400).json({ message: "Phone number is required" });
      return;
    }

    const cleanPhone = phone.trim();

    const existing = await pool.query<AuthUser>(
      "SELECT id, email, phone, provider FROM users WHERE phone = $1",
      [cleanPhone],
    );

    let user: AuthUser;
    if (existing.rowCount && existing.rows[0]) {
      user = existing.rows[0];
    } else {
      const inserted = await pool.query<AuthUser>(
        "INSERT INTO users (phone, provider) VALUES ($1, $2) RETURNING id, email, phone, provider",
        [cleanPhone, "phone"],
      );
      user = inserted.rows[0];
    }

    const token = createToken(user);
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user });
  } catch (error) {
    console.error("[POST /api/auth/phone] Error", error);
    res.status(500).json({ message: "Failed to sign in with phone" });
  }
});

app.post("/api/auth/google-dev", async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body as { email?: string; name?: string };
    if (!email || typeof email !== "string" || !email.trim()) {
      res.status(400).json({ message: "Email is required" });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const existing = await pool.query<AuthUser>(
      "SELECT id, email, phone, provider FROM users WHERE email = $1",
      [cleanEmail],
    );

    let user: AuthUser;
    if (existing.rowCount && existing.rows[0]) {
      user = existing.rows[0];
    } else {
      const inserted = await pool.query<AuthUser>(
        "INSERT INTO users (email, provider) VALUES ($1, $2) RETURNING id, email, phone, provider",
        [cleanEmail, "google-dev"],
      );
      user = inserted.rows[0];
    }

    const token = createToken(user);
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user, displayName: name ?? cleanEmail });
  } catch (error) {
    console.error("[POST /api/auth/google-dev] Error", error);
    res.status(500).json({ message: "Failed to sign in with Google" });
  }
});

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    console.error("[health] Database error", error);
    res.status(500).json({ status: "error", message: "Database not reachable" });
  }
});

app.get("/api/expenses", async (req: Request, res: Response) => {
  try {
    const { category, startDate, endDate } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (category && typeof category === "string" && category.trim() !== "") {
      conditions.push("category = $1");
      values.push(category);
    }

    if (startDate && typeof startDate === "string") {
      conditions.push(`expense_date >= $${values.length + 1}`);
      values.push(startDate);
    }

    if (endDate && typeof endDate === "string") {
      conditions.push(`expense_date <= $${values.length + 1}`);
      values.push(endDate);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const queryText = `
      SELECT id, description, amount, category, currency, expense_date, created_at
      FROM expenses
      ${whereClause}
      ORDER BY expense_date DESC, created_at DESC
    `;

    const result = await pool.query<Expense>(queryText, values);
    res.json(result.rows);
  } catch (error) {
    console.error("[GET /api/expenses] Error", error);
    res.status(500).json({ message: "Failed to fetch expenses" });
  }
});

app.post("/api/expenses", async (req: Request, res: Response) => {
  try {
    const { description, amount, category, currency, date } = req.body as {
      description?: string;
      amount?: number;
      category?: string;
      currency?: string;
      date?: string;
    };

    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ message: "Description is required" });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: "Amount must be a non-negative number" });
    }

    if (!date || typeof date !== "string") {
      return res.status(400).json({ message: "Date is required" });
    }

    const insertSQL = `
      INSERT INTO expenses (description, amount, category, currency, expense_date)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, description, amount, category, currency, expense_date, created_at
    `;

    const values = [
      description.trim(),
      numericAmount,
      category ?? null,
      currency ?? null,
      date,
    ];

    const result = await pool.query<Expense>(insertSQL, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("[POST /api/expenses] Error", error);
    res.status(500).json({ message: "Failed to create expense" });
  }
});

app.get("/api/expenses/stats", async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT
        COALESCE(SUM(amount), 0) AS total,
        COALESCE(AVG(amount), 0) AS average,
        COALESCE(MAX(amount), 0) AS highest,
        COUNT(*) AS count
      FROM expenses
    `;

    const result = await pool.query(sql);
    const row = result.rows[0] as {
      total: string;
      average: string;
      highest: string;
      count: string;
    };

    res.json({
      total: Number(row.total ?? 0),
      average: Number(row.average ?? 0),
      highest: Number(row.highest ?? 0),
      count: Number(row.count ?? 0),
    });
  } catch (error) {
    console.error("[GET /api/expenses/stats] Error", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

app.get("/api/expenses/breakdown", async (_req: Request, res: Response) => {
  try {
    const sql = `
      SELECT
        COALESCE(category, 'Uncategorized') AS category,
        SUM(amount) AS total,
        COUNT(*) AS count
      FROM expenses
      GROUP BY COALESCE(category, 'Uncategorized')
      ORDER BY total DESC
    `;

    const result = await pool.query(sql);
    const rows = result.rows.map((row: { category: string; total: string; count: string }) => ({
      category: row.category as string,
      total: Number(row.total ?? 0),
      count: Number(row.count ?? 0),
    }));

    res.json(rows);
  } catch (error) {
    console.error("[GET /api/expenses/breakdown] Error", error);
    res.status(500).json({ message: "Failed to fetch breakdown" });
  }
});

app.get("/api/summary/weekly", async (req: Request, res: Response) => {
  try {
    const daysParam =
      typeof req.query.days === "string" ? Number.parseInt(req.query.days, 10) : NaN;

    let days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 7;
    if (days > 31) {
      days = 31;
    }

    const sql = `
      SELECT
        COALESCE(category, 'Uncategorized') AS category,
        expense_date::date AS date,
        SUM(amount) AS total
      FROM expenses
      WHERE expense_date >= CURRENT_DATE - ($1::int - 1)
      GROUP BY COALESCE(category, 'Uncategorized'), expense_date::date
      ORDER BY date ASC, category ASC
    `;

    const result = await pool.query(sql, [days]);
    const rows: WeeklySummaryRow[] = result.rows.map(
      (row: { category: string; date: string; total: string }) => ({
        category: row.category,
        date: row.date,
        total: Number(row.total ?? 0),
      }),
    );

    res.json(rows);
  } catch (error) {
    console.error("[GET /api/summary/weekly] Error", error);
    res.status(500).json({ message: "Failed to fetch weekly summary" });
  }
});

app.get("/api/summary/monthly", async (req: Request, res: Response) => {
  try {
    const monthsParam =
      typeof req.query.months === "string" ? Number.parseInt(req.query.months, 10) : NaN;

    let months = Number.isFinite(monthsParam) && monthsParam > 0 ? monthsParam : 12;
    if (months > 24) {
      months = 24;
    }

    const categoryParam =
      typeof req.query.category === "string" && req.query.category.trim() !== ""
        ? req.query.category
        : null;

    const sql = `
      SELECT
        date_trunc('month', expense_date)::date AS month,
        SUM(amount) AS total
      FROM expenses
      WHERE expense_date >= (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 month')
        AND ($2::text IS NULL OR category = $2)
      GROUP BY month
      ORDER BY month ASC
    `;

    const result = await pool.query(sql, [months, categoryParam]);
    const rows: MonthlySummaryRow[] = result.rows.map(
      (row: { month: string; total: string }) => ({
        month: row.month,
        total: Number(row.total ?? 0),
      }),
    );

    res.json(rows);
  } catch (error) {
    console.error("[GET /api/summary/monthly] Error", error);
    res.status(500).json({ message: "Failed to fetch monthly summary" });
  }
});

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Expense Tracker backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database schema", error);
    process.exit(1);
  });

