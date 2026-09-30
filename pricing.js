const CONFIG = require("./config");

// ========================================
// ابزارهای عمومی
// ========================================

function formatMoney(number) {
  return new Intl.NumberFormat("fa-IR")
    .format(Math.round(Number(number || 0)));
}

// ========================================
// گرد کردن مبلغ وام
// ========================================

function roundLoanAmount(amount) {

  const step = 5000000;

  return Math.round(
    Number(amount || 0) / step
  ) * step;

}

// ========================================
// پیدا کردن مسیر
// ========================================

function getRouteConfig(route) {

  const routeConfig =
    CONFIG.RAIL &&
    CONFIG.RAIL.TICKET_PRICES &&
    CONFIG.RAIL.TICKET_PRICES[route];

  if (!routeConfig) {

    throw new Error(
      "مسیر ریلی پیدا نشد."
    );

  }

  return routeConfig;

}

// ========================================
// گرفتن گزینه‌های کوپه ۴ تخته
// ========================================

function getFourBerthOptions(route) {

  const routeConfig =
    getRouteConfig(route);

  if (
    Array.isArray(
      routeConfig.FOUR_BERTH_OPTIONS
    ) &&
    routeConfig.FOUR_BERTH_OPTIONS.length > 0
  ) {

    return routeConfig.FOUR_BERTH_OPTIONS;

  }

  if (routeConfig.FOUR_BERTH) {

    return [
      routeConfig.FOUR_BERTH
    ];

  }

  return [];

}

// ========================================
// گرفتن گزینه‌های کوپه ۶ تخته
// ========================================

function getSixBerthOptions(route) {

  const routeConfig =
    getRouteConfig(route);

  if (
    Array.isArray(
      routeConfig.SIX_BERTH_OPTIONS
    ) &&
    routeConfig.SIX_BERTH_OPTIONS.length > 0
  ) {

    return routeConfig.SIX_BERTH_OPTIONS;

  }

  if (routeConfig.SIX_BERTH) {

    return [
      routeConfig.SIX_BERTH
    ];

  }

  return [];

}

// ========================================
// برنامه کوپه‌ها
// ========================================

function getCompartmentPlan(passengers) {

  passengers =
    Number(passengers);

  if (passengers <= 0) {

    throw new Error(
      "تعداد مسافران باید بیشتر از صفر باشد."
    );

  }

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

      if (
        capacity < passengers
      ) {
        continue;
      }

      const empty =
        capacity -
        passengers;

      const count =
        six +
        four;

      const candidate = {

        six,

        four,

        capacity,

        emptyBerths:
          empty,

        compartmentCount:
          count

      };

      if (
        !best ||
        candidate.emptyBerths <
          best.emptyBerths ||
        (
          candidate.emptyBerths ===
            best.emptyBerths &&
          candidate.compartmentCount <
            best.compartmentCount
        )
      ) {

        best =
          candidate;

      }

    }

  }

  const compartments = [];

  for (
    let i = 0;
    i < best.four;
    i++
  ) {

    compartments.push(
      "۴ تخته"
    );

  }

  for (
    let i = 0;
    i < best.six;
    i++
  ) {

    compartments.push(
      "۶ تخته"
    );

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

// ========================================
// دریافت قیمت بلیت
// ========================================

function getTicketPrice(
  route,
  compartmentType
) {

  const routeConfig =
    getRouteConfig(route);

  if (
    compartmentType === "4"
  ) {

    if (
      !routeConfig.FOUR_BERTH
    ) {

      throw new Error(
        "کوپه ۴ تخته برای این مسیر وجود ندارد."
      );

    }

    return Number(
      routeConfig.FOUR_BERTH.price
    );

  }

  if (
    compartmentType === "6"
  ) {

    if (
      !routeConfig.SIX_BERTH
    ) {

      throw new Error(
        "کوپه ۶ تخته برای این مسیر وجود ندارد."
      );

    }

    return Number(
      routeConfig.SIX_BERTH.price
    );

  }

  throw new Error(
    "نوع کوپه نامعتبر است."
  );

}

// ========================================
// انتخاب قیمت کوپه
// ========================================

function getBestAvailablePrice(
  route,
  compartmentType
) {

  let options = [];

  if (
    compartmentType === "4"
  ) {

    options =
      getFourBerthOptions(
        route
      );

  } else if (
    compartmentType === "6"
  ) {

    options =
      getSixBerthOptions(
        route
      );

  }

  if (
    options.length === 0
  ) {

    throw new Error(
      `کوپه ${compartmentType} تخته برای این مسیر موجود نیست.`
    );

  }

  /*
   * در حالت فعلی، ارزان‌ترین گزینه
   * برای محاسبه انتخاب می‌شود.
   */

  const sorted =
    [...options].sort(
      (a, b) =>
        Number(a.price) -
        Number(b.price)
    );

  return sorted[0];

}

// ========================================
// محاسبه تور ریلی
// ========================================

function calculateRailTour(data) {

  const route =
    data.route;

  const adults =
    Number(data.adults || 0);

  const children =
    Number(data.children || 0);

  const totalPassengers =
    adults +
    children;

  const nights =
    Number(data.nights || 0);

  const hotelPrice =
    Number(
      data.hotelPricePerPersonPerNight ||
      0
    );

  const childHotelPercent =
    Number(
      data.childHotelPercent || 50
    );

  const privateCompartment =
    Boolean(
      data.privateCompartment
    );

  const paymentType =
    data.paymentType ||
    "cash";

  if (
    totalPassengers <= 0
  ) {

    throw new Error(
      "تعداد مسافران باید بیشتر از صفر باشد."
    );

  }

  if (
    nights <= 0
  ) {

    throw new Error(
      "تعداد شب باید بیشتر از صفر باشد."
    );

  }

  if (
    hotelPrice <= 0
  ) {

    throw new Error(
      "قیمت هتل وارد نشده است."
    );

  }

  let compartmentPlan;

  if (
    privateCompartment
  ) {

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

  const trainDetails = [];

  // ======================================
  // کوپه اختصاصی
  // ======================================

  if (
    privateCompartment
  ) {

    let totalTrainCost = 0;

    // ------------------------------------
    // کوپه ۴ تخته
    // ------------------------------------

    if (
      compartmentPlan.fourBerth > 0
    ) {

      const selected =
        getBestAvailablePrice(
          route,
          "4"
        );

      const issueFee =
        Number(
          CONFIG.RAIL.TICKET_ISSUE_FEE || 0
        );

      const roundTrip =
        (
          Number(selected.price) +
          issueFee
        ) * 2;

      const capacityCost =
        roundTrip *
        4 *
        compartmentPlan.fourBerth;

      totalTrainCost +=
        capacityCost;

      trainDetails.push({

        type:
          "۴ تخته",

        name:
          selected.name,

        company:
          selected.company,

        stars:
          selected.stars,

        departure:
          selected.departure,

        arrival:
          selected.arrival,

        count:
          compartmentPlan.fourBerth,

        price:
          Number(selected.price),

        capacity: 4,

        capacityCost

      });

    }

    // ------------------------------------
    // کوپه ۶ تخته
    // ------------------------------------

    if (
      compartmentPlan.sixBerth > 0
    ) {

      const selected =
        getBestAvailablePrice(
          route,
          "6"
        );

      const issueFee =
        Number(
          CONFIG.RAIL.TICKET_ISSUE_FEE || 0
        );

      const roundTrip =
        (
          Number(selected.price) +
          issueFee
        ) * 2;

      const capacityCost =
        roundTrip *
        6 *
        compartmentPlan.sixBerth;

      totalTrainCost +=
        capacityCost;

      trainDetails.push({

        type:
          "۶ تخته",

        name:
          selected.name,

        company:
          selected.company,

        stars:
          selected.stars,

        departure:
          selected.departure,

        arrival:
          selected.arrival,

        count:
          compartmentPlan.sixBerth,

        price:
          Number(selected.price),

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

  } else {

    // ====================================
    // بلیت عادی
    // ====================================

    const routeConfig =
      getRouteConfig(route);

    let ticketPrice = 0;

    let selectedTicket = null;

    const allOptions = [

      ...getFourBerthOptions(route),

      ...getSixBerthOptions(route)

    ];

    if (
      allOptions.length > 0
    ) {

      const sorted =
        [...allOptions].sort(
          (a, b) =>
            Number(a.price) -
            Number(b.price)
        );

      selectedTicket =
        sorted[sorted.length - 1];

      ticketPrice =
        Number(
          selectedTicket.price
        );

    } else {

      if (
        routeConfig.FOUR_BERTH
      ) {

        ticketPrice =
          Number(
            routeConfig.FOUR_BERTH.price
          );

      }

      if (
        routeConfig.SIX_BERTH &&
        Number(
          routeConfig.SIX_BERTH.price
        ) > ticketPrice
      ) {

        ticketPrice =
          Number(
            routeConfig.SIX_BERTH.price
          );

      }

    }

    if (
      ticketPrice <= 0
    ) {

      throw new Error(
        "قیمت بلیت این مسیر مشخص نشده است."
      );

    }

    const issueFee =
      Number(
        CONFIG.RAIL.TICKET_ISSUE_FEE || 0
      );

    const adultOneWay =
      ticketPrice +
      issueFee;

    const adultRoundTrip =
      adultOneWay * 2;

    const childTicket =
      ticketPrice *
      Number(
        CONFIG.RAIL.CHILD_TICKET_PERCENT || 50
      ) /
      100;

    const childOneWay =
      childTicket +
      issueFee;

    const childRoundTrip =
      childOneWay * 2;

    adultTrainNet =
      adultRoundTrip;

    childTrainNet =
      childRoundTrip;

    trainDetails.push({

      type:
        "عادی",

      name:
        selectedTicket?.name ||
        "انتخاب خودکار",

      company:
        selectedTicket?.company ||
        "",

      adultTicketPrice:
        ticketPrice,

      adultRoundTrip,

      childRoundTrip

    });

  }

  // ======================================
  // هتل
  // ======================================

  const adultHotel =
    hotelPrice *
    nights;

  const childHotel =
    hotelPrice *
    childHotelPercent /
    100 *
    nights;

  const adultsTotal =
    (
      adultTrainNet +
      adultHotel
    ) *
    adults;

  const childrenTotal =
    (
      childTrainNet +
      childHotel
    ) *
    children;

  const netPurchaseTotal =
    adultsTotal +
    childrenTotal;

  // ======================================
  // سود
  // ======================================

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

  // ======================================
  // طرح الماس
  // ======================================

  let customerCash = 0;

  let loanAmount = 0;

  let actualDiamondTotal =
    finalPrice;

  if (
    paymentType === "loan"
  ) {

    loanAmount =
      roundLoanAmount(
        finalPrice * 60 / 100
      );

    if (
      loanAmount > finalPrice
    ) {

      loanAmount =
        roundLoanAmount(
          finalPrice * 60 / 100 -
          2500000
        );

    }

    customerCash =
      finalPrice -
      loanAmount;

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

// ========================================
// نمایش محاسبه تور ریلی
// ========================================

function formatRailCalculation(
  result
) {

  const routeName =
    CONFIG.RAIL
      ?.TICKET_PRICES
      ?.[result.route]
      ?.name ||
    result.route;

  let text =
    "🧮 محاسبه داخلی تور ریلی\n\n";

  text +=
    `🚆 مسیر: ${routeName}\n`;

  text +=
    `👨 بزرگسال: ${formatMoney(
      result.adults
    )} نفر\n`;

  text +=
    `👧 کودک ۲ تا ۱۲ سال: ${formatMoney(
      result.children
    )} نفر\n`;

  text +=
    `👥 مجموع: ${formatMoney(
      result.totalPassengers
    )} نفر\n`;

  text +=
    `🌙 اقامت: ${formatMoney(
      result.nights
    )} شب\n`;

  text +=
    `🏨 هتل هر نفر/شب: ${formatMoney(
      result.hotelPrice
    )} تومان\n`;

  text +=
    `👧 هتل کودک: ${formatMoney(
      result.childHotelPercent
    )}٪\n`;

  text +=
    "\n━━━━━━━━━━━━━━\n🚆 قطار\n\n";

  for (
    const item of result.trainDetails
  ) {

    if (
      item.type === "عادی"
    ) {

      text +=
        `🚆 قطار: ${
          item.name || "-"
        }\n`;

      if (
        item.company
      ) {

        text +=
          `🏢 شرکت: ${item.company}\n`;

      }

      text +=
        `🎫 بلیت بزرگسال رفت‌وبرگشت: ${formatMoney(
          item.adultRoundTrip
        )} تومان\n`;

      text +=
        `👧 بلیت کودک رفت‌وبرگشت: ${formatMoney(
          item.childRoundTrip
        )} تومان\n`;

    } else {

      text +=
        `🚃 ${item.type}: ${formatMoney(
          item.count
        )} کوپه\n`;

      text +=
        `🚆 قطار: ${
          item.name || "-"
        }\n`;

      if (
        item.company
      ) {

        text +=
          `🏢 شرکت: ${item.company}\n`;

      }

      if (
        item.stars
      ) {

        text +=
          `⭐ درجه: ${formatMoney(
            item.stars
          )} ستاره\n`;

      }

      if (
        item.departure &&
        item.arrival
      ) {

        text +=
          `🕐 حرکت: ${item.departure}\n`;

        text +=
          `🕐 ورود: ${item.arrival}\n`;

      }

      text +=
        `💰 قیمت یک‌طرفه: ${formatMoney(
          item.price
        )} تومان\n`;

      text +=
        `👥 ظرفیت: ${formatMoney(
          item.capacity *
          item.count
        )} نفر\n`;

    }

  }

  if (
    result.privateCompartment
  ) {

    text +=
      `🛏️ تخت خالی: ${formatMoney(
        result.compartmentPlan.emptyBerths
      )} عدد\n`;

  }

  text +=
    "\n━━━━━━━━━━━━━━\n🏨 هتل\n\n";

  text +=
    `👨 هتل هر بزرگسال: ${formatMoney(
      result.adultHotel
    )} تومان\n`;

  text +=
    `👧 هتل هر کودک: ${formatMoney(
      result.childHotel
    )} تومان\n`;

  text +=
    "\n━━━━━━━━━━━━━━\n💰 نت خرید\n\n";

  text +=
    `👨 بزرگسالان: ${formatMoney(
      result.adultsTotal
    )} تومان\n`;

  text +=
    `👧 کودکان: ${formatMoney(
      result.childrenTotal
    )} تومان\n`;

  text +=
    `💰 نت خرید کل: ${formatMoney(
      result.netPurchaseTotal
    )} تومان\n`;

  text +=
    "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";

  text +=
    `💵 سود هر نفر: ${formatMoney(
      result.profitPerPerson
    )} تومان\n`;

  text +=
    `📈 سود کل: ${formatMoney(
      result.totalProfit
    )} تومان\n`;

  text +=
    `💰 قیمت نهایی: ${formatMoney(
      result.finalPrice
    )} تومان\n`;

  if (
    result.paymentType === "loan"
  ) {

    text +=
      "\n━━━━━━━━━━━━━━\n💎 طرح الماس\n\n";

    text +=
      "🔹 ۴۰٪ پرداخت مشتری\n";

    text +=
      `💵 مبلغ نقدی: ${formatMoney(
        result.customerCash
      )} تومان\n\n`;

    text +=
      "🔹 ۶۰٪ سهم وام\n";

    text +=
      `💎 مبلغ وام رُندشده: ${formatMoney(
        result.loanAmount
      )} تومان\n\n`;

    text +=
      "📌 مبلغ وام به نزدیک‌ترین ۵ میلیون تومان رُند شده است.";

  }

  return text;

}

// ========================================
// محاسبه تورهای غیرریلی
// ========================================

function calculateManualTour(
  data
) {

  const type =
    data.type ||
    "BUS";

  const adults =
    Number(data.adults || 0);

  const children =
    Number(data.children || 0);

  const nights =
    Number(data.nights || 0);

  const ticketAdult =
    Number(data.ticketAdult || 0);

  const childPercent =
    Number(
      data.childPercent ?? 50
    );

  const hotelAdult =
    Number(
      data.hotelAdult || 2300000
    );

  const busRental =
    Number(
      data.busRental || 0
    );

  const manualProfit =
    Number(
      data.manualProfit || 0
    );

  const paymentType =
    data.paymentType ||
    "cash";

  const totalPassengers =
    adults +
    children;

  if (
    totalPassengers <= 0
  ) {

    throw new Error(
      "تعداد مسافران باید بیشتر از صفر باشد."
    );

  }

  if (
    nights <= 0
  ) {

    throw new Error(
      "تعداد شب اقامت باید بیشتر از صفر باشد."
    );

  }

  if (
    ticketAdult < 0 ||
    hotelAdult < 0 ||
    busRental < 0
  ) {

    throw new Error(
      "هزینه‌ها نمی‌توانند منفی باشند."
    );

  }

  const childTicket =
    ticketAdult *
    childPercent /
    100;

  const childHotel =
    hotelAdult *
    50 /
    100;

  const ticketTotal =
    adults *
      ticketAdult +
    children *
      childTicket;

  const hotelTotal =
    nights *
    (
      adults *
        hotelAdult +
      children *
        childHotel
    );

  const netPurchaseTotal =
    ticketTotal +
    hotelTotal +
    busRental;

  let profitPerPerson;

  if (
    type === "AIR"
  ) {

    profitPerPerson =
      paymentType === "loan"
        ? 6000000
        : 3500000;

  } else if (
    type === "RAIL"
  ) {

    profitPerPerson =
      paymentType === "loan"
        ? 5000000
        : 3000000;

  } else {

    profitPerPerson =
      manualProfit;

  }

  const totalProfit =
    profitPerPerson *
    totalPassengers;

  const finalPrice =
    netPurchaseTotal +
    totalProfit;

  let loanAmount = 0;

  let customerCash = 0;

  if (
    paymentType === "loan"
  ) {

    loanAmount =
      roundLoanAmount(
        finalPrice * 60 / 100
      );

    if (
      loanAmount > finalPrice
    ) {

      loanAmount =
        roundLoanAmount(
          finalPrice * 60 / 100 -
          2500000
        );

    }

    customerCash =
      finalPrice -
      loanAmount;

  }

  return {

    type,

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

// ========================================
// نمایش محاسبه تور غیرریلی
// ========================================

function formatManualCalculation(
  result
) {

  const names = {

    AIR:
      "✈️ تور هوایی",

    BUS:
      "🚌 تور اتوبوسی",

    CARAVAN_BUS:
      "🚍 کاروان اتوبوسی",

    CARAVAN_RAIL:
      "🚆 کاروان ریلی",

    HOTEL:
      "🏨 فقط هتل"

  };

  let text =
    "🧮 محاسبه داخلی مدیر\n\n";

  text +=
    `🚍 نوع سفر: ${
      names[result.type] ||
      result.type
    }\n`;

  text +=
    `👨 بزرگسال: ${formatMoney(
      result.adults
    )} نفر\n`;

  text +=
    `👧 کودک ۳ تا ۵ سال: ${formatMoney(
      result.children
    )} نفر\n`;

  text +=
    `👥 مجموع: ${formatMoney(
      result.totalPassengers
    )} نفر\n`;

  text +=
    `🌙 اقامت: ${formatMoney(
      result.nights
    )} شب\n\n`;

  text +=
    "━━━━━━━━━━━━━━\n💰 هزینه‌ها\n\n";

  text +=
    `🎫 بلیت هر بزرگسال: ${formatMoney(
      result.ticketAdult
    )} تومان\n`;

  text +=
    `🎫 بلیت هر کودک: ${formatMoney(
      result.childTicket
    )} تومان\n`;

  text +=
    `🏨 هتل هر بزرگسال/شب: ${formatMoney(
      result.hotelAdult
    )} تومان\n`;

  text +=
    `🏨 هتل هر کودک/شب: ${formatMoney(
      result.childHotel
    )} تومان\n`;

  if (
    result.busRental > 0
  ) {

    text +=
      `🚌 اجاره اتوبوس: ${formatMoney(
        result.busRental
      )} تومان\n`;

  }

  text +=
    `\n💰 نت خرید کل: ${formatMoney(
      result.netPurchaseTotal
    )} تومان\n`;

  text +=
    "\n━━━━━━━━━━━━━━\n📈 سود فروش\n\n";

  text +=
    `💵 سود هر نفر: ${formatMoney(
      result.profitPerPerson
    )} تومان\n`;

  text +=
    `📈 سود کل: ${formatMoney(
      result.totalProfit
    )} تومان\n`;

  text +=
    `💰 قیمت نهایی: ${formatMoney(
      result.finalPrice
    )} تومان\n`;

  if (
    result.paymentType === "loan"
  ) {

    text +=
      "\n━━━━━━━━━━━━━━\n💎 طرح الماس\n\n";

    text +=
      `💵 سهم نقدی مشتری: ${formatMoney(
        result.customerCash
      )} تومان\n`;

    text +=
      `💎 مبلغ وام رُندشده: ${formatMoney(
        result.loanAmount
      )} تومان\n`;

  }

  return text;

}

// ========================================
// محاسبه طرح الماس
// ========================================

function calculateDiamondPlan(
  finalPrice
) {

  finalPrice =
    Number(finalPrice || 0);

  if (
    finalPrice <= 0
  ) {

    throw new Error(
      "مبلغ نهایی باید بیشتر از صفر باشد."
    );

  }

  const loanAmount =
    roundLoanAmount(
      finalPrice * 60 / 100
    );

  const customerCash =
    finalPrice -
    loanAmount;

  return {

    finalPrice,

    customerCash,

    loanAmount,

    customerPercent:
      40,

    loanPercent:
      60

  };

}

// ========================================
// متن طرح الماس
// ========================================

function formatDiamondPlan(
  result
) {

  let text =
    "💎 طرح الماس شهر بهشت\n\n";

  text +=
    "✨ ۴۰ درصد با تو / ۶۰ درصد با ما\n\n";

  text +=
    "📌 شرایط طرح:\n";

  text +=
    "🔹 مدت بازپرداخت: ۱۲ ماه\n";

  text +=
    "🔹 کارمزد/سود: ۳٪\n";

  text +=
    "🔹 سهم نقدی مشتری: ۴۰٪\n";

  text +=
    "🔹 سهم وام: ۶۰٪\n\n";

  text +=
    "━━━━━━━━━━━━━━\n";

  text +=
    "🏦 مراحل دریافت طرح\n\n";

  text +=
    "1️⃣ نصب اپلیکیشن کیوبانک مهر\n";

  text +=
    "2️⃣ احراز هویت\n";

  text +=
    "3️⃣ اعتبارسنجی\n";

  text +=
    "4️⃣ دریافت رتبه اعتباری\n\n";

  text +=
    "━━━━━━━━━━━━━━\n";

  text +=
    "🟢 رتبه A و B\n";

  text +=
    "نیازی به ضامن ندارید.\n";

  text +=
    "خودت ضامن حسابت هستی.\n\n";

  text +=
    "🟡 رتبه C و D و پایین‌تر\n";

  text +=
    "یک ضامن + نامه کسر از حقوق + فیش حقوقی مورد نیاز است.\n\n";

  text +=
    "🏢 نیازی به مراجعه به شعبه نیست.\n";

  text +=
    "📄 مدارک باید اصل باشند.\n";

  if (
    result
  ) {

    text +=
      "\n━━━━━━━━━━━━━━\n";

    text +=
      `💰 مبلغ کل: ${formatMoney(
        result.finalPrice
      )} تومان\n`;

    text +=
      `💵 پرداخت ۴۰٪ مشتری: ${formatMoney(
        result.customerCash
      )} تومان\n`;

    text +=
      `💎 وام ۶۰٪: ${formatMoney(
        result.loanAmount
      )} تومان\n`;

  }

  return text;

}

// ========================================
// صادرات
// ========================================

module.exports = {

  formatMoney,

  roundLoanAmount,

  getCompartmentPlan,

  getTicketPrice,

  getFourBerthOptions,

  getSixBerthOptions,

  getBestAvailablePrice,

  calculateRailTour,

  formatRailCalculation,

  calculateManualTour,

  formatManualCalculation,

  calculateDiamondPlan,

  formatDiamondPlan

};
