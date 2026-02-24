## Expense Tracker Ultimate – Backend + PostgreSQL

This project is now split into:

- **Static frontend**: `index-ultimate.html`, `styles-ultimate.css`, `script-enhanced.js`
- **TypeScript backend**: `backend/src/server.ts` (Node + Express + PostgreSQL)

### 1. Prerequisites

- Node.js (v18+ recommended)
- PostgreSQL running locally or in the cloud

### 2. PostgreSQL setup

Create a database and a user (example):

```sql
CREATE DATABASE expense_tracker;
CREATE USER expense_user WITH PASSWORD 'your-strong-password';
GRANT ALL PRIVILEGES ON DATABASE expense_tracker TO expense_user;
```

Then create a `.env` file in the project root (same folder as `package.json`):

```bash
DATABASE_URL=postgres://expense_user:your-strong-password@localhost:5432/expense_tracker
PORT=4000
```

The backend will automatically create the `expenses` table on first start.

### 3. Install dependencies

From the project root (`expense-tracker`):

```bash
npm install
```

### 4. Run the backend (TypeScript)

For development (auto‑reload with `nodemon` + `ts-node`):

```bash
Npm DEV run
```

The API and static frontend will be served from:

- `http://localhost:4000` (index page)
- `http://localhost:4000/api/expenses` (REST API)

### 5. Build and run in JS (optional)

To build the backend to plain JavaScript and run it:

```bash
npm run build:backend
npm start
```

### 6. Main API endpoints

- **GET** `/api/health` – quick health check
- **GET** `/api/expenses` – list expenses (supports `category`, `startDate`, `endDate` query params)
- **POST** `/api/expenses` – create a new expense
  - body: `{ description, amount, category, currency, date }`
- **GET** `/api/expenses/stats` – totals, average, highest, count
- **GET** `/api/expenses/breakdown` – totals per category

The frontend (`script-enhanced.js`) calls these endpoints to:

- Load and filter the expense list
- Show total/average/highest stats
- Render the category breakdown cards
- Add new expenses via the form

# Expense-Tracker
