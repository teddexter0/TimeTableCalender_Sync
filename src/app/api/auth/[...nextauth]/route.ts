// src/app/api/auth/[...nextauth]/route.ts
// 🔥 FIXED: Added Calendar Write Scope + Refresh Token

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // ✅ FIXED: Added calendar.events scope for write access
          scope: "openid email profile https://www.googleapis.com/auth/calendar.events",
          
          // ✅ CRITICAL: Get refresh token (doesn't expire)
          access_type: "offline",
          prompt: "consent", // Force consent screen to get refresh token
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Store both access and refresh tokens
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token; // ← This is the key!
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      session.expiresAt = token.expiresAt as number;
      return session;
    },
  },
});

export { handler as GET, handler as POST };