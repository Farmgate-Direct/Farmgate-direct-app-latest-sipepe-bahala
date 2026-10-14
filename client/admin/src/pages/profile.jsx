import { useEffect, useState } from "react";
import { FaUser, FaUserCog } from "react-icons/fa";
import {
  FiX,
  FiLogIn,
  FiLogOut,
  FiUserCheck,
  FiUserX,
  FiUserPlus,
  FiActivity,
  FiLock,
  FiDownload,
  FiEdit,
} from "react-icons/fi";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../FirebaseConfig";
import { getCurrentAdmin, updateAdminProfile } from "../services/adminService";
import { getRegisteredUsers } from "../services/registeredUserService";
import {
  getRecentAdminActivities,
  logAdminActivity,
} from "../services/adminActivityService";
import { toastSuccess, toastError } from "../utils/toast";

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const toMillis = (ts) => {
  if (!ts) return 0;
  try {
    if (ts.toDate) return ts.toDate().getTime();
  } catch {
    return 0;
  }
  const parsed = new Date(ts).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatDateTime = (ts) => {
  if (!ts) return "—";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const formatRelative = (ts) => {
  const millis = toMillis(ts);
  if (!millis) return "—";
  const diff = Date.now() - millis;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return "Yesterday";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const ACTION_TITLE = {
  login: "Logged in",
  logout: "Logged out",
  approve_registration: "Approved registration",
  decline_registration: "Declined registration",
  ban_user: "Banned user",
  unban_user: "Unbanned user",
  create_admin: "Created admin",
  update_profile_name: "Updated profile name",
  update_password: "Changed password",
  export_report: "Downloaded report",
  update_payout_account: "Updated payout account",
  admin_withdraw: "Submitted withdrawal",
};

const ActivityTimeline = ({ items, currentAdminId }) => (
  <ul>
    {items.map((item, idx) => {
      const style = ACTIVITY_STYLE[item.type] || {
        icon: <FiActivity size={14} />,
        bg: "bg-[#F6F6F6] text-gray-600",
      };
      const isLast = idx === items.length - 1;
      const isYou = currentAdminId && item.actorId === currentAdminId;
      return (
        <li key={item.key} className="relative flex gap-3">
          <div className="flex flex-col items-center shrink-0 self-stretch">
            <div
              className={`w-9 h-9 rounded-[10px] flex items-center justify-center ring-4 ring-white shrink-0 ${style.bg}`}
            >
              {style.icon}
            </div>
            {!isLast && <span className="w-px flex-1 bg-gray-100" />}
          </div>
          <div className={`min-w-0 flex-1 ${isLast ? "pb-1" : "pb-4"}`}>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {item.title}
              </p>
              {isYou && (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#14532d] text-white">
                  You
                </span>
              )}
              <span
                className="ml-auto shrink-0 text-[11px] text-gray-400"
                title={formatDateTime(item.time)}
              >
                {formatRelative(item.time)}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate mt-px">
              {item.actor}
              {item.desc ? ` — ${item.desc}` : ""}
              {" • "}
              {formatDateTime(item.time)}
            </p>
          </div>
        </li>
      );
    })}
  </ul>
);

const ACTIVITY_STYLE = {
  login: { icon: <FiLogIn size={14} />, bg: "bg-[#eff6ff] text-[#2563EB]" },
  logout: { icon: <FiLogOut size={14} />, bg: "bg-[#F6F6F6] text-gray-600" },
  approve_registration: { icon: <FiUserCheck size={14} />, bg: "bg-[#DCFCE7] text-[#14532d]" },
  decline_registration: { icon: <FiUserX size={14} />, bg: "bg-[#fef3c7] text-[#D97706]" },
  ban_user: { icon: <FiUserX size={14} />, bg: "bg-[#FDE8E8] text-[#DC2626]" },
  unban_user: { icon: <FiUserCheck size={14} />, bg: "bg-[#DCFCE7] text-[#14532d]" },
  create_admin: { icon: <FiUserPlus size={14} />, bg: "bg-[#DCFCE7] text-[#14532d]" },
  update_profile_name: { icon: <FiEdit size={14} />, bg: "bg-[#eff6ff] text-[#2563EB]" },
  update_password: { icon: <FiLock size={14} />, bg: "bg-[#fef3c7] text-[#D97706]" },
  export_report: { icon: <FiDownload size={14} />, bg: "bg-[#eff6ff] text-[#2563EB]" },
  update_payout_account: { icon: <FiEdit size={14} />, bg: "bg-[#eff6ff] text-[#2563EB]" },
  admin_withdraw: { icon: <FiDownload size={14} />, bg: "bg-[#DCFCE7] text-[#14532d]" },
  // Old accounts without activity logs.
  admin_created: { icon: <FiUserPlus size={14} />, bg: "bg-[#DCFCE7] text-[#14532d]" },
  approved: { icon: <FiUserCheck size={14} />, bg: "bg-[#DCFCE7] text-[#14532d]" },
  banned: { icon: <FiUserX size={14} />, bg: "bg-[#FDE8E8] text-[#DC2626]" },
};

const Profile = () => {
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [showAllActivityModal, setShowAllActivityModal] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const loadActivity = async (adminsData) => {
    try {
      setActivitiesLoading(true);
      const logs = await getRecentAdminActivities(15);
      if (logs.length > 0) {
        setActivities(
          logs.map((log) => ({
            key: log.id,
            type: log.action,
            title: ACTION_TITLE[log.action] || "Activity",
            actor: log.adminName || "Administrator",
            actorId: log.adminId || null,
            desc: log.description || "",
            millis: toMillis(log.createdAt),
            time: log.createdAt,
          })),
        );
        return;
      }
      const users = await getRegisteredUsers();
      const events = [];

      (adminsData || []).forEach((admin) => {
        if (admin.lastLogin && toMillis(admin.lastLogin) > 0) {
          events.push({
            key: `login-${admin.id}`,
            type: "login",
            title: "Login",
            actor: admin.name || admin.email || "Administrator",
            desc: "Logged in to the admin panel",
            millis: toMillis(admin.lastLogin),
            time: admin.lastLogin,
          });
        }
        if (admin.createdAt && toMillis(admin.createdAt) > 0) {
          events.push({
            key: `created-${admin.id}`,
            type: "admin_created",
            title: "Administrator added",
            actor: admin.name || admin.email || "Administrator",
            desc: `Joined as ${admin.role || "admin"}`,
            millis: toMillis(admin.createdAt),
            time: admin.createdAt,
          });
        }
      });

      (users || []).forEach((user) => {
        const name = user.fullName || user.name || user.email || "User";
        if (user.approvedAt && toMillis(user.approvedAt) > 0) {
          events.push({
            key: `approved-${user.id}`,
            type: "approved",
            title: "Approved registration",
            actor: name,
            desc: `Approved as ${user.role || "user"}`,
            millis: toMillis(user.approvedAt),
            time: user.approvedAt,
          });
        } else if (
          user.status === "banned" &&
          user.updatedAt &&
          toMillis(user.updatedAt) > 0
        ) {
          events.push({
            key: `banned-${user.id}`,
            type: "banned",
            title: "Banned user",
            actor: name,
            desc: "Account access revoked",
            millis: toMillis(user.updatedAt),
            time: user.updatedAt,
          });
        } else if (
          user.status === "approved" &&
          user.updatedAt &&
          toMillis(user.updatedAt) > 0 &&
          !user.approvedAt
        ) {
          events.push({
            key: `unbanned-${user.id}`,
            type: "approved",
            title: "Unbanned user",
            actor: name,
            desc: "Account access restored",
            millis: toMillis(user.updatedAt),
            time: user.updatedAt,
          });
        }
      });

      events.sort((a, b) => b.millis - a.millis);
      setActivities(events.slice(0, 15));
    } catch {
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  const loadAdmins = async () => {
    try {
      const current = await getCurrentAdmin();
      setCurrentAdmin(current);
      setProfileName(current?.name || "");
      loadActivity(current ? [current] : []);
    } catch {
      setActivitiesLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleSaveProfile = async () => {
    if (!currentAdmin) return;
    const trimmed = profileName.trim();
    if (!trimmed) {
      toastError("Update failed", "Full name cannot be empty.");
      return;
    }
    if (trimmed.length > 100) {
      toastError("Update failed", "Full name is too long.");
      return;
    }
    try {
      setSavingProfile(true);
      await updateAdminProfile(currentAdmin.id, trimmed);
      setCurrentAdmin((prev) => ({ ...prev, name: trimmed }));
      logAdminActivity("update_profile_name", `Changed profile name to ${trimmed}`);
      toastSuccess("Profile updated", "Your full name has been saved.");
    } catch {
      toastError("Update failed", "Could not save your profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toastError("Update failed", "Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 6) {
      toastError("Update failed", "New password must be at least 6 characters.");
      return;
    }
    if (newPassword.length > 128) {
      toastError("Update failed", "New password is too long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError("Update failed", "New passwords do not match.");
      return;
    }
    const user = auth.currentUser;
    if (!user || !user.email) {
      toastError("Update failed", "No authenticated user. Please log in again.");
      return;
    }
    try {
      setPwSaving(true);
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      logAdminActivity("update_password", "Changed account password");
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toastSuccess("Password updated", "Your password has been changed.");
    } catch {
      toastError("Update failed", "Could not update your password. Please try again.");
    } finally {
      setPwSaving(false);
    }
  };

  const roleStyle = () => "bg-[#DCFCE7] text-[#14532d]";

  const statusStyle = (status) =>
    status === "Active"
      ? "bg-[#DCFCE7] text-[#14532d]"
      : "bg-[#F6F6F6] text-gray-700";

  if (loading) {
    return (
      <>
        <div className="mb-5 sm:mb-6 lg:mb-8">
          <SkeletonLine className="h-7 w-48" />
          <SkeletonLine className="h-4 w-72 mt-2" />
        </div>
        <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 min-w-0">
            {[0, 1].map((i) => (
              <div key={i} className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 space-y-4 min-w-0">
                <SkeletonLine className="h-5 w-40" />
                <SkeletonLine className="h-11 w-full rounded-[5px]" />
                <SkeletonLine className="h-11 w-full rounded-[5px]" />
                <SkeletonLine className="h-11 w-32 rounded-[5px]" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 space-y-4 min-w-0">
            <SkeletonLine className="h-5 w-56" />
            <SkeletonLine className="h-11 w-full rounded-[5px]" />
            <SkeletonLine className="h-11 w-full rounded-[5px]" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-5 sm:mb-6 lg:mb-8 rounded-[10px] p-[18px] sm:p-6 lg:p-8 bg-[#14532d] flex justify-between items-center gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#bbf7d0] uppercase">
            Account
          </p>
          <h1 className="text-xl font-black text-white tracking-tight">
            Profile & Settings
          </h1>
          <p className="text-xs text-[#dcfce7] mt-1">Manage your account.</p>
        </div>
        <div className="w-16 h-16 rounded-full bg-white hidden sm:flex items-center justify-center shrink-0">
          <FaUserCog size={28} className="text-[#14532d]" />
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 min-w-0">
          <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 min-w-0">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-[10px] bg-[#DCFCE7] text-[#14532d] flex items-center justify-center shrink-0">
                <FaUser size={15} />
              </div>
              <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase">My Profile</h2>
            </div>

            <div className="flex items-center gap-3 bg-[#F6F6F6] rounded-[10px] p-4 mb-5">
              <div className="w-12 h-12 shrink-0 rounded-full bg-[#14532d] text-white flex items-center justify-center text-base font-bold">
                {currentAdmin?.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-gray-800 truncate">
                  {currentAdmin?.name || "—"}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {currentAdmin?.email || "—"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${roleStyle(currentAdmin?.role)}`}
                >
                  {currentAdmin?.role || "—"}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyle(currentAdmin?.status)}`}
                >
                  {currentAdmin?.status || "—"}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Full name"
                  maxLength={100}
                  className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#14532d] transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  readOnly
                  value={currentAdmin?.email || ""}
                  className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Role
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={currentAdmin?.role || ""}
                    className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-500 capitalize"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Status
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={currentAdmin?.status || ""}
                    className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Created
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={formatDateTime(currentAdmin?.createdAt)}
                    className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Last Login
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={formatDateTime(currentAdmin?.lastLogin)}
                    className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-500"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  onClick={() => {
                    setShowPasswordModal(true);
                  }}
                  className="flex-1 min-h-[50px] bg-white border border-gray-300 hover:bg-[#F6F6F6] text-[#14532d] px-6 py-3.5 rounded-[5px] text-sm font-semibold transition"
                >
                  Change Password
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="flex-1 min-h-[50px] bg-[#14532d] hover:opacity-90 text-white px-6 py-3.5 rounded-[5px] text-sm font-bold transition disabled:opacity-60"
                >
                  {savingProfile ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 min-w-0 flex flex-col">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-[10px] bg-[#DCFCE7] text-[#14532d] flex items-center justify-center shrink-0">
                <FiActivity size={15} />
              </div>
              <div className="min-w-0">
                <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase truncate leading-tight">
                  Recent Admin Activity
                </h2>
                <p className="text-xs text-gray-400 truncate">
                  {activitiesLoading
                    ? "Loading activity…"
                    : activities.length > 0
                      ? "Latest actions across admins"
                      : "No activity yet"}
                </p>
              </div>
              {!activitiesLoading && activities.length > 0 && (
                <span className="ml-auto shrink-0 flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#14532d]">
                  {activities.length}
                </span>
              )}
            </div>
            {activitiesLoading ? (
              <div className="space-y-4 pt-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonLine className="w-9 h-9 rounded-[10px] shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonLine className="h-3.5 w-3/4" />
                      <SkeletonLine className="h-2.5 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length > 0 ? (
              <>
                <ActivityTimeline
                  items={activities.slice(0, 10)}
                  currentAdminId={currentAdmin?.id}
                />
                {activities.length > 8 && (
                  <div className="mt-auto pt-3">
                    <button
                      onClick={() => setShowAllActivityModal(true)}
                      className="w-full min-h-10 rounded-[10px] bg-[#F6F6F6] hover:bg-[#f0fdf4] hover:text-[#14532d] text-xs font-semibold text-gray-600 transition"
                    >
                      View all {activities.length} activities
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="py-10 text-center">
                <div className="w-12 h-12 mx-auto rounded-[10px] bg-[#F6F6F6] text-gray-400 flex items-center justify-center mb-3">
                  <FiActivity size={18} />
                </div>
                <p className="text-sm text-gray-500 font-medium">
                  No recent admin activity yet.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Logins, bans, approvals and downloads will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAllActivityModal && (
        <div
          onClick={() => setShowAllActivityModal(false)}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-[10px] shadow-2xl overflow-hidden animate-[fadeIn_0.15s_ease-out] max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center gap-3 px-5 sm:px-6 py-4 bg-[#14532d] shrink-0">
              <div className="w-10 h-10 shrink-0 rounded-full bg-white/15 text-white flex items-center justify-center">
                <FiActivity size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#bbf7d0] uppercase">
                  Activity
                </p>
                <h3 className="font-bold text-white text-[15px] tracking-tight truncate">
                  All Admin Activity
                </h3>
                <p className="text-xs text-[#dcfce7] truncate mt-0.5">
                  {activities.length} recent action{activities.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setShowAllActivityModal(false)}
                className="shrink-0 text-white/80 hover:text-white hover:bg-white/10 rounded-[10px] p-2 transition"
                aria-label="Close"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
              <ActivityTimeline items={activities} currentAdminId={currentAdmin?.id} />
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div
          onClick={() => !pwSaving && setShowPasswordModal(false)}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-[10px] shadow-2xl overflow-hidden animate-[fadeIn_0.15s_ease-out]"
          >
            <div className="px-6 py-5 bg-[#14532d] text-white flex items-center gap-3">
              <div className="w-9 h-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center">
                <FiLock size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.2em] text-[#bbf7d0] uppercase">
                  Security
                </p>
                <h2 className="text-base font-bold tracking-tight flex-1">
                  Change Password
                </h2>
              </div>
              <button
                onClick={() => !pwSaving && setShowPasswordModal(false)}
                aria-label="Close"
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition"
              >
                <FiX size={18} />
              </button>
            </div>
            <div className="px-6 py-6 space-y-3">
              <input
                type="password"
                placeholder="Current password"
                autoComplete="current-password"
                maxLength={128}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#14532d] transition"
              />
              <input
                type="password"
                placeholder="New password"
                autoComplete="new-password"
                maxLength={128}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#14532d] transition"
              />
              <input
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white border border-gray-200 px-4 py-2.5 min-h-[50px] rounded-[5px] outline-none text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#14532d] transition"
              />
            </div>
            <div className="px-6 py-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                disabled={pwSaving}
                className="flex-1 min-h-[50px] bg-white border border-gray-300 hover:bg-[#F6F6F6] text-[#14532d] px-4 py-3.5 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordUpdate}
                disabled={pwSaving}
                className="flex-1 min-h-[50px] bg-[#14532d] hover:opacity-90 text-white px-4 py-3.5 rounded-[5px] text-sm font-bold transition disabled:opacity-60"
              >
                {pwSaving ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Profile;
