// src/types/next-auth.d.ts
// 🔥 UPDATED: Added refreshToken and expiresAt

import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;  // ← NEW: For getting fresh tokens
    expiresAt?: number;     // ← NEW: When access token expires
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;  // ← NEW
    expiresAt?: number;     // ← NEW
  }
}