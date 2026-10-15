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
  NARVAN_ROUND_STEP: 500000
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
  return Math.round(toNumber(amount) / step) * step;
}

// محاسبه مستقل طرح نارون: گرد کردن با گام کوچک‌تر تا نسبت ۷۰/۳۰ حفظ شود.
function roundNarvanAmount(amount) {
  const step = SETTINGS.NARVAN_ROUND_STEP;
  return Math.round(toNumber(amount) / step) * step;
}


// مبلغ وام نارون پلکانی است و درصدی از هزینه تور نیست.
function getNarvanLoanAmount(total) {
  total = toNumber(total);
  if (total <= 0) throw new Error("هزینه کل تور معتبر نیست.");
  if (total <= 50000000) return 20000000;
  if (total <= 80000000) return 25000000;
  if (total <= 100000000) return 30000000;
  throw new Error("هزینه کل تور بیشتر از ۱۰۰ میلیون تومان است و مشمول وام طرح نارون نمی‌شود.");
}
function getNarvanRepayment(loanAmount) {
  const interest = loanAmount * 0.04;
  const repaymentTotal = loanAmount + interest;
  return { interest, repaymentTotal, monthlyInstallment: repaymentTotal / 18 };
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
  const infants = Math.floor(toNumber(data.infants));
  const child2to3 = Math.floor(toNumber(data.child2to3));
  const child3to5 = Math.floor(toNumber(data.child3to5));
  const child5to12 = Math.floor(toNumber(data.child5to12));
  const legacyChildren = Math.floor(toNumber(data.children));
  const hasAgeGroups = [data.child2to3, data.child3to5, data.child5to12].some(v => v !== undefined);
  const children = hasAgeGroups ? child2to3 + child3to5 + child5to12 : legacyChildren;
  const totalPassengers = adults + infants + children;
  const nights = Math.floor(toNumber(data.nights || SETTINGS.RAIL_NIGHTS));
  const hotelPrice = toNumber(data.hotelPricePerPersonPerNight || data.hotelPrice || SETTINGS.HOTEL_PRICE_PER_NIGHT);
  const childTicketPercent = Math.min(100, Math.max(0, toNumber(data.childTicketPercent ?? SETTINGS.TRAIN_CHILD_TICKET_PERCENT)));
  const paymentType = data.paymentType === "loan" ? "loan" : "cash";
  const privateCompartment = Boolean(data.privateCompartment);
  if (adults <= 0) throw new Error("تعداد بزرگسال باید حداقل ۱ نفر باشد.");
  if ([infants, child2to3, child3to5, child5to12, children].some(n => n < 0)) throw new Error("تعداد کودک نامعتبر است.");
  if (nights <= 0) throw new Error("تعداد شب اقامت نامعتبر است.");
  if (hotelPrice <= 0) throw new Error("قیمت هتل وارد نشده است.");
  let trainKey = data.trainKey || data.train;
  let train = trainKey ? RAIL_TRAINS[trainKey] : null;
  if (!train) { const trains = getTrainsForRoute(route); if (!trains.length) throw new Error("مسیر ریلی پیدا نشد."); train = trains[0]; trainKey = train.key; }
  if (train.route !== route) throw new Error("قطار انتخاب‌شده با مسیر هماهنگ نیست.");
  const issueOneWay = SETTINGS.TICKET_ISSUE_FEE_ONE_WAY;
  const adultRoundTrip = (train.ticket + issueOneWay) * 2;
  const childTicketOneWay = train.ticket * childTicketPercent / 100;
  const childRoundTrip = (childTicketOneWay + issueOneWay) * 2;
  let adultTrainNet = adultRoundTrip, childTrainNet = childRoundTrip, privateCompartmentFee = 0, compartmentPlan = null;
  if (privateCompartment) {
    if (totalPassengers !== 3 && totalPassengers !== 5) throw new Error("اجاره کوپه اختصاصی طبق فرمول فعلی فقط برای ۳ یا ۵ نفر فعال است.");
    compartmentPlan = getCompartmentPlan(totalPassengers, train.capacity);
    privateCompartmentFee = SETTINGS.EMPTY_BERTH_FEE * compartmentPlan.emptyBerths;
    const baseRoundTripPerPerson = (train.ticket + issueOneWay) * 2;
    const extraPerPerson = privateCompartmentFee / totalPassengers;
    adultTrainNet = baseRoundTripPerPerson + extraPerPerson;
    childTrainNet = baseRoundTripPerPerson + extraPerPerson;
  }
  // هتل: زیر ۳ سال رایگان؛ ۳ تا زیر ۵ سال نیم‌بها؛ ۵ سال به بالا کامل.
  const adultHotel = hotelPrice * nights;
  const freeHotelChildren = infants + child2to3;
  const halfHotelChildren = child3to5;
  const fullHotelChildren = hasAgeGroups ? child5to12 : legacyChildren;
  const childHotelHalf = hotelPrice * 0.5 * nights;
  const childHotelFull = adultHotel;
  const adultsTotal = (adultTrainNet + adultHotel) * adults;
  const childTicketCost = childTrainNet * children;
  const childHotelCost = halfHotelChildren * childHotelHalf + fullHotelChildren * childHotelFull;
  const childrenTotal = childTicketCost + childHotelCost;
  const netPurchaseTotal = adultsTotal + childrenTotal;
  const profitPerPerson = paymentType === "loan" ? SETTINGS.RAIL_LOAN_PROFIT : SETTINGS.RAIL_CASH_PROFIT;
  const totalProfit = profitPerPerson * totalPassengers;
  const finalPrice = netPurchaseTotal + totalProfit;
  let customerCash = 0, loanAmount = 0, loanEligible = true, loanIneligibleReason = "";
  if (paymentType === "loan") {
    try { loanAmount = getNarvanLoanAmount(finalPrice); customerCash = Math.max(0, finalPrice - loanAmount); }
    catch (error) { if (finalPrice > 100000000) { loanEligible = false; loanIneligibleReason = "هزینه کل تور بیشتر از ۱۰۰ میلیون تومان است و مشمول وام طرح نارون نمی‌شود."; customerCash = finalPrice; } else throw error; }
  }
  return { route, trainKey, routeInfo: train, adults, infants, child2to3, child3to5, child5to12, children, totalPassengers, nights, hotelPrice, childTicketPercent, privateCompartment, compartmentPlan, privateCompartmentFee,
    ticket: { oneWay: train.ticket, issueFeeOneWay: issueOneWay, adultRoundTrip, childRoundTrip, adultTrainNet, childTrainNet },
    hotel: { adultHotel, childHotel: childHotelHalf, freeHotelChildren, halfHotelChildren, fullHotelChildren, childHotelCost, hotelCost: adults * adultHotel + childHotelCost },
    adultsTotal, childrenTotal, netPurchaseTotal, profitPerPerson, totalProfit, finalPrice, paymentType, customerCash, loanAmount, loanEligible, loanIneligibleReason,
    cashPercentActual: finalPrice ? (customerCash / finalPrice) * 100 : 0, loanPercentActual: finalPrice ? (loanAmount / finalPrice) * 100 : 0 };
}

function formatRailCalculation(result) {
  const paymentTitle = result.paymentType === "loan" ? "🌳 وام طرح نارون" : "💵 نقدی";
  let text = "🧮 محاسبه داخلی تور ریلی\n\n";

  text += `🚆 مسیر: ${result.routeInfo.name}\n`;
  text += `🚃 قطار: ${result.routeInfo.train}\n`;
  text += `⭐ ${result.routeInfo.stars}\n`;
  text += `👨 بزرگسال: ${formatNumber(result.adults)} نفر\n`;
  text += `👶 نوزاد زیر ۲ سال: ${formatNumber(result.infants || 0)} نفر\n`;
  text += `👧 کودک ۲ تا زیر ۳ سال: ${formatNumber(result.child2to3 || 0)} نفر\n`;
  text += `👧 کودک ۳ تا زیر ۵ سال: ${formatNumber(result.child3to5 || 0)} نفر\n`;
  text += `👦 کودک ۵ تا ۱۲ سال: ${formatNumber(result.child5to12 || 0)} نفر\n`;
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
  text += `🎫 بلیت کودک ۲ تا ۱۲ سال با درصد ${formatNumber(result.childTicketPercent)}٪: ${formatMoney(result.ticket.childRoundTrip)}\n`;
  text += `👶 بلیت نوزاد زیر ۲ سال: رایگان\n`;

  text += "\n━━━━━━━━━━━━━━\n🏨 هتل\n\n";
  text += `🏨 نرخ بزرگسال هر شب: ${formatMoney(result.hotelPrice)}\n`;
  text += `🏨 هزینه هتل بزرگسالان: ${formatMoney(result.adults * result.hotel.adultHotel)}\n`;
  text += `🏨 هزینه هتل زیر ۳ سال: رایگان\n`;
  text += `🏨 هزینه هتل ۳ تا زیر ۵ سال: ${formatMoney((result.child3to5 || 0) * (result.hotel.childHotel || 0))}\n`;
  text += `🏨 هزینه هتل ۵ تا ۱۲ سال: ${formatMoney((result.child5to12 || 0) * result.hotel.adultHotel)}\n`;

  text += "\n━━━━━━━━━━━━━━\n💰 هزینه تمام‌شده\n\n";
  text += `💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)}\n`;
  text += `📈 سود هر نفر: ${formatMoney(result.profitPerPerson)}\n`;
  text += `📈 سود کل: ${formatMoney(result.totalProfit)}\n`;
  text += `💰 قیمت نهایی فروش: ${formatMoney(result.finalPrice)}\n`;

  if (result.paymentType === "loan") {
    text += "\n━━━━━━━━━━━━━━\n🌳 محاسبات وام طرح نارون\n\n";
    text += `💵 هزینه کل تور: ${formatMoney(result.finalPrice)}\n`;
    if (result.loanEligible === false) {
      text += `⚠️ ${result.loanIneligibleReason || "این هزینه مشمول وام طرح نارون نمی‌شود."}\n`;
      text += `💵 در صورت ادامه بدون وام، مبلغ کل پرداختی نقدی: ${formatMoney(result.finalPrice)}\n`;
    } else {
      text += `🌳 مبلغ وام طرح نارون: ${formatMoney(result.loanAmount)}\n`;
      text += `💰 مبلغ پرداختی مشتری: ${formatMoney(result.customerCash)}\n`;
      const { interest, repaymentTotal, monthlyInstallment } = getNarvanRepayment(result.loanAmount);
      text += `📈 سود ۴٪ کل دوره: ${formatMoney(interest)}\n`;
      text += `💳 مجموع بازپرداخت وام: ${formatMoney(repaymentTotal)}\n`;
      text += `📅 قسط ماهانه تقریبی در ۱۸ ماه: ${formatMoney(monthlyInstallment)}\n`;
    }
  }

  return text;
}

function calculateManualTour(data) {
  const type = String(data.type || "BUS").toUpperCase();
  const adults = Math.floor(toNumber(data.adults));
  const infants = Math.floor(toNumber(data.infants));
  const child2to3 = Math.floor(toNumber(data.child2to3));
  const child3to5 = Math.floor(toNumber(data.child3to5));
  const child5to12 = Math.floor(toNumber(data.child5to12));
  const legacyChildren = Math.floor(toNumber(data.children));
  const hasAgeGroups = [data.child2to3, data.child3to5, data.child5to12].some(v => v !== undefined);
  const children = hasAgeGroups ? child2to3 + child3to5 + child5to12 : legacyChildren;
  const nights = Math.floor(toNumber(data.nights));
  const ticketAdultOutbound = toNumber(data.ticketAdultOutbound ?? data.ticketAdult);
  const ticketAdultReturn = toNumber(data.ticketAdultReturn ?? 0);
  const ticketChildOutbound = toNumber(data.ticketChildOutbound ?? 0);
  const ticketChildReturn = toNumber(data.ticketChildReturn ?? 0);
  const ticketInfantOutbound = toNumber(data.ticketInfantOutbound ?? 0);
  const ticketInfantReturn = toNumber(data.ticketInfantReturn ?? 0);
  const ticketAdult = type === "AIR" ? ticketAdultOutbound + ticketAdultReturn : toNumber(data.ticketAdult);
  const childPercent = toNumber(data.childPercent ?? 100);
  const childTicket = type === "AIR" ? ticketChildOutbound + ticketChildReturn : ticketAdult * childPercent / 100;
  const infantTicket = type === "AIR" ? ticketInfantOutbound + ticketInfantReturn : 0;
  const hotelAdult = toNumber(data.hotelAdult || SETTINGS.HOTEL_PRICE_PER_NIGHT);
  const busRental = toNumber(data.busRental);
  const manualProfit = toNumber(data.manualProfit);
  const paymentType = data.paymentType === "loan" ? "loan" : "cash";
  const totalPassengers = adults + infants + children;
  if (totalPassengers <= 0) throw new Error("تعداد مسافران باید بیشتر از صفر باشد.");
  if (nights <= 0) throw new Error("تعداد شب اقامت نامعتبر است.");
  const legacyHalfChildren = hasAgeGroups ? child3to5 : legacyChildren;
  const fullChildren = hasAgeGroups ? child5to12 : 0;
  const freeChildren = infants + child2to3;
  const childHotel = hotelAdult * 0.5;
  const adultTicketTotal = adults * ticketAdult;
  const childTicketTotal = children * childTicket;
  const infantTicketTotal = infants * infantTicket;
  const ticketTotal = adultTicketTotal + childTicketTotal + infantTicketTotal;
  const hotelTotal = nights * (adults * hotelAdult + legacyHalfChildren * hotelAdult * 0.5 + fullChildren * hotelAdult);
  const netPurchaseTotal = ticketTotal + hotelTotal + busRental;
  let profitPerPerson = manualProfit;
  if (type === "AIR") profitPerPerson = paymentType === "loan" ? SETTINGS.AIR_LOAN_PROFIT : SETTINGS.AIR_CASH_PROFIT;
  else if (type === "RAIL") profitPerPerson = paymentType === "loan" ? SETTINGS.RAIL_LOAN_PROFIT : SETTINGS.RAIL_CASH_PROFIT;
  const totalProfit = profitPerPerson * totalPassengers;
  const finalPrice = netPurchaseTotal + totalProfit;
  let customerCash = 0, loanAmount = 0, loanEligible = true, loanIneligibleReason = "";
  if (paymentType === "loan") {
    try { loanAmount = getNarvanLoanAmount(finalPrice); customerCash = Math.max(0, finalPrice - loanAmount); }
    catch (error) { if (finalPrice > 100000000) { loanEligible = false; loanIneligibleReason = "هزینه کل تور بیشتر از ۱۰۰ میلیون تومان است و مشمول وام طرح نارون نمی‌شود."; customerCash = finalPrice; } else throw error; }
  }
  return { type, adults, infants, child2to3, child3to5: legacyHalfChildren, child5to12: fullChildren, freeHotelChildren: freeChildren, children, nights, totalPassengers,
    ticketAdult, ticketAdultOutbound, ticketAdultReturn, childTicket, ticketChildOutbound, ticketChildReturn, infantTicket, ticketInfantOutbound, ticketInfantReturn,
    adultTicketTotal, childTicketTotal, infantTicketTotal, childPercent, hotelAdult, childHotel, busRental, ticketTotal, hotelTotal, netPurchaseTotal,
    profitPerPerson, totalProfit, finalPrice, paymentType, loanAmount, customerCash, loanEligible, loanIneligibleReason };
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
  text += `👶 نوزاد زیر ۲ سال: ${formatNumber(result.infants || 0)} نفر\n`;
  text += `👧 کودک ۲ تا زیر ۳ سال: ${formatNumber(result.child2to3 || 0)} نفر\n`;
  text += `👧 کودک ۳ تا زیر ۵ سال: ${formatNumber(result.child3to5 || 0)} نفر\n`;
  text += `👦 کودک ۵ تا ۱۲ سال: ${formatNumber(result.child5to12 || 0)} نفر\n`;
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
    text += `👶 بلیت نوزاد - رفت: ${formatMoney(result.ticketInfantOutbound || 0)}
`;
    text += `👶 بلیت نوزاد - برگشت: ${formatMoney(result.ticketInfantReturn || 0)}
`;
    text += `🎫 مجموع بلیت رفت‌وبرگشت هر نوزاد: ${formatMoney(result.infantTicket || 0)}
`;
    text += `💰 مجموع بلیت بزرگسالان: ${formatMoney(result.adultTicketTotal)}
`;
    text += `💰 مجموع بلیت نوزادان: ${formatMoney(result.infantTicketTotal || 0)}
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
  text += `🏨 هتل کودک زیر ۳ سال: رایگان\n`;
  text += `🏨 هتل کودک ۳ تا زیر ۵ سال/شب: ${formatMoney(result.hotelAdult * 0.5)}\n`;
  text += `🏨 هتل کودک ۵ سال به بالا/شب: ${formatMoney(result.hotelAdult)}\n`;
  if (result.busRental > 0) text += `🚌 اجاره اتوبوس: ${formatMoney(result.busRental)}\n`;
  text += `\n💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)}\n`;
  text += "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";
  text += `💵 سود هر نفر: ${formatMoney(result.profitPerPerson)}\n`;
  text += `📈 سود کل: ${formatMoney(result.totalProfit)}\n`;
  text += `💰 قیمت نهایی: ${formatMoney(result.finalPrice)}\n`;
  if (result.paymentType === "loan") {
    text += "\n━━━━━━━━━━━━━━\n🌳 محاسبات وام طرح نارون\n\n";
    text += `💵 هزینه کل تور: ${formatMoney(result.finalPrice)}\n`;
    if (result.loanEligible === false) {
      text += `⚠️ ${result.loanIneligibleReason || "این هزینه مشمول وام طرح نارون نمی‌شود."}\n`;
      text += `💵 در صورت ادامه بدون وام، مبلغ کل پرداختی نقدی: ${formatMoney(result.finalPrice)}\n`;
    } else {
      text += `🌳 مبلغ وام طرح نارون: ${formatMoney(result.loanAmount)}\n`;
      text += `💰 مبلغ پرداختی مشتری: ${formatMoney(result.customerCash)}\n`;
      const { interest, repaymentTotal, monthlyInstallment } = getNarvanRepayment(result.loanAmount);
      text += `📈 سود ۴٪ کل دوره: ${formatMoney(interest)}\n`;
      text += `💳 مجموع بازپرداخت وام: ${formatMoney(repaymentTotal)}\n`;
      text += `📅 قسط ماهانه تقریبی در ۱۸ ماه: ${formatMoney(monthlyInstallment)}\n`;
    }
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
  roundNarvanAmount,
  formatMoney,
  formatNumber
};
