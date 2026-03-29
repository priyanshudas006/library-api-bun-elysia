import Elysia, { t } from "elysia";
import pool from "../db/pool";
import { authPlugin, adminPlugin } from "../middleware/auth.middleware";

const FINE_PER_DAY    = parseFloat(Bun.env.FINE_PER_DAY    || "5");
const BORROW_LIMIT_DAYS = parseInt(Bun.env.BORROW_LIMIT_DAYS || "14");

export const borrowRoutes = new Elysia({ prefix: "/borrows" })
  .use(authPlugin)

  // ─── Borrow a book ────────────────────────────────────────────────────────
  .post(
    "/",
    async ({ body, user, set }) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const bookResult = await client.query(
          "SELECT * FROM books WHERE id = $1 FOR UPDATE",
          [body.book_id]
        );
        const book = bookResult.rows[0];

        if (!book) {
          await client.query("ROLLBACK");
          set.status = 404;
          return { success: false, message: "Book not found" };
        }

        if (book.available_copies < 1) {
          await client.query("ROLLBACK");
          set.status = 400;
          return { success: false, message: "No copies available" };
        }

        const alreadyBorrowed = await client.query(
          "SELECT id FROM borrow_records WHERE user_id = $1 AND book_id = $2 AND status = 'borrowed'",
          [user.id, body.book_id]
        );
        if (alreadyBorrowed.rows.length > 0) {
          await client.query("ROLLBACK");
          set.status = 400;
          return { success: false, message: "You already have this book borrowed" };
        }

        // Block if unpaid fines exist
        const unpaidResult = await client.query(
          "SELECT SUM(amount) as total FROM fines WHERE user_id = $1 AND is_paid = FALSE",
          [user.id]
        );
        const fineTotal = parseFloat(unpaidResult.rows[0].total || "0");
        if (fineTotal > 0) {
          await client.query("ROLLBACK");
          set.status = 400;
          return {
            success: false,
            message: `You have unpaid fines of ₹${fineTotal.toFixed(2)}. Please clear them before borrowing.`,
          };
        }

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + BORROW_LIMIT_DAYS);

        const recordResult = await client.query(
          `INSERT INTO borrow_records (user_id, book_id, due_date)
           VALUES ($1,$2,$3) RETURNING *`,
          [user.id, body.book_id, dueDate]
        );

        await client.query(
          "UPDATE books SET available_copies = available_copies - 1, updated_at = NOW() WHERE id = $1",
          [body.book_id]
        );

        await client.query("COMMIT");
        set.status = 201;
        return {
          success: true,
          message: `Book borrowed. Due date: ${dueDate.toDateString()}`,
          data: recordResult.rows[0],
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    {
      body: t.Object({ book_id: t.String() }),
    }
  )

  // ─── Return a book ────────────────────────────────────────────────────────
  .patch(
    "/:record_id/return",
    async ({ params: { record_id }, user, set }) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const recordResult = await client.query(
          "SELECT * FROM borrow_records WHERE id = $1 FOR UPDATE",
          [record_id]
        );
        const record = recordResult.rows[0];

        if (!record) {
          await client.query("ROLLBACK");
          set.status = 404;
          return { success: false, message: "Borrow record not found" };
        }

        if (user.role !== "admin" && record.user_id !== user.id) {
          await client.query("ROLLBACK");
          set.status = 403;
          return { success: false, message: "Not authorized" };
        }

        if (record.status === "returned") {
          await client.query("ROLLBACK");
          set.status = 400;
          return { success: false, message: "Book already returned" };
        }

        const returnedAt = new Date();
        const dueDate    = new Date(record.due_date);

        let fineAmount = 0;
        let daysOverdue = 0;

        if (returnedAt > dueDate) {
          const diffMs = returnedAt.getTime() - dueDate.getTime();
          daysOverdue  = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          fineAmount   = daysOverdue * FINE_PER_DAY;
        }

        await client.query(
          `UPDATE borrow_records SET status = 'returned', returned_at = $1 WHERE id = $2`,
          [returnedAt, record_id]
        );

        await client.query(
          "UPDATE books SET available_copies = available_copies + 1, updated_at = NOW() WHERE id = $1",
          [record.book_id]
        );

        let fine = null;
        if (fineAmount > 0) {
          const fineResult = await client.query(
            `INSERT INTO fines (borrow_record_id, user_id, amount, days_overdue)
             VALUES ($1,$2,$3,$4) RETURNING *`,
            [record_id, record.user_id, fineAmount, daysOverdue]
          );
          fine = fineResult.rows[0];
        }

        await client.query("COMMIT");
        return {
          success: true,
          message: fineAmount > 0
            ? `Returned. Fine of ₹${fineAmount.toFixed(2)} for ${daysOverdue} day(s) overdue.`
            : "Returned on time. No fine.",
          data: { fine },
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    { params: t.Object({ record_id: t.String() }) }
  )

  // ─── My borrow history ────────────────────────────────────────────────────
  .get(
    "/mine",
    async ({ user, query }) => {
      const { status } = query;
      const params: unknown[] = [user.id];
      const statusFilter = status ? `AND br.status = $2` : "";
      if (status) params.push(status);

      const result = await pool.query(
        `SELECT br.*, b.title, b.author, b.isbn
         FROM borrow_records br
         JOIN books b ON br.book_id = b.id
         WHERE br.user_id = $1 ${statusFilter}
         ORDER BY br.borrowed_at DESC`,
        params
      );
      return { success: true, message: "Borrow history fetched", data: result.rows };
    },
    {
      query: t.Object({ status: t.Optional(t.String()) }),
    }
  )

  // ─── All borrows (admin only) ─────────────────────────────────────────────
  .use(adminPlugin)
  .get(
    "/",
    async ({ query }) => {
      const { status, user_id, page = "1", limit = "20" } = query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const conditions: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (status)  { conditions.push(`br.status = $${i++}`);  params.push(status); }
      if (user_id) { conditions.push(`br.user_id = $${i++}`); params.push(user_id); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(parseInt(limit), offset);

      const result = await pool.query(
        `SELECT br.*, b.title, b.author, b.isbn, u.name as member_name, u.email as member_email
         FROM borrow_records br
         JOIN books b ON br.book_id = b.id
         JOIN users u ON br.user_id = u.id
         ${where}
         ORDER BY br.borrowed_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        params
      );
      return { success: true, message: "All borrows fetched", data: result.rows };
    },
    {
      query: t.Object({
        status:  t.Optional(t.String()),
        user_id: t.Optional(t.String()),
        page:    t.Optional(t.String()),
        limit:   t.Optional(t.String()),
      }),
    }
  );