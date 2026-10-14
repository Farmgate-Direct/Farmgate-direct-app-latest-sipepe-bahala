import { reload, sendEmailVerification } from "firebase/auth";
import { auth } from "../../FirebaseConfig";

const BACKEND_URL = String(
  process.env.EXPO_PUBLIC_BACKEND_URL || ""
).replace(/\/+$/, "");

/**
 * Subukang mag-send ng branded verification email via backend
 * (Admin SDK link + FarmGate design). Kapag walang backend/SMTP,
 * mag-fallback sa default Firebase email.
 *
 * Return shape ay pareho pa rin ({ alreadyVerified }) para hindi masira
 * ang register-buyer / register-farmer screens.
 */
const sendViaBackend = async (fullName?: string): Promise<boolean> => {
  if (!BACKEND_URL) return false;

  const user = auth.currentUser;
  if (!user) return false;

  const token = await user.getIdToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${BACKEND_URL}/auth/send-verification`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fullName: (fullName || "").trim() }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) return false;

    if (data.alreadyVerified) {
      await reload(user);
      return true;
    }

    return data.sent === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Resend ng verification link gamit lang ang email — walang session,
 * walang password. Para sa natigil na registration (nawala ang
 * session pag nag-close ng app).
 */
export const resendVerificationByEmail = async (
  email: string
): Promise<{
  sent: boolean;
  alreadyVerified?: boolean;
  exists?: boolean;
}> => {
  if (!BACKEND_URL) return { sent: false };
  const trimmed = email.trim();
  if (!trimmed) return { sent: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${BACKEND_URL}/auth/resend-verification`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false };
    if (data.success === false && !data.alreadyVerified && data.exists !== false) {
      return { sent: false };
    }
    return {
      sent: data.sent === true,
      alreadyVerified: data.alreadyVerified === true,
      exists: data.exists !== false,
    };
  } catch {
    return { sent: false };
  } finally {
    clearTimeout(timer);
  }
};

export const sendBrandedVerificationEmail = async (
  fullName?: string
): Promise<{
  alreadyVerified: boolean;
}> => {
  const user = auth.currentUser;

  if (!user) {
    const error: any = new Error("No signed-in user to verify.");
    error.code = "auth/no-current-user";
    throw error;
  }

  // Refresh muna — baka na-verify na sa ibang device/tab.
  try {
    await reload(user);
  } catch {
    // Kung bumagsak ang reload (ex. offline), ituloy pa rin ang send.
  }

  if (user.emailVerified) {
    return { alreadyVerified: true };
  }

  // Una: branded email via backend. Kapag hindi available
  // (walang backend/SMTP), default Firebase email ang fallback.
  // NOTE: walang post-send reload dito — extra Auth API call lang yon
  // na nagpapabagal ng submit at ambag sa too-many-requests. Ang
  // emailVerified ay magbabago lang pag klinick ang link, hindi
  // kaagad pagkatapos mag-send.
  if (await sendViaBackend(fullName)) {
    return { alreadyVerified: false };
  }

  await sendEmailVerification(user);

  return { alreadyVerified: false };
};
