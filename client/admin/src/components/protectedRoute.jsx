import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../FirebaseConfig";

// Page guard only. Firestore rules still do the real check.
const ProtectedRoute = () => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        if (active) {
          setAuthorized(false);
          setLoading(false);
        }
        return;
      }
      try {
        const adminSnap = await getDoc(doc(db, "admins", currentUser.uid));
        const admin = adminSnap.exists() ? adminSnap.data() : null;
        if (!admin || admin.status !== "Active") {
          await signOut(auth);
          if (active) setAuthorized(false);
        } else if (active) {
          setAuthorized(true);
        }
      } catch {
        if (active) setAuthorized(false);
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-3"
        style={{ backgroundColor: "#F6F6F6" }}
      >
        <div className="w-6 h-6 rounded-full border-2 border-[#14532d] border-t-transparent animate-spin" />
        <p className="text-sm font-semibold" style={{ color: "#14532d" }}>
          Loading dashboard...
        </p>
      </div>
    );
  }

  return authorized ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
