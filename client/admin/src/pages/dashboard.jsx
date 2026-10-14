import React, { useEffect, useState, useCallback, useMemo } from "react";
import { FaShoppingCart } from "react-icons/fa";
import { TbLayoutDashboardFilled } from "react-icons/tb";
import { BsBarChartFill } from "react-icons/bs";
import { FaUser } from "react-icons/fa6";
import { FiAlertCircle } from "react-icons/fi";
import { GrUserWorker } from "react-icons/gr";
import {
  getApprovedUserCounts,
  getPendingUsers,
  getRecentActivity,
  getRecentOrders,
  getOrdersSummary,
} from "../services/dashboardService";

const statusStyles = {
  completed: "bg-[#DCFCE7] text-[#14532d]",
  delivered: "bg-[#DCFCE7] text-[#14532d]",
  claimed: "bg-[#DCFCE7] text-[#14532d]",
  accepted: "bg-[#DCFCE7] text-[#14532d]",
  confirmed: "bg-[#DCFCE7] text-[#14532d]",
  processing: "bg-[#DCFCE7] text-[#14532d]",
  preparing: "bg-[#fef3c7] text-[#92400e]",
  shipped: "bg-[#fef3c7] text-[#92400e]",
  to_receive: "bg-[#fef3c7] text-[#92400e]",
  "to receive": "bg-[#fef3c7] text-[#92400e]",
  pending: "bg-[#FEF3C7] text-[#D97706]",
  cancelled: "bg-[#FDE8E8] text-[#DC2626]",
};

const getStatusStyle = (status) =>
  statusStyles[status?.toLowerCase()] || "bg-gray-100 text-gray-700";

const getStatusLabel = (status) => {
  switch (status?.toLowerCase().replace(/[\s_-]+/g, "_")) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "processing":
      return "Processing";
    case "to_receive":
      return "To Receive";
    case "delivered":
      return "Delivered";
    case "claimed":
      return "Claimed";
    case "cancelled":
      return "Cancelled";
    default:
      return status
        ? String(status)
            .replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : "N/A";
  }
};

const ORDER_STATUSES = [
  "Pending",
  "Accepted",
  "Processing",
  "To Receive",
  "Delivered",
  "Claimed",
  "Cancelled",
];

const todayLabel = () =>
  new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const StatCardSkeleton = () => (
  <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-5 flex flex-col items-center justify-center gap-3">
    <SkeletonLine className="h-12 w-12 rounded-[10px]" />
    <SkeletonLine className="h-6 w-16" />
    <SkeletonLine className="h-3 w-24" />
  </div>
);

const RowSkeleton = ({ cols = 6 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-4 pr-4">
        <SkeletonLine className="h-4 w-full max-w-24" />
      </td>
    ))}
  </tr>
);

const TransactionCardSkeleton = () => (
  <div className="bg-[#F6F6F6] rounded-[10px] p-4 space-y-3">
    <div className="flex justify-between items-center">
      <SkeletonLine className="h-4 w-24" />
      <SkeletonLine className="h-5 w-16 rounded-full" />
    </div>
    <SkeletonLine className="h-3 w-40" />
    <SkeletonLine className="h-3 w-32" />
    <div className="flex justify-between items-center">
      <SkeletonLine className="h-4 w-20" />
      <SkeletonLine className="h-3 w-16" />
    </div>
  </div>
);

const toMillis = (createdAt) => {
  if (!createdAt) return 0;
  if (createdAt.toDate) {
    try {
      return createdAt.toDate().getTime();
    } catch {
      return 0;
    }
  }
  const parsed = new Date(createdAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const Dashboard = () => {
  const [userCounts, setUserCounts] = useState({ farmers: 0, buyers: 0 });
  const [ordersSummary, setOrdersSummary] = useState({
    totalOrders: 0,
    earnings: 0,
    statusCounts: {
      pending: 0,
      accepted: 0,
      processing: 0,
      to_receive: 0,
      delivered: 0,
      claimed: 0,
      cancelled: 0,
    },
  });
  const [pendingUsers, setPendingUsers] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [countsData, summaryData, pendingData, usersData, ordersData] =
        await Promise.all([
          getApprovedUserCounts(),
          getOrdersSummary(),
          getPendingUsers(),
          getRecentActivity(),
          getRecentOrders(5),
        ]);
      setUserCounts(countsData);
      setOrdersSummary(summaryData);
      setPendingUsers(pendingData);
      setRecentUsers(usersData);
      setRecentOrders(ordersData);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Refresh when the tab is focused again.
  useEffect(() => {
    const handleFocus = () => {
      loadDashboard();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadDashboard]);

  const formatDate = (createdAt) => {
    try {
      if (!createdAt) return "N/A";
      const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
      if (Number.isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const formatPeso = (value) =>
    `₱${(value ?? 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const getFarmerName = (order) =>
    order.farmerName || order.farmName || "N/A";

  const getProduceSummary = (products) => {
    if (!products || products.length === 0) return "N/A";
    const names = products.map((p) => p.name).filter(Boolean);
    if (names.length === 0) return "N/A";
    if (names.length <= 2) return names.join(", ");
    return `${names[0]}, ${names[1]} +${names.length - 2} more`;
  };

  const activityFeed = useMemo(() => {
    const registrations = recentUsers.map((user) => ({
      key: `user-${user.id}`,
      millis: toMillis(user.createdAt),
      title: `${user.fullName || "A user"} registered as ${user.role || "user"}`,
      sub: `Submitted on ${formatDate(user.createdAt)}`,
    }));
    const orderEvents = recentOrders.map((order) => {
      const status = (order.status || "").toLowerCase();
      const product = getProduceSummary(order.products);
      const title =
        status === "delivered"
          ? `Order delivered — ${product}`
          : status === "claimed"
            ? `Order claimed — ${product}`
            : `Order ${order.status || "updated"} — ${product}`;
      const sub = `${order.buyerName || "Buyer"} → ${getFarmerName(order)} · ${formatDate(order.createdAt)}`;
      return {
        key: `order-${order.id}`,
        millis: toMillis(order.createdAt),
        title,
        sub,
      };
    });
    return [...registrations, ...orderEvents]
      .sort((a, b) => b.millis - a.millis)
      .slice(0, 6);
  }, [recentUsers, recentOrders]);

  // Sample list when there is no activity yet.
  const PREVIEW_ACTIVITY = [
    {
      key: "preview-act-1",
      title: "Juan Dela Cruz registered as farmer",
      sub: `Submitted on ${formatDate(new Date())}`,
    },
    {
      key: "preview-act-2",
      title: "Order delivered — Papaya",
      sub: `Pam → Renz Galoy · ${formatDate(new Date())}`,
    },
    {
      key: "preview-act-3",
      title: "Maria Santos registered as buyer",
      sub: `Submitted on ${formatDate(new Date())}`,
    },
    {
      key: "preview-act-4",
      title: "Order pending — Patatas (Potato)",
      sub: `mj → Renz Galoy · ${formatDate(new Date())}`,
    },
    {
      key: "preview-act-5",
      title: "Jose Mendoza registered as farmer",
      sub: `Submitted on ${formatDate(new Date())}`,
    },
    {
      key: "preview-act-6",
      title: "Order processing — Papaya",
      sub: `Pam → Renz Galoy · ${formatDate(new Date())}`,
    },
  ];
  const visibleActivityFeed =
    activityFeed.length > 0 ? activityFeed : PREVIEW_ACTIVITY;

  const displayOrders = useMemo(() => {
    return recentOrders.slice(0, 5);
  }, [recentOrders]);

  const statCards = [
    {
      key: "farmers",
      icon: <GrUserWorker size={26} color="#14532d" />,
      iconBg: "bg-[#f0fdf4]",
      value: userCounts.farmers,
      label: "Registered Farmers",
      dark: false,
    },
    {
      key: "buyers",
      icon: <FaUser size={22} color="#2563EB" />,
      iconBg: "bg-[#eff6ff]",
      value: userCounts.buyers,
      label: "Registered Buyers",
      dark: false,
    },
    {
      key: "orders",
      icon: <FaShoppingCart size={26} color="#14532d" />,
      iconBg: "bg-[#f0fdf4]",
      value: ordersSummary.totalOrders,
      label: "Total Orders",
      dark: false,
    },
    {
      key: "earnings",
      icon: <BsBarChartFill size={22} color="#14532d" />,
      iconBg: "bg-white",
      value: formatPeso(ordersSummary.earnings),
      label: "FarmGate Earnings",
      dark: true,
    },
  ];

  return (
    <>
      {/* Top banner */}
      <div
        className="rounded-[10px] p-[18px] sm:p-6 lg:p-8 mb-5 sm:mb-6 lg:mb-8 flex flex-row items-center justify-between gap-3"
        style={{ backgroundColor: "#14532d" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-[#bbf7d0] uppercase">
            Admin Overview
          </p>
          <h1 className="text-xl font-black text-white mt-2 leading-tight">
            Dashboard
          </h1>
          <p className="text-xs text-[#dcfce7] mt-1">{todayLabel()}</p>
        </div>
        <div className="w-16 h-16 rounded-full items-center justify-center shrink-0 hidden sm:flex bg-white">
          <TbLayoutDashboardFilled size={30} color="#14532d" />
        </div>
      </div>
      {error && (
        <div className="mb-5 bg-[#FDE8E8] border border-red-100 text-[#DC2626] px-4 py-3 rounded-[10px] text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FiAlertCircle className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadDashboard}
            className="shrink-0 font-bold underline hover:no-underline min-h-11 flex items-center"
          >
            Retry
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))
          : statCards.map((card) => (
              <div
                key={card.key}
                className={`rounded-[10px] shadow-sm border p-5 flex flex-col justify-center items-center active:opacity-90 transition ${
                  card.dark
                    ? "border-transparent text-white"
                    : "bg-white border-gray-100"
                }`}
                style={card.dark ? { backgroundColor: "#14532d" } : undefined}
              >
                <div
                  className={`w-12 h-12 rounded-[10px] flex items-center justify-center mb-2 ${card.iconBg}`}
                >
                  {card.icon}
                </div>
                <div
                  className={`text-[22px] font-bold leading-tight ${
                    card.dark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {card.value}
                </div>
                <p
                  className={`text-[12px] mt-1 text-center ${
                    card.dark ? "text-[#dcfce7]" : "text-gray-500"
                  }`}
                >
                  {card.label}
                </p>
              </div>
            ))}
      </div>
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-5 mt-4 sm:mt-5">
        <div className="flex-1 min-w-0 bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6">
          <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4">
            Recent Activity
          </h2>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <SkeletonLine className="h-3 w-3/4" />
                  <SkeletonLine className="h-2.5 w-1/3" />
                </div>
              ))}
            </div>
          ) : visibleActivityFeed.length > 0 ? (
            <ul className="text-sm text-gray-700 space-y-4">
              {visibleActivityFeed.map((item) => (
                <li key={item.key} className="flex gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#14532d" }} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-[14px] truncate">{item.title}</p>
                    <span className="text-xs text-gray-500">{item.sub}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center text-gray-500 text-sm">
              No recent activity
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase">
              Pending Approvals
            </h2>
            {!loading && (
              <span className="flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-[11px] font-bold bg-[#FEF3C7] text-[#D97706]">
                {pendingUsers.length}
              </span>
            )}
          </div>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonLine className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonLine className="h-3 w-24" />
                    <SkeletonLine className="h-2.5 w-32" />
                  </div>
                  <SkeletonLine className="h-5 w-12 rounded-full" />
                </div>
              ))}
            </div>
          ) : pendingUsers.length > 0 ? (
            <div className="space-y-4">
              {pendingUsers.slice(0, 6).map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-full text-white flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#14532d" }}>
                    {user.fullName?.charAt(0)?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user.fullName}
                    </p>
                    <p className="text-xs text-gray-500 truncate capitalize">
                      {user.role} · Joined {formatDate(user.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 px-3 py-1 rounded-full text-[11px] font-bold bg-[#FEF3C7] text-[#D97706]">
                    New
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 text-sm">
              No pending approvals
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6">
          <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4">
            Order Overview
          </h2>
          {loading ? (
            <div className="space-y-3">
              {ORDER_STATUSES.map((status) => (
                <div
                  key={status}
                  className="flex items-center justify-between bg-[#F6F6F6] rounded-[10px] px-4 py-3"
                >
                  <SkeletonLine className="h-3 w-20" />
                  <SkeletonLine className="h-4 w-8" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {ORDER_STATUSES.map((status) => (
                <div
                  key={status}
                  className="flex items-center justify-between bg-[#F6F6F6] rounded-[10px] px-4 py-3"
                >
                  <span className="text-[14px] font-semibold text-gray-900">
                    {status}
                  </span>
                  <span className="text-[14px] font-bold text-gray-900">
                    {ordersSummary.statusCounts[
                      status.toLowerCase().replace(/\s+/g, "_")
                    ] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 mt-4 sm:mt-5 min-w-0">
        <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4 sm:mb-6">
          Recent Transactions
        </h2>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="text-left text-gray-500 uppercase text-[11px] font-semibold tracking-[1.5px]">
                  <th className="pb-3 pr-4 font-semibold">Buyer</th>
                  <th className="pb-3 pr-4 font-semibold">Farm</th>
                  <th className="pb-3 pr-4 font-semibold">Product</th>
                  <th className="pb-3 pr-4 font-semibold">Amount</th>
                  <th className="pb-3 pr-4 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <RowSkeleton key={i} />
                  ))
                ) : displayOrders.length > 0 ? (
                  displayOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-[#F6F6F6] transition">
                      <td className="py-3 pr-4 font-medium text-gray-800">
                        {order.buyerName}
                      </td>
                      <td className="pr-4 max-w-40 truncate">{getFarmerName(order)}</td>
                      <td className="pr-4 max-w-40 truncate">
                        {getProduceSummary(order.products)}
                      </td>
                      <td className="pr-4 font-semibold text-gray-800 whitespace-nowrap">
                        ₱{(order.total ?? 0).toLocaleString()}
                      </td>
                      <td className="pr-4">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${getStatusStyle(
                            order.status,
                          )}`}
                        >
                          {getStatusLabel(order.status)}
                        </span>
                      </td>
                      <td className="text-gray-400 whitespace-nowrap text-xs">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-sm text-gray-400"
                    >
                      No transactions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TransactionCardSkeleton key={i} />
              ))
            ) : displayOrders.length > 0 ? (
              displayOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-[10px] border border-gray-100 p-4">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <span className="font-semibold text-sm text-gray-800 truncate min-w-0">
                      {order.buyerName}
                    </span>
                    <span
                      className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold capitalize ${getStatusStyle(
                        order.status,
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-1 truncate">
                    {getFarmerName(order)}
                  </p>
                  <p className="text-xs text-gray-400 mb-3 truncate">
                    {getProduceSummary(order.products)}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-gray-800">
                      ₱{(order.total ?? 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-400 text-sm">
                No transactions yet
              </div>
            )}
          </div>
        </div>
    </>
  );
};

export default Dashboard;
