// ========================================
// تنظیمات اصلی ربات سفر مشهد توس
// ========================================

const CONFIG = {

  // نام ربات
  BOT_NAME: "safarmashhadtoos_bot",

  // نام نمایشی ربات
  BOT_TITLE: "سفر مشهد توس",

  // شماره تماس
  CONTACT_PHONE: "۰۹۱۷۷۷۰۰۹۶۱",

  // نام مسئول
  ADMIN_NAME: "حمید جاویدی",

  // آدرس کانال بله
  CHANNEL_URL: "https://ble.ir/safarmashhadtoos",

  // آدرس ربات
  BOT_USERNAME: "@safarmashhadtoos_bot",

  // آدرس سایت
  WEBSITE_URL: "https://safarmashhadtoos.ir",

  // ======================================
  // تنظیمات محاسبه تور ریلی
  // ======================================

  RAIL: {

    // هزینه صدور بلیت
    TICKET_ISSUE_FEE: 0,

    // درصد قیمت بلیت کودک
    CHILD_TICKET_PERCENT: 50,

    // ====================================
    // قیمت بلیت‌های ریلی
    // ====================================

    TICKET_PRICES: {

      AHVAZ_MASHHAD: {

        name: "اهواز → مشهد",

        FOUR_BERTH: {
          name: "امید",
          company: "رجا",
          stars: 4,
          price: 2010000
        },

        SIX_BERTH: {
          name: "مهدیس",
          company: "مهتاب سیر جم",
          stars: 3,
          price: 1940000
        }

      },

      SHIRAZ_MASHHAD: {

        name: "شیراز → مشهد",

        FOUR_BERTH: {
          name: "سرير",
          company: "رجا",
          stars: 4,
          price: 2010000
        }

      }

    }

  }

};

module.exports = CONFIG;
