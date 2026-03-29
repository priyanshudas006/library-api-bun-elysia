import Elysia, { t } from "elysia";
import pool from "../db/pool";
import { authPlugin, adminPlugin } from "../middleware/auth.middleware";

export const bookRoutes = new Elysia({ prefix: "/books" })

  // ─── List books (public, with search + filter + pagination) ───────────────
  .get(
    "/",
    async ({ query }) => {
      const { search, genre, available, page = "1", limit = "10" } = query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const conditions: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (search) {
        conditions.push(`(title ILIKE $${i} OR author ILIKE $${i} OR isbn ILIKE $${i})`);
        params.push(`%${search}%`);
        i++;
      }
      if (genre) {
        conditions.push(`genre ILIKE $${i++}`);
        params.push(`%${genre}%`);
      }
      if (available === "true") conditions.push(`available_copies > 0`);

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const countResult = await pool.query(`SELECT COUNT(*) FROM books ${where}`, params);
      params.push(parseInt(limit), offset);

      const result = await pool.query(
        `SELECT * FROM books ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        params
      );

      return {
        success: true,
        message: "Books fetched",
        data: {
          books: result.rows,
          total: parseInt(countResult.rows[0].count),
          page: parseInt(page),
          limit: parseInt(limit),
        },
      };
    },
    {
      query: t.Object({
        search:    t.Optional(t.String()),
        genre:     t.Optional(t.String()),
        available: t.Optional(t.String()),
        page:      t.Optional(t.String()),
        limit:     t.Optional(t.String()),
      }),
    }
  )

  // ─── Get single book (public) ─────────────────────────────────────────────
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const result = await pool.query("SELECT * FROM books WHERE id = $1", [id]);
      if (!result.rows[0]) {
        set.status = 404;
        return { success: false, message: "Book not found" };
      }
      return { success: true, message: "Book fetched", data: result.rows[0] };
    },
    { params: t.Object({ id: t.String() }) }
  )

  // ─── Create book (admin only) ─────────────────────────────────────────────
  .use(adminPlugin)
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const { title, author, isbn, genre, publisher, published_year, total_copies } = body;
        const result = await pool.query(
          `INSERT INTO books (title, author, isbn, genre, publisher, published_year, total_copies, available_copies)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
          [title, author, isbn, genre ?? null, publisher ?? null, published_year ?? null, total_copies ?? 1]
        );
        set.status = 201;
        return { success: true, message: "Book created", data: result.rows[0] };
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "23505") {
          set.status = 409;
          return { success: false, message: "ISBN already exists" };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        title:          t.String({ minLength: 1 }),
        author:         t.String({ minLength: 1 }),
        isbn:           t.String({ minLength: 1 }),
        genre:          t.Optional(t.String()),
        publisher:      t.Optional(t.String()),
        published_year: t.Optional(t.Number()),
        total_copies:   t.Optional(t.Number()),
      }),
    }
  )

  // ─── Update book (admin only) ─────────────────────────────────────────────
  .patch(
    "/:id",
    async ({ params: { id }, body, set }) => {
      const fields = ["title", "author", "isbn", "genre", "publisher", "published_year", "total_copies"];
      const updates: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      for (const field of fields) {
        if ((body as Record<string, unknown>)[field] !== undefined) {
          updates.push(`${field} = $${i++}`);
          params.push((body as Record<string, unknown>)[field]);
        }
      }

      if (!updates.length) {
        set.status = 400;
        return { success: false, message: "No fields to update" };
      }

      updates.push(`updated_at = NOW()`);
      params.push(id);

      const result = await pool.query(
        `UPDATE books SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
        params
      );

      if (!result.rows[0]) {
        set.status = 404;
        return { success: false, message: "Book not found" };
      }

      return { success: true, message: "Book updated", data: result.rows[0] };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        title:          t.Optional(t.String()),
        author:         t.Optional(t.String()),
        isbn:           t.Optional(t.String()),
        genre:          t.Optional(t.String()),
        publisher:      t.Optional(t.String()),
        published_year: t.Optional(t.Number()),
        total_copies:   t.Optional(t.Number()),
      }),
    }
  )

  // ─── Delete book (admin only) ─────────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const active = await pool.query(
        "SELECT id FROM borrow_records WHERE book_id = $1 AND status = 'borrowed'",
        [id]
      );
      if (active.rows.length > 0) {
        set.status = 400;
        return { success: false, message: "Cannot delete book with active borrows" };
      }

      const result = await pool.query("DELETE FROM books WHERE id = $1 RETURNING id", [id]);
      if (!result.rows[0]) {
        set.status = 404;
        return { success: false, message: "Book not found" };
      }

      return { success: true, message: "Book deleted" };
    },
    { params: t.Object({ id: t.String() }) }
  );