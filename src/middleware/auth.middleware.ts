import Elysia from "elysia";
import { bearer } from "@elysiajs/bearer";
import { verifyToken } from "../utils/jwt";
import type { UserPayload } from "../types";

// Reusable auth plugin — derive `user` from Bearer token
export const authPlugin = new Elysia({ name: "auth" })
  .use(bearer())
  .derive({ as: "scoped" }, ({ bearer, set }) => {
    if (!bearer) {
      set.status = 401;
      throw new Error("Access token required");
    }
    try {
      const user = verifyToken(bearer);
      return { user };
    } catch {
      set.status = 401;
      throw new Error("Invalid or expired token");
    }
  });

// Admin-only guard — compose on top of authPlugin
export const adminPlugin = new Elysia({ name: "admin" })
  .use(authPlugin)
  .derive({ as: "scoped" }, ({ user, set }) => {
    const authUser = user as UserPayload | undefined;
    if (!authUser || authUser.role !== "admin") {
      set.status = 403;
      throw new Error("Admin access required");
    }
    return {};
  });
