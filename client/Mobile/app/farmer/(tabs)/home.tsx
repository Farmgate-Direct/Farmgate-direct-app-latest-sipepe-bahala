import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../../FirebaseConfig";
import { listenChats } from "../../../src/services/chatService";
import {
  markAllNotificationsRead,
  subscribeToFarmerNotifications,
  toMillis,
} from "../../../src/services/notificationService";
import { NotificationType } from "../../../src/types/notification";
import { OrderType } from "../../../src/types/order";
import { BatchType } from "../../../src/types/product";
import { updateBatch } from "../../../src/services/productService";
import EditBatchModal from "../../farmer/products/edit-batch";

// ---------- helpers ----------
const peso = (n: number) =>
  `₱${Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const peso0 = (n: number) =>
  `₱${Math.round(Number(n || 0)).toLocaleString("en-PH")}`;

const greetingForHour = (h: number) => {
  if (h < 12) return "Good morning,";
  if (h < 18) return "Good afternoon,";
  return "Good evening,";
};

const shortName = (full?: string) => {
  if (!full) return "Farmer";
  const first = full.trim().split(/\s+/)[0];
  return first || full;
};

// "per kg" -> "kg", "per tray" -> "tray".
const unitLabel = (unit?: string) => {
  if (!unit) return "";
  return unit.replace(/^per\s+/i, "").trim();
};

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

type ProductAgg = {
  key: string;
  name: string;
  image: string;
  unit: string;
  qty: number;
  revenue: number;
};

const LOW_STOCK_THRESHOLD = 5;

const aggregateProducts = (list: OrderType[]): ProductAgg[] => {
  const map = new Map<string, ProductAgg>();
  list.forEach((o) => {
    (o.products || []).forEach((p: any) => {
      const key = String(p?.productId || p?.name || "unknown");
      const qty = Number(p?.quantity || 0);
      const revenue = qty * Number(p?.price || 0);
      const cur = map.get(key);
      if (cur) {
        cur.qty += qty;
        cur.revenue += revenue;
      } else {
        map.set(key, {
          key,
          name: p?.name || "Product",
          image: p?.image || "",
          unit: p?.unit || "",
          qty,
          revenue,
        });
      }
    });
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty);
};

const Homepage = () => {
  const [user, setUser] = useState<any>(null);
  const [farmerId, setFarmerId] = useState("");
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<OrderType[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productsCount, setProductsCount] = useState(0);
  const [batchInfo, setBatchInfo] = useState<{
    sellable: Record<string, number>;
    has: Record<string, boolean>;
    latestBatch: Record<string, BatchType>;
  }>({ sellable: {}, has: {}, latestBatch: {} });
  const [restockBatch, setRestockBatch] = useState<BatchType | null>(null);
  const [restockUnit, setRestockUnit] = useState("");
  const [restocking, setRestocking] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [storedNotifs, setStoredNotifs] = useState<NotificationType[]>([]);
  const [lastSeen, setLastSeen] = useState(0);
  const [chats, setChats] = useState<any[]>([]);
  const [inAppEnabled, setInAppEnabled] = useState(true);

  // ---------- load local user ----------
  useEffect(() => {
    AsyncStorage.getItem("user").then((s) => {
      if (!s) {
        setLoading(false);
        return;
      }
      try {
        const u = JSON.parse(s);
        setUser(u);
        setFarmerId(u.uid || u.userId || u.id || "");
      } catch {
        setLoading(false);
      }
    });
  }, []);

  // ---------- realtime: orders ----------
  useEffect(() => {
    if (!farmerId) return;
    const q = query(
      collection(db, "orders"),
      where("farmerId", "==", farmerId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as OrderType)
        );
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setOrders(list);
        setLoading(false);
      },
      (err) => {
        console.log("HOME ORDERS SNAPSHOT ERROR:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [farmerId]);

  // ---------- realtime: products + batches ----------
  useEffect(() => {
    if (!farmerId) return;
    const pq = query(
      collection(db, "products"),
      where("farmerId", "==", farmerId)
    );
    const unsubProducts = onSnapshot(pq, (psnap) => {
      const sellable = psnap.docs
        .map((d) => ({ docId: d.id, ...d.data() }))
        .filter((p: any) => !p?.archived);
      setProducts(sellable);
      setProductsCount(sellable.length);
    });

    const bq = query(
      collection(db, "productBatches"),
      where("farmerId", "==", farmerId)
    );
    const unsubBatches = onSnapshot(
      bq,
      (bsnap) => {
        const sellable: Record<string, number> = {};
        const has: Record<string, boolean> = {};
        const latestBatch: Record<string, BatchType> = {};
        bsnap.docs.forEach((d) => {
          const b = { docId: d.id, ...d.data() } as BatchType;
          if (b?.archived === true) return;
          const pid = String(b?.productId || "");
          if (!pid) return;
          has[pid] = true;
          if (
            !latestBatch[pid] ||
            b.batchNumber > latestBatch[pid].batchNumber
          ) {
            latestBatch[pid] = b;
          }
          // Sellable lang: Available at hindi archived.
          // Pag gumawa ng Batch 2, hindi na kasama ang Batch 1 dito.
          if (b?.status === "Available") {
            sellable[pid] = (sellable[pid] || 0) + Number(b?.stock || 0);
          }
        });
        setBatchInfo({ sellable, has, latestBatch });
      },
      () => {}
    );

    return () => {
      unsubProducts();
      unsubBatches();
    };
  }, [farmerId]);

  // ---------- realtime: stored notifications (badge lang) ----------
  useEffect(() => {
    if (!farmerId) return;
    const unsub = subscribeToFarmerNotifications(farmerId, (items) => {
      setStoredNotifs(items);
    });
    return () => unsub();
  }, [farmerId]);

  // ---------- realtime: chats (para sa new message indicator) ----------
  useEffect(() => {
    if (!farmerId) return;
    const unsub = listenChats(farmerId, (data: any) => {
      setChats(data || []);
    });
    return () => {
      if (unsub) unsub();
    };
  }, [farmerId]);

  // Huling beses na binuksan ang notif (seen) + In-app setting.
  // Nire-reload tuwing babalik sa Home (galing Notifications / Settings).
  useFocusEffect(
    useCallback(() => {
      if (!farmerId) return;
      AsyncStorage.getItem(`notif-seen-${farmerId}`).then((v) => {
        if (v) setLastSeen(Number(v) || 0);
      });
      AsyncStorage.getItem(`notif-settings-${farmerId}`).then((raw) => {
        if (!raw) return;
        try {
          setInAppEnabled(JSON.parse(raw)?.inApp !== false);
        } catch {}
      });
    }, [farmerId])
  );

  // ---------- derived metrics (puro real data) ----------
  // "claimed" is the pickup equivalent of "delivered" — both are completed.
  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered" || o.status === "claimed"),
    [orders]
  );

  const incomingOrdersCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  const paymentOrders = useMemo(
    () =>
      orders
        .filter((o) => o.payment === "gcash" && o.paymentStatus === "pending")
        .slice(0, 5),
    [orders]
  );

  const salesThisMonth = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const inMonth = completedOrders.filter((o) => {
      const d = new Date(toMillis(o.deliveredAt || o.createdAt) || 0);
      return d.getMonth() === m && d.getFullYear() === y;
    });
    return {
      total: inMonth.reduce((s, o) => s + Number(o.total || 0), 0),
      count: inMonth.length,
    };
  }, [completedOrders]);

  const todaysDelivered = useMemo(() => {
    const start = startOfDay(new Date()).getTime();
    const end = start + 86400000;
    return completedOrders.filter((o) => {
      const ms = toMillis(o.deliveredAt || o.createdAt);
      return ms >= start && ms < end;
    });
  }, [completedOrders]);

  const soldToday = useMemo(
    () => aggregateProducts(todaysDelivered),
    [todaysDelivered]
  );

  // Top selling overall (lahat ng delivered, hindi lang ngayong buwan).
  const topOverall = useMemo(
    () => aggregateProducts(completedOrders).slice(0, 5),
    [completedOrders]
  );

  // Batches din ang basehan ng low stock: sellable batch total kada product.
  const lowStock = useMemo(() => {
    return [...products]
      .map((p: any) => {
        const pid = String(p?.docId || "");
        const eff =
          pid && batchInfo.has[pid]
            ? Number(batchInfo.sellable[pid] || 0)
            : Number(p?.stock ?? 0);
        return { product: p, eff };
      })
      .filter(({ eff }) => eff > 0 && eff <= LOW_STOCK_THRESHOLD)
      .sort((a, b) => a.eff - b.eff)
      .slice(0, 5);
  }, [products, batchInfo]);

  // Batches ang basehan: sellable (Available, hindi archived) kada product.
  // Pag gumawa ng Batch 2, hindi na kasama ang Batch 1 sa bilang.
  const displayOutOfStock = useMemo(() => {
    let count = 0;
    products.forEach((p: any) => {
      const pid = String(p?.docId || "");
      const status = String(p?.status ?? "");
      if (status === "Out of Stock") {
        count += 1;
        return;
      }
      if (pid && batchInfo.has[pid]) {
        if (Number(batchInfo.sellable[pid] || 0) <= 0) count += 1;
      } else if (Number(p?.stock ?? 0) <= 0) {
        count += 1;
      }
    });
    return count;
  }, [products, batchInfo]);

  const unreadCount = useMemo(() => {
    const storedUnread = storedNotifs.filter((n) => !n.read).length;
    const newPending = orders.filter(
      (o) => o.status === "pending" && toMillis(o.createdAt) > lastSeen
    ).length;
    // Bagong bayad (GCash) na hindi pa "seen".
    const newPayments = orders.filter(
      (o) =>
        o.payment === "gcash" &&
        o.paymentStatus === "paid" &&
        toMillis((o as any).paidAt || o.updatedAt || o.createdAt) > lastSeen
    ).length;
    // Bagong message mula sa buyer (hindi kasama ang sariling reply).
    const newMessages = chats.filter((c: any) => {
      const lastSender =
        c.lastSenderId ?? c.lastMessageSenderId ?? c.lastSender ?? c.senderId;
      if (lastSender && lastSender === farmerId) return false;
      return toMillis(c.lastMessageTime || c.updatedAt) > lastSeen;
    }).length;
    return storedUnread + newPending + newPayments + newMessages;
  }, [storedNotifs, orders, chats, lastSeen, farmerId]);

  // Bagong pending orders na hindi pa "seen" — pang-indicator sa Incoming orders card.
  const newOrdersCount = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "pending" && toMillis(o.createdAt) > lastSeen
      ).length,
    [orders, lastSeen]
  );

  const hour = new Date().getHours();
  const farmerName = shortName(user?.fullName);

  // Pag pinindot ang bell = seen na — mawawala ang badge bilang.
  const handleBellPress = async () => {
    const now = Date.now();
    setLastSeen(now);
    if (farmerId) {
      await AsyncStorage.setItem(`notif-seen-${farmerId}`, String(now));
      await markAllNotificationsRead(farmerId);
    }
    router.push("/farmer/notifications" as any);
  };

  // Pag pinindot ang Incoming orders = seen na ang bagong orders.
  const handleIncomingPress = async () => {
    const now = Date.now();
    setLastSeen(now);
    if (farmerId) {
      await AsyncStorage.setItem(`notif-seen-${farmerId}`, String(now));
    }
    router.push({
      pathname: "/farmer/(tabs)/order",
      params: { filter: "pending" },
    });
  };

  const handleRestock = (product: any) => {
    const batch = batchInfo.latestBatch[String(product?.docId || "")];
    if (!batch) {
      router.push({
        pathname: "/farmer/products/[id]",
        params: { id: String(product?.docId || "") },
      });
      return;
    }

    setRestockBatch(batch);
    setRestockUnit(String(product?.unit || ""));
    setShowRestockModal(true);
  };

  const handleSaveRestock = async (
    batchDocId: string,
    updates: {
      price: number;
      status: string;
      restockQuantity: number;
    }
  ) => {
    setRestocking(true);
    try {
      await updateBatch(batchDocId, updates);
      setShowRestockModal(false);
      setRestockBatch(null);
    } catch (error) {
      console.log("HOME RESTOCK ERROR:", error);
      throw error;
    } finally {
      setRestocking(false);
    }
  };

  const renderThumb = (image: string, name: string, size = 44) => {
    if (image) {
      return (
        <Image
          source={{ uri: image }}
          style={{ width: size, height: size, borderRadius: 5 }}
          resizeMode="cover"
        />
      );
    }
    return (
      <View
        className="bg-green-100 items-center justify-center"
        style={{ width: size, height: size, borderRadius: 5 }}
      >
        <Text className="text-green-800 font-bold text-[16px]">
          {(name || "P").charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#F6F6F6]">
        <ActivityIndicator size="large" color="#14532D" />
        <Text className="text-green-900 mt-3 font-semibold">
          Loading dashboard...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#f5f5f5]">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 112 }}
      >
        {/* ===== Header ===== */}
        <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white font-bold text-lg">
                Home
              </Text>
              <Text className="text-white/90 text-[14px] mt-1">
                {greetingForHour(hour)} {farmerName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleBellPress}
              className="w-12 h-12 items-center justify-center"
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={24} color="white" />
              {inAppEnabled && unreadCount > 0 && (
                <View className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 items-center justify-center">
                  <Text className="text-white text-[11px] font-bold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== Body ===== */}
        <View className="px-4 pt-4 pb-3">
          {/* ===== Sales this month ===== */}
          <View className="bg-white rounded-[5px] p-5 flex-row justify-between items-center shadow-sm">
            <View className="flex-1">
              <Text className="text-gray-500 text-[12px] font-medium tracking-wide">
                SALES THIS MONTH
              </Text>
              <Text className="text-[32px] font-bold text-gray-900 mt-1">
                {peso(salesThisMonth.total)}
              </Text>
              <Text className="text-gray-500 text-[13px] mt-1">
                {salesThisMonth.count} completed order
                {salesThisMonth.count === 1 ? "" : "s"}
              </Text>
            </View>
            <View className="w-14 h-14 items-center justify-center ml-3">
              <MaterialCommunityIcons
                name="cash-multiple"
                size={34}
                color="#14532D"
              />
            </View>
          </View>

          {/* ===== Farm overview ===== */}
          <Text className="font-bold text-[18px] text-gray-900 mt-6 mb-3">
            Farm overview
          </Text>
          <View className="flex-row justify-between">
            <TouchableOpacity
              className="bg-white w-[31%] rounded-[5px] py-5 px-2 items-center shadow-sm"
              activeOpacity={0.8}
              onPress={() => router.push("/farmer/(tabs)/product")}
            >
              <MaterialCommunityIcons name="storefront-outline" size={26} color="#14532D" />
              <Text className="text-[22px] font-bold text-gray-900 mt-2">
                {productsCount}
              </Text>
              <Text className="text-gray-500 text-[12px] mt-1 text-center">Products listed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-white w-[31%] rounded-[5px] py-5 px-2 items-center shadow-sm"
              activeOpacity={0.8}
              onPress={handleIncomingPress}
            >
              {inAppEnabled && newOrdersCount > 0 && (
                <View className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">
                    {newOrdersCount > 9 ? "9+" : newOrdersCount}
                  </Text>
                </View>
              )}
              <MaterialCommunityIcons name="receipt-text-clock-outline" size={26} color="#2563EB" />
              <Text className="text-[22px] font-bold text-gray-900 mt-2">
                {incomingOrdersCount}
              </Text>
              <Text className="text-gray-500 text-[12px] mt-1 text-center">Incoming orders</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-white w-[31%] rounded-[5px] py-5 px-2 items-center shadow-sm"
              activeOpacity={0.8}
              onPress={() => router.push("/farmer/(tabs)/product")}
            >
              <MaterialCommunityIcons
                name="tray-remove"
                size={26}
                color="#DC2626"
              />
              <Text className="text-[22px] font-bold text-gray-900 mt-2">
                {displayOutOfStock}
              </Text>
              <Text className="text-gray-500 text-[12px] mt-1">
                Out of stock
              </Text>
            </TouchableOpacity>
          </View>

          {/* ===== Today's sold products ===== */}
          <Text className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 mt-6">
            TODAY&apos;S SOLD PRODUCTS
          </Text>
          <View className="bg-white rounded-[5px] px-4 py-2 mt-2 shadow-sm">
            {soldToday.length === 0 ? (
              <Text className="text-gray-500 text-center text-[14px] py-4">
                No sales today yet.
              </Text>
            ) : (
              soldToday.map((p) => (
                <View key={p.key} className="flex-row items-center py-3">
                  {renderThumb(p.image, p.name, 44)}
                  <View className="flex-1 ml-3">
                    <Text className="font-semibold text-gray-900 text-[14px]" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-gray-500 text-[12px] mt-0.5">
                      {p.qty} {unitLabel(p.unit)} sold
                    </Text>
                  </View>
                  <Text className="font-bold text-gray-900 text-[14px] ml-2">
                    {peso0(p.revenue)}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* ===== Top selling products (overall) ===== */}
          <View className="flex-row justify-between items-center mt-6 mb-1">
            <Text className="text-[11px] font-semibold tracking-[1.5px] text-gray-500">
              TOP SELLING PRODUCTS
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/farmer/products/top-selling")}
            >
              <Text className="text-green-800 text-[12px] font-semibold">
                View All
              </Text>
            </TouchableOpacity>
          </View>
          {topOverall.length === 0 ? (
            <View className="bg-white rounded-[5px] px-4 py-4 mt-2 shadow-sm">
              <Text className="text-gray-500 text-[14px] text-center">
                No completed sales yet.
              </Text>
            </View>
          ) : (
            <View className="bg-white rounded-[5px] px-4 py-2 mt-2 shadow-sm">
              {topOverall.map((p, idx) => (
                <View key={p.key} className="flex-row items-center py-3">
                  <Text className="text-[14px] font-bold text-gray-900 w-5 text-center">
                    {idx + 1}
                  </Text>
                  <View className="ml-2.5">
                    {renderThumb(p.image, p.name, 36)}
                  </View>
                  <View className="flex-1 ml-2.5">
                    <Text
                      className="font-semibold text-gray-900 text-[14px]"
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    <Text className="text-gray-400 text-[11px] mt-0.5">
                      {p.qty} sold
                    </Text>
                  </View>
                  <Text className="font-bold text-gray-900 text-[14px] ml-2">
                    {peso0(p.revenue)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* ===== Recent pending orders ===== */}
          <View className="flex-row justify-between items-center mt-6 mb-1">
            <Text className="text-[11px] font-semibold tracking-[1.5px] text-gray-500">
              PAYMENTS IN PROCESS
            </Text>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/farmer/(tabs)/order",
                  params: { filter: "to_pay" },
                })
              }
            >
              <Text className="text-green-800 text-[12px] font-semibold">
                View All
              </Text>
            </TouchableOpacity>
          </View>
          <View className="bg-white rounded-[5px] px-4 py-2 mt-2 shadow-sm">
            {paymentOrders.length === 0 ? (
              <Text className="text-gray-500 text-center text-[14px] py-4">
                No payments waiting for processing.
              </Text>
            ) : (
              paymentOrders.map((order) => (
                  <TouchableOpacity
                    key={order.id}
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: "/farmer/orders/[id]",
                        params: { id: order.id || "" },
                      })
                    }
                    className="flex-row items-center justify-between py-3"
                  >
                    <View className="mr-3 flex-1">
                      <Text className="font-semibold text-gray-900 text-[14px]" numberOfLines={1}>
                        {order.buyerName || "Buyer"}
                      </Text>
                      <Text className="text-gray-500 text-[12px] mt-0.5" numberOfLines={1}>
                        {order.products?.map((product) => product.name).filter(Boolean).join(", ") || "No items"}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-amber-700 text-[11px] font-semibold">
                        To pay
                      </Text>
                      <Text className="font-bold text-gray-900 text-[13px] mt-1">
                        {peso(Number(order.total))}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
            )}
          </View>

          {/* ===== Low stock alerts ===== */}
          <Text className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 mt-6">
            LOW STOCK ALERTS
          </Text>
          <View className="flex-row justify-end mt-1">
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/farmer/(tabs)/product",
                  params: { filter: "low_stock" },
                })
              }
            >
              <Text className="text-green-800 text-[12px] font-semibold">
                View All
              </Text>
            </TouchableOpacity>
          </View>
          <View className="bg-white rounded-[5px] px-4 py-2 mt-2 shadow-sm">
            {lowStock.length === 0 ? (
              <Text className="text-gray-500 text-center text-[14px] py-4">
                No low stock alerts. All good!
              </Text>
            ) : (
              lowStock.slice(0, 5).map(({ product: p, eff }: any) => (
                <View
                  key={p.docId || p.name}
                  className="flex-row items-center py-3"
                >
                  {renderThumb(p?.image || "", p?.name || "", 40)}
                  <Text
                    className="flex-1 font-medium text-gray-800 text-[14px] ml-3"
                    numberOfLines={1}
                  >
                    {p?.name || "Product"}
                  </Text>
                  <Text className="text-gray-500 text-[12px]">
                    {eff} {unitLabel(p?.unit)} left
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRestock(p)}
                    className="rounded-full px-4 py-1.5 ml-3"
                    activeOpacity={0.8}
                  >
                    <Text className="text-[#14532d] text-[12px] font-semibold">
                      Restock
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
        </ScrollView>

        <EditBatchModal
          visible={showRestockModal}
          batch={restockBatch}
          unit={restockUnit}
          onClose={() => {
            setShowRestockModal(false);
            setRestockBatch(null);
          }}
          onSave={handleSaveRestock}
          loading={restocking}
        />
    </View>
  );
};

export default Homepage;