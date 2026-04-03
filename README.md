# ET–Alsawan Coordination

Internal coordination tool between **Ethiopian Airlines Kuwait** and **Alsawan Group** for managing Saudi transit passenger groups.

## Stack

- **Frontend**: React 18 + Vite
- **Backend**: Express (Node.js, ES modules)
- **Database**: PostgreSQL

## Getting started

### 1. Set up the database

Run `db/schema.sql` against your PostgreSQL instance once:

```bash
psql $DATABASE_URL -f db/schema.sql
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PORT` | Express server port (default: 3000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `ET_PASSWORD` | Shared password for Ethiopian Kuwait role |
| `ALSAWAN_PASSWORD` | Shared password for Alsawan Group role |

### 3. Install dependencies

```bash
npm install
```

### 4. Development

```bash
npm run dev        # Vite dev server (port 5173, proxies /api to :3000)
node server.js     # Express API server (port 3000)
```

### 5. Production build

```bash
npm run build      # Builds frontend to dist/
npm start          # Serves API + static dist/
```

## Deploying on Render

1. Create a **PostgreSQL** service and copy the connection string.
2. Create a **Web Service** pointing to this repo.
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
3. Set environment variables: `DATABASE_URL`, `ET_PASSWORD`, `ALSAWAN_PASSWORD`.

## Roles

| Role | Access |
|---|---|
| **ET** (Ethiopian Kuwait) | Create/edit trip groups, manage passenger PNR/ticket entries, view transport details |
| **ALSAWAN** | View trip groups and passengers, set vehicle type, per-pax cost (KWD), bag limits, transport status |
