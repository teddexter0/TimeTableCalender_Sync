import { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import { google } from 'googleapis';

const calendarEventsScope = 'https://www.googleapis.com/auth/calendar.events';

export function calendarConnectionError(session: {
  error?: string;
  calendarAccess?: boolean;
} | null): string | undefined {
  if (!session) return 'Connect Google Calendar first.';
  if (session.error) return 'Your Google connection expired. Reconnect Google Calendar.';
  if (session.calendarAccess === false) {
    return 'Google Calendar access was not granted. Reconnect and select the Calendar permission.';
  }
}

export function calendarGoogleError(error: unknown) {
  const failure = error as {
    code?: number;
    response?: {
      status?: number;
      data?: { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } };
    };
  } | null;
  const status = failure?.response?.status ?? failure?.code;
  const body = failure?.response?.data?.error;
  const reasons = [...(body?.errors ?? []), ...(body?.details ?? [])].map(detail => detail.reason);
  if (status === 401) return { status: 401, error: 'Google rejected the connection. Reconnect Google Calendar.' };
  if (status === 403 && reasons.some(reason => reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
    return { status: 401, error: 'Calendar permission is missing. Reconnect and allow Google Calendar access.' };
  }
  if (status === 403 && reasons.some(reason => reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED')) {
    return { status: 503, error: 'Google Calendar is unavailable for TTS. Contact TTS support.' };
  }
  if (status === 429 || reasons.some(reason => reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')) {
    return { status: 429, error: 'Google Calendar is temporarily rate-limiting requests. Try again shortly.' };
  }
  if (status === 403) {
    return { status: 403, error: 'Google blocked this Calendar action. Check your Google account permissions or switch accounts.' };
  }
  return { status: 502, error: 'Google Calendar could not complete the request. Try again.' };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const expired = { ...token, accessToken: undefined, error: 'RefreshAccessTokenError' as const };
  if (!token.refreshToken) return expired;
  try {
    const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: token.refreshToken });
    const credentials = await client.refreshAccessToken();
    if (!credentials.credentials.access_token) return expired;
    return {
      ...token,
      accessToken: credentials.credentials.access_token,
      expiresAt: credentials.credentials.expiry_date
        ? Math.floor(credentials.credentials.expiry_date / 1000)
        : Math.floor(Date.now() / 1000) + 3500,
      refreshToken: credentials.credentials.refresh_token || token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    const { response, code } = error as { code?: string; response?: { status?: number } };
    console.error('Google token refresh failed:', response?.status ?? code);
    return expired;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: `openid email profile ${calendarEventsScope}`,
          access_type: 'offline',
          prompt: 'select_account consent',
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
        token.calendarAccess = account.scope?.split(/\s+/).includes(calendarEventsScope);
        token.error = undefined;
        return token;
      }
      if (token.accessToken && token.expiresAt && Date.now() < (token.expiresAt - 60) * 1000) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.calendarAccess = Boolean(token.accessToken) && token.calendarAccess !== false;
      session.error = token.error;
      return session;
    },
  },
};

// Calendar routes use the same encrypted NextAuth session. Only the server-side
// session projection includes the Google token.
export const calendarAuthOptions: NextAuthOptions = {
  ...authOptions,
  callbacks: {
    ...authOptions.callbacks,
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.calendarAccess = token.calendarAccess;
      session.error = token.error;
      return session;
    },
  },
};
