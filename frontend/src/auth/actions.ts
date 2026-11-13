import { api, unwrap } from '../api/client'
import { setSession, updateUser, type User } from './session'

/** Sign in with email and password; returns the user. */
export async function logIn(email: string, password: string): Promise<User> {
  const session = await unwrap(api.POST('/api/auth/login', { body: { email, password } }))
  setSession(session)
  return session.user
}

/** Create an account; the API emails a verification code. */
export function register(fullName: string, email: string, password: string): Promise<User> {
  return unwrap(api.POST('/api/auth/register', { body: { full_name: fullName, email, password } }))
}

/** Confirm the email with the code, which also signs the user in. */
export async function verifyEmail(email: string, code: string): Promise<User> {
  const session = await unwrap(api.POST('/api/auth/verify-email', { body: { email, code } }))
  setSession(session)
  return session.user
}

/** Ask for a new verification code. */
export function resendCode(email: string): Promise<unknown> {
  return unwrap(api.POST('/api/auth/resend-code', { body: { email } }))
}

/** Ask for a password reset code. */
export function forgotPassword(email: string): Promise<unknown> {
  return unwrap(api.POST('/api/auth/forgot-password', { body: { email } }))
}

/** Set a new password with the emailed code. */
export function resetPassword(email: string, code: string, newPassword: string): Promise<unknown> {
  return unwrap(api.POST('/api/auth/reset-password', { body: { email, code, new_password: newPassword } }))
}

/** Change the name on the account; the header and account page show it straight away. */
export async function updateName(fullName: string): Promise<User> {
  const user = await unwrap(api.PATCH('/api/me', { body: { full_name: fullName } }))
  updateUser(user)
  return user
}

/** Change the password; the server signs out every other device and keeps this one. */
export function changePassword(currentPassword: string, newPassword: string): Promise<unknown> {
  return unwrap(api.POST('/api/auth/change-password', {
    body: { current_password: currentPassword, new_password: newPassword },
  }))
}

/** Sign out of every device; this one is signed out only once the server has done it. */
export async function logOutEverywhere(): Promise<void> {
  await unwrap(api.POST('/api/auth/logout-all'))
  setSession(null, true)
}

/** Delete the account for good, then end this browser's session. */
export async function deleteAccount(password: string): Promise<void> {
  await unwrap(api.POST('/api/me/delete', { body: { password } }))
  setSession(null, true)
}

/** Sign out here; the local session ends even if the server can't be reached. */
export async function logOut(): Promise<void> {
  try {
    await api.POST('/api/auth/logout')
  } finally {
    setSession(null, true)
  }
}
