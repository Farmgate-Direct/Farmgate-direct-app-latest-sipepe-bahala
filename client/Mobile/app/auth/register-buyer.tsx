import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  ScrollView,
  StatusBar,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import AntDesign from "@expo/vector-icons/AntDesign";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  sanitizePhoneInput,
  toE164Phone,
  validateDetails,
  validatePasswords,
  getRegisterErrorMessage,
} from "../../utils/validators";
import { registerUser } from "../../src/services/authService";
import { saveUserToFirestore } from "../../src/services/firestoreService";
import { checkEmailStatus } from "../../src/services/emailStatusService";
import { resendVerificationByEmail, sendBrandedVerificationEmail } from "../../src/services/emailVerificationService";
import { uploadValidIDAsync } from "../../src/services/cloudinaryValidIDService";
import { useToast } from "../../context/ToastContext";
import { auth } from "../../FirebaseConfig";
import { reload, signOut } from "firebase/auth";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { db } from "../../FirebaseConfig";

const normalizeStatus = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

// Laging server ang basahin para hindi magpakita ng lumang "pending"
// kahit approved na sa admin (stale cache issue).
const getFreshUserDoc = async (uid: string) => {
  try {
    return await getDocFromServer(doc(db, "users", uid));
  } catch {
    return await getDoc(doc(db, "users", uid));
  }
};

const dialogForExistingStatus = (status: string) => {
  if (status === "approved") {
    return {
      title: "Already registered",
      message: "This email is already registered and approved. Please sign in instead.",
      success: true as const,
    };
  }
  // Rejected = wala na (auto-deleted sa Firestore + Auth, may Gmail notice),
  // kaya kahit same email pwede gumawa ulit. Return null = huwag harangan,
  // diretso fresh registration.
  if (status === "rejected") {
    return null;
  }
  if (status === "banned") {
    return {
      title: "Account is banned",
      message: "Your account has been banned. Please contact support for assistance.",
      success: false as const,
    };
  }
  return {
    title: "Account pending approval",
    message: "Your account is pending admin approval. You can sign in after it has been approved.",
    success: true as const,
  };
};

const RegisterBuyer = () => {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validID, setValidID] = useState< string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string; success?: boolean } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Panlaban sa paulit-ulit na submit kapag palpak ang password —
  // 3 sunod na fail = 60s lock para hindi ma-rate-limit ng Firebase.
  const [failedSubmits, setFailedSubmits] = useState(0);
  const [submitLockedUntil, setSubmitLockedUntil] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const nextStep = () => {
    const validationError = validateDetails({ fullName, email, phone });
    if (validationError) {
      showToast(validationError);
      return;
    }
    setStep(2);
  };

  const startEmailVerification = async () => {
    // Step 2 -> Step 3: validate lang, WALANG Auth user na ginagawa dito.
    const validationError = validatePasswords({ password, confirmPassword });

    if (validationError) {
      showToast(validationError);
      return;
    }
    setStep(3);
  };

  const handleResendVerification = async () => {
    if (loading) return;
    if (cooldown > 0) {
      showToast(`Wait ${cooldown}s before requesting a new link. Use the latest email we sent.`);
      return;
    }
    const user = auth.currentUser;
    // Walang session (nag-close ng app) = resend gamit lang ang email,
    // walang password, sa backend.
    if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) {
      try {
        setLoading(true);
        const result = await resendVerificationByEmail(email.trim());
        if (result.alreadyVerified) {
          showToast("Your email is already verified. Tap below to finish.");
        } else if (result.sent) {
          setCooldown(60);
          showToast("A new verification link has been sent. Only the newest link works.");
        } else if (result.exists === false) {
          showToast("No account found for this email. Please submit registration first.");
          setStep(1);
        } else {
          showToast("Could not resend. Check your connection and try again.");
        }
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      setLoading(true);
      const result = await sendBrandedVerificationEmail(fullName.trim());
      if (result.alreadyVerified) {
        showToast("Your email is already verified. Tap below to finish.");
      } else {
        setCooldown(60);
        showToast("A new verification link has been sent. Only the newest link works.");
      }
    } catch (error: any) {
      showToast(getRegisterErrorMessage(error?.code));
    } finally {
      setLoading(false);
    }
  };

  // Database (Firestore) + ID upload ay dito lang — PAGKATAPOS
  // ma-verify ang email. Walang nase-save hangga't hindi verified.
  const finalizeRegistration = async () => {
    const validationError = validateDetails({ fullName, email, phone }) ||
      validatePasswords({ password, confirmPassword });

    if (validationError) {
      showToast(validationError);
      setStep(1);
      throw { code: "local/validation" };
    }

    if (!validID) {
      showToast("Upload a clear photo of your valid ID.");
      setStep(3);
      throw { code: "local/validation" };
    }

    if (!agreed) {
      showToast("Read and accept the User Agreement and Privacy Policy to continue.");
      setStep(3);
      throw { code: "local/validation" };
    }

    const user = auth.currentUser;

    if (!user) throw { code: "auth/no-current-user" };

    // GUARD: huwag i-overwrite ang existing account.
    // Kapag approved na, huwag nang magpakita ng pending.
    // Kapag rejected, wala na yon (deleted) — hayaang gumawa ulit.
    const preExisting = await getFreshUserDoc(user.uid);
    if (preExisting.exists()) {
      const currentStatus = normalizeStatus(preExisting.data()?.status) || "pending";
      if (currentStatus === "rejected") {
        // Lumang doc na dapat burado na — huwag harangan, diretso fresh save.
      } else {
        setDialog(dialogForExistingStatus(currentStatus));
        return;
      }
    }

    // STORAGE
    const validIDUrl =
      await uploadValidIDAsync(validID as string);

    // FIRESTORE
    await saveUserToFirestore(user.uid, {
      uid: user.uid,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: toE164Phone(phone),
      role: "buyer",
      status: "pending",
      validID: validIDUrl,
      createdAt: new Date(),
    });

    setDialog({
      title: "Account pending approval",
      message: "Your account is pending admin approval. You can sign in after it has been approved.",
      success: true,
    });
  };

  const checkEmailVerification = async () => {
    const user = auth.currentUser;
    // Walang session (nag-close ng app) = i-check sa backend gamit
    // lang ang email. Kapag verified na, mag-sign in para tapusin.
    if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) {
      try {
        setCheckingEmail(true);
        const status = await checkEmailStatus(email.trim());
        if (!status?.exists) {
          showToast("No account found for this email. Please submit registration first.");
          setStep(1);
          return;
        }
        if (!status.emailVerified) {
          showToast("Verify your email using the link we sent, then try again.");
          return;
        }
        showToast("Email verified! Please sign in to finish your registration.");
        router.replace("/auth/login");
      } finally {
        setCheckingEmail(false);
      }
      return;
    }

    try {
      setCheckingEmail(true);
      await reload(user);
      if (!user.emailVerified) {
        showToast("Verify your email using the link we sent, then try again.");
        setCheckingEmail(false);
        return;
      }
    } catch (error: any) {
      console.error("Email verification check failed:", error);
      // Burado na ang account sa server (na-reject): linisin ang session
      // at bumalik sa umpisa para makagawa ulit.
      if (
        error?.code === "auth/user-token-expired" ||
        error?.code === "auth/user-not-found"
      ) {
        try {
          await signOut(auth);
        } catch {}
        showToast("Session expired. Please submit registration again.");
        setCheckingEmail(false);
        setStep(1);
        return;
      }
      showToast("Could not check email verification. Please try again.");
      setCheckingEmail(false);
      return;
    }

    // Verified na — saka lang i-upload ang ID at i-save sa database.
    try {
      await finalizeRegistration();
    } catch (error: any) {
      if (error?.code === "local/validation") {
        setCheckingEmail(false);
        return;
      }
      console.error("Finalize registration failed:", error);
      showToast(getRegisterErrorMessage(error?.code));
      // Bumalik sa ID step para makapili muli ng ID kung kailangan.
      setStep(3);
    } finally {
      setCheckingEmail(false);
    }
  };

  const pickImage = async () => {
    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
      });
    if (!result.canceled) {
      setValidID(result.assets[0].uri);
    }
  };

  // Auth user + Firestore doc ay ginagawa lang dito sa final submit —
  // walang pumapasok sa Authentication kapag hindi tinapos ang form.
  const handleSubmit = async () => {
    // Double-tap guard: kapag "ang tagal" at pinindot ulit, bawat pindot
    // ay bagong createUser + sendEmailVerification = instant
    // auth/too-many-requests. Isang request lang at a time.
    if (loading || checkingEmail) return;
    const validationError = validateDetails({ fullName, email, phone }) ||
      validatePasswords({ password, confirmPassword });

    if (validationError) {
      showToast(validationError);
      return;
    }

    if (!validID) {
      showToast("Upload a clear photo of your valid ID.");
      return;
    }

    if (!agreed) {
      showToast("Read and accept the User Agreement and Privacy Policy to continue.");
      return;
    }

    // Huwag i-spam ang submit — Firebase nagla-lockout (too-many-requests).
    // Ang block ay per IP/network, kaya kahit ibang phone sa same WiFi
    // ay blocked pa rin. Huwag tapusin sa paulit-ulit na pindot.
    if (Date.now() < submitLockedUntil) {
      const waitSecs = Math.ceil((submitLockedUntil - Date.now()) / 1000);
      showToast(`Too many attempts. Wait ${waitSecs}s without tapping, then try once.`);
      return;
    }

    // SIMPLE: email lang ang basehan, walang password.
    // - Walang doc (verification hindi natapos, nag-close) = pwede pa
    //   gamitin same email, HINDI "already registered".
    // - May doc pending = "Your account is pending".
    // - May doc approved = "Email already registered".
    let emailCheck: Awaited<ReturnType<typeof checkEmailStatus>> = null;
    try {
      setLoading(true);

      // ---- EMAIL-BASED DUPLICATE CHECK (walang password) ----
      try {
        emailCheck = await checkEmailStatus(email.trim());
      } catch {
        emailCheck = null;
      }
      if (emailCheck?.exists) {
        const checked = String(emailCheck.status || "").trim().toLowerCase();
        if (checked === "approved") {
          setLoading(false);
          setFailedSubmits(0);
          setDialog({
            title: "Already registered",
            message: "This email is already registered. Please sign in instead.",
            success: true,
          });
          return;
        }
        if (checked === "pending") {
          setLoading(false);
          setFailedSubmits(0);
          setDialog({
            title: "Account pending approval",
            message: "Your account is pending approval. Please wait for admin approval.",
            success: true,
          });
          return;
        }
        if (checked === "banned") {
          setLoading(false);
          setFailedSubmits(0);
          setDialog({
            title: "Account is banned",
            message: "Your account has been banned. Please contact support for assistance.",
            success: false,
          });
          return;
        }
        // rejected / no-doc / no-auth = huwag harangan, diretso fresh flow.
      }

      // ---- AUTH USER (dito lang, hindi sa Step 2) ----
      // Kapag same session (nag-close lang pero same device), ituloy
      // nang walang password. Kapag ibang session at existing Auth,
      // huwag nang mag-sign-in gamit ang password — sabihan na lang
      // na ituloy ang verification o mag-sign in sa Login.
      let user = auth.currentUser;
      if (user?.email?.toLowerCase() !== email.trim().toLowerCase()) {
        try {
          user = await registerUser(fullName.trim(), email.trim(), password);
        } catch (createError: any) {
          if (createError?.code === "auth/email-already-in-use") {
            throw { code: "auth/email-already-in-use" };
          }
          throw createError;
        }
      } else {
        try {
          await reload(user);
        } catch (reloadError: any) {
          // Burado na ang Auth account sa server (na-reject) o expired
          // ang token: linisin ang session at gumawa ng bago imbis na ma-stuck.
          if (
            reloadError?.code === "auth/user-token-expired" ||
            reloadError?.code === "auth/user-not-found"
          ) {
            try {
              await signOut(auth);
            } catch {}
            user = null;
          } else {
            throw reloadError;
          }
        }
      }
      if (!user) {
        try {
          user = await registerUser(fullName.trim(), email.trim(), password);
        } catch (createError: any) {
          if (createError?.code === "auth/email-already-in-use") {
            throw { code: "auth/email-already-in-use" };
          }
          throw createError;
        }
      }

      if (!user) throw { code: "auth/no-current-user" };

      // Gamitin ang fresh auth state (hindi stale `user` object).
      const freshVerified = auth.currentUser?.emailVerified ?? user.emailVerified;

      // Kung verified na at may Firestore doc na, tapos na ang registration.
      // Huwag nang sabihing "Registration submitted" ulit — nakaka-confuse.
      // Ipakita na lang ang totoong status ng existing account (server read
      // para hindi lumang pending ang mabasa kahit approved na).
      if (freshVerified) {
        const existing = await getFreshUserDoc(user.uid);
        if (existing.exists()) {
          const existingStatus = normalizeStatus(existing.data()?.status) || "pending";
          // Rejected = tanggal na, pwede gumawa ulit — huwag harangan.
          if (existingStatus !== "rejected") {
            const existingDialog = dialogForExistingStatus(existingStatus);
            if (existingDialog) {
              setLoading(false);
              setFailedSubmits(0);
              setDialog(existingDialog);
              return;
            }
          }
        }
        setLoading(false);
        setCooldown(60);
        setFailedSubmits(0);
        setStep(4);
        showToast("Your email is already verified. Tap below to finish.");
        return;
      }

      // ---- SEND VERIFICATION (save sa database mamaya pag verified) ----
      await sendBrandedVerificationEmail(fullName.trim());
      setLoading(false);
      setCooldown(60);
      setFailedSubmits(0);
      setStep(4);
      showToast(`Verification link sent to ${email.trim()}. Verify first — nothing is saved until your email is verified.`);

    } catch (error: any) {
      setLoading(false);
      console.log("Registration error:", error);
      const code = error?.code;

      // auth/too-many-requests = Firebase IP/network block (minutes ang
      // tagal). Kahit ibang phone sa same WiFi ay blocked pa rin. I-lock
      // agad nang 3 minuto para hindi humaba ang block sa kakapindot.
      if (code === "auth/too-many-requests") {
        setSubmitLockedUntil(Date.now() + 180000);
        setFailedSubmits((n) => n + 1);
        setCooldown(60);
        showToast(getRegisterErrorMessage(code));
        return;
      }

      // 3 sunod na palpak = 60s lock para hindi ma-ban ng Firebase.
      const fails = failedSubmits + 1;
      setFailedSubmits(fails);
      if (fails >= 3) {
        setSubmitLockedUntil(Date.now() + 60000);
      }

      if (code === "auth/email-already-in-use") {
        // Walang doc (verification hindi natapos) = pwede pa gamitin,
        // HINDI "already registered". Diretso sa email step para
        // ituloy ang verification.
        setCooldown(60);
        setFailedSubmits(0);
        setStep(4);
        showToast("Verification already sent to this email. Please check your inbox to continue.");
        return;
      }
      if (code === "auth/invalid-email") {
        setStep(1);
      }
      showToast(getRegisterErrorMessage(code));
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
          source={require("../../assets/Farmgate-logos/farmgate-logo.png")}
          className="w-20 h-20 mb-3"
          resizeMode="contain"
        />
        <Text className="text-white text-2xl font-bold tracking-wide">
          FARMGATE DIRECT
        </Text>
        <Text className="text-green-100 text-sm mt-2 text-center">
          Buyer registration
        </Text>
      </View>

      <View className="flex-1 bg-white rounded-t-[30px] px-5 pt-5 -mt-5" style={{ flexGrow: 1 }}>
        <View className="pt-5 mb-10">
          <View className="flex-row items-center justify-between">
            {[
              { label: "Details", icon: "account-outline" as const },
              { label: "Password", icon: "lock-outline" as const },
              { label: "ID", icon: "card-account-details-outline" as const },
              { label: "Email", icon: "email-outline" as const },
            ].map((item, index) => {
              const itemStep = index + 1;
              const active = step >= itemStep;
              return (
                <View key={item.label} className="items-center flex-1">
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: active ? "#14532d" : "#f3f4f6" }}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={19}
                      color={active ? "#ffffff" : "#9ca3af"}
                    />
                  </View>
                  <Text className="text-xs mt-1" style={{ color: active ? "#14532d" : "#9ca3af" }}>
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
        <View>
          {step === 1 ? (
          <>
          <Text className="text-gray-700 text-sm font-semibold mb-2">
            Full Name
          </Text>

          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Enter your full name"
            placeholderTextColor="#9ca3af"
            className="bg-white border border-gray-200 rounded-[5px] px-4 py-4 mb-4 text-gray-800"
            style={{ minHeight: 50 }}
          />

          <Text className="text-gray-700 text-sm font-semibold mb-2">
            Email
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter your email"
            placeholderTextColor="#9ca3af"
            className="bg-white border border-gray-200 rounded-[5px] px-4 py-4 mb-4 text-gray-800"
            style={{ minHeight: 50 }}
          />

          <Text className="text-gray-700 text-sm font-semibold mb-2">
            Phone No.
          </Text>

          <View
            className="flex-row items-center bg-white border border-gray-200 rounded-[5px] mb-4"
            style={{ minHeight: 50 }}
          >
            <View className="px-4 self-stretch justify-center border-r border-gray-200">
              <Text className="text-gray-700 font-semibold">+63</Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(sanitizePhoneInput(value))}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="9XX XXX XXXX"
              placeholderTextColor="#9ca3af"
              className="flex-1 px-3 py-4 text-gray-800"
            />
          </View>
          </>
          ) : step === 2 ? (
          <>
          <Text className="text-gray-700 text-sm font-semibold mb-2">
            Password
          </Text>
          <View className="flex-row items-center border border-gray-200 rounded-[5px] px-1 mb-4" style={{ minHeight: 50 }}>
            <TextInput
              key={`password-${showPassword ? "visible" : "hidden"}`}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              placeholder="Enter your password"
              placeholderTextColor="#9ca3af"
              className="flex-1 px-3 py-4 text-gray-800"
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              onPress={() => setShowPassword((visible) => !visible)}
              className="px-3 py-2"
            >
              <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <Text className="text-gray-700 text-sm font-semibold mb-2">
            Confirm Password
          </Text>

          <View className="flex-row items-center border border-gray-200 rounded-[5px] px-1 mb-4" style={{ minHeight: 50 }}>
            <TextInput
              key={`confirm-password-${showConfirmPassword ? "visible" : "hidden"}`}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              textContentType="newPassword"
              placeholder="Confirm your password"
              placeholderTextColor="#9ca3af"
              className="flex-1 px-3 py-4 text-gray-800"
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={showConfirmPassword ? "Hide password" : "Show password"}
              onPress={() => setShowConfirmPassword((visible) => !visible)}
              className="px-3 py-2"
            >
              <MaterialCommunityIcons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <Text className="text-gray-500 text-xs -mt-2 mb-4">
            At least 8 characters, with letters and numbers.
          </Text>
          </>
          ) : step === 4 ? (
          <View className="items-center py-5">
            <MaterialCommunityIcons name="email-check-outline" size={48} color="#14532d" />
            <Text className="text-gray-800 text-base font-semibold text-center mt-4">
              Check your inbox
            </Text>
            <Text className="text-gray-600 text-sm text-center mt-2">
              Open the verification link sent to {email.trim()}, then return here to continue.
            </Text>
            <Text className="text-gray-500 text-xs text-center mt-2 px-4">
              Only the newest link works — older links show "expired or already used". If you see "already used", just tap "I've verified my email" below.
            </Text>
            <TouchableOpacity
              onPress={handleResendVerification}
              disabled={loading || cooldown > 0}
              className="mt-5"
            >
              <Text className="font-semibold" style={{ color: cooldown > 0 ? "#9ca3af" : "#14532d" }}>{cooldown > 0 ? `Resend verification link (${cooldown}s)` : "Resend verification link"}</Text>
            </TouchableOpacity>
          </View>
          ) : (
          <>
          <View className="flex-row items-start rounded-[10px] bg-green-50 p-3 mb-5">
            <MaterialCommunityIcons name="shield-check-outline" size={21} color="#14532d" />
            <Text className="flex-1 ml-2 text-sm text-gray-600">
              Upload a clear photo of your valid ID. Your account will be reviewed before you can sign in.
            </Text>
          </View>
          <Text className="text-gray-700 text-sm font-semibold mb-2">
            Upload Valid ID
          </Text>

          <TouchableOpacity
            onPress={pickImage}
            className="bg-gray-50 border border-gray-200 rounded-[10px] py-4 px-4 mb-4 flex-row items-center"
          >
            {validID ? (
              <View className="flex-row items-center flex-1">
                <MaterialCommunityIcons name="check-circle" size={23} color="#14532d" />
                <Text className="font-semibold ml-2 flex-1" style={{ color: "#14532d" }}>
                  ID image selected
                </Text>
                <Text className="text-gray-500 text-sm">Change</Text>
              </View>
            ) : (
              <>
                <MaterialCommunityIcons name="cloud-upload-outline" size={23} color="#14532d" />
                <Text className="text-gray-600 ml-2">Choose ID image</Text>
              </>
            )}
          </TouchableOpacity>

          {/* USER AGREEMENT */}
          <TouchableOpacity
            onPress={() => setAgreed(!agreed)}
            activeOpacity={0.8}
            className="flex-row items-start mt-1 mb-2"
          >
            <View
              className={`w-5 h-5 rounded border items-center justify-center mr-2 mt-0.5 ${
                agreed
                  ? "bg-[#14532d] border-[#14532d]"
                  : "border-gray-300"
              }`}
            >
              {agreed ? (
                <AntDesign
                  name="check"
                  size={14}
                  color="white"
                />
              ) : null}
            </View>

            <Text className="text-gray-600 text-xs flex-1">
              I have read and agree to the{" "}
              <Text
                className="font-semibold underline"
                style={{ color: "#14532d" }}
                onPress={() =>
                  setShowAgreement(true)
                }
              >
                User Agreement and Privacy Policy
              </Text>
              .
            </Text>
          </TouchableOpacity>
          </>
          )}
        </View>

        <View className="pt-3">
          <View className="flex-row">
            {step > 1 && (
              <TouchableOpacity
                onPress={() => setStep((currentStep) => currentStep - 1)}
                className="flex-1 items-center justify-center rounded-[5px] py-3.5 mr-3 border border-gray-300"
                activeOpacity={0.85}
              >
                <Text className="font-semibold" style={{ color: "#14532d" }}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              disabled={loading || checkingEmail}
              onPress={
                step === 1
                  ? nextStep
                  : step === 2
                    ? startEmailVerification
                    : step === 3
                      ? handleSubmit
                      : checkEmailVerification
              }
              className="flex-1 items-center justify-center rounded-[5px] py-3.5"
              style={{ backgroundColor: "#14532d" }}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center font-bold">
                  {step === 1 ? "Continue" : step === 2 ? "Continue" : step === 3 ? "Submit registration" : checkingEmail ? "Checking..." : "I’ve verified my email"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text className="text-center text-gray-500 mt-6">
            Already have an account?{" "}
            <Text
              className="font-semibold"
              style={{ color: "#14532d" }}
              onPress={() =>
                router.push("/auth/login")
              }
            >
              Sign in
            </Text>
          </Text>
        </View>
      </View>

      <Modal
        visible={dialog !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[10px] p-6 items-center">
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-4"
              style={{
                backgroundColor: /rejected|banned/i.test(dialog?.title ?? "")
                  ? "#fef2f2"
                  : /pending/i.test(dialog?.title ?? "")
                    ? "#fef3c7"
                    : "#f0fdf4",
              }}
            >
              <MaterialCommunityIcons
                name={
                  /rejected|banned/i.test(dialog?.title ?? "")
                    ? "alert-circle-outline"
                    : /pending/i.test(dialog?.title ?? "")
                      ? "clock-outline"
                      : "check-circle-outline"
                }
                size={30}
                color={
                  /rejected|banned/i.test(dialog?.title ?? "")
                    ? "#dc2626"
                    : /pending/i.test(dialog?.title ?? "")
                      ? "#d97706"
                      : "#14532d"
                }
              />
            </View>
            <Text className="text-gray-900 text-lg font-bold mb-2 text-center">{dialog?.title}</Text>
            <Text className="text-gray-600 text-sm leading-5 text-center">{dialog?.message}</Text>
            <TouchableOpacity
              onPress={async () => {
                const success = dialog?.success;
                setDialog(null);
                if (success) {
                  try { await signOut(auth); } catch {}
                  router.replace("/auth/login");
                }
              }}
              activeOpacity={0.85}
              className="items-center justify-center py-3 rounded-[10px] mt-5 w-full"
              style={{
                backgroundColor: /rejected|banned/i.test(dialog?.title ?? "")
                  ? "#dc2626"
                  : "#14532d",
              }}
            >
              <Text className="text-white font-semibold">{dialog?.success ? "Continue to sign in" : "Got it"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* USER AGREEMENT MODAL */}
      <Modal
        visible={showAgreement}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() =>
          setShowAgreement(false)
        }
      >
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-[10px] p-6 max-h-[80%]">
            <Text className="text-lg font-bold mb-3" style={{ color: "#14532d" }}>
              User Agreement and Privacy Policy
            </Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-gray-700 text-xs mb-2">
                1. Account Registration{"\n"}
                You must provide true and complete information during
                registration. One account per person only.
              </Text>

              <Text className="text-gray-700 text-xs mb-2">
                2. Identity Verification{"\n"}
                A valid government-issued ID is required. Your account
                stays pending and you cannot log in until an admin
                verifies and approves your registration.
              </Text>

              <Text className="text-gray-700 text-xs mb-2">
                3. Data Privacy & Your Security{"\n"}
                Your trust matters to us. Your name, contact details, and
                valid ID are collected solely to verify your identity and
                keep all transactions safe. Your information is kept
                confidential, stored securely, and will never be 
                shared, in line with the Data Privacy
                Act of 2012 (RA 10173).
              </Text>

              <Text className="text-gray-700 text-xs mb-2">
                4. Proper Use{"\n"}
                You agree to use FarmGate Direct only for lawful buying
                and selling. Fraud, fake listings, or misuse may lead to
                suspension or banning of your account.
              </Text>

              <Text className="text-gray-700 text-xs mb-4">
                5. Approval Decision{"\n"}
                The admin may approve or reject any registration. Rejected
                applicants will be notified and cannot log in.
              </Text>
            </ScrollView>

            <TouchableOpacity
              onPress={() =>
                setShowAgreement(false)
              }
              className="py-3 rounded-[10px] mt-4"
              style={{ backgroundColor: "#14532d" }}
            >
              <Text className="text-white text-center font-bold">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
  );
};

export default RegisterBuyer;