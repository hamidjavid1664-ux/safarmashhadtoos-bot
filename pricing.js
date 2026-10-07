// ============================================================
// موتور محاسبه قیمت تور سفر مشهد توس
// نسخه اصلاح‌شده و مستقل از config.js
// ============================================================

const SETTINGS = {
  HOTEL_PRICE_PER_NIGHT: 2300000,
  HOTEL_CHILD_PERCENT: 50,
  TICKET_ISSUE_FEE_ONE_WAY: 200000,
  TRAIN_CHILD_TICKET_PERCENT: 60,
  EMPTY_BERTH_FEE: 800000,
  RAIL_NIGHTS: 4,
  RAIL_CASH_PROFIT: 3000000,
  RAIL_LOAN_PROFIT: 5000000,
  AIR_CASH_PROFIT: 3500000,
  AIR_LOAN_PROFIT: 6000000,
  LOAN_ROUND_STEP: 5000000,
  CASH_ROUND_STEP: 100000,
  DIAMOND_TOTAL_ROUND_STEP: 500000
};

const RAIL_TRAINS = {
  AHVAZ_6: {
    route: "AHVAZ",
    name: "اهواز ↔ مشهد",
    train: "مهدیس / مهتاب سیر جم",
    stars: "۳ ستاره، ۶ تخته",
    capacity: 6,
    berth: "۶ تخته",
    ticket: 1940000
  },
  AHVAZ_4_OMID: {
    route: "AHVAZ",
    name: "اهواز ↔ مشهد",
    train: "امید / رجا",
    stars: "۴ ستاره، ۴ تخته",
    capacity: 4,
    berth: "۴ تخته",
    ticket: 2010000
  },
  AHVAZ_4_KARKHEH: {
    route: "AHVAZ",
    name: "اهواز ↔ مشهد",
    train: "کرخه / پارس لاریم",
    stars: "۴ ستاره، ۴ تخته",
    capacity: 4,
    berth: "۴ تخته",
    ticket: 2230000
  },
  SHIRAZ_4_SARIR: {
    route: "SHIRAZ",
    name: "شیراز ↔ مشهد",
    train: "سریر / رجا",
    stars: "۴ ستاره، ۴ تخته",
    capacity: 4,
    berth: "۴ تخته",
    ticket: 2010000
  },
  SHIRAZ_4_AHOO: {
    route: "SHIRAZ",
    name: "شیراز ↔ مشهد",
    train: "آهو / رجا",
    stars: "۴ ستاره، ۴ تخته",
    capacity: 4,
    berth: "۴ تخته",
    ticket: 2990000
  }
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  return Math.round(toNumber(value)).toLocaleString("fa-IR") + " تومان";
}

function formatNumber(value) {
  return Math.round(toNumber(value)).toLocaleString("fa-IR");
}

function roundLoanAmount(amount) {
  const step = SETTINGS.LOAN_ROUND_STEP;
  return Math.ceil(toNumber(amount) / step) * step;
}

function roundUpAmount(amount, step) {
  const n = toNumber(amount);
  const s = Math.max(1, toNumber(step));
  return Math.ceil(n / s) * s;
}

function roundCashAmount(amount) {
  return roundUpAmount(amount, SETTINGS.CASH_ROUND_STEP);
}

function roundDiamondTotal(amount) {
  return roundUpAmount(amount, SETTINGS.DIAMOND_TOTAL_ROUND_STEP);
}

function applyDiamondSplit(totalAmount, loanPercent = 60) {
  const total = roundDiamondTotal(totalAmount);
  const allowed = [50, 60, 70, 80];
  const percent = allowed.includes(Number(loanPercent)) ? Number(loanPercent) : 60;
  let loanAmount = roundLoanAmount(total * percent / 100);

  if (loanAmount >= total) {
    loanAmount = Math.max(0, Math.floor((total - 1) / SETTINGS.LOAN_ROUND_STEP) * SETTINGS.LOAN_ROUND_STEP);
  }

  const customerCash = total - loanAmount;
  return {
    total,
    loanPercent: percent,
    cashPercent: 100 - percent,
    loanAmount,
    customerCash,
    cashPercentActual: total ? (customerCash / total) * 100 : 0,
    loanPercentActual: total ? (loanAmount / total) * 100 : 0
  };
}

function getTrainsForRoute(route) {
  return Object.entries(RAIL_TRAINS)
    .filter(([, item]) => item.route === route)
    .map(([key, item]) => ({ key, ...item }));
}

function getCompartmentPlan(passengers, capacity) {
  passengers = Math.floor(toNumber(passengers));
  capacity = Math.floor(toNumber(capacity));

  if (passengers <= 0 || ![4, 6].includes(capacity)) {
    throw new Error("تعداد مسافر یا ظرفیت کوپه نامعتبر است.");
  }

  if (passengers % capacity !== 0) {
    throw new Error("برای اجاره کوپه اختصاصی، تعداد مسافران باید متناسب با ظرفیت کوپه باشد یا هزینه تخت‌های خالی محاسبه شود.");
  }

  const compartments = Math.ceil(passengers / capacity);
  const totalCapacity = compartments * capacity;

  return {
    capacity,
    compartments,
    totalCapacity,
    emptyBerths: totalCapacity - passengers
  };
}

function calculateRailTour(data) {
  const route = String(data.route || "AHVAZ").toUpperCase();
  const adults = Math.floor(toNumber(data.adults));
  const children = Math.floor(toNumber(data.children));
  const totalPassengers = adults + children;
  const nights = Math.floor(toNumber(data.nights || SETTINGS.RAIL_NIGHTS));
  const hotelPrice = toNumber(
    data.hotelPricePerPersonPerNight || data.hotelPrice || SETTINGS.HOTEL_PRICE_PER_NIGHT
  );
  const childHotelPercent = toNumber(
    data.childHotelPercent ?? SETTINGS.HOTEL_CHILD_PERCENT
  );
  const childTicketPercent = toNumber(
    data.childTicketPercent ?? SETTINGS.TRAIN_CHILD_TICKET_PERCENT
  );
  const paymentType = data.paymentType === "loan" ? "loan" : "cash";
  const privateCompartment = Boolean(data.privateCompartment);

  if (adults <= 0) throw new Error("تعداد بزرگسال باید حداقل ۱ نفر باشد.");
  if (children < 0) throw new Error("تعداد کودک نامعتبر است.");
  if (nights <= 0) throw new Error("تعداد شب اقامت نامعتبر است.");
  if (hotelPrice <= 0) throw new Error("قیمت هتل وارد نشده است.");

  let trainKey = data.trainKey || data.train;
  let train = trainKey ? RAIL_TRAINS[trainKey] : null;

  if (!train) {
    const trains = getTrainsForRoute(route);
    if (!trains.length) throw new Error("مسیر ریلی پیدا نشد.");
    train = trains[0];
    trainKey = train.key;
  }

  if (train.route !== route) throw new Error("قطار انتخاب‌شده با مسیر هماهنگ نیست.");

  const issueOneWay = SETTINGS.TICKET_ISSUE_FEE_ONE_WAY;
  const adultRoundTrip = (train.ticket + issueOneWay) * 2;
  const childTicketOneWay = train.ticket * childTicketPercent / 100;
  const childRoundTrip = (childTicketOneWay + issueOneWay) * 2;

  let adultTrainNet = adultRoundTrip;
  let childTrainNet = childRoundTrip;
  let privateCompartmentFee = 0;
  let compartmentPlan = null;

  if (privateCompartment) {
    if (totalPassengers !== 3 && totalPassengers !== 5) {
      throw new Error("اجاره کوپه اختصاصی طبق فرمول فعلی فقط برای ۳ یا ۵ نفر فعال است.");
    }

    compartmentPlan = getCompartmentPlan(totalPassengers, train.capacity);

    // طبق فرمول شما: بلیت + صدور × ۲، سپس ۸۰۰ هزار برای هر تخت خالی ÷ تعداد نفرات
    privateCompartmentFee =
      SETTINGS.EMPTY_BERTH_FEE * compartmentPlan.emptyBerths;

    const baseRoundTripPerPerson = (train.ticket + issueOneWay) * 2;
    const extraPerPerson = privateCompartmentFee / totalPassengers;

    adultTrainNet = baseRoundTripPerPerson + extraPerPerson;
    childTrainNet = baseRoundTripPerPerson + extraPerPerson;
  }

  const adultHotel = hotelPrice * nights;
  const childHotel = hotelPrice * childHotelPercent / 100 * nights;

  const adultsTotal = (adultTrainNet + adultHotel) * adults;
  const childrenTotal = (childTrainNet + childHotel) * children;
  const netPurchaseTotal = adultsTotal + childrenTotal;

  const profitPerPerson =
    paymentType === "loan"
      ? SETTINGS.RAIL_LOAN_PROFIT
      : SETTINGS.RAIL_CASH_PROFIT;

  const totalProfit = profitPerPerson * totalPassengers;
  const rawFinalPrice = netPurchaseTotal + totalProfit;
  const finalPrice = paymentType === "loan"
    ? roundDiamondTotal(rawFinalPrice)
    : roundCashAmount(rawFinalPrice);

  let customerCash = 0;
  let loanAmount = 0;
  let loanPercent = null;

  if (paymentType === "loan") {
    const split = applyDiamondSplit(finalPrice, data.loanPercent ?? 60);
    customerCash = split.customerCash;
    loanAmount = split.loanAmount;
    loanPercent = split.loanPercent;
  }

  return {
    route,
    trainKey,
    routeInfo: train,
    adults,
    children,
    totalPassengers,
    nights,
    hotelPrice,
    childHotelPercent,
    childTicketPercent,
    privateCompartment,
    compartmentPlan,
    privateCompartmentFee,
    ticket: {
      oneWay: train.ticket,
      issueFeeOneWay: issueOneWay,
      adultRoundTrip,
      childRoundTrip,
      adultTrainNet,
      childTrainNet
    },
    hotel: {
      adultHotel,
      childHotel,
      hotelCost: adults * adultHotel + children * childHotel
    },
    adultsTotal,
    childrenTotal,
    netPurchaseTotal,
    profitPerPerson,
    totalProfit,
    finalPrice,
    rawFinalPrice,
    paymentType,
    loanPercent,
    customerCash,
    loanAmount,
    cashPercentActual: finalPrice ? (customerCash / finalPrice) * 100 : 0,
    loanPercentActual: finalPrice ? (loanAmount / finalPrice) * 100 : 0
  };
}

function formatRailCalculation(result) {
  const paymentTitle = result.paymentType === "loan" ? "💎 طرح الماس" : "💵 نقدی";
  let text = "🧮 محاسبه داخلی تور ریلی\n\n";

  text += `🚆 مسیر: ${result.routeInfo.name}\n`;
  text += `🚃 قطار: ${result.routeInfo.train}\n`;
  text += `⭐ ${result.routeInfo.stars}\n`;
  text += `👨 بزرگسال: ${formatNumber(result.adults)} نفر\n`;
  text += `👧 کودک: ${formatNumber(result.children)} نفر\n`;
  text += `👥 مجموع: ${formatNumber(result.totalPassengers)} نفر\n`;
  text += `🌙 اقامت: ${formatNumber(result.nights)} شب\n`;
  text += `💳 پرداخت: ${paymentTitle}\n`;

  if (result.privateCompartment) {
    text += `🛏️ کوپه اختصاصی: بله\n`;
    text += `🪑 ظرفیت کوپه: ${formatNumber(result.routeInfo.capacity)} نفر\n`;
    text += `🪑 تخت خالی: ${formatNumber(result.compartmentPlan.emptyBerths)} عدد\n`;
    text += `💰 هزینه تخت‌های خالی: ${formatMoney(result.privateCompartmentFee)}\n`;
  } else {
    text += "🛏️ کوپه اختصاصی: خیر\n";
  }

  text += "\n━━━━━━━━━━━━━━\n🚆 بلیت رفت و برگشت\n\n";
  text += `🎫 بلیت بزرگسال + صدور: ${formatMoney(result.ticket.adultRoundTrip)}\n`;
  if (result.children > 0) text += `🎫 بلیت کودک + صدور: ${formatMoney(result.ticket.childRoundTrip)}\n`;

  text += "\n━━━━━━━━━━━━━━\n🏨 هتل\n\n";
  text += `🏨 نرخ بزرگسال هر شب: ${formatMoney(result.hotelPrice)}\n`;
  text += `👧 کودک هتل: ${formatNumber(result.childHotelPercent)}٪\n`;
  text += `🏨 هزینه هتل بزرگسالان: ${formatMoney(result.adults * result.hotel.adultHotel)}\n`;
  if (result.children > 0) text += `🏨 هزینه هتل کودکان: ${formatMoney(result.children * result.hotel.childHotel)}\n`;

  text += "\n━━━━━━━━━━━━━━\n💰 هزینه تمام‌شده\n\n";
  text += `💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)}\n`;
  text += `📈 سود هر نفر: ${formatMoney(result.profitPerPerson)}\n`;
  text += `📈 سود کل: ${formatMoney(result.totalProfit)}\n`;
  text += `💰 قیمت نهایی فروش: ${formatMoney(result.finalPrice)}\n`;

  if (result.paymentType === "loan") {
    text += "\n━━━━━━━━━━━━━━\n💎 طرح الماس\n\n";
    text += `🔹 سهم نقدی مشتری: ${formatMoney(result.customerCash)}\n`;
    text += `🔹 مبلغ وام: ${formatMoney(result.loanAmount)}\n`;
    text += `📊 سهم واقعی نقدی پس از رُند: ${result.cashPercentActual.toFixed(1)}٪\n`;
    text += `📊 سهم واقعی وام پس از رُند: ${result.loanPercentActual.toFixed(1)}٪\n`;
  }

  return text;
}

function calculateManualTour(data) {
  const type = String(data.type || "BUS").toUpperCase();
  const adults = Math.floor(toNumber(data.adults));
  const children = Math.floor(toNumber(data.children));
  const nights = Math.floor(toNumber(data.nights));

  // برای تور هوایی قیمت رفت و برگشت بزرگسال و کودک جداگانه وارد می‌شود.
  const ticketAdultOutbound = toNumber(data.ticketAdultOutbound ?? data.ticketAdult);
  const ticketAdultReturn = toNumber(data.ticketAdultReturn ?? 0);
  const ticketChildOutbound = toNumber(data.ticketChildOutbound ?? 0);
  const ticketChildReturn = toNumber(data.ticketChildReturn ?? 0);

  const ticketAdult = type === "AIR"
    ? ticketAdultOutbound + ticketAdultReturn
    : toNumber(data.ticketAdult);

  const childPercent = toNumber(data.childPercent ?? 100);
  const childTicket = type === "AIR"
    ? ticketChildOutbound + ticketChildReturn
    : ticketAdult * childPercent / 100;

  const hotelAdult = toNumber(data.hotelAdult || SETTINGS.HOTEL_PRICE_PER_NIGHT);
  const busRental = toNumber(data.busRental);
  const manualProfit = toNumber(data.manualProfit);
  const paymentType = data.paymentType === "loan" ? "loan" : "cash";

  const totalPassengers = adults + children;
  if (totalPassengers <= 0) throw new Error("تعداد مسافران باید بیشتر از صفر باشد.");
  if (nights <= 0) throw new Error("تعداد شب اقامت باید بیشتر از صفر باشد.");

  const childHotel = hotelAdult * SETTINGS.HOTEL_CHILD_PERCENT / 100;
  const adultTicketTotal = adults * ticketAdult;
  const childTicketTotal = children * childTicket;
  const ticketTotal = adultTicketTotal + childTicketTotal;
  const hotelTotal = nights * (adults * hotelAdult + children * childHotel);
  const netPurchaseTotal = ticketTotal + hotelTotal + busRental;

  let profitPerPerson = manualProfit;
  if (type === "AIR") {
    profitPerPerson = paymentType === "loan" ? SETTINGS.AIR_LOAN_PROFIT : SETTINGS.AIR_CASH_PROFIT;
  } else if (type === "RAIL") {
    profitPerPerson = paymentType === "loan" ? SETTINGS.RAIL_LOAN_PROFIT : SETTINGS.RAIL_CASH_PROFIT;
  }

  const totalProfit = profitPerPerson * totalPassengers;
  const rawFinalPrice = netPurchaseTotal + totalProfit;
  const finalPrice = paymentType === "loan"
    ? roundDiamondTotal(rawFinalPrice)
    : roundCashAmount(rawFinalPrice);
  let customerCash = 0;
  let loanAmount = 0;
  let loanPercent = null;

  if (paymentType === "loan") {
    const split = applyDiamondSplit(finalPrice, data.loanPercent ?? 60);
    customerCash = split.customerCash;
    loanAmount = split.loanAmount;
    loanPercent = split.loanPercent;
  }

  return {
    type,
    adults,
    children,
    nights,
    totalPassengers,
    ticketAdult,
    ticketAdultOutbound,
    ticketAdultReturn,
    childTicket,
    ticketChildOutbound,
    ticketChildReturn,
    adultTicketTotal,
    childTicketTotal,
    childPercent,
    hotelAdult,
    childHotel,
    busRental,
    ticketTotal,
    hotelTotal,
    netPurchaseTotal,
    profitPerPerson,
    totalProfit,
    finalPrice,
    rawFinalPrice,
    paymentType,
    loanPercent,
    loanAmount,
    customerCash,
    cashPercentActual: finalPrice ? (customerCash / finalPrice) * 100 : 0,
    loanPercentActual: finalPrice ? (loanAmount / finalPrice) * 100 : 0
  };
}

function formatManualCalculation(result) {
  const names = {
    AIR: "✈️ تور هوایی",
    RAIL: "🚆 تور ریلی",
    BUS: "🚌 تور اتوبوسی",
    CARAVAN_BUS: "🚍 کاروان اتوبوسی",
    CARAVAN_RAIL: "🚆 کاروان ریلی",
    HOTEL: "🏨 فقط هتل"
  };

  let text = "🧮 محاسبه داخلی مدیر\n\n";
  text += `🚍 نوع سفر: ${names[result.type] || result.type}\n`;
  text += `👨 بزرگسال: ${formatNumber(result.adults)} نفر\n`;
  text += `👧 کودک ۳ تا ۵ سال: ${formatNumber(result.children)} نفر\n`;
  text += `👥 مجموع: ${formatNumber(result.totalPassengers)} نفر\n`;
  text += `🌙 اقامت: ${formatNumber(result.nights)} شب\n\n`;
  text += "━━━━━━━━━━━━━━\n💰 هزینه‌ها\n\n";
  if (result.type === "AIR") {
    text += `✈️ بلیت بزرگسال - رفت: ${formatMoney(result.ticketAdultOutbound)}
`;
    text += `✈️ بلیت بزرگسال - برگشت: ${formatMoney(result.ticketAdultReturn)}
`;
    text += `🎫 مجموع بلیت رفت‌وبرگشت هر بزرگسال: ${formatMoney(result.ticketAdult)}
`;
    text += `👶 بلیت کودک - رفت: ${formatMoney(result.ticketChildOutbound)}
`;
    text += `👶 بلیت کودک - برگشت: ${formatMoney(result.ticketChildReturn)}
`;
    text += `🎫 مجموع بلیت رفت‌وبرگشت هر کودک: ${formatMoney(result.childTicket)}
`;
    text += `💰 مجموع بلیت بزرگسالان: ${formatMoney(result.adultTicketTotal)}
`;
    text += `💰 مجموع بلیت کودکان: ${formatMoney(result.childTicketTotal)}
`;
  } else {
    text += `🎫 بلیت هر بزرگسال: ${formatMoney(result.ticketAdult)}
`;
    text += `🎫 بلیت هر کودک: ${formatMoney(result.childTicket)}
`;
  }
  text += `🏨 هتل هر بزرگسال/شب: ${formatMoney(result.hotelAdult)}\n`;
  if (result.children > 0) text += `🏨 هتل هر کودک/شب: ${formatMoney(result.childHotel)}\n`;
  if (result.busRental > 0) text += `🚌 اجاره اتوبوس: ${formatMoney(result.busRental)}\n`;
  text += `\n💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)}\n`;
  text += "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";
  text += `💵 سود هر نفر: ${formatMoney(result.profitPerPerson)}\n`;
  text += `📈 سود کل: ${formatMoney(result.totalProfit)}\n`;
  text += `💰 قیمت نهایی: ${formatMoney(result.finalPrice)}\n`;
  if (result.paymentType === "loan") {
    text += "\n━━━━━━━━━━━━━━\n💎 طرح الماس\n\n";
    text += `💵 سهم نقدی مشتری: ${formatMoney(result.customerCash)}\n`;
    text += `💎 مبلغ وام رُندشده: ${formatMoney(result.loanAmount)}\n`;
  }
  return text;
}

module.exports = {
  SETTINGS,
  RAIL_TRAINS,
  getTrainsForRoute,
  getCompartmentPlan,
  calculateRailTour,
  formatRailCalculation,
  calculateManualTour,
  formatManualCalculation,
  roundLoanAmount,
  roundUpAmount,
  roundCashAmount,
  roundDiamondTotal,
  applyDiamondSplit,
  formatMoney,
  formatNumber
};
