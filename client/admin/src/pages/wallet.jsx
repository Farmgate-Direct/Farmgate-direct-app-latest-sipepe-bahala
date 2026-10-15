// Admin wallet page.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaWallet } from "react-icons/fa";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";
import { FiClock, FiSmartphone, FiX } from "react-icons/fi";
import {
  getAdminWalletOverview,
  requestAdminWithdrawal,
  saveAdminPayoutAccount,
} from "../services/walletService";
import { logAdminActivity } from "../services/adminActivityService";
import { toastError, toastSuccess } from "../utils/toast";

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const RowSkeleton = ({ cols = 6 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-4 pr-4">
        <SkeletonLine className="h-4 w-full max-w-24" />
      </td>
    ))}
  </tr>
);

const statusStyle = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "completed":
    case "succeeded":
      return "bg-[#DCFCE7] text-[#14532d]";
    case "pending":
    case "pending_review":
    case "pending_compliance":
    case "processing":
      return "bg-[#FEF3C7] text-[#D97706]";
    case "failed":
    case "rejected":
    case "reversed":
      return "bg-[#FDE8E8] text-[#DC2626]";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const formatPeso = (v) =>
  `₱${(Number(v) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (ts) => {
  if (!ts) return "—";
  try {
    // Handle Firestore timestamp formats.
    let d;
    if (ts.toDate) d = ts.toDate();
    else if (typeof ts._seconds === "number") d = new Date(ts._seconds * 1000);
    else if (typeof ts.seconds === "number") d = new Date(ts.seconds * 1000);
    else d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const Wallet = () => {
  const [wallet, setWallet] = useState(null);
  const [withdrawable, setWithdrawable] = useState(0);
  const [minimumWithdrawal, setMinimumWithdrawal] = useState(1);
  const [transactions, setTransactions] = useState([]);
  const [payout, setPayout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const [form, setForm] = useState({
    accountName: "",
    accountNumber: "",
  });
  const [amount, setAmount] = useState("");
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const hasLoadedRef = useRef(false);
  const loadingRef = useRef(false);
  const lastReloadRef = useRef(0);

  const load = useCallback(async () => {
    // Debounce: ignore overlapping calls and refocus storms (<2s apart).
    if (loadingRef.current) return;
    if (Date.now() - lastReloadRef.current < 2000) return;
    loadingRef.current = true;
    lastReloadRef.current = Date.now();

    const isFirstLoad = !hasLoadedRef.current;
    try {
      if (isFirstLoad) setLoading(true);
      setError(null);
      // Single roundtrip: wallet + payout + history (1 auth on server).
      const overview = await getAdminWalletOverview();
      setWallet(overview.wallet);
      setWithdrawable(overview.withdrawableAmount);
      setMinimumWithdrawal(overview.minimumWithdrawal);
      setTransactions(overview.transactions);
      setPayout(overview.payoutAccount);
      if (overview.payoutAccount) {
        setForm({
          accountName: overview.payoutAccount.accountName || "",
          accountNumber: "",
        });
      }
      hasLoadedRef.current = true;
    } catch {
      setError("Could not load the wallet. Please try again.");
    } finally {
      loadingRef.current = false;
      if (isFirstLoad) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Silent refresh on tab refocus (no spinner after first load).
  useEffect(() => {
    const handleFocus = () => {
      load();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const openPayoutModal = () => {
    setForm({
      accountName: payout?.accountName || "",
      accountNumber: "",
    });
    setShowPayoutModal(true);
  };

  const handleSavePayout = async (e) => {
    e?.preventDefault?.();
    // Clean and validate GCash inputs.
    const cleanName = String(form.accountName || "").trim().slice(0, 100);
    const rawNumber = String(form.accountNumber || "").replace(/\D/g, "").slice(0, 11);

    if (cleanName.length < 3) {
      toastError("Required", "Enter the GCash account name.");
      return;
    }
    // Blank keeps saved number.
    if (rawNumber !== "" && !/^09\d{9}$/.test(rawNumber)) {
      toastError(
        "Invalid GCash",
        "Use a valid 11-digit GCash number such as 09171234567."
      );
      return;
    }
    if (!payout && rawNumber === "") {
      toastError(
        "Invalid GCash",
        "Use a valid 11-digit GCash number such as 09171234567."
      );
      return;
    }

    try {
      setSaving(true);
      const saved = await saveAdminPayoutAccount({
        accountName: cleanName,
        accountNumber: rawNumber,
      });
      setPayout(saved);
      setForm({ accountName: saved?.accountName || cleanName, accountNumber: "" });
      setShowPayoutModal(false);
      logAdminActivity("update_payout_account", "Updated admin GCash payout account");
      toastSuccess("GCash Saved", "Admin GCash payout account is ready for withdrawals.");
    } catch {
      toastError("Save failed", "Could not save the GCash account. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (withdrawing) return;
    // Validate withdrawal amount text.
    const text = String(amount || "").trim().slice(0, 12);
    let parsed;
    if (text === "") {
      parsed = undefined;
    } else {
      if (!/^\d+(\.\d{1,2})?$/.test(text)) {
        toastError("Invalid amount", "Enter a valid withdrawal amount.");
        return;
      }
      parsed = Number(text);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10000000) {
        toastError("Invalid amount", "Enter a valid withdrawal amount.");
        return;
      }
    }
    try {
      setWithdrawing(true);
      const { withdrawal, withdrawableAmount } =
        await requestAdminWithdrawal(parsed);
      setWithdrawable(withdrawableAmount);
      setAmount("");
      const status = String(withdrawal?.status || "").toLowerCase();
      const masked =
        withdrawal?.accountNumberMasked ||
        payout?.accountNumberMasked ||
        "your GCash account";
      if (status === "succeeded") {
        toastSuccess(
          "Withdrawal Sent",
          `${formatPeso(withdrawal.amount)} was sent to ${masked}.`
        );
      } else if (status === "processing") {
        toastSuccess(
          "Withdrawal Processing",
          `${formatPeso(withdrawal?.amount)} was submitted for GCash payout. Reference ${withdrawal?.xenditReferenceId || withdrawal?.id || ""}.`
        );
      } else if (status === "pending_review") {
        toastSuccess(
          "Withdrawal Under Review",
          `${formatPeso(withdrawal?.amount)} is on hold while we confirm the payout with our payment provider. Your funds are safe. Please check the transaction history shortly before trying again.`
        );
      } else {
        toastError(
          "Withdrawal Not Completed",
          "The payout was not completed. Please check the transaction history before trying again."
        );
      }
      logAdminActivity("admin_withdraw", "Submitted admin GCash withdrawal");
      load();
    } catch {
      toastError("Withdrawal failed", "Could not process the withdrawal. Please check the history before trying again.");
    } finally {
      setWithdrawing(false);
    }
  };

  const visibleTransactions = transactions;

  const ITEMS_PER_PAGE = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(visibleTransactions.length / ITEMS_PER_PAGE)
  );
  // Clamp page within valid range.
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const paginatedTransactions = visibleTransactions.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  );
  // Pad short pages evenly.
  const displayTransactions = useMemo(() => {
    const list = [...paginatedTransactions];
    while (list.length < ITEMS_PER_PAGE) list.push(null);
    return list;
  }, [paginatedTransactions]);
  const goToPage = (page) =>
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));

  useEffect(() => {
    setCurrentPage(1);
  }, [transactions.length]);

  // Pick first available reference id.
  const getReference = (t) =>
    t.reference || t.withdrawalId || t.orderNumber || t.orderId || t.id;
  const getTypeLabel = (t) => {
    switch (t?.type) {
      case "withdrawal":
        return "GCash Withdrawal";
      case "withdrawal_reversal":
        return "Withdrawal Reversed";
      case "commission_credit":
      case "commission":
        return "Commission Earning";
      default:
        return t?.type || "—";
    }
  };

  return (
    <>
      {/* Page banner */}
      <div
        className="rounded-[10px] p-[18px] sm:p-6 lg:p-8 mb-5 sm:mb-6 lg:mb-8 flex flex-row items-center justify-between gap-3"
        style={{ backgroundColor: "#14532d" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-[#bbf7d0] uppercase">
            Platform earnings
          </p>
          <h1 className="text-xl font-black text-white mt-2 leading-tight">
            Admin Wallet
          </h1>
          <p className="text-xs text-[#dcfce7] mt-1">
            Every delivered order credits its commission here.
          </p>
        </div>
        <div className="w-16 h-16 rounded-full items-center justify-center shrink-0 hidden sm:flex bg-white">
          <FaWallet size={28} color="#14532d" />
        </div>
      </div>

      {/* Balance and payout */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
        <div
          className="flex-1 min-w-0 rounded-[10px] shadow-sm p-6 sm:p-8 flex flex-col justify-center"
          style={{ backgroundColor: "#14532d" }}
        >
          {loading ? (
            <div className="space-y-2 w-full flex flex-col items-center">
              <SkeletonLine className="h-8 w-40 !bg-white/20" />
              <SkeletonLine className="h-3 w-28 !bg-white/20" />
            </div>
          ) : (
            <div className="w-full flex flex-col items-center text-center">
              <div className="flex flex-row items-center justify-start w-full">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <FaWallet size={24} color="#ffffff" />
                </div>
                <div className="ml-3 min-w-0 text-left">
                  <p className="font-medium text-sm text-[#dcfce7]">
                    Wallet Balance
                  </p>
                  <p className="text-xs mt-1 text-[#bbf7d0]">
                    Actual payout is sent from FarmGate&apos;s Xendit account.
                  </p>
                </div>
              </div>
              <div className="text-[28px] sm:text-[32px] font-bold leading-tight text-white mt-5 self-start text-left">
                {formatPeso(wallet?.availableBalance ?? 0)}
              </div>
              <p className="text-[12px] mt-2 text-[#dcfce7] self-start text-left">
                Available wallet balance
              </p>
              {Number(wallet?.pendingWithdrawal || 0) > 0 && (
                <div className="flex flex-row items-center bg-white/15 rounded-[10px] p-3 mt-4 w-full">
                  <FiClock size={20} color="#ffffff" className="shrink-0" />
                  <p className="text-white text-xs ml-2 flex-1 text-left">
                    {formatPeso(wallet?.pendingWithdrawal || 0)} is being
                    processed for GCash payout. It stays in your balance until
                    our payment provider confirms it.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6">
          <div className="flex flex-row items-center justify-between gap-3">
            <div className="flex flex-row items-center flex-1 min-w-0">
              <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <FiSmartphone size={22} color="#2563EB" />
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm">GCash Payout Account</p>
                {loading ? (
                  <SkeletonLine className="h-3 w-32 mt-2" />
                ) : payout ? (
                  <>
                    <p className="text-gray-600 mt-1 text-sm truncate">
                      {payout.accountName}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      {payout.accountNumberMasked || "GCash on file"}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-400 text-xs mt-1">
                    No GCash account saved yet.
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={openPayoutModal}
              className="bg-blue-50 px-4 py-2 rounded-[10px] text-blue-700 font-semibold text-xs hover:bg-blue-100 transition shrink-0"
            >
              {payout ? "Update" : "Add"}
            </button>
          </div>

          <div className="border-t border-gray-100 my-5" />

          <form onSubmit={handleWithdraw}>
            <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4">
              Withdraw to GCash
            </h2>
            <label className="block text-sm">
              <span className="text-gray-600 text-xs font-semibold">
                Amount (blank = max) · Withdrawable {formatPeso(withdrawable)} ·
                Min {formatPeso(minimumWithdrawal)}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                maxLength={12}
                className="mt-1 w-full border border-gray-200 rounded-[5px] px-3 py-2.5 text-sm outline-none focus:border-[#14532d]"
                placeholder="e.g. 500"
              />
            </label>
            <button
              type="submit"
              disabled={withdrawing || withdrawable <= 0}
              className="mt-4 px-4 py-2.5 rounded-[5px] bg-[#14532d] text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
            >
              {withdrawing ? "Submitting..." : "Withdraw"}
            </button>
          </form>
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 mt-4 sm:mt-5 min-w-0">
        <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4">
          Recent transactions
        </h2>
        <div className="hidden sm:block overflow-x-auto relative">
          <table className="w-full min-w-220 text-sm table-fixed">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr className="text-left text-gray-500 uppercase text-[11px] font-semibold tracking-[1.5px]">
                <th className="pb-4 pr-4 font-medium">Type</th>
                <th className="pb-4 pr-4 font-medium">Transaction No.</th>
                <th className="pb-4 pr-4 font-medium">Amount</th>
                <th className="pb-4 pr-4 font-medium">Balance after</th>
                <th className="pb-4 pr-4 font-medium">Status</th>
                <th className="pb-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <RowSkeleton key={i} cols={6} />
                ))
              ) : (
                displayTransactions.map((t, i) =>
                  t ? (
                  <tr key={t.id} className="h-17 hover:bg-gray-50 transition">
                    <td className="py-4 pr-4 text-gray-800 whitespace-nowrap">{getTypeLabel(t)}</td>
                    <td className="pr-4 max-w-72 truncate">{getReference(t)}</td>
                    <td className="pr-4 font-semibold text-gray-800 whitespace-nowrap">
                      {formatPeso(t.amount)}
                    </td>
                    <td className="pr-4 whitespace-nowrap">
                      {formatPeso(t.balanceAfter)}
                    </td>
                    <td className="pr-4">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${statusStyle(t.status)}`}
                      >
                        {String(t.status || "").replace(/_/g, " ") || "N/A"}
                      </span>
                    </td>
                    <td className="text-gray-400 whitespace-nowrap text-xs">
                      {formatDateTime(t.createdAt)}
                    </td>
                  </tr>
                  ) : (
                    <tr key={`empty-${i}`} aria-hidden="true" className="h-17 opacity-0 pointer-events-none select-none">
                      <td className="py-4 pr-4">—</td>
                      <td className="pr-4">—</td>
                      <td className="pr-4 font-semibold">—</td>
                      <td className="pr-4">—</td>
                      <td className="pr-4">
                        <span className="px-3 py-1 rounded-full text-xs">—</span>
                      </td>
                      <td className="text-xs">—</td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
          {!loading && paginatedTransactions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
              No transactions yet
            </div>
          )}
        </div>
        <div className="sm:hidden space-y-3 relative">
          {loading ? (
            <SkeletonLine className="h-16 w-full" />
          ) : (
            displayTransactions.map((t, i) =>
              t ? (
              <div
                key={t.id}
                className="bg-white border border-gray-100 rounded-[10px] p-4"
              >
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="font-semibold text-sm text-gray-800 truncate min-w-0">
                    {getReference(t)}
                  </span>
                  <span
                    className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold capitalize ${statusStyle(t.status)}`}
                  >
                    {String(t.status || "").replace(/_/g, " ") || "N/A"}
                  </span>
                </div>
                <p className="text-sm text-gray-700 truncate">
                  {getTypeLabel(t)}
                </p>
                <div className="flex justify-between items-center mt-3">
                  <span className="font-semibold text-sm text-gray-800">
                    {formatPeso(t.amount)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(t.createdAt)}
                  </span>
                </div>
              </div>
              ) : (
                <div
                  key={`empty-${i}`}
                  aria-hidden="true"
                  className="bg-white border border-gray-100 rounded-[10px] p-4 opacity-0 pointer-events-none select-none"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="font-semibold text-sm">—</span>
                    <span className="px-3 py-1 rounded-full text-xs">—</span>
                  </div>
                  <p className="text-sm truncate">—</p>
                  <div className="flex justify-between items-center mt-3">
                    <span className="font-semibold text-sm">—</span>
                    <span className="text-xs">—</span>
                  </div>
                </div>
              )
            )
          )}
          {!loading && paginatedTransactions.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
              No transactions yet
            </div>
          )}
        </div>
        {!loading && (
          <div
            className={`flex justify-center items-center gap-2 mt-6 pt-4 border-t border-gray-100 ${
              visibleTransactions.length === 0
                ? "invisible pointer-events-none select-none"
                : ""
            }`}
            aria-hidden={visibleTransactions.length === 0 || undefined}
          >
            <button
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage === 1}
              aria-label="Previous page"
              className="min-w-11 min-h-11 sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[10px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F6F6F6] transition"
            >
              <IoIosArrowBack size={16} />
            </button>
            <span className="min-w-11 min-h-11 sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[10px] text-sm font-bold bg-[#14532d] text-white">
              {safePage}
            </span>
            <button
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage === totalPages}
              aria-label="Next page"
              className="min-w-11 min-h-11 sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[10px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F6F6F6] transition"
            >
              <IoIosArrowForward size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Payout modal */}
      {showPayoutModal && (
        <div
          onClick={() => !saving && setShowPayoutModal(false)}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-[10px] shadow-2xl p-6"
          >
            <div className="flex flex-row items-center justify-between mb-5">
              <h2 className="text-lg font-black text-gray-800">
                GCash Payout Account
              </h2>
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX size={22} />
              </button>
            </div>

            <label className="block text-sm mb-4">
              <span className="text-gray-500 text-xs">GCash account name</span>
              <input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                placeholder="Juan Dela Cruz"
                maxLength={100}
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-[5px] px-4 py-3 text-sm outline-none focus:border-[#14532d]"
              />
            </label>

            <label className="block text-sm">
              <span className="text-gray-500 text-xs">GCash mobile number</span>
              <input
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                placeholder={payout?.accountNumberMasked || "09171234567"}
                inputMode="numeric"
                maxLength={11}
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-[5px] px-4 py-3 text-sm outline-none focus:border-[#14532d]"
              />
            </label>

            <p className="text-gray-400 text-[11px] mt-3 mb-5 leading-relaxed">
              This information is used for the Xendit GCash payout request.
              {payout ? " Leave the number blank to keep the current one." : ""}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                disabled={saving}
                className="flex-1 min-h-[50px] bg-white border border-gray-300 text-[#14532d] font-semibold rounded-[5px] px-4 py-3 text-sm hover:bg-[#F6F6F6] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePayout}
                disabled={saving}
                className="flex-1 min-h-[50px] bg-[#14532d] rounded-[5px] text-white font-bold text-sm hover:opacity-90 transition disabled:opacity-60"
              >
                {saving ? "Saving..." : payout ? "Update" : "Save GCash Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Wallet;
