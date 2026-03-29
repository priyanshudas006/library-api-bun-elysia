import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  host: Bun.env.DB_HOST || "localhost",
  port: parseInt(Bun.env.DB_PORT || "5432"),
  database: Bun.env.DB_NAME || "library",
  user: Bun.env.DB_USER || "postgres",
  password: Bun.env.DB_PASSWORD || "",
});
pool.on("connect", () => {
    console.log("Connected to PostgreSQL database");
})
pool.on("error", (err) => {
  console.error("PostgreSQL database error:", err);
});

export default pool;
