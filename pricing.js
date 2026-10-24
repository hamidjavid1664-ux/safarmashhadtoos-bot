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
  NARVAN_ROUND_STEP: 500000,
  NARVAN_TOUR_PROFIT_PER_PERSON: 5000000,
  NARVAN_HOTEL_PROFIT_PER_PERSON_PER_NIGHT: 600000
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
    // نرخ تخفیف‌خورده یک‌طرفه، تومان؛ نرخ کودک و نوزاد از تصویر فروش بلیت
    ticket: 2417900,
    childTicket: 1603600,
    infantTicket: 275150,
    childTicketPercent: 66.29,
    infantTicketPercent: 11.38
  },
  SHIRAZ_4_AHOO: {
    route: "SHIRAZ",
    name: "شیراز ↔ مشهد",
    train: "آهو / رجا",
    stars: "۴ ستاره، ۴ تخته",
    capacity: 4,
    berth: "۴ تخته",
    // بزرگسال از نرخ تخفیف‌خورده؛ کودک ۷۵٪ و نوزاد ۷٪
    ticket: 3591300,
    childTicket: 2693475,
    infantTicket: 251391,
    childTicketPercent: 75,
    infantTicketPercent: 7
  },
  SHIRAZ_5_TORANJ: {
    route: "SHIRAZ",
    name: "شیراز ↔ مشهد",
    train: "ترنج / رجا",
    stars: "۵ ستاره، ۴ تخته",
    capacity: 4,
    berth: "۴ تخته",
    // نرخ تخفیف‌خورده یک‌طرفه، تومان؛ درصدهای مشاهده‌شده حدود ۷۴٫۶۶٪ و ۶٫۸٪ هستند
    ticket: 6120400,
    childTicket: 4569200,
    infantTicket: 416400,
    childTicketPercent: 74.66,
    infantTicketPercent: 6.8
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

// مبلغ نهایی قابل پرداخت برای مشتری به میلیون تومان رو به بالا رُند می‌شود.
function roundCustomerAmount(amount) {
  const step = 1000000;
  return Math.ceil(toNumber(amount) / step) * step;
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
function getNarvanLoanAmount(total, allowOverLimit = false) {
  total = toNumber(total);
  if (total <= 0) throw new Error("هزینه کل تور معتبر نیست.");
  if (total <= 50000000) return 20000000;
  if (total <= 70000000) return 30000000;
  if (total <= 100000000) return 40000000;
  if (allowOverLimit) return 40000000;
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
  const requestedChildPercent = Math.min(100, Math.max(0, toNumber(data.childTicketPercent ?? SETTINGS.TRAIN_CHILD_TICKET_PERCENT)));
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
  const childTicketPercent = data.useCustomChildPercent
    ? requestedChildPercent
    : Number(train.childTicketPercent ?? requestedChildPercent);
  const childTicketOneWay = data.useCustomChildPercent
    ? train.ticket * requestedChildPercent / 100
    : (train.childTicket !== undefined ? train.childTicket : train.ticket * childTicketPercent / 100);
  const childRoundTrip = (childTicketOneWay + issueOneWay) * 2;
  const infantTicketOneWay = Math.max(0, toNumber(train.infantTicket));
  const infantRoundTrip = infantTicketOneWay > 0 ? (infantTicketOneWay + issueOneWay) * 2 : 0;
  let adultTrainNet = adultRoundTrip, childTrainNet = childRoundTrip, infantTrainNet = infantRoundTrip, privateCompartmentFee = 0, compartmentPlan = null;
  if (privateCompartment) {
    if (totalPassengers !== 3 && totalPassengers !== 5) throw new Error("اجاره کوپه اختصاصی طبق فرمول فعلی فقط برای ۳ یا ۵ نفر فعال است.");
    compartmentPlan = getCompartmentPlan(totalPassengers, train.capacity);
    privateCompartmentFee = SETTINGS.EMPTY_BERTH_FEE * compartmentPlan.emptyBerths;
    const extraPerPerson = privateCompartmentFee / totalPassengers;
    adultTrainNet = adultRoundTrip + extraPerPerson;
    childTrainNet = childRoundTrip + extraPerPerson;
    infantTrainNet = infantRoundTrip + extraPerPerson;
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
  const infantTicketCost = infantTrainNet * infants;
  const childHotelCost = halfHotelChildren * childHotelHalf + fullHotelChildren * childHotelFull;
  // نرخ نوزاد برای سه قطار شیراز از نرخ‌های واقعی ارسال‌شده ثبت شده است؛ در قطارهای دیگر طبق قانون قبلی رایگان است.
  const childrenTotal = childTicketCost + childHotelCost + infantTicketCost;
  const netPurchaseTotal = adultsTotal + childrenTotal;
  const profitPerPerson = paymentType === "loan" ? SETTINGS.RAIL_LOAN_PROFIT : SETTINGS.RAIL_CASH_PROFIT;
  const totalProfit = profitPerPerson * totalPassengers;
  // سود هتل در طرح نارون جدا از سود تور و بر اساس نفر-شبِ مشمول هزینه هتل است.
  const hotelPayingPersonEquivalents = adults + child5to12 + (child3to5 * 0.5);
  const hotelProfit = paymentType === "loan"
    ? hotelPayingPersonEquivalents * nights * SETTINGS.NARVAN_HOTEL_PROFIT_PER_PERSON_PER_NIGHT
    : 0;
  const finalPrice = roundCustomerAmount(netPurchaseTotal + totalProfit + hotelProfit);
  let customerCash = 0, loanAmount = 0, loanEligible = true, loanIneligibleReason = "";
  if (paymentType === "loan") {
    try { loanAmount = getNarvanLoanAmount(finalPrice, Boolean(data.allowNarvanOverLimit)); customerCash = Math.max(0, finalPrice - loanAmount); }
    catch (error) { if (finalPrice > 100000000) { loanEligible = false; loanIneligibleReason = "هزینه کل تور بیشتر از ۱۰۰ میلیون تومان است و مشمول وام طرح نارون نمی‌شود."; customerCash = finalPrice; } else throw error; }
  }
  return { route, trainKey, routeInfo: train, adults, infants, child2to3, child3to5, child5to12, children, totalPassengers, nights, hotelPrice, childTicketPercent, infantTicketPercent: Number(train.infantTicketPercent || 0), privateCompartment, compartmentPlan, privateCompartmentFee,
    ticket: { oneWay: train.ticket, childOneWay: childTicketOneWay, infantOneWay: infantTicketOneWay, issueFeeOneWay: issueOneWay, adultRoundTrip, childRoundTrip, infantRoundTrip, adultTrainNet, childTrainNet, infantTrainNet, childTicketCost, infantTicketCost },
    hotel: { adultHotel, childHotel: childHotelHalf, freeHotelChildren, halfHotelChildren, fullHotelChildren, childHotelCost, hotelCost: adults * adultHotel + childHotelCost },
    adultsTotal, childrenTotal, infantTicketCost, netPurchaseTotal, profitPerPerson, totalProfit, hotelProfit, hotelPayingPersonEquivalents, finalPrice, paymentType, customerCash, loanAmount, loanEligible, loanIneligibleReason, allowNarvanOverLimit: Boolean(data.allowNarvanOverLimit),
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
  text += `👦 کودک ۵ تا کمتر از ۱۲ سال: ${formatNumber(result.child5to12 || 0)} نفر\n`;
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
  text += `🎫 بلیت کودک ۲ تا کمتر از ۱۲ سال (حدود ${String(result.childTicketPercent).replace(".", "٫")}٪ نرخ بزرگسال): ${formatMoney(result.ticket.childRoundTrip)}\n`;
  text += `👶 بلیت رفت‌وبرگشت هر نوزاد: ${result.ticket.infantRoundTrip > 0 ? formatMoney(result.ticket.infantRoundTrip) : "رایگان"}\n`;
  if (result.infants > 0 && result.ticket.infantRoundTrip > 0) text += `👶 مجموع بلیت نوزادان: ${formatMoney(result.infantTicketCost)}\n`;

  text += "\n━━━━━━━━━━━━━━\n🏨 هتل\n\n";
  text += `🏨 نرخ بزرگسال هر شب: ${formatMoney(result.hotelPrice)}\n`;
  text += `🏨 هزینه هتل بزرگسالان: ${formatMoney(result.adults * result.hotel.adultHotel)}\n`;
  text += `🏨 هزینه هتل زیر ۳ سال: رایگان\n`;
  text += `🏨 هزینه هتل ۳ تا زیر ۵ سال: ${formatMoney((result.child3to5 || 0) * (result.hotel.childHotel || 0))}\n`;
  text += `🏨 هزینه هتل ۵ تا کمتر از ۱۲ سال: ${formatMoney((result.child5to12 || 0) * result.hotel.adultHotel)}\n`;
  text += `💰 مجموع هزینه هتل برای کل اقامت: ${formatMoney(result.hotel.hotelCost)}\n`;

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
      if (result.finalPrice > 100000000 && result.allowNarvanOverLimit) text += "🔓 محاسبه با اجازه مدیر برای مبلغ بالای ۱۰۰ میلیون تومان انجام شد.\n";
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
  // اگر مدیر سود را صریح وارد کرده باشد، همان مبلغ باید اعمال شود؛
  // در غیر این صورت از سود پیش‌فرض همان نوع تور استفاده می‌کنیم.
  let profitPerPerson = manualProfit;
  if (data.manualProfit === undefined || data.manualProfit === null || data.manualProfit === "") {
    if (type === "AIR") profitPerPerson = paymentType === "loan" ? SETTINGS.AIR_LOAN_PROFIT : SETTINGS.AIR_CASH_PROFIT;
    else if (type === "RAIL") profitPerPerson = paymentType === "loan" ? SETTINGS.RAIL_LOAN_PROFIT : SETTINGS.RAIL_CASH_PROFIT;
  }
  const totalProfit = profitPerPerson * totalPassengers;
  // سود هتل نارون: ۶۰۰ هزار تومان برای هر نفرِ مشمول هزینه هتل در هر شب.
  const hotelPayingPersonEquivalents = adults + fullChildren + (legacyHalfChildren * 0.5);
  const hotelProfit = paymentType === "loan"
    ? hotelPayingPersonEquivalents * nights * SETTINGS.NARVAN_HOTEL_PROFIT_PER_PERSON_PER_NIGHT
    : 0;
  const finalPrice = roundCustomerAmount(netPurchaseTotal + totalProfit + hotelProfit);
  let customerCash = 0, loanAmount = 0, loanEligible = true, loanIneligibleReason = "";
  if (paymentType === "loan") {
    try { loanAmount = getNarvanLoanAmount(finalPrice, Boolean(data.allowNarvanOverLimit)); customerCash = Math.max(0, finalPrice - loanAmount); }
    catch (error) { if (finalPrice > 100000000) { loanEligible = false; loanIneligibleReason = "هزینه کل تور بیشتر از ۱۰۰ میلیون تومان است و مشمول وام طرح نارون نمی‌شود."; customerCash = finalPrice; } else throw error; }
  }
  return { type, adults, infants, child2to3, child3to5: legacyHalfChildren, child5to12: fullChildren, freeHotelChildren: freeChildren, children, nights, totalPassengers,
    ticketAdult, ticketAdultOutbound, ticketAdultReturn, childTicket, ticketChildOutbound, ticketChildReturn, infantTicket, ticketInfantOutbound, ticketInfantReturn,
    adultTicketTotal, childTicketTotal, infantTicketTotal, childPercent, hotelAdult, childHotel, busRental, ticketTotal, hotelTotal, netPurchaseTotal,
    profitPerPerson, totalProfit, hotelProfit, hotelPayingPersonEquivalents, finalPrice, paymentType, loanAmount, customerCash, loanEligible, loanIneligibleReason, allowNarvanOverLimit: Boolean(data.allowNarvanOverLimit) };
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
  text += `👦 کودک ۵ تا کمتر از ۱۲ سال: ${formatNumber(result.child5to12 || 0)} نفر\n`;
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
  text += `💰 مجموع هزینه هتل برای ${formatNumber(result.nights)} شب: ${formatMoney(result.hotelTotal)}\n`;
  if (result.busRental > 0) text += `🚌 اجاره اتوبوس: ${formatMoney(result.busRental)}\n`;
  text += `\n💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)}\n`;
  text += "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";
  text += `💵 سود هر نفر: ${formatMoney(result.profitPerPerson)}\n`;
  text += `📈 سود کل تور: ${formatMoney(result.totalProfit)}\n`;
  if (result.hotelProfit > 0) text += `🏨 سود هتل (${formatNumber(result.hotelPayingPersonEquivalents)} نفرِ مشمول × ${formatNumber(result.nights)} شب): ${formatMoney(result.hotelProfit)}\n`;
  text += `💰 قیمت نهایی: ${formatMoney(result.finalPrice)}\n`;
  if (result.paymentType === "loan") {
    text += "\n━━━━━━━━━━━━━━\n🌳 محاسبات وام طرح نارون\n\n";
    text += `💵 هزینه کل تور: ${formatMoney(result.finalPrice)}\n`;
    if (result.loanEligible === false) {
      text += `⚠️ ${result.loanIneligibleReason || "این هزینه مشمول وام طرح نارون نمی‌شود."}\n`;
      text += `💵 در صورت ادامه بدون وام، مبلغ کل پرداختی نقدی: ${formatMoney(result.finalPrice)}\n`;
    } else {
      text += `🌳 مبلغ وام طرح نارون: ${formatMoney(result.loanAmount)}\n`;
      if (result.finalPrice > 100000000 && result.allowNarvanOverLimit) text += "🔓 محاسبه با اجازه مدیر برای مبلغ بالای ۱۰۰ میلیون تومان انجام شد.\n";
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
  roundCustomerAmount,
  roundLoanAmount,
  roundNarvanAmount,
  getNarvanLoanAmount,
  getNarvanRepayment,
  formatMoney,
  formatNumber
};
