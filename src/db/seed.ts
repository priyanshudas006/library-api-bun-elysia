import pool from "./pool";
import bcrypt from "bcryptjs";

const seed = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Admin user
    const hashed = await bcrypt.hash("Admin@123", 12);
    await client.query(
      `INSERT INTO users (name, email, password, role, phone)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO NOTHING`,
      ["Admin User", "admin@library.com", hashed, "admin", "9999999999"]
    );

    // Sample books
    const books = [
      ["The Great Gatsby",       "F. Scott Fitzgerald", "978-0743273565", "Fiction",     "Scribner",        1925, 5],
      ["To Kill a Mockingbird",  "Harper Lee",          "978-0061935466", "Fiction",     "Harper Perennial", 1960, 4],
      ["1984",                   "George Orwell",       "978-0451524935", "Dystopian",   "Signet Classic",  1949, 6],
      ["Clean Code",             "Robert C. Martin",    "978-0132350884", "Technology",  "Prentice Hall",   2008, 3],
      ["The Pragmatic Programmer","David Thomas",       "978-0135957059", "Technology",  "Addison-Wesley",  2019, 3],
      ["Sapiens",                "Yuval Noah Harari",   "978-0062316097", "History",     "Harper",          2015, 4],
    ];

    for (const [title, author, isbn, genre, publisher, year, copies] of books) {
      await client.query(
        `INSERT INTO books (title, author, isbn, genre, publisher, published_year, total_copies, available_copies)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT (isbn) DO NOTHING`,
        [title, author, isbn, genre, publisher, year, copies]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Seed complete.");
    console.log("📧 Admin: admin@library.com  🔑 Password: Admin@123");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();