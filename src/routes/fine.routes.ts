import Elysia, { t } from "elysia";
import pool from "../db/pool";
import { authPlugin, adminPlugin } from "../middleware/auth.middleware";

export const fineRoutes = new Elysia({ prefix: "/fines" })
  .use(authPlugin)

  // ─── My fines ─────────────────────────────────────────────────────────────
  .get(
    "/mine",
    async ({ user, query }) => {
      const { is_paid } = query;
      const params: unknown[] = [user.id];
      const paidFilter = is_paid !== undefined ? `AND f.is_paid = $2` : "";
      if (is_paid !== undefined) params.push(is_paid === "true");

      const result = await pool.query(
        `SELECT f.*, b.title as book_title, br.borrowed_at, br.due_date, br.returned_at
         FROM fines f
         JOIN borrow_records br ON f.borrow_record_id = br.id
         JOIN books b ON br.book_id = b.id
         WHERE f.user_id = $1 ${paidFilter}
         ORDER BY f.created_at DESC`,
        params
      );

      const totalUnpaid = result.rows
        .filter((f) => !f.is_paid)
        .reduce((sum: number, f) => sum + parseFloat(f.amount), 0);

      return {
        success: true,
        message: "Fines fetched",
        data: { fines: result.rows, total_unpaid: totalUnpaid.toFixed(2) },
      };
    },
    {
      query: t.Object({ is_paid: t.Optional(t.String()) }),
    }
  )

  // ─── Pay a fine ───────────────────────────────────────────────────────────
  .patch(
    "/:fine_id/pay",
    async ({ params: { fine_id }, user, set }) => {
      const fineResult = await pool.query("SELECT * FROM fines WHERE id = $1", [fine_id]);
      const fine = fineResult.rows[0];

      if (!fine) {
        set.status = 404;
        return { success: false, message: "Fine not found" };
      }
      if (user.role !== "admin" && fine.user_id !== user.id) {
        set.status = 403;
        return { success: false, message: "Not authorized" };
      }
      if (fine.is_paid) {
        set.status = 400;
        return { success: false, message: "Fine already paid" };
      }

      const result = await pool.query(
        `UPDATE fines SET is_paid = TRUE, paid_at = NOW() WHERE id = $1 RETURNING *`,
        [fine_id]
      );
      return {
        success: true,
        message: `Fine of ₹${fine.amount} paid successfully`,
        data: result.rows[0],
      };
    },
    { params: t.Object({ fine_id: t.String() }) }
  )

  // ─── All fines (admin) ────────────────────────────────────────────────────
  .use(adminPlugin)
  .get(
    "/",
    async ({ query }) => {
      const { is_paid, user_id, page = "1", limit = "20" } = query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const conditions: string[] = [];
      const params: unknown[] = [];
      let i = 1;

      if (is_paid !== undefined) { conditions.push(`f.is_paid = $${i++}`); params.push(is_paid === "true"); }
      if (user_id)               { conditions.push(`f.user_id = $${i++}`); params.push(user_id); }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(parseInt(limit), offset);

      const result = await pool.query(
        `SELECT f.*, u.name as member_name, u.email as member_email, b.title as book_title
         FROM fines f
         JOIN users u ON f.user_id = u.id
         JOIN borrow_records br ON f.borrow_record_id = br.id
         JOIN books b ON br.book_id = b.id
         ${where}
         ORDER BY f.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        params
      );

      const statsResult = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE NOT is_paid) as unpaid_count,
           SUM(amount) FILTER (WHERE NOT is_paid) as unpaid_total,
           SUM(amount) FILTER (WHERE is_paid)     as collected_total
         FROM fines`
      );

      return {
        success: true,
        message: "All fines fetched",
        data: { fines: result.rows, stats: statsResult.rows[0] },
      };
    },
    {
      query: t.Object({
        is_paid: t.Optional(t.String()),
        user_id: t.Optional(t.String()),
        page:    t.Optional(t.String()),
        limit:   t.Optional(t.String()),
      }),
    }
  )

  // ─── Admin mark paid ──────────────────────────────────────────────────────
  .patch(
    "/:fine_id/mark-paid",
    async ({ params: { fine_id }, set }) => {
      const result = await pool.query(
        `UPDATE fines SET is_paid = TRUE, paid_at = NOW() WHERE id = $1 RETURNING *`,
        [fine_id]
      );
      if (!result.rows[0]) {
        set.status = 404;
        return { success: false, message: "Fine not found" };
      }
      return { success: true, message: "Fine marked as paid", data: result.rows[0] };
    },
    { params: t.Object({ fine_id: t.String() }) }
  );