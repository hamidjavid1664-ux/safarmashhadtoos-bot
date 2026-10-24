
/**
 * محاسبه بلیت قطار - سفر مشهد طوس
 *
 * بزرگسال: ۱۰۰٪ قیمت بلیت بزرگسال
 * کودک ۲ تا کمتر از ۱۲ سال: ۷۵٪
 * نوزاد ۱۰ روز تا کمتر از ۲ سال: ۷٪ (هزینه بیمه)
 *
 * هزینه صدور بلیت:
 * ۲۰۰ هزار تومان برای هر نفر، مجموع رفت‌وبرگشت
 *
 * همه قیمت‌ها به ریال هستند.
 */

const TRAIN_TICKET_ISSUE_FEE = 2_000_000; // ۲۰۰ هزار تومان

const ADULT_TICKET_PERCENT = 1.00;
const CHILD_TICKET_PERCENT = 0.75;
const INFANT_TICKET_PERCENT = 0.07;

function calculateTrainTicketPrice({
  adultPrice,
  adults = 0,
  children = 0,
  infants = 0
}) {
  const price = Number(adultPrice);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("قیمت بلیت بزرگسال معتبر نیست.");
  }

  const adultCount = Number(adults);
  const childCount = Number(children);
  const infantCount = Number(infants);

  for (const count of [adultCount, childCount, infantCount]) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("تعداد مسافران باید عدد صحیح و نامنفی باشد.");
    }
  }

  const adultUnitPrice = Math.round(
    price * ADULT_TICKET_PERCENT
  );

  const childUnitPrice = Math.round(
    price * CHILD_TICKET_PERCENT
  );

  const infantUnitPrice = Math.round(
    price * INFANT_TICKET_PERCENT
  );

  const adultTotal =
    (adultUnitPrice + TRAIN_TICKET_ISSUE_FEE) * adultCount;

  const childTotal =
    (childUnitPrice + TRAIN_TICKET_ISSUE_FEE) * childCount;

  const infantTotal =
    (infantUnitPrice + TRAIN_TICKET_ISSUE_FEE) * infantCount;

  const totalPassengers = adultCount + childCount + infantCount;

  return {
    adultUnitPrice,
    childUnitPrice,
    infantUnitPrice,

    issueFeePerPerson: TRAIN_TICKET_ISSUE_FEE,

    adultTotal,
    childTotal,
    infantTotal,

    totalIssueFee: totalPassengers * TRAIN_TICKET_ISSUE_FEE,

    total: adultTotal + childTotal + infantTotal
  };
}

function formatRial(amount) {
  return `${Math.round(amount).toLocaleString("en-US")} ریال`;
}

module.exports = {
  calculateTrainTicketPrice,
  formatRial,
  TRAIN_TICKET_ISSUE_FEE,
  ADULT_TICKET_PERCENT,
  CHILD_TICKET_PERCENT,
  INFANT_TICKET_PERCENT
};
