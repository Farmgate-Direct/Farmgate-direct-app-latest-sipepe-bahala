// Sales report data actions.
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "../FirebaseConfig";

const usersRef = collection(db, "users");
const ordersRef = collection(db, "orders");
const productsRef = collection(db, "products");

const COMPLETED_STATUSES = ["delivered", "claimed"];
const PLATFORM_COMMISSION_RATE = 0.03;

export interface ReportRange {
  start: Date | null;
  end: Date | null;
}

export const ALL_TIME_RANGE: ReportRange = { start: null, end: null };

const toDateSafe = (value: any): Date | null => {
  if (!value) return null;
  if (value.toDate) {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const inReportRange = (date: Date | null, range: ReportRange): boolean => {
  if (!range.start && !range.end) return true;
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
};

const roundMoney = (value: number) =>
  Math.round(value * 100) / 100;

const numOrNull = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// Subtotal ONLY (delivery fee excluded) — e.g. ₱250 x 0.03 = ₱7.50.
// Prefer backend-written commissionAmount/subTotal, fall back to
// products sum or total-minus-deliveryFee for old orders.
const getOrderSubtotal = (data: any): number => {
  const saved =
    numOrNull(data?.subTotal) ?? numOrNull(data?.subtotal) ?? null;
  if (saved !== null && saved >= 0) return saved;
  const items = Array.isArray(data?.products) ? data.products : [];
  if (items.length > 0) {
    const sum = items.reduce(
      (s: number, item: any) =>
        s + Number(item?.price || 0) * Number(item?.quantity || 0),
      0,
    );
    if (Number.isFinite(sum) && sum >= 0) return roundMoney(sum);
  }
  const total = Number(data?.total) || 0;
  const fee = Number(data?.deliveryFee) || 0;
  return Math.max(0, roundMoney(total - fee));
};

const getOrderCommission = (data: any): number => {
  const saved = numOrNull(data?.commissionAmount);
  if (saved !== null && saved >= 0) return saved;
  return roundMoney(getOrderSubtotal(data) * PLATFORM_COMMISSION_RATE);
};

export const getReportStats = async (range: ReportRange = ALL_TIME_RANGE) => {
  try {
    const completedOrdersSnap = await getDocs(
      query(ordersRef, where("status", "in", COMPLETED_STATUSES)),
    );
    let gross = 0;
    let earnings = 0;
    let totalOrders = 0;
    const orderingCustomers = new Set<string>();
    completedOrdersSnap.forEach((doc) => {
      const data = doc.data();
      if (!inReportRange(toDateSafe(data.createdAt), range)) return;
      totalOrders += 1;
      gross += getOrderSubtotal(data);
      earnings += getOrderCommission(data);
      const buyerKey = data.buyerId || data.buyerName;
      if (buyerKey) orderingCustomers.add(String(buyerKey));
    });
    return {
      gross: roundMoney(gross),
      earnings: roundMoney(earnings),
      farmerNet: roundMoney(gross - earnings),
      totalOrders,
      totalCustomers: orderingCustomers.size,
    };
  } catch (error) {
    console.error("Report Stats Error:", error);
    throw error;
  }
};

export const getYearRevenue = async (year: number) => {
  const safeYear = Number.isInteger(year) ? Math.min(Math.max(year, 2000), 2100) : new Date().getFullYear();
  try {
    const snapshot = await getDocs(
      query(ordersRef, where("status", "in", COMPLETED_STATUSES)),
    );
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const months = monthNames.map((name, m) => {
      const daysInMonth = new Date(safeYear, m + 1, 0).getDate();
      const days = Array.from({ length: daysInMonth }, (_, i) => ({
        label: new Date(safeYear, m, i + 1).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
        }),
        gross: 0,
        earnings: 0,
        orders: 0,
      }));
      return { month: name, gross: 0, earnings: 0, orders: 0, days };
    });
    snapshot.forEach((doc) => {
      const data = doc.data();
      const date = toDateSafe(data.createdAt);
      if (!date || date.getFullYear() !== safeYear) return;
      const entry = months[date.getMonth()];
      const subtotal = getOrderSubtotal(data);
      const commission = getOrderCommission(data);
      entry.gross = roundMoney(entry.gross + subtotal);
      entry.earnings = roundMoney((entry.earnings || 0) + commission);
      entry.orders += 1;
      const day = entry.days[date.getDate() - 1];
      if (day) {
        day.gross = roundMoney(day.gross + subtotal);
        day.earnings = roundMoney((day.earnings || 0) + commission);
        day.orders += 1;
      }
    });
    months.forEach((entry) => {
      entry.gross = roundMoney(entry.gross);
      entry.earnings = roundMoney(entry.earnings || 0);
      entry.days.forEach((day) => {
        day.gross = roundMoney(day.gross);
        day.earnings = roundMoney(day.earnings || 0);
      });
    });
    return months;
  } catch (error) {
    console.error("Year Revenue Error:", error);
    return [];
  }
};

const SALE_CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Egg & Poultry",
  "Rice & Grains",
];

export const getSalesByCategory = async (
  range: ReportRange = ALL_TIME_RANGE,
) => {
  try {
    const [ordersSnap, productsSnap] = await Promise.all([
      getDocs(query(ordersRef, where("status", "in", COMPLETED_STATUSES))),
      getDocs(productsRef),
    ]);
    const productCategoryMap: Record<string, string> = {};
    productsSnap.forEach((doc) => {
      const data = doc.data();
      if (SALE_CATEGORIES.includes(data.category)) {
        productCategoryMap[doc.id] = data.category;
      }
    });
    const categoryMap: Record<string, number> = {
      Vegetables: 0,
      Fruits: 0,
      "Egg & Poultry": 0,
      "Rice & Grains": 0,
    };
    let total = 0;
    ordersSnap.forEach((doc) => {
      const data = doc.data();
      if (!inReportRange(toDateSafe(data.createdAt), range)) return;
      const products = data.products || [];
      products.forEach((item: any) => {
        const category = productCategoryMap[item.productId];
        if (!category) return;
        const amount =
          item.subTotal ||
          (item.price || 0) * (item.quantity || 0);
        categoryMap[category] += amount;
        total += amount;
      });
    });
    return SALE_CATEGORIES.map((category) => ({
      category,
      amount: categoryMap[category],
      percentage:
        total > 0
          ? ((categoryMap[category] / total) * 100).toFixed(1)
          : "0",
    }));
  } catch (error) {
    console.error("Sales By Category Error:", error);
    return [];
  }
};

export const getTopFarmers = async (
  range: ReportRange = ALL_TIME_RANGE,
) => {
  try {
    const farmersSnap = await getDocs(
      query(usersRef, where("role", "==", "farmer")),
    );
    const farmers = farmersSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    const ordersSnap = await getDocs(
      query(ordersRef, where("status", "in", COMPLETED_STATUSES)),
    );
    const salesMap: Record<
      string,
      { sales: number; orders: number; products: Record<string, number> }
    > = {};
    ordersSnap.forEach((doc) => {
      const data = doc.data();
      if (!inReportRange(toDateSafe(data.createdAt), range)) return;
      const farmerId = data.farmerId;
      if (!farmerId) return;
      if (!salesMap[farmerId]) {
        salesMap[farmerId] = { sales: 0, orders: 0, products: {} };
      }
      salesMap[farmerId].sales = roundMoney(
        salesMap[farmerId].sales + getOrderSubtotal(data),
      );
      salesMap[farmerId].orders += 1;
      const items = data.products || [];
      items.forEach((item: any) => {
        const name = item.name || "Unknown";
        salesMap[farmerId].products[name] =
          (salesMap[farmerId].products[name] || 0) + (item.quantity || 0);
      });
    });
    const result = farmers.map((farmer: any) => {
      const farmerSales = salesMap[farmer.id];
      let topProduct = "N/A";
      if (farmerSales?.products) {
        const sorted = Object.entries(farmerSales.products).sort(
          (a, b) => (b[1] as number) - (a[1] as number),
        );
        if (sorted.length > 0) topProduct = sorted[0][0];
      }
      return {
        id: farmer.id,
        name: farmer.fullName || "N/A",
        farm: farmer.farmName || "N/A",
        sales: farmerSales?.sales || 0,
        orders: farmerSales?.orders || 0,
        rating: farmer.rating || 0,
        topProduct,
      };
    });
    result.sort((a, b) => b.sales - a.sales);
    return result.slice(0, 5);
  } catch (error) {
    console.error("Top Farmers Error:", error);
    return [];
  }
};

export const getTopProducts = async (
  range: ReportRange = ALL_TIME_RANGE,
) => {
  try {
    const ordersSnap = await getDocs(
      query(ordersRef, where("status", "in", COMPLETED_STATUSES)),
    );
    const productMap: Record<
      string,
      { name: string; quantity: number; sales: number }
    > = {};
    ordersSnap.forEach((doc) => {
      const data = doc.data();
      if (!inReportRange(toDateSafe(data.createdAt), range)) return;
      const items = data.products || [];
      items.forEach((item: any) => {
        const key = item.productId || item.name;
        const amount = item.subTotal || item.price * item.quantity || 0;
        if (!productMap[key]) {
          productMap[key] = {
            name: item.name || "Unknown",
            quantity: 0,
            sales: 0,
          };
        }
        productMap[key].quantity += item.quantity || 0;
        productMap[key].sales += amount;
      });
    });
    const result = Object.values(productMap);
    result.sort((a, b) => b.sales - a.sales);
    return result.slice(0, 5);
  } catch (error) {
    console.error("Top Products Error:", error);
    return [];
  }
};

const formatPesoPDF = (amount: any): string => {
  const value = Number(amount) || 0;
  return `PHP ${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDatePDF = (date: Date): string =>
  date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const exportReportToPDF = ({
  rangeLabel,
  stats,
  monthlyPerformance,
  salesByCategory,
  topFarmers,
  topProducts,
}: {
  rangeLabel: string;
  stats: any;
  monthlyPerformance: any[];
  salesByCategory: any[];
  topFarmers: any[];
  topProducts: any[];
}) => {
  const fileDate = new Date().toISOString().slice(0, 10);
  const generatedOn = formatDatePDF(new Date());
  const safeRange = rangeLabel || "All Time";

  const monthlyFull = [...(monthlyPerformance || [])];
  const farmers = [...(topFarmers || [])].slice(0, 5);
  const products = [...(topProducts || [])].slice(0, 5);
  const categories = [...(salesByCategory || [])];

  const categoryTotal = categories.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const configs = [
    { body: 9, head: 8.5, pad: 6.5, gap: 12, title: 10.5 },
    { body: 8.5, head: 8.5, pad: 6, gap: 11, title: 10 },
    { body: 8, head: 8, pad: 5.2, gap: 10, title: 9.5 },
    { body: 7.5, head: 7.5, pad: 4.5, gap: 8.5, title: 9 },
    { body: 7, head: 7, pad: 4, gap: 7.5, title: 8.5 },
    { body: 6.5, head: 6.5, pad: 3.2, gap: 6.5, title: 8 },
  ];

  const M = 36;
  const HEADER_H = 36;

  const build = (
    cfg: { body: number; head: number; pad: number; gap: number; title: number },
    monthlyRows: any[],
    trimmedNote: string,
  ) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentW = pageWidth - M * 2;

    const base: any = {
      headStyles: {
        fillColor: [21, 128, 61],
        textColor: 255,
        fontStyle: "bold",
        fontSize: cfg.head,
        halign: "center",
        valign: "middle",
      },
      footStyles: {
        fillColor: [6, 95, 70],
        textColor: 255,
        fontStyle: "bold",
        fontSize: cfg.head,
        halign: "right",
        valign: "middle",
      },
      bodyStyles: {
        fontSize: cfg.body,
        textColor: [31, 41, 55],
        valign: "middle",
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      styles: {
        cellPadding: { top: cfg.pad, bottom: cfg.pad, left: 6, right: 6 },
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
        overflow: "ellipsize",
        fontSize: cfg.body,
      },
      margin: { left: M, right: M, top: HEADER_H + 4, bottom: 40 },
    };

    doc.setFillColor(21, 128, 61);
    doc.rect(0, 0, pageWidth, HEADER_H, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("FarmGate Direct", M, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(220, 252, 231);
    doc.text("Sales & Performance", pageWidth - M, 22, { align: "right" });

    let y = HEADER_H + 18;
    doc.setTextColor(17, 24, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Sales & Performance Report", M, y);
    doc.setFontSize(8);
    const pillText = `  ${safeRange}  `;
    const pillW = doc.getTextWidth(pillText) + 8;
    const pillH = 15;
    doc.setFillColor(21, 128, 61);
    doc.rect(pageWidth - M - pillW, y - 12, pillW, pillH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(pillText, pageWidth - M - pillW + 4, y - 1);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`${generatedOn}   •   FarmGate Direct Admin`, M, y);
    if (trimmedNote) {
      doc.setTextColor(180, 83, 9);
      doc.setFontSize(7);
      doc.text(trimmedNote, pageWidth - M, y, { align: "right" });
    }
    y += 8;
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(1);
    doc.line(M, y, pageWidth - M, y);
    y += cfg.gap;

    const sectionHeader = (title: string, meta: string, yy: number) => {
      const h = 17;
      doc.setFillColor(236, 253, 245);
      doc.rect(M, yy, contentW, h, "F");
      doc.setTextColor(20, 83, 45);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(cfg.title);
      doc.text(title, M + 10, yy + 11.5);
      if (meta) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(cfg.body - 1);
        doc.text(meta, pageWidth - M - 6, yy + 11.5, { align: "right" });
      }
      return yy + h + 4;
    };

    const tableY = (yy: number) => yy;
    const after = () => (doc as any).lastAutoTable.finalY + cfg.gap;

    y = sectionHeader("Report Summary", "delivered orders only", y);
    autoTable(doc, {
      ...base,
      startY: tableY(y),
      head: [["Gross Sales", "Earnings (3%)", "Farmer Net", "Orders", "Customers"]],
      body: [[
        formatPesoPDF(stats?.gross),
        formatPesoPDF(stats?.earnings),
        formatPesoPDF(stats?.farmerNet),
        String(stats?.totalOrders ?? 0),
        String(stats?.totalCustomers ?? 0),
      ]],
      columnStyles: {
        0: { halign: "right" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "center" },
        4: { halign: "center" },
      },
      didParseCell: (d: any) => {
        if (d.section === "body") {
          const tints = [
            [236, 253, 245],
            [254, 249, 195],
            [219, 234, 254],
            [243, 244, 246],
            [243, 244, 246],
          ];
          d.cell.styles.fillColor = tints[d.column.index] || [255, 255, 255];
          d.cell.styles.fontStyle = "bold";
          d.cell.styles.textColor = [17, 24, 39];
        }
      },
    });
    y = after();

    y = sectionHeader(
      "Monthly Performance",
      monthlyRows.length ? `${monthlyRows.length} mo  •  Total ${formatPesoPDF(monthlyRows.reduce((s, m) => s + (Number(m.gross) || 0), 0))}` : "",
      y,
    );
    autoTable(doc, {
      ...base,
      startY: tableY(y),
      head: [["Month", "Gross Sales", "Earnings", "Orders"]],
      foot: monthlyRows.length
        ? [["Total", formatPesoPDF(monthlyRows.reduce((s, m) => s + (Number(m.gross) || 0), 0)), formatPesoPDF(monthlyRows.reduce((s, m) => s + (Number(m.earnings) || 0), 0)), String(monthlyRows.reduce((s, m) => s + (Number(m.orders) || 0), 0))]]
        : undefined,
      body: monthlyRows.length
        ? monthlyRows.map((m) => [String(m.month), formatPesoPDF(m.gross), formatPesoPDF(m.earnings), String(m.orders)])
        : [["No data for the selected period.", "", "", ""]],
      columnStyles: {
        0: { halign: "left", fontStyle: "bold" },
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "center", cellWidth: 62 },
      },
    });
    y = after();

    y = sectionHeader("Sales by Category", categoryTotal ? `Total ${formatPesoPDF(categoryTotal)}` : "", y);
    autoTable(doc, {
      ...base,
      startY: tableY(y),
      head: [["Category", "Amount", "Share"]],
      foot: categories.length ? [["Total", formatPesoPDF(categoryTotal), "100%"]] : undefined,
      body: categories.length
        ? categories.map((c) => [String(c.category), formatPesoPDF(c.amount), `${c.percentage}%`])
        : [["No sales data yet.", "", ""]],
      columnStyles: {
        0: { halign: "left", fontStyle: "bold" },
        1: { halign: "right" },
        2: { halign: "center", cellWidth: 72 },
      },
    });
    y = after();

    y = sectionHeader("Top Farmers", farmers.length ? "Top 5 by sales" : "", y);
    autoTable(doc, {
      ...base,
      startY: tableY(y),
      head: [["#", "Farmer", "Farm", "Total Sales", "Orders"]],
      body: farmers.length
        ? farmers.map((f, i) => [String(i + 1), String(f.name), String(f.farm), formatPesoPDF(f.sales), String(f.orders)])
        : [["–", "No farmer data yet.", "", "", ""]],
      columnStyles: {
        0: { halign: "center", cellWidth: 28, fontStyle: "bold", textColor: [21, 128, 61] },
        1: { halign: "left", fontStyle: "bold" },
        2: { halign: "left" },
        3: { halign: "right", fontStyle: "bold" },
        4: { halign: "center", cellWidth: 58 },
      },
    });
    y = after();

    y = sectionHeader("Top Products", products.length ? "Top 5 by sales" : "", y);
    autoTable(doc, {
      ...base,
      startY: tableY(y),
      head: [["#", "Product", "Total Sales", "Qty"]],
      body: products.length
        ? products.map((p, i) => [String(i + 1), String(p.name), formatPesoPDF(p.sales), String(p.quantity)])
        : [["–", "No product data yet.", "", ""]],
      columnStyles: {
        0: { halign: "center", cellWidth: 28, fontStyle: "bold", textColor: [21, 128, 61] },
        1: { halign: "left", fontStyle: "bold" },
        2: { halign: "right", fontStyle: "bold" },
        3: { halign: "center", cellWidth: 58 },
      },
    });
    const finalY = (doc as any).lastAutoTable.finalY;

    const footerLineY = pageHeight - 30;
    const footerTextY = pageHeight - 19;
    doc.setDrawColor(21, 128, 61);
    doc.setLineWidth(1);
    doc.line(M, footerLineY, pageWidth - M, footerLineY);
    doc.setTextColor(107, 114, 128);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`FarmGate Direct Admin  •  ${safeRange}  •  ${generatedOn}`, M, footerTextY);
    doc.text("Page 1 of 1", pageWidth - M, footerTextY, { align: "right" });

    return { doc, finalY, pageHeight };
  };

  let best: { doc: jsPDF; finalY: number; pageHeight: number } | null = null;
  let bestCfg: { body: number; head: number; pad: number; gap: number; title: number } = configs[configs.length - 1];
  let usedMonthly: any[] = monthlyFull;
  let trimmedNote = "";
  outer: for (let trim = 0; trim <= Math.max(0, monthlyFull.length - 3); trim++) {
    const sliced = trim === 0 ? monthlyFull : monthlyFull.slice(trim);
    const note = trim === 0 ? "" : `Showing recent ${sliced.length} of ${monthlyFull.length} months to fit one page`;
    for (const cfg of configs) {
      const r = build(cfg, sliced, note);
      if (r.doc.getNumberOfPages() === 1) {
        best = r;
        bestCfg = cfg;
        usedMonthly = sliced;
        trimmedNote = note;
        break outer;
      }
    }
  }
  if (!best) {
    const cfg = configs[configs.length - 1];
    const sliced = monthlyFull.slice(-3);
    best = build(cfg, sliced, `Showing recent ${sliced.length} of ${monthlyFull.length} months to fit one page`);
    bestCfg = cfg;
    usedMonthly = sliced;
    trimmedNote = `Showing recent ${sliced.length} of ${monthlyFull.length} months to fit one page`;
  }

  let cur = best;
  let curPad = bestCfg.pad;
  let curGap = bestCfg.gap;
  for (let iter = 0; iter < 12; iter++) {
    const targetBottom = cur.pageHeight - 30 - 16;
    const remaining = targetBottom - cur.finalY;
    if (remaining < 8) break;
    const totalBodyRows =
      1 +
      Math.max(usedMonthly.length, 1) +
      Math.max(categories.length, 1) +
      Math.max(farmers.length, 1) +
      Math.max(products.length, 1);
    const totalRowsWithHeadFoot =
      totalBodyRows + 5 + (usedMonthly.length ? 1 : 0) + (categories.length ? 1 : 0);
    const addPad = Math.min(2.5, (remaining * 0.75) / Math.max(totalRowsWithHeadFoot, 1) / 2);
    const addGap = Math.min(4, (remaining * 0.25) / 5);
    if (addPad < 0.15 && addGap < 0.3) break;
    const nextCfg = {
      ...bestCfg,
      pad: Math.min(14, curPad + addPad),
      gap: Math.min(26, curGap + addGap),
    };
    if (nextCfg.pad <= curPad && nextCfg.gap <= curGap) break;
    const r2 = build(nextCfg, usedMonthly, trimmedNote);
    if (r2.doc.getNumberOfPages() !== 1) break;
    if (r2.finalY <= cur.finalY + 1) break;
    cur = r2;
    curPad = nextCfg.pad;
    curGap = nextCfg.gap;
    bestCfg = nextCfg;
    if (curPad >= 14 && curGap >= 26) break;
  }
  best = cur;

  (best.doc as jsPDF).save(`report-${fileDate}.pdf`);
};
