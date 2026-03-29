# library-api-bun-elysia-pg

REST API for a Library Management System built with **Bun**, **Elysia**, **TypeScript** and **PostgreSQL**. Features JWT authentication, role-based access control, book borrowing/returns with row-level locking, and automatic fine calculation.

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Runtime     | Bun                               |
| Framework   | Elysia                            |
| Language    | TypeScript                        |
| Database    | PostgreSQL                        |
| Auth        | JWT + bcryptjs                    |
| Validation  | Elysia `t.*` schema (built-in)    |

---

## Features

- **JWT Authentication** — register, login, protected routes
- **Role-based access** — `admin` and `member` roles with middleware guards
- **Book management** — full CRUD with search, genre filter, and availability filter
- **Borrow system** — transactional borrow/return with row-level `FOR UPDATE` locking
- **Fine engine** — auto-calculates overdue fines on return (configurable rate + period)
- **Fine enforcement** — members with unpaid fines cannot borrow new books
- **Pagination** — all list endpoints support `page` and `limit` query params
- **Rate limiting** — 100 requests per 15 minutes per IP

---

## Project Structure

```
src/
├── server.ts              # Elysia app + entry point
├── types/
│   └── index.ts           # Shared TypeScript interfaces
├── utils/
│   └── jwt.ts             # signToken / verifyToken helpers
├── db/
│   ├── pool.ts            # PostgreSQL connection pool
│   ├── migrate.ts         # Creates all 4 tables + indexes
│   └── seed.ts            # Seeds admin user + sample books
├── middleware/
│   └── auth.middleware.ts # authPlugin + adminPlugin (Elysia plugins)
└── routes/
    ├── auth.routes.ts     # /auth — register, login, profile
    ├── book.routes.ts     # /books — CRUD + search
    ├── borrow.routes.ts   # /borrows — borrow, return, history
    └── fine.routes.ts     # /fines — view, pay, admin manage
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- PostgreSQL 14+

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/library-api-bun-elysia-pg.git
cd library-api-bun-elysia-pg

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 4. Run migrations
bun src/db/migrate.ts

# 5. Seed the database
bun src/db/seed.ts

# 6. Start the dev server
bun --watch src/server.ts
```

The API will be available at `http://localhost:3000`.

### Default Admin Credentials (after seed)

```
Email:    admin@library.com
Password: Admin@123
```

---

## Environment Variables

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=library_db
DB_USER=postgres
DB_PASSWORD=yourpassword

JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d

FINE_PER_DAY=5
BORROW_LIMIT_DAYS=14
```

---

## API Reference

### Auth — `/api/v1/auth`

| Method | Endpoint    | Access | Description      |
|--------|-------------|--------|------------------|
| POST   | `/register` | Public | Register member  |
| POST   | `/login`    | Public | Login            |
| GET    | `/profile`  | Member | Get own profile  |

### Books — `/api/v1/books`

| Method | Endpoint | Access | Description               |
|--------|----------|--------|---------------------------|
| GET    | `/`      | Public | List books (search/filter)|
| GET    | `/:id`   | Public | Get single book           |
| POST   | `/`      | Admin  | Add new book              |
| PATCH  | `/:id`   | Admin  | Update book               |
| DELETE | `/:id`   | Admin  | Delete book               |

**Query params:** `?search=&genre=&available=true&page=1&limit=10`

### Borrows — `/api/v1/borrows`

| Method | Endpoint               | Access       | Description       |
|--------|------------------------|--------------|-------------------|
| POST   | `/`                    | Member       | Borrow a book     |
| PATCH  | `/:record_id/return`   | Member/Admin | Return a book     |
| GET    | `/mine`                | Member       | My borrow history |
| GET    | `/`                    | Admin        | All borrows       |

### Fines — `/api/v1/fines`

| Method | Endpoint              | Access | Description        |
|--------|-----------------------|--------|--------------------|
| GET    | `/mine`               | Member | My fines           |
| PATCH  | `/:fine_id/pay`       | Member | Pay a fine         |
| GET    | `/`                   | Admin  | All fines + stats  |
| PATCH  | `/:fine_id/mark-paid` | Admin  | Mark fine as paid  |

---

## Example Requests

### Register
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Priyanshu","email":"p@test.com","password":"Pass@123"}'
```

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"p@test.com","password":"Pass@123"}'
```

### Borrow a Book
```bash
curl -X POST http://localhost:3000/api/v1/borrows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"book_id":"<uuid>"}'
```

### Return a Book
```bash
curl -X PATCH http://localhost:3000/api/v1/borrows/<record_id>/return \
  -H "Authorization: Bearer <token>"
```

### Search Books
```bash
curl "http://localhost:3000/api/v1/books?search=orwell&available=true"
```

---

## Database Schema

```
users
  id, name, email, password, role, phone, is_active, created_at, updated_at

books
  id, title, author, isbn, genre, publisher, published_year,
  total_copies, available_copies, created_at, updated_at

borrow_records
  id, user_id, book_id, borrowed_at, due_date, returned_at, status, created_at

fines
  id, borrow_record_id, user_id, amount, days_overdue, is_paid, paid_at, created_at
```

---

## Fine Logic

- Fine rate is **₹5 per day** by default (set via `FINE_PER_DAY` in `.env`)
- Default borrow period is **14 days** (set via `BORROW_LIMIT_DAYS` in `.env`)
- Fine is calculated automatically when a book is returned late
- Members with any unpaid fine are **blocked from borrowing** until cleared
- Admins can mark any fine as paid via `PATCH /fines/:id/mark-paid`

---

## Scripts

```bash
bun --watch src/server.ts   # Dev server with hot reload
bun src/server.ts           # Production
bun src/db/migrate.ts       # Create tables
bun src/db/seed.ts          # Seed data
```

---

## License

MIT
