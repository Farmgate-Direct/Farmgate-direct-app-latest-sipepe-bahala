import { MaterialCommunityIcons } from "@expo/vector-icons";

import AsyncStorage
  from "@react-native-async-storage/async-storage";

import {
  useFocusEffect,
  useRouter,
} from "expo-router";

import React, {
  useCallback,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  deleteAddress,
  getUserAddresses,
  setDefaultAddress,
} from "../../../src/services/addressService";

import { useToast } from "../../../context/ToastContext";

const AddressScreen = () => {

  const router = useRouter();

  const { showToast } = useToast();

  const [addresses, setAddresses] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [user, setUser] = useState<any>(null);

  const [refreshing, setRefreshing] = useState(false);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // ================= LOAD =================
  const loadAddresses = async (isBackgroundRefresh = false) => {
    try {
      if (isBackgroundRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const userStr = await AsyncStorage.getItem("user");
      const parsedUser = userStr ? JSON.parse(userStr) : null;
      if (!parsedUser) return;

      setUser(parsedUser);

      const data = await getUserAddresses(
        parsedUser.uid || parsedUser.userId || parsedUser.id
      );

      setAddresses(data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAddresses();
    }, [])
  );

  const handleSetDefault = async (addressId: string) => {
    try {
      if (!user) return;
      await setDefaultAddress(user.uid || user.userId || user.id, addressId);
      await loadAddresses(true); // ← background refresh, no full-screen blocker
      showToast("Default address updated");
    } catch (error) {
      console.log(error);
      showToast("Failed to update default address");
    }
  };

  // ================= DELETE =================
  const handleDelete = (addressId: string) => {
    setDeleteTargetId(addressId);
  };

  const handleConfirmedDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteAddress(deleteTargetId);
      await loadAddresses(true);
    } catch (error) {
      console.log(error);
    } finally {
      setDeleteTargetId(null);
    }
  };

  // ================= LOADING =================
  if (loading) {

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

    <View className="flex-1 bg-white">

      {/* HEADER */}
      <View className="bg-green-900 pt-14 pb-4 px-5 rounded-b-2xl flex-row items-center">

        <TouchableOpacity
          onPress={() =>
            router.back()
          }
        >

          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color="white"
          />

        </TouchableOpacity>

        <Text className="text-white font-bold text-lg ml-4">
          My Address
        </Text>

      </View>

      {/* BODY */}
      <View className="flex-1" style={{ backgroundColor: "#fafafa" }}>

        {addresses.length === 0 ? (

          <View className="flex-1 justify-center items-center -mt-10">

            <MaterialCommunityIcons
              name="map-marker-outline"
              size={72}
              color="#D1D5DB"
            />

            <Text className="text-gray-500 text-base mt-4">
              No address added yet
            </Text>

            <Text className="text-gray-400 text-sm mt-1 text-center px-10">
              Add your delivery address
              to continue ordering
            </Text>

          </View>

        ) : (

          <FlatList
            data={addresses}
            keyExtractor={(item, index) =>
              item.id ??
              index.toString()
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 120,
            }}
            renderItem={({ item }) => (

              <View
                className="rounded-[5px] p-5 mb-4"
                style={{
                  backgroundColor: "#ffffff",
                  borderWidth: item.isDefault ? 1 : 0,
                  borderColor: "#14532d",
                }}
              >

                {/* TOP */}
                <View className="flex-row justify-between items-start">

                  <View className="flex-1 pr-3">

                    <Text className="text-gray-800 text-base font-bold">
                      {item.fullName}
                    </Text>

                    <Text className="text-gray-500 text-sm mt-1">
                      {item.phone}
                    </Text>

                  </View>

                  {item.isDefault && (

                    <View
                      className="px-3 py-1 rounded-[5px]"
                      style={{ backgroundColor: "#14532d" }}
                    >

                      <Text className="text-white text-[10px] font-bold">
                        DEFAULT
                      </Text>

                    </View>

                  )}

                </View>

                {/* ADDRESS */}
                <View className="mt-3">

                  <Text className="text-gray-600 text-sm leading-6">

                    {item.street}

                    {", "}

                    {item.barangay}

                    {", "}

                    {item.city}

                    {", "}

                    {item.province}

                    {", "}

                    {item.region}

                    {" "}

                    {item.postalCode}

                  </Text>

                  <Text className="text-gray-600 text-xs mt-1">
                    {item.barangay}{item.city ? `, ${item.city}` : ""}
                  </Text>

                </View>

                {/* ACTIONS */}
                <View className="flex-row mt-4 pt-4 border-t border-gray-100">

                  {!item.isDefault && (

                    <TouchableOpacity
                      onPress={() =>
                        handleSetDefault(
                          item.id
                        )
                      }
                      className="mr-5"
                    >

                      <Text
                        className="text-sm font-semibold"
                        style={{ color: "#14532d" }}
                      >
                        Set as Default
                      </Text>

                    </TouchableOpacity>

                  )}

                  <TouchableOpacity
                    onPress={() =>
                      handleDelete(
                        item.id
                      )
                    }
                  >

                    <Text className="text-red-600 text-sm font-semibold">
                      Delete
                    </Text>

                  </TouchableOpacity>

                </View>

              </View>
            )}
          />
        )}

        {/* BUTTON */}
        <TouchableOpacity
          activeOpacity={0.85}
          className="absolute bottom-6 left-5 right-5 py-4 rounded-[5px] items-center"
          style={{
            backgroundColor: "#14532d",
            elevation: 4,
            shadowColor: "#14532d",
            shadowOpacity: 0.25,
            shadowRadius: 8,
          }}
          onPress={() =>
            router.push(
              "/buyer/profile/new-address"
            )
          }
        >

          <Text className="text-white font-bold text-base">
            Add New Address
          </Text>

        </TouchableOpacity>

      </View>
    
        {/* DELETE ADDRESS MODAL */}
        {deleteTargetId && (
          <View className="absolute inset-0 justify-center items-center bg-black/40">
            <View
              className="bg-white rounded-[5px] p-6 w-80"
              style={{ borderWidth: 1, borderColor: "#14532d" }}
            >
              <Text className="text-gray-800 text-lg font-semibold mb-2">
                Delete Address
              </Text>
              <Text className="text-gray-500 text-sm mb-4">
                Are you sure you want to delete this address?
              </Text>

              <View className="flex-row justify-between mt-4">
                <TouchableOpacity
                  className="bg-gray-200 px-4 py-2 rounded-[5px] flex-1 mr-2 items-center"
                  onPress={() => setDeleteTargetId(null)}
                >
                  <Text className="text-gray-700 font-semibold">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="px-4 py-2 rounded-[5px] flex-1 ml-2 items-center"
                  style={{ backgroundColor: "#dc2626" }}
                  onPress={handleConfirmedDelete}
                >
                  <Text className="text-white font-semibold">Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
    </View>
  );
};

export default AddressScreen;