// src/hooks/useBuyerNotifications.ts
//
// Iisang source ng buyer notifications: ginagamit ng Home (badge sa bell)
// at ng Notifications page (listahan), kaya hindi sila magkakaiba ng bilang.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "../../FirebaseConfig";
import { listenChats } from "../services/chatService";
import { toMillis } from "../services/notificationService";
import { OrderType } from "../types/order";

// Field sa "orders" collection na may uid ng buyer. Palitan kung iba ang pangalan.
const ORDER_BUYER_FIELD = "buyerId";

export type BuyerNotifKind = "order" | "message" | "payment" | "system";

export type BuyerNotif = {
  id: string;
  kind: BuyerNotifKind;
  title: string;
  body: string;
  createdAt: any;
  orderId?: string;
  chatId?: string;
  farmerId?: string;
  farmerName?: string;
  farmerProfileImage?: string;
};

const peso = (n: number) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const orderLabel = (o: OrderType) =>
  o.orderNumber || `#${String(o.id || "").slice(0, 6)}`;

export function useBuyerNotifications() {
  const [buyerId, setBuyerId] = useState("");
  const [orders, setOrders] = useState<OrderType[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [lastSeen, setLastSeen] = useState(0);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  // ---------- local user ----------
  useEffect(() => {
    AsyncStorage.getItem("user").then((s) => {
      if (!s) {
        setLoading(false);
        return;
      }
      try {
        const u = JSON.parse(s);
        setBuyerId(u.uid || u.userId || u.id || "");
      } catch {
        setLoading(false);
      }
    });
  }, []);

  // ---------- realtime: orders ng buyer ----------
  useEffect(() => {
    if (!buyerId) return;
    const q = query(
      collection(db, "orders"),
      where(ORDER_BUYER_FIELD, "==", buyerId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderType))
        );
        setLoading(false);
      },
      (err) => {
        console.log("BUYER NOTIF ORDERS ERROR:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [buyerId]);

  // ---------- realtime: chats (messages galing sa farmers) ----------
  useEffect(() => {
    if (!buyerId) return;
    const unsub = listenChats(buyerId, async (data: any) => {
      try {
        const formatted = await Promise.all(
          (data || []).map(async (chat: any) => {
            try {
              const otherUid = (chat.users || []).find(
                (u: string) => u !== buyerId
              );
              if (!otherUid) return chat;
              const udoc = await getDoc(doc(db, "users", otherUid));
              return {
                ...chat,
                otherUserData: udoc.exists() ? udoc.data() : null,
              };
            } catch {
              return chat;
            }
          })
        );
        setChats(formatted);
      } catch {
        setChats(data || []);
      }
    });
    return () => {
      if (unsub) unsub();
    };
  }, [buyerId]);

  // ---------- seen + In-app setting (nire-reload tuwing babalik sa screen) ----------
  useFocusEffect(
    useCallback(() => {
      if (!buyerId) return;
      const key = `buyer-notif-seen-${buyerId}`;
      AsyncStorage.getItem(key).then(async (v) => {
        if (v) {
          setLastSeen(Number(v) || 0);
        } else {
          // Unang beses: simulan sa malinis para hindi bumaha ang lumang orders.
          const now = Date.now();
          setLastSeen(now);
          await AsyncStorage.setItem(key, String(now)).catch(() => {});
        }
        setSeenLoaded(true);
      });
      AsyncStorage.getItem(`notif-settings-${buyerId}`).then((raw) => {
        if (!raw) return;
        try {
          setInAppEnabled(JSON.parse(raw)?.inApp !== false);
        } catch {}
      });
    }, [buyerId])
  );

  const markSeen = useCallback(() => {
    if (!buyerId) return;
    const now = Date.now();
    setLastSeen(now);
    AsyncStorage.setItem(`buyer-notif-seen-${buyerId}`, String(now)).catch(
      () => {}
    );
  }, [buyerId]);

  // ---------- derived notifications ----------
  const items = useMemo(() => {
    const list: BuyerNotif[] = [];

    const latestOrders = [...orders]
      .sort(
        (a, b) =>
          toMillis((b as any).updatedAt || b.createdAt) -
          toMillis((a as any).updatedAt || a.createdAt)
      )
      .slice(0, 15);

    latestOrders.forEach((o) => {
      const farm = o.farmName || "the farm";
      const no = orderLabel(o);
      const base = { orderId: o.id } as const;

      switch (o.status) {
        case "pending":
          // Ang buyer mismo ang nag-order — walang notice.
          break;
        case "processing":
          list.push({
            ...base,
            id: `order-processing-${o.id}`,
            kind: "order",
            title: "Order accepted",
            body: `${farm} is preparing your order ${no}.`,
            createdAt: (o as any).updatedAt || o.createdAt,
          });
          break;
        case "delivered":
          list.push({
            ...base,
            id: `order-delivered-${o.id}`,
            kind: "order",
            title: "Order delivered",
            body: `Your order ${no} from ${farm} was delivered.`,
            createdAt:
              (o as any).deliveredAt || (o as any).updatedAt || o.createdAt,
          });
          break;
        case "claimed":
          list.push({
            ...base,
            id: `order-claimed-${o.id}`,
            kind: "order",
            title: "Order claimed",
            body: `Your order ${no} from ${farm} was claimed.`,
            createdAt:
              (o as any).deliveredAt || (o as any).updatedAt || o.createdAt,
          });
          break;
        case "cancelled":
          list.push({
            ...base,
            id: `order-cancelled-${o.id}`,
            kind: "system",
            title: "Order cancelled",
            body: `Order ${no} was cancelled.`,
            createdAt:
              (o as any).cancelledAt || (o as any).updatedAt || o.createdAt,
          });
          break;
        default:
          list.push({
            ...base,
            id: `order-status-${o.id}`,
            kind: "system",
            title: "Order update",
            body: `Order ${no} is now ${String(o.status)}.`,
            createdAt: (o as any).updatedAt || o.createdAt,
          });
      }

      if (o.payment === "gcash" && o.paymentStatus === "paid") {
        list.push({
          ...base,
          id: `payment-${o.id}`,
          kind: "payment",
          title: "Payment confirmed",
          body: `Your payment for Order ${no} (${peso(Number(o.total || 0))}) was received.`,
          createdAt: (o as any).paidAt || (o as any).updatedAt || o.createdAt,
        });
      }
    });

    [...chats]
      .sort(
        (a, b) =>
          toMillis(b.lastMessageTime || b.updatedAt) -
          toMillis(a.lastMessageTime || a.updatedAt)
      )
      .slice(0, 10)
      .forEach((c) => {
        const farmerId = (c.users || []).find(
          (uid: string) => uid !== buyerId
        );
        if (!farmerId || c.lastSenderId !== farmerId) return;
        if (!c.lastMessage) return;

        const name =
          c.otherUserData?.farmName || c.otherUserData?.fullName || "a farmer";
        list.push({
          id: `message-${c.id}`,
          kind: "message",
          title: "New message",
          body: `New message from ${name}: ${String(c.lastMessage || "").slice(0, 60)}`,
          chatId: c.id,
          farmerId,
          farmerName: c.otherUserData?.farmName || c.otherUserData?.fullName || "Farmer",
          farmerProfileImage: c.otherUserData?.profileImage || "",
          createdAt: c.lastMessageTime || c.updatedAt,
        });
      });

    return list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [orders, chats, buyerId]);

  const unreadCount = useMemo(
    () => items.filter((n) => toMillis(n.createdAt) > lastSeen).length,
    [items, lastSeen]
  );

  return {
    items,
    unreadCount,
    lastSeen,
    seenLoaded,
    markSeen,
    inAppEnabled,
    loading,
  };
}