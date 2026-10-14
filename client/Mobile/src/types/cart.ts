/*export type CartItem = {
  id: string;
  productId: string;

  buyerId: string;
  buyerName: string;

  farmerId?: string;
  farmName?: string;

  name: string;
  image: string;

  price: number;
  quantity: number;

  createdAt: number;
};*/
export type EggVariant = "half" | "full";

export type CartItem = {
  docId?: string;
  productId: string;
  batchId: string;
  batchNumber: number;
  buyerId: string;
  buyerName: string;
  farmerId?: string;
  farmName?: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  unit: string;
  // Egg half/full tray variant (buyer's choice). quantity/unit/price
  // are stored in VARIANT terms (what the buyer sees); baseUnit /
  // baseQuantity carry the farmer-listing terms for stock math.
  eggVariant?: EggVariant | null;
  baseUnit?: string;
  baseQuantity?: number;
  createdAt: number;
};