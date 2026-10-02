const CONFIG = require("./config");

function formatMoney(number) {
  return new Intl.NumberFormat("fa-IR").format(Math.round(Number(number || 0)));
}

function roundLoanAmount(amount) {
  return Math.round(Number(amount || 0) / 5000000) * 5000000;
}

function getCompartmentPlan(passengers) {
  passengers = Number(passengers || 0);
  let best = null;
  for (let six = 0; six <= Math.ceil(passengers / 6) + 2; six++) {
    for (let four = 0; four <= Math.ceil(passengers / 4) + 2; four++) {
      const capacity = six * 6 + four * 4;
      if (capacity < passengers) continue;
      const candidate = { six, four, capacity, emptyBerths: capacity - passengers, compartmentCount: six + four };
      if (!best || candidate.emptyBerths < best.emptyBerths || (candidate.emptyBerths === best.emptyBerths && candidate.compartmentCount < best.compartmentCount)) best = candidate;
    }
  }
  return {
    compartments: [ ...Array(best.four).fill("۴ تخته"), ...Array(best.six).fill("۶ تخته") ],
    capacity: best.capacity,
    emptyBerths: best.emptyBerths,
    fourBerth: best.four,
    sixBerth: best.six
  };
}

function getTicketPrice(route, type) {
  const r = CONFIG.RAIL.TICKET_PRICES[route];
  if (!r) throw new Error("مسیر ریلی پیدا نشد.");
  const p = type === "4" ? r.FOUR_BERTH?.price : r.SIX_BERTH?.price;
  if (!p) throw new Error("قیمت کوپه برای این مسیر ثبت نشده است.");
  return p;
}

function calculateRailTour(data) {
  const route = data.route;
  const adults = Number(data.adults || 0);
  const children = Number(data.children || 0);
  const totalPassengers = adults + children;
  const nights = Number(data.nights || 0);
  const hotelPrice = Number(data.hotelPricePerPersonPerNight || 0);
  const childHotelPercent = Number(data.childHotelPercent ?? 50);
  const privateCompartment = Boolean(data.privateCompartment);
  const paymentType = data.paymentType || "cash";
  if (totalPassengers <= 0) throw new Error("تعداد مسافران باید بیشتر از صفر باشد.");
  if (nights <= 0) throw new Error("تعداد شب باید بیشتر از صفر باشد.");
  if (hotelPrice <= 0) throw new Error("قیمت هتل وارد نشده است.");
  const issue = CONFIG.RAIL.TICKET_ISSUE_FEE;
  const routeConfig = CONFIG.RAIL.TICKET_PRICES[route];
  let trainTotal = 0;
  let adultTrain = 0;
  let childTrain = 0;
  let trainDetails = [];
  let compartmentPlan = null;

  if (privateCompartment) {
    compartmentPlan = getCompartmentPlan(totalPassengers);
    if (compartmentPlan.fourBerth) {
      const price = getTicketPrice(route, "4");
      const roundTrip = (price + issue) * 2;
      const cost = roundTrip * 4 * compartmentPlan.fourBerth;
      trainTotal += cost;
      trainDetails.push({ type: "۴ تخته", count: compartmentPlan.fourBerth, price, capacity: 4, capacityCost: cost });
    }
    if (compartmentPlan.sixBerth) {
      const price = getTicketPrice(route, "6");
      const roundTrip = (price + issue) * 2;
      const cost = roundTrip * 6 * compartmentPlan.sixBerth;
      trainTotal += cost;
      trainDetails.push({ type: "۶ تخته", count: compartmentPlan.sixBerth, price, capacity: 6, capacityCost: cost });
    }
    const perPerson = trainTotal / totalPassengers;
    adultTrain = perPerson;
    childTrain = perPerson;
  } else {
    const ticketPrice = Math.max(routeConfig.FOUR_BERTH?.price || 0, routeConfig.SIX_BERTH?.price || 0);
    const adultRoundTrip = (ticketPrice + issue) * 2;
    const childRoundTrip = (ticketPrice * CONFIG.RAIL.CHILD_TICKET_PERCENT / 100 + issue) * 2;
    adultTrain = adultRoundTrip;
    childTrain = childRoundTrip;
    trainTotal = adults * adultTrain + children * childTrain;
    trainDetails.push({ type: "عادی", adultRoundTrip, childRoundTrip, ticketPrice });
  }

  const adultHotel = hotelPrice * nights;
  const childHotel = hotelPrice * childHotelPercent / 100 * nights;
  const adultHotelTotal = adults * adultHotel;
  const childHotelTotal = children * childHotel;
  const hotelTotal = adultHotelTotal + childHotelTotal;
  const netPurchaseTotal = trainTotal + hotelTotal;
  const profitPerPerson = paymentType === "loan" ? 5000000 : 3000000;
  const totalProfit = profitPerPerson * totalPassengers;
  const finalPrice = netPurchaseTotal + totalProfit;
  const loanAmount = paymentType === "loan" ? roundLoanAmount(finalPrice * 0.60) : 0;
  const customerCash = paymentType === "loan" ? finalPrice - loanAmount : 0;


  return { route, adults, children, totalPassengers, nights, hotelPrice, childHotelPercent, privateCompartment, compartmentPlan, trainDetails, trainTotal, adultTrain, childTrain, adultHotel, childHotel, adultHotelTotal, childHotelTotal, hotelTotal, netPurchaseTotal, profitPerPerson, totalProfit, finalPrice, paymentType, loanAmount, customerCash };
}

function formatRailCalculation(r) {
  const routeName = CONFIG.RAIL.TICKET_PRICES[r.route]?.name || r.route;
  const t = r.trainDetails[0];
  let text = "�� محاسبه داخلی تور ریلی\n━━━━━━━━━━━━━━━━━━\n";
  text += `�� مسیر: ${routeName}\n`;
  if (r.privateCompartment) text += `�� مسیر: ${r.compartmentPlan.compartments.join(" + ")}\n`;
  text += `�� بزرگسال: ${formatMoney(r.adults)} نفر\n`;
  text += `�� کودک ۲ تا ۱۲ سال: ${formatMoney(r.children)} نفر\n`;
  text += `�� مجموع مسافران: ${formatMoney(r.totalPassengers)} نفر\n━━━━━━━━━━━━━━━━━━\n�� محاسبه قطار\n`;
  if (!r.privateCompartment) {
    text += `قیمت بلیط: ${formatMoney(t.ticketPrice)} تومان\n`;
    text += `هزینه صدور هر بلیط یک‌طرفه: ${formatMoney(CONFIG.RAIL.TICKET_ISSUE_FEE)} تومان\n`;
    text += `بلیط رفت و برگشت بزرگسال: ${formatMoney(t.adultRoundTrip)} تومان\n`;
    text += `بلیط رفت و برگشت کودک: ${formatMoney(t.childRoundTrip)} تومان\n`;
  } else {
    text += `قیمت بلیط: ${formatMoney(t.price)} تومان\n`;
    text += `هزینه صدور هر بلیط یک‌طرفه: ${formatMoney(CONFIG.RAIL.TICKET_ISSUE_FEE)} تومان\n`;
    text += `�� کوپه خصوصی: بله\n`;
    text += `��️ ظرفیت خریداری‌شده: ${formatMoney(r.compartmentPlan.capacity)} تخت\n`;
    text += `��️ تخت خالی: ${formatMoney(r.compartmentPlan.emptyBerths)} عدد\n`;
  }
  if (!r.privateCompartment) text += `�� کوپه خصوصی: خیر\n`;
  text += `�� مجموع قطار: ${formatMoney(r.trainTotal)} تومان\n━━━━━━━━━━━━━━━━━━\n`;
  text += `�� محاسبه هتل\nقیمت هتل هر نفر / هر شب: ${formatMoney(r.hotelPrice)} تومان\n`;
  text += `تعداد شب: ${formatMoney(r.nights)}\nدرصد هتل کودک: ${formatMoney(r.childHotelPercent)}٪\n`;
  text += `هتل هر بزرگسال: ${formatMoney(r.adultHotel)} تومان\n`;
  text += `هتل هر کودک: ${formatMoney(r.childHotel)} تومان\n`;
  text += `�� مجموع هتل: ${formatMoney(r.hotelTotal)} تومان\n━━━━━━━━━━━━━━━━━━\n`;
  text += `�� خرید خالص: ${formatMoney(r.netPurchaseTotal)} تومان\n`;
  text += `�� سود هر نفر: ${formatMoney(r.profitPerPerson)} تومان\n`;
  text += `�� مجموع سود: ${formatMoney(r.totalProfit)} تومان\n━━━━━━━━━━━━━━━━━━\n`;
  text += `�� قیمت نهایی فروش: ${formatMoney(r.finalPrice)} تومان\n━━━━━━━━━━━━━━━━━━`;
  if (r.paymentType === "loan") text += `\n\n�� طرح الماس\n�� سهم نقدی: ${formatMoney(r.customerCash)} تومان\n�� مبلغ وام رُندشده: ${formatMoney(r.loanAmount)} تومان`;
  return text;
}

function calculateManualTour(data) {
  const adults = Number(data.adults || 0);
  const children = Number(data.children || 0);
  const nights = Number(data.nights || 0);
  const totalPassengers = adults + children;
  const isAir = data.type === "AIR";

  const ticketAdultOutbound = Number(data.ticketAdultOutbound || 0);
  const ticketAdultReturn = Number(data.ticketAdultReturn || 0);
  const ticketChildOutbound = Number(data.ticketChildOutbound || 0);
  const ticketChildReturn = Number(data.ticketChildReturn || 0);
  const ticketAdult = isAir ? ticketAdultOutbound + ticketAdultReturn : Number(data.ticketAdult || 0);
  const ticketChild = isAir ? ticketChildOutbound + ticketChildReturn : (data.ticketChild !== undefined ? Number(data.ticketChild || 0) : ticketAdult * Number(data.childPercent ?? 50) / 100);
  const hotelAdult = Number(data.hotelAdult || 0);
  const childHotelPercent = 50;
  const childHotel = hotelAdult * childHotelPercent / 100;
  const busRental = Number(data.busRental || 0);
  const paymentType = data.paymentType || "cash";
  const manualProfit = Number(data.manualProfit || 0);
  if (totalPassengers <= 0 || nights <= 0) throw new Error("تعداد مسافر و شب باید صحیح باشد.");
  const ticketTotal = adults * ticketAdult + children * ticketChild;
  const hotelTotal = nights * (adults * hotelAdult + children * childHotel);
  const netPurchaseTotal = ticketTotal + hotelTotal + busRental;
  const profitPerPerson = manualProfit;
  const totalProfit = profitPerPerson * totalPassengers;
  const finalPrice = netPurchaseTotal + totalProfit;
  const loanAmount = paymentType === "loan" ? roundLoanAmount(finalPrice * 0.60) : 0;
  const customerCash = paymentType === "loan" ? finalPrice - loanAmount : 0;
  return { ...data, adults, children, nights, totalPassengers, ticketAdultOutbound, ticketAdultReturn, ticketChildOutbound, ticketChildReturn, ticketAdult, ticketChild, childTicket: ticketChild, hotelAdult, childHotel, childHotelPercent, busRental, ticketTotal, hotelTotal, netPurchaseTotal, profitPerPerson, totalProfit, finalPrice, paymentType, loanAmount, customerCash };
}

function formatManualCalculation(r) {
  let text = `�� محاسبه داخلی مدیر\n━━━━━━━━━━━━━━━━━━\n�� بزرگسال: ${formatMoney(r.adults)} نفر\n�� کودک ۳ تا ۵ سال: ${formatMoney(r.children)} نفر\n�� تعداد شب: ${formatMoney(r.nights)}\n━━━━━━━━━━━━━━━━━━\n`;
  if (r.type === "AIR") text += `✈️ پرواز رفت بزرگسال: ${formatMoney(r.ticketAdultOutbound)} تومان\n✈️ پرواز برگشت بزرگسال: ${formatMoney(r.ticketAdultReturn)} تومان\n�� پرواز رفت کودک: ${formatMoney(r.ticketChildOutbound)} تومان\n�� پرواز برگشت کودک: ${formatMoney(r.ticketChildReturn)} تومان\n�� مجموع رفت‌وبرگشت هر بزرگسال: ${formatMoney(r.ticketAdult)} تومان\n�� مجموع رفت‌وبرگشت هر کودک: ${formatMoney(r.ticketChild)} تومان\n`;
  else text += `�� بلیت بزرگسال: ${formatMoney(r.ticketAdult)} تومان\n�� بلیت کودک: ${formatMoney(r.ticketChild)} تومان\n`;
  text += `�� هتل بزرگسال/شب: ${formatMoney(r.hotelAdult)} تومان\n�� هتل کودک ۳ تا ۵ سال/شب: ${formatMoney(r.childHotel)} تومان (۵۰٪)\n�� مجموع بلیت: ${formatMoney(r.ticketTotal)} تومان\n�� مجموع هتل: ${formatMoney(r.hotelTotal)} تومان\n━━━━━━━━━━━━━━━━━━\n�� خرید خالص: ${formatMoney(r.netPurchaseTotal)} تومان\n�� سود هر نفر: ${formatMoney(r.profitPerPerson)} تومان\n�� سود کل: ${formatMoney(r.totalProfit)} تومان\n━━━━━━━━━━━━━━━━━━\n�� قیمت نهایی فروش: ${formatMoney(r.finalPrice)} تومان\n━━━━━━━━━━━━━━━━━━`;
  if (r.paymentType === "loan") text += `\n\n�� طرح الماس\n�� سهم نقدی: ${formatMoney(r.customerCash)} تومان\n�� مبلغ وام رُندشده: ${formatMoney(r.loanAmount)} تومان`;
  return text;
}


module.exports = { calculateRailTour, formatRailCalculation, calculateManualTour, formatManualCalculation, getCompartmentPlan, formatMoney, roundLoanAmount };
