// src/constants/productCatalog.ts
//
// Fixed na listahan ng product names per category. Ginagamit ito sa
// "Add Product" dropdown para hindi na mag-type ang farmer ng pangalan
// (para maiwasan ang duplicate na product dahil lang sa magkaibang
// spelling, letter case, o extra spaces - ex. "Eggplant" vs "eggplant "
// vs "EGGPLANT").
//
// Kung may kulang na product dito, dagdagan na lang ang array ng
// kaukulang category - hindi na kailangang galawin ang ibang parte
// ng app.

export const CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Egg & Poultry",
  "Rice & Grains",
] as const;

export type ProductCategoryKey = (typeof CATEGORIES)[number];

export const PRODUCT_CATALOG: Record<ProductCategoryKey, string[]> = {
  Vegetables: [
    "Eggplant (Talong)",
    "Tomato (Kamatis)",
    "Okra",
    "Ampalaya (Bitter Gourd)",
    "Pole Sitaw (String Beans)",
    "Bush Sitaw",
    "Baguio Beans (Habichuelas)",
    "Kalabasa (Squash)",
    "Repolyo (Cabbage)",
    "Pechay Baguio",
    "Native Pechay (Tagalog)",
    "Sibuyas (Onion)",
    "Bawang (Garlic)",
    "Luya (Ginger)",
    "Patatas (Potato)",
    "Carrots",
    "Labanos (Radish)",
    "Kangkong",
    "Malunggay",
    "Sayote",
    "Upo (Bottle Gourd)",
    "Patola (Sponge Gourd)",
    "Sili (Chili Pepper)",
  ],
  Fruits: [
    "Banana Lakatan",
    "Banana Latundan",
    "Banana Saba",
    "Mango Carabao",
    "Mango Pico",
    "Mango Indian",
    "Mango Apple",
    "Mango Paho",
    "Papaya",
    "Pomelo",
    "Melon",
    "Pineapple (Pinya)",
    "Watermelon (Pakwan)",
    "Calamansi",
    "Guava (Bayabas)",
    "Rambutan",
    "Lanzones",
    "Durian",
    "Avocado",
    "Dalandan",
    "Jackfruit (Langka)",
    "Star Apple (Kaimito)",
    "Santol",
  ],
  "Egg & Poultry": [
    "Chicken Egg White Pewee (Itlog ng Manok)",
    "Chicken Egg White Extra Small (Itlog ng Manok)",
    "Chicken Egg White Small (Itlog ng Manok)",
    "Chicken Egg White Medium (Itlog ng Manok)",
    "Chicken Egg White Large (Itlog ng Manok)",
    "Chicken Egg White Extra Large (Itlog ng Manok)",
    "Chicken Egg White Jumbo (Itlog ng Manok)",
    "Chicken Egg Brown Medium (Itlog ng Manok)",
    "Chicken Egg Brown Large (Itlog ng Manok)",
    "Chicken Egg Brown Extra Large (Itlog ng Manok)",
    "Duck Egg Small (Itlog ng Pato)",
    "Duck Egg Medium (Itlog ng Pato)",
    "Duck Egg Large (Itlog ng Pato)",
    "Duck Egg Extra Large (Itlog ng Pato)",
    "Duck Egg Jumbo (Itlog ng Pato)",
    "Itik Egg Small (Itlog ng Itik)",
    "Itik Egg Medium (Itlog ng Itik)",
    "Itik Egg Large (Itlog ng Itik)",
    "Itik Egg Extra Large (Itlog ng Itik)",
    "Itik Egg Jumbo (Itlog ng Itik)",
    "Quail Egg (Itlog ng Pugo)",
    "Native Chicken (Manok)",
    "Broiler Chicken",
  ],
  "Rice & Grains": [
    "White Rice (Bigas)",
    "Brown Rice",
    "Red Rice",
    "Glutinous Rice (Malagkit)",
    "White Corn",
    "Yellow Corn (Sweet Corn)",
    "White Corn Grits",
    "Yellow Corn Grits",
  ],
};

// Ginagamit para siguraduhing pareho ang product kahit magkaiba ng
// spacing/letter case ang naka-store na "name" (safety net lang,
// dahil galing na sa fixed dropdown ang value).
export const normalizeProductName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

// ============================================================
// CANONICAL KEY (para sa DA price lookup)
// ============================================================
//
// "Eggplant (Talong)" -> "eggplant"
// "Chicken Egg (Itlog ng Manok)" -> "chicken egg"
// "White Rice (Bigas)" -> "white rice"
//
// Tinatanggal ang parenthetical (Tagalog name) para mag-match
// sa DA reference table keys.

export const toCanonicalKey = (name: string): string | null => {
  if (!name) return null;

  const base = name.split("(")[0].trim().toLowerCase().replace(/\s+/g, " ");

  return base || null;
};

// ============================================================
// UNITS
// ============================================================
//
// - Default: "per kg" lang (tinanggal na ang "per pcs").
// - Egg & Poultry category: "half tray" at "per tray" lang
//   (tinanggal na ang "per kg" sa egg at poultry).

const EGG_PRODUCT_PREFIXES = ["chicken egg", "duck egg", "quail egg", "itik egg"];

export const isEggProduct = (productName: string): boolean => {
  const key = toCanonicalKey(productName);
  if (key === null) return false;
  // Prefix-match para kasama ang per-size entries
  // (ex. "chicken egg white large"). Hindi nito nadadamay ang
  // "duck" (Itik) dahil buong "duck egg " ang hinahanap.
  return EGG_PRODUCT_PREFIXES.some(
    (prefix) => key === prefix || key.startsWith(prefix + " ")
  );
};

export const getUnitsForProduct = (
  category: ProductCategoryKey,
  _productName?: string
): string[] => {
  // Egg & Poultry — fixed na "per tray" ang basehan ng farmer sa
  // bagong listing (si buyer na ang pipili ng half o full tray,
  // kaya hindi na kailangang mamili pa si farmer). Nasa unahan ang
  // "per tray" dahil ito ang default ([0]) sa Add Harvest.
  if (category === "Egg & Poultry") {
    return ["per tray", "half tray"];
  }

  return ["per kg"];
};

// ============================================================
// EGG VARIANTS (half tray / full tray)
// ============================================================
//
// Ang farmer ay naglilista gamit ang ISA lang na unit (half tray O
// per tray). Sa buyer side, laging may pagpipilian na BOTH:
//   - Half Tray = 15 pcs
//   - Full Tray (per tray) = 30 pcs
//
// Ang presyo ay auto-compute mula sa base price ng farmer:
//   - base "per tray" P300 -> half P150, full P300
//   - base "half tray" P150 -> half P150, full P300
//
// Ang stock deduction ay laging naka-convert sa BASE unit
// (half = 0.5 tray, full = 2 half-trays) para hindi masira ang
// inventory kahit magkahalo ang binili ng buyer.

export type EggVariant = "half" | "full";

export const EGG_HALF_PCS = 15;
export const EGG_FULL_PCS = 30;

export const HALF_TRAY_UNIT = "half tray";
export const FULL_TRAY_UNIT = "per tray";

const roundMoney2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const roundStock6 = (value: number): number =>
  Number(Number(value).toFixed(6));

const normalizeUnit = (unit: string): string =>
  String(unit || "").trim().toLowerCase().replace(/\s+/g, " ");

export const isHalfTrayUnit = (unit: string): boolean =>
  normalizeUnit(unit) === "half tray";

export const isFullTrayUnit = (unit: string): boolean => {
  const u = normalizeUnit(unit);
  return u === "per tray" || u === "tray" || u === "full tray";
};

export const isTrayUnit = (unit: string): boolean =>
  isHalfTrayUnit(unit) || isFullTrayUnit(unit);

export const normalizeEggVariant = (value: unknown): EggVariant | null => {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "half" || v === "half tray" || v === "half-tray") return "half";
  if (
    v === "full" ||
    v === "per tray" ||
    v === "full tray" ||
    v === "tray"
  )
    return "full";
  return null;
};

export type EggVariantOption = {
  variant: EggVariant;
  unit: string;
  price: number;
  pcs: number;
  label: string;
};

export const getEggVariantOptions = (
  baseUnit: string,
  basePrice: number
): EggVariantOption[] => {
  if (!isTrayUnit(baseUnit)) return [];
  if (!Number.isFinite(basePrice) || basePrice < 0) return [];

  const halfBase = isHalfTrayUnit(baseUnit);

  return [
    {
      variant: "half",
      unit: HALF_TRAY_UNIT,
      price: halfBase ? roundMoney2(basePrice) : roundMoney2(basePrice / 2),
      pcs: EGG_HALF_PCS,
      label: "Half Tray (15 pcs)",
    },
    {
      variant: "full",
      unit: FULL_TRAY_UNIT,
      price: halfBase ? roundMoney2(basePrice * 2) : roundMoney2(basePrice),
      pcs: EGG_FULL_PCS,
      label: "Full Tray (30 pcs)",
    },
  ];
};

// Variant quantity -> base-unit quantity (para sa stock deduction).
// Ex. base "per tray", bumili ng 2 half -> 1. Base "half tray",
// bumili ng 1 full -> 2.
export const eggVariantToBaseQuantity = (
  variant: EggVariant | string | null | undefined,
  variantQty: number,
  baseUnit: string
): number => {
  const v = normalizeEggVariant(variant);
  const qty = Number(variantQty);
  if (!v || !Number.isFinite(qty)) return Number(variantQty) || 0;
  if (v === "half" && isFullTrayUnit(baseUnit)) return roundStock6(qty / 2);
  if (v === "full" && isHalfTrayUnit(baseUnit)) return roundStock6(qty * 2);
  return qty;
};

// Base stock -> mabibiling dami sa napiling variant (para sa limit
// ng quantity stepper). Ex. 10 trays -> 20 half trays. 9 half trays
// -> 4 full trays (floor, hindi pwedeng magbenta ng kulang na tray).
export const baseStockToVariantStock = (
  baseStock: number,
  baseUnit: string,
  variant: EggVariant | string | null | undefined
): number => {
  const v = normalizeEggVariant(variant);
  const stock = Number(baseStock);
  if (!Number.isFinite(stock) || stock <= 0) return 0;
  if (!v) return stock;
  if (v === "half" && isFullTrayUnit(baseUnit)) return Math.floor(stock * 2);
  if (v === "full" && isHalfTrayUnit(baseUnit))
    return Math.floor(stock / 2);
  return Math.floor(stock);
};

// Buyer-facing stock text sa trays, kasama ang half handling.
// Ex. 20 -> "20 trays left"; 18.5 -> "18 and a half trays left";
// 0.5 -> "Half tray left"; half-base 50 -> "50 half trays left".
export const formatTrayStock = (
  baseStock: number,
  baseUnit: string
): string => {
  const stock = Number(baseStock);
  if (!Number.isFinite(stock) || stock <= 0) return "Out of stock";

  if (isHalfTrayUnit(baseUnit)) {
    const n = Math.floor(stock);
    return n === 1 ? "1 half tray left" : `${n} half trays left`;
  }

  if (isFullTrayUnit(baseUnit)) {
    const full = Math.floor(stock);
    const hasHalf = stock - full >= 0.5;
    if (full === 0 && hasHalf) return "Half tray left";
    if (full === 1 && !hasHalf) return "1 tray left";
    if (!hasHalf) return `${full} trays left`;
    return `${full} and a half trays left`;
  }

  return `${stock} ${String(baseUnit || "").trim()} left`;
};

export const eggVariantLabel = (
  variant: EggVariant | string | null | undefined
): string => {
  const v = normalizeEggVariant(variant);
  if (v === "half") return "Half Tray (15 pcs)";
  if (v === "full") return "Full Tray (30 pcs)";
  return "";
};

// Base stock -> kabuuang piraso ng itlog (iisang numero lang para hindi
// malito ang buyer — hindi na half-count at full-count na magkaiba).
// Ex. 50 half trays = 750 pcs; 25 full trays = 750 pcs.
export const baseStockToPcs = (
  baseStock: number,
  baseUnit: string
): number => {
  const stock = Number(baseStock);
  if (!Number.isFinite(stock) || stock <= 0) return 0;
  if (isHalfTrayUnit(baseUnit)) return Math.floor(stock * EGG_HALF_PCS);
  if (isFullTrayUnit(baseUnit)) return Math.floor(stock * EGG_FULL_PCS);
  return Math.floor(stock);
};