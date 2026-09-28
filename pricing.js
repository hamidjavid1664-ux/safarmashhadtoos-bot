// pricing.js
// فایل محاسبه قیمت تورها
// فعلاً ساختار پایه است تا سرور بدون خطا اجرا شود.
// قیمت‌های واقعی را بعداً می‌توانیم وارد کنیم.

function calculateRailTour(data = {}) {
  const adults = Number(data.adults || 0);
  const children = Number(data.children || 0);
  const nights = Number(data.nights || 0);

  return {
    adults,
    children,
    nights,
    total: 0,
    status: "pending"
  };
}

function formatRailCalculation(result = {}) {
  if (result.status === "pending" || !result.total) {
    return "💰 قیمت این سفر پس از بررسی و تأیید مدیر اعلام می‌شود.";
  }

  return `💰 مبلغ تقریبی سفر: ${Number(result.total).toLocaleString("fa-IR")} تومان`;
}

module.exports = {
  calculateRailTour,
  formatRailCalculation
};
