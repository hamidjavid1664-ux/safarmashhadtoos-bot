// ========================================
// pricing.js
// محاسبات تور ریلی و سایر قیمت‌گذاری‌ها
// ========================================

const CONFIG = require("./config");

// ========================================
// تبدیل اعداد فارسی به انگلیسی
// ========================================

function toEnglishDigits(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

// ========================================
// تبدیل عدد به اعداد فارسی
// ========================================

function toPersianDigits(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

// ========================================
// فرمت تومان
// ========================================

function formatToman(value) {
  const number = Number(value || 0);

  return number
    .toLocaleString("fa-IR")
    .replace(/٬/g, "٬") + " تومان";
}

// ========================================
// فرمت عدد بدون تومان
// ========================================

function formatNumber(value) {
  const number = Number(value || 0);

  return number
    .toLocaleString("fa-IR");
}

// ========================================
// گرد کردن مبلغ وام
// ========================================

function roundLoanAmount(amount) {
  const value = Number(amount || 0);

  return Math.round(value / 100000) * 100000;
}

// ========================================
// تنظیمات قیمت‌گذاری
// ========================================

const PRICING = {

  rail: {

    // قیمت پایه بلیط یک‌طرفه
    oneWayTicket: 2990000,

    // هزینه صدور هر بلیط یک‌طرفه
    oneWayIssueFee: 200000,

    // درصد بلیط کودک
    childTicketPercent: 60,

    // هزینه پیش‌فرض کوپه خصوصی
    privateCompartmentFee: 0
  },

  hotel: {

    // قیمت پیش‌فرض هتل هر نفر / هر شب
    perPersonPerNight: 2200000,

    // درصد هتل کودک
    childPercent: 50
  },

  profit: {

    // سود پیش‌فرض هر نفر
    perPerson: 3000000
  }

};

// ========================================
// مسیرهای ریلی
// ========================================

const RAIL_ROUTES = {

  "اهواز": {
    title: "اهواز",
    oneWayTicket: 2990000
  },

  "شیراز": {
    title: "شیراز",
    oneWayTicket: 2990000
  },

  "اهواز-مشهد": {
    title: "اهواز → مشهد",
    oneWayTicket: 2990000
  },

  "شیراز-مشهد": {
    title: "شیراز → مشهد",
    oneWayTicket: 2990000
  }

};

// ========================================
// قیمت بلیط ریلی
// ========================================

function getRailTicketPrice(route) {

  if (!route) {
    return PRICING.rail.oneWayTicket;
  }

  const normalized = String(route).trim();

  if (RAIL_ROUTES[normalized]) {
    return RAIL_ROUTES[normalized].oneWayTicket;
  }

  return PRICING.rail.oneWayTicket;
}

// ========================================
// محاسبه تور ریلی
// ========================================

function calculateRailTour(options = {}) {

  const route = options.route || "اهواز-مشهد";

  const adults = Math.max(
    0,
    Number(options.adults || 0)
  );

  const children = Math.max(
    0,
    Number(options.children || 0)
  );

  const nights = Math.max(
    1,
    Number(options.nights || 1)
  );

  const hotelPrice = Math.max(
    0,
    Number(
      options.hotelPrice ||
      PRICING.hotel.perPersonPerNight
    )
  );

  const childHotelPercent = Math.max(
    0,
    Number(
      options.childHotelPercent ??
      PRICING.hotel.childPercent
    )
  );

  const profitPerPerson = Math.max(
    0,
    Number(
      options.profitPerPerson ??
      PRICING.profit.perPerson
    )
  );

  const privateCompartment =
    options.privateCompartment === true ||
    options.privateCompartment === "yes";

  const privateCompartmentFee = Math.max(
    0,
    Number(
      options.privateCompartmentFee ||
      PRICING.rail.privateCompartmentFee
    )
  );

  // ----------------------------------------
  // قطار
  // ----------------------------------------

  const oneWayTicket =
    getRailTicketPrice(route);

  const issueFee =
    PRICING.rail.oneWayIssueFee;

  const childTicketPercent =
    PRICING.rail.childTicketPercent;

  const adultRoundTrip =
    (oneWayTicket * 2) +
    (issueFee * 2);

  const childOneWay =
    oneWayTicket *
    (childTicketPercent / 100);

  const childRoundTrip =
    (childOneWay * 2) +
    (issueFee * 2);

  const adultRailTotal =
    adults * adultRoundTrip;

  const childRailTotal =
    children * childRoundTrip;

  let railTotal =
    adultRailTotal +
    childRailTotal;

  if (privateCompartment) {
    railTotal += privateCompartmentFee;
  }

  // ----------------------------------------
  // هتل
  // ----------------------------------------

  const adultHotelPerPerson =
    hotelPrice * nights;

  const childHotelPerPerson =
    adultHotelPerPerson *
    (childHotelPercent / 100);

  const adultHotelTotal =
    adults * adultHotelPerPerson;

  const childHotelTotal =
    children * childHotelPerPerson;

  const hotelTotal =
    adultHotelTotal +
    childHotelTotal;

  // ----------------------------------------
  // مجموع مسافران
  // ----------------------------------------

  const totalPassengers =
    adults + children;

  // ----------------------------------------
  // خرید خالص
  // ----------------------------------------

  const netPurchase =
    railTotal + hotelTotal;

  // ----------------------------------------
  // سود
  // ----------------------------------------

  const totalProfit =
    totalPassengers *
    profitPerPerson;

  // ----------------------------------------
  // قیمت فروش
  // ----------------------------------------

  const finalPrice =
    netPurchase + totalProfit;

  return {

    route,

    adults,

    children,

    totalPassengers,

    nights,

    hotelPrice,

    childHotelPercent,

    profitPerPerson,

    privateCompartment,

    privateCompartmentFee,

    rail: {

      oneWayTicket,

      issueFee,

      adultRoundTrip,

      childOneWay,

      childRoundTrip,

      adultRailTotal,

      childRailTotal,

      total: railTotal

    },

    hotel: {

      adultHotelPerPerson,

      childHotelPerPerson,

      adultHotelTotal,

      childHotelTotal,

      total: hotelTotal

    },

    netPurchase,

    totalProfit,

    finalPrice

  };

}

// ========================================
// نمایش محاسبه ریلی
// ========================================

function formatRailCalculation(result) {

  if (!result) {
    return "❌ اطلاعات محاسبه موجود نیست.";
  }

  const privateText =
    result.privateCompartment
      ? "بله"
      : "خیر";

  const routeText =
    result.route || "نامشخص";

  return `
🧮 محاسبه داخلی تور ریلی
━━━━━━━━━━━━━━━━━━
🚆 مسیر: ${routeText}
👨 بزرگسال: ${formatNumber(result.adults)} نفر
👶 کودک ۲ تا ۱۲ سال: ${formatNumber(result.children)} نفر
👥 مجموع مسافران: ${formatNumber(result.totalPassengers)} نفر
━━━━━━━━━━━━━━━━━━
🚆 محاسبه قطار
قیمت بلیط: ${formatToman(result.rail.oneWayTicket)}
هزینه صدور هر بلیط یک‌طرفه: ${formatToman(result.rail.issueFee)}
بلیط رفت و برگشت بزرگسال: ${formatToman(result.rail.adultRoundTrip)}
بلیط رفت و برگشت کودک: ${formatToman(result.rail.childRoundTrip)}
🚪 کوپه خصوصی: ${privateText}
🚆 مجموع قطار: ${formatToman(result.rail.total)}
━━━━━━━━━━━━━━━━━━
🏨 محاسبه هتل
قیمت هتل هر نفر / هر شب: ${formatToman(result.hotelPrice)}
تعداد شب: ${formatNumber(result.nights)}
درصد هتل کودک: ${formatNumber(result.childHotelPercent)}٪
هتل هر بزرگسال: ${formatToman(result.hotel.adultHotelPerPerson)}
هتل هر کودک: ${formatToman(result.hotel.childHotelPerPerson)}
🏨 مجموع هتل: ${formatToman(result.hotel.total)}
━━━━━━━━━━━━━━━━━━
💰 خرید خالص: ${formatToman(result.netPurchase)}
📈 سود هر نفر: ${formatToman(result.profitPerPerson)}
📈 مجموع سود: ${formatToman(result.totalProfit)}
━━━━━━━━━━━━━━━━━━
💵 قیمت نهایی فروش: ${formatToman(result.finalPrice)}
━━━━━━━━━━━━━━━━━━
`.trim();

}

// ========================================
// محاسبه دستی تور
// ========================================

function calculateManualTour(options = {}) {

  const adults =
    Number(options.adults || 0);

  const children =
    Number(options.children || 0);

  const totalPassengers =
    adults + children;

  const basePrice =
    Number(options.basePrice || 0);

  const profitPerPerson =
    Number(
      options.profitPerPerson ||
      PRICING.profit.perPerson
    );

  const purchasePrice =
    basePrice;

  const totalProfit =
    totalPassengers *
    profitPerPerson;

  const finalPrice =
    purchasePrice +
    totalProfit;

  return {

    adults,

    children,

    totalPassengers,

    purchasePrice,

    profitPerPerson,

    totalProfit,

    finalPrice,

    loanAmount:
      roundLoanAmount(finalPrice * 0.60)

  };

}

// ========================================
// خروجی محاسبه دستی
// ========================================

function formatManualCalculation(result) {

  return `
🧮 محاسبه تور
━━━━━━━━━━━━━━━━━━
👨 بزرگسال: ${formatNumber(result.adults)} نفر
👶 کودک: ${formatNumber(result.children)} نفر
👥 مجموع مسافران: ${formatNumber(result.totalPassengers)} نفر
━━━━━━━━━━━━━━━━━━
💰 خرید خالص: ${formatToman(result.purchasePrice)}
📈 سود هر نفر: ${formatToman(result.profitPerPerson)}
📈 مجموع سود: ${formatToman(result.totalProfit)}
━━━━━━━━━━━━━━━━━━
💵 قیمت نهایی فروش: ${formatToman(result.finalPrice)}
━━━━━━━━━━━━━━━━━━
`.trim();

}

// ========================================
// خروجی‌ها
// ========================================

module.exports = {

  PRICING,

  RAIL_ROUTES,

  calculateRailTour,

  formatRailCalculation,

  calculateManualTour,

  formatManualCalculation,

  roundLoanAmount,

  formatToman,

  formatNumber,

  toEnglishDigits,

  toPersianDigits

};
