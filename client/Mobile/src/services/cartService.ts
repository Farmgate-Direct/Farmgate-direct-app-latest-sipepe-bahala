import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../../FirebaseConfig";

import { CartItem } from "../types/cart";

const cartCollection = collection(db, "cart");

// ================= ADD TO CART =================
// Kinukuha muna kung may existing item na SAME product AT SAME batch AT
// SAME egg variant (hindi lang productId) - dahil magkaiba ng presyo
// ang bawat batch, at magkaiba rin ang half tray vs full tray ng itlog,
// kaya hindi dapat pagsamahin ang magkaibang variant sa iisang cart
// entry kahit parehong product sila.
export const addToCart = async (item: CartItem) => {
  try {
    const q = query(
      cartCollection,
      where("buyerId", "==", item.buyerId),
      where("productId", "==", item.productId),
      where("batchId", "==", item.batchId)
    );

    const snap = await getDocs(q);

    const variant = (item as any).eggVariant || null;

    const match = snap.docs.find(
      (d) => ((d.data() as any).eggVariant || null) === variant
    );

    if (match) {
      const data = match.data() as any;
      const existingQty = Number(data.quantity) || 1;
      const existingBase = Number(
        data.baseQuantity ?? data.quantity
      );

      const addBase = Number(
        (item as any).baseQuantity ?? item.quantity
      );

      await updateDoc(doc(db, "cart", match.id), {
        quantity: existingQty + item.quantity,
        // Keep base quantity in sync (stock math uses this).
        baseQuantity: existingBase + addBase,
      });

      return;
    }

    await addDoc(cartCollection, item);
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const getCartByBuyer = async (buyerId: string) => {
  try {
    const q = query(cartCollection, where("buyerId", "==", buyerId));
    const snapshot = await getDocs(q);

    const items: any[] = [];
    snapshot.forEach((docSnap) => {
      items.push({
        docId: docSnap.id,
        ...docSnap.data(),
      });
    });

    return items;
  } catch (error) {
    console.log("GET CART ERROR:", error);
    throw error;
  }
};

export const updateCartQuantity = async (
  docId: string,
  quantity: number,
  baseQuantity?: number
) => {
  try {
    const ref = doc(db, "cart", docId);
    await updateDoc(
      ref,
      baseQuantity === undefined ? { quantity } : { quantity, baseQuantity }
    );
  } catch (error) {
    console.log("UPDATE CART ERROR:", error);
    throw error;
  }
};

export const removeCartItem = async (docId: string) => {
  try {
    const ref = doc(db, "cart", docId);
    await deleteDoc(ref);
  } catch (error) {
    console.log("REMOVE CART ERROR:", error);
    throw error;
  }
};

// ================= DELETE BY PRODUCT ID =================
// Ginagamit kapag na-delete ang BUONG master product (lahat ng batch
// nito) - tinatanggal lahat ng cart entries na naka-link dito.
export const deleteCartItemsByProductId = async (productId: string) => {
  try {
    const q = query(cartCollection, where("productId", "==", productId));
    const snapshot = await getDocs(q);

    const deletes = snapshot.docs.map((d) => deleteDoc(doc(db, "cart", d.id)));
    await Promise.all(deletes);
  } catch (error) {
    console.log("DELETE CART BY PRODUCT ERROR:", error);
    throw error;
  }
};

// ================= DELETE BY BATCH ID =================
// Ginagamit kapag na-delete ang ISANG batch lang (hindi buong product) -
// tinatanggal lang ang mga cart entries na naka-link sa batch na yun,
// dahil baka wala nang stock o presyo na iyon.
export const deleteCartItemsByBatchId = async (batchId: string) => {
  try {
    const q = query(cartCollection, where("batchId", "==", batchId));
    const snapshot = await getDocs(q);

    const deletes = snapshot.docs.map((d) => deleteDoc(doc(db, "cart", d.id)));
    await Promise.all(deletes);
  } catch (error) {
    console.log("DELETE CART BY BATCH ERROR:", error);
    throw error;
  }
};