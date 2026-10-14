// farmer/products/add-product.tsx
import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { CreateProductInput, ProductType, BatchType } from "../../../src/types/product";
import {
  getFarmerProductNames,
  getActiveBatchForHarvest,
} from "../../../src/services/productService";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../FirebaseConfig";
import {
  getProductVideoValidationError,
  MAX_PRODUCT_IMAGES,
} from "../../../constants/productMedia";
import {
  CATEGORIES,
  PRODUCT_CATALOG,
  ProductCategoryKey,
  normalizeProductName,
  toCanonicalKey,
  getUnitsForProduct,
  isEggProduct,
  isHalfTrayUnit,
  isFullTrayUnit,
  EGG_HALF_PCS,
  EGG_FULL_PCS,
} from "../../../constants/productCatalog";

// DA reference na naka-sync mula sa Firestore (scripts-automation/da-sync
// via GitHub workflow -> collection "da_price_reference"). Walang hardcoded
// table dito — kung walang doc para sa product, walang reference na ipapakita.
type DaPriceReference = {
  price: number;
  unit: string;
  source?: string;
  sourceUrl?: string;
  lastUpdated?: any;
};

// canonicalKey ("white rice") -> Firestore docId ("white-rice").
// Kailangang hyphenated dahil ganoon ang isinusulat ng da-sync normalize.
// Special-case: "duck" (Duck/Itik) ay "itik" sa Firestore productMap.
const canonicalToDocId = (canonicalKey: string): string => {
  const key = canonicalKey.trim().toLowerCase();
  if (key === "duck") return "itik";
  return key.replace(/\s+/g, "-");
};

// Half-tray / tray adjustment para sa egg products kapag ang DA doc
// ay naka "tray" o "pc" (standard tray = 30 pcs, half tray = 15 pcs).
const adjustDaPriceForUnit = (
  canonicalKey: string,
  farmerUnit: string,
  daPrice: DaPriceReference | null
): DaPriceReference | null => {
  if (!daPrice) return daPrice;
  const key = canonicalKey.trim().toLowerCase();
  const fUnit = (farmerUnit || "").trim().toLowerCase();
  const dUnit = (daPrice.unit || "").trim().toLowerCase();
  const eggKeys = new Set(["chicken egg", "chicken-egg", "duck egg", "duck-egg", "quail egg", "quail-egg"]);

  if (fUnit === "half tray" && dUnit === "tray" && eggKeys.has(key)) {
    return { ...daPrice, price: Math.round(daPrice.price / 2), unit: "half tray" };
  }
  if (dUnit === "pc" && eggKeys.has(key)) {
    if (fUnit === "per tray" || fUnit === "tray") {
      return { ...daPrice, price: Math.round(daPrice.price * 30), unit: "per tray" };
    }
    if (fUnit === "half tray") {
      return { ...daPrice, price: Math.round(daPrice.price * 15), unit: "half tray" };
    }
  }
  return daPrice;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (
    input: CreateProductInput,
    quantity: number,
    price: number,
    forceNewBatch: boolean
  ) => Promise<void>;
  loading: boolean;
  farmerId: string;
  farmerName: string;
  farmName: string;
};

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// ================= DROPDOWN =================
const Dropdown = ({ label, value, options, onSelect, placeholder }: DropdownProps) => {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-4">
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        disabled={options.length === 0}
        className={`flex-row items-center justify-between rounded-[10px] border border-gray-300 px-4 py-3 ${
          options.length === 0 ? "bg-gray-200" : "bg-gray-100"
        }`}
      >
        <Text className={value ? "text-black" : "text-gray-400"}>
          {value || placeholder || `Select ${label.toLowerCase()}`}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} />
      </TouchableOpacity>

      {open && (
        <View className="mt-1 max-h-56 overflow-hidden rounded-[10px] border border-gray-300 bg-white">
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => {
                  onSelect(opt);
                  setOpen(false);
                }}
                className={`px-4 py-3 ${opt === value ? "bg-[#14532d]" : "bg-white"}`}
              >
                <Text className={opt === value ? "text-white" : "text-black"}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// ================= ADD HARVEST =================
// Bawat "Save" dito ay isang HARVEST EVENT, hindi bagong product listing.
//
// Kapag may EXISTING na batch (currentBatch) para sa napiling product,
// OPTIONAL na ngayon (farmer's choice) kung:
//   - "Idagdag sa Batch N" (default) - dagdag lang ng stock sa
//     kasalukuyang batch, WALANG epekto sa availability.
//   - "Gumawa ng Bagong Batch" - awtomatikong magiging "Out of Stock"
//     ang DATING batch (kahit may natitira pa itong stock), at ang
//     BAGONG batch na lang ang lalabas/mabibili sa buyer side.
// Walang automatic na "lumagpas na sa isang linggo" na trigger - laging
// nasa farmer ang desisyon.
const AddProductModal = ({
  visible,
  onClose,
  onSave,
  loading,
  farmerId,
  farmerName,
  farmName,
}: Props) => {
  const [existingProducts, setExistingProducts] = useState<ProductType[]>([]);
  const [category, setCategory] = useState<ProductCategoryKey>("Vegetables");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("per kg");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [video, setVideo] = useState("");
  const previewPlayer = useVideoPlayer(video || null, (player) => {
    player.loop = false;
  });
  const { isPlaying: isPreviewPlaying } = useEvent(
    previewPlayer,
    "playingChange",
    { isPlaying: previewPlayer.playing }
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentBatch, setCurrentBatch] = useState<BatchType | null>(null);
  const [forceNewBatch, setForceNewBatch] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState<ProductType | null>(null);
  // May value LANG ito kapag ang napiling pangalan+category ay tumutugma
  // sa isang NAKA-ARCHIVE nang product ng farmer na ito. Kapag meron,
  // dapat hindi makapag-save ang farmer - kailangan muna nilang
  // i-unarchive ang lumang listing bago sila makapag-dagdag ng bagong
  // harvest, para hindi magkaroon ng duplicate na listing.
  const [archivedDuplicate, setArchivedDuplicate] = useState<ProductType | null>(null);

  // DA suggested market price (reference lang — farmer pa rin masusunod).
  const [daPrice, setDaPrice] = useState<DaPriceReference | null>(null);
  const [daPriceRaw, setDaPriceRaw] = useState<DaPriceReference | null>(null);
  const [daLoading, setDaLoading] = useState(false);
  // Egg calculator input (presyo bawat itlog) — sariling input ng farmer,
  // hiwalay sa PRICE field, para kahit walang DA reference ay may gabay.
  const [eggCalcPc, setEggCalcPc] = useState("");

  useEffect(() => {
    if (visible) {
      // includeArchived = true, para ma-detect natin kung may
      // naka-archive nang kaparehong product bago payagang mag-save.
      getFarmerProductNames(farmerId, true).then(setExistingProducts);
    }
  }, [visible, farmerId]);

  useEffect(() => {
    if (!PRODUCT_CATALOG[category]?.includes(name)) {
      setName("");
      setPrice("");
      setDaPrice(null);
      setDaPriceRaw(null);
      setEggCalcPc("");
      // Reset unit sa default ng bagong category (per kg,
      // o per tray kapag Egg & Poultry — fixed, hindi pinapapili).
      setUnit(getUnitsForProduct(category)[0] ?? "per kg");
    }
  }, [category]);

  // Kapag napili ang isang existing na product, i-lock ang
  // unit/description/image (galing sa master doc), at i-prefill ang
  // price mula sa current batch nito. Kung ang natugma ay isang
  // NAKA-ARCHIVE na product, ihinto agad dito - blocking notice sa halip.
  useEffect(() => {
    const check = async () => {
      if (!name) {
        setNotice("");
        setCurrentBatch(null);
        setMatchedProduct(null);
        setArchivedDuplicate(null);
        setForceNewBatch(false);
        // Walang pangalan — i-default ang unit sa category default
        // para hindi ma-stuck sa lumang egg unit.
        setUnit((prev) => {
          const def = getUnitsForProduct(category)[0] ?? "per kg";
          const allowed = getUnitsForProduct(category);
          return allowed.includes(prev) ? prev : def;
        });
        return;
      }
      const target = normalizeProductName(name);
      const match = existingProducts.find(
        (p) => normalizeProductName(p.name) === target && p.category === category
      );

      if (match?.archived) {
        setArchivedDuplicate(match);
        setMatchedProduct(null);
        setCurrentBatch(null);
        setNotice("");
        return;
      }

      setArchivedDuplicate(null);
      setForceNewBatch(false);

      if (match) {
        setMatchedProduct(match);
        setUnit(match.unit);
        setDescription(match.description);
        setImages(
          match.images?.length
            ? match.images
            : !match.video && match.image
              ? [match.image]
              : []
        );
        setVideo(match.video || "");

        // Pinakabagong batch, kahit anong petsa/linggo - dito nagmumula
        // ang choice (idagdag dito vs gumawa ng bago).
        const batch = await getActiveBatchForHarvest(match.docId);
        setCurrentBatch(batch);

        if (batch) {
          setPrice(batch.price.toString());
          const batchDate = (batch as any).weekStart ?? batch.createdAt;
          setNotice(
            `Batch ${String(batch.batchNumber).padStart(3, "0")} (${formatDate(batchDate)}) - ${batch.stock} ${match.unit} available, status: ${batch.status}. Piliin sa ibaba kung idadagdag dito o gagawa ng bagong batch.`
          );
        } else {
          setNotice("Unang harvest para sa produktong ito - gagawa ng unang batch.");
        }
      } else {
        setMatchedProduct(null);
        setNotice("");
        setCurrentBatch(null);
        // Bagong product - i-reset ang mga field para malinis magsimula.
        // Unit ay fixed: Egg & Poultry -> per tray (buyer na ang pipili
        // ng half/full), iba pa -> per kg.
        setUnit(getUnitsForProduct(category, name)[0] ?? "per kg");
        setDescription("");
        setImages([]);
        setVideo("");
        setPrice("");
      }
    };
    check();
  }, [name, category, existingProducts]);

  // ================= DA PRICE LOOKUP (Firestore) =================
  // Galing sa "da_price_reference" collection na sinusulat ng
  // scripts-automation/da-sync (GitHub workflow). Reference lang —
  // hindi nito bina-block ang pag-save. Kapag walang doc (ex. hindi pa
  // na-sync ng automation), walang reference na ipapakita.
  useEffect(() => {
    if (!name) {
      setDaPrice(null);
      setDaPriceRaw(null);
      setDaLoading(false);
      return;
    }

    const canonicalKey = toCanonicalKey(name);
    if (!canonicalKey) {
      setDaPrice(null);
      setDaPriceRaw(null);
      setDaLoading(false);
      return;
    }

    let cancelled = false;

    const loadDaPrice = async () => {
      try {
        setDaLoading(true);
        setDaPrice(null);
        setDaPriceRaw(null);

        const docId = canonicalToDocId(canonicalKey);
        const snap = await getDoc(doc(db, "da_price_reference", docId));

        if (cancelled) return;

        if (!snap.exists()) {
          setDaPrice(null);
          setDaPriceRaw(null);
          return;
        }

        const data = snap.data() as {
          price?: number;
          unit?: string;
          source?: string;
          sourceUrl?: string;
          lastUpdated?: any;
        };

        const rawPrice = Number(data.price);
        if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
          setDaPrice(null);
          setDaPriceRaw(null);
          return;
        }

        const fetched: DaPriceReference = {
          price: rawPrice,
          unit: (data.unit || "kg").trim() || "kg",
          source: data.source,
          sourceUrl: data.sourceUrl,
          lastUpdated: data.lastUpdated,
        };

        // I-adjust para sa half tray / tray (egg) kung kailangan.
        // Ang HILAW na fetched price ay tinatabi rin (daPriceRaw)
        // para sa half/full tray suggestion sa ibaba.
        setDaPriceRaw(fetched);
        setDaPrice(adjustDaPriceForUnit(canonicalKey, unit, fetched));
      } catch (err) {
        console.error("[DA PRICE] Failed to get DA reference from Firestore:", err);
        if (!cancelled) setDaPrice(null);
        if (!cancelled) setDaPriceRaw(null);
      } finally {
        if (!cancelled) setDaLoading(false);
      }
    };

    loadDaPrice();

    return () => {
      cancelled = true;
    };
  }, [name, unit]);

  const productNameOptions = PRODUCT_CATALOG[category] || [];
  const unitOptions = getUnitsForProduct(category, name || undefined);
  const isExistingProduct = matchedProduct !== null;
  // May choice lang kapag may existing na batch talaga - kung unang
  // harvest pa lang (walang batch), awtomatiko na lang, walang choice.
  const showBatchChoice = currentBatch !== null;

  // DA comparison — warning lang kapag mas mataas ang presyo ng farmer.
  const numericPrice = Number(price);
  const priceExceedsDaSuggestion =
    daPrice !== null &&
    Number.isFinite(numericPrice) &&
    numericPrice > 0 &&
    numericPrice > daPrice.price;

  // Egg tray suggestion — kapag per-pc ang DA unit (itlog),
  // kwentahin ang half tray (15 eggs) at full tray (30 eggs)
  // mula sa HILAW na DA price (bago i-adjust sa napiling unit).
  const eggTraySuggestion =
    daPriceRaw !== null &&
    daPriceRaw.unit.trim().toLowerCase() === "pc" &&
    isEggProduct(name)
      ? {
          perPc: daPriceRaw.price,
          halfTray: Math.round(daPriceRaw.price * 15),
          fullTray: Math.round(daPriceRaw.price * 30),
        }
      : null;

  // Farmer's own egg computation — kahit WALANG DA reference, may
  // kwenta pa ring makikita ang farmer batay sa tinayp niyang presyo,
  // para hindi siya malito (half tray = 15 eggs, full tray = 30 eggs).
  const formatEggPeso = (v: number) =>
    Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);

  const eggFarmerHelper =
    isEggProduct(name) && Number.isFinite(numericPrice) && numericPrice > 0
      ? unit.trim().toLowerCase() === "per tray"
        ? {
            perPc: numericPrice / 30,
            halfTray: numericPrice / 2,
            fullTray: numericPrice,
          }
        : unit.trim().toLowerCase() === "half tray"
          ? {
              perPc: numericPrice / 15,
              halfTray: numericPrice,
              fullTray: numericPrice * 2,
            }
          : null
      : null;

  // Interactive egg calculator — laging available kapag itlog ang
  // produkto, may DA man o wala. Mag-type lang ng presyo bawat itlog
  // at auto-compute ang half tray (15 eggs) at full tray (30 eggs).
  const eggCalcPcValue = Number(eggCalcPc);
  const eggCalcResult =
    isEggProduct(name) &&
    eggCalcPc !== "" &&
    Number.isFinite(eggCalcPcValue) &&
    eggCalcPcValue > 0
      ? {
          halfTray: Math.round(eggCalcPcValue * 15),
          fullTray: Math.round(eggCalcPcValue * 30),
        }
      : null;

  // Ilipat ang calculator result sa PRICE (per tray fixed na ang UNIT
  // sa Egg & Poultry, kaya full-tray presyo lang ang sine-set).
  const applyEggCalc = () => {
    if (!eggCalcResult || isExistingProduct) return;
    setPrice(String(eggCalcResult.fullTray));
    setUnit("per tray");
  };

  const isFormValid =
    !archivedDuplicate &&
    name.trim() !== "" &&
    category.trim() !== "" &&
    price !== "" &&
    quantity !== "" &&
    unit.trim() !== "" &&
    description.trim() !== "" &&
    (images.length > 0 || video !== "");

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PRODUCT_IMAGES - images.length,
    });
    if (!result.canceled && result.assets?.length) {
      setError("");
      setImages((current) =>
        [...current, ...result.assets.map((asset) => asset.uri).filter(Boolean)]
          .slice(0, MAX_PRODUCT_IMAGES)
      );
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 20,
      quality: 0.5,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const validationError = getProductVideoValidationError(asset);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setVideo(asset.uri);
  };

  const handlePriceChange = (text: string) => {
    if (/^\d*$/.test(text)) setPrice(text);
  };

  const handleQuantityChange = (text: string) => {
    if (/^\d*$/.test(text)) setQuantity(text);
  };

  const resetForm = () => {
    setCategory("Vegetables");
    setName("");
    setPrice("");
    setUnit("per kg");
    setQuantity("");
    setDescription("");
    setImages([]);
    setVideo("");
    setNotice("");
    setCurrentBatch(null);
    setMatchedProduct(null);
    setArchivedDuplicate(null);
    setForceNewBatch(false);
    setDaPrice(null);
    setDaPriceRaw(null);
    setDaLoading(false);
    setEggCalcPc("");
  };

  const handleSave = async () => {
    if (archivedDuplicate) {
      setError(
        `May naka-archive ka nang "${archivedDuplicate.name}". I-unarchive muna ito bago magdagdag ng bagong harvest.`
      );
      return;
    }
    if (!isFormValid) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");

    const input: CreateProductInput = {
      name,
      category,
      unit,
      description,
      image: images[0] || "",
      imagePublicId: "",
      images,
      video,
      farmerId,
      farmerName,
      farmName,
      rating: 0,
      totalReviews: 0,
      totalSales: 0,
      weeklySales: 0,
      monthlySales: 0,
      createdAt: Date.now(),
      price: 0,
      stock: 0,
      status: "Available",
      archived: false,
    };

    try {
      await onSave(input, Number(quantity), Number(price), forceNewBatch);
      resetForm();
      onClose();
    } catch (err: any) {
      setError(err?.message || "May error na naganap. Subukan muli.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 justify-center bg-black/40 px-6">
        <View className="max-h-[90%] rounded-[10px] bg-white p-5">
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text className="text-lg font-bold mb-4">Add Harvest</Text>

            {error ? <Text className="text-red-500 mb-3">{error}</Text> : null}

            {/* ARCHIVED DUPLICATE - blocking warning */}
            {archivedDuplicate ? (
              <View className="mb-4 rounded-[10px] border border-orange-300 bg-orange-50 px-4 py-3">
                <Text className="text-orange-700 text-xs font-semibold mb-1">
                  May naka-archive ka nang produktong ito
                </Text>
                <Text className="text-orange-700 text-xs">
                  Naka-archive na si &quot;{archivedDuplicate.name}&quot; ({archivedDuplicate.category}).
                  Pumunta sa &quot;Archived&quot; tab sa listing at i-unarchive muna ito bago ka
                  makapag-dagdag ng bagong harvest.
                </Text>
              </View>
            ) : notice ? (
              <View className="mb-4 rounded-[10px] border border-green-200 bg-green-50 px-4 py-3">
                <Text className="text-green-700 text-xs">{notice}</Text>
              </View>
            ) : null}

            {/* CATEGORY */}
            <Dropdown
              label="CATEGORY"
              value={category}
              options={[...CATEGORIES]}
              onSelect={(v) => setCategory(v as ProductCategoryKey)}
            />

            {/* PRODUCT NAME */}
            <Dropdown
              label="PRODUCT NAME"
              value={name}
              options={productNameOptions}
              onSelect={setName}
              placeholder="Select product"
            />

            {/* BATCH CHOICE - lumalabas lang kapag may existing batch na
                talaga. Walang automatic na week-based na pagpili - laging
                nasa farmer ang desisyon. */}
            {showBatchChoice && currentBatch && (
              <View className="mb-4">
                <Text className="text-xs text-gray-500 mb-2">
                  ANO ANG GAGAWIN SA BAGONG ANI?
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setForceNewBatch(false)}
                    className={`flex-1 rounded-[10px] border px-3 py-3 ${
                      !forceNewBatch
                        ? "bg-[#14532d] border-[#14532d]"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold text-center ${
                        !forceNewBatch ? "text-white" : "text-gray-700"
                      }`}
                    >
                      Idagdag sa Batch {String(currentBatch.batchNumber).padStart(3, "0")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setForceNewBatch(true)}
                    className={`flex-1 rounded-[10px] border px-3 py-3 ${
                      forceNewBatch
                        ? "bg-[#14532d] border-[#14532d]"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold text-center ${
                        forceNewBatch ? "text-white" : "text-gray-700"
                      }`}
                    >
                      Gumawa ng Bagong Batch
                    </Text>
                  </TouchableOpacity>
                </View>
                {forceNewBatch && (
                  <Text className="text-orange-600 text-[10px] mt-2">
                    Magiging &quot;Out of Stock&quot; ang Batch{" "}
                    {String(currentBatch.batchNumber).padStart(3, "0")} (kahit may natitira pang
                    stock) - ang bagong batch na lang ang makikita/mabibili ng buyer.
                  </Text>
                )}
              </View>
            )}

            {/* UNIT - laging naka-lock, hindi na pinapapili si farmer.
                Egg & Poultry (bagong produkto): fixed sa "per tray" —
                si buyer na ang pipili ng half tray (15 pcs) o full tray
                (30 pcs). Existing na produkto: unit ng master listing. */}
            {isExistingProduct || category === "Egg & Poultry" ? (
              <View className="mb-4">
                <Text className="text-xs text-gray-500 mb-1">UNIT</Text>
                <View className="rounded-[10px] border border-gray-200 bg-gray-100 px-4 py-3">
                  <Text className="text-gray-500">{unit}</Text>
                </View>
                {category === "Egg & Poultry" && !isExistingProduct && (
                  <Text className="text-gray-400 text-[10px] mt-1">
                    Ilista mo ang presyo at bilang kada full tray (30 pcs).
                    Si buyer na ang pipili sa shop kung half tray (15 pcs)
                    o full tray — automatic ang presyo (half = kalahati).
                  </Text>
                )}
              </View>
            ) : (
              <Dropdown
                label="UNIT"
                value={unit}
                options={unitOptions}
                onSelect={setUnit}
              />
            )}

            {/* PRICE - laging editable, laging may unit para malinaw
                kung kada ano ang presyo (kada full tray, kilo, atbp.) */}
            <Text className="text-xs text-gray-500 mb-1">
              PRICE (₱ per {unit.replace(/^per\s+/i, "")})
            </Text>
            <TextInput
              value={price}
              onChangeText={handlePriceChange}
              keyboardType="numeric"
              placeholder="Enter price"
              className="mb-2 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
            />

            {/* KWENTA SA ITLOG - laging nakikita kapag itlog ang produkto
                at may tinayp na presyo, may DA man o wala. */}
            {eggFarmerHelper && (
              <View className="mb-2 rounded-[10px] border border-green-200 bg-green-50 px-4 py-3">
                <Text className="text-green-800 text-xs font-semibold mb-1">
                  Kwenta sa presyo mo (₱{Number(price).toLocaleString()} per {unit.replace(/^per\s+/i, "")}):
                </Text>
                <Text className="text-green-800 text-xs">
                  • Bawat itlog: ₱{formatEggPeso(eggFarmerHelper.perPc)}{"\n"}• Half tray (15 eggs): ₱{formatEggPeso(eggFarmerHelper.halfTray)}{"\n"}• Full tray (30 eggs): ₱{formatEggPeso(eggFarmerHelper.fullTray)}
                </Text>
              </View>
            )}

            {/* EGG CALCULATOR - laging nakikita kapag itlog ang produkto,
                kahit walang DA reference at kahit walang pang PRICE.
                Tulong sa farmer sa pag-compute ng half/full tray. */}
            {isEggProduct(name) && (
              <View className="mb-2 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3">
                <Text className="text-amber-800 text-xs font-semibold mb-1">
                  Egg calculator (tulong sa pag-compute)
                </Text>
                <Text className="text-xs text-gray-500 mb-1">
                  PRESYO BAWAT ITLOG (₱)
                </Text>
                <TextInput
                  value={eggCalcPc}
                  onChangeText={(text) => {
                    if (/^\d*\.?\d*$/.test(text)) setEggCalcPc(text);
                  }}
                  keyboardType="decimal-pad"
                  placeholder="Hal. 8.50"
                  className="mb-2 rounded-[10px] border border-gray-300 bg-white px-4 py-2 text-gray-800"
                />
                {eggCalcResult ? (
                  <View>
                    <Text className="text-amber-800 text-xs">
                      • Half tray (15 eggs): ₱{Number(eggCalcResult.halfTray).toLocaleString()}{"\n"}• Full tray (30 eggs): ₱{Number(eggCalcResult.fullTray).toLocaleString()}
                    </Text>
                    {!isExistingProduct && (
                      <View className="mt-2">
                        <TouchableOpacity
                          onPress={applyEggCalc}
                          className="items-center rounded-[5px] bg-[#14532d] py-3"
                        >
                          <Text className="text-white text-xs font-semibold">
                            Gamitin: ₱{Number(eggCalcResult.fullTray).toLocaleString()} per tray
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text className="text-gray-400 text-[10px]">
                    Mag-type ng presyo bawat itlog para makita ang half/full tray.
                  </Text>
                )}
              </View>
            )}

            {/* DA REFERENCE */}
            {daLoading && name ? (
              <View className="mb-2 rounded-[10px] border border-gray-200 bg-gray-50 px-4 py-3">
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text className="text-gray-500 text-xs ml-2">
                    Kinukuha ang latest DA market reference...
                  </Text>
                </View>
              </View>
            ) : daPrice ? (
              <View className="mb-2 rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="information-circle" size={16} color="#1D4ED8" />
                  <Text className="text-blue-800 text-xs font-semibold ml-1">
                    Suggested Market Price (DA)
                  </Text>
                </View>
                <Text className="text-blue-800 text-sm mb-1">
                  ₱{Number(daPrice.price).toLocaleString()} per {daPrice.unit}
                </Text>
                {eggTraySuggestion && (
                  <View className="mt-2 rounded-[8px] bg-blue-100/60 px-3 py-2">
                    <Text className="text-blue-800 text-xs font-semibold mb-1">
                      Kwenta sa tray (batay sa ₱{Number(eggTraySuggestion.perPc).toLocaleString()} bawat itlog):
                    </Text>
                    <Text className="text-blue-800 text-xs">
                      • Half tray (15 eggs): ₱{Number(eggTraySuggestion.halfTray).toLocaleString()}{"\n"}• Full tray (30 eggs): ₱{Number(eggTraySuggestion.fullTray).toLocaleString()}
                    </Text>
                  </View>
                )}
                <Text className="text-blue-600 text-[10px]">
                  Reference lang ito mula sa Department of Agriculture
                  {daPrice.lastUpdated?.toDate
                    ? ` (updated ${daPrice.lastUpdated.toDate().toLocaleDateString()})`
                    : ""}
                  . Malaya kang magtakda ng sarili mong selling price.
                </Text>
              </View>
            ) : name ? (
              <View className="mb-2 rounded-[10px] border border-gray-200 bg-gray-50 px-4 py-3">
                <Text className="text-gray-500 text-xs">
                  Walang available na DA reference para sa produktong ito sa ngayon.
                </Text>
              </View>
            ) : null}

            {priceExceedsDaSuggestion && (
              <View className="mb-4 rounded-[10px] border border-orange-300 bg-orange-50 px-4 py-3">
                <View className="flex-row items-start">
                  <Ionicons name="warning" size={16} color="#C2410C" />
                  <Text className="text-orange-700 text-xs ml-2 flex-1">
                    Ang inilagay mong presyo ay mas mataas kaysa sa latest
                    suggested market price mula sa Department of Agriculture (DA).
                    {"\n\n"}
                    Reference lang ang DA price — maaari mo pa ring ituloy ang
                    pag-post gamit ang sarili mong presyo.
                  </Text>
                </View>
              </View>
            )}

            {/* QUANTITY (harvest) — direktang tanong para hindi nakakalito:
                full tray man o half tray, malinaw kung ano ang bibilangin.
                Kapag itlog, pinapakita rin ang kabuuang piraso. */}
            <Text className="text-xs text-gray-500 mb-1">
              HARVEST QUANTITY (dami ng inani ngayon)
            </Text>
            <Text className="text-gray-400 text-[11px] mb-1">
              {isEggProduct(name) && isFullTrayUnit(unit)
                ? "Ilang full tray (30 pcs bawat isa) ang inani mo?"
                : isEggProduct(name) && isHalfTrayUnit(unit)
                  ? "Ilang half tray (15 pcs bawat isa) ang inani mo?"
                  : `Ilang ${unit.replace(/^per\s+/i, "")} ang inani mo?`}
            </Text>
            <TextInput
              value={quantity}
              onChangeText={handleQuantityChange}
              keyboardType="numeric"
              placeholder="Hal. 50"
              className="mb-1 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
            />
            {isEggProduct(name) &&
            (isHalfTrayUnit(unit) || isFullTrayUnit(unit)) &&
            quantity !== "" &&
            Number(quantity) > 0 ? (
              <Text className="text-green-700 text-xs mb-4 mt-1">
                Kabuuang itlog:{" "}
                {(
                  Number(quantity) *
                  (isHalfTrayUnit(unit) ? EGG_HALF_PCS : EGG_FULL_PCS)
                ).toLocaleString()}{" "}
                pcs
              </Text>
            ) : (
              <View className="mb-3" />
            )}

            {/* DESCRIPTION - editable lang kapag bagong product */}
            <Text className="text-xs text-gray-500 mb-1">DESCRIPTION</Text>
            {isExistingProduct ? (
              <View className="mb-1 rounded-[10px] border border-gray-200 bg-gray-100 px-4 py-3">
                <Text className="text-gray-500 text-sm">{description || "—"}</Text>
              </View>
            ) : (
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder="Describe product..."
                className="mb-1 h-24 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
              />
            )}
            {isExistingProduct && (
              <Text className="text-gray-400 text-[10px] mb-4">
                Shared info ito ng produkto - gamitin ang &quot;Edit Product&quot; para baguhin.
              </Text>
            )}
            {!isExistingProduct && <View className="mb-3" />}

            <Text className="text-xs text-gray-500 mb-1">
              PRODUCT MEDIA
            </Text>
            {isExistingProduct ? (
              <View className="mb-1 rounded-[10px] border border-gray-200 bg-gray-100 p-3">
                {(images.length > 0 || video) ? (
                  <View>
                    {video ? (
                      <View className={images.length > 0 ? "mb-2" : ""}>
                        <View className="relative h-44 w-full overflow-hidden rounded-[10px] bg-black">
                          <VideoView
                            player={previewPlayer}
                            style={{ width: "100%", height: "100%" }}
                            contentFit="contain"
                            nativeControls={false}
                          />
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={
                              isPreviewPlaying
                                ? "Pause product video"
                                : "Play product video"
                            }
                            onPress={() =>
                              isPreviewPlaying
                                ? previewPlayer.pause()
                                : previewPlayer.play()
                            }
                            className="absolute inset-0 items-center justify-center"
                          >
                            <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
                              <Ionicons
                                name={isPreviewPlaying ? "pause" : "play"}
                                size={24}
                                color="white"
                              />
                            </View>
                          </TouchableOpacity>
                        </View>
                        <Text className="mt-1 text-sm text-gray-600">
                          Product video already added
                        </Text>
                      </View>
                    ) : null}
                    {images.length > 0 && (
                      <View className="flex-row flex-wrap gap-2">
                        {images.map((uri, index) => (
                          <Image
                            key={`${uri}-${index}`}
                            source={{ uri }}
                            className="h-16 w-16 rounded-[10px]"
                          />
                        ))}
                      </View>
                    )}
                  </View>
                ) : (
                  <Text className="text-gray-500">No media selected</Text>
                )}
              </View>
            ) : (
              <View className="mb-1 rounded-[10px] border border-gray-300 bg-gray-50 p-3">
                {video ? (
                  <View className="mb-3">
                    <View className="relative h-44 w-full overflow-hidden rounded-[10px] bg-black">
                      <VideoView
                        player={previewPlayer}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="contain"
                        nativeControls={false}
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={
                          isPreviewPlaying
                            ? "Pause product video"
                            : "Play product video"
                        }
                        onPress={() =>
                          isPreviewPlaying
                            ? previewPlayer.pause()
                            : previewPlayer.play()
                        }
                        className="absolute inset-0 items-center justify-center"
                      >
                        <View className="h-12 w-12 items-center justify-center rounded-full bg-black/50">
                          <Ionicons
                            name={isPreviewPlaying ? "pause" : "play"}
                            size={24}
                            color="white"
                          />
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityLabel="Remove video"
                        onPress={() => {
                          previewPlayer.pause();
                          setVideo("");
                        }}
                        className="absolute right-2 top-2"
                      >
                        <Ionicons
                          name="close-circle"
                          size={24}
                          color="#dc2626"
                        />
                      </TouchableOpacity>
                    </View>
                    <Text className="mt-1 text-sm text-gray-700">
                      20-second product video selected
                    </Text>
                  </View>
                ) : null}
                {images.length > 0 && (
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {images.map((uri, index) => (
                      <View key={`${uri}-${index}`}>
                        <Image
                          source={{ uri }}
                          className="h-16 w-16 rounded-[10px]"
                        />
                        <TouchableOpacity
                          accessibilityLabel={`Remove image ${index + 1}`}
                          onPress={() =>
                            setImages((current) =>
                              current.filter((_, imageIndex) => imageIndex !== index)
                            )
                          }
                          className="absolute -right-1 -top-1"
                        >
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color="#dc2626"
                          />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={pickImages}
                    disabled={images.length >= MAX_PRODUCT_IMAGES}
                    className="flex-1 items-center rounded-[10px] border border-[#14532d] px-2 py-3"
                  >
                    <Text className="text-center text-xs font-semibold text-[#14532d]">
                      Add images ({images.length}/{MAX_PRODUCT_IMAGES})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={pickVideo}
                    disabled={video !== ""}
                    className="flex-1 items-center rounded-[10px] border border-[#14532d] px-2 py-3"
                  >
                    <Text className="text-center text-xs font-semibold text-[#14532d]">
                      Add 20-sec video
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text className="mt-2 text-[10px] text-gray-500">
                  Add up to 5 images and 1 video (20 seconds, 25 MB max).
                </Text>
              </View>
            )}
            {isExistingProduct && (
              <Text className="text-gray-400 text-[10px] mb-6">
                Shared media ito ng produkto - gamitin ang &quot;Edit Product&quot; para baguhin.
              </Text>
            )}
            {!isExistingProduct && <View className="mb-5" />}

            {/* BUTTONS */}
            <View className="flex-row justify-between">
              <TouchableOpacity
                onPress={() => {
                  resetForm();
                  onClose();
                }}
                className="w-[48%] items-center rounded-[10px] border border-[#14532d] py-3"
              >
                <Text className="font-semibold text-[#14532d]">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                disabled={!isFormValid || loading}
                className="w-[48%] items-center rounded-[10px] py-3"
                style={{
                  backgroundColor:
                    isFormValid && !loading ? "#14532d" : "#9ca3af",
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default AddProductModal;
