require("dotenv").config();

const CONFIG = {
  PORT: Number(
    process.env.PORT || 10000
  ),

  BOT_TOKEN:
    process.env.BALE_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    "",

  ADMIN_CHAT_ID:
    String(
      process.env.ADMIN_CHAT_ID || ""
    ),

  BALE_API_BASE:
    process.env.BALE_API_BASE ||
    "https://tapi.bale.ai/bot",

  BOT_NAME:
    "safarmashhadtoos_bot",

  BOT_TITLE:
    "سفر مشهد توس",

  CONTACT: {
    name:
      "حمید جاویدی",

    phone:
      "۰۹۱۷۷۷۰۰۹۶۱"
  },

  CHANNEL_URL:
    "https://ble.ir/safarmashhadtoos",

  BOT_USERNAME:
    "@safarmashhadtoos_bot",

  WEBSITE_URL:
    "https://safarmashhadtoos.ir",

  DIAMOND_QBANK_URL:
    "https://qbank24.ir/downloads",

  PAYMENT: {
    bank:
      "مهر ایران",

    owner:
      "مهدی رشیدیان طرقی",

    card:
      "6063731161437174",

    account:
      "363470014517217001",

    iban:
      "IR160600363470014517217001"
  },

  RAIL: {

    TICKET_ISSUE_FEE:
      200000,

    CHILD_TICKET_PERCENT:
      60,

    TICKET_PRICES: {

      AHVAZ: {
        name:
          "اهواز ↔ مشهد",

        FOUR_BERTH: {
          price:
            2990000
        },

        SIX_BERTH: {
          price:
            2990000
        }
      },

      SHIRAZ: {
        name:
          "شیراز ↔ مشهد",

        FOUR_BERTH: {
          price:
            2990000
        },

        SIX_BERTH: {
          price:
            2990000
        }
      }
    }
  }
};

module.exports = CONFIG;
