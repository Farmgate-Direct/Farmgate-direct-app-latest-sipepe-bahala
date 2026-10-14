import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sileo } from "sileo";
import { FiEye, FiEyeOff, FiMail, FiLock } from "react-icons/fi";
import logo from "../assets/images/farmgate-logo.png";
import { loginAdmin } from "../services/authService";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@farmgatedirect.com");
  const [password, setPassword] = useState("farmgate.direct@10192026!");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await loginAdmin(email.trim(), password);
      sileo.success({
        title: "Login successful!",
        description: "Welcome to FarmGate Direct Admin.",
        fill: "#14532d",
        styles: {
          title: "text-white!",
          description: "text-white!",
          badge: "bg-white! text-[#14532d]!",
        },
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      let message = "Invalid email or password.";
      if (error.message === "Unauthorized") {
        message = "Administrator account not found.";
      } else if (
        error.message === "Your administrator account has been deactivated."
      ) {
        message = "Your administrator account has been deactivated.";
      } else if (typeof error.message === "string" && error.message.startsWith("Too many attempts")) {
        message = error.message;
      }
      sileo.error({
        title: "Login failed!",
        description: message,
        fill: "#DC2626",
        styles: {
          title: "text-white!",
          description: "text-white!",
          badge: "bg-white! text-[#DC2626]!",
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 sm:px-6 py-8">
      <div className="w-full max-w-5xl bg-white rounded-3xl sm:rounded-4xl overflow-hidden shadow-xl grid md:grid-cols-2">
        <div className="bg-[#14532D] flex flex-row md:flex-col items-center justify-center gap-4 md:gap-0 p-6 sm:p-8 md:p-12 text-white">
          <img
            src={logo}
            alt="FarmGate Logo"
            className="w-14 h-14 sm:w-20 sm:h-20 md:w-28 md:h-28 md:mb-6"
          />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-wide uppercase text-center">
            FarmGate Direct
          </h1>
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8 md:p-12">
          <h2 className="text-gray-900 text-2xl font-bold">Welcome back</h2>
          <p className="text-gray-500 text-sm mt-2 mb-7">
            Sign in to continue to your account.
          </p>
          <form onSubmit={handleLogin}>
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Email
            </label>
            <div className="flex flex-row items-center bg-white border border-gray-200 rounded-[10px] px-3 mb-5 focus-within:border-[#14532d] transition">
              <FiMail size={20} color="#14532d" className="shrink-0" />
              <input
                type="email"
                placeholder="Enter your email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 py-3 px-3 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent min-w-0"
              />
            </div>
            <label className="block text-gray-700 text-sm font-semibold mb-2">
              Password
            </label>
            <div className="flex flex-row items-center bg-white border border-gray-200 rounded-[10px] px-3 mb-7 focus-within:border-[#14532d] transition">
              <FiLock size={20} color="#14532d" className="shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 py-3 px-3 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent min-w-0"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-gray-400 hover:text-[#14532d] transition cursor-pointer shrink-0"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <FiEyeOff className="w-5 h-5" />
                ) : (
                  <FiEye className="w-5 h-5" />
                )}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center rounded-[10px] py-3.5 text-white font-bold text-base transition cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#14532d" }}
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                "Sign in"
              )}
            </button>
          </form>
          <div className="mt-8 text-center text-xs text-gray-400">
            © 2026 FarmGate Direct Admin
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
