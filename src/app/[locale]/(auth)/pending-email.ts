// The address a verification email was just sent to, kept for the "resend" button of /verify-email.
// sessionStorage: this tab only, gone when it closes; never in a URL. The timestamp drives the 60 s cooldown.
const KEY = 'lookiva.pendingVerification';
export const COOLDOWN_MS = 60_000;

export function rememberPendingEmail(email: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, sentAt: Date.now() }));
  } catch {
    /* storage disabled: the page then asks for the address */
  }
}

export function readPendingEmail(): { email: string; sentAt: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return typeof v?.email === 'string' && typeof v?.sentAt === 'number' ? v : null;
  } catch {
    return null;
  }
}
