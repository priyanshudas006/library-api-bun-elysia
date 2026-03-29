import jwt from "jsonwebtoken";
import type { UserPayload } from "../types";

const SECRET = Bun.env.JWT_SECRET || "changeme";
const EXPIRES = Bun.env.JWT_EXPIRES_IN || "7d";

export const signToken = (payload: UserPayload): string => {
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES } as jwt.SignOptions);
}

export const verifyToken = (token: string): UserPayload => {
    try {
        return jwt.verify(token, SECRET) as UserPayload;
    } catch (error) {
        throw new Error("Invalid token");
    }
}

