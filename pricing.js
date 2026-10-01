const CONFIG = require("./config");

// ======================================================
// تنظیمات اصلی محاسبه
// ======================================================

const TICKET_ISSUE_FEE = 200000; // هزینه صدور بلیت برای هر مسیر
const EMPTY_BERTH_PRICE = 800000; // هزینه هر تخت خالی
const CASH_PROFIT_PER_PERSON = 3000000;
const LOAN_PROFIT_PER_PERSON = 5000000;

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
// تشخیص ظرفیت کوپه
// ======================================================

function getBerthCapacity(value, train = null) {

  const v = String(value || "")
    .trim()
    .toLowerCase();

  // بدون اجاره کوپه
  if (
    v === "none" ||
    v === "no" ||
    v === "false" ||
    v === "0" ||
    v === "بدون اجاره" ||
    v === "بدون اجاره کوپه" ||
    v === "عدم اجاره"
  ) {
    return 0;
  }

  // کوپه ۴ تخته
  if (
    v === "4" ||
    v === "4_berth" ||
    v === "berth4" ||
    v === "چهار تخته" ||
    v === "۴ تخته" ||
    v === "کوپه ۴ تخته"
  ) {
    return 4;
  }

  // کوپه ۶ تخته
  if (
    v === "6" ||
    v === "6_berth" ||
    v === "berth6" ||
    v === "شش تخته" ||
    v === "۶ تخته" ||
    v === "کوپه ۶ تخته"
  ) {
    return 6;
  }

  // اگر انتخاب جداگانه انجام نشده باشد،
  // فعلاً هیچ هزینه تخت خالی اضافه نمی‌کنیم.
  return 0;
}

// ======================================================
// محاسبه تخت‌های خالی
//
// فقط وقتی کوپه اجاره شده باشد.
//
// مثال:
// ۴ نفر در کوپه ۶ تخته
// ۲ تخت خالی
// ۲ × ۸۰۰,۰۰۰ = ۱,۶۰۰,۰۰۰
// این مبلغ بین ۴ نفر تقسیم می‌شود.
// ======================================================

function calculateEmptyBerths(totalPassengers, berthCapacity) {

  const passengers = numberValue(totalPassengers);
  const capacity = numberValue(berthCapacity);

  if (passengers <= 0 || capacity <= 0) {
    return {
      berthCapacity: capacity,
      compartmentsNeeded: 0,
      totalBerths: 0,
      emptyBerths: 0,
      emptyBerthTotal: 0,
      emptyBerthPerPerson: 0
    };
  }

  const compartmentsNeeded =
    Math.ceil(passengers / capacity);

  const totalBerths =
    compartmentsNeeded * capacity;

  const emptyBerths =
    Math.max(0, totalBerths - passengers);

  const emptyBerthTotal =
    emptyBerths * EMPTY_BERTH_PRICE;

  const emptyBerthPerPerson =
    passengers > 0
      ? Math.round(emptyBerthTotal / passengers)
      : 0;

  return {
    berthCapacity: capacity,
    compartmentsNeeded,
    totalBerths,
    emptyBerths,
    emptyBerthTotal,
    emptyBerthPerPerson
  };
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
// ======================================================

function calculateRailTour(data = {}) {

  const route =
    String(data.route || "").toUpperCase();

  const trainKey =
    data.trainKey ||
    data.trainId ||
    "";

  const train =
    getSelectedTrain(route, trainKey);

  if (!train) {
    throw new Error("قطار انتخاب نشده است.");
  }

  // --------------------------------------------------
  // تعداد مسافر
  // --------------------------------------------------

  const adults =
    numberValue(data.adults);

  const children =
    numberValue(data.children);

  const totalPassengers =
    adults + children;

  if (adults <= 0) {
    throw new Error("تعداد بزرگسال وارد نشده است.");
  }

  if (totalPassengers <= 0) {
    throw new Error("تعداد مسافران وارد نشده است.");
  }

  // --------------------------------------------------
  // تعداد شب
  // --------------------------------------------------

  const nights =
    numberValue(data.nights);

  if (nights <= 0) {
    throw new Error("تعداد شب اقامت وارد نشده است.");
  }

  // --------------------------------------------------
  // قیمت هتل
  // --------------------------------------------------

  const hotelPrice =
    numberValue(
      data.hotelPricePerPersonPerNight ||
      data.hotelPrice ||
      data.hotelAdult ||
      0
    );

  if (hotelPrice <= 0) {
    throw new Error("قیمت هتل وارد نشده است.");
  }

  // ==================================================
  // بلیت
  //
  // فرمول:
  //
  // (قیمت بلیت + ۲۰۰ هزار صدور) × ۲
  //
  // ==================================================

  const adultTicket =
    train.ticket;

  const childTicketPercent =
    numberValue(data.childTicketPercent) || 60;

  const childBaseTicket =
    Math.round(
      adultTicket *
      childTicketPercent /
      100
    );

  // بزرگسال
  const adultTicketOneWayWithIssue =
    adultTicket +
    TICKET_ISSUE_FEE;

  const adultTicketRoundTrip =
    adultTicketOneWayWithIssue * 2;

  // کودک
  const childTicketOneWayWithIssue =
    childBaseTicket +
    TICKET_ISSUE_FEE;

  const childTicketRoundTrip =
    childTicketOneWayWithIssue * 2;

  const totalAdultTicket =
    adults *
    adultTicketRoundTrip;

  const totalChildTicket =
    children *
    childTicketRoundTrip;

  const totalTicket =
    totalAdultTicket +
    totalChildTicket;

  // ==================================================
  // هتل
  // ==================================================

  const childHotelPercent =
    numberValue(data.childHotelPercent) || 50;

  const totalAdultHotel =
    adults *
    nights *
    hotelPrice;

  const childHotel =
    Math.round(
      hotelPrice *
      childHotelPercent /
      100
    );

  const totalChildHotel =
    children *
    nights *
    childHotel;

  const totalHotel =
    totalAdultHotel +
    totalChildHotel;

  // ==================================================
  // اجاره کوپه و تخت خالی
  // ==================================================

  const berthOption =
    data.berthOption ||
    data.compartmentType ||
    data.coupeType ||
    data.cabinType ||
    "";

  const berthCapacity =
    getBerthCapacity(
      berthOption,
      train
    );

  const emptyBerth =
    calculateEmptyBerths(
      totalPassengers,
      berthCapacity
    );

  const emptyBerthTotal =
    emptyBerth.emptyBerthTotal;

  const emptyBerthPerPerson =
    emptyBerth.emptyBerthPerPerson;

  // ==================================================
  // هزینه پایه
  // ==================================================

  const baseCost =
    totalTicket +
    totalHotel +
    emptyBerthTotal;

  // ==================================================
  // نوع پرداخت
  // ==================================================

  const paymentType =
    String(
      data.paymentType || "cash"
    ).toLowerCase();

  const isLoan =
    paymentType === "loan" ||
    paymentType === "diamond" ||
    paymentType === "طرح الماس";

  // ==================================================
  // سود
  // ==================================================

  const profitPerPerson =
    isLoan
      ? LOAN_PROFIT_PER_PERSON
      : CASH_PROFIT_PER_PERSON;

  const totalProfit =
    totalPassengers *
    profitPerPerson;

  // ==================================================
  // قیمت نهایی
  // ==================================================

  const finalCost =
    baseCost +
    totalProfit;

  // ==================================================
  // طرح الماس
  //
  // ۶۰٪ ابتدا محاسبه می‌شود.
  // سپس وام به نزدیک‌ترین ۵ میلیون گرد می‌شود.
  //
  // نکته مهم:
  // مبلغ نقدی = مبلغ نهایی - وام گرد شده
  //
  // بنابراین مابه‌التفاوت گرد شدن وام
  // مستقیماً روی سهم نقدی می‌رود.
  // ==================================================

  let customerCash =
    finalCost;

  let loanAmount =
    0;

  let rawLoanAmount =
    0;

  let loanRoundingDifference =
    0;

  if (isLoan) {

    rawLoanAmount =
      Math.round(
        finalCost * 0.60
      );

    loanAmount =
      roundLoanAmount(
        rawLoanAmount
      );

    customerCash =
      finalCost -
      loanAmount;

    loanRoundingDifference =
      loanAmount -
      rawLoanAmount;
  }

  // ==================================================
  // خروجی
  // ==================================================

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

    // ----------------------------------------------
    // بلیت
    // ----------------------------------------------

    ticketIssueFee:
      TICKET_ISSUE_FEE,

    adultTicket,
    childTicket:
      childBaseTicket,

    adultTicketOneWayWithIssue,
    childTicketOneWayWithIssue,

    adultTicketRoundTrip,
    childTicketRoundTrip,

    totalAdultTicket,
    totalChildTicket,
    totalTicket,

    childTicketPercent,

    // ----------------------------------------------
    // هتل
    // ----------------------------------------------

    childHotelPercent,

    childHotel,

    totalAdultHotel,
    totalChildHotel,
    totalHotel,

    // ----------------------------------------------
    // کوپه
    // ----------------------------------------------

    berthOption,

    berthCapacity:
      emptyBerth.berthCapacity,

    compartmentsNeeded:
      emptyBerth.compartmentsNeeded,

    totalBerths:
      emptyBerth.totalBerths,

    emptyBerths:
      emptyBerth.emptyBerths,

    emptyBerthPrice:
      EMPTY_BERTH_PRICE,

    emptyBerthTotal,

    emptyBerthPerPerson,

    // ----------------------------------------------
    // جمع
    // ----------------------------------------------

    baseCost,

    profitPerPerson,
    totalProfit,

    finalCost,

    paymentType,
    isLoan,

    // ----------------------------------------------
    // طرح الماس
    // ----------------------------------------------

    rawLoanAmount,

    loanAmount,

    customerCash,

    loanRoundingDifference
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

  text += `🛏 نوع قطار: ${result.berth}\n`;

  if (result.berthOption) {

    if (result.berthCapacity > 0) {

      text += `🚆 نوع اجاره: کوپه ${result.berthCapacity} تخته\n`;

    } else {

      text += "🚫 اجاره کوپه: ندارد\n";
    }

  } else {

    text += "🚫 اجاره کوپه: ندارد\n";
  }

  text += `⭐ درجه: ${result.trainStars}\n`;
  text += `🕐 حرکت: ${result.departure}\n`;
  text += `🕐 ورود: ${result.arrival}\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 قیمت پایه بلیت بزرگسال: ${formatMoney(
    result.adultTicket
  )} تومان\n`;

  text += `🎫 هزینه صدور هر مسیر: ${formatMoney(
    result.ticketIssueFee
  )} تومان\n`;

  text += `🎫 بلیت بزرگسال با صدور رفت‌وبرگشت: ${formatMoney(
    result.adultTicketRoundTrip
  )} تومان\n`;

  text += `🎫 بلیت کودک با صدور رفت‌وبرگشت: ${formatMoney(
    result.childTicketRoundTrip
  )} تومان\n`;

  text += `👨 بزرگسال: ${result.adults} نفر\n`;
  text += `👶 کودک: ${result.children} نفر\n`;
  text += `👥 مجموع مسافران: ${result.totalPassengers} نفر\n`;

  text += `🌙 تعداد شب: ${result.nights} شب\n`;

  text += `🏨 قیمت هتل هر نفر/شب: ${formatMoney(
    result.hotelPrice
  )} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 مجموع بلیت رفت‌وبرگشت: ${formatMoney(
    result.totalTicket
  )} تومان\n`;

  text += `🏨 مجموع هتل: ${formatMoney(
    result.totalHotel
  )} تومان\n`;

  // ----------------------------------------------
  // تخت خالی
  // ----------------------------------------------

  if (result.berthCapacity > 0) {

    text += `🛏 ظرفیت کوپه: ${result.berthCapacity} نفر\n`;

    text += `🛏 تعداد کوپه موردنیاز: ${result.compartmentsNeeded} عدد\n`;

    text += `🛏 تخت خالی: ${result.emptyBerths} عدد\n`;

    text += `💵 هزینه هر تخت خالی: ${formatMoney(
      result.emptyBerthPrice
    )} تومان\n`;

    text += `💵 مجموع هزینه تخت خالی: ${formatMoney(
      result.emptyBerthTotal
    )} تومان\n`;

    text += `💵 سهم هر مسافر از تخت خالی: ${formatMoney(
      result.emptyBerthPerPerson
    )} تومان\n`;

  } else {

    text += "🛏 هزینه تخت خالی: ندارد\n";
  }

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `💵 هزینه پایه: ${formatMoney(
    result.baseCost
  )} تومان\n`;

  text += `📈 سود هر نفر: ${formatMoney(
    result.profitPerPerson
  )} تومان\n`;

  text += `📈 مجموع سود: ${formatMoney(
    result.totalProfit
  )} تومان\n`;

  text += `💰 قیمت نهایی: ${formatMoney(
    result.finalCost
  )} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `💳 نوع پرداخت: ${paymentText}\n`;

  if (result.isLoan) {

    text += `\n🏦 وام ۶۰٪ قبل از گرد کردن: ${formatMoney(
      result.rawLoanAmount
    )} تومان\n`;

    text += `🏦 مبلغ وام گرد شده: ${formatMoney(
      result.loanAmount
    )} تومان\n`;

    text += `💵 مبلغ نقدی مشتری: ${formatMoney(
      result.customerCash
    )} تومان\n`;

    if (result.loanRoundingDifference !== 0) {

      const difference =
        Math.abs(
          result.loanRoundingDifference
        );

      if (result.loanRoundingDifference > 0) {

        text += `➕ مابه‌التفاوت گرد کردن وام: ${formatMoney(
          difference
        )} تومان\n`;

        text += "ℹ️ این مبلغ از سهم نقدی مشتری کسر شده است.\n";

      } else {

        text += `➖ اختلاف گرد کردن وام: ${formatMoney(
          difference
        )} تومان\n`;

        text += "ℹ️ این مبلغ به سهم نقدی مشتری اضافه شده است.\n";
      }
    }

    text += `\n🧾 کنترل نهایی:\n`;
    text += `💵 نقدی + 🏦 وام = ${formatMoney(
      result.customerCash + result.loanAmount
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

  const adults =
    numberValue(data.adults);

  const children =
    numberValue(data.children);

  const nights =
    numberValue(data.nights);

  const ticketAdult =
    numberValue(
      data.ticketAdult ||
      data.ticketPrice ||
      data.ticket
    );

  const hotelAdult =
    numberValue(
      data.hotelAdult ||
      data.hotelPrice ||
      data.hotel
    );

  const profitPerPerson =
    numberValue(
      data.manualProfit ||
      data.profitPerPerson ||
      data.profit
    );

  const childTicketPercent =
    numberValue(data.childTicketPercent) || 60;

  const childHotelPercent =
    numberValue(data.childHotelPercent) || 50;

  const childTicket =
    Math.round(
      ticketAdult *
      childTicketPercent /
      100
    );

  const childHotel =
    Math.round(
      hotelAdult *
      childHotelPercent /
      100
    );

  const totalTicket =
    adults * ticketAdult +
    children * childTicket;

  const totalHotel =
    adults *
      nights *
      hotelAdult +
    children *
      nights *
      childHotel;

  const totalPassengers =
    adults + children;

  const baseCost =
    totalTicket +
    totalHotel;

  const totalProfit =
    totalPassengers *
    profitPerPerson;

  const finalCost =
    baseCost +
    totalProfit;

  const isLoan =
    String(
      data.paymentType || ""
    ).toLowerCase() === "loan";

  let customerCash =
    finalCost;

  let loanAmount =
    0;

  let rawLoanAmount =
    0;

  if (isLoan) {

    rawLoanAmount =
      Math.round(
        finalCost * 0.60
      );

    loanAmount =
      roundLoanAmount(
        rawLoanAmount
      );

    customerCash =
      finalCost -
      loanAmount;
  }

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

    rawLoanAmount,
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

  text += `🎫 بلیت بزرگسال: ${formatMoney(
    result.ticketAdult
  )} تومان\n`;

  text += `🎫 بلیت کودک: ${formatMoney(
    result.childTicket
  )} تومان\n`;

  text += `🏨 هتل بزرگسال: ${formatMoney(
    result.hotelAdult
  )} تومان\n`;

  text += `🏨 هتل کودک: ${formatMoney(
    result.childHotel
  )} تومان\n`;

  text += "━━━━━━━━━━━━━━━━━━\n";

  text += `🎫 مجموع بلیت: ${formatMoney(
    result.totalTicket
  )} تومان\n`;

  text += `🏨 مجموع هتل: ${formatMoney(
    result.totalHotel
  )} تومان\n`;

  text += `💵 هزینه پایه: ${formatMoney(
    result.baseCost
  )} تومان\n`;

  text += `📈 سود هر نفر: ${formatMoney(
    result.profitPerPerson
  )} تومان\n`;

  text += `📈 مجموع سود: ${formatMoney(
    result.totalProfit
  )} تومان\n`;

  text += `💰 قیمت نهایی: ${formatMoney(
    result.finalCost
  )} تومان\n`;

  if (result.isLoan) {

    text += "━━━━━━━━━━━━━━━━━━\n";

    text += `🏦 وام ۶۰٪ قبل از گرد کردن: ${formatMoney(
      result.rawLoanAmount
    )} تومان\n`;

    text += `🏦 وام ۶۰٪ گرد شده: ${formatMoney(
      result.loanAmount
    )} تومان\n`;

    text += `💵 سهم نقدی مشتری: ${formatMoney(
      result.customerCash
    )} تومان\n`;

    text += `🧾 کنترل: نقدی + وام = ${formatMoney(
      result.customerCash +
      result.loanAmount
    )} تومان\n`;
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

  formatMoney,

  getBerthCapacity,

  calculateEmptyBerths,

  TICKET_ISSUE_FEE,

  EMPTY_BERTH_PRICE,

  CASH_PROFIT_PER_PERSON,

  LOAN_PROFIT_PER_PERSON
};
