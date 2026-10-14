import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  FaUserCheck,
  FaUsers,
  FaShoppingCart,
  FaUserCog,
  FaSignOutAlt,
  FaTimes,
  FaWallet,
} from "react-icons/fa";
import { TbLayoutDashboardFilled } from "react-icons/tb";
import { BiSolidReport } from "react-icons/bi";
import logo from "../assets/images/farmgate-logo.png";
import LogoutModal from "../pages/logout";

const Sidebar = ({ isOpen = false, onClose = () => {} }) => {
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    };
  }, [isOpen]);

  const menuClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-[10px] text-sm transition duration-200 active:opacity-85 ${
      isActive
        ? "bg-white text-[#14532d] font-bold shadow-sm"
        : "text-[#dcfce7] font-medium hover:bg-white/10 hover:text-white"
    }`;

  const closeDrawer = () => onClose();

  return (
    <>
      {isOpen && (
        <div
          onClick={closeDrawer}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden touch-none"
        />
      )}
      <div
        className={`fixed left-0 top-0 h-dvh w-56 sm:w-60 lg:w-64 text-white flex flex-col overflow-hidden shadow-sm z-40 transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        style={{ backgroundColor: "#14532d" }}
      >
        <div className="relative px-5 pt-8 pb-6 border-b border-white/10 shrink-0">
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="FarmGate Logo" className="w-16 h-16 object-contain mb-1" />
            <h1 className="text-lg font-bold tracking-wide text-center text-white leading-tight">
              FARMGATE DIRECT
            </h1>
            <p className="text-green-100 text-[11px] text-center leading-snug">
              From the hands of farmers to the homes of buyers.
            </p>
          </div>
          <button
            onClick={closeDrawer}
            className="lg:hidden absolute top-4 right-4 p-2 text-white/80 hover:text-white transition"
            aria-label="Close menu"
          >
            <FaTimes size={18} />
          </button>
        </div>
        <div className="flex-1 px-4 py-5 flex flex-col gap-1.5 overflow-y-auto">
          <p className="px-2 mb-1 text-[11px] font-semibold tracking-[1.5px] text-green-100/60 uppercase">
            Menu
          </p>
          <NavLink to="/dashboard" className={menuClass} onClick={closeDrawer}>
            <TbLayoutDashboardFilled size={19} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/approvals" className={menuClass} onClick={closeDrawer}>
            <FaUserCheck size={19} />
            <span>Approvals</span>
          </NavLink>
          <NavLink to="/users" className={menuClass} onClick={closeDrawer}>
            <FaUsers size={19} />
            <span>Users</span>
          </NavLink>
          <NavLink to="/orders" className={menuClass} onClick={closeDrawer}>
            <FaShoppingCart size={19} />
            <span>Orders</span>
          </NavLink>
          <NavLink to="/reports" className={menuClass} onClick={closeDrawer}>
            <BiSolidReport size={20} />
            <span>Reports</span>
          </NavLink>
          <NavLink to="/wallet" className={menuClass} onClick={closeDrawer}>
            <FaWallet size={19} />
            <span>Wallet</span>
          </NavLink>
          <div className="border-t border-white/10 my-2"></div>
          <p className="px-2 mb-1 text-[11px] font-semibold tracking-[1.5px] text-green-100/60 uppercase">
            Account
          </p>
          <NavLink to="/profile" className={menuClass} onClick={closeDrawer}>
            <FaUserCog size={19} />
            <span>Profile</span>
          </NavLink>
        </div>
        <div className="p-4 border-t border-white/10 shrink-0">
          <button
            onClick={() => setShowLogout(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-[5px] bg-[#dc2626] hover:opacity-90 active:opacity-85 transition text-sm font-bold text-white"
          >
            <FaSignOutAlt size={18} />
            <span>Logout</span>
          </button>
        </div>
      </div>
      {showLogout && <LogoutModal closeModal={() => setShowLogout(false)} />}
    </>
  );
};

export default Sidebar;
