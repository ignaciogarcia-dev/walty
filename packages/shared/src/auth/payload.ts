export interface AuthPayload {
  userId: number
  // Device session id (row in device_sessions). Present on all tokens issued
  // after multi-device shipped; absent on legacy tokens, which the Express
  // `withAuth` middleware then rejects to force a one-time re-login.
  sid?: string
}
