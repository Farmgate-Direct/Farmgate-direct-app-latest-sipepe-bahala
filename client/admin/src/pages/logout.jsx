import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sileo } from "sileo";
import { logoutAdmin } from "../services/authService";

const LogoutModal = ({ closeModal }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setLoading(true);
      await logoutAdmin();
      closeModal();
      sileo.success({
        title: "Logout successful!",
        description: "You have been logged out.",
        fill: "#14532d",
        styles: {
          title: "text-white!",
          description: "text-white!",
          badge: "bg-white! text-[#14532d]!",
        },
      });
      navigate("/login", { replace: true });
    } catch {
      sileo.error({
        title: "Logout failed",
        description: "Could not log you out. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={closeModal}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-sm rounded-[10px] shadow-2xl p-6 animate-[fadeIn_0.15s_ease-out]"
      >
        <h2 className="text-lg font-bold text-gray-900 text-center">Logout Account?</h2>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed text-center">
          Are you sure you want to logout from your admin account?
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={closeModal}
            disabled={loading}
            className="flex-1 min-h-[50px] bg-white border border-gray-300 text-[#14532d] font-semibold rounded-[5px] px-4 py-3.5 text-sm hover:bg-[#F6F6F6] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="flex-1 min-h-[50px] bg-[#dc2626] hover:opacity-90 text-white font-bold rounded-[5px] px-4 py-3.5 text-sm transition disabled:opacity-60"
          >
            {loading ? "Logging out..." : "Yes, Logout"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal;
