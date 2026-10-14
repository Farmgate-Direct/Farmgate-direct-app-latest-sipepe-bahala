import {
  AntDesign,
  Ionicons,
  MaterialIcons,
} from "@expo/vector-icons";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { router } from "expo-router";

import React, {
  useEffect,
  useState,
} from "react";

import {
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useFarmerAlert } from "@/context/FarmerAlertContext";
import { useToast } from "@/context/ToastContext";

import * as ImagePicker from "expo-image-picker";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "../../../FirebaseConfig";

import { UserType } from "../../../src/types/user";

import { uploadFarmImageAsync } from "../../../src/services/cloudinaryFarmService";

import { deleteCloudinaryImage } from "../../../src/services/deleteImageService";

import { Dropdown } from "react-native-element-dropdown";

import {
  BULACAN_PROVINCE,
  BULACAN_CITIES,
  barangaysForCity,
} from "../../../constants/bulacanBarangays";

const EditProfileFarm = () => {
  const Alert = useFarmerAlert();
  const { showToast } = useToast();
  const [loading, setLoading] =
    useState(false);

  const [user, setUser] =
    useState<UserType>({
      uid: "",
      fullName: "",
      email: "",
      phone: "",
      role: "",
      status: "",

      farmName: "",
      street: "",
      barangay: "",
      municipality: "",
      province: "",
      about: "",

      coverPhoto: "",
      coverPhotoPublicId: "",
    });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const storedUser =
        await AsyncStorage.getItem("user");

      if (!storedUser) return;

      const parsedUser =
        JSON.parse(storedUser);

      const userRef = doc(
        db,
        "users",
        parsedUser.uid
      );

      const userSnap =
        await getDoc(userRef);

      if (userSnap.exists()) {
        const data =
          userSnap.data() as UserType;

        // IMPORTANT FIX
        setUser((prev) => ({
          ...prev,
          ...data,
        }));
      }
    } catch (error) {
      console.log(
        "LOAD USER ERROR:",
        error
      );
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "Allow access to photos"
        );

        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes:
            ImagePicker.MediaTypeOptions.Images,

          allowsEditing: true,

          aspect: [16, 9],

          quality: 0.7,
        });

      if (!result.canceled) {
        setUser((prev) => ({
          ...prev,
          coverPhoto:
            result.assets[0].uri,
        }));
      }
    } catch (error) {
      console.log(
        "IMAGE PICK ERROR:",
        error
      );
    }
  };

  const handleSave = async () => {
    try {
      const city = String(user.municipality || (user as any).city || "").trim();
      const barangay = String(user.barangay || "").trim();
      if (!city) {
        Alert.alert("Missing city", "Pick your City / Municipality from the list.");
        return;
      }
      if (!barangay) {
        Alert.alert("Missing barangay", "Pick your Barangay from the list. Delivery stays blocked until you do.");
        return;
      }
      setLoading(true);

      let coverPhoto =
        user.coverPhoto;

      let coverPhotoPublicId =
        user.coverPhotoPublicId;

      // NEW IMAGE
      if (
        coverPhoto &&
        !coverPhoto.startsWith(
          "https://"
        )
      ) {
        const oldPublicId =
          user.coverPhotoPublicId;

        const uploadResult =
          await uploadFarmImageAsync(
            coverPhoto
          );

        coverPhoto =
          uploadResult.imageUrl;

        coverPhotoPublicId =
          uploadResult.publicId;

        // DELETE OLD IMAGE
        if (oldPublicId) {
          await deleteCloudinaryImage(
            oldPublicId
          );
        }
      }

      const userRef = doc(
        db,
        "users",
        user.uid
      );

      await updateDoc(userRef, {
        farmName:
          user.farmName || "",

        street:
          user.street || "",

        barangay,

        municipality: city,
        city,

        // Province is locked to Bulacan (Bulacan-only delivery).
        province: BULACAN_PROVINCE,

        about:
          user.about || "",

        coverPhoto:
          coverPhoto || "",

        coverPhotoPublicId:
          coverPhotoPublicId || "",
      });

      const updatedUser = {
        ...user,
        municipality: city,
        city,
        barangay,
        province: BULACAN_PROVINCE,
        coverPhoto,
        coverPhotoPublicId,
      };

      await AsyncStorage.setItem(
        "user",
        JSON.stringify(updatedUser)
      );

      showToast("Farm updated successfully.");

      router.back();
    } catch (error) {
      console.log(
        "SAVE USER ERROR:",
        JSON.stringify(error)
      );

      Alert.alert(
        "Error",
        String(error)
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f5f5f5]">
      <StatusBar
        barStyle="light-content"
      />

      {/* HEADER */}
      <View className="flex-row items-center px-5 pb-4 pt-14" style={{ backgroundColor: "#14532d" }}>
        <TouchableOpacity
          onPress={() =>
            router.back()
          }
          activeOpacity={0.7}
          className="h-10 w-10 items-center justify-center"
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="white"
          />
        </TouchableOpacity>

        <Text className="ml-4 flex-1 text-lg font-bold text-white">
          Farm Profile
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
      {/* COVER PHOTO */}
      <View className="px-5 py-5">
        <TouchableOpacity
          onPress={pickImage}
          activeOpacity={0.85}
          className="h-44 w-full overflow-hidden rounded-[10px] border border-gray-200 bg-white"
        >
          {user.coverPhoto ? (
            <>
              <Image
                source={{
                  uri: user.coverPhoto,
                }}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                resizeMode="cover"
              />

              {/* OVERLAY */}
              <View
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 10,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <AntDesign
                  name="camera"
                  size={14}
                  color="white"
                />

                <Text className="text-white text-sm font-semibold ml-1">
                  Change Photo
                </Text>
              </View>
            </>
          ) : (
            <View className="flex-1 items-center justify-center">
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#f0fdf4",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AntDesign
                  name="camera"
                  size={26}
                  color="#14532d"
                />
              </View>

              <Text className="mt-3 text-base font-semibold text-gray-800">
                Upload Cover Photo
              </Text>

              <Text className="mt-1 text-sm text-gray-500">
                16:9 recommended
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* FORM */}
      <View className="px-5 pt-1">
          {/* HEADER */}
          <View className="mb-4 flex-row items-center">
            <MaterialIcons
              name="agriculture"
              size={22}
              color="#14532d"
            />

            <Text className="ml-2 text-base font-bold text-gray-900">
              Farm Details
            </Text>
          </View>

          {/* FARM NAME */}
          <FieldLabel label="Farm Name" />

          <TextInput
            value={user.farmName}
            onChangeText={(text) =>
              setUser((prev) => ({
                ...prev,
                farmName: text,
              }))
            }
            placeholder="e.g. Dela Cruz Farm"
            placeholderTextColor="#aaa"
            className="mb-4 rounded-[10px] border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
          />

          {/* LOCATION */}
          <View className="mb-3 mt-1 flex-row items-center">
            <Ionicons
              name="location-outline"
              size={18}
              color="#14532d"
            />

            <Text className="ml-2 text-sm font-semibold text-gray-700">
              Location (Bulacan only)
            </Text>
          </View>

          {/* MISSING BARANGAY BANNER (legacy farms) */}
          {!user.barangay?.trim() && (
            <View className="mb-4 rounded-[10px] border border-amber-300 bg-amber-50 p-3">
              <Text className="text-sm font-bold text-amber-900">
                Delivery is blocked until you pick your barangay.
              </Text>
              <Text className="mt-1 text-xs text-amber-800">
                Pick your City then Barangay below and save. Old free-text
                addresses no longer work for delivery.
              </Text>
            </View>
          )}

          {/* STREET */}
          <FieldLabel label="Street Name" />

          <TextInput
            value={user.street || ""}
            onChangeText={(text) =>
              setUser((prev) => ({
                ...prev,
                street: text,
              }))
            }
            placeholder="e.g. 123 Mabini Street"
            placeholderTextColor="#aaa"
            className="mb-4 rounded-[10px] border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
          />

          {/* CITY / MUNICIPALITY (dropdown) */}
          <FieldLabel label="City / Municipality" />

          <Dropdown
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 16,
              height: 50,
              marginBottom: 16,
            }}
            data={BULACAN_CITIES.map((name) => ({ name, code: name }))}
            labelField="name"
            valueField="code"
            placeholder="Select City / Municipality"
            search
            searchPlaceholder="Search city or municipality..."
            value={user.municipality || (user as any).city || null}
            activeColor="#f0fdf4"
            onChange={(item) =>
              setUser((prev) => ({
                ...prev,
                municipality: item.name,
                city: item.name,
                // Reset barangay when the city changes (barangays depend on city).
                barangay: "",
              }))
            }
          />

          {/* BARANGAY (dropdown, depends on city) */}
          <FieldLabel label="Barangay" />

          <Dropdown
            disable={!(user.municipality || (user as any).city)}
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e5e7eb",
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 16,
              height: 50,
              marginBottom: 16,
              opacity: user.municipality || (user as any).city ? 1 : 0.5,
            }}
            data={barangaysForCity(
              user.municipality || (user as any).city || ""
            ).map((name) => ({ name, code: name }))}
            labelField="name"
            valueField="code"
            placeholder={
              user.municipality || (user as any).city
                ? "Select Barangay"
                : "Select a city first"
            }
            search
            searchPlaceholder="Search barangay..."
            value={user.barangay || null}
            activeColor="#f0fdf4"
            onChange={(item) =>
              setUser((prev) => ({
                ...prev,
                barangay: item.name,
              }))
            }
          />

          {/* PROVINCE (locked) */}
          <FieldLabel label="Province (locked)" />

          <View className="mb-4 rounded-[10px] border border-gray-200 bg-gray-50 px-4 py-3">
            <Text className="text-base text-gray-900">{BULACAN_PROVINCE}</Text>
          </View>

          {/* ABOUT */}
          <View className="mb-2 mt-1 flex-row items-center">
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#14532d"
            />

            <Text className="ml-2 text-sm font-semibold text-gray-700">
              About
            </Text>
          </View>

          <TextInput
            value={user.about}
            onChangeText={(text) =>
              setUser((prev) => ({
                ...prev,
                about: text,
              }))
            }
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="Tell buyers about your farm..."
            placeholderTextColor="#aaa"
            className="mb-4 h-28 rounded-[10px] border border-gray-200 bg-white px-4 pb-3 pt-3 text-base text-gray-900"
          />

          {/* SAVE BUTTON */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
            className="mt-3 flex-row items-center justify-center rounded-[10px] py-3.5"
            style={{ backgroundColor: loading ? "#86a991" : "#14532d" }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text className="ml-2 text-base font-semibold text-white">
                  Save Changes
                </Text>
              </>
            )}
          </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
};

const FieldLabel = ({
  label,
}: {
  label: string;
}) => (
  <Text className="mb-1.5 text-xs font-semibold text-gray-500">
    {label}
  </Text>
);

export default EditProfileFarm;