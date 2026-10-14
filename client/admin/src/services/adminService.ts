import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../FirebaseConfig";

const MAX_NAME_LENGTH = 100;

const assertUid = (uid: string) => {
  if (typeof uid !== "string" || uid.length === 0 || uid.length > 128) {
    throw new Error("Invalid admin id.");
  }
};

const assertName = (name: string) => {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Full name cannot be empty.");
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    throw new Error("Full name is too long.");
  }
};

export const getCurrentAdmin = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No authenticated user");
  }
  const adminRef = doc(db, "admins", user.uid);
  const snapshot = await getDoc(adminRef);
  if (!snapshot.exists()) {
    throw new Error("Admin not found");
  }
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

export const updateLastLogin = async (uid: string) => {
  assertUid(uid);
  await updateDoc(doc(db, "admins", uid), {
    lastLogin: serverTimestamp(),
  });
};

// Only name can be changed here.
export const updateAdminProfile = async (uid: string, name: string) => {
  assertUid(uid);
  assertName(name);
  await updateDoc(doc(db, "admins", uid), { name: name.trim() });
};
