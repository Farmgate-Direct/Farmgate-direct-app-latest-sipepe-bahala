import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../../FirebaseConfig";
import { listenChats } from "../../../src/services/chatService";
import {
  groupNotificationsByDay,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToFarmerNotifications,
  timeAgo,
  toMillis,
} from "../../../src/services/notificationService";
import { NotificationType } from "../../../src/types/notification";
import { OrderType } from "../../../src/types/order";

type UiNotif = NotificationType & { _nav?: () => void };

const openChat = (chat: any, farmerId: string) => {
  const buyerId = (chat?.users || []).find(
    (userId: string) => userId !== farmerId
  );
  if (!buyerId) return;

  router.push({
    pathname: "/farmer/chats/chat",
    params: {
      buyerId,
      buyerName: chat.otherUserData?.fullName || "Buyer",
      buyerProfileImage: chat.otherUserData?.profileImage || "",
    },
  });
};

const peso = (n: number) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const kindIcon = (kind: string): { name: any; bg: string; color: string } => {
  switch (kind) {
    case "order":
      return { name: "bag-handle-outline", bg: "#DCFCE7", color: "#14532D" };
    case "message":
      return { name: "chatbubble-ellipses-outline", bg: "#DBEAFE", color: "#1D4ED8" };
    case "payment":
      return { name: "checkmark-circle", bg: "#FEF3C7", color: "#B45309" };
    default:
      return { name: "information-circle", bg: "#F3F4F6", color: "#6B7280" };
  }
};

export default function FarmerNotifications() {
  const [farmerId, setFarmerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stored, setStored] = useState<NotificationType[]>([]);
  const [orders, setOrders] = useState<OrderType[]>([]);
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => {
    AsyncStorage.getItem("user").then((s) => {
      if (!s) {
        setLoading(false);
        return;
      }
      try {
        const u = JSON.parse(s);
        setFarmerId(u.uid || u.userId || u.id || "");
      } catch {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!farmerId) return;
    const unsub = subscribeToFarmerNotifications(farmerId, (items) => {
      setStored(items);
      setLoading(false);
    });
    return () => unsub();
  }, [farmerId]);

  useEffect(() => {
    if (!farmerId) return;
    const q = query(collection(db, "orders"), where("farmerId", "==", farmerId));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderType));
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setOrders(list);
    });
    return () => unsub();
  }, [farmerId]);

  useEffect(() => {
    if (!farmerId) return;
    const unsub = listenChats(farmerId, async (data) => {
      try {
        const formatted = await Promise.all(
          (data || []).map(async (chat: any) => {
            try {
              const otherUid = (chat.users || []).find((u: string) => u !== farmerId);
              if (!otherUid) return chat;
              const udoc = await getDoc(doc(db, "users", otherUid));
              return { ...chat, otherUserData: udoc.exists() ? udoc.data() : null };
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
  }, [farmerId]);

  const all: UiNotif[] = useMemo(() => {
    const items: UiNotif[] = [...stored];

    orders
      .filter((o) => o.status === "pending")
      .slice(0, 10)
      .forEach((o) => {
        const names = (o.products || []).map((p) => p.name).filter(Boolean);
        const label =
          names.length === 0
            ? "new items"
            : names.length === 1
              ? names[0]
              : `${names[0]} +${names.length - 1} more`;
        items.push({
          id: `derived-order-${o.id}`,
          farmerId,
          kind: "order",
          title: "New order",
          body: `New order for ${label} by ${o.buyerName || "a buyer"}`,
          orderId: o.id,
          read: false,
          createdAt: o.createdAt,
          _nav: () =>
            router.push({ pathname: "/farmer/orders/[id]", params: { id: o.id || "" } }),
        } as UiNotif);
      });

    [...chats]
      .sort(
        (a, b) =>
          toMillis(b.lastMessageTime || b.updatedAt) -
          toMillis(a.lastMessageTime || a.updatedAt)
      )
      .slice(0, 10)
      .forEach((c) => {
        items.push({
        id: `derived-chat-${c.id}`,
          farmerId,
          kind: "message",
          title: "New message",
        body: `New message from buyer ${c.otherUserData?.fullName || "buyer"}: ${String(c.lastMessage || "").slice(0, 60)}`,
          chatId: c.id,
          read: false,
          createdAt: c.lastMessageTime || c.updatedAt,
          _nav: () => openChat(c, farmerId),
        } as UiNotif);
      });

    orders
      .filter((o) => o.payment === "gcash" && o.paymentStatus === "paid")
      .slice(0, 10)
      .forEach((o) => {
        items.push({
          id: `derived-pay-${o.id}`,
          farmerId,
          kind: "payment",
          title: "Payment received",
          body: `Payment received for Order ${o.orderNumber || `#${String(o.id || "").slice(0, 6)}`} +${peso(Number(o.total || 0))}`,
          orderId: o.id,
          amount: Number(o.total || 0),
          read: false,
          createdAt: (o as any).paidAt || o.updatedAt || o.createdAt,
          _nav: () =>
            router.push({ pathname: "/farmer/orders/[id]", params: { id: o.id || "" } }),
        } as UiNotif);
      });

    // Delivered / claimed / cancelled updates as system notices (latest few).
    orders
      .filter((o) => ["delivered", "claimed", "cancelled"].includes(o.status))
      .slice(0, 5)
      .forEach((o) => {
        items.push({
          id: `derived-status-${o.id}`,
          farmerId,
          kind: "system",
          title:
            o.status === "delivered" || o.status === "claimed"
              ? "Order completed"
              : "Order update",
          body:
            o.status === "delivered"
              ? `Order ${o.orderNumber || `#${String(o.id || "").slice(0, 6)}`} was delivered.`
              : o.status === "claimed"
                ? `Order ${o.orderNumber || `#${String(o.id || "").slice(0, 6)}`} was claimed.`
                : `Order ${o.orderNumber || `#${String(o.id || "").slice(0, 6)}`} was cancelled.`,
          orderId: o.id,
          read: false,
          createdAt: (o as any).deliveredAt || (o as any).cancelledAt || o.updatedAt || o.createdAt,
          _nav: () =>
            router.push({ pathname: "/farmer/orders/[id]", params: { id: o.id || "" } }),
        } as UiNotif);
      });

    return items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [stored, orders, chats, farmerId]);

  // Lahat pinapakita (Today / Yesterday / Earlier) — walang tinatago.
  const groups = useMemo(() => groupNotificationsByDay(all), [all]);
  const unreadStored = stored.filter((n) => !n.read).length;

  // Nakikita na ng user ang lahat ng nasa page na ito — i-mark as seen para
  // mawala ang indicator sa bell ng Home (kasama ang mga dumating habang nakabukas).
  useEffect(() => {
    if (!farmerId) return;
    AsyncStorage.setItem(`notif-seen-${farmerId}`, String(Date.now())).catch(
      () => {}
    );
  }, [farmerId, all]);

  const handlePress = async (n: UiNotif) => {
    if (!String(n.id).startsWith("derived-")) {
      await markNotificationRead(n.id);
    }
    if (n.kind === "message" && n.chatId) {
      const chat = chats.find((item) => item.id === n.chatId);
      if (chat) {
        openChat(chat, farmerId);
        return;
      }
    }
    if (n._nav) {
      n._nav();
      return;
    }
    if (n.orderId) {
      router.push({ pathname: "/farmer/orders/[id]", params: { id: n.orderId } });
    }
  };

  const handleMarkAll = async () => {
    if (!farmerId) return;
    await markAllNotificationsRead(farmerId);
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#14532D" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F6F6F6]">
      {/* Header */}
      <View className="bg-[#14532D] px-5 pt-14 pb-4 flex-row items-center border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Ionicons name="arrow-back" size={22} color="#ffff" />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[17px] font-semibold text-white -ml-6">
          Notifications
        </Text>
        <TouchableOpacity onPress={() => router.push("/farmer/notifications/settings" as any)} className="p-1">
          <Ionicons name="settings-outline" size={22} color="#ffff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 800);
            }}
          />
        }
      >
        {all.length === 0 ? (
          <View className="items-center mt-16">
            <Ionicons name="notifications-off-outline" size={56} color="#D1D5DB" />
            <Text className="text-gray-400 mt-4">No notifications yet.</Text>
          </View>
        ) : (
          groups.map((g, index) => (
            <View
              key={g.label}
              className={
                index === 0 ? "" : g.label === "Earlier" ? "mt-2" : "mt-5"
              }
            >
              {g.label !== "Earlier" && g.label !== "Today" ? (
                <View className="flex-row justify-between items-center mb-2 px-1">
                  <Text className="font-bold text-gray-900 text-[15px]">
                    {g.label}
                  </Text>
                </View>
              ) : g.label === "Today" && unreadStored > 0 ? (
                <View className="flex-row justify-end items-center mb-2 px-1">
                  <TouchableOpacity onPress={handleMarkAll}>
                    <Text className="text-green-800 text-[12px] font-semibold">
                      Mark all read
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View className="px-1">
                {g.data.map((n) => {
                  const icon = kindIcon(n.kind);
                  const isStoredUnread =
                    !String(n.id).startsWith("derived-") && !(n as UiNotif).read;
                  return (
                    <TouchableOpacity
                      key={n.id}
                      onPress={() => handlePress(n as UiNotif)}
                      className="flex-row items-center py-3"
                      activeOpacity={0.7}
                    >
                      <View
                        className="w-9 h-9 rounded-full items-center justify-center"
                        style={{ backgroundColor: icon.bg }}
                      >
                        <Ionicons name={icon.name} size={18} color={icon.color} />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text
                          className={`text-[13.5px] ${isStoredUnread ? "font-bold text-gray-900" : "text-gray-700"}`}
                          numberOfLines={2}
                        >
                          {(n as UiNotif).body || (n as UiNotif).title}
                        </Text>
                        <Text className="text-gray-400 text-[11px] mt-0.5">
                          {timeAgo(n.createdAt)}
                        </Text>
                      </View>
                      {isStoredUnread && (
                        <View className="w-2.5 h-2.5 rounded-full bg-red-500 ml-2" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}