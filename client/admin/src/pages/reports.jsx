// Show sales and platform reports.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoPackage } from "react-icons/go";
import { FaUsers } from "react-icons/fa";
import { FaChevronDown } from "react-icons/fa6";
import { IoIosArrowBack } from "react-icons/io";
import { BiSolidReport } from "react-icons/bi";
import { BsBarChartFill } from "react-icons/bs";
import { FiAlertCircle, FiDownload } from "react-icons/fi";
import {
  getReportStats,
  getYearRevenue,
  getSalesByCategory,
  getTopFarmers,
  getTopProducts,
  exportReportToPDF,
} from "../services/reportService";
import { logAdminActivity } from "../services/adminActivityService";
import { toastSuccess, toastError } from "../utils/toast";

const START_YEAR = 2026;

const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  if (currentYear < START_YEAR) return [String(currentYear)];
  const years = [];
  for (let y = START_YEAR; y <= currentYear; y++) {
    years.push(String(y));
  }
  return years;
};

const YEAR_OPTIONS = getYearOptions();

const roundMoneyValue = (value) => Math.round(value * 100) / 100;
// Group daily data into weeks.
// Gross/earnings here are subtotal-based only (delivery fee excluded).
const buildWeeks = (days) => {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    const gross = roundMoneyValue(
      slice.reduce((s, d) => s + (Number(d.gross) || 0), 0),
    );
    const earnings = roundMoneyValue(
      slice.reduce(
        (s, d) =>
          s +
          (Number.isFinite(Number(d.earnings))
            ? Number(d.earnings)
            : roundMoneyValue((Number(d.gross) || 0) * 0.03)),
        0,
      ),
    );
    weeks.push({
      label: `Week ${weeks.length + 1}`,
      range: `${slice[0].label} – ${slice[slice.length - 1].label}`,
      gross,
      earnings,
      orders: slice.reduce((s, d) => s + d.orders, 0),
      days: slice,
    });
  }
  return weeks;
};

const CATEGORY_COLORS = [
  "bg-[#14532d]",
  "bg-yellow-500",
  "bg-blue-500",
  "bg-purple-500",
];

const CATEGORY_COLORS_HEX = ["#14532d", "#eab308", "#3b82f6", "#a855f7"];

// Build donut chart gradient stops.
const buildDonutGradient = (categories) => {
  if (!categories || categories.length === 0) return "#f3f4f6";
  let currentDeg = 0;
  const segments = categories.map((cat, i) => {
    const color = CATEGORY_COLORS_HEX[i % CATEGORY_COLORS_HEX.length];
    const startDeg = currentDeg;
    const sliceDeg = (parseFloat(cat.percentage) / 100) * 360;
    currentDeg += sliceDeg;
    return `${color} ${startDeg}deg ${currentDeg}deg`;
  });
  return `conic-gradient(${segments.join(", ")})`;
};

// Format peso in short form.
const formatPeso = (amount) => {
  const value = Number(amount) || 0;
  if (value >= 1000000) return `₱${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `₱${(value / 1000).toFixed(1)}k`;
  return `₱${value.toFixed(2)}`;
};

const formatPesoFull = (amount) => {
  const value = Number(amount) || 0;
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatCount = (num) => {
  const value = Number(num) || 0;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
};

const SkeletonLine = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const StatCardSkeleton = () => (
  <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 flex items-center gap-4">
    <SkeletonLine className="w-12 h-12 rounded-[10px] shrink-0" />
    <div className="min-w-0 flex-1 space-y-2">
      <SkeletonLine className="h-5 w-16" />
      <SkeletonLine className="h-3 w-20" />
    </div>
  </div>
);

const RowSkeleton = ({ cols = 4 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-4 pr-4">
        <SkeletonLine className="h-4 w-full max-w-24" />
      </td>
    ))}
  </tr>
);

const ListCardSkeleton = () => (
  <div className="bg-white border border-gray-100 rounded-[10px] p-4 space-y-3">
    <div className="flex justify-between items-center">
      <SkeletonLine className="h-4 w-28" />
      <SkeletonLine className="h-4 w-14" />
    </div>
    <SkeletonLine className="h-3 w-20" />
    <div className="flex justify-between items-center">
      <SkeletonLine className="h-4 w-16" />
      <SkeletonLine className="h-3 w-10" />
    </div>
  </div>
);

const PerformanceChart = ({ data, onBarClick }) => {
  const width = 640;
  const height = 168;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 22;
  const padBottom = 26;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxGross = Math.max(...data.map((d) => d.gross), 1);

  const groupW = plotW / Math.max(data.length, 1);
  const barW = Math.min(36, groupW * 0.5);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-135"
        role="img"
        aria-label="Monthly performance chart"
      >
        {data.map((d, i) => {
          const cx = padLeft + groupW * i + groupW / 2;
          const barH =
            d.gross > 0 ? Math.max(4, (d.gross / maxGross) * plotH) : 0;
          return (
            <g
              key={i}
              onClick={onBarClick ? () => onBarClick(i) : undefined}
              className={onBarClick ? "cursor-pointer" : undefined}
            >
              <title>{`${d.range || d.label}: Total Sales ${formatPesoFull(d.gross)}, Earnings ${formatPesoFull(d.earnings)}, Orders ${d.orders}`}</title>
              {d.gross > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={padTop + plotH - barH}
                  width={barW}
                  height={barH}
                  rx="5"
                  fill="#14532d"
                  className={onBarClick ? "hover:opacity-80 transition" : undefined}
                />
              )}
              {d.gross > 0 && (
                <text
                  x={cx}
                  y={padTop + plotH - barH - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#374151"
                >
                  {formatPeso(d.gross)}
                </text>
              )}
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#9ca3af"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const ReportAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [yearKey, setYearKey] = useState(() => {
    const current = String(new Date().getFullYear());
    return YEAR_OPTIONS.includes(current) ? current : YEAR_OPTIONS[YEAR_OPTIONS.length - 1];
  });
  const [rangeDropdownOpen, setRangeDropdownOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const rangeDropdownRef = useRef(null);
  const [stats, setStats] = useState({
    gross: 0,
    earnings: 0,
    farmerNet: 0,
    totalOrders: 0,
    totalCustomers: 0,
  });
  const [yearRevenue, setYearRevenue] = useState([]);
  const monthDays = useMemo(
    () =>
      selectedMonth === null
        ? []
        : (yearRevenue[selectedMonth]?.days ?? []),
    [selectedMonth, yearRevenue],
  );
  const monthWeeks = useMemo(() => buildWeeks(monthDays), [monthDays]);
  const yearMonths = useMemo(
    () =>
      yearRevenue.map((m) => ({
        label: m.month,
        gross: m.gross,
        earnings: m.earnings,
        orders: m.orders,
      })),
    [yearRevenue],
  );
  // Switch chart data by drill level.
  const monthlyPerformance = useMemo(() => {
    if (selectedMonth === null) return yearMonths;
    if (selectedWeek === null) return monthWeeks;
    return monthWeeks[selectedWeek]?.days ?? [];
  }, [selectedMonth, selectedWeek, monthWeeks, yearMonths]);
  const chartClick =
    selectedWeek !== null
      ? null
      : (i) => {
          if (selectedMonth === null) {
            setSelectedMonth(i);
          } else {
            setSelectedWeek(i);
          }
        };
  const handleBack = () => {
    if (selectedWeek !== null) setSelectedWeek(null);
    else setSelectedMonth(null);
  };
  const [salesByCategory, setSalesByCategory] = useState([]);
  const [topFarmers, setTopFarmers] = useState([]);
  const [topProducts, setTopProducts] = useState([]);

  // Sum total sales across categories.
  const categoryTotal = salesByCategory.reduce(
    (sum, cat) => sum + (cat.amount || 0),
    0,
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        rangeDropdownRef.current &&
        !rangeDropdownRef.current.contains(e.target)
      ) {
        setRangeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Set year range for queries.
  const activeRange = useMemo(() => {
    const y = Number(yearKey);
    return {
      start: new Date(y, 0, 1, 0, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59, 0),
    };
  }, [yearKey]);

  useEffect(() => {
    // Fetch all report data together.
    const loadReportData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [
          statsData,
          revenueData,
          categoryData,
          farmersData,
          productsData,
        ] = await Promise.all([
          getReportStats(activeRange),
          getYearRevenue(Number(yearKey)),
          getSalesByCategory(activeRange),
          getTopFarmers(activeRange),
          getTopProducts(activeRange),
        ]);
        setStats(statsData);
        setYearRevenue(revenueData);
        setSalesByCategory(categoryData);
        setTopFarmers(farmersData);
        setTopProducts(productsData);
      } catch (err) {
        console.error("Load Report Data Error:", err);
        setError("Unable to load report data. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    loadReportData();
  }, [activeRange]);

  const handleExport = () => {
    const exportLabel = yearKey;
    try {
      setExporting(true);
      exportReportToPDF({
        rangeLabel: exportLabel,
        stats,
        monthlyPerformance: yearRevenue,
        salesByCategory,
        topFarmers,
        topProducts,
      });
      logAdminActivity("export_report", `Downloaded PDF report (${exportLabel})`);
      toastSuccess("Report exported", `PDF report for ${exportLabel} is downloading.`);
    } catch (err) {
      console.error("Export Report Error:", err);
      toastError("Export failed", "Could not export the report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-5 sm:mb-6 lg:mb-8 rounded-[10px] p-[18px] sm:p-6 lg:p-8 bg-[#14532d] flex justify-between items-center gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.2em] text-[#bbf7d0] uppercase">
            Overview
          </p>
          <h1 className="text-xl font-black text-white tracking-tight">
            Reports
          </h1>
          <p className="text-xs text-[#dcfce7] mt-1">
            Sales and platform performance
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center justify-center gap-2 bg-white text-[#14532d] font-bold rounded-[5px] px-4 py-2.5 text-sm hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <FiDownload size={16} />
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
          <div className="w-16 h-16 rounded-full bg-white hidden sm:flex items-center justify-center shrink-0">
            <BiSolidReport size={28} className="text-[#14532d]" />
          </div>
        </div>
      </div>
      {error && (
        <div className="mb-6 bg-[#FDE8E8] border border-red-100 text-[#DC2626] px-4 py-3 rounded-[10px] text-sm flex items-center gap-2">
          <FiAlertCircle className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:gap-5 min-w-0">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 min-w-0">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))
            : [
                {
                  title: "Gross Sales",
                  value: formatPeso(stats.gross),
                  icon: <BsBarChartFill size={22} className="text-white" />,
                  iconBg: "bg-white/15",
                  highlight: true,
                },
                {
                  title: "FarmGate Earnings",
                  value: formatPeso(stats.earnings),
                  icon: <BsBarChartFill size={22} className="text-[#D97706]" />,
                  iconBg: "bg-[#fef3c7]",
                },
                {
                  title: "Successful Orders",
                  subtitle: "Delivered only",
                  value: formatCount(stats.totalOrders),
                  icon: <GoPackage size={22} className="text-[#2563EB]" />,
                  iconBg: "bg-[#eff6ff]",
                },
                {
                  title: "Ordering Customers",
                  subtitle: "Buyers with delivered orders",
                  value: formatCount(stats.totalCustomers),
                  icon: <FaUsers size={22} className="text-[#14532d]" />,
                  iconBg: "bg-[#DCFCE7]",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={
                    item.highlight
                      ? "bg-[#14532d] rounded-[10px] shadow-sm p-4 sm:p-5 flex flex-col items-center text-center min-w-0"
                      : "bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col items-center text-center min-w-0"
                  }
                >
                  <div
                    className={`w-12 h-12 shrink-0 rounded-[10px] ${item.iconBg} flex items-center justify-center mb-3`}
                  >
                    {item.icon}
                  </div>
                  <h2
                    className={
                      item.highlight
                        ? "text-[22px] font-bold tracking-tight text-white truncate w-full"
                        : "text-[22px] font-bold tracking-tight text-gray-900 truncate w-full"
                    }
                  >
                    {item.value}
                  </h2>
                  <p
                    className={
                      item.highlight
                        ? "text-[12px] text-[#dcfce7] truncate w-full mt-1"
                        : "text-[12px] text-gray-500 truncate w-full mt-1"
                    }
                  >
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p
                      className={
                        item.highlight
                          ? "text-[11px] text-[#bbf7d0] truncate w-full"
                          : "text-[11px] text-gray-400 truncate w-full"
                      }
                    >
                      {item.subtitle}
                    </p>
                  )}
                </div>
              ))}
        </div>
        {/* Performance chart */}
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              {selectedMonth !== null && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Back to previous level"
                  className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[10px] bg-[#F6F6F6] text-gray-600 hover:bg-[#f0fdf4] hover:text-[#14532d] transition"
                >
                  <IoIosArrowBack size={16} />
                </button>
              )}
              <div>
                <p className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase">
                  Monthly Performance
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedMonth === null
                    ? `${yearKey} · ${yearMonths.length} mo`
                    : selectedWeek === null
                      ? `${yearRevenue[selectedMonth]?.month ?? ""} · ${monthWeeks.length} wk`
                      : `${yearRevenue[selectedMonth]?.month ?? ""} · ${monthWeeks[selectedWeek]?.label ?? ""}`}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 md:ml-auto w-full md:w-auto">
              <div ref={rangeDropdownRef} className="relative w-full sm:w-32">
                <button
                  type="button"
                  onClick={() => setRangeDropdownOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-2 bg-white border border-gray-200 pl-4 pr-3.5 py-2.5 min-h-[50px] rounded-[5px] text-sm font-medium text-gray-700 outline-none focus:border-[#14532d] transition cursor-pointer"
                >
                  <span className="truncate">{yearKey}</span>
                  <FaChevronDown
                    className={`text-gray-400 text-[10px] shrink-0 transition-transform ${
                      rangeDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {rangeDropdownOpen && (
                  <div className="absolute right-0 z-10 mt-1.5 w-full bg-white rounded-[10px] shadow-lg border border-gray-100 overflow-hidden py-1">
                    {YEAR_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setYearKey(option);
                          setSelectedMonth(null);
                          setSelectedWeek(null);
                          setRangeDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition ${
                          option === yearKey
                            ? "bg-[#14532d] text-white font-medium"
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
          {loading ? (
            <div className="flex items-end h-32 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center flex-1 max-w-12"
                >
                  <SkeletonLine className="h-14 w-8 rounded-md" />
                  <SkeletonLine className="h-2.5 w-6 mt-2" />
                </div>
              ))}
            </div>
          ) : monthlyPerformance.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No data for the selected period.
            </p>
          ) : (
            <>
              <PerformanceChart data={monthlyPerformance} onBarClick={chartClick} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div className="bg-[#F6F6F6] rounded-[10px] px-4 py-3">
                  <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-[1.5px]">
                    Gross Sales
                  </p>
                  <p className="text-base font-bold text-gray-800 mt-1">
                    {formatPesoFull(stats.gross)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Total value of successfully delivered orders
                  </p>
                </div>
                <div className="bg-[#F6F6F6] rounded-[10px] px-4 py-3">
                  <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-[1.5px]">
                    FarmGate Earnings (3%)
                  </p>
                  <p className="text-base font-bold text-[#D97706] mt-1">
                    {formatPesoFull(stats.earnings)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    3% commission from successfully delivered orders
                  </p>
                </div>
                <div className="bg-[#F6F6F6] rounded-[10px] px-4 py-3">
                  <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-[1.5px]">
                    Farmer Net Sales
                  </p>
                  <p className="text-base font-bold text-[#14532d] mt-1">
                    {formatPesoFull(stats.farmerNet)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Gross Sales minus FarmGate Earnings
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Category and products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 min-w-0">
          <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 flex flex-col min-w-0">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase pt-1">
                Sales by Category
              </h2>
              {loading ? (
                <div className="space-y-2 shrink-0 flex flex-col items-end">
                  <SkeletonLine className="h-2.5 w-20" />
                  <SkeletonLine className="h-6 w-28" />
                </div>
              ) : (
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-gray-500">
                    Total Sales
                  </p>
                  <p className="text-xl font-bold text-[#14532d] mt-1">
                    {formatPesoFull(categoryTotal)}
                  </p>
                </div>
              )}
            </div>
            {loading ? (
              <div className="flex flex-1 items-center justify-center gap-8 py-4">
                <SkeletonLine className="w-32 h-32 rounded-full shrink-0" />
                <div className="space-y-2.5 w-full sm:flex-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between gap-3">
                      <SkeletonLine className="h-3 w-20" />
                      <SkeletonLine className="h-3 w-14" />
                    </div>
                  ))}
                </div>
              </div>
            ) : salesByCategory.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No sales data yet.
              </p>
            ) : (
              <div className="flex flex-1 flex-col sm:flex-row items-center justify-center gap-4 px-1">
                <div
                  className="relative w-32 h-32 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: buildDonutGradient(salesByCategory) }}
                >
                  <div className="absolute w-16 h-16 bg-white rounded-full"></div>
                </div>
                <div className="w-full sm:flex-1 space-y-1">
                  {salesByCategory.slice(0, 5).map((cat, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 min-h-10"
                    >
                      <span className="flex items-center gap-2 min-w-0 text-sm text-gray-700">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            CATEGORY_COLORS[i % CATEGORY_COLORS.length]
                          }`}
                        ></span>
                        <span className="truncate">{cat.category}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-sm font-bold text-gray-800 whitespace-nowrap">
                          {formatPeso(cat.amount)}
                        </span>
                        <span className="block text-[11px] text-gray-400">
                          {cat.percentage}%
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 min-w-0">
            <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4 sm:mb-6">
              Top Products
            </h2>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-105 table-fixed text-sm">
                <thead>
                  <tr className="text-left text-gray-500 uppercase text-[11px] font-semibold tracking-[1.5px]">
                    <th className="pb-3 pr-4 font-semibold">Rank</th>
                    <th className="pb-3 pr-4 font-semibold">Product</th>
                    <th className="pb-3 pr-4 font-semibold">Total Sales</th>
                    <th className="pb-3 font-semibold">Quantity Sold</th>
                  </tr>
                </thead>
              <tbody className="text-gray-700">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <RowSkeleton key={i} cols={4} />
                  ))
                ) : topProducts.length > 0 ? (
                  topProducts.map((product, i) => (
                    <tr
                      key={product.name + i}
                      className="hover:bg-[#F6F6F6] transition"
                    >
                      <td className="py-3 pr-4 text-gray-800 font-semibold">
                        {i + 1}
                      </td>
                      <td className="pr-4 font-medium text-gray-800 truncate">
                        {product.name}
                      </td>
                      <td className="pr-4 font-semibold text-gray-800 whitespace-nowrap">
                        {formatPeso(product.sales)}
                      </td>
                      <td>{product.quantity}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-sm text-gray-400"
                    >
                      No product data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <ListCardSkeleton key={i} />
              ))
            ) : topProducts.length > 0 ? (
              topProducts.map((product, i) => (
                <div key={product.name + i} className="bg-white border border-gray-100 rounded-[10px] p-4">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800 truncate min-w-0">
                      {i + 1}. {product.name}
                    </span>
                    <span className="font-semibold text-sm text-gray-800 shrink-0">
                      {formatPeso(product.sales)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Quantity sold: {product.quantity}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-400 text-sm">
                No product data yet.
              </div>
            )}
          </div>
        </div>
        </div>
        {/* Top farmers */}
        <div className="bg-white rounded-[10px] shadow-sm border border-gray-100 p-4 sm:p-5 lg:p-6 min-w-0">
          <h2 className="text-[11px] font-semibold tracking-[1.5px] text-gray-500 uppercase mb-4 sm:mb-6">
            Top Performing Farmers
          </h2>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-140 text-sm">
              <thead>
                <tr className="text-left text-gray-500 uppercase text-[11px] font-semibold tracking-[1.5px]">
                  <th className="pb-3 pr-4 font-semibold">Rank</th>
                  <th className="pb-3 pr-4 font-semibold">Farmer</th>
                  <th className="pb-3 pr-4 font-semibold">Farm</th>
                  <th className="pb-3 pr-4 font-semibold">Total Sales</th>
                  <th className="pb-3 font-semibold">Orders</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <RowSkeleton key={i} cols={5} />
                  ))
                ) : topFarmers.length > 0 ? (
                  topFarmers.map((farmer, i) => (
                    <tr
                      key={farmer.id}
                      className="hover:bg-[#F6F6F6] transition"
                    >
                      <td className="py-3 pr-4 text-gray-800 font-semibold">
                        {i + 1}
                      </td>
                      <td className="pr-4 font-medium text-gray-800">
                        {farmer.name}
                      </td>
                      <td className="pr-4 max-w-40 truncate">
                        {farmer.farm}
                      </td>
                      <td className="pr-4 font-semibold text-gray-800 whitespace-nowrap">
                        {formatPeso(farmer.sales)}
                      </td>
                      <td>{farmer.orders}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-sm text-gray-400"
                    >
                      No farmer data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <ListCardSkeleton key={i} />
              ))
            ) : topFarmers.length > 0 ? (
              topFarmers.map((farmer, i) => (
                <div key={farmer.id} className="bg-white border border-gray-100 rounded-[10px] p-4">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="font-semibold text-sm text-gray-800 truncate min-w-0">
                      {i + 1}. {farmer.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    {farmer.farm}
                  </p>
                  <div className="flex justify-between items-center mt-3">
                    <span className="font-semibold text-sm text-gray-800">
                      {formatPeso(farmer.sales)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {farmer.orders} orders
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-400 text-sm">
                No farmer data yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ReportAnalytics;
