const RAIL_TRAIN = {
  AHVAZ: [
    {
      id: "mah-tab",
      name: "مهتاب سیر",
      capacity: 6,
      stars: 3,
      departure: "13:20",
      arrival: "15:25",
      price: 1940000
    },
    {
      id: "omid-raja",
      name: "امید رجا",
      capacity: 4,
      stars: 4,
      departure: "16:40",
      arrival: "19:25",
      price: 2010000
    },
    {
      id: "karkheh",
      name: "کرخه پارس لاریم",
      capacity: 4,
      stars: 4,
      departure: "13:20",
      arrival: "15:25",
      price: 2230000
    }
  ],

  SHIRAZ: [
    {
      id: "sarir-raja",
      name: "سریر رجا",
      capacity: 4,
      stars: 4,
      departure: "15:30",
      arrival: "15:45",
      price: 2010000
    },
    {
      id: "ahoo-raja",
      name: "آهو رجا",
      capacity: 4,
      stars: 4,
      departure: "15:30",
      arrival: "15:45",
      price: 2990000
    }
  ]
};

const EMPTY_BERTH_PRICE = 800000;
const TICKET_ISSUE_FEE = 200000;

function money(v) {
  return Number(v || 0).toLocaleString("fa-IR");
}

function roundLoanAmount(v) {
  const n = Number(v || 0);
  return Math.round(n / 5000000) * 5000000;
}

function getCompartmentPlan(capacity, adults, children) {
  const passengers =
    Number(adults || 0) +
    Number(children || 0);

  const c = Number(capacity || 0);

  if (!c || !passengers) {
    return {
      compartments: 0,
      emptyBerths: 0,
      passengers
    };
  }

  const compartments = Math.ceil(passengers / c);
  const emptyBerths =
    compartments * c - passengers;

  return {
    compartments,
    emptyBerths,
    passengers
  };
}

function calculateRailTour(data = {}) {
  const adults = Number(data.adults || 0);
  const children = Number(data.children || 0);
  const nights = Number(data.nights || 0);

  const ticketAdult = Number(
    data.ticketAdult || 0
  );

  const hotelAdult = Number(
    data.hotelAdult || 0
  );

  const childTicketPercent =
    Number(data.childTicketPercent ?? 60);

  const childHotelPercent =
    Number(data.childHotelPercent ?? 50);

  const ticketChild =
    Number(
      data.ticketChild ??
      ticketAdult * childTicketPercent / 100
    );

  const hotelChild =
    hotelAdult *
    childHotelPercent /
    100;

  const capacity =
    Number(data.compartmentCapacity || 0);

  const rental =
    Boolean(data.compartmentRental);

  const plan =
    getCompartmentPlan(
      capacity,
      adults,
      children
    );

  const emptyBerthCost =
    rental
      ? plan.emptyBerths * EMPTY_BERTH_PRICE
      : 0;

  const ticketAdultWithFee =
    ticketAdult + TICKET_ISSUE_FEE;

  const ticketChildWithFee =
    ticketChild + TICKET_ISSUE_FEE;

  const ticketTotal =
    adults * ticketAdultWithFee * 2 +
    children * ticketChildWithFee * 2;

  const hotelTotal =
    nights *
    (
      adults * hotelAdult +
      children * hotelChild
    );

  const netPurchaseTotal =
    ticketTotal +
    hotelTotal +
    emptyBerthCost;

  const paymentType =
    data.paymentType === "loan"
      ? "loan"
      : "cash";

  const profitPerPerson =
    Number(
      data.profitPerPerson ??
      (paymentType === "loan"
        ? 5000000
        : 3000000)
    );

  const totalPassengers =
    adults + children;

  const totalProfit =
    totalPassengers *
    profitPerPerson;

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
      : finalPrice;

  return {
    adults,
    children,
    nights,

    totalPassengers,

    ticketAdult,
    ticketChild,

    ticketAdultWithFee,
    ticketChildWithFee,

    hotelAdult,
    hotelChild,

    ticketTotal,
    hotelTotal,

    compartmentCapacity: capacity,
    compartmentRental: rental,

    compartments:
      plan.compartments,

    emptyBerths:
      plan.emptyBerths,

    emptyBerthCost,

    netPurchaseTotal,

    paymentType,

    profitPerPerson,
    totalProfit,

    finalPrice,

    loanAmount,
    customerCash
  };
}

function formatRailCalculation(result = {}) {
  return `
🧮 محاسبه تور ریلی

👨 بزرگسال: ${result.adults}
👶 کودک: ${result.children}
🌙 تعداد شب: ${result.nights}

🚆 ظرفیت کوپه: ${result.compartmentCapacity || "-"}
🚪 تعداد کوپه: ${result.compartments || 0}
🛏 تخت خالی: ${result.emptyBerths || 0}

🎫 بلیت بزرگسال:
${money(result.ticketAdult)} تومان

🎫 بلیت کودک:
${money(result.ticketChild)} تومان

🏨 هتل بزرگسال:
${money(result.hotelAdult)} تومان

🏨 هتل کودک:
${money(result.hotelChild)} تومان

🎫 مجموع بلیت:
${money(result.ticketTotal)} تومان

🏨 مجموع هتل:
${money(result.hotelTotal)} تومان

🛏 هزینه تخت خالی:
${money(result.emptyBerthCost)} تومان

📦 هزینه خرید:
${money(result.netPurchaseTotal)} تومان

💰 سود:
${money(result.totalProfit)} تومان

💵 مبلغ نهایی:
${money(result.finalPrice)} تومان

${result.paymentType === "loan"
  ? `💳 سهم پرداخت نقدی مشتری:
${money(result.customerCash)} تومان

🏦 مبلغ وام:
${money(result.loanAmount)} تومان`
  : `💵 مبلغ پرداختی نقدی:
${money(result.finalPrice)} تومان`}
`;
}

function calculateManualTour(data = {}) {
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

  const ticketChild =
    data.ticketChild !== undefined
      ? Number(data.ticketChild || 0)
      : ticketAdult *
        Number(data.childPercent ?? 50) /
        100;

  const hotelAdult =
    Number(data.hotelAdult || 0);

  const childHotelPercent =
    Number(
      data.childHotelPercent ?? 50
    );

  const childHotel =
    hotelAdult *
    childHotelPercent /
    100;

  const busRental =
    Number(data.busRental || 0);

  const paymentType =
    data.paymentType === "loan"
      ? "loan"
      : "cash";

  const profitPerPerson =
    Number(
      data.manualProfit ??
      data.profitPerPerson ??
      (paymentType === "loan"
        ? 5000000
        : 3500000)
    );

  const ticketTotal =
    adults * ticketAdult +
    children * ticketChild;

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

  const totalProfit =
    totalPassengers *
    profitPerPerson;

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
      : finalPrice;

  return {
    adults,
    children,
    nights,

    totalPassengers,

    ticketAdult,
    ticketChild,
    childTicket: ticketChild,

    hotelAdult,
    childHotel,

    busRental,

    ticketTotal,
    hotelTotal,

    netPurchaseTotal,

    paymentType,

    profitPerPerson,
    totalProfit,

    finalPrice,

    loanAmount,
    customerCash
  };
}

function formatManualCalculation(result = {}) {
  return `
🧮 محاسبه داخلی مدیر

👨 بزرگسال: ${result.adults}
👶 کودک: ${result.children}
🌙 تعداد شب: ${result.nights}

🎫 بلیت بزرگسال:
${money(result.ticketAdult)} تومان

🎫 بلیت کودک:
${money(
    result.childTicket ??
    result.ticketChild ??
    0
  )} تومان

🏨 هتل بزرگسال:
${money(result.hotelAdult)} تومان

🏨 هتل کودک:
${money(result.childHotel)} تومان

${Number(result.busRental || 0) > 0
  ? `🚌 هزینه جانبی:
${money(result.busRental)} تومان

`
  : ""}🎫 مجموع بلیت:
${money(result.ticketTotal)} تومان

🏨 مجموع هتل:
${money(result.hotelTotal)} تومان

📦 هزینه خرید:
${money(result.netPurchaseTotal)} تومان

💰 سود هر نفر:
${money(result.profitPerPerson)} تومان

💰 مجموع سود:
${money(result.totalProfit)} تومان

💵 مبلغ نهایی:
${money(result.finalPrice)} تومان

${result.paymentType === "loan"
  ? `💵 پرداخت نقدی مشتری:
${money(result.customerCash)} تومان

🏦 مبلغ وام:
${money(result.loanAmount)} تومان`
  : `💵 مبلغ پرداختی مشتری:
${money(result.finalPrice)} تومان`}
`;
}

module.exports = {
  calculateRailTour,
  formatRailCalculation,
  calculateManualTour,
  formatManualCalculation,
  getCompartmentPlan,
  money,
  roundLoanAmount
};
