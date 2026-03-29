import Elysia, { t } from "elysia";
import bcrypt from "bcryptjs";
import pool from "../db/pool";
import { signToken } from "../utils/jwt";
import { authPlugin } from "../middleware/auth.middleware";

export const authRoutes = new Elysia({ prefix: "/auth" })

  // ─── Register ──────────────────────────────────────────────────────────────
  .post(
    "/register",
    async ({ body, set }) => {
      const { name, email, password, phone } = body;

      const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (exists.rows.length > 0) {
        set.status = 409;
        return { success: false, message: "Email already registered" };
      }

      const hashed = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (name, email, password, phone)
         VALUES ($1,$2,$3,$4)
         RETURNING id, name, email, role, phone, created_at`,
        [name, email, hashed, phone ?? null]
      );

      const user = result.rows[0];
      const token = signToken({ id: user.id, email: user.email, role: user.role });

      set.status = 201;
      return { success: true, message: "Registration successful", data: { user, token } };
    },
    {
      body: t.Object({
        name:     t.String({ minLength: 2 }),
        email:    t.String({ format: "email" }),
        password: t.String({ minLength: 6 }),
        phone:    t.Optional(t.String()),
      }),
    }
  )

  // ─── Login ─────────────────────────────────────────────────────────────────
  .post(
    "/login",
    async ({ body, set }) => {
      const { email, password } = body;

      const result = await pool.query(
        "SELECT * FROM users WHERE email = $1 AND is_active = TRUE",
        [email]
      );
      const user = result.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password))) {
        set.status = 401;
        return { success: false, message: "Invalid credentials" };
      }

      const token = signToken({ id: user.id, email: user.email, role: user.role });
      const { password: _, ...safe } = user;

      return { success: true, message: "Login successful", data: { user: safe, token } };
    },
    {
      body: t.Object({
        email:    t.String({ format: "email" }),
        password: t.String(),
      }),
    }
  )

  // ─── Profile ───────────────────────────────────────────────────────────────
  .use(authPlugin)
  .get("/profile", async ({ user }) => {
    const result = await pool.query(
      "SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE id = $1",
      [user.id]
    );
    return { success: true, message: "Profile fetched", data: result.rows[0] };
  });