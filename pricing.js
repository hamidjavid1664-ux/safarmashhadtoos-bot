const CONFIG = require("./config");

// ======================================================
// قیمت و اطلاعات قطارها
// ======================================================

const RAIL_TRAINS = {
  AHVAZ_6: {
    key: "AHVAZ_6",
    route: "AHVAZ",
    routeName: "اهواز ↔ مشهد",
    train: "مهتاب سیر",
    stars: "⭐⭐⭐",
    berth: "۶ تخته",
    departure: "۱۳:۲۰",
    arrival: "۱۵:۲۵",
    ticket: 1940000
  },

  AHVAZ_4_OMID: {
    key: "AHVAZ_4_OMID",
    route: "AHVAZ",
    routeName: "اهواز ↔ مشهد",
    train: "امید رجا",
    stars: "⭐⭐⭐⭐",
    berth: "۴ تخته",
    departure: "۱۶:۴۰",
    arrival: "۱۹:۲۵",
    ticket: 2010000
  },

  AHVAZ_4_KARKHEH: {
    key: "AHVAZ_4_KARKHEH",
    route: "AHVAZ",
    routeName: "اهواز ↔ مشهد",
    train: "کرخه پارس لاریم",
    stars: "⭐⭐⭐⭐",
    berth: "۴ تخته",
    departure: "۱۳:۲۰",
    arrival: "۱۵:۲۵",
    ticket: 2230000
  },

  SHIRAZ_4_SARIR: {
    key: "SHIRAZ_4_SARIR",
    route: "SHIRAZ",
    routeName: "شیراز ↔ مشهد",
    train: "سریر رجا",
    stars: "⭐⭐⭐⭐",
    berth: "۴ تخته",
    departure: "۱۵:۳۰",
    arrival: "۱۵:۴۵",
    ticket: 2010000
  },

  SHIRAZ_4_AHOO: {
    key: "SHIRAZ_4_AHOO",
    route: "SHIRAZ",
    routeName: "شیراز ↔ مشهد",
    train: "آهو رجا",
    stars: "⭐⭐⭐⭐",
    berth: "۴ تخته",
    departure: "۱۵:۳۰",
    arrival: "۱۵:۴۵",
    ticket: 2990000
  }
};

// ======================================================
// ابزارهای عمومی
// ======================================================

function numberValue(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const s = String(value)
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/,/g, "")
    .replace(/٬/g, "")
    .replace(/\s/g, "");

  const n = Number(s);

  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  return numberValue(value).toLocaleString("fa-IR");
}

function getTrain(trainKey) {
  if (!trainKey) return null;

  return RAIL_TRAINS[trainKey] || null;
}

// ======================================================
// گرفتن قطارهای یک مسیر
// ======================================================

function getTrainsForRoute(route) {
  const r = String(route || "").toUpperCase();

  return Object.values(RAIL_TRAINS).filter(
    train => train.route === r
  );
}

// ======================================================
// گرفتن قطار انتخاب‌شده
// ======================================================

function getSelectedTrain(route, trainKey) {
  const train = getTrain(trainKey);

  if (!train) {
    return null;
  }

  if (route && train.route !== String(route).toUpperCase()) {
    return null;
  }

  return train;
}

// ======================================================
// قیمت بلیت قطار
// ======================================================

function getTicketPrice(route, type, trainKey) {
  const train = getSelectedTrain(route, trainKey);

  if (!train) {
    throw new Error("قطار انتخاب نشده یا قطار پیدا نشد.");
  }

  return train.ticket;
}

// ======================================================
// گرد کردن مبلغ وام
//
// مثال:
// 23.4 میلیون -> 25 میلیون
// 22.4 میلیون -> 20 میلیون
// 27.4 میلیون -> 25 میلیون
// 27.6 میلیون -> 30 میلیون
// ======================================================

function roundLoanAmount(amount) {
  const n = numberValue(amount);

  return Math.round(n / 5000000) * 5000000;
}

// ======================================================
// محاسبه تور ریلی
//
// نقدی:
// سود هر نفر = 3,000,000
//
// طرح الماس:
// سود هر نفر = 5,000,000
//
// مشتری در طرح الماس:
// 40 درصد نقد
// 60 درصد وام
// ======================================================

function calculateRailTour(data = {}) {

  const route = String(data.route || "").toUpperCase();
  const trainKey = data.trainKey || data.trainId || "";

  const train = getSelectedTrain(route, trainKey);

  if (!train) {
    throw new Error("قطار انتخاب نشده است.");
  }

  const adults = numberValue(data.adults);
  const children = numberValue(data.children);
  const nights = numberValue(data.nights);

  const hotelPrice = numberValue(
    data.hotelPricePerPersonPerNight ||
    data.hotelPrice ||
    data.hotelAdult ||
    0
  );

  if (adults <= 0) {
    throw new Error("تعداد بزرگسال وارد نشده است.");
  }

  if (nights <= 0) {
    throw new Error("تعداد شب اقامت وارد نشده است.");
  }

  if (hotelPrice <= 0) {
    throw new Error("قیمت هتل وارد نشده است.");
  }

  // --------------------------------------------------
  // بلیت
  // --------------------------------------------------

  const adultTicket = train.ticket;
  const childTicketPercent =
    numberValue(data.childTicketPercent) || 60;

  const childTicket =
    Math.round(adultTicket * childTicketPercent / 100);

  const totalAdultTicket =
    adults * adultTicket;

  const totalChildTicket =
    children * childTicket;

  const totalTicket =
    totalAdultTicket + totalChildTicket;

  // --------------------------------------------------
  // هتل
  //
  // کودک را فعلاً با 50 درصد قیمت هتل محاسبه می‌کنیم.
  // --------------------------------------------------

  const childHotelPercent =
    numberValue(data.childHotelPercent) || 50;

  const totalAdultHotel =
    adults * nights * hotelPrice;

  const childHotel =
    Math.round(hotelPrice * childHotelPercent / 100);

  const totalChildHotel =
    children * nights * childHotel;

  const totalHotel =
    totalAdultHotel + totalChildHotel;

  // --------------------------------------------------
  // هزینه پایه
  // --------------------------------------------------

  const baseCost =
    totalTicket + totalHotel;

  // --------------------------------------------------
  // سود
  // --------------------------------------------------

  const paymentType =
    String(data.paymentType || "cash").toLowerCase();

  const isLoan =
    paymentType === "loan" ||
    paymentType === "diamond" ||
    paymentType === "طرح الماس";

  const profitPerPerson =
    isLoan ? 5000000 : 3000000;

  const totalPassengers =
    adults + children;

  const totalProfit =
    totalPassengers * profitPerPerson;

  // --------------------------------------------------
  // قیمت نهایی فروش
  // --------------------------------------------------

  const finalCost =
    baseCost + totalProfit;

  // --------------------------------------------------
  // طرح الماس
  // --------------------------------------------------

  let customerCash = finalCost;
  let loanAmount = 0;

  if (isLoan) {

    customerCash =
      Math.round(finalCost * 0.4);

    loanAmount =
      roundLoanAmount(finalCost * 0.6);
  }

  return {
    type: "RAIL",

    route,
    routeName: train.routeName,

    trainKey: train.key,
    trainName: train.train,
    trainStars: train.stars,
    berth: train.berth,
    departure: train.departure,
    arrival: train.arrival,

    ticketPrice: train.ticket,

    adults,
    children,
    totalPassengers,

    nights,

    hotelPrice,

    childTicketPercent,
    childHotelPercent,

    adultTicket,
    childTicket,

    totalAdultTicket,
    totalChildTicket,
    totalTicket,

    totalAdultHotel,
    totalChildHotel,
    totalHotel,

    baseCost,

    profitPerPerson,
    totalProfit,

    finalCost,

    paymentType,
    isLoan,

    customerCash,
    loanAmount
  };
}

// ======================================================
// نمایش نتیجه محاسبه تور ریلی
// ======================================================

function formatRailCalculation(result) {

  const paymentText =
    result.isLoan
      ? "💎 طرح الماس"
      : "💵 نقدی";

  let text = "";

  text += "🧮 محاسبه تور ریلی\n";
  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🚆 مسیر: ${result.routeName}\n`;

  text += `🚆 قطار: ${result.trainName}\n`;
  text += `🛏 نوع کوپه: ${result.berth}\n`;
  text += `⭐ درجه: ${result.trainStars}\n`;
  text += `🕐 حرکت: ${result.departure}\n`;
  text += `🕐 ورود: ${result.arrival}\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 قیمت بلیت هر بزرگسال: ${formatMoney(result.adultTicket)} تومان\n`;
  text += `🎫 قیمت بلیت کودک: ${formatMoney(result.childTicket)} تومان\n`;

  text += `👨 بزرگسال: ${result.adults} نفر\n`;
  text += `👶 کودک: ${result.children} نفر\n`;

  text += `🌙 تعداد شب: ${result.nights} شب\n`;

  text += `🏨 قیمت هتل هر نفر/شب: ${formatMoney(result.hotelPrice)} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 مجموع بلیت: ${formatMoney(result.totalTicket)} تومان\n`;
  text += `🏨 مجموع هتل: ${formatMoney(result.totalHotel)} تومان\n`;

  text += `💵 هزینه پایه: ${formatMoney(result.baseCost)} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `📈 سود هر نفر: ${formatMoney(result.profitPerPerson)} تومان\n`;
  text += `📈 مجموع سود: ${formatMoney(result.totalProfit)} تومان\n`;

  text += `💰 قیمت نهایی: ${formatMoney(result.finalCost)} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `💳 نوع پرداخت: ${paymentText}\n`;

  if (result.isLoan) {

    text += `\n💵 سهم نقدی ۴۰٪: ${formatMoney(result.customerCash)} تومان\n`;

    text += `🏦 مبلغ وام ۶۰٪ قبل از گرد کردن: ${formatMoney(
      result.finalCost * 0.6
    )} تومان\n`;

    text += `🏦 مبلغ وام گرد شده: ${formatMoney(
      result.loanAmount
    )} تومان\n`;

  } else {

    text += `\n💵 مبلغ قابل دریافت نقدی: ${formatMoney(
      result.finalCost
    )} تومان\n`;
  }

  text += "━━━━━━━━━━━━━━━━━━";

  return text;
}

// ======================================================
// محاسبه دستی تورهای غیر ریلی
// ======================================================

function calculateManualTour(data = {}) {

  const adults = numberValue(data.adults);
  const children = numberValue(data.children);
  const nights = numberValue(data.nights);

  const ticketAdult = numberValue(
    data.ticketAdult ||
    data.ticketPrice ||
    data.ticket
  );

  const hotelAdult = numberValue(
    data.hotelAdult ||
    data.hotelPrice ||
    data.hotel
  );

  const profitPerPerson = numberValue(
    data.manualProfit ||
    data.profitPerPerson ||
    data.profit
  );

  const childTicketPercent =
    numberValue(data.childTicketPercent) || 60;

  const childHotelPercent =
    numberValue(data.childHotelPercent) || 50;

  const childTicket =
    Math.round(ticketAdult * childTicketPercent / 100);

  const childHotel =
    Math.round(hotelAdult * childHotelPercent / 100);

  const totalTicket =
    adults * ticketAdult +
    children * childTicket;

  const totalHotel =
    adults * nights * hotelAdult +
    children * nights * childHotel;

  const totalPassengers =
    adults + children;

  const baseCost =
    totalTicket + totalHotel;

  const totalProfit =
    totalPassengers * profitPerPerson;

  const finalCost =
    baseCost + totalProfit;

  const isLoan =
    String(data.paymentType || "").toLowerCase() === "loan";

  const customerCash =
    isLoan
      ? Math.round(finalCost * 0.4)
      : finalCost;

  const loanAmount =
    isLoan
      ? roundLoanAmount(finalCost * 0.6)
      : 0;

  return {
    ...data,

    adults,
    children,
    nights,

    ticketAdult,
    childTicket,

    hotelAdult,
    childHotel,

    profitPerPerson,

    totalPassengers,

    totalTicket,
    totalHotel,

    baseCost,
    totalProfit,

    finalCost,

    isLoan,
    customerCash,
    loanAmount
  };
}

// ======================================================
// نمایش محاسبه دستی
// ======================================================

function formatManualCalculation(result) {

  let text = "";

  text += "🧮 محاسبه داخلی\n";
  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `👨 بزرگسال: ${result.adults} نفر\n`;
  text += `👶 کودک: ${result.children} نفر\n`;
  text += `🌙 شب اقامت: ${result.nights} شب\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 بلیت بزرگسال: ${formatMoney(result.ticketAdult)} تومان\n`;
  text += `🎫 بلیت کودک: ${formatMoney(result.childTicket)} تومان\n`;

  text += `🏨 هتل بزرگسال: ${formatMoney(result.hotelAdult)} تومان\n`;
  text += `🏨 هتل کودک: ${formatMoney(result.childHotel)} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 مجموع بلیت: ${formatMoney(result.totalTicket)} تومان\n`;
  text += `🏨 مجموع هتل: ${formatMoney(result.totalHotel)} تومان\n`;

  text += `💵 هزینه پایه: ${formatMoney(result.baseCost)} تومان\n`;

  text += `📈 سود هر نفر: ${formatMoney(result.profitPerPerson)} تومان\n`;
  text += `📈 مجموع سود: ${formatMoney(result.totalProfit)} تومان\n`;

  text += `💰 قیمت نهایی: ${formatMoney(result.finalCost)} تومان\n`;

  if (result.isLoan) {

    text += "━━━━━━━━━━━━━━━━━━\n";
    text += `💵 سهم نقدی ۴۰٪: ${formatMoney(result.customerCash)} تومان\n`;
    text += `🏦 وام ۶۰٪ گرد شده: ${formatMoney(result.loanAmount)} تومان\n`;
  }

  text += "━━━━━━━━━━━━━━━━━━";

  return text;
}

// ======================================================
// خروجی‌ها
// ======================================================

module.exports = {

  RAIL_TRAINS,

  getTrain,

  getTrainsForRoute,

  getSelectedTrain,

  getTicketPrice,

  calculateRailTour,

  formatRailCalculation,

  calculateManualTour,

  formatManualCalculation,

  roundLoanAmount,

  formatMoney
};
