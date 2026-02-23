
import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

const staticRoot = path.resolve(process.cwd());
app.use(express.static(staticRoot));

// Root route handler
app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(staticRoot, "index.html"));
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

const ensureSchema = async () => {
  const createTableSQL = `
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

  await pool.query(createTableSQL);
};

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

