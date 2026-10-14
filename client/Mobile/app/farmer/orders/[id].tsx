import AsyncStorage from "@react-native-async-storage/async-storage";

import { Ionicons } from "@expo/vector-icons";

import {
  useLocalSearchParams,
  useRouter,
} from "expo-router";

import React, {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFarmerAlert } from "@/context/FarmerAlertContext";
import { useToast } from "@/context/ToastContext";

import {
  declineOrder,
  getOrderById,
  updateOrderStatus,
  acceptOrder,
  cancelAcceptedOrderByFarmer,
} from "@/src/services/orderService";
import { formatPhilippinePhoneNumber } from "@/utils/validators";

export default function OrderDetails() {
  const router = useRouter();
  const Alert = useFarmerAlert();
  const { showToast } = useToast();

  const { id } =
    useLocalSearchParams();

  const [order, setOrder] =
    useState<any>(null);

  const [farmerId, setFarmerId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [actionLoading, setActionLoading] =
    useState(false);

  // ================= CANCEL MODAL =================
  const [showCancelModal, setShowCancelModal] =
    useState(false);

  const [selectedReason, setSelectedReason] =
    useState("");

  const [customReason, setCustomReason] =
    useState("");

  // ================= CANCEL REASONS =================
  const cancelReasons = [
    "Out of stock",
    "Unable to fulfill",
    "Farmer unavailable",
    "Other",
  ];

  // ================= FORMAT DATE =================
  const formatDateTime = (
    timestamp: any
  ) => {
    if (!timestamp) {
      return "Date unavailable";
    }

    try {
      let date: Date;

      if (
        typeof timestamp?.toDate ===
        "function"
      ) {
        date =
          timestamp.toDate();
      } else if (
        typeof timestamp?.seconds ===
        "number"
      ) {
        date = new Date(
          timestamp.seconds * 1000
        );
      } else {
        date =
          new Date(timestamp);
      }

      if (
        isNaN(
          date.getTime()
        )
      ) {
        return "Date unavailable";
      }

      return date.toLocaleString(
        "en-PH",
        {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }
      );
    } catch {
      return "Date unavailable";
    }
  };

  // ================= STATUS LABEL =================
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pending";
      case "accepted": return "Accepted";
      case "processing": return "Processing";
      case "to_receive": return "To Receive";
      case "delivered": return "Delivered";
      case "claimed": return "Claimed";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  // ================= LOAD ORDER =================
  const loadOrder =
    async () => {
      try {
        if (!id) {
          return;
        }

        const data =
          await getOrderById(
            String(id)
          );

        setOrder(data);
      } catch (error) {
        console.log(
          "LOAD ORDER ERROR:",
          error
        );

        showToast("Failed to load order.");
      } finally {
        setLoading(false);
      }
    };

  // ================= LOAD FARMER =================
  const loadFarmer =
    async () => {
      try {
        const userStr =
          await AsyncStorage.getItem(
            "user"
          );

        if (!userStr) {
          return;
        }

        const user =
          JSON.parse(userStr);

        setFarmerId(
          user.uid ||
            user.userId ||
            user.id ||
            ""
        );
      } catch (error) {
        console.log(
          "LOAD FARMER ERROR:",
          error
        );
      }
    };

  useEffect(() => {
    loadOrder();
    loadFarmer();
  }, [id]);

  // ================= ACCEPT ORDER =================
  const handleAccept = async () => {
    try {
      if (!order?.id) return;

      if (!farmerId) {
        showToast("Farmer not found.");
        return;
      }

      setActionLoading(true);

      await acceptOrder(order.id, farmerId);
      await loadOrder();

      showToast(
        order.payment === "gcash"
          ? "Order accepted. The buyer can now pay with GCash."
          : "Order accepted. Stock will be deducted when processing starts."
      );
    } catch (error: any) {
      console.log("ACCEPT ORDER ERROR:", error);
      showToast(error?.message || "Failed to accept order.");
    } finally {
      setActionLoading(false);
    }
  };

  // ================= MARK PROCESSING =================
  const handleProcessing = async () => {
    try {
      if (!order?.id) return;

      if (!farmerId) {
        showToast("Farmer not found.");
        return;
      }

      setActionLoading(true);
      await updateOrderStatus(order.id, farmerId, "processing");
      await loadOrder();

      showToast("Order is now being prepared.");
    } catch (error: any) {
      console.log("PROCESS ORDER ERROR:", error);
      showToast(error?.message || "Failed to mark the order as processing.");
    } finally {
      setActionLoading(false);
    }
  };

  // ================= MARK TO RECEIVE =================
  const handleToReceive = async () => {
    try {
      if (!order?.id) return;

      if (!farmerId) {
        showToast("Farmer not found.");
        return;
      }

      setActionLoading(true);
      await updateOrderStatus(order.id, farmerId, "to_receive");
      await loadOrder();

      showToast("Order marked as To Receive.");
    } catch (error: any) {
      console.log("TO RECEIVE ERROR:", error);
      showToast(error?.message || "Failed to mark the order as To Receive.");
    } finally {
      setActionLoading(false);
    }
  };

  // ================= MARK DELIVERED =================
  const handleDelivered = async () => {
    try {
      if (!order?.id) return;

      if (!farmerId) {
        showToast("Farmer not found.");
        return;
      }

      setActionLoading(true);
      const isPickup = order.delivery === "pickup";
      await updateOrderStatus(
        order.id,
        farmerId,
        isPickup ? "claimed" : "delivered"
      );
      await loadOrder();

      showToast(
        isPickup
          ? order.payment === "cod"
            ? "Order claimed. COD commission was recorded."
            : "Order claimed and farmer wallet updated."
          : order.payment === "cod"
            ? "Order delivered. COD commission and delivery deductions were recorded."
            : "Order delivered and farmer wallet updated."
      );
    } catch (error: any) {
      console.log("DELIVERED ORDER ERROR:", error);
      showToast(error?.message || "Failed to complete the order.");
    } finally {
      setActionLoading(false);
    }
  };

  // ================= OPEN CANCEL MODAL =================
  const openCancelModal =
    () => {
      setSelectedReason("");
      setCustomReason("");
      setShowCancelModal(true);
    };

  // ================= CONTINUE CANCEL =================
  const continueCancel =
    () => {
      if (!selectedReason) {
        showToast("Please select a cancellation reason.");
        return;
      }

      if (
        selectedReason ===
          "Other" &&
        !customReason.trim()
      ) {
        showToast("Please enter your cancellation reason.");
        return;
      }

      const finalReason =
        selectedReason === "Other"
          ? customReason.trim()
          : selectedReason;

      Alert.alert(
        "Confirm Cancellation",
        `Are you sure you want to ${order?.status === "accepted" ? "cancel" : "decline"} this order?\n\nReason:\n${finalReason}`,
        [
          {
            text: "Keep Order",
            style: "cancel",
          },
          {
            text: order?.status === "accepted" ? "Yes, Cancel" : "Yes, Decline",
            style: "destructive",
            onPress: () =>
              confirmCancellation(
                finalReason
              ),
          },
        ]
      );
    };

  // ================= CONFIRM CANCELLATION =================
  const confirmCancellation =
    async (
      reason: string
    ) => {
      try {
        if (!order?.id) {
          return;
        }

        if (!farmerId) {
          showToast("Farmer not found.");
          return;
        }

        setShowCancelModal(false);
        setActionLoading(true);

        if (order.status === "accepted") {
          await cancelAcceptedOrderByFarmer(
            order.id,
            farmerId,
            reason
          );
        } else {
          await declineOrder(
            order.id,
            farmerId,
            reason
          );
        }

        await loadOrder();

        showToast("Order cancelled successfully.");
      } catch (error: any) {
        console.log(
          "CANCEL ORDER ERROR:",
          error
        );

        showToast(error?.message || "Failed to cancel the order.");
      } finally {
        setActionLoading(false);
      }
    };

  // ================= LOADING =================
  if (
    loading ||
    !order
  ) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator
          size="large"
          color="#14532d"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#14532d]">

      {/* ================= HEADER ================= */}
      <View className="bg-[#14532d] px-5 pb-5 pt-14">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3 h-10 w-10 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Back to orders"
          >
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-2xl font-bold text-white">
              Order Details
            </Text>
          </View>
        </View>
      </View>

      {/* ================= BODY ================= */}
      <View className="flex-1 bg-[#fafafa] px-4 pt-5">

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={{
            paddingBottom: 30,
          }}
        >

          {/* ================= ORDER NUMBER ================= */}
          <View className="mb-3 rounded-[10px] border border-green-100 bg-white p-4">

            <Text className="text-xs font-medium text-gray-500">
              FarmGate Order ID
            </Text>

            <Text className="mt-1 text-lg font-bold text-[#14532d]">
              {order.orderNumber ||
                `FG-${order.id}`}
            </Text>

          </View>

          {/* ================= BUYER INFORMATION ================= */}
          <View className="mb-3 rounded-[10px] border border-gray-100 bg-white p-4">

            <Text className="mb-3 text-base font-bold text-gray-900">
              Buyer Information
            </Text>

            <View className="flex-row items-center mb-3">

              <Ionicons
                name="person-outline"
                size={19}
                color="#14532d"
              />

              <View className="ml-2 flex-1 flex-row items-center justify-between">
                <Text className="font-semibold text-gray-700">
                  {order.buyerName || "Buyer"}
                </Text>
                {order.buyerId && (
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: "/farmer/chats/chat",
                        params: {
                          buyerId: order.buyerId,
                          buyerName: order.buyerName || "Buyer",
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${order.buyerName || "buyer"}`}
                    className="ml-3 h-10 w-10 items-center justify-center rounded-[10px] bg-green-50"
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={20}
                      color="#14532d"
                    />
                  </TouchableOpacity>
                )}
              </View>

            </View>

            {order.address?.phone && (
              <View className="flex-row items-center">

                <Ionicons
                  name="call-outline"
                  size={19}
                  color="#14532d"
                />

                <Text className="ml-2 text-gray-600">
                  {formatPhilippinePhoneNumber(order.address.phone)}
                </Text>

              </View>
            )}

          </View>

          {/* ================= ORDER TIMELINE ================= */}
          <View className="mb-3 rounded-[10px] border border-gray-100 bg-white p-4">
            <Text className="mb-4 text-base font-bold text-gray-900">Order Timeline</Text>

            <TimelineRow
              icon="cart-outline"
              title="Order Placed"
              date={order.createdAt}
              color="#14532d"
              showLine={!!order.farmerDecisionAt || !!order.cancelledAt}
            />

            {order.farmerDecision === "accepted" && order.farmerDecisionAt && (
              <TimelineRow
                icon="checkmark-circle-outline"
                title="Accepted"
                date={order.farmerDecisionAt}
                color="#2563EB"
                showLine={!!order.processingAt || !!order.toReceiveAt || !!order.deliveredAt}
              />
            )}

            {order.processingAt && (
              <TimelineRow
                icon="cube-outline"
                title="Processing"
                date={order.processingAt}
                color="#14532d"
                showLine={!!order.toReceiveAt || !!order.deliveredAt}
              />
            )}

            {order.toReceiveAt && (
              <TimelineRow
                icon="bag-check-outline"
                title="To Receive"
                date={order.toReceiveAt}
                color="#7C3AED"
                showLine={!!order.deliveredAt}
              />
            )}

            {order.deliveredAt && (
              <TimelineRow
                icon="checkmark-circle-outline"
                title={order.delivery === "pickup" ? "Claimed" : "Delivered"}
                date={order.deliveredAt}
                color="#2563EB"
                showLine={false}
              />
            )}

            {order.cancelledAt && (
              <TimelineRow
                icon="close-circle-outline"
                title="Cancelled"
                date={order.cancelledAt}
                color="#DC2626"
                showLine={false}
              />
            )}
          </View>

          {/* ================= STATUS ================= */}
          <View className="mb-3 rounded-[10px] border border-gray-100 bg-white p-4">
            <Text className="mb-2 text-xs font-medium text-gray-500">Order Status</Text>
            <Text
              className={`text-lg font-bold ${
                order.status === "pending"
                  ? "text-amber-600"
                  : order.status === "accepted"
                  ? "text-blue-600"
                  : order.status === "processing"
                  ? ""
                  : order.status === "to_receive"
                  ? "text-purple-700"
                  : order.status === "delivered" ||
                    order.status === "claimed"
                  ? "text-blue-600"
                  : "text-gray-600"
              }`}
              style={{
                color:
                  order.status === "processing"
                    ? "#14532d"
                    : undefined,
              }}
            >
              {getStatusLabel(order.status)}
            </Text>
          </View>

          {/* ================= CANCELLATION DETAILS ================= */}
          {order.status ===
            "cancelled" && (

            <View className="mb-3 rounded-[10px] border border-red-100 bg-red-50 p-4">

              <View className="flex-row items-center mb-3">

                <Ionicons
                  name="close-circle"
                  size={22}
                  color="#DC2626"
                />

                <Text className="ml-2 text-base font-bold text-red-700">
                  Cancellation Details
                </Text>

              </View>

              <Text className="text-xs font-medium text-gray-500">
                Cancelled By
              </Text>

              <Text className="mb-3 font-semibold capitalize text-gray-800">
                {order.cancelledBy ||
                  "Unknown"}
              </Text>

              <Text className="text-xs font-medium text-gray-500">
                Reason
              </Text>

              <Text className="mb-3 font-medium text-gray-800">
                {order.cancelReason ||
                  "No reason provided"}
              </Text>

              <Text className="text-xs font-medium text-gray-500">
                Cancelled Date
              </Text>

              <Text className="font-medium text-gray-800">
                {formatDateTime(
                  order.cancelledAt
                )}
              </Text>

            </View>
          )}

          {/* ================= PRODUCTS ================= */}
          <View className="mb-3 rounded-[10px] border border-gray-100 bg-white p-4">

            <Text className="mb-4 text-base font-bold text-gray-900">
              Products
            </Text>

            {order.products?.map(
              (
                product: any,
                index: number
              ) => (

                <View
                  key={
                    product.productId ||
                    `product-${index}`
                  }
                  className={`flex-row justify-between py-3 ${
                    index < (order.products?.length || 0) - 1
                      ? "border-b border-gray-100"
                      : ""
                  }`}
                >

                  <View className="flex-1">

                    <Text className="font-semibold text-gray-800">
                      {product.name}
                    </Text>

                    <Text className="mt-1 text-sm text-gray-600">
                      Qty:{" "}
                      {product.quantity}
                    </Text>

                    <Text className="mt-1 text-xs text-gray-500">
                      ₱
                      {Number(
                        product.price
                      ).toFixed(2)}
                      {" / "}
                      {product.unit || "unit"}
                    </Text>

                  </View>

                  <Text className="font-bold text-[#14532d]">
                    ₱
                    {(
                      Number(
                        product.price
                      ) *
                      Number(
                        product.quantity
                      )
                    ).toFixed(2)}
                  </Text>

                </View>
              )
            )}

          </View>

          {/* ================= DELIVERY ================= */}
          <View className="mb-3 rounded-[10px] border border-gray-100 bg-white p-4">

            <Text className="mb-3 text-base font-bold text-gray-900">
              Delivery Information
            </Text>

            <Text className="text-xs font-medium text-gray-500">
              Type
            </Text>

            <Text className="mb-4 mt-1 font-semibold capitalize text-gray-800">
              {order.delivery ||
                "N/A"}
            </Text>

            {order.delivery ===
            "pickup" ? (

              <>
                <Text className="text-xs font-medium text-gray-500">
                  Pickup Date
                </Text>

                <Text className="mb-3 mt-1 font-semibold text-gray-800">
                  {order.pickupDate ||
                    "Not set"}
                </Text>

                <Text className="text-xs font-medium text-gray-500">
                  Pickup Time
                </Text>

                <Text className="mt-1 font-semibold text-gray-800">
                  {order.pickupTime ||
                    "Not set"}
                </Text>
              </>

            ) : (

              <>
                <Text className="text-xs font-medium text-gray-500">
                  Delivery Address
                </Text>

                <Text className="mt-1 font-semibold text-gray-800">
                  {order.address?.street ||
                    ""}
                </Text>

                <Text className="text-gray-600">
                  {order.address?.barangay ||
                    ""}
                  {order.address?.barangay
                    ? ", "
                    : ""}
                  {order.address?.city ||
                    ""}
                </Text>

                <Text className="text-gray-600">
                  {order.address?.province ||
                    ""}
                </Text>

                {order.address?.phone && (
                  <View className="flex-row items-center mt-3">

                    <Ionicons
                      name="call-outline"
                      size={16}
                      color="#14532d"
                    />

                    <Text className="ml-2 text-gray-600">
                      {
                        order
                          .address
                          .phone
                      }
                    </Text>

                  </View>
                )}

              </>
            )}

          </View>

          {/* ================= PAYMENT ================= */}
          <View className="mb-3 rounded-[10px] border border-gray-100 bg-white p-4">

            <Text className="mb-3 text-base font-bold text-gray-900">
              Payment
            </Text>

            <View className="flex-row items-center">

              <Ionicons
                name={
                  order.delivery === "pickup"
                    ? "storefront-outline"
                    : order.payment ===
                  "gcash"
                    ? "qr-code-outline"
                    : "cash-outline"
                }
                size={20}
                color="#14532d"
              />

              <Text className="ml-2 font-semibold text-gray-800">
                {order.payment ===
                "gcash" && order.delivery !== "pickup"
                  ? "GCash"
                  : order.delivery === "pickup"
                    ? "Pay on Pickup"
                    : "Cash on Delivery"}
              </Text>

            </View>

          </View>

          {/* ================= TOTAL ================= */}
          <View className="rounded-[10px] border border-green-100 bg-green-50 p-4">

            <View className="flex-row justify-between mb-1.5">
              <Text className="text-sm text-gray-600">
                Subtotal
              </Text>
              <Text className="text-sm font-semibold text-gray-800">
                ₱
                {Number(
                  order.subTotal ?? order.subtotal ?? 0
                ).toFixed(2)}
              </Text>
            </View>

            <View className="flex-row justify-between mb-1.5">
              <Text className="text-sm text-gray-600">
                Delivery fee
                {order.delivery === "delivery" &&
                order.distanceKm !== null &&
                order.distanceKm !== undefined
                  ? ` (${Number(order.distanceKm).toFixed(1)} km)`
                  : ""}
              </Text>
              <Text className="text-sm font-semibold text-gray-800">
                ₱
                {Number(
                  order.deliveryFee || 0
                ).toFixed(2)}
              </Text>
            </View>

            <View className="flex-row justify-between">
              <Text className="font-semibold text-gray-800">
                Total
              </Text>
              <Text className="text-2xl font-bold text-[#14532d]">
                ₱
                {Number(
                  order.total
                ).toFixed(2)}
              </Text>
            </View>

            {order.delivery === "delivery" && Number(order.deliveryFee || 0) > 0 && (
              <View className="mt-3 rounded-[8px] border border-green-200 bg-white p-2.5">
                <Text className="text-xs font-bold text-[#14532d]">
                  The delivery fee is yours.
                </Text>
                <Text className="mt-0.5 text-[11px] text-gray-600">
                  {order.payment === "gcash"
                    ? "GCash: the fee goes to you in full (no 3% commission — commission applies to products only)."
                    : "COD: the fee is cash you already hold, so nothing extra is credited to your wallet."}
                </Text>
              </View>
            )}

          </View>

        </ScrollView>

        {/* ================= ACTIONS ================= */}
        {!actionLoading && order.status === "pending" && (
          <View className="flex-row border-t border-gray-100 bg-[#fafafa] pb-5 pt-2">
            <TouchableOpacity
              onPress={openCancelModal}
              className="mr-2 flex-1 rounded-[10px] border border-red-200 bg-white py-3.5"
            >
              <Text className="text-center font-bold text-red-600">Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAccept}
              className="ml-2 flex-1 rounded-[10px] bg-[#14532d] py-3.5"
            >
              <Text className="text-center font-bold text-white">Accept</Text>
            </TouchableOpacity>
          </View>
        )}

        {!actionLoading && order.status === "accepted" && (
          <>
            {order.payment === "gcash" && order.paymentStatus !== "paid" && (
              <View className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 p-3">
                <Text className="text-yellow-800 text-sm font-semibold">
                  Waiting for the buyer to complete the GCash payment.
                </Text>
              </View>
            )}

            <View className="flex-row border-t border-gray-100 bg-[#fafafa] pb-5 pt-2">
              {!(order.payment === "gcash" && order.paymentStatus === "paid") && (
                <TouchableOpacity
                  onPress={openCancelModal}
                  className="mr-2 flex-1 rounded-[10px] border border-red-200 bg-white py-3.5"
                >
                  <Text className="text-center font-bold text-red-600">Cancel Order</Text>
                </TouchableOpacity>
              )}

              {(order.payment === "cod" || order.paymentStatus === "paid") && (
                <TouchableOpacity
                  onPress={handleProcessing}
                  className={`flex-1 rounded-[10px] bg-[#14532d] py-3.5 ${
                    order.payment === "gcash" && order.paymentStatus === "paid" ? "" : "ml-2"
                  }`}
                >
                  <Text className="text-center font-bold text-white">Mark as Processing</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {!actionLoading && order.status === "processing" && (
          <View className="border-t border-gray-100 bg-[#fafafa] pb-5 pt-2">
            <TouchableOpacity
              onPress={handleToReceive}
              activeOpacity={0.8}
              className="rounded-[10px] bg-purple-700 py-3.5"
            >
              <Text className="text-center font-bold text-white">Mark as To Receive</Text>
            </TouchableOpacity>
          </View>
        )}

        {!actionLoading && order.status === "to_receive" && (
          <View className="border-t border-gray-100 bg-[#fafafa] pb-5 pt-2">
            <TouchableOpacity
              onPress={handleDelivered}
              activeOpacity={0.8}
              className="rounded-[10px] bg-[#14532d] py-3.5"
            >
              <Text className="text-center font-bold text-white">
                {order.delivery === "pickup" ? "Mark as Claimed" : "Mark as Delivered"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {actionLoading && (

          <View className="mt-4 items-center rounded-[10px] bg-white py-4">

            <ActivityIndicator
              color="#14532d"
            />

            <Text className="text-gray-600 mt-2">
              Updating order...
            </Text>

          </View>
        )}

      </View>

      {/* ================= CANCEL MODAL ================= */}
      <Modal
        visible={
          showCancelModal
        }
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() =>
          setShowCancelModal(
            false
          )
        }
      >

        <View className="flex-1 justify-end bg-black/40">

          <View className="rounded-t-[24px] bg-[#fafafa] p-5">

            <View className="w-10 h-1 bg-gray-300 rounded-full self-center mb-5" />

            <Text className="text-xl font-bold text-gray-900">
              {order.status === "accepted" ? "Cancel Order" : "Decline Order"}
            </Text>

            <Text className="text-gray-500 mt-1 mb-5">
              {order.status === "accepted"
                ? "Please select the reason for cancelling this order."
                : "Please select the reason for declining this order."}
            </Text>

            {/* REASONS */}
            {cancelReasons.map(
              (reason) => {

                const selected =
                  selectedReason ===
                  reason;

                return (
                  <TouchableOpacity
                    key={reason}
                    onPress={() =>
                      setSelectedReason(
                        reason
                      )
                    }
                    className={`mb-3 flex-row items-center rounded-[10px] border px-4 py-3 ${
                      selected
                        ? "border-red-500 bg-red-50"
                          : "border-gray-200 bg-white"
                    }`}
                  >

                    <Ionicons
                      name={
                        selected
                          ? "radio-button-on"
                          : "radio-button-off"
                      }
                      size={20}
                      color={
                        selected
                          ? "#DC2626"
                          : "#9CA3AF"
                      }
                    />

                    <Text className="ml-3 text-gray-700 font-semibold">
                      {reason}
                    </Text>

                  </TouchableOpacity>
                );
              }
            )}

            {/* OTHER INPUT */}
            {selectedReason ===
              "Other" && (

              <TextInput
                value={
                  customReason
                }
                onChangeText={
                  setCustomReason
                }
                placeholder="Enter your reason..."
                multiline
                textAlignVertical="top"
                className="mb-4 min-h-[100px] rounded-[10px] border border-gray-300 bg-white px-4 py-3 text-gray-800"
              />
            )}

            {/* CONTINUE */}
            <TouchableOpacity
              onPress={
                continueCancel
              }
              disabled={
                actionLoading
              }
              className="rounded-[10px] bg-red-600 py-3.5"
            >

              <Text className="text-white text-center font-bold">
                Continue
              </Text>

            </TouchableOpacity>

            {/* KEEP */}
            <TouchableOpacity
              onPress={() =>
                setShowCancelModal(
                  false
                )
              }
              disabled={
                actionLoading
              }
              className="mt-3 rounded-[10px] bg-white py-3.5"
            >

              <Text className="text-gray-700 text-center font-bold">
                Keep Order
              </Text>

            </TouchableOpacity>

          </View>

        </View>

      </Modal>

    </View>
  );
}

// ================= TIMELINE =================
function TimelineRow({
  icon,
  title,
  date,
  color,
  showLine = true,
}: {
  icon: any;
  title: string;
  date: any;
  color: string;
  showLine?: boolean;
}) {
  const formatDate =
    (timestamp: any) => {

      if (!timestamp) {
        return "";
      }

      try {

        let date: Date;

        if (
          typeof timestamp?.toDate ===
          "function"
        ) {

          date =
            timestamp.toDate();

        } else if (
          typeof timestamp?.seconds ===
          "number"
        ) {

          date = new Date(
            timestamp.seconds *
              1000
          );

        } else {

          date =
            new Date(
              timestamp
            );
        }

        if (
          isNaN(
            date.getTime()
          )
        ) {

          return "";
        }

        return date.toLocaleString(
          "en-PH",
          {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }
        );

      } catch {

        return "";
      }
    };

  return (
    <View className="flex-row">

      {/* ICON + LINE */}
      <View className="items-center mr-3">

        <View
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{
            backgroundColor:
              `${color}15`,
          }}
        >

          <Ionicons
            name={icon}
            size={19}
            color={color}
          />

        </View>

        {showLine && (
          <View
            className="w-[2px] h-8 mt-1"
            style={{
              backgroundColor:
                "#D1D5DB",
            }}
          />
        )}

      </View>

      {/* TEXT */}
      <View className="flex-1 pb-3">

        <Text className="font-bold text-gray-800">
          {title}
        </Text>

        <Text className="text-gray-500 text-xs mt-1">
          {formatDate(date)}
        </Text>

      </View>

    </View>
  );
}