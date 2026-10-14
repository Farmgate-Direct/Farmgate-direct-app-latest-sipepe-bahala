const BACKEND_URL = String(
  process.env.EXPO_PUBLIC_BACKEND_URL || ""
).replace(/\/+$/, "");

export type EmailStatusResult = {
  exists: boolean;
  status: string;
  emailVerified: boolean;
} | null;

/**
 * Email-based duplicate check (hindi kailangan ng password).
 * Returns null kapag walang backend o nag-fail — caller ay
 * magfa-fallback sa password-based flow.
 */
export const checkEmailStatus = async (
  email: string
): Promise<EmailStatusResult> => {
  if (!BACKEND_URL) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${BACKEND_URL}/auth/check-email-status`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) return null;
    if (typeof data.exists !== "boolean") return null;
    return {
      exists: data.exists,
      status: String(data.status ?? "no-auth").trim().toLowerCase(),
      emailVerified: !!data.emailVerified,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
