import { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import { google } from 'googleapis';

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return { ...token, error: 'RefreshAccessTokenError' as const };
  try {
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: token.refreshToken });
    const credentials = await client.refreshAccessToken();
    return {
      ...token,
      accessToken: credentials.credentials.access_token || token.accessToken,
      expiresAt: credentials.credentials.expiry_date
        ? Math.floor(credentials.credentials.expiry_date / 1000)
        : Math.floor(Date.now() / 1000) + 3500,
      refreshToken: credentials.credentials.refresh_token || token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error('Google token refresh failed:', error);
    return { ...token, error: 'RefreshAccessTokenError' as const };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        return token;
      }
      if (token.expiresAt && Date.now() < (token.expiresAt - 60) * 1000) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.expiresAt = token.expiresAt;
      session.error = token.error;
      return session;
    },
  },
};
