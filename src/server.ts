import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authRoutes }   from "./routes/auth.routes";
import { bookRoutes }   from "./routes/book.routes";
import { borrowRoutes } from "./routes/borrow.routes";
import { fineRoutes }   from "./routes/fine.routes";

const PORT = parseInt(Bun.env.PORT || "3000");

const app = new Elysia()

  .use(cors())

  .onError(({ code, error, set }) => {
    const message = error instanceof Error ? error.message : "Internal Server Error";

    if (code === "VALIDATION")        set.status = 400;
    else if (code === "NOT_FOUND")    set.status = 404;
    else if (!set.status || set.status === 200) set.status = 500;

    console.error(`[${code}] ${set.status} - ${message}`);
    return { success: false, message };
  })

  .get("/health", () => ({
    success: true,
    message: "Library API is running",
    timestamp: new Date(),
    runtime: "Bun " + Bun.version,
  }))

  .group("/api/v1", (app) =>
    app
      .use(authRoutes)
      .use(bookRoutes)
      .use(borrowRoutes)
      .use(fineRoutes)
  )

  .listen(PORT);

console.log(`\n Library API running on http://localhost:${PORT}`);
console.log(` Runtime : Bun ${Bun.version}`);
console.log(` Env     : ${Bun.env.NODE_ENV || "development"}`);
console.log(` Health  : http://localhost:${PORT}/health\n`);

export type App = typeof app;
