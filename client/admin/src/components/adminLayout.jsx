import { useState } from "react";
import { FaBars } from "react-icons/fa";
import { Outlet } from "react-router-dom";
import Sidebar from "./sidebar";
import logo from "../assets/images/farmgate-logo.png";

const AdminLayout = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex" style={{ backgroundColor: "#F6F6F6" }}>
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <div className="flex-1 min-w-0 lg:ml-64">
        {/* ── Mobile header ala Header_Buyer (green rounded-b-2xl) ── */}
        <div
          className="lg:hidden sticky top-0 z-20 px-4 py-3 rounded-b-2xl mb-1 shadow-sm"
          style={{ backgroundColor: "#14532d" }}
        >
          <div className="flex flex-row items-center gap-2.5">
            <button
              onClick={() => setIsOpen(true)}
              className="w-10 h-10 shrink-0 flex items-center justify-center text-white rounded-[10px] hover:bg-white/10 active:bg-white/15 transition"
              aria-label="Open menu"
            >
              <FaBars size={18} />
            </button>
            <img
              src={logo}
              alt="FarmGate logo"
              className="w-8 h-8 shrink-0 object-contain"
            />
            <p className="flex-1 m-0 text-white font-bold text-[17px] leading-none tracking-wide">
              FarmGate Direct
            </p>
          </div>
        </div>
        <main className="flex-1 w-full min-w-0 overflow-x-clip px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
