import pool from "./pool";

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ─── USERS ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(100) NOT NULL,
        email      VARCHAR(150) UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        role       VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
        phone      VARCHAR(20),
        is_active  BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ─── BOOKS ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS books (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title            VARCHAR(255) NOT NULL,
        author           VARCHAR(150) NOT NULL,
        isbn             VARCHAR(20) UNIQUE NOT NULL,
        genre            VARCHAR(80),
        publisher        VARCHAR(150),
        published_year   INT,
        total_copies     INT NOT NULL DEFAULT 1 CHECK (total_copies >= 0),
        available_copies INT NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ─── BORROW RECORDS ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS borrow_records (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        book_id     UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        borrowed_at TIMESTAMPTZ DEFAULT NOW(),
        due_date    TIMESTAMPTZ NOT NULL,
        returned_at TIMESTAMPTZ,
        status      VARCHAR(20) NOT NULL DEFAULT 'borrowed'
                    CHECK (status IN ('borrowed','returned','overdue')),
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ─── FINES ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS fines (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        borrow_record_id UUID NOT NULL REFERENCES borrow_records(id) ON DELETE CASCADE,
        user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
        days_overdue     INT NOT NULL DEFAULT 0,
        is_paid          BOOLEAN DEFAULT FALSE,
        paid_at          TIMESTAMPTZ,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ─── INDEXES ──────────────────────────────────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_books_isbn    ON books(isbn);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_books_author  ON books(author);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_borrow_user   ON borrow_records(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_borrow_book   ON borrow_records(book_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_borrow_status ON borrow_records(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fines_user    ON fines(user_id);`);

    await client.query("COMMIT");
    console.log("✅ Migration complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate();