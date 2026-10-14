// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA_3_BKzXysh7XBPGnqGpJtf3KXAGBEhno",
  authDomain: "farmgate-new.firebaseapp.com",
  projectId: "farmgate-new",
  storageBucket: "farmgate-new.firebasestorage.app",
  messagingSenderId: "493241053567",
  appId: "1:493241053567:web:4052283b82a71fffed6a4a"
};

// Initialize Firebase (guard against Fast Refresh double-init)
export const app =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = (() => {
  try {
    // Persist session sa AsyncStorage para hindi mawala ang
    // registration session pag ni-restart / inalis ang app.
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Kapag na-init na (Fast Refresh), gamitin ang existing instance.
    return getAuth(app);
  }
})();

export const db = getFirestore(app);

export const storage = getStorage(app);
