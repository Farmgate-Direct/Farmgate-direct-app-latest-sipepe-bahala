// Dashboard counts and summaries.
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../FirebaseConfig";

const usersRef = collection(db, "users");
const ordersRef = collection(db, "orders");

const DELIVERED_STATUSES = ["delivered", "claimed"];
const COMMISSION_RATE = 0.03;

const norm = (value: any) => (value || "").toString().trim().toLowerCase();

// Commission is 3% of the order subtotal ONLY (delivery fee excluded).
// e.g. subtotal ₱250 x 0.03 = ₱7.50 per order.
// Prefer the backend-written commissionAmount (source of truth), then
// fall back to subTotal/subtotal/products so old orders still compute right.
const numOrNull = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getOrderSubtotal = (data: any): number => {
  const saved =
    numOrNull(data?.subTotal) ?? numOrNull(data?.subtotal) ?? null;
  if (saved !== null && saved >= 0) return saved;
  const items = Array.isArray(data?.products) ? data.products : [];
  if (items.length > 0) {
    const sum = items.reduce(
      (s: number, item: any) =>
        s + Number(item?.price || 0) * Number(item?.quantity || 0),
      0,
    );
    if (Number.isFinite(sum) && sum >= 0) return Math.round(sum * 100) / 100;
  }
  // Last resort: total minus delivery fee (never total alone).
  const total = Number(data?.total) || 0;
  const fee = Number(data?.deliveryFee) || 0;
  return Math.max(0, Math.round((total - fee) * 100) / 100);
};

const getOrderCommission = (data: any): number => {
  const saved = numOrNull(data?.commissionAmount);
  if (saved !== null && saved >= 0) return saved;
  return Math.round(getOrderSubtotal(data) * COMMISSION_RATE * 100) / 100;
};

// Get users waiting approval.
export const getPendingUsers = async () => {
  try {
    const snapshot = await getDocs(usersRef);
    const users = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((user: any) => norm(user.status) === "pending");
    users.sort((a: any, b: any) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
      return dateB.getTime() - dateA.getTime();
    });
    return users;
  } catch (error) {
    console.error("Pending Users Error:", error);
    return [];
  }
};

// Get latest user signups.
export const getRecentActivity = async () => {
  try {
    const snapshot = await getDocs(
      query(usersRef, orderBy("createdAt", "desc"), limit(5))
    );
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Recent Activity Error:", error);
    return [];
  }
};

// Count approved farmers and buyers.
export const getApprovedUserCounts = async () => {
  try {
    const snapshot = await getDocs(usersRef);
    let farmers = 0;
    let buyers = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (norm(data.status) !== "approved") return;
      const role = norm(data.role);
      if (role === "farmer") farmers += 1;
      else if (role === "buyer") buyers += 1;
    });
    return { farmers, buyers };
  } catch (error) {
    console.error("Approved User Counts Error:", error);
    return { farmers: 0, buyers: 0 };
  }
};

// Get order totals and earnings.
export const getOrdersSummary = async () => {
  try {
    const snapshot = await getDocs(ordersRef);
    const statusCounts: Record<string, number> = {
      pending: 0,
      accepted: 0,
      processing: 0,
      to_receive: 0,
      delivered: 0,
      claimed: 0,
      cancelled: 0,
    };
    let earnings = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const status = norm(data.status);
      if (status in statusCounts) statusCounts[status] += 1;
      if (DELIVERED_STATUSES.includes(status)) {
        earnings += getOrderCommission(data);
      }
    });
    return {
      totalOrders: snapshot.size,
      earnings: Math.round(earnings * 100) / 100,
      statusCounts,
    };
  } catch (error) {
    console.error("Orders Summary Error:", error);
    return {
      totalOrders: 0,
      earnings: 0,
      statusCounts: {
        pending: 0,
        accepted: 0,
        processing: 0,
        to_receive: 0,
        delivered: 0,
        claimed: 0,
        cancelled: 0,
      },
    };
  }
};

export { getRecentOrders } from "./orderService";
