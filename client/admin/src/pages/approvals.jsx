import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { FaUserCheck } from "react-icons/fa";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";
import { FiCheck, FiX, FiSearch, FiUserCheck, FiUserX } from "react-icons/fi";
import {
  getPendingUsers,
  approveUser as approveUserService,
  rejectUser as rejectUserService,
} from "../services/userService";
import { logAdminActivity } from "../services/adminActivityService";
import { toastSuccess, toastError } from "../utils/toast";

const ITEMS_PER_PAGE = 5;

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const RowSkeleton = ({ cols = 4 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-3 pr-4">
        <SkeletonLine className="h-4 w-full max-w-24" />
      </td>
    ))}
  </tr>
);

const UserCardSkeleton = () => (
  <div className="bg-white border border-gray-100 rounded-[10px] p-4 space-y-3">
    <div className="flex items-center gap-3">
      <SkeletonLine className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="h-3 w-36" />
      </div>
    </div>
    <div className="flex justify-between items-center">
      <SkeletonLine className="h-5 w-16 rounded-full" />
      <SkeletonLine className="h-5 w-16 rounded-full" />
    </div>
  </div>
);

const RequestApproval = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [currentPage, setCurrentPage] = useState(1);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef(null);
  const tableRef = useRef(null);
  const [colWidths, setColWidths] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailTab, setDetailTab] = useState("information");
  const [previewFile, setPreviewFile] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(e.target)
      ) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getPendingUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load pending requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const fullName = user.fullName || "";
      const email = user.email || "";
      const role = user.role || "";
      const matchesSearch =
        fullName.toLowerCase().includes(search.toLowerCase()) ||
        email.toLowerCase().includes(search.toLowerCase());
      const matchesRole =
        roleFilter === "All Roles" ||
        role.toLowerCase() === roleFilter.toLowerCase();
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setColWidths(null);
  }, [search, roleFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / ITEMS_PER_PAGE),
  );

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  const displayUsers = useMemo(() => {
    const list = [...paginatedUsers];
    while (list.length < ITEMS_PER_PAGE) list.push(null);
    return list;
  }, [paginatedUsers]);

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  useEffect(() => {
    if (loading || currentPage !== 1 || paginatedUsers.length === 0) return;
    const table = tableRef.current;
    if (!table) return;
    const heads = table.querySelectorAll("thead th");
    if (heads.length === 0) return;
    const tableWidth = table.getBoundingClientRect().width;
    if (!tableWidth) return;
    setColWidths(
      Array.from(heads).map(
        (th) => `${(th.getBoundingClientRect().width / tableWidth) * 100}%`,
      ),
    );
  }, [loading, currentPage, paginatedUsers]);

  const formatDate = (createdAt) => {
    if (!createdAt) return "N/A";
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const removeUserFromList = (uid) => {
    setUsers((prev) => prev.filter((u) => u.id !== uid));
  };

  const openApproveModal = (user) =>
    setActionTarget({ user, action: "approve" });
  const openRejectModal = (user) =>
    setActionTarget({ user, action: "reject" });
  const closeActionModal = () => {
    if (actionLoading) return;
    setActionTarget(null);
  };

  const confirmAction = async () => {
    if (!actionTarget) return;
    const { user, action } = actionTarget;
    try {
      setActionLoading(true);
      if (action === "approve") {
        await approveUserService(user.id);
      } else {
        await rejectUserService(user.id);
      }
      const targetName = user.fullName || user.email || "User";
      logAdminActivity(
        action === "approve" ? "approve_registration" : "decline_registration",
        action === "approve"
          ? `Approved registration of ${targetName}`
          : `Declined registration of ${targetName}`,
        { targetId: user.id, targetName },
      );
      toastSuccess(
        action === "approve" ? "Registration approved" : "Registration declined",
        action === "approve"
          ? `${targetName} can now access the platform.`
          : `The request from ${targetName} was declined.`,
      );
      removeUserFromList(user.id);
      setActionTarget(null);
      if (selectedUser?.id === user.id) {
        setSelectedUser(null);
        setDetailTab("information");
      }
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
      const detail = error?.message ? ` ${error.message}` : "";
      toastError("Action failed", `Could not ${action} this request.${detail} Please try again.`);
    } finally {
      setActionLoading(false);
    }
  };

  const openDetail = (user) => {
    setSelectedUser(user);
    setDetailTab("information");
  };

  const roleStyle = (role) =>
    role?.toLowerCase() === "farmer"
      ? "bg-[#DCFCE7] text-[#14532d]"
      : "bg-[#eff6ff] text-[#2563EB]";

  return (
    <>
      <div
        className="rounded-[10px] p-[18px] sm:p-6 lg:p-8 flex justify-between items-center mb-5 sm:mb-6 lg:mb-8"
        style={{ backgroundColor: "#14532d" }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-[#bbf7d0] uppercase">
            Approvals
          </p>
          <h1 className="text-xl font-black text-white mt-2">
            Pending Approvals
          </h1>
          <p className="text-xs text-[#dcfce7] mt-1">
            Review and approve new buyer and farmer registrations.
          </p>
        </div>
        <div className="hidden sm:flex w-16 h-16 rounded-full bg-white items-center justify-center shrink-0">
          <FaUserCheck size={30} color="#14532d" />
        </div>
      </div>
      <div className="bg-white rounded-[10px] shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 sm:p-5 lg:p-6 border-b border-gray-100">
          <div className="relative w-full md:w-72">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none" />
            <input
              type="text"
              placeholder="Search pending approval..."
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 rounded-[5px] outline-none text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#14532d] transition"
            />
          </div>
          <div className="flex gap-3 md:ml-auto">
            <div ref={roleDropdownRef} className="relative flex-1 md:flex-none md:w-40">
              <button
                type="button"
                onClick={() => setRoleDropdownOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 pl-4 pr-3.5 py-2.5 rounded-[5px] text-sm font-medium text-gray-700 outline-none focus:border-[#14532d] transition cursor-pointer"
              >
                <span className="truncate">{roleFilter}</span>
                <FaChevronDown
                  className={`text-gray-400 text-[10px] shrink-0 transition-transform ${
                    roleDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {roleDropdownOpen && (
                <div className="absolute left-0 z-10 mt-1.5 w-full bg-white rounded-[10px] shadow-sm border border-gray-100 overflow-hidden py-1">
                  {["All Roles", "Buyer", "Farmer"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setRoleFilter(option);
                        setRoleDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition ${
                        option === roleFilter
                          ? "bg-[#14532d] text-white font-bold"
                          : "text-gray-700 hover:bg-[#F6F6F6]"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5 lg:p-6">
          <div className="hidden sm:block overflow-x-auto relative">
            <table
              ref={tableRef}
              className={`w-full min-w-140 text-sm ${colWidths ? "table-fixed" : ""}`}
            >
              {colWidths && (
                <colgroup>
                  {colWidths.map((w, i) => (
                    <col key={i} style={{ width: w }} />
                  ))}
                </colgroup>
              )}
              <thead>
                <tr className="text-left text-gray-500 uppercase text-[11px] font-semibold tracking-[1.5px]">
                  <th className="pb-4 pr-4">User</th>
                  <th className="pb-4 pr-4">Role</th>
                  <th className="pb-4 pr-4">Joined</th>
                  <th className="pb-4">Status</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <RowSkeleton key={i} cols={4} />
                  ))
                ) : paginatedUsers.length > 0 ? (
                  displayUsers.map((user, i) =>
                    user ? (
                    <tr
                      key={user.id}
                      onClick={() => openDetail(user)}
                      className="hover:bg-[#F6F6F6] transition cursor-pointer"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 shrink-0 rounded-full bg-[#14532d] text-white flex items-center justify-center text-xs font-bold">
                            {(user.fullName || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-[14px] truncate">
                              {user.fullName}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="pr-4">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${roleStyle(user.role)}`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="pr-4 whitespace-nowrap text-sm">
                        {formatDate(user.createdAt)}
                      </td>
                      <td>
                        <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#FEF3C7] text-[#D97706]">
                          New
                        </span>
                      </td>
                    </tr>
                    ) : (
                      <tr key={`empty-${i}`} aria-hidden="true" className="opacity-0 pointer-events-none select-none">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 shrink-0 rounded-full bg-gray-300" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">—</p>
                              <p className="text-xs truncate">—</p>
                            </div>
                          </div>
                        </td>
                        <td className="pr-4">
                          <span className="px-3 py-1 rounded-full text-xs">—</span>
                        </td>
                        <td className="pr-4 text-sm">—</td>
                        <td>
                          <span className="px-3 py-1 rounded-full text-xs">—</span>
                        </td>
                      </tr>
                    ),
                  )
                ) : (
                  Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                    <tr key={`empty-${i}`} aria-hidden="true" className="opacity-0 pointer-events-none select-none">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 shrink-0 rounded-full bg-gray-300" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">—</p>
                            <p className="text-xs truncate">—</p>
                          </div>
                        </div>
                      </td>
                      <td className="pr-4">
                        <span className="px-3 py-1 rounded-full text-xs">—</span>
                      </td>
                      <td className="pr-4 text-sm">—</td>
                      <td>
                        <span className="px-3 py-1 rounded-full text-xs">—</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!loading && paginatedUsers.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
                No pending requests.
              </div>
            )}
          </div>
          <div className="sm:hidden space-y-3 relative">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <UserCardSkeleton key={i} />
              ))
            ) : paginatedUsers.length > 0 ? (
              displayUsers.map((user, i) =>
                user ? (
                <div
                  key={user.id}
                  onClick={() => openDetail(user)}
                  className="bg-white border border-gray-100 rounded-[10px] p-4 active:bg-[#F6F6F6] transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-[#14532d] text-white flex items-center justify-center text-xs font-bold">
                      {(user.fullName || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14px] text-gray-900 truncate">
                        {user.fullName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${roleStyle(user.role)}`}
                    >
                      {user.role}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#FEF3C7] text-[#D97706]">
                      New
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <span className="text-xs text-gray-500">
                      Joined {formatDate(user.createdAt)}
                    </span>
                  </div>
                </div>
                ) : (
                  <div
                    key={`empty-${i}`}
                    aria-hidden="true"
                    className="bg-white border border-gray-100 rounded-[10px] p-4 opacity-0 pointer-events-none select-none"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-gray-300" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">—</p>
                        <p className="text-xs truncate">—</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="px-3 py-1 rounded-full text-xs">—</span>
                      <span className="px-3 py-1 rounded-full text-xs">—</span>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                      <span className="text-xs">—</span>
                    </div>
                  </div>
                ),
              )
            ) : (
              Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  aria-hidden="true"
                  className="bg-white border border-gray-100 rounded-[10px] p-4 opacity-0 pointer-events-none select-none"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-gray-300" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">—</p>
                      <p className="text-xs truncate">—</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs">—</span>
                      <span className="px-3 py-1 rounded-full text-xs">—</span>
                    </div>
                    <span className="text-xs">—</span>
                  </div>
                </div>
              ))
            )}
            {!loading && paginatedUsers.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 pointer-events-none">
                No pending requests.
              </div>
            )}
          </div>
          {!loading && (
            <div
              className={`flex justify-center items-center gap-2 mt-6 pt-4 border-t border-gray-100 ${
                filteredUsers.length === 0
                  ? "invisible pointer-events-none select-none"
                  : ""
              }`}
              aria-hidden={filteredUsers.length === 0 || undefined}
            >
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="min-w-11 min-h-11 sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[10px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F6F6F6] transition"
              >
                <IoIosArrowBack size={16} />
              </button>
              <span className="min-w-11 min-h-11 sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[10px] text-sm font-bold bg-[#14532d] text-white">
                {currentPage}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="min-w-11 min-h-11 sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-[10px] text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F6F6F6] transition"
              >
                <IoIosArrowForward size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      {selectedUser && (
        <div
          onClick={() => setSelectedUser(null)}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-[10px] shadow-sm max-h-[88vh] flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]"
          >
            <div className="bg-[#14532d] text-white px-5 sm:px-6 py-5 flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-[#bbf7d0] uppercase mb-1">
                  Applicant
                </p>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                  {selectedUser.fullName}
                </h2>
                <span className="inline-block mt-2 bg-white/15 px-3 py-1 rounded-full text-[11px] font-bold capitalize">
                  {selectedUser.role}
                </span>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-white/80 hover:text-white hover:bg-white/10 rounded-[10px] p-2 -mr-2 -mt-2 transition shrink-0"
                aria-label="Close"
              >
                <FiX size={22} />
              </button>
            </div>
            <div className="px-5 sm:px-6 pt-5 shrink-0">
              <div className="bg-[#F6F6F6] p-1 rounded-[10px] flex w-fit">
                <button
                  onClick={() => setDetailTab("information")}
                  className={`min-h-9 px-5 py-2 text-sm rounded-[5px] transition ${
                    detailTab === "information"
                      ? "bg-white shadow font-semibold text-[#14532d]"
                      : "text-gray-500 font-medium"
                  }`}
                >
                  Information
                </button>
                <button
                  onClick={() => setDetailTab("documents")}
                  className={`min-h-9 px-5 py-2 text-sm rounded-[5px] transition ${
                    detailTab === "documents"
                      ? "bg-white shadow font-semibold text-[#14532d]"
                      : "text-gray-500 font-medium"
                  }`}
                >
                  Documents
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
              {detailTab === "information" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
                  <Info label="Full Name" value={selectedUser.fullName} />
                  <Info label="Email" value={selectedUser.email} />
                  <Info label="Phone No." value={selectedUser.phone} />
                  <Info label="Role" value={selectedUser.role} />
                  {selectedUser.role?.toLowerCase() === "farmer" && (
                    <>
                      <Info label="Farm Name" value={selectedUser.farmName} />
                      <Info label="Barangay" value={selectedUser.barangay} />
                      <Info
                        label="Municipality"
                        value={selectedUser.municipality}
                      />
                      <Info label="Province" value={selectedUser.province} />
                    </>
                  )}
                </div>
              )}
              {detailTab === "documents" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedUser.role?.toLowerCase() === "buyer" && (
                    <DocumentCard
                      title="Valid ID"
                      file={selectedUser.validID}
                      onPreview={setPreviewFile}
                    />
                  )}
                  {selectedUser.role?.toLowerCase() === "farmer" && (
                    <>
                      <DocumentCard
                        title="Farm Photo"
                        file={selectedUser.farmPhoto}
                        onPreview={setPreviewFile}
                      />
                      <DocumentCard
                        title="Valid ID"
                        file={selectedUser.validID}
                        onPreview={setPreviewFile}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="px-5 sm:px-6 py-5 border-t border-gray-100 flex gap-3 shrink-0">
              <button
                onClick={() => openRejectModal(selectedUser)}
                className="flex-1 min-h-11 flex items-center justify-center gap-2 bg-[#FDE8E8] text-[#DC2626] hover:opacity-90 rounded-[5px] text-sm font-semibold transition"
              >
                <FiX />
                Decline
              </button>
              <button
                onClick={() => openApproveModal(selectedUser)}
                className="flex-1 min-h-11 flex items-center justify-center gap-2 bg-[#14532d] text-white hover:opacity-90 active:opacity-85 rounded-[5px] text-sm font-semibold transition"
              >
                <FiCheck />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
      {actionTarget && (
        <div
          onClick={closeActionModal}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-[10px] shadow-sm overflow-hidden animate-[fadeIn_0.15s_ease-out]"
          >
            <div
              className={`px-5 sm:px-6 py-5 flex items-center gap-3 text-white ${
                actionTarget.action === "reject" ? "bg-[#dc2626]" : "bg-[#14532d]"
              }`}
            >
              <div className="w-9 h-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center">
                {actionTarget.action === "reject" ? (
                  <FiUserX size={18} />
                ) : (
                  <FiUserCheck size={18} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-[#bbf7d0] uppercase">
                  {actionTarget.action === "reject" ? "Decline" : "Approval"}
                </p>
                <h2 className="text-base font-bold tracking-tight truncate mt-1">
                  {actionTarget.action === "reject"
                    ? "Decline Request"
                    : "Approve Request"}
                </h2>
              </div>
            </div>
            <div className="px-5 sm:px-6 py-6 space-y-5">
              <div className="flex items-center gap-3 bg-[#F6F6F6] rounded-[10px] p-4">
                <div className="w-10 h-10 shrink-0 rounded-full bg-[#14532d] text-white flex items-center justify-center text-sm font-bold">
                  {(actionTarget.user.fullName || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 truncate">
                    {actionTarget.user.fullName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {actionTarget.user.email}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                {actionTarget.action === "reject"
                  ? "Are you sure you want to decline this request? This cannot be undone."
                  : "This will grant the applicant access to the platform. Do you want to continue?"}
              </p>
            </div>
            <div className="px-5 sm:px-6 py-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={closeActionModal}
                disabled={actionLoading}
                className="flex-1 min-h-11 bg-white border border-gray-300 hover:bg-[#F6F6F6] text-[#14532d] px-4 py-2.5 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={actionLoading}
                className={`flex-1 min-h-11 px-4 py-2.5 rounded-[5px] text-sm font-bold text-white transition disabled:opacity-60 ${
                  actionTarget.action === "reject"
                    ? "bg-[#dc2626] hover:opacity-90 active:opacity-85"
                    : "bg-[#14532d] hover:opacity-90 active:opacity-85"
                }`}
              >
                {actionLoading
                  ? "Please wait..."
                  : actionTarget.action === "reject"
                    ? "Yes, Decline"
                    : "Yes, Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white p-4 sm:p-6 rounded-[10px] max-w-3xl w-full shadow-sm max-h-[88vh] overflow-y-auto"
          >
            <button
              onClick={() => setPreviewFile(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-red-600 hover:bg-[#F6F6F6] rounded-[10px] p-1.5 transition"
              aria-label="Close preview"
            >
              <FiX size={22} />
            </button>
            <img
              src={previewFile}
              alt="Document preview"
              className="max-h-[75vh] w-full object-contain rounded-[10px]"
            />
          </div>
        </div>
      )}
    </>
  );
};

const Info = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-1.5">
      {label}
    </p>
    <div className="bg-[#F6F6F6] px-3.5 py-2.5 rounded-[10px] text-sm text-gray-800 truncate">
      {value || "N/A"}
    </div>
  </div>
);

const DocumentCard = ({ title, file, onPreview }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-1.5">
      {title}
    </p>
    <div
      className={`rounded-[10px] border overflow-hidden ${
        file ? "border-gray-100" : "border-dashed border-gray-200 bg-[#F6F6F6]"
      }`}
    >
      {file ? (
        <button
          onClick={() => onPreview(file)}
          className="block w-full text-left cursor-pointer"
        >
          <div className="h-32 w-full bg-[#F6F6F6]">
            <img
              src={file}
              alt={title}
              className="h-full w-full object-cover"
            />
          </div>
          <p className="text-center text-xs text-[#14532d] font-semibold py-2">
            Click to preview
          </p>
        </button>
      ) : (
        <div className="h-32 flex items-center justify-center text-gray-500 text-xs">
          No file uploaded
        </div>
      )}
    </div>
  </div>
);

export default RequestApproval;
