import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut } from "firebase/auth";
import { loginUser } from "../../src/services/authService";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "../../FirebaseConfig";
import { useToast } from "../../context/ToastContext";

const getFreshUserDoc = async (uid: string) => {
  try {
    return await getDocFromServer(doc(db, "users", uid));
  } catch {
    return await getDoc(doc(db, "users", uid));
  }
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getAuthErrorMessage = (code?: string) => {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "Invalid email format.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    default:
      return "Something went wrong. Please try again.";
  }
};

type StatusDialog = {
  title: string;
  message: string;
  variant: "pending" | "rejected" | "banned" | "default";
};

const Login = () => {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusDialog, setStatusDialog] = useState<StatusDialog | null>(null);

  const handleLogin = async () => {

    const trimmedEmail = email.trim();

    if (!trimmedEmail && !password) {
      showToast("Please enter your email and password.");
      return;
    }
    if (!trimmedEmail) {
      showToast("Please enter your email.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      showToast("Invalid email format. Example: name@example.com");
      return;
    }
    if (!password) {
      showToast("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      // AUTH LOGIN
      const user = await loginUser(
        trimmedEmail,
        password
      );

      // FIRESTORE DATA (server read para hindi stale pending
      // ang mabasa kahit approved na sa admin)
      const userDoc = await getFreshUserDoc(user.uid);

      if (!userDoc.exists()) {
        if (!user.emailVerified) {
          await signOut(auth);
          showToast("Please verify your email before completing registration.");
          return;
        }
        // Verified na pero walang Firestore doc = hindi natapos ang
        // registration (nawala ang session). Huwag i-sign out —
        // ituloy sa registration imbis na dead-end.
        showToast("Your email is verified but registration was not finished. Please continue your registration.");
        router.replace("/auth/register");
        return;
      }

      // Block unverified kahit may Firestore doc (nag-submit pero hindi
      // pa klinick ang verification link).
      if (!user.emailVerified) {
        await signOut(auth);
        showToast("Please verify your email first. Check your inbox for the verification link.");
        return;
      }

      // APPROVAL CHECK
      // Bawal mag-login kapag hindi approved. Naka-signOut agad
      // para hindi maiwan ang Firebase session ng pending/rejected.
      const userData = userDoc.data();
      const status = String(userData.status ?? "approved").trim().toLowerCase();

      if (status === "pending") {
        await signOut(auth);
        setStatusDialog({
          title: "Pending approval",
          message:
            "Your account is waiting for admin approval. You cannot log in yet. We'll notify you once it's approved.",
          variant: "pending",
        });
        return;
      }
      // Rejected = auto-deleted sa Firestore + Auth (may Gmail notice).
      // Legacy fallback lang ito kung may lumang rejected doc pa.
      if (status === "rejected") {
        await signOut(auth);
        setStatusDialog({
          title: "Registration rejected",
          message:
            "Your previous registration was rejected. Please check your Gmail for details. You may register again.",
          variant: "rejected",
        });
        return;
      }
      if (status === "banned") {
        await signOut(auth);
        setStatusDialog({
          title: "Account is banned",
          message:
            "Your account has been banned. Please contact support for assistance.",
          variant: "banned",
        });
        return;
      }
      if (status !== "approved") {
        await signOut(auth);
        setStatusDialog({
          title: "Not approved",
          message: "Your account is not approved yet.",
          variant: "default",
        });
        return;
      }

      // SAVE LOCAL
      await AsyncStorage.setItem(
        "user",
        JSON.stringify(userData)
      );



      // ROLE ROUTE
      if (userData.role === "farmer") {
        router.replace(
          "/farmer/(tabs)/home"
        );
      } else {
        router.replace(
          "/buyer/(tabs)/home"
        );
      }
    } catch (error: any) {
      showToast(getAuthErrorMessage(error?.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: "#14532d" }}>
      <StatusBar barStyle="light-content" backgroundColor="#14532d" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center justify-center px-6 py-32">
          <Image
            className="w-20 h-20 mb-3"
            resizeMode="contain"
            source={require("../../assets/Farmgate-logos/farmgate-logo.png")}
          />
          <Text className="text-white text-2xl font-bold tracking-wide">
            FARMGATE DIRECT
          </Text>
          <Text className="text-green-100 text-sm mt-2 text-center">
            From the hands of farmers to the homes of buyers.
          </Text>
        </View>

        <View
          className="flex-1 bg-white rounded-t-[30px] px-5 pt-5 -mt-5"
          style={{ flexGrow: 1 }}
        >
          <View className="pt-5">
            <Text className="text-gray-900 text-2xl font-bold">
              Welcome back
            </Text>
            <Text className="text-gray-500 text-sm mt-2">
              Sign in to continue to your account.
            </Text>
          </View>

          <View className="pt-5">
            <Text className="text-gray-700 text-sm font-semibold mb-2">
              Email
            </Text>
            <View className="flex-row items-center bg-white border border-gray-200 rounded-[5px] px-3 mb-5">
              <MaterialCommunityIcons
                name="email-outline"
                size={20}
                color="#14532d"
              />
              <TextInput
                className="flex-1 py-3 px-3 text-gray-800"
                placeholder="Enter your email"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <Text className="text-gray-700 text-sm font-semibold mb-2">
              Password
            </Text>
            <View className="flex-row items-center bg-white border border-gray-200 rounded-[5px] px-3 mb-7">
              <MaterialCommunityIcons
                name="lock-outline"
                size={20}
                color="#14532d"
              />
              <TextInput
                className="flex-1 py-3 px-3 text-gray-800"
                placeholder="Enter your password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                onPress={() => setShowPassword((visible) => !visible)}
                className="px-1 py-2"
              >
                <MaterialCommunityIcons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={21}
                  color="#6b7280"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className="items-center justify-center rounded-[5px] py-3.5"
              style={{ backgroundColor: "#14532d" }}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">Sign in</Text>
              )}
            </TouchableOpacity>

            <Text className="text-center text-gray-500 mt-6">
              Don’t have an account yet?{" "}
              <Text
                className="font-semibold"
                style={{ color: "#14532d" }}
                onPress={() => router.push("./register")}
              >
                Register
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={statusDialog !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setStatusDialog(null)}
      >
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[10px] p-6 items-center">
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor:
                  statusDialog?.variant === "pending"
                    ? "#fef3c7"
                    : statusDialog?.variant === "rejected" ||
                        statusDialog?.variant === "banned"
                      ? "#fef2f2"
                      : "#f0fdf4",
              }}
            >
              <MaterialCommunityIcons
                name={
                  statusDialog?.variant === "pending"
                    ? "clock-outline"
                    : statusDialog?.variant === "rejected" ||
                        statusDialog?.variant === "banned"
                      ? "alert-circle-outline"
                      : "information-outline"
                }
                size={30}
                color={
                  statusDialog?.variant === "pending"
                    ? "#d97706"
                    : statusDialog?.variant === "rejected" ||
                        statusDialog?.variant === "banned"
                      ? "#dc2626"
                      : "#14532d"
                }
              />
            </View>
            <Text className="text-gray-900 text-lg font-bold text-center mb-2">
              {statusDialog?.title}
            </Text>
            <Text className="text-gray-600 text-sm leading-5 text-center">
              {statusDialog?.message}
            </Text>
            <TouchableOpacity
              onPress={() => setStatusDialog(null)}
              activeOpacity={0.85}
              className="items-center justify-center py-3 rounded-[10px] mt-5 w-full"
              style={{
                backgroundColor:
                  statusDialog?.variant === "rejected" ||
                  statusDialog?.variant === "banned"
                    ? "#dc2626"
                    : "#14532d",
              }}
            >
              <Text className="text-white font-semibold">Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Login;