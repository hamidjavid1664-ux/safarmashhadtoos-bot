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

  // ========================================
  // تنظیمات تور ریلی
  // ========================================

  RAIL: {

    // هزینه صدور بلیت
    TICKET_ISSUE_FEE: 0,

    // درصد بلیت کودک
    CHILD_TICKET_PERCENT: 50,

    // ========================================
    // قیمت بلیت ریلی
    // ========================================

    TICKET_PRICES: {

      // --------------------------------------
      // اهواز → مشهد
      // --------------------------------------

      AHVAZ_MASHHAD: {

        name: "اهواز → مشهد",

        // گزینه اصلی ۴ تخته
        FOUR_BERTH: {
          name: "امید",
          company: "رجا",
          stars: 4,
          price: 2010000
        },

        // گزینه اصلی ۶ تخته
        SIX_BERTH: {
          name: "مهدیس",
          company: "مهتاب سیر جم",
          stars: 3,
          price: 1940000
        },

        // تمام گزینه‌های ۴ تخته
        FOUR_BERTH_OPTIONS: [

          {
            name: "امید",
            company: "رجا",
            stars: 4,
            departure: "16:40",
            arrival: "19:25",
            price: 2010000
          },

          {
            name: "کرخه",
            company: "پارس لاریم",
            stars: 4,
            departure: "13:20",
            arrival: "15:25",
            price: 2230000
          }

        ],

        // تمام گزینه‌های ۶ تخته
        SIX_BERTH_OPTIONS: [

          {
            name: "مهدیس",
            company: "مهتاب سیر جم",
            stars: 3,
            departure: "13:20",
            arrival: "15:25",
            price: 1940000
          }

        ]

      },

      // --------------------------------------
      // شیراز → مشهد
      // --------------------------------------

      SHIRAZ_MASHHAD: {

        name: "شیراز → مشهد",

        // گزینه اصلی ۴ تخته
        FOUR_BERTH: {
          name: "سرير",
          company: "رجا",
          stars: 4,
          price: 2010000
        },

        // فعلاً گزینه ۶ تخته نداریم
        SIX_BERTH: null,

        // تمام گزینه‌های ۴ تخته
        FOUR_BERTH_OPTIONS: [

          {
            name: "سرير",
            company: "رجا",
            stars: 4,
            departure: "15:30",
            arrival: "15:45",
            price: 2010000
          },

          {
            name: "آهو",
            company: "رجا",
            stars: 4,
            departure: "15:30",
            arrival: "15:45",
            price: 2990000
          }

        ],

        // گزینه‌های ۶ تخته
        SIX_BERTH_OPTIONS: []

      }

    }

  }

};

module.exports = CONFIG;
