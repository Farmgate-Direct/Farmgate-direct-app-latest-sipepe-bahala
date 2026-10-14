import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  StatusBar,
  Image,
} from "react-native";

import * as ImagePicker
  from "expo-image-picker";

import { useRouter }
  from "expo-router";

import AntDesign
  from "@expo/vector-icons/AntDesign";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Dropdown }
  from "react-native-element-dropdown";

import {
  registerUser,
} from "../../src/services/authService";
import { auth } from "../../FirebaseConfig";
import { reload, signOut } from "firebase/auth";
import { doc, getDoc, getDocFromServer } from "firebase/firestore";
import { db } from "../../FirebaseConfig";
import { saveUserToFirestore } from "../../src/services/firestoreService";

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

import { resendVerificationByEmail, sendBrandedVerificationEmail } from "../../src/services/emailVerificationService";
import { checkEmailStatus } from "../../src/services/emailStatusService";

import {
  uploadValidIDAsync,
} from "../../src/services/cloudinaryValidIDService";

import {
  sanitizePhoneInput,
  toE164Phone,
  validateDetails,
  validatePasswords,
  validateFarm,
  getRegisterErrorMessage,
} from "../../utils/validators";
import { useToast } from "../../context/ToastContext";

import {
  BULACAN_PROVINCE,
  BULACAN_CITIES,
  barangaysForCity,
} from "../../constants/bulacanBarangays";

type InputProps = {
  label: string;
  value: string;
  setter: (value: string) => void;
  secure?: boolean;
  prefix?: string;
  maxLength?: number;
  placeholder?: string;
};

type UploadBoxProps = {
  label: string;
  value: string | null;
  setter: () => void;
};

const RegisterFarmer = () => {

  const router =
    useRouter();
  const { showToast } = useToast();

  const [step, setStep] =
    useState(1);

  const [loading, setLoading] =
    useState(false);

  // ================= STEP 1 =================
  const [fullName, setFullName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  // ================= STEP 2 =================
  const [farmName, setFarmName] =
    useState("");

  const [barangay, setBarangay] =
    useState("");

  const [
    municipality,
    setMunicipality,
  ] = useState("");

  const [province, setProvince] =
    useState("");

  const [validID, setValidID] =
    useState<string | null>(null);

  // ================= USER AGREEMENT =================
  const [agreed, setAgreed] =
    useState(false);

  const [showAgreement, setShowAgreement] =
    useState(false);

  const [dialog, setDialog] =
    useState<{ title: string; message: string; success?: boolean } | null>(null);

  const [checkingEmail, setCheckingEmail] =
    useState(false);

  // Cooldown para hindi mag-spam ng resend (bawat resend ay
  // nag-i-invalidate ng lumang link kaya nagiging "expired").
  const [cooldown, setCooldown] =
    useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Panlaban sa paulit-ulit na submit kapag palpak ang password —
  // 3 sunod na fail = 60s lock para hindi ma-rate-limit ng Firebase.
  const [failedSubmits, setFailedSubmits] =
    useState(0);
  const [submitLockedUntil, setSubmitLockedUntil] =
    useState(0);

  // Ref-based in-flight guard: ang `loading` state ay async, kaya ang
  // mabilisang double-tap ay nakakalusot sa `if (loading) return` at
  // nagiging 2x createUser + 2x sendEmailVerification = instant
  // auth/too-many-requests. Ang ref ay synchronous, kaya tunay na
  // isang request lang at a time. Walang UI na binabago.
  const submitBusyRef = useRef(false);

  // ================= LOCATION (Bulacan locked, local dataset) =================
  // Names match the backend dataset exactly (exact match only, no fuzzy).
  const [locationLoading] = useState(false);

  const cities = BULACAN_CITIES.map((name) => ({ name, code: name }));

  const [selectedRegion] = useState<any>({ name: "Central Luzon (Region III)" });

  const [selectedProvince] = useState<any>({ name: BULACAN_PROVINCE });

  const [
    selectedCity,
    setSelectedCity,
  ] = useState<any>(null);

  const [
    selectedBarangay,
    setSelectedBarangay,
  ] = useState<any>(null);

  const [cityFocus, setCityFocus] =
    useState(false);

  const [barangayFocus, setBarangayFocus] =
    useState(false);

  // Farm location comes from the City + Barangay dropdowns below
  // (delivery is priced from barangay centroids — no GPS).

  // Barangays depend on the selected city (local dataset, synchronous).
  const barangays = selectedCity
    ? barangaysForCity(selectedCity.name).map((name) => ({ name, code: name }))
    : [];

  // Province is locked to Bulacan.
  useEffect(() => {
    setProvince(BULACAN_PROVINCE);
  }, []);

  // ================= PICK IMAGE =================
  const pickImage = async (
    setter: React.Dispatch<
      React.SetStateAction<
        string | null
      >
    >
  ) => {

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
      });

    if (!result.canceled) {

      setter(
        result.assets[0].uri
      );

    }
  };

  // ================= NEXT STEP =================
  const nextStep = () => {
    const validationError = validateDetails({ fullName, email, phone });
    if (validationError) {
      showToast(validationError);
      return;
    }
    setStep(2);
  };

  // Step 2 -> Step 3: validate lang, WALANG Auth user na ginagawa dito.
  // Ang Auth user ay ginagawa lang sa final submit (Step 3 Farm form),
  // para walang orphan sa Authentication kapag hindi tinapos ang form.
  const goToFarmStep = () => {
    const validationError = validatePasswords({ password, confirmPassword });
    if (validationError) {
      showToast(validationError);
      return;
    }
    setStep(3);
  };

  const handleResendVerification = async () => {
    if (loading || submitBusyRef.current) return;
    if (cooldown > 0) {
      showToast(`Wait ${cooldown}s before requesting a new link. Use the latest email we sent.`);
      return;
    }
    const user = auth.currentUser;
    // Walang session (nag-close ng app) = resend gamit lang ang email,
    // walang password, sa backend.
    if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) {
      try {
        submitBusyRef.current = true;
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
        submitBusyRef.current = false;
        setLoading(false);
      }
      return;
    }
    try {
      submitBusyRef.current = true;
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
      submitBusyRef.current = false;
      setLoading(false);
    }
  };

  // Database (Firestore) + ID upload ay dito lang — PAGKATAPOS
  // ma-verify ang email. Walang nase-save hangga't hindi verified.
  const finalizeRegistration = async () => {
    // Siguraduhing buo pa rin ang form (baka nag-back at nagbura).
    const validationError =
      validateDetails({ fullName, email, phone }) ||
      validatePasswords({ password, confirmPassword }) ||
      validateFarm({ farmName, selectedCity, selectedBarangay });

    if (validationError) {
      showToast(validationError);
      setStep(3);
      throw { code: "local/validation" };
    }

    if (!validID) {
      showToast("Upload a clear photo of your valid ID.");
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

    // CLOUDINARY
    const validIDUrl =
      await uploadValidIDAsync(
        validID as string
      );

    // FIRESTORE (delivery is priced from city + barangay)
    await saveUserToFirestore(
      user.uid,
      {
        uid: user.uid,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: toE164Phone(phone),
        role: "farmer",
        status: "pending",
        farmName: farmName.trim(),
        region:
          selectedRegion?.name ||
          "Central Luzon",
        barangay: selectedBarangay?.name || barangay,
        municipality: selectedCity?.name || municipality,
        city: selectedCity?.name || municipality,
        province: BULACAN_PROVINCE,
        validID:
          validIDUrl,
        createdAt:
          new Date(),
      }
    );

    setDialog({
      title: "Account pending approval",
      message: "Your account is pending admin approval. You can sign in after it has been approved.",
      success: true,
    });
  };

  const checkEmailVerification = async () => {
    if (checkingEmail || submitBusyRef.current) return;
    const user = auth.currentUser;
    // Walang session (nag-close ng app) = i-check sa backend gamit
    // lang ang email. Kapag verified na, mag-sign in para tapusin.
    if (!user || user.email?.toLowerCase() !== email.trim().toLowerCase()) {
      try {
        submitBusyRef.current = true;
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
        submitBusyRef.current = false;
        setCheckingEmail(false);
      }
      return;
    }

    try {
      submitBusyRef.current = true;
      setCheckingEmail(true);
      await reload(user);
      if (!user.emailVerified) {
        showToast("Verify your email using the link we sent, then try again.");
        setCheckingEmail(false);
        submitBusyRef.current = false;
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
        submitBusyRef.current = false;
        setStep(1);
        return;
      }
      showToast("Could not check email verification. Please try again.");
      setCheckingEmail(false);
      submitBusyRef.current = false;
      return;
    }

    // Verified na — saka lang i-upload ang ID at i-save sa database.
    try {
      await finalizeRegistration();
    } catch (error: any) {
      if (error?.code === "local/validation") {
        submitBusyRef.current = false;
        return;
      }
      console.error("Finalize registration failed:", error);
      showToast(getRegisterErrorMessage(error?.code));
      // Bumalik sa Farm step para makapili muli ng ID kung kailangan.
      setStep(3);
    } finally {
      submitBusyRef.current = false;
      setCheckingEmail(false);
    }
  };

  // ================= PREVIOUS STEP =================
  const prevStep = () => {

    if (step > 1) {

      setStep(step - 1);

    }
  };

  // ================= REGISTER =================
  // Auth user ay ginagawa dito sa submit (kailangan para mag-send ng
  // verification), pero WALANG sine-save sa database hangga't hindi
  // verified ang email — ang save ay nasa finalizeRegistration.
  const handleRegister =
    async () => {

      // Double-tap guard: kapag "ang tagal" at pinindot ulit, bawat pindot
      // ay bagong createUser + sendEmailVerification = instant
      // auth/too-many-requests. Isang request lang at a time.
      // NOTE: ref ang tunay na guard (synchronous). Ang `loading` state ay
      // async kaya nakakalusot ang mabilisang double-tap.
      if (loading || checkingEmail || submitBusyRef.current) return;

      if (locationLoading) {

        showToast("Farm locations are still loading. Try again in a moment.");

        return;
      }

      const validationError =
        validateDetails({ fullName, email, phone }) ||
        validatePasswords({ password, confirmPassword }) ||
        validateFarm({ farmName, selectedCity, selectedBarangay });

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

      // City + Barangay are validated by validateFarm above (dropdowns only).

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

        submitBusyRef.current = true;
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
              submitBusyRef.current = false;
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
              submitBusyRef.current = false;
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
              submitBusyRef.current = false;
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
        // huwag nang mag-sign-in gamit ang password.
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

        // Kung verified na at may Firestore doc na, tapos na ang registration.
        // Huwag nang sabihing "Registration submitted" ulit — nakaka-confuse.
        // Ipakita na lang ang totoong status ng existing account (server read
        // para hindi lumang pending ang mabasa kahit approved na).
        const freshVerified = auth.currentUser?.emailVerified ?? user.emailVerified;
        if (freshVerified) {
          const existing = await getFreshUserDoc(user.uid);
          if (existing.exists()) {
            const existingStatus = normalizeStatus(existing.data()?.status) || "pending";
            // Rejected = tanggal na, pwede gumawa ulit — huwag harangan.
            if (existingStatus !== "rejected") {
              const existingDialog = dialogForExistingStatus(existingStatus);
              if (existingDialog) {
                submitBusyRef.current = false;
                setLoading(false);
                setFailedSubmits(0);
                setDialog(existingDialog);
                return;
              }
            }
          }
          submitBusyRef.current = false;
          setLoading(false);
          setCooldown(60);
          setFailedSubmits(0);
          setStep(4);
          showToast("Your email is already verified. Tap below to finish.");
          return;
        }

        // ---- SEND VERIFICATION (save sa database mamaya pag verified) ----
        await sendBrandedVerificationEmail(fullName.trim());
        submitBusyRef.current = false;
        setLoading(false);

        setCooldown(60);
        setFailedSubmits(0);
        setStep(4);
        showToast(`Verification link sent to ${email.trim()}. Verify first — nothing is saved until your email is verified.`);

      } catch (error: any) {

        submitBusyRef.current = false;
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
        if (
          code === "auth/invalid-email" ||
          code === "auth/invalid-credential"
        ) {
          setStep(1);
        }

        showToast(getRegisterErrorMessage(code));
      }
    };

  // ================= STEP INDICATOR =================
  const StepIndicator =
    () => (

      <View className="flex-row items-center justify-between">
        {[
          { label: "Details", icon: "account-outline" as const },
          { label: "Password", icon: "lock-outline" as const },
          { label: "Farm", icon: "tractor-variant" as const },
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
              <Text
                className="text-xs mt-1"
                style={{ color: active ? "#14532d" : "#9ca3af" }}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    );

  return (
    <View className="flex-1" style={{ backgroundColor: "#14532d" }}>
      <StatusBar barStyle="light-content" backgroundColor="#14532d" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

      {/* HEADER */}
      <View className="items-center justify-center px-6 py-32">

        <Image
          source={require("../../assets/Farmgate-logos/farmgate-logo.png")}
          className="w-20 h-20 mb-3"
          resizeMode="contain"
        />

        <Text className="text-white text-2xl font-bold tracking-wide">
          FARMGATE DIRECT
        </Text>

        <Text className="text-green-100 text-sm mt-2 text-center">Farmer registration</Text>

      </View>

      {/* WHITE CARD */}
      <View className="flex-1 bg-white rounded-t-[30px] px-5 pt-5 -mt-5" style={{ flexGrow: 1 }}>
        <View className="pt-5 mb-10">
          <StepIndicator />
        </View>

        {step === 1 ? (

          <View>

            <Input
              label="Full Name"
              value={fullName}
              setter={setFullName}
            />

            <Input
              label="Email"
              value={email}
              setter={setEmail}
            />

            <Input
              label="Phone No."
              value={phone}
              setter={(value) => setPhone(sanitizePhoneInput(value))}
              prefix="+63"
              maxLength={10}
              placeholder="9XX XXX XXXX"
            />

          </View>

        ) : step === 2 ? (
          <View>
            <Input
              label="Password"
              value={password}
              setter={setPassword}
              secure
            />

            <Input
              label="Confirm Password"
              value={confirmPassword}
              setter={setConfirmPassword}
              secure
            />

            <Text className="text-gray-500 text-xs -mt-2 mb-4">
              At least 8 characters, with letters and numbers.
            </Text>
          </View>
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
              <Text className="font-semibold" style={{ color: cooldown > 0 ? "#9ca3af" : "#14532d" }}>
                {cooldown > 0 ? `Resend verification link (${cooldown}s)` : "Resend verification link"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (

          <View>

            <Input
              label="Farm Name"
              value={farmName}
              setter={setFarmName}
            />

            {/* REGION (FIXED - same design as Add Address) */}
            <Text className="text-gray-700 text-sm font-semibold mb-2">
              Region
            </Text>

            <View
              className="justify-center rounded-[10px] px-4 mb-4"
              style={{
                backgroundColor: "#f9fafb",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                height: 56,
              }}
            >
              <Text className="text-gray-800 text-[15px] font-medium">
                {locationLoading
                  ? "Loading region..."
                  : selectedRegion?.name ||
                    "Central Luzon"}
              </Text>
            </View>

            {/* PROVINCE (FIXED - same design as Add Address) */}
            <Text className="text-gray-700 text-sm font-semibold mb-2">
              Province
            </Text>

            <View
              className="justify-center rounded-[10px] px-4 mb-4"
              style={{
                backgroundColor: "#f9fafb",
                borderWidth: 1,
                borderColor: "#e5e7eb",
                height: 56,
              }}
            >
              <Text className="text-gray-800 text-[15px] font-medium">
                {locationLoading
                  ? "Loading province..."
                  : selectedProvince?.name ||
                    "Bulacan"}
              </Text>
            </View>

            {/* CITY / MUNICIPALITY - same design as Add Address */}
            <Text className="text-gray-700 text-sm font-semibold mb-2">
              City / Municipality
            </Text>

            <Dropdown
              mode="modal"
              maxHeight={440}
              dropdownPosition="auto"
              keyboardAvoiding
              disable={
                !selectedProvince ||
                locationLoading
              }
              style={{
                backgroundColor: selectedCity ? "#ffffff" : "#f9fafb",
                borderRadius: 10,
                paddingHorizontal: 14,
                height: 56,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: cityFocus
                  ? "#14532d"
                  : selectedCity
                    ? "#14532d"
                    : "#e5e7eb",
                opacity:
                  selectedProvince &&
                  !locationLoading
                    ? 1
                    : 0.6,
                shadowColor: cityFocus ? "#14532d" : "transparent",
                shadowOpacity: cityFocus ? 0.12 : 0,
                shadowRadius: 8,
                elevation: cityFocus ? 3 : 0,
              }}
              containerStyle={{
                borderRadius: 10,
                backgroundColor: "#ffffff",
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
              }}
              placeholderStyle={{
                fontSize: 15,
                color: "#9CA3AF",
              }}
              selectedTextStyle={{
                fontSize: 15,
                color: "#111827",
                fontWeight: "500",
              }}
              inputSearchStyle={{
                height: 42,
                borderRadius: 8,
                backgroundColor: "#f9fafb",
                fontSize: 14,
                borderWidth: 0,
                paddingHorizontal: 12,
              }}
              itemContainerStyle={{
                borderRadius: 8,
                marginHorizontal: 6,
              }}
              itemTextStyle={{
                fontSize: 15,
                color: "#374151",
              }}
              data={cities}
              labelField="name"
              valueField="code"
              placeholder={
                locationLoading
                  ? "Loading Bulacan locations..."
                  : !cityFocus && !selectedCity
                    ? "Select City / Municipality"
                    : "..."
              }
              search
              searchPlaceholder="Search city or municipality..."
              value={
                selectedCity?.code
              }
              activeColor="#DCFCE7"
              onFocus={() => setCityFocus(true)}
              onBlur={() => setCityFocus(false)}
              renderItem={(item: any) => {
                const isSelected = item.code === selectedCity?.code;
                return (
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: isSelected ? "#DCFCE7" : "transparent",
                      borderRadius: 8,
                      marginHorizontal: 6,
                      marginVertical: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: isSelected ? "#14532d" : "#374151",
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {item.name}
                    </Text>
                  </View>
                );
              }}
              flatListProps={{
                ListEmptyComponent: (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
                      No cities found
                    </Text>
                  </View>
                ),
              }}
              onChange={(item) => {

                setSelectedCity(
                  item
                );

                setMunicipality(
                  item.name
                );

                setSelectedBarangay(
                  null
                );

                setBarangay("");

                setCityFocus(false);
              }}
            />

            {/* BARANGAY - same design as Add Address */}
            <Text className="text-gray-700 text-sm font-semibold mb-2">
              Barangay
            </Text>

            <Dropdown
              mode="modal"
              maxHeight={440}
              dropdownPosition="auto"
              keyboardAvoiding
              disable={
                !selectedCity
              }
              style={{
                backgroundColor: !selectedCity
                  ? "#f3f4f6"
                  : selectedBarangay
                    ? "#ffffff"
                    : "#f9fafb",
                borderRadius: 10,
                paddingHorizontal: 14,
                height: 56,
                marginBottom: 18,
                borderWidth: 1,
                borderColor: barangayFocus
                  ? "#14532d"
                  : selectedBarangay
                    ? "#14532d"
                    : "#e5e7eb",
                opacity:
                  selectedCity
                    ? 1
                    : 0.6,
                shadowColor: barangayFocus ? "#14532d" : "transparent",
                shadowOpacity: barangayFocus ? 0.12 : 0,
                shadowRadius: 8,
                elevation: barangayFocus ? 3 : 0,
              }}
              containerStyle={{
                borderRadius: 10,
                backgroundColor: "#ffffff",
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
              }}
              placeholderStyle={{
                fontSize: 15,
                color: "#9CA3AF",
              }}
              selectedTextStyle={{
                fontSize: 15,
                color: "#111827",
                fontWeight: "500",
              }}
              inputSearchStyle={{
                height: 42,
                borderRadius: 8,
                backgroundColor: "#f9fafb",
                fontSize: 14,
                borderWidth: 0,
                paddingHorizontal: 12,
              }}
              itemContainerStyle={{
                borderRadius: 8,
                marginHorizontal: 6,
              }}
              itemTextStyle={{
                fontSize: 15,
                color: "#374151",
              }}
              data={barangays}
              labelField="name"
              valueField="code"
              placeholder={
                !selectedCity
                  ? "Select a city first"
                  : !barangayFocus && !selectedBarangay
                    ? "Select Barangay"
                    : "..."
              }
              search
              searchPlaceholder="Search barangay..."
              value={
                selectedBarangay?.code
              }
              activeColor="#DCFCE7"
              onFocus={() => setBarangayFocus(true)}
              onBlur={() => setBarangayFocus(false)}
              renderItem={(item: any) => {
                const isSelected = item.code === selectedBarangay?.code;
                return (
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: isSelected ? "#DCFCE7" : "transparent",
                      borderRadius: 8,
                      marginHorizontal: 6,
                      marginVertical: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: isSelected ? "#14532d" : "#374151",
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {item.name}
                    </Text>
                  </View>
                );
              }}
              flatListProps={{
                ListEmptyComponent: (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
                      {!selectedCity ? "Select a city first" : "No barangays found"}
                    </Text>
                  </View>
                ),
              }}
              onChange={(item) => {

                setSelectedBarangay(
                  item
                );

                setBarangay(
                  item.name
                );

                setBarangayFocus(false);
              }}
            />

            <View className="flex-row items-start rounded-[10px] bg-green-50 p-3 mb-5">
              <MaterialCommunityIcons name="shield-check-outline" size={21} color="#14532d" />
              <Text className="flex-1 ml-2 text-sm text-gray-600">
                Upload a clear photo of your valid ID. Your account will be reviewed before you can sign in.
              </Text>
            </View>

            <UploadBox
              label="Valid ID"
              value={validID}
              setter={() =>
                pickImage(
                  setValidID
                )
              }
            />

            {/* USER AGREEMENT */}
            <TouchableOpacity
              onPress={() =>
                setAgreed(!agreed)
              }
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

          </View>

        )}

        {/* BUTTONS */}
        <View className="pt-3 w-full">

          <View className="flex-row">
            {step > 1 && (
              <TouchableOpacity
                onPress={prevStep}
                className="items-center justify-center border border-gray-300 py-3.5 rounded-[5px] flex-1 mr-3"
              >
                <Text className="text-center font-semibold" style={{ color: "#14532d" }}>
                  Back
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              disabled={loading || checkingEmail}
              onPress={step === 1 ? nextStep : step === 2 ? goToFarmStep : step === 3 ? handleRegister : checkEmailVerification}
              className="items-center justify-center py-3.5 rounded-[5px] flex-1"
              style={{ backgroundColor: "#14532d" }}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center font-bold">
                  {step === 1
                    ? "Continue"
                    : step === 2
                      ? "Continue"
                      : step === 3
                        ? "Submit registration"
                        : checkingEmail
                          ? "Checking..."
                          : "I’ve verified my email"}
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
                confidential, stored securely, and will never be sold or
                shared without your consent, in line with the Data Privacy
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

// ================= INPUT =================
const Input = ({
  label,
  value,
  setter,
  secure,
  prefix,
  maxLength,
  placeholder,
}: InputProps) => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <>
      <Text className="text-gray-700 text-sm font-semibold mb-2">
        {label}
      </Text>
      <View className="flex-row items-center bg-white border border-gray-200 rounded-[5px] px-1 mb-4" style={{ minHeight: 50 }}>
        {prefix && (
          <View className="px-4 self-stretch justify-center border-r border-gray-200">
            <Text className="text-gray-700 font-semibold">{prefix}</Text>
          </View>
        )}
        <TextInput
          key={`${label}-${secure && !passwordVisible ? "hidden" : "visible"}`}
          value={value}
          onChangeText={setter}
          secureTextEntry={Boolean(secure && !passwordVisible)}
          textContentType={secure ? "newPassword" : "none"}
          maxLength={maxLength}
          placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
          placeholderTextColor="#9ca3af"
          autoCapitalize={label === "Email" ? "none" : undefined}
          autoCorrect={label === "Email" ? false : undefined}
          keyboardType={
            label === "Email"
              ? "email-address"
              : label === "Phone No."
                ? "phone-pad"
                : "default"
          }
          className="flex-1 px-3 py-4 text-gray-800"
        />
        {secure && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
            onPress={() => setPasswordVisible((visible) => !visible)}
            className="px-3 py-2"
          >
            <MaterialCommunityIcons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={21}
              color="#6b7280"
            />
          </TouchableOpacity>
        )}
      </View>
    </>
  );
};

// ================= IMAGE UPLOAD =================
const UploadBox = ({
  label,
  value,
  setter,
}: UploadBoxProps) => (

  <>

    <Text className="text-gray-700 text-sm font-semibold mb-2">
      {label}
    </Text>

    <TouchableOpacity
      onPress={setter}
      className="bg-gray-50 border border-gray-200 rounded-[10px] py-4 px-4 mb-4 flex-row items-center"
    >

      {value ? (

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
          <Text className="text-gray-600 ml-2">Choose {label}</Text>
        </>
      )}

    </TouchableOpacity>

  </>
);

export default RegisterFarmer;