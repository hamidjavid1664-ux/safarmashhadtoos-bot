const CONFIG = require("./config");

function formatMoney(number) {
  return new Intl.NumberFormat("fa-IR").format(
    Math.round(Number(number || 0))
  );
}

function roundLoanAmount(amount) {
  return Math.round(
    Number(amount || 0) / 5000000
  ) * 5000000;
}

function getCompartmentPlan(passengers) {
  passengers = Number(passengers || 0);

  let best = null;

  for (
    let six = 0;
    six <= Math.ceil(passengers / 6) + 2;
    six++
  ) {
    for (
      let four = 0;
      four <= Math.ceil(passengers / 4) + 2;
      four++
    ) {
      const capacity =
        six * 6 +
        four * 4;

      if (capacity < passengers) {
        continue;
      }

      const candidate = {
        six,
        four,
        capacity,
        emptyBerths: capacity - passengers,
        compartmentCount: six + four
      };

      if (
        !best ||
        candidate.emptyBerths < best.emptyBerths ||
        (
          candidate.emptyBerths === best.emptyBerths &&
          candidate.compartmentCount < best.compartmentCount
        )
      ) {
        best = candidate;
      }
    }
  }

  return {
    compartments: [
      ...Array(best.four).fill("۴ تخته"),
      ...Array(best.six).fill("۶ تخته")
    ],
    capacity: best.capacity,
    emptyBerths: best.emptyBerths,
    fourBerth: best.four,
    sixBerth: best.six
  };
}

function getSelectedTrain(route, trainId) {

  const trains =
    CONFIG.RAIL.TICKET_PRICES[route]?.TRAINS || [];

  const train =
    trains.find(
      x => String(x.id) === String(trainId)
    );

  if (!train) {
    throw new Error(
      "قطار انتخاب‌شده پیدا نشد."
    );
  }

  return train;
}

function getTicketPrice(route, type, trainId) {

  if (trainId) {
    return getSelectedTrain(
      route,
      trainId
    ).price;
  }

  const r =
    CONFIG.RAIL.TICKET_PRICES[route];

  if (!r) {
    throw new Error(
      "مسیر ریلی پیدا نشد."
    );
  }

  const train =
    (r.TRAINS || []).find(
      x =>
        type === "4"
          ? String(x.berthType).includes("۴ تخته")
          : String(x.berthType).includes("۶ تخته")
    );

  if (!train) {
    throw new Error(
      "قطار برای این نوع کوپه پیدا نشد."
    );
  }

  return train.price;
}

function calculateRailTour(data) {

  const route =
    data.route;

  const adults =
    Number(data.adults || 0);

  const children =
    Number(data.children || 0);

  const totalPassengers =
    adults + children;

  const nights =
    Number(data.nights || 0);

  const hotelPrice =
    Number(
      data.hotelPricePerPersonPerNight || 0
    );

  const childHotelPercent =
    Number(
      data.childHotelPercent ?? 50
    );

  const paymentType =
    data.paymentType || "cash";

  if (totalPassengers <= 0) {
    throw new Error(
      "تعداد مسافران باید بیشتر از صفر باشد."
    );
  }

  if (nights <= 0) {
    throw new Error(
      "تعداد شب باید بیشتر از صفر باشد."
    );
  }

  if (hotelPrice <= 0) {
    throw new Error(
      "قیمت هتل وارد نشده است."
    );
  }

  const routeConfig =
    CONFIG.RAIL.TICKET_PRICES[route];

  if (!routeConfig) {
    throw new Error(
      "مسیر ریلی پیدا نشد."
    );
  }

  const selectedTrain =
    data.trainId
      ? getSelectedTrain(
          route,
          data.trainId
        )
      : null;

  const ticketPrice =
    selectedTrain
      ? selectedTrain.price
      : getTicketPrice(
          route,
          data.berthType === "۶ تخته"
            ? "6"
            : "4"
        );

  const adultRoundTrip =
    (
      ticketPrice +
      CONFIG.RAIL.TICKET_ISSUE_FEE
    ) * 2;

  const childRoundTrip =
    (
      ticketPrice *
        CONFIG.RAIL.CHILD_TICKET_PERCENT /
        100 +
      CONFIG.RAIL.TICKET_ISSUE_FEE
    ) * 2;

  const adultTrain =
    adultRoundTrip;

  const childTrain =
    childRoundTrip;

  const trainTotal =
    adults * adultTrain +
    children * childTrain;

  const trainDetails = [
    {
      type:
        selectedTrain?.berthType ||
        data.berthType ||
        "عادی",

      trainName:
        selectedTrain?.name ||
        data.trainName ||
        "",

      departure:
        selectedTrain?.departure ||
        "",

      arrival:
        selectedTrain?.arrival ||
        "",

      adultRoundTrip,
      childRoundTrip,
      ticketPrice
    }
  ];

  const adultHotel =
    hotelPrice * nights;

  const childHotel =
    hotelPrice *
    childHotelPercent /
    100 *
    nights;

  const adultHotelTotal =
    adults * adultHotel;

  const childHotelTotal =
    children * childHotel;

  const hotelTotal =
    adultHotelTotal +
    childHotelTotal;

  const netPurchaseTotal =
    trainTotal +
    hotelTotal;

  const profitPerPerson =
    paymentType === "loan"
      ? 5000000
      : 3000000;

  const totalProfit =
    profitPerPerson *
    totalPassengers;

  const finalPrice =
    netPurchaseTotal +
    totalProfit;

  const loanAmount =
    paymentType === "loan"
      ? roundLoanAmount(
          finalPrice * 0.60
        )
      : 0;

  const customerCash =
    paymentType === "loan"
      ? finalPrice - loanAmount
      : 0;

  return {
    route,
    adults,
    children,
    totalPassengers,
    nights,
    hotelPrice,
    childHotelPercent,
    privateCompartment: false,
    compartmentPlan: null,
    trainDetails,
    trainTotal,
    adultTrain,
    childTrain,
    adultHotel,
    childHotel,
    adultHotelTotal,
    childHotelTotal,
    hotelTotal,
    netPurchaseTotal,
    profitPerPerson,
    totalProfit,
    finalPrice,
    paymentType,
    loanAmount,
    customerCash
  };
}

function formatRailCalculation(r) {

  const routeName =
    CONFIG.RAIL.TICKET_PRICES[
      r.route
    ]?.name || r.route;

  const t =
    r.trainDetails[0];

  let text =
    "🧮 محاسبه داخلی تور ریلی\n" +
    "━━━━━━━━━━━━━━━━━━\n";

  text +=
    `🚆 مسیر: ${routeName}\n`;

  if (t.trainName) {
    text +=
      `🚆 قطار: ${t.trainName}\n`;
  }

  if (t.type) {
    text +=
      `🛏️ ${t.type}\n`;
  }

  if (
    t.departure ||
    t.arrival
  ) {
    text +=
      `🕐 حرکت: ${t.departure} → ${t.arrival}\n`;
  }

  text +=
    `👨 بزرگسال: ${formatMoney(r.adults)} نفر\n`;

  text +=
    `👶 کودک ۲ تا ۱۲ سال: ${formatMoney(r.children)} نفر\n`;

  text +=
    `👥 مجموع مسافران: ${formatMoney(r.totalPassengers)} نفر\n`;

  text +=
    "━━━━━━━━━━━━━━━━━━\n" +
    "🚆 محاسبه قطار\n";

  text +=
    `قیمت بلیط: ${formatMoney(t.ticketPrice)} تومان\n`;

  text +=
    `هزینه صدور هر بلیط یک‌طرفه: ${formatMoney(CONFIG.RAIL.TICKET_ISSUE_FEE)} تومان\n`;

  text +=
    `بلیط رفت و برگشت بزرگسال: ${formatMoney(t.adultRoundTrip)} تومان\n`;

  text +=
    `بلیط رفت و برگشت کودک: ${formatMoney(t.childRoundTrip)} تومان\n`;

  text +=
    `🚆 مجموع قطار: ${formatMoney(r.trainTotal)} تومان\n`;

  text +=
    "━━━━━━━━━━━━━━━━━━\n" +
    "🏨 محاسبه هتل\n";

  text +=
    `قیمت هتل هر نفر / هر شب: ${formatMoney(r.hotelPrice)} تومان\n`;

  text +=
    `تعداد شب: ${formatMoney(r.nights)}\n`;

  text +=
    `درصد هتل کودک: ${formatMoney(r.childHotelPercent)}٪\n`;

  text +=
    `هتل هر بزرگسال: ${formatMoney(r.adultHotel)} تومان\n`;

  text +=
    `هتل هر کودک: ${formatMoney(r.childHotel)} تومان\n`;

  text +=
    `🏨 مجموع هتل: ${formatMoney(r.hotelTotal)} تومان\n`;

  text +=
    "━━━━━━━━━━━━━━━━━━\n";

  text +=
    `💰 خرید خالص: ${formatMoney(r.netPurchaseTotal)} تومان\n`;

  text +=
    `📈 سود هر نفر: ${formatMoney(r.profitPerPerson)} تومان\n`;

  text +=
    `📈 مجموع سود: ${formatMoney(r.totalProfit)} تومان\n`;

  text +=
    "━━━━━━━━━━━━━━━━━━\n";

  text +=
    `💵 قیمت نهایی فروش: ${formatMoney(r.finalPrice)} تومان\n`;

  text +=
    "━━━━━━━━━━━━━━━━━━";

  if (r.paymentType === "loan") {

    text +=
      "\n\n💎 طرح الماس\n" +
      `💵 سهم پرداخت مشتری (۴۰٪): ${formatMoney(r.customerCash)} تومان\n` +
      `💳 مبلغ طرح الماس (۶۰٪): ${formatMoney(r.loanAmount)} تومان`;
  }

  return text;
}

function calculateManualTour(data) {

  const adults =
    Number(data.adults || 0);

  const children =
    Number(data.children || 0);

  const nights =
    Number(data.nights || 0);

  const totalPassengers =
    adults + children;

  const ticketAdult =
    Number(data.ticketAdult || 0);

  const hotelAdult =
    Number(data.hotelAdult || 0);

  const childPercent =
    Number(data.childPercent ?? 50);

  const busRental =
    Number(data.busRental || 0);

  const paymentType =
    data.paymentType || "cash";

  const manualProfit =
    Number(data.manualProfit || 0);

  if (
    totalPassengers <= 0 ||
    nights <= 0
  ) {
    throw new Error(
      "تعداد مسافر و شب باید صحیح باشد."
    );
  }

  const childTicket =
    ticketAdult *
    childPercent /
    100;

  const childHotel =
    hotelAdult *
    childPercent /
    100;

  const ticketTotal =
    adults * ticketAdult +
    children * childTicket;

  const hotelTotal =
    nights *
    (
      adults * hotelAdult +
      children * childHotel
    );

  const netPurchaseTotal =
    ticketTotal +
    hotelTotal +
    busRental;

  const profitPerPerson =
    manualProfit;

  const totalProfit =
    profitPerPerson *
    totalPassengers;

  const finalPrice =
    netPurchaseTotal +
    totalProfit;

  const loanAmount =
    paymentType === "loan"
      ? roundLoanAmount(
          finalPrice * 0.6
        )
      : 0;

  const customerCash =
    paymentType === "loan"
      ? finalPrice - loanAmount
      : 0;

  return {
    ...data,
    adults,
    children,
    nights,
    totalPassengers,
    ticketAdult,
    childTicket,
    hotelAdult,
    childHotel,
    busRental,
    ticketTotal,
    hotelTotal,
    netPurchaseTotal,
    profitPerPerson,
    totalProfit,
    finalPrice,
    paymentType,
    loanAmount,
    customerCash
  };
}

function formatManualCalculation(r) {

  return (
    `🧮 محاسبه داخلی مدیر\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👨 بزرگسال: ${formatMoney(r.adults)} نفر\n` +
    `👶 کودک: ${formatMoney(r.children)} نفر\n` +
    `🌙 تعداد شب: ${formatMoney(r.nights)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎫 بلیت بزرگسال: ${formatMoney(r.ticketAdult)} تومان\n` +
    `🎫 بلیت کودک: ${formatMoney(r.childTicket)} تومان\n` +
    `🏨 هتل بزرگسال/شب: ${formatMoney(r.hotelAdult)} تومان\n` +
    `🏨 هتل کودک/شب: ${formatMoney(r.childHotel)} تومان\n` +
    `💰 خرید خالص: ${formatMoney(r.netPurchaseTotal)} تومان\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📈 سود هر نفر: ${formatMoney(r.profitPerPerson)} تومان\n` +
    `📈 سود کل: ${formatMoney(r.totalProfit)} تومان\n` +
    `💵 قیمت نهایی: ${formatMoney(r.finalPrice)} تومان` +
    (
      r.paymentType === "loan"
        ? `\n\n💎 طرح الماس\n` +
          `💵 سهم پرداخت مشتری (۴۰٪): ${formatMoney(r.customerCash)} تومان\n` +
          `💳 مبلغ طرح الماس (۶۰٪): ${formatMoney(r.loanAmount)} تومان`
        : ""
    )
  );
}

module.exports = {
  calculateRailTour,
  formatRailCalculation,
  calculateManualTour,
  formatManualCalculation,
  getCompartmentPlan,
  formatMoney,
  roundLoanAmount
};
