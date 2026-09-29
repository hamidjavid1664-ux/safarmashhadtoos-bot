const CONFIG = require("./config");


function formatMoney(number) {

  return new Intl.NumberFormat("fa-IR")
    .format(
      Math.round(Number(number || 0))
    );
}


/*
========================================================
گرد کردن مبلغ وام
========================================================

مثلاً:

15,370,000
می‌شود:

15,000,000

22,850,000
می‌شود:

25,000,000

یعنی مبلغ وام به نزدیک‌ترین ۵ میلیون تومان گرد می‌شود.
========================================================
*/

function roundLoanAmount(amount) {

  const step = 5000000;

  return Math.round(
    Number(amount || 0) / step
  ) * step;
}


/*
========================================================
محاسبه ترکیب کوپه
========================================================
*/

function getCompartmentPlan(passengers) {

  passengers = Number(passengers);

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

      if (capacity < passengers) continue;

      const empty =
        capacity - passengers;

      const count =
        six + four;

      const candidate = {
        six,
        four,
        capacity,
        emptyBerths: empty,
        compartmentCount: count
      };

      if (
        !best ||
        candidate.emptyBerths < best.emptyBerths ||
        (
          candidate.emptyBerths === best.emptyBerths &&
          candidate.compartmentCount <
            best.compartmentCount
        )
      ) {

        best = candidate;
      }
    }
  }

  const compartments = [];

  for (
    let i = 0;
    i < best.four;
    i++
  ) {

    compartments.push("۴ تخته");
  }

  for (
    let i = 0;
    i < best.six;
    i++
  ) {

    compartments.push("۶ تخته");
  }

  return {

    compartments,

    capacity:
      best.capacity,

    emptyBerths:
      best.emptyBerths,

    fourBerth:
      best.four,

    sixBerth:
      best.six
  };
}


/*
========================================================
قیمت بلیت
========================================================
*/

function getTicketPrice(
  route,
  compartmentType
) {

  const routeConfig =
    CONFIG.RAIL.TICKET_PRICES[route];

  if (!routeConfig) {

    throw new Error(
      "مسیر ریلی پیدا نشد."
    );
  }

  if (compartmentType === "4") {

    if (!routeConfig.FOUR_BERTH) {

      throw new Error(
        "کوپه ۴ تخته برای این مسیر وجود ندارد."
      );
    }

    return routeConfig.FOUR_BERTH.price;
  }

  if (compartmentType === "6") {

    if (!routeConfig.SIX_BERTH) {

      throw new Error(
        "کوپه ۶ تخته برای این مسیر وجود ندارد."
      );
    }

    return routeConfig.SIX_BERTH.price;
  }

  throw new Error(
    "نوع کوپه نامعتبر است."
  );
}


/*
========================================================
محاسبه تور ریلی
========================================================
*/

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
      data.childHotelPercent || 50
    );

  const privateCompartment =
    Boolean(data.privateCompartment);

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


  let compartmentPlan = null;

  if (privateCompartment) {

    compartmentPlan =
      getCompartmentPlan(
        totalPassengers
      );

  } else {

    compartmentPlan = {

      compartments: [],

      capacity:
        totalPassengers,

      emptyBerths: 0,

      fourBerth: 0,

      sixBerth: 0
    };
  }


  let adultTrainNet = 0;

  let childTrainNet = 0;

  let trainDetails = [];


  /*
  ================================================
  کوپه اختصاصی
  ================================================
  */

  if (privateCompartment) {

    let totalTrainCost = 0;


    if (
      compartmentPlan.fourBerth > 0
    ) {

      const price =
        getTicketPrice(
          route,
          "4"
        );

      const roundTrip =
        (
          price +
          CONFIG.RAIL.TICKET_ISSUE_FEE
        ) * 2;

      const capacityCost =
        roundTrip *
        4 *
        compartmentPlan.fourBerth;

      totalTrainCost +=
        capacityCost;

      trainDetails.push({

        type: "۴ تخته",

        count:
          compartmentPlan.fourBerth,

        price,

        capacity: 4,

        capacityCost
      });
    }


    if (
      compartmentPlan.sixBerth > 0
    ) {

      const price =
        getTicketPrice(
          route,
          "6"
        );

      const roundTrip =
        (
          price +
          CONFIG.RAIL.TICKET_ISSUE_FEE
        ) * 2;

      const capacityCost =
        roundTrip *
        6 *
        compartmentPlan.sixBerth;

      totalTrainCost +=
        capacityCost;

      trainDetails.push({

        type: "۶ تخته",

        count:
          compartmentPlan.sixBerth,

        price,

        capacity: 6,

        capacityCost
      });
    }


    const perPerson =
      totalTrainCost /
      totalPassengers;


    adultTrainNet =
      perPerson;

    childTrainNet =
      perPerson;

  }


  /*
  ================================================
  بلیت عادی
  ================================================
  */

  else {

    const routeConfig =
      CONFIG.RAIL.TICKET_PRICES[
        route
      ];

    let ticketPrice = 0;


    if (
      routeConfig.FOUR_BERTH
    ) {

      ticketPrice =
        routeConfig.FOUR_BERTH.price;
    }


    if (
      routeConfig.SIX_BERTH &&
      routeConfig.SIX_BERTH.price >
        ticketPrice
    ) {

      ticketPrice =
        routeConfig.SIX_BERTH.price;
    }


    const adultOneWay =
      ticketPrice +
      CONFIG.RAIL.TICKET_ISSUE_FEE;


    const adultRoundTrip =
      adultOneWay * 2;


    const childTicket =
      ticketPrice *
      CONFIG.RAIL.CHILD_TICKET_PERCENT /
      100;


    const childOneWay =
      childTicket +
      CONFIG.RAIL.TICKET_ISSUE_FEE;


    const childRoundTrip =
      childOneWay * 2;


    adultTrainNet =
      adultRoundTrip;

    childTrainNet =
      childRoundTrip;


    trainDetails.push({

      type: "عادی",

      adultTicketPrice:
        ticketPrice,

      adultRoundTrip,

      childRoundTrip
    });
  }


  /*
  ================================================
  هتل
  ================================================
  */

  const adultHotel =
    hotelPrice * nights;


  const childHotel =
    hotelPrice *
    childHotelPercent /
    100 *
    nights;


  /*
  ================================================
  نت خرید
  ================================================
  */

  const adultsTotal =
    (
      adultTrainNet +
      adultHotel
    ) * adults;


  const childrenTotal =
    (
      childTrainNet +
      childHotel
    ) * children;


  const netPurchaseTotal =
    adultsTotal +
    childrenTotal;


  /*
  ================================================
  سود
  ================================================
  */

  // سود نهایی طبق آخرین مقادیر تعیین‌شده
  // ریلی: نقدی ۳,۰۰۰,۰۰۰ / طرح الماس ۵,۰۰۰,۰۰۰ تومان
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


  /*
  ================================================
  طرح الماس
  ================================================
  */

  let customerCash = 0;

  let loanAmount = 0;

  let actualDiamondTotal = finalPrice;


  if (
    paymentType === "loan"
  ) {

    /*
    مبلغ وام = ۶۰٪

    سپس به نزدیک‌ترین ۵ میلیون
    گرد می‌شود.
    */

    loanAmount =
      roundLoanAmount(
        finalPrice *
        60 /
        100
      );


    /*
    مبلغ نقدی = ۴۰٪
    */

    customerCash =
      finalPrice -
      loanAmount;


    /*
    اگر خواستی مبلغ نقدی هم
    دقیقاً ۴۰٪ باشد، این قسمت
    را بعداً می‌توان تغییر داد.
    */

    actualDiamondTotal =
      customerCash +
      loanAmount;
  }


  return {

    route,

    adults,

    children,

    totalPassengers,

    nights,

    hotelPrice,

    childHotelPercent,

    privateCompartment,

    compartmentPlan,

    trainDetails,

    adultTrainNet,

    childTrainNet,

    adultHotel,

    childHotel,

    adultsTotal,

    childrenTotal,

    netPurchaseTotal,

    profitPerPerson,

    totalProfit,

    finalPrice,

    paymentType,

    customerCash,

    loanAmount,

    actualDiamondTotal
  };
}


/*
========================================================
نمایش نتیجه
========================================================
*/

function formatRailCalculation(result) {

  const routeName =
    CONFIG.RAIL.TICKET_PRICES[
      result.route
    ]?.name ||
    result.route;


  let text =
    "🧮 محاسبه داخلی تور ریلی\n\n";


  text +=
    `🚆 مسیر: ${routeName}\n`;

  text +=
    `👨 بزرگسال: ${formatMoney(result.adults)} نفر\n`;

  text +=
    `👧 کودک ۲ تا ۱۲ سال: ${formatMoney(result.children)} نفر\n`;

  text +=
    `👥 مجموع: ${formatMoney(result.totalPassengers)} نفر\n`;

  text +=
    `🌙 اقامت: ${formatMoney(result.nights)} شب\n`;

  text +=
    `🏨 هتل هر نفر/شب: ${formatMoney(result.hotelPrice)} تومان\n`;

  text +=
    `👧 هتل کودک: ${formatMoney(result.childHotelPercent)}٪\n`;


  text +=
    "\n━━━━━━━━━━━━━━\n🚆 قطار\n\n";


  for (
    const item of result.trainDetails
  ) {

    if (
      item.type === "عادی"
    ) {

      text +=
        `🎫 بلیت بزرگسال رفت‌وبرگشت: ${formatMoney(item.adultRoundTrip)} تومان\n`;

      text +=
        `👧 بلیت کودک ۲ تا ۱۲ سال رفت‌وبرگشت: ${formatMoney(item.childRoundTrip)} تومان\n`;

    } else {

      text +=
        `🚃 ${item.type}: ${formatMoney(item.count)} کوپه\n`;

      text +=
        `💰 قیمت یک‌طرفه: ${formatMoney(item.price)} تومان\n`;

      text +=
        `👥 ظرفیت: ${formatMoney(item.capacity * item.count)} نفر\n`;
    }
  }


  if (
    result.privateCompartment
  ) {

    text +=
      `🛏️ تخت خالی: ${formatMoney(result.compartmentPlan.emptyBerths)} عدد\n`;
  }


  text +=
    "\n━━━━━━━━━━━━━━\n🏨 هتل\n\n";


  text +=
    `👨 هتل هر بزرگسال: ${formatMoney(result.adultHotel)} تومان\n`;

  text +=
    `👧 هتل هر کودک: ${formatMoney(result.childHotel)} تومان\n`;


  text +=
    "\n━━━━━━━━━━━━━━\n💰 نت خرید\n\n";


  text +=
    `👨 بزرگسالان: ${formatMoney(result.adultsTotal)} تومان\n`;

  text +=
    `👧 کودکان: ${formatMoney(result.childrenTotal)} تومان\n`;

  text +=
    `💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)} تومان\n`;


  text +=
    "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";


  text +=
    `💵 سود هر نفر: ${formatMoney(result.profitPerPerson)} تومان\n`;

  text +=
    `📈 سود کل: ${formatMoney(result.totalProfit)} تومان\n`;

  text +=
    `💰 قیمت نهایی: ${formatMoney(result.finalPrice)} تومان\n`;


  if (
    result.paymentType === "loan"
  ) {

    text +=
      "\n━━━━━━━━━━━━━━\n💎 طرح الماس\n\n";


    text +=
      "🔹 ۴۰٪ پرداخت مشتری\n";

    text +=
      `💵 مبلغ نقدی: ${formatMoney(result.customerCash)} تومان\n\n`;


    text +=
      "🔹 ۶۰٪ سهم وام\n";

    text +=
      `💎 مبلغ وام رُندشده: ${formatMoney(result.loanAmount)} تومان\n\n`;


    text +=
      "📌 مبلغ وام به نزدیک‌ترین ۵ میلیون تومان رُند شده است.";
  }


  return text;
}



/*
========================================================
محاسبه دستی تورهای غیرریلی برای مدیر
========================================================

هزینه‌ها عمداً دستی هستند تا مدیر بتواند قیمت روز پرواز، اتوبوس
یا اجاره اتوبوس را وارد کند.

سود ثابت:
✈️ هوایی نقدی ۳,۵۰۰,۰۰۰ / طرح الماس ۶,۰۰۰,۰۰۰
🚆 ریلی در تابع بالا ۳,۰۰۰,۰۰۰ / طرح الماس ۵,۰۰۰,۰۰۰
برای اتوبوسی و کاروانی سود قابل ورود توسط مدیر است.
========================================================
*/

function calculateManualTour(data) {

  const type = data.type || "BUS";
  const adults = Number(data.adults || 0);
  const children = Number(data.children || 0);
  const nights = Number(data.nights || 0);
  const ticketAdult = Number(data.ticketAdult || 0);
  const childPercent = Number(data.childPercent ?? 50);
  const hotelAdult = Number(data.hotelAdult || 2300000);
  const busRental = Number(data.busRental || 0);
  const manualProfit = Number(data.manualProfit || 0);
  const paymentType = data.paymentType || "cash";

  const totalPassengers = adults + children;
  if (totalPassengers <= 0) throw new Error("تعداد مسافران باید بیشتر از صفر باشد.");
  if (nights <= 0) throw new Error("تعداد شب اقامت باید بیشتر از صفر باشد.");
  if (ticketAdult < 0 || hotelAdult < 0 || busRental < 0) throw new Error("هزینه‌ها نمی‌توانند منفی باشند.");

  const childTicket = ticketAdult * childPercent / 100;
  const childHotel = hotelAdult * 50 / 100;

  const ticketTotal = adults * ticketAdult + children * childTicket;
  const hotelTotal = nights * (adults * hotelAdult + children * childHotel);
  const netPurchaseTotal = ticketTotal + hotelTotal + busRental;

  let profitPerPerson;
  if (type === "AIR") {
    profitPerPerson = paymentType === "loan" ? 6000000 : 3500000;
  } else if (type === "RAIL") {
    profitPerPerson = paymentType === "loan" ? 5000000 : 3000000;
  } else {
    profitPerPerson = manualProfit;
  }

  const totalProfit = profitPerPerson * totalPassengers;
  const finalPrice = netPurchaseTotal + totalProfit;

  let loanAmount = 0;
  let customerCash = 0;
  if (paymentType === "loan") {
    loanAmount = roundLoanAmount(finalPrice * 60 / 100);
    if (loanAmount > finalPrice) loanAmount = roundLoanAmount(finalPrice * 60 / 100 - 2500000);
    customerCash = finalPrice - loanAmount;
  }

  return {
    type, adults, children, nights, totalPassengers,
    ticketAdult, childTicket, hotelAdult, childHotel,
    busRental, ticketTotal, hotelTotal, netPurchaseTotal,
    profitPerPerson, totalProfit, finalPrice,
    paymentType, loanAmount, customerCash
  };
}

function formatManualCalculation(result) {
  const names = {
    AIR: "✈️ تور هوایی",
    BUS: "🚌 تور اتوبوسی",
    CARAVAN_BUS: "🚍 کاروان اتوبوسی",
    CARAVAN_RAIL: "🚆 کاروان ریلی",
    HOTEL: "🏨 فقط هتل"
  };

  let text = "🧮 محاسبه داخلی مدیر\n\n";
  text += `🚍 نوع سفر: ${names[result.type] || result.type}\n`;
  text += `👨 بزرگسال: ${formatMoney(result.adults)} نفر\n`;
  text += `👧 کودک ۳ تا ۵ سال: ${formatMoney(result.children)} نفر\n`;
  text += `👥 مجموع: ${formatMoney(result.totalPassengers)} نفر\n`;
  text += `🌙 اقامت: ${formatMoney(result.nights)} شب\n\n`;
  text += "━━━━━━━━━━━━━━\n💰 هزینه‌ها\n\n";
  text += `🎫 بلیت هر بزرگسال: ${formatMoney(result.ticketAdult)} تومان\n`;
  text += `🎫 بلیت هر کودک: ${formatMoney(result.childTicket)} تومان\n`;
  text += `🏨 هتل هر بزرگسال/شب: ${formatMoney(result.hotelAdult)} تومان\n`;
  text += `🏨 هتل هر کودک/شب: ${formatMoney(result.childHotel)} تومان\n`;
  if (result.busRental > 0) text += `🚌 اجاره اتوبوس: ${formatMoney(result.busRental)} تومان\n`;
  text += `\n💰 نت خرید کل: ${formatMoney(result.netPurchaseTotal)} تومان\n`;
  text += "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";
  text += `💵 سود هر نفر: ${formatMoney(result.profitPerPerson)} تومان\n`;
  text += `📈 سود کل: ${formatMoney(result.totalProfit)} تومان\n`;
  text += `💰 قیمت نهایی: ${formatMoney(result.finalPrice)} تومان\n`;
  if (result.paymentType === "loan") {
    text += "\n━━━━━━━━━━━━━━\n💎 طرح الماس\n\n";
    text += `💵 سهم نقدی مشتری: ${formatMoney(result.customerCash)} تومان\n`;
    text += `💎 مبلغ وام رُندشده: ${formatMoney(result.loanAmount)} تومان\n`;
  }
  return text;
}

module.exports = {

  calculateRailTour,

  formatRailCalculation,

  getCompartmentPlan,

  formatMoney,

  roundLoanAmount,
  calculateManualTour,
  formatManualCalculation
};
