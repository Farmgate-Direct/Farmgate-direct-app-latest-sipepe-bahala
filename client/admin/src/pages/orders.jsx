import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { FaShoppingCart } from "react-icons/fa";
import { GrUserWorker } from "react-icons/gr";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";
import {
  FiX,
  FiUser,
  FiCalendar,
  FiPackage,
  FiHash,
  FiSearch,
  FiCreditCard,
  FiShoppingCart,
  FiCheckCircle,
  FiShoppingBag,
  FiXCircle,
  FiClock,
} from "react-icons/fi";
import { getAllOrders } from "../services/orderService";
import { CustomDateModal, formatRangeLabel } from "../components/CustomDatePicker";

const ITEMS_PER_PAGE = 5;

const DATE_FILTER_OPTIONS = [
  "All Time",
  "Today",
  "This Week",
  "This Month",
  "Custom Date",
];

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const RowSkeleton = ({ cols = 7 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-4 pr-4">
        <SkeletonLine className="h-4 w-full max-w-24" />
      </td>
    ))}
  </tr>
);

const TransactionCardSkeleton = () => (
  <div className="bg-white border border-gray-100 rounded-[10px] p-4 space-y-3">
    <div className="flex justify-between items-center gap-2">
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

const toDateObj = (createdAt) => {
  if (!createdAt) return null;
  const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseCustomDate = (value, endOfDay) => {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const matchesDateFilter = (order, filter, customStart, customEnd) => {
  if (filter === "All Time") return true;
  const orderDate = toDateObj(order.createdAt);
  if (!orderDate) return false;
  const now = new Date();
  switch (filter) {
    case "Today":
      return isSameDay(orderDate, now);
    case "This Week": {
      const weekStart = startOfWeek(now);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return orderDate >= weekStart && orderDate < weekEnd;
    }
    case "This Month":
      return (
        orderDate.getFullYear() === now.getFullYear() &&
        orderDate.getMonth() === now.getMonth()
      );
    case "Custom Date": {
      if (!customStart && !customEnd) return true;
      const start = parseCustomDate(customStart, false);
      const end =
        parseCustomDate(customEnd, true) || parseCustomDate(customStart, true);
      if (customStart && !start) return true;
      if (customEnd && !end) return true;
      if (start && orderDate < start) return false;
      if (end && orderDate > end) return false;
      return true;
    }
    default:
      return true;
  }
};

const OrderPayments = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const [dateFilter, setDateFilter] = useState("All Time");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef(null);
  const tableRef = useRef(null);
  const [colWidths, setColWidths] = useState(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [customDateModalOpen, setCustomDateModalOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(e.target)
      ) {
        setStatusDropdownOpen(false);
      }
      if (
        dateDropdownRef.current &&
        !dateDropdownRef.current.contains(e.target)
      ) {
        setDateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const data = await getAllOrders();
        setOrders(data);
      } catch (error) {
        console.error("Failed to load orders:", error);
      } finally {
        setLoading(false);
      }
    };
    loadOrders();
  }, []);

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

  const getFarmerName = (order) => order.farmerName || order.farmName || "N/A";

  const getProduceSummary = (products) => {
    if (!products || products.length === 0) return "N/A";
    const names = products.map((p) => p.name).filter(Boolean);
    if (names.length === 0) return "N/A";
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1} more`;
  };

  const getPaymentMethodLabel = (order) => {
    const method = order.payment;
    if (!method || typeof method !== "string" || !method.trim()) return "N/A";
    const normalized = method
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (normalized === "cod") return "COD";
    if (normalized === "qr") return "GCash";
    return method
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const buyerName = order.buyerName || "";
      const farmerName = getFarmerName(order);
      const orderId = order.id || "";
      const productNames = (order.products || [])
        .map((p) => p.name)
        .filter(Boolean)
        .join(" ");
      const query = search.toLowerCase();
      const matchesSearch =
        buyerName.toLowerCase().includes(query) ||
        farmerName.toLowerCase().includes(query) ||
        orderId.toLowerCase().includes(query) ||
        productNames.toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "All Status" ||
        normalizeStatus(order.status) === normalizeStatus(statusFilter);
      const matchesDate = matchesDateFilter(
        order,
        dateFilter,
        customStartDate,
        customEndDate,
      );
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [
    orders,
    search,
    statusFilter,
    dateFilter,
    customStartDate,
    customEndDate,
  ]);

  useEffect(() => {
    setCurrentPage(1);
    setColWidths(null);
  }, [search, statusFilter, dateFilter, customStartDate, customEndDate]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredOrders.length / ITEMS_PER_PAGE),
  );

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const displayOrders = useMemo(() => {
    const list = [...paginatedOrders];
    while (list.length < ITEMS_PER_PAGE) list.push(null);
    return list;
  }, [paginatedOrders]);

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  useEffect(() => {
    if (loading || currentPage !== 1 || paginatedOrders.length === 0) return;
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
  }, [loading, currentPage, paginatedOrders]);

  const statusStyle = (status) => {
    switch (status?.toLowerCase().replace(/[\s_-]+/g, "_")) {
      case "delivered":
      case "claimed":
      case "accepted":
      case "processing":
        return "bg-[#DCFCE7] text-[#14532d]";
      case "pending":
        return "bg-[#FEF3C7] text-[#D97706]";
      case "to_receive":
      case "preparing":
        return "bg-[#fef3c7] text-[#92400e]";
      case "cancelled":
        return "bg-[#FDE8E8] text-[#DC2626]";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

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

  const normalizeStatus = (status) =>
    status?.toLowerCase().replace(/[\s_-]+/g, "_") ?? "";

  const toDate = (timestamp) => {
    if (!timestamp) return null;
    try {
      if (timestamp.toDate) return timestamp.toDate();
      if (typeof timestamp.seconds === "number")
        return new Date(timestamp.seconds * 1000);
      const d = new Date(timestamp);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const formatTimelineDate = (timestamp) => {
    const date = toDate(timestamp);
    if (!date) return "";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getTimelineSteps = (order) => {
    if (!order) return [];
    const steps = [];
    if (order.createdAt) {
      steps.push({
        key: "placed",
        title: "Order Placed",
        date: order.createdAt,
        Icon: FiShoppingCart,
        color: "#15803D",
        bg: "#E8F3EC",
      });
    }
    const acceptedAt =
      order.farmerDecisionAt ||
      (["accepted", "processing", "to_receive", "delivered", "claimed"].includes(
        order.status?.toLowerCase?.() ?? order.status,
      )
        ? order.updatedAt || order.createdAt
        : null);
    const isAccepted =
      order.farmerDecision === "accepted" ||
      ["accepted", "processing", "to_receive", "delivered", "claimed"].includes(
        order.status?.toLowerCase?.() ?? order.status,
      );
    if (isAccepted && acceptedAt) {
      steps.push({
        key: "accepted",
        title: "Accepted",
        date: acceptedAt,
        Icon: FiCheckCircle,
        color: "#2563EB",
        bg: "#E8EEFE",
      });
    }
    if (order.processingAt) {
      steps.push({
        key: "processing",
        title: "Processing",
        date: order.processingAt,
        Icon: FiPackage,
        color: "#15803D",
        bg: "#E8F3EC",
      });
    }
    if (order.toReceiveAt) {
      steps.push({
        key: "to_receive",
        title: "To Receive",
        date: order.toReceiveAt,
        Icon: FiShoppingBag,
        color: "#7C3AED",
        bg: "#EFE8FD",
      });
    }
    if (order.deliveredAt) {
      steps.push({
        key: "delivered",
        title: order.delivery === "pickup" || order.status === "claimed" ? "Claimed" : "Delivered",
        date: order.deliveredAt,
        Icon: FiCheckCircle,
        color: "#2563EB",
        bg: "#E8EEFE",
      });
    }
    if (order.cancelledAt) {
      steps.push({
        key: "cancelled",
        title: "Cancelled",
        date: order.cancelledAt,
        Icon: FiXCircle,
        color: "#DC2626",
        bg: "#FDE8E8",
      });
    }
    return steps;
  };

  return (
    <>
      <div
        className="rounded-[10px] p-[18px] sm:p-6 lg:p-8 flex justify-between items-center mb-5 sm:mb-6 lg:mb-8"
        style={{ backgroundColor: "#14532d" }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-[#bbf7d0] uppercase">
            Transactions
          </p>
          <h1 className="text-xl font-black text-white mt-2">
            Orders & Payments
          </h1>
          <p className="text-xs text-[#dcfce7] mt-1">
            Track every transaction between buyers and farmers.
          </p>
        </div>
        <div className="hidden sm:flex w-16 h-16 rounded-full bg-white items-center justify-center shrink-0">
          <FaShoppingCart size={28} color="#14532d" />
        </div>
      </div>
      <div className="bg-white rounded-[10px] shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 sm:p-5 lg:p-6 border-b border-gray-100">
          <div className="relative w-full md:w-72">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none" />
            <input
              type="text"
              placeholder="Search order, buyer, or farmer"
              maxLength={100}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 pl-10 pr-4 py-2.5 rounded-[5px] outline-none text-sm text-gray-700 placeholder:text-gray-400 focus:border-[#14532d] transition"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 md:ml-auto w-full md:w-auto">
            <div
              ref={dateDropdownRef}
              className="relative flex-1 md:flex-none md:w-64"
            >
              <button
                type="button"
                onClick={() => setDateDropdownOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 pl-4 pr-3.5 py-2.5 rounded-[5px] text-sm font-medium text-gray-700 outline-none focus:border-[#14532d] transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5 truncate min-w-0">
                  <FiCalendar className="text-gray-400 shrink-0" size={13} />
                  {dateFilter === "Custom Date" ? (
                    <>
                      <span className="truncate sm:hidden">Custom Date</span>
                      <span className="truncate hidden sm:inline">
                        {customStartDate || customEndDate
                          ? formatRangeLabel(customStartDate, customEndDate)
                          : "Custom Date"}
                      </span>
                    </>
                  ) : (
                    <span className="truncate">{dateFilter}</span>
                  )}
                </span>
                <FaChevronDown
                  className={`text-gray-400 text-[10px] shrink-0 transition-transform ${
                    dateDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {dateDropdownOpen && (
                <div className="absolute right-0 z-20 mt-1.5 w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1">
                  {DATE_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setDateFilter(option);
                        setDateDropdownOpen(false);
                        if (option === "Custom Date") {
                          setCustomDateModalOpen(true);
                        }
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition ${
                        option === dateFilter
                          ? "bg-[#14532d] text-white font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              ref={statusDropdownRef}
              className="relative flex-1 md:flex-none md:w-40"
            >
              <button
                type="button"
                onClick={() => setStatusDropdownOpen((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 pl-4 pr-3.5 py-2.5 rounded-[5px] text-sm font-medium text-gray-700 outline-none focus:border-[#14532d] transition cursor-pointer"
              >
                <span className="truncate">{statusFilter}</span>
                <FaChevronDown
                  className={`text-gray-400 text-[10px] shrink-0 transition-transform ${
                    statusDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {statusDropdownOpen && (
                <div className="absolute right-0 z-10 mt-1.5 w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden py-1">
                  {[
                    "All Status",
                    "Pending",
                    "Accepted",
                    "Processing",
                    "To Receive",
                    "Delivered",
                    "Claimed",
                    "Cancelled",
                  ].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setStatusFilter(option);
                        setStatusDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition ${
                        option === statusFilter
                          ? "bg-[#14532d] text-white font-medium"
                          : "text-gray-700 hover:bg-gray-50"
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
              className={`w-full min-w-205 text-sm ${colWidths ? "table-fixed" : ""}`}
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
                  <th className="pb-4 pr-4 font-medium">Order ID</th>
                  <th className="pb-4 pr-4 font-medium">Buyer</th>
                  <th className="pb-4 pr-4 font-medium">Farmer</th>
                  <th className="pb-4 pr-4 font-medium">Product</th>
                  <th className="pb-4 pr-4 font-medium">Amount</th>
                  <th className="pb-4 pr-4 font-medium">Status</th>
                  <th className="pb-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <RowSkeleton key={i} cols={7} />
                  ))
                ) : paginatedOrders.length > 0 ? (
                  displayOrders.map((order, i) =>
                    order ? (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="h-17 hover:bg-gray-50 transition cursor-pointer"
                    >
                      <td className="py-4 pr-4 text-gray-800">
                        #{order.id.slice(0, 6)}
                      </td>
                      <td className="pr-4 font-medium text-gray-800">
                        {order.buyerName}
                      </td>
                      <td className="pr-4">{getFarmerName(order)}</td>
                      <td className="pr-4 max-w-64 truncate">
                        {getProduceSummary(order.products)}
                      </td>
                      <td className="pr-4 font-semibold text-gray-800 whitespace-nowrap">
                        ₱{(order.total ?? 0).toLocaleString()}
                      </td>
                      <td className="pr-4">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${statusStyle(
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
                    ) : (
                      <tr key={`empty-${i}`} aria-hidden="true" className="h-17 opacity-0 pointer-events-none select-none">
                        <td className="py-4 pr-4">—</td>
                        <td className="pr-4 font-medium">—</td>
                        <td className="pr-4">—</td>
                        <td className="pr-4">—</td>
                        <td className="pr-4 font-semibold">—</td>
                        <td className="pr-4">
                          <span className="px-3 py-1 rounded-full text-xs">—</span>
                        </td>
                        <td className="text-xs">—</td>
                      </tr>
                    ),
                  )
                ) : (
                  Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                    <tr key={`empty-${i}`} aria-hidden="true" className="h-17 opacity-0 pointer-events-none select-none">
                      <td className="py-4 pr-4">—</td>
                      <td className="pr-4 font-medium">—</td>
                      <td className="pr-4">—</td>
                      <td className="pr-4">—</td>
                      <td className="pr-4 font-semibold">—</td>
                      <td className="pr-4">
                        <span className="px-3 py-1 rounded-full text-xs">—</span>
                      </td>
                      <td className="text-xs">—</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!loading && paginatedOrders.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
                No transactions found
              </div>
            )}
          </div>
          <div className="sm:hidden space-y-3 relative">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TransactionCardSkeleton key={i} />
              ))
            ) : paginatedOrders.length > 0 ? (
              displayOrders.map((order, i) =>
                order ? (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white border border-gray-100 rounded-[10px] p-4 transition cursor-pointer"
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="font-semibold text-sm text-gray-800">
                      #{order.id.slice(0, 6)}
                    </span>
                    <span
                      className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold capitalize ${statusStyle(
                        order.status,
                      )}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 truncate">
                    {order.buyerName}{" "}
                    <span className="text-gray-400">
                      → {getFarmerName(order)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    {getProduceSummary(order.products)}
                  </p>
                  <div className="flex justify-between items-center mt-3">
                    <span className="font-semibold text-sm text-gray-800">
                      ₱{(order.total ?? 0).toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                </div>
                ) : (
                  <div
                    key={`empty-${i}`}
                    aria-hidden="true"
                    className="bg-white border border-gray-100 rounded-[10px] p-4 opacity-0 pointer-events-none select-none"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="font-semibold text-sm">—</span>
                      <span className="px-3 py-1 rounded-full text-xs">—</span>
                    </div>
                    <p className="text-sm truncate">—</p>
                    <p className="text-xs mt-1 truncate">—</p>
                    <div className="flex justify-between items-center mt-3">
                      <span className="font-semibold text-sm">—</span>
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
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="font-semibold text-sm">—</span>
                    <span className="px-3 py-1 rounded-full text-xs">—</span>
                  </div>
                  <p className="text-sm truncate">—</p>
                  <p className="text-xs mt-1 truncate">—</p>
                  <div className="flex justify-between items-center mt-3">
                    <span className="font-semibold text-sm">—</span>
                    <span className="text-xs">—</span>
                  </div>
                </div>
              ))
            )}
            {!loading && paginatedOrders.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
                No transactions found
              </div>
            )}
          </div>
          {!loading && (
            <div
              className={`flex justify-center items-center gap-2 mt-6 pt-4 border-t border-gray-100 ${
                filteredOrders.length === 0
                  ? "invisible pointer-events-none select-none"
                  : ""
              }`}
              aria-hidden={filteredOrders.length === 0 || undefined}
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
      {customDateModalOpen && (
        <CustomDateModal
          startDate={customStartDate}
          endDate={customEndDate}
          onChange={(start, end) => {
            setCustomStartDate(start);
            setCustomEndDate(end);
          }}
          onClear={() => {
            setCustomStartDate("");
            setCustomEndDate("");
          }}
          onApply={() => setCustomDateModalOpen(false)}
          onClose={() => setCustomDateModalOpen(false)}
        />
      )}
      {selectedOrder && (
        <div
          onClick={() => setSelectedOrder(null)}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-[10px] shadow-2xl max-h-[88vh] flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]"
          >
            <div className="bg-[#14532d] text-white px-5 sm:px-6 py-[18px] flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[#bbf7d0] text-[10px] font-bold uppercase tracking-widest mb-1">
                  <FiHash size={12} />
                  Order Details
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">
                  #{selectedOrder.id.slice(0, 6)}
                </h2>
                <div className="flex items-center gap-1.5 text-[#dcfce7] text-xs mt-2">
                  <FiCalendar size={13} />
                  {formatDate(selectedOrder.createdAt)}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-white/80 hover:text-white hover:bg-white/10 rounded-lg p-2 -mr-2 -mt-2 transition"
                  aria-label="Close"
                >
                  <FiX size={22} />
                </button>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize bg-white text-[#14532d]`}
                >
                  {getStatusLabel(selectedOrder.status)}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#eff6ff] rounded-[10px] p-3 sm:p-4 min-w-0">
                  <div className="flex items-center gap-1.5 text-[#2563EB] text-[11px] font-semibold uppercase tracking-[1.5px] mb-2">
                    <FiUser size={13} />
                    Buyer
                  </div>
                  <p className="font-semibold text-sm text-gray-800 truncate">
                    {selectedOrder.buyerName || "N/A"}
                  </p>
                </div>
                <div className="bg-[#f0fdf4] rounded-[10px] p-3 sm:p-4 min-w-0">
                  <div className="flex items-center gap-1.5 text-[#14532d] text-[11px] font-semibold uppercase tracking-[1.5px] mb-2">
                    <GrUserWorker size={13} />
                    Farmer
                  </div>
                  <p className="font-semibold text-sm text-gray-800 truncate">
                    {getFarmerName(selectedOrder)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-[#F6F6F6] rounded-[10px] px-4 py-3.5">
                <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-semibold uppercase tracking-[1.5px]">
                  <FiCreditCard size={13} />
                  Payment Method
                </div>
                <span className="font-semibold text-sm text-gray-800">
                  {getPaymentMethodLabel(selectedOrder)}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2 text-gray-400 text-[11px] font-semibold uppercase tracking-[1.5px] mb-3">
                  <FiPackage size={13} />
                  Products ({selectedOrder.products?.length ?? 0})
                </div>
                {selectedOrder.products?.length > 0 ? (
                  <div className="border border-gray-100 rounded-[10px] divide-y divide-gray-100 overflow-hidden">
                    {selectedOrder.products.map((product, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 shrink-0 rounded-full bg-[#DCFCE7] text-[#14532d] flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-gray-800 truncate">
                              {product.name || "Unnamed product"}
                            </p>
                            {product.quantity && (
                              <p className="text-xs text-gray-400">
                                Qty: {product.quantity}
                                {product.unit ? ` ${product.unit}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        {product.price != null && (
                          <p className="font-semibold text-sm text-gray-800 shrink-0">
                            ₱{Number(product.price).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 bg-[#F6F6F6] rounded-[10px] px-4 py-6 text-center">
                    No products listed
                  </p>
                )}
              </div>
              <div className="bg-[#F6F6F6] rounded-[10px] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-gray-400 text-[11px] font-semibold uppercase tracking-[1.5px] mb-4">
                  <FiClock size={13} />
                  Order Timeline
                </div>
                {(() => {
                  const steps = getTimelineSteps(selectedOrder);
                  if (steps.length === 0) {
                    return (
                      <p className="text-sm text-gray-400">
                        No timeline records yet.
                      </p>
                    );
                  }
                  return (
                    <div>
                      {steps.map((step, idx) => {
                        const isLast = idx === steps.length - 1;
                        const StepIcon = step.Icon;
                        return (
                          <div key={step.key} className="flex">
                            <div className="flex flex-col items-center mr-3">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                                style={{
                                  backgroundColor: step.bg,
                                  color: step.color,
                                }}
                              >
                                <StepIcon size={19} />
                              </div>
                              {!isLast && (
                                <div className="w-0.5 flex-1 min-h-6 bg-gray-300 my-1" />
                              )}
                            </div>
                            <div className={`flex-1 ${isLast ? "" : "pb-4"}`}>
                              <p className="font-bold text-[15px] sm:text-base text-gray-800 leading-tight">
                                {step.title}
                              </p>
                              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                                {formatTimelineDate(step.date)}
                              </p>
                              {step.key === "cancelled" &&
                                (selectedOrder.cancelReason ||
                                  selectedOrder.cancelledBy) && (
                                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                    {selectedOrder.cancelledBy && (
                                      <span className="capitalize">
                                        By {selectedOrder.cancelledBy}
                                      </span>
                                    )}
                                    {selectedOrder.cancelledBy &&
                                      selectedOrder.cancelReason &&
                                      " • "}
                                    {selectedOrder.cancelReason}
                                  </p>
                                )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center justify-between bg-[#f0fdf4] rounded-[10px] px-4 py-4 gap-3">
                <span className="text-sm font-semibold text-[#14532d]">
                  Total Amount
                </span>
                <span className="text-lg font-bold tracking-tight text-[#14532d] shrink-0">
                  ₱{(selectedOrder.total ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrderPayments;
