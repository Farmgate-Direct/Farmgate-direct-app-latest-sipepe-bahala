import { auth } from "../FirebaseConfig";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "");

// Normal read timeout. Withdraw uses longer timeout below.
const REQUEST_TIMEOUT = 30000;
const WITHDRAW_TIMEOUT = 60000;

const MAX_NAME_LEN = 100;
const MAX_AMOUNT = 10000000;

const cleanName = (v: unknown) => String(v ?? "").trim();

const checkName = (name: string) => {
  if (name.length < 3 || name.length > MAX_NAME_LEN) {
    throw new Error("Enter the GCash account name.");
  }
};

const cleanNumber = (v: unknown) => {
  const raw = String(v ?? "").trim();
  if (raw === "") return "";
  const digits = raw.replace(/\D/g, "");
  let norm = digits;
  if (/^639\d{9}$/.test(digits)) norm = `0${digits.slice(2)}`;
  if (!/^09\d{9}$/.test(norm)) {
    throw new Error("Use a valid 11-digit GCash number such as 09171234567.");
  }
  return norm;
};

const checkAmount = (amount: number | undefined) => {
  if (amount === undefined) return undefined;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new Error("Enter a valid withdrawal amount.");
  }
  return Math.round(amount * 100) / 100;
};

const authedFetch = async (path: string, options: RequestInit = {}, timeout = REQUEST_TIMEOUT) => {
  if (!BACKEND_URL) throw new Error("VITE_BACKEND_URL is not configured.");
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const token = await user.getIdToken();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${BACKEND_URL}/wallet${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Request failed (${res.status}).`);
    }
    return data;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error("Request took too long. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

export const getAdminWallet = async () => {
  const data = await authedFetch("/admin/wallet");
  return {
    wallet: data.wallet,
    withdrawableAmount: Number(data.withdrawableAmount || 0),
    minimumWithdrawal: Number(data.minimumWithdrawal || 1),
  };
};

export const getAdminTransactions = async () => {
  const data = await authedFetch("/admin/transactions");
  // Always return a list so the table never breaks.
  return Array.isArray(data.transactions) ? data.transactions : [];
};

export const getAdminPayoutAccount = async () => {
  const data = await authedFetch("/admin/payout-account");
  return data.payoutAccount || null;
};

export const saveAdminPayoutAccount = async (input: {
  accountName: string;
  accountNumber: string;
}) => {
  // Only name + number are sent. Other fields stay read-only.
  const accountName = cleanName(input?.accountName);
  checkName(accountName);
  const accountNumber = cleanNumber(input?.accountNumber);
  const data = await authedFetch("/admin/payout-account", {
    method: "PUT",
    body: JSON.stringify({ accountName, accountNumber }),
  });
  return data.payoutAccount;
};

export const requestAdminWithdrawal = async (amount?: number) => {
  const clean = amount === undefined || amount === null || String(amount).trim() === ""
    ? undefined
    : checkAmount(Number(amount));
  const data = await authedFetch(
    "/admin/withdraw",
    {
      method: "POST",
      body: JSON.stringify(clean === undefined ? {} : { amount: clean }),
    },
    WITHDRAW_TIMEOUT,
  );
  return {
    withdrawal: data.withdrawal,
    withdrawableAmount: Number(data.withdrawableAmount || 0),
  };
};

