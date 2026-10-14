import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useToast } from "../../../context/ToastContext";
import { useAppAlert } from "@/context/FarmerAlertContext";
import React, { useCallback, useState } from "react";
import { getBatchesByProduct } from "@/src/services/productService";

import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  getCartByBuyer,
  removeCartItem,
  updateCartQuantity,
} from "@/src/services/cartService";

import {
  groupCartByFarmer,
  FarmerCart,
} from "../../../utils/groupCartByFarmer";

import { CartItem } from "@/src/types/cart";

import {
  eggVariantToBaseQuantity,
  baseStockToVariantStock,
  normalizeEggVariant,
  eggVariantLabel,
} from "@/constants/productCatalog";

// Base-unit equivalent ng cart item (stock math). Kapag walang variant,
// quantity mismo ang base.
const baseQtyOf = (p: any): number => {
  const v = normalizeEggVariant(p?.eggVariant);
  if (!v) return Number(p?.quantity || 0);
  return eggVariantToBaseQuantity(v, Number(p?.quantity || 0), p?.baseUnit || p?.unit || "");
};

// Max na pwedeng i-plus sa variant terms (converted mula sa base stock).
const maxQtyOf = (p: any, baseStock: number | null): number => {
  if (typeof baseStock !== "number") return Number(p?.quantity || 0);
  const v = normalizeEggVariant(p?.eggVariant);
  if (!v) return Math.floor(baseStock);
  return baseStockToVariantStock(baseStock, p?.baseUnit || p?.unit || "", v);
};

export default function Cart() {
  const router = useRouter();
  const { showToast } = useToast();
  const Alert = useAppAlert();
  const [cartItems, setCartItems] = useState<FarmerCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockMap, setStockMap] = useState<Record<string, number | null>>({});
  const [checkingStock, setCheckingStock] = useState(false);

  const [selectedItems, setSelectedItems] = useState<Set<string>>( new Set() );

  const [buyerId, setBuyerId] = useState("");

  const [removeTarget, setRemoveTarget] = useState<{
    farmerId: string;
    docId: string;
    name: string;
  } | null>(null);

  // ================= LOAD CART =================
  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, [])
  );

  const loadCart = async () => {
    try {
      setLoading(true);

      const userString = await AsyncStorage.getItem("user");

      if (!userString) {
        router.replace("../login");
        return;
      }

      const user = JSON.parse(userString);

      const uid = user.uid || user.userId || user.id;

      setBuyerId(uid);

      const items: CartItem[] = await getCartByBuyer(uid);

      const grouped = groupCartByFarmer(items);

      setCartItems(grouped);

      // ================= STOCK LIMITS =================
      // Kunin ang totoong available stock (buod ng lahat ng sellable batch)
      // para sa bawat natatanging produkto sa cart, para malimitahan ang "+"
      // button - hindi dapat makapag-order ang buyer ng higit sa aktwal na
      // available, kahit ilang beses niya paulit-ulit na pindutin ang "+".
      const uniqueProductIds = Array.from(new Set(items.map((i) => i.productId)));

      const stockEntries = await Promise.all(
        uniqueProductIds.map(async (productId) => {
          try {
            const productBatches = await getBatchesByProduct(productId);
            const available = productBatches
              .filter((b) => b.stock > 0 && b.archived !== true &&
                  b.status === "Available")
              .reduce((sum, b) => sum + b.stock, 0);
            return [productId, available] as const;
          } catch {
            return [productId, null] as const;
          }
        })
      );

      setStockMap(Object.fromEntries(stockEntries));

    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to load cart");
    } finally {
      setLoading(false);
    }

  };

  // ================= SELECT ITEM =================
  const toggleItemSelection = (docId: string) => {
    setSelectedItems((prev) => {
      const copy = new Set(prev);

      copy.has(docId)
        ? copy.delete(docId)
        : copy.add(docId);

      return copy;
    });
  };

  // ================= SELECT FARM =================
  const toggleFarmSelection = (farmerId: string) => {
    const farmProducts =
      cartItems
        .find((f) => f.farmerId === farmerId)
        ?.products.map((p) => p.docId!) || [];

    setSelectedItems((prev) => {
      const copy = new Set(prev);

      const allSelected = farmProducts.every((id) =>
        copy.has(id)
      );

      if (allSelected) {
        farmProducts.forEach((id) => copy.delete(id));
      } else {
        farmProducts.forEach((id) => copy.add(id));
      }

      return copy;
    });
  };

  // ================= UPDATE LOCAL QTY =================
  const updateLocalQty = (
    farmerId: string,
    docId: string,
    qty: number
  ) => {
    setCartItems((prev) =>
      prev.map((f) =>
        f.farmerId === farmerId
          ? {
              ...f,
              products: f.products.map((p) =>
                p.docId === docId
                  ? { ...p, quantity: qty }
                  : p
              ),
            }
          : f
      )
    );
  };

  // ================= INCREMENT =================
  const incrementQty = async (farmerId: string, docId: string) => {
  const product = cartItems
    .find((f) => f.farmerId === farmerId)
    ?.products.find((p) => p.docId === docId);

  if (!product?.docId) return;

  const availableStock = stockMap[product.productId];

  if (typeof availableStock !== "number") {
    showToast("Unable to verify stock. Please refresh the cart and try again.");
    return;
  }

  const maxQty = maxQtyOf(product, availableStock);

  if (product.quantity >= maxQty) {
    const v = normalizeEggVariant((product as any).eggVariant);
    showToast(
      v
        ? `Only ${maxQty}x ${eggVariantLabel(v)} available`
        : `Only ${availableStock} ${product.unit?.replace(/^per\s+/i, "")} available`
    );
    return;
  }

  const newQty = product.quantity + 1;
  const newBase = baseQtyOf({ ...product, quantity: newQty } as any);

  updateLocalQty(farmerId, docId, newQty);

  try {
    await updateCartQuantity(product.docId, newQty, newBase);
  } catch {
    updateLocalQty(farmerId, docId, product.quantity);
    Alert.alert("Error updating quantity");
  }

  
};

  // ================= DECREMENT =================
  // No longer removes the item at qty 1 - stays at 1 minimum.
  // Use the delete button to actually remove an item.
  const decrementQty = async (
    farmerId: string,
    docId: string
  ) => {
    const product = cartItems
      .find((f) => f.farmerId === farmerId)
      ?.products.find((p) => p.docId === docId);

    if (!product?.docId) return;

    if (product.quantity <= 1) return;

    const newQty = product.quantity - 1;
    const newBase = baseQtyOf({ ...product, quantity: newQty } as any);

    updateLocalQty(farmerId, docId, newQty);

    try {
      await updateCartQuantity(product.docId, newQty, newBase);
    } catch {
      updateLocalQty(
        farmerId,
        docId,
        product.quantity
      );

      Alert.alert("Error updating quantity");
    }
  };

  // ================= REMOVE ITEM =================
  const removeItem = async (
    farmerId: string,
    docId: string
  ) => {
    const product = cartItems
      .find((f) => f.farmerId === farmerId)
      ?.products.find((p) => p.docId === docId);

    if (!product?.docId) return;

    const backup = [...cartItems];

    setCartItems((prev) =>
      prev
        .map((f) =>
          f.farmerId === farmerId
            ? {
                ...f,
                products: f.products.filter(
                  (p) => p.docId !== docId
                ),
              }
            : f
        )
        .filter((f) => f.products.length > 0)
    );

    setSelectedItems((prev) => {
      const copy = new Set(prev);

      copy.delete(docId);

      return copy;
    });

    try {
      await removeCartItem(product.docId);
    } catch {
      setCartItems(backup);

      Alert.alert("Error removing item");
    }
  };

  // ================= CONFIRM DELETE =================
  const confirmRemove = (farmerId: string, docId: string, name: string) => {
    setRemoveTarget({ farmerId, docId, name });
  };

  const handleConfirmedRemove = () => {
    if (removeTarget) {
      removeItem(removeTarget.farmerId, removeTarget.docId);
    }
    setRemoveTarget(null);
  };

  // ================= VALIDATE STOCK BEFORE CHECKOUT =================
  const validateSelectedStockBeforeCheckout = async () => {
    const selectedProducts = cartItems.flatMap((farm) =>
      farm.products.filter((p) => selectedItems.has(p.docId!))
    );

    if (selectedProducts.length === 0) {
      showToast("Please select at least one item to checkout");
      return false;
    }

    const requestedMap = new Map<string, { quantity: number; name: string; unit: string }>();

    selectedProducts.forEach((product) => {
      const productId = String(product.productId || "").trim();
      if (!productId) {
        throw new Error(`Product ID is missing for ${product.name || "a selected item"}.`);
      }

      // Stock math ay laging base units (half tray = 0.5 tray).
      const need = baseQtyOf(product as any);
      const baseUnit = (product as any).baseUnit || product.unit || "unit";

      const current = requestedMap.get(productId);
      requestedMap.set(productId, {
        quantity: (current?.quantity || 0) + need,
        name: current?.name || product.name || "Product",
        unit: current?.unit || baseUnit,
      });
    });

    setCheckingStock(true);

    try {
      const checks = await Promise.all(
        Array.from(requestedMap.entries()).map(async ([productId, requested]) => {
          try {
            const batches = await getBatchesByProduct(productId);
            const available = batches
              .filter((b) => Number(b.stock) > 0 && b.archived !== true &&
                  b.status === "Available")
              .reduce((sum, b) => sum + Number(b.stock || 0), 0);

            return { productId, ...requested, available };
          } catch (error) {
            console.log("CHECKOUT STOCK CHECK ERROR:", productId, error);
            return { productId, ...requested, available: null };
          }
        })
      );

      setStockMap((prev) => ({
        ...prev,
        ...Object.fromEntries(
          checks.map((item) => [item.productId, item.available])
        ),
      }));

      const failedVerification = checks.filter(
        (item) => item.available === null
      );

      if (failedVerification.length > 0) {
        Alert.alert(
          "Unable to Verify Stock",
          "FarmGate could not verify the current stock of one or more products. Please refresh the cart and try again."
        );
        return false;
      }

      const shortages = checks.filter(
        (item) => Number(item.quantity) > Number(item.available)
      );

      if (shortages.length > 0) {
        const message = shortages
          .map(
            (item) =>
              `${item.name}: requested ${item.quantity}, available ${item.available} ${String(item.unit).replace(/^per\s+/i, "")}`
          )
          .join("\n");

        Alert.alert(
          "Insufficient Stock",
          `You cannot checkout yet because the selected quantity is higher than the current stock.\
\
${message}`
        );
        return false;
      }

      return true;
    } catch (error: any) {
      console.log("CHECKOUT STOCK VALIDATION ERROR:", error);
      Alert.alert(
        "Unable to Verify Stock",
        error?.message || "FarmGate could not verify the selected products."
      );
      return false;
    } finally {
      setCheckingStock(false);
    }
  };

  // ================= TOTAL PRICE =================
  const totalPrice = cartItems.reduce((acc, farm) => {
    const farmTotal = farm.products.reduce((sum, p) => {
      if (selectedItems.has(p.docId!)) {
        return sum + p.price * p.quantity;
      }

      return sum;
    }, 0);

    return acc + farmTotal;
  }, 0);

  // ================= LOADING UI =================
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator
          size="large"
          color="#14532d"
        />
      </View>
    );
  }

  // ================= EMPTY =================
  if (cartItems.length === 0) {
    return (
      <View className="flex-1" style={{ backgroundColor: "#f5f5f5" }}>
        <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color="white"
            />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg ml-4">
            My Cart
          </Text>
        </View>
        <Text className="text-center mt-10 text-gray-500">
          Your cart is empty
        </Text>
      </View>
    );
  }

  // ================= UI =================
  return (
    <View className="flex-1" style={{ backgroundColor: "#fafafa" }}>

      {/* HEADER */}
      <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color="white"
          />
        </TouchableOpacity>

        <Text className="text-white font-bold text-lg ml-4">
          My Cart
        </Text>
      </View>

      {/* LIST */}
      <FlatList
        data={cartItems}
        keyExtractor={(f) => f.farmerId}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 110,
        }}
        renderItem={({ item: farm }) => (
          <View
            className="rounded-[10px] mb-4 p-4"
            style={{ backgroundColor: "#ffffff" }}
          >

            {/* FARM HEADER */}
            <View className="flex-row items-center mb-2">

              <TouchableOpacity
                onPress={() =>
                  toggleFarmSelection(farm.farmerId)
                }
                className="mr-3"
              >
                <MaterialCommunityIcons
                  name={
                    farm.products.every((p) =>
                      selectedItems.has(p.docId!)
                    )
                      ? "checkbox-marked"
                      : "checkbox-blank-outline"
                  }
                  size={20}
                  color="#14532d"
                />
              </TouchableOpacity>

              <Text className="font-bold text-lg">
                {farm.farmName}
              </Text>
            </View>

            {/* PRODUCTS */}
            {farm.products.map((p, index) => (
              <View
                key={p.docId}
                className={`py-4 ${
                  index < farm.products.length - 1
                    ? "border-b border-gray-200"
                    : ""
                }`}
              >
                <View className="flex-row items-start">

                  {/* SELECT (checkbox) */}
                  <TouchableOpacity
                    onPress={() =>
                      toggleItemSelection(p.docId!)
                    }
                    className="mr-3 mt-1"
                  >
                    <MaterialCommunityIcons
                      name={
                        selectedItems.has(p.docId!)
                          ? "checkbox-marked"
                          : "checkbox-blank-outline"
                      }
                      size={22}
                      color="#14532d"
                    />
                  </TouchableOpacity>

                  {/* TAPPABLE: image + info → product details */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: "/buyer/products/[id]",
                        params: { id: p.productId },
                      })
                    }
                    className="flex-1 flex-row items-start"
                  >
                    {/* IMAGE - fills the whole box */}
                    <View
                      className="rounded-lg overflow-hidden"
                      style={{ width: 80, height: 80 }}
                    >
                      <Image
                        source={{ uri: p.image }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    </View>

                    {/* INFO */}
                    <View className="flex-1 ml-3 justify-center">

                      <Text className="font-bold text-base" numberOfLines={1}>
                        {p.name}
                      </Text>

                      <Text className="text-green-900 font-bold mt-1">
                        ₱{p.price.toFixed(2)}
                      </Text>

                      {(p as any).eggVariant ? (
                        <Text className="text-green-900 text-xs mt-0.5 font-semibold">
                          {eggVariantLabel((p as any).eggVariant)}
                        </Text>
                      ) : null}

                      <Text className="text-gray-500 text-xs mt-0.5">
                        Total: {p.quantity} {p.unit?.replace(/^per\s+/i, "")}
                      </Text>

                    </View>
                  </TouchableOpacity>
                  
                  {/* DELETE - upper right corner */}
                  <TouchableOpacity
                    onPress={() =>
                      confirmRemove(farm.farmerId, p.docId!, p.name)
                    }
                    style={{ position: "absolute", top: 12, right: 0 }}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={18}
                      color="#dc2626"
                    />
                  </TouchableOpacity>

                  {/* QUANTITY - right side, pushed down below the delete button */}
                  <View className="flex-row items-center ml-2" style={{ marginTop: 50 }}>
                    <TouchableOpacity
                      onPress={() => decrementQty(farm.farmerId, p.docId!)}
                      className="w-7 h-7 rounded-[5px] items-center justify-center"
                      style={{ borderWidth: 1, borderColor: "#14532d" }}
                    >
                      <MaterialCommunityIcons name="minus" size={14} color="#14532d" />
                    </TouchableOpacity>

                    <Text className="mx-2 text-sm font-semibold text-gray-800">
                      {p.quantity}
                    </Text>

                    <TouchableOpacity
                      onPress={() => incrementQty(farm.farmerId, p.docId!)}
                      disabled={typeof stockMap[p.productId] !== "number" || p.quantity >= maxQtyOf(p as any, stockMap[p.productId] as number)}
                      className="w-7 h-7 rounded-[5px] items-center justify-center"
                      style={{
                        backgroundColor:
                          typeof stockMap[p.productId] !== "number" || p.quantity >= maxQtyOf(p as any, stockMap[p.productId] as number)
                            ? "#9ca3af"
                            : "#14532d",
                      }}
                    >
                      <MaterialCommunityIcons name="plus" size={14} color="white" />
                    </TouchableOpacity>
                  </View>

                </View>

              </View>
            ))}
          </View>
        )}
      />

      {/* TOTAL */}
      <View className="absolute bottom-[60px] left-0 right-0 bg-white border-t border-gray-200 flex-row items-stretch">
        <View className="flex-1 justify-center px-4 py-5">
          <Text className="text-lg font-bold">
            Total: ₱{totalPrice.toFixed(2)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={async () => {
            if (!buyerId) {
              showToast("Buyer not logged in");
              return;
            }

            const stockIsEnough =
              await validateSelectedStockBeforeCheckout();

            if (!stockIsEnough) {
              return;
            }

            const itemsToCheckout = cartItems
              .map((farm) => ({
                farmerId: farm.farmerId,
                farmName: farm.farmName,
                products: farm.products.filter((p) =>
                  selectedItems.has(p.docId!)
                ),
              }))
              .filter((f) => f.products.length > 0);

            router.push({
              pathname: "/buyer/checkout",
              params: {
                items: JSON.stringify(itemsToCheckout),
                buyerId,
              },
            });
          }}
          disabled={checkingStock}
          className="bg-green-900 px-8 items-center justify-center"
        >
          <Text className="text-white font-bold">
            {checkingStock ? "Checking Stock..." : "Checkout"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* REMOVE ITEM MODAL */}
      {removeTarget && (
        <View className="absolute inset-0 justify-center items-center bg-black/40">
          <View
            className="bg-white rounded-[10px] p-6 w-80"
            style={{ borderWidth: 1, borderColor: "#14532d" }}
          >
            <Text className="text-gray-800 text-lg font-semibold mb-2">
              Remove item
            </Text>
            <Text className="text-gray-500 text-sm mb-4">
              Remove {removeTarget.name} from your cart?
            </Text>

            <View className="flex-row justify-between mt-4">
              <TouchableOpacity
                className="bg-gray-200 px-4 py-2 rounded-[5px] flex-1 mr-2 items-center"
                onPress={() => setRemoveTarget(null)}
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="px-4 py-2 rounded-[5px] flex-1 ml-2 items-center"
                style={{ backgroundColor: "#dc2626" }}
                onPress={handleConfirmedRemove}
              >
                <Text className="text-white font-semibold">Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}