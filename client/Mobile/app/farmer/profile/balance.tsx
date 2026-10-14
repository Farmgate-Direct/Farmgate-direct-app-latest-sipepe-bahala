import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFarmerAlert } from "@/context/FarmerAlertContext";

import {
  getPendingGcashEarnings,
  getWalletOverview,
  createCommissionDeposit,
  getCommissionDepositStatus,
  requestFarmerWithdrawal,
  saveFarmerPayoutAccount,
  syncStuckWithdrawals,
} from "@/src/services/walletService";

import {
  FarmerPayoutAccountType,
  FarmerWalletType,
  WalletTransaction,
} from "@/src/types/wallet";

const formatMoney = (value: number) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const ACTIVE_DEPOSIT_KEY = "farmgate_active_commission_deposit";

const formatDate = (timestamp: any) => {
  if (!timestamp) return "Date unavailable";

  try {
    const date =
      typeof timestamp?.toDate === "function"
        ? timestamp.toDate()
        : typeof timestamp?.seconds === "number"
          ? new Date(timestamp.seconds * 1000)
          : typeof timestamp?._seconds === "number"
            ? new Date(timestamp._seconds * 1000)
            : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return date.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "Date unavailable";
  }
};

/* ---------------------------------------------------------
   TRANSACTION DISPLAY (reference logic)
   credit -> green "+"   debit -> red "-"   memo -> amber, no sign
   Failed / reversed rows are greyed out and show no sign.
--------------------------------------------------------- */

type Direction = "credit" | "debit" | "memo";

const CREDIT_TYPES = [
  "gcash_earning",
  "commission_deposit",
  "withdrawal_reversal",
  "cod_commission_reservation_released",
];

const DEBIT_TYPES = ["withdrawal", "cod_commission_debit"];

const INACTIVE_STATUSES = ["failed", "rejected", "reversed", "cancelled"];

const transactionDirection = (transaction: WalletTransaction): Direction => {
  const direction = (transaction as any).direction;

  if (
    direction === "credit" ||
    direction === "debit" ||
    direction === "memo"
  ) {
    return direction;
  }

  if (CREDIT_TYPES.includes(transaction.type as string)) return "credit";
  if (DEBIT_TYPES.includes(transaction.type as string)) return "debit";

  return "memo";
};

const transactionIsInactive = (transaction: WalletTransaction) =>
  INACTIVE_STATUSES.includes(
    String(transaction.status || "").toLowerCase()
  );

const transactionTitle = (transaction: WalletTransaction) => {
  switch (transaction.type as string) {
    case "gcash_earning":
      return "GCash Order Earning";
    case "gcash_earning_pending":
      return "GCash Earning (Pending)";
    case "commission_deposit":
      return "Commission Reserve Deposit";
    case "cod_commission_reserved":
      return "COD Commission Reserved";
    case "cod_commission_reservation_released":
      return "COD Reserve Released";
    case "gcash_commission":
      return "GCash Commission";
    case "cod_commission_debit":
      return "COD Commission";
    case "cod_commission_due":
      return "COD Commission Due";
    case "cod_commission_collected":
      return "COD Commission Collected";
    case "cod_delivery_fee_due":
      return "COD Delivery Fee Due";
    case "cod_delivery_fee_collected":
      return "COD Delivery Fee Collected";
    case "withdrawal":
      return "GCash Withdrawal";
    case "withdrawal_reversal":
      return "Withdrawal Reversed";
    default:
      return "Wallet Adjustment";
  }
};

const transactionColor = (transaction: WalletTransaction) => {
  if (transactionIsInactive(transaction)) {
    return "#9CA3AF";
  }

  const direction = transactionDirection(transaction);

  if (direction === "credit") return "#15803D";
  if (direction === "debit") return "#DC2626";

  return "#D97706";
};

const transactionIcon = (transaction: WalletTransaction) => {
  if ((transaction.type as string) === "withdrawal_reversal") {
    return "refresh-circle";
  }

  const direction = transactionDirection(transaction);

  if (direction === "credit") return "arrow-down-circle";
  if (direction === "debit") return "arrow-up-circle";

  return "information-circle";
};

const transactionSign = (transaction: WalletTransaction) => {
  if (transactionIsInactive(transaction)) return "";

  const direction = transactionDirection(transaction);

  if (direction === "credit") return "+";
  if (direction === "debit") return "-";

  return "";
};

export default function FarmerWallet() {
  const router = useRouter();
  const Alert = useFarmerAlert();

  const [wallet, setWallet] = useState<FarmerWalletType | null>(null);
  const [payoutAccount, setPayoutAccount] =
    useState<FarmerPayoutAccountType | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const depositPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");

  // True after the first successful load (so refocus does not flash a spinner)
  const hasLoadedRef = useRef(false);
  // Prevents two overlapping deposit checks from showing duplicate alerts
  const checkingDepositRef = useRef(false);
  const loadingWalletRef = useRef(false);
  const lastReloadRef = useRef(0);
  const appState = useRef(AppState.currentState);
  const [serverWithdrawable, setServerWithdrawable] = useState<number | null>(
    null
  );
  // Auto-sync runs at most once per screen focus, so a stuck withdrawal
  // can heal without hammering Xendit on every reload.
  const syncAttemptedRef = useRef(false);

  const loadWallet = useCallback(async () => {
    // Debounce: ignore overlapping calls and refocus storms (<2s apart).
    if (loadingWalletRef.current) return;
    if (Date.now() - lastReloadRef.current < 2000) return;
    loadingWalletRef.current = true;
    lastReloadRef.current = Date.now();

    const isFirstLoad = !hasLoadedRef.current;

    try {
      if (isFirstLoad) {
        setLoading(true);
      }

      // Single roundtrip: wallet + payout + history (1 auth on server).
      const overview = await getWalletOverview();

      setWallet(overview.wallet);
      setPayoutAccount(overview.payoutAccount);
      setTransactions(overview.transactions);
      setServerWithdrawable(overview.withdrawableAmount);

      setAccountName(overview.payoutAccount?.accountName || "");

      hasLoadedRef.current = true;

      // Heal withdrawals stuck in pending/processing when the Xendit
      // payout webhook never arrived. Runs once per focus; reloads past
      // the 2s debounce only when something actually changed.
      const hasStuckWithdrawal = (overview.transactions || []).some(
        (t) =>
          String(t.type || "") === "withdrawal" &&
          ["pending", "processing", "pending_review"].includes(
            String(t.status || "").toLowerCase()
          )
      );

      if (hasStuckWithdrawal && !syncAttemptedRef.current) {
        syncAttemptedRef.current = true;

        void syncStuckWithdrawals()
          .then((result) => {
            if (Number(result?.synced || 0) > 0) {
              setTimeout(() => {
                void loadWallet();
              }, 2500);
            }
          })
          .catch((e) => console.log("SYNC WITHDRAWALS ERROR:", e));
      }

      // Pending earnings are a heavier scan on the server, so load them
      // lazily without blocking the balance UI.
      void getPendingGcashEarnings()
        .then((pending) => {
          setWallet((prev) =>
            prev ? { ...prev, pendingBalance: Number(pending || 0) } : prev
          );
        })
        .catch((e) => console.log("PENDING GCASH ERROR:", e));
    } catch (error: any) {
      console.log("LOAD FARMER WALLET ERROR:", error);

      if (isFirstLoad) {
        Alert.alert(
          "Wallet Error",
          error?.message || "Failed to load your wallet."
        );
      }
    } finally {
      loadingWalletRef.current = false;
      if (isFirstLoad) {
        setLoading(false);
      }
    }
  }, [Alert]);

  /*
    Checks the last deposit after returning from the Xendit browser.
    Uses the current service shape: { deposit, commissionReserveBalance }.
  */
  const checkActiveDeposit = useCallback(async () => {
    const depositId = await AsyncStorage.getItem(ACTIVE_DEPOSIT_KEY);

    if (!depositId) {
      return;
    }

    try {
      const deposit = await getCommissionDepositStatus(depositId);
      const status = String(deposit.status || "").toLowerCase();

      if (status === "completed") {
        stopDepositPolling();
        await AsyncStorage.removeItem(ACTIVE_DEPOSIT_KEY);
        await loadWallet();

        Alert.alert(
          "Deposit Successful",
          `${formatMoney(deposit.amount)} has been added to your COD commission reserve.`
        );

        return;
      }

      if (status === "failed" || status === "rejected") {
        stopDepositPolling();
        await AsyncStorage.removeItem(ACTIVE_DEPOSIT_KEY);
        await loadWallet();

        Alert.alert(
          "Deposit Not Completed",
          deposit.failureReason ||
            "The commission reserve deposit was not completed."
        );

        return;
      }

      if (status === "manual_review") {
        stopDepositPolling();
        await AsyncStorage.removeItem(ACTIVE_DEPOSIT_KEY);
        await loadWallet();

        Alert.alert(
          "Deposit Under Review",
          "Your payment was received but needs a quick manual check before it is added to your reserve. Please contact FarmGate support if it is not credited soon."
        );
      }
    } catch (error) {
      console.log("CHECK ACTIVE DEPOSIT ERROR:", error);
    }
  }, [Alert, loadWallet]);

  /*
    The Xendit webhook may arrive a little after the app returns.
    Check up to 4 times without blocking the UI.
  */
  const checkActiveDepositWithRetry = useCallback(async () => {
    if (checkingDepositRef.current) {
      return;
    }

    checkingDepositRef.current = true;

    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const activeId = await AsyncStorage.getItem(ACTIVE_DEPOSIT_KEY);

        if (!activeId) {
          return;
        }

        await checkActiveDeposit();

        const stillActive = await AsyncStorage.getItem(ACTIVE_DEPOSIT_KEY);

        if (!stillActive) {
          return;
        }

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } finally {
      checkingDepositRef.current = false;
    }
  }, [checkActiveDeposit]);

  useFocusEffect(
    useCallback(() => {
      syncAttemptedRef.current = false;
      void loadWallet();

      // Also covers the case where the app was closed during the payment.
      void checkActiveDepositWithRetry();
    }, [loadWallet, checkActiveDepositWithRetry])
  );

  // Server is the source of truth (available - reserved). Fall back to a
  // local calc only before the first overview response arrives.
  const withdrawableAmount =
    serverWithdrawable !== null
      ? Math.max(0, Number(serverWithdrawable || 0))
      : wallet
        ? Math.max(
            0,
            Number(wallet.availableBalance || 0) -
              Number(wallet.reservedBalance || 0)
          )
        : 0;

  const openPayoutModal = () => {
    setAccountName(payoutAccount?.accountName || "");
    setAccountNumber("");
    setShowPayoutModal(true);
  };

  const handleSavePayoutAccount = async () => {
    const cleanName = accountName.trim();
    const cleanNumber = accountNumber.replace(/\D/g, "");

    if (cleanName.length < 3) {
      Alert.alert("Required", "Enter the GCash account name.");
      return;
    }

    if (!/^09\d{9}$/.test(cleanNumber)) {
      Alert.alert(
        "Invalid GCash",
        "Use a valid 11-digit GCash number such as 09171234567."
      );
      return;
    }

    try {
      setSavingPayout(true);

      // Postal code is no longer asked in the UI. Reuse the stored one so
      // the server (Xendit payout) still gets a valid 4-digit code; when
      // there is none, the server falls back to the farmer profile.
      const saved = await saveFarmerPayoutAccount({
        accountName: cleanName,
        accountNumber: cleanNumber,
        postalCode: payoutAccount?.postalCode || undefined,
      });

      setPayoutAccount(saved);
      setShowPayoutModal(false);
      setAccountNumber("");

      Alert.alert(
        "GCash Saved",
        "Your GCash payout account is ready for withdrawals."
      );
    } catch (error: any) {
      console.log("SAVE PAYOUT ACCOUNT ERROR:", error);
      Alert.alert(
        "Save Failed",
        error?.message || "Failed to save your GCash account."
      );
    } finally {
      setSavingPayout(false);
    }
  };

  const stopDepositPolling = () => {
    if (depositPollRef.current) {
      clearInterval(depositPollRef.current);
      depositPollRef.current = null;
    }
  };

  const startDepositPolling = (depositId: string) => {
    stopDepositPolling();

    let attempts = 0;

    depositPollRef.current = setInterval(async () => {
      attempts += 1;

      try {
        const deposit = await getCommissionDepositStatus(depositId);
        const status = deposit.status;

        if (status === "completed") {
          stopDepositPolling();
          await loadWallet();
          Alert.alert(
            "Deposit Completed",
            `${formatMoney(deposit.amount)} has been added to your COD Commission Reserve.`
          );
          return;
        }

        if (status === "failed" || status === "manual_review") {
          stopDepositPolling();
          await loadWallet();
          Alert.alert(
            "Deposit Not Completed",
            deposit.failureReason ||
              "The commission reserve deposit was not completed."
          );
          return;
        }
      } catch (error) {
        console.log("DEPOSIT STATUS ERROR:", error);
      }

      if (attempts >= 15) {
        stopDepositPolling();
        await loadWallet();
      }
    }, 2000);
  };

  const startDeposit = async (amount: number) => {
    if (depositLoading) {
      return;
    }

    try {
      setDepositLoading(true);

      const result = await createCommissionDeposit(amount);

      // Save this before leaving the app.
      await AsyncStorage.setItem(ACTIVE_DEPOSIT_KEY, result.depositId);

      setDepositAmount("");
      setShowDepositModal(false);

      startDepositPolling(result.depositId);

      /*
        IMPORTANT: stop the spinner BEFORE opening the browser so that when
        the user presses Back, Deposit is immediately usable again.
      */
      setDepositLoading(false);

      if (result.redirectUrl) {
        try {
          await Linking.openURL(result.redirectUrl);
        } catch (openError) {
          await AsyncStorage.removeItem(ACTIVE_DEPOSIT_KEY);
          stopDepositPolling();

          throw openError;
        }
      }

      await loadWallet();

      Alert.alert(
        "Complete GCash Payment",
        "Complete the payment in the opened page, then return to FarmGate."
      );
    } catch (error: any) {
      console.log("COMMISSION DEPOSIT ERROR:", error);
      Alert.alert(
        "Deposit Failed",
        error?.message || "Failed to start the commission reserve deposit."
      );
    } finally {
      setDepositLoading(false);
    }
  };

  const handleDeposit = () => {
    const amount = Number(depositAmount.replace(/,/g, "").trim());

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid deposit amount.");
      return;
    }

    if (amount < 100) {
      Alert.alert("Invalid Amount", "The minimum deposit is ₱100.");
      return;
    }

    Alert.alert(
      "Confirm Deposit",
      `Create a ${formatMoney(amount)} commission reserve deposit?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Continue",
          onPress: () => {
            void startDeposit(amount);
          },
        },
      ]
    );
  };

  const handleWithdraw = async () => {
    if (!payoutAccount) {
      setShowWithdrawModal(false);
      openPayoutModal();
      return;
    }

    if (withdrawableAmount <= 0) {
      Alert.alert(
        "No Withdrawable Balance",
        "There is no withdrawable earnings balance available yet. Settle any outstanding COD deductions first."
      );
      return;
    }

    try {
      setWithdrawLoading(true);
      setShowWithdrawModal(false);

      const withdrawal = await requestFarmerWithdrawal(withdrawableAmount);

      await loadWallet();

      if (withdrawal.status === "succeeded") {
        Alert.alert(
          "Withdrawal Sent",
          `${formatMoney(withdrawal.amount)} was sent to ${withdrawal.accountNumberMasked}.`
        );
      } else if (withdrawal.status === "processing") {
        Alert.alert(
          "Withdrawal Processing",
          `${formatMoney(withdrawal.amount)} was submitted for GCash payout.`
        );
      } else if (String(withdrawal.status || "").toLowerCase() === "pending_review") {
        Alert.alert(
          "Withdrawal Under Review",
          `${formatMoney(withdrawal.amount)} is on hold while we confirm the payout with our payment provider. Your funds are safe. Please check your wallet history shortly before trying again.`
        );
      } else {
        Alert.alert(
          "Withdrawal Not Completed",
          withdrawal.failureReason ||
            "The payout was not completed. Your reserved amount will be released according to the payout status."
        );
      }
    } catch (error: any) {
      console.log("WITHDRAW ERROR:", error?.details || error);

      // Surface gateway validation details (which fields Xendit rejected).
      const detailText = error?.details
        ? `\n\nDetails: ${
            typeof error.details === "string"
              ? error.details
              : JSON.stringify(error.details).slice(0, 500)
          }`
        : "";

      /*
        The request may have reached the server even if the app saw an error
        (for example a timeout), so always re-sync the wallet and history.
      */
      Alert.alert(
        "Withdrawal Failed",
        `${error?.message || "Failed to create the GCash payout."}${detailText}\n\nPlease check your wallet history before trying again.`
      );

      await loadWallet();
    } finally {
      setWithdrawLoading(false);
    }
  };

  useEffect(() => {
    /*
      Detect returning from the external Xendit browser.
      Single refresh only — loadWallet is already debounced (2s), so the
      old triple-refresh (0s + 1.5s + 4s = ~9 backend hits) is gone.
    */
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground =
        appState.current === "background" || appState.current === "inactive";

      appState.current = nextState;

      if (wasBackground && nextState === "active") {
        void checkActiveDepositWithRetry();
        void loadWallet();
      }
    });

    return () => {
      subscription.remove();
      stopDepositPolling();
    };
  }, [loadWallet, checkActiveDepositWithRetry]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#15803D" />
        <Text className="text-green-700 font-semibold mt-3">
          Loading wallet...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-green-900 pt-14 pb-5 px-5 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <Text className="text-white text-2xl font-bold ml-4">
          Farmer Wallet
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
      >
        <View
          className="bg-green-800 rounded-3xl p-6 mb-4"
          style={{ elevation: 5 }}
        >
          <View className="flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center">
              <Ionicons name="wallet-outline" size={27} color="white" />
            </View>

            <View className="ml-3 flex-1 pr-1">
              <Text className="text-green-100 font-medium">
                Wallet Balance
              </Text>
              <Text className="text-green-100 text-xs mt-1">
                Actual payout is sent from FarmGate&apos;s Xendit account.
              </Text>
            </View>
          </View>

          <Text className="text-white text-4xl font-black mt-5">
            {formatMoney(wallet?.availableBalance || 0)}
          </Text>

          <Text className="text-green-100 text-xs mt-2">
            Available wallet balance
          </Text>

          {Number(wallet?.reservedBalance || 0) > 0 ? (
            <View className="flex-row items-center bg-white/15 rounded-2xl p-3 mt-4">
              <Ionicons name="time-outline" size={20} color="white" />
              <Text className="text-white text-xs ml-2 flex-1">
                {formatMoney(wallet?.reservedBalance || 0)} is being processed for GCash payout. It stays in your balance until our payment provider confirms it.
              </Text>
            </View>
          ) : null}
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4">
          <View className="flex-row mb-4">
            <View className="flex-1 mr-2 bg-gray-50 rounded-2xl p-4">
              <Text className="text-gray-500 text-xs">
                Pending Product Earnings
              </Text>
              <Text className="text-orange-600 text-xl font-black mt-2">
                {formatMoney(wallet?.pendingBalance || 0)}
              </Text>
              <Text className="text-gray-400 text-[11px] mt-1">
                Released when the order is Delivered
              </Text>
            </View>

            <View className="flex-1 ml-2 bg-gray-50 rounded-2xl p-4">
              <Text className="text-gray-500 text-xs">
                Pending Withdrawal
              </Text>
              <Text className="text-blue-600 text-xl font-black mt-2">
                {formatMoney(wallet?.reservedBalance || 0)}
              </Text>
            </View>
          </View>

          <View className="mt-4 bg-blue-50 rounded-xl p-3">
            <Text className="text-blue-800 text-xs">
              Pending Product Earnings are not withdrawable yet. They become part of your available balance after the order is marked Delivered.
            </Text>
          </View>

        </View>

        <View className="bg-white rounded-2xl p-4 mb-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-bold text-gray-800">
                COD Commission Reserve
              </Text>
              <Text className="text-gray-500 text-xs mt-1">
                Reserve used to cover the 3% COD commission before a COD order can be accepted.
              </Text>
            </View>
            <Text className="text-green-700 text-xl font-black">
              {formatMoney(wallet?.commissionReserveBalance || 0)}
            </Text>
          </View>

          <View className="flex-row mt-4">
            <View className="flex-1 mr-2 bg-gray-50 rounded-xl p-3">
              <Text className="text-gray-500 text-xs">Available Reserve</Text>
              <Text className="text-green-700 font-black mt-1">
                {formatMoney(wallet?.commissionReserveBalance || 0)}
              </Text>
            </View>
            <View className="flex-1 ml-2 bg-gray-50 rounded-xl p-3">
              <Text className="text-gray-500 text-xs">Held for COD</Text>
              <Text className="text-orange-600 font-black mt-1">
                {formatMoney(wallet?.commissionReserveHeld || 0)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setShowDepositModal(true)}
            disabled={depositLoading}
            className="bg-green-700 rounded-xl py-3 items-center mt-4"
          >
            {depositLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="add-circle-outline" size={20} color="white" />
                <Text className="text-white font-black ml-2">
                  Deposit Commission Reserve
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <View className="w-11 h-11 rounded-full bg-blue-50 items-center justify-center">
                <Ionicons name="phone-portrait-outline" size={23} color="#2563EB" />
              </View>

              <View className="ml-3 flex-1">
                <Text className="font-bold text-gray-800">
                  GCash Payout Account
                </Text>

                {payoutAccount ? (
                  <>
                    <Text className="text-gray-600 mt-1">
                      {payoutAccount.accountName}
                    </Text>
                    <Text className="text-gray-400 text-xs mt-1">
                      {payoutAccount.accountNumberMasked}
                    </Text>
                  </>
                ) : (
                  <Text className="text-gray-400 text-xs mt-1">
                    No GCash account saved yet.
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity
              onPress={openPayoutModal}
              className="bg-blue-50 px-3 py-2 rounded-xl"
            >
              <Text className="text-blue-700 font-semibold text-xs">
                {payoutAccount ? "Update" : "Add"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => {
            if (!payoutAccount) {
              openPayoutModal();
              return;
            }

            if (withdrawableAmount <= 0) {
              Alert.alert(
                "Cannot Withdraw",
                "Your withdrawable balance is ₱0.00. Settle outstanding COD deductions first."
              );
              return;
            }

            setShowWithdrawModal(true);
          }}
          disabled={withdrawLoading}
          className={`rounded-2xl py-4 mb-5 items-center justify-center ${
            withdrawableAmount > 0 && payoutAccount
              ? "bg-green-700"
              : "bg-gray-300"
          }`}
        >
          {withdrawLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <View className="flex-row items-center">
              <Ionicons name="cash-outline" size={22} color="white" />
              <Text className="text-white font-black ml-2">
                {payoutAccount
                  ? `Withdraw ${formatMoney(withdrawableAmount)}`
                  : "Add GCash to Withdraw"}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View className="bg-white rounded-2xl p-4">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-lg font-bold text-gray-800">
              Wallet History
            </Text>
            <Text className="text-gray-400 text-xs">
              {transactions.length} record(s)
            </Text>
          </View>

          {transactions.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
              <Text className="text-gray-400 mt-3">
                No wallet transactions yet.
              </Text>
            </View>
          ) : (
            transactions.map((transaction, index) => {
              const color = transactionColor(transaction);
              const sign = transactionSign(transaction);

              return (
                <View
                  key={transaction.id}
                  className={`flex-row py-4 ${
                    index < transactions.length - 1
                      ? "border-b border-gray-100"
                      : ""
                  }`}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <Ionicons
                      name={transactionIcon(transaction) as any}
                      size={20}
                      color={color}
                    />
                  </View>

                  <View className="flex-1 ml-3">
                    <Text className="font-bold text-gray-800">
                      {transactionTitle(transaction)}
                    </Text>

                    <Text className="text-gray-500 text-xs mt-1">
                      {transaction.description}
                    </Text>

                    {transaction.orderNumber ? (
                      <Text className="text-green-700 text-xs font-semibold mt-1">
                        {transaction.orderNumber}
                      </Text>
                    ) : null}

                    <Text className="text-gray-400 text-[10px] mt-1">
                      {formatDate(transaction.createdAt)}
                    </Text>
                  </View>

                  <View className="items-end ml-2">
                    <Text
                      className="font-bold"
                      style={{
                        color,
                      }}
                    >
                      {sign}
                      {formatMoney(Math.abs(transaction.amount))}
                    </Text>

                    <Text className="text-gray-400 text-[10px] mt-1">
                      {transaction.status}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showDepositModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDepositModal(false)}
      >
        <View className="flex-1 bg-black/40 justify-center px-5">
          <View className="bg-white rounded-3xl p-6">
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-xl font-black text-gray-800">
                Deposit Commission Reserve
              </Text>
              <TouchableOpacity onPress={() => setShowDepositModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-gray-500 text-xs mb-2">
              Deposit amount
            </Text>
            <TextInput
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholder="100"
              keyboardType="decimal-pad"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3"
            />

            <Text className="text-gray-400 text-xs mb-5">
              Minimum deposit: ₱100.00. This is a separate COD commission reserve, not your farmer earnings balance.
            </Text>

            <TouchableOpacity
              onPress={handleDeposit}
              disabled={depositLoading}
              className="bg-green-700 rounded-xl py-4 items-center"
            >
              {depositLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-black">
                  Continue to GCash
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPayoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPayoutModal(false)}
      >
        <View className="flex-1 bg-black/40 justify-center px-5">
          <View className="bg-white rounded-3xl p-6">
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-xl font-black text-gray-800">
                GCash Payout Account
              </Text>
              <TouchableOpacity onPress={() => setShowPayoutModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-gray-500 text-xs mb-2">
              GCash account name
            </Text>
            <TextInput
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Juan Dela Cruz"
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4"
            />

            <Text className="text-gray-500 text-xs mb-2">
              GCash mobile number
            </Text>
            <TextInput
              value={accountNumber}
              onChangeText={setAccountNumber}
              placeholder={
                payoutAccount?.accountNumberMasked || "09171234567"
              }
              keyboardType="phone-pad"
              maxLength={11}
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4"
            />

            <Text className="text-gray-400 text-[11px] mb-5">
              This information is used for the Xendit GCash payout request.
            </Text>

            <TouchableOpacity
              onPress={handleSavePayoutAccount}
              disabled={savingPayout}
              className="bg-green-700 rounded-xl py-4 items-center"
            >
              {savingPayout ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-black">
                  Save GCash Account
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View className="flex-1 bg-black/40 justify-center px-5">
          <View className="bg-white rounded-3xl p-6">
            <Text className="text-xl font-black text-gray-800">
              Confirm Withdrawal
            </Text>

            <Text className="text-gray-500 mt-2">
              Send this available balance to:
            </Text>

            <View className="bg-gray-50 rounded-2xl p-4 mt-4">
              <Text className="font-bold text-gray-800">
                {payoutAccount?.accountName}
              </Text>
              <Text className="text-gray-500 mt-1">
                {payoutAccount?.accountNumberMasked}
              </Text>
            </View>

            <Text className="text-green-700 text-3xl font-black text-center mt-5">
              {formatMoney(withdrawableAmount)}
            </Text>


            <View className="flex-row gap-3 mt-6">
              <TouchableOpacity
                onPress={() => setShowWithdrawModal(false)}
                className="flex-1 bg-gray-100 rounded-xl py-4 items-center"
              >
                <Text className="text-gray-700 font-bold">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleWithdraw}
                className="flex-1 bg-green-700 rounded-xl py-4 items-center"
              >
                <Text className="text-white font-black">
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
