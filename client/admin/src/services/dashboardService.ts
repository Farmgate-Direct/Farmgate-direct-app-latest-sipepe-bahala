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

// Lowercase + trim so counts stay correct.
const norm = (value: any) => (value || "").toString().trim().toLowerCase();

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
        earnings +=
          Math.round((data.total || 0) * COMMISSION_RATE * 100) / 100;
      }
    });
    return { totalOrders: snapshot.size, earnings, statusCounts };
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
