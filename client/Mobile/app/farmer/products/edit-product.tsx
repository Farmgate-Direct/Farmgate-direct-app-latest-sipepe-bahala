// farmer/products/edit-product.tsx
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
import { ProductType } from "../../../src/types/product";
import {
  ProductCategoryKey,
  getUnitsForProduct,
} from "../../../constants/productCatalog";
import {
  getProductVideoValidationError,
  MAX_PRODUCT_IMAGES,
} from "../../../constants/productMedia";

type Props = {
  visible: boolean;
  onClose: () => void;
  product: ProductType;
  onSave: (product: ProductType) => Promise<void>;
  loading: boolean;
};

type DropdownProps = {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
};

// Unit options — pareho sa Add Product (shared helper):
// Egg & Poultry -> half tray / per tray lang (walang per pcs, walang per kg).
// Lahat ng ibang category -> per kg lang.
const getUnits = (product: ProductType) =>
  getUnitsForProduct(
    (product.category as ProductCategoryKey) || "Vegetables",
    product.name
  );

const Dropdown = ({ label, value, options, onSelect }: DropdownProps) => {
  const [open, setOpen] = useState(false);
  return (
    <View className="mb-4">
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(!open)}
        className="flex-row items-center justify-between rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3"
      >
        <Text>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} />
      </TouchableOpacity>

      {open && (
        <View className="mt-1 overflow-hidden rounded-[10px] border border-gray-300 bg-white">
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
        </View>
      )}
    </View>
  );
};

// ================= EDIT PRODUCT (MASTER INFO ONLY) =================
// Ang name/category/unit/description/media ay shared sa LAHAT ng batch ng
// produktong ito, kaya dito lang sila puwedeng baguhin. Ang price, stock,
// status, at freshness ay per-batch na - i-edit sa "Batches" ng produkto
// (tingnan ang edit-batch.tsx).
const EditProductModal = ({ visible, onClose, product, onSave, loading }: Props) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategoryKey>("Vegetables");
  const [unit, setUnit] = useState("per kg");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imagePublicIds, setImagePublicIds] = useState<string[]>([]);
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

  useEffect(() => {
    if (product) {
      setName(product.name || "");
      setCategory((product.category as ProductCategoryKey) || "Vegetables");
      setUnit(product.unit || "per kg");
      setDescription(product.description || "");
      setImages(
        product.images?.length
          ? product.images
          : !product.video && product.image
            ? [product.image]
            : []
      );
      setImagePublicIds(
        product.imagePublicIds?.length
          ? product.imagePublicIds
          : product.imagePublicId
            ? [product.imagePublicId]
            : []
      );
      setVideo(product.video || "");
      setError("");
    }
  }, [product]);

  const isFormValid =
    name.trim() !== "" &&
    category.trim() !== "" &&
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
      setImagePublicIds((current) => [
        ...current,
        ...result.assets.map(() => ""),
      ].slice(0, MAX_PRODUCT_IMAGES));
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

  const handleSave = async () => {
    if (!isFormValid) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");

    try {
      await onSave({
        ...product,
        name,
        category,
        unit,
        description,
        image: images[0] || "",
        images,
        imagePublicIds,
        imagePublicId: imagePublicIds[0] || "",
        video,
        videoPublicId: video ? product.videoPublicId || "" : "",
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Product media could not be saved."
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center bg-black/40 px-6">
        <View className="max-h-[90%] rounded-[10px] bg-white p-5">
          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="mb-3 flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-[10px] bg-green-50">
                <Ionicons name="create-outline" size={21} color="#14532d" />
              </View>
              <Text className="text-lg font-bold text-gray-900">
                Edit product
              </Text>
            </View>
            <Text className="mb-4 text-sm leading-5 text-gray-500">
              Naka-lock ang Product Name at Category (identity ng listing na
              ito). Ang unit/description/media ay shared sa lahat ng batch.
              Para sa presyo, stock, status, o freshness ng bawat batch,
              buksan ang &quot;Batches&quot; ng produkto sa listing.
            </Text>

            {error ? (
              <View className="mb-3 rounded-[10px] border border-red-100 bg-red-50 px-3 py-2">
                <Text className="text-sm text-red-600">{error}</Text>
              </View>
            ) : null}

            {/* CATEGORY - HINDI na na-eedit: ang name+category ang
                identity ng listing na ito, kaya kung babaguhin ito
                puwedeng masira ang pagtugma sa mga existing na batch. */}
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-1">CATEGORY</Text>
              <View className="flex-row items-center justify-between rounded-[10px] border border-gray-200 bg-gray-100 px-4 py-3">
                <Text className="text-gray-500">{category}</Text>
                <Ionicons name="lock-closed" size={14} color="#9ca3af" />
              </View>
            </View>

            {/* PRODUCT NAME - HINDI rin na-eedit, parehong dahilan */}
            <View className="mb-4">
              <Text className="text-xs text-gray-500 mb-1">PRODUCT NAME</Text>
              <View className="flex-row items-center justify-between rounded-[10px] border border-gray-200 bg-gray-100 px-4 py-3">
                <Text className="text-gray-500">{name}</Text>
                <Ionicons name="lock-closed" size={14} color="#9ca3af" />
              </View>
            </View>

            {/* UNIT */}
            <Dropdown
              label="UNIT"
              value={unit}
              options={getUnits(product)}
              onSelect={setUnit}
            />

            {/* DESCRIPTION */}
            <Text className="text-xs text-gray-500 mb-1">DESCRIPTION</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Describe product..."
              className="mb-4 h-24 rounded-[10px] border border-gray-300 bg-gray-100 px-4 py-3 text-gray-800"
            />

            <Text className="text-xs text-gray-500 mb-1">
              PRODUCT MEDIA
            </Text>
            <View className="mb-6 rounded-[10px] border border-gray-300 bg-gray-50 p-3">
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
                        onPress={() => {
                          setImages((current) =>
                            current.filter((_, imageIndex) => imageIndex !== index)
                          );
                          setImagePublicIds((current) =>
                            current.filter((_, imageIndex) => imageIndex !== index)
                          );
                        }}
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

            {/* BUTTONS */}
            <View className="flex-row">
              <TouchableOpacity
                onPress={onClose}
                className="mr-2 flex-1 items-center rounded-[10px] border border-[#14532d] py-3"
              >
                <Text className="font-semibold text-[#14532d]">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSave}
                disabled={!isFormValid || loading}
                className="ml-2 flex-1 items-center rounded-[10px] py-3"
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

export default EditProductModal;