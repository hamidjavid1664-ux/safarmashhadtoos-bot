require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const CONFIG = require("./config");
const PRICING = require("./pricing");

const app = express();

app.use(express.json());

/*
========================================================
تنظیمات
========================================================
*/

const PORT =
  Number(process.env.PORT) ||
  10000;

const BOT_TOKEN =
  process.env.BALE_BOT_TOKEN ||
  process.env.BOT_TOKEN ||
  CONFIG.BOT_TOKEN ||
  "";

const ADMIN_CHAT_ID =
  process.env.ADMIN_CHAT_ID ||
  CONFIG.ADMIN_CHAT_ID ||
  "";

const BALE_API_BASE =
  process.env.BALE_API_BASE ||
  "https://tapi.bale.ai/bot";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "";


/*
========================================================
تنظیمات ریلی
========================================================

pricing.js به CONFIG.RAIL نیاز دارد.
چون config.js فعلی شما RAIL ندارد،
اینجا بدون تغییر config.js آن را اضافه می‌کنیم.
========================================================
*/

CONFIG.RAIL =
  CONFIG.RAIL ||
  {

    TICKET_ISSUE_FEE:
      Number(
        process.env.RAIL_TICKET_ISSUE_FEE || 0
      ),

    CHILD_TICKET_PERCENT:
      Number(
        process.env.RAIL_CHILD_TICKET_PERCENT || 50
      ),

    TICKET_PRICES: {

      AHVAZ: {

        name: "اهواز",

        FOUR_BERTH: {
          name: "امید",
          price: 2010000
        },

        SIX_BERTH: {
          name: "مهدیس",
          price: 1940000
        }

      },

      SHIRAZ: {

        name: "شیراز",

        FOUR_BERTH: {
          name: "سریر",
          price: 2010000
        },

        SIX_BERTH: null

      }

    }

  };


/*
========================================================
دیتابیس
========================================================
*/

if (!DATABASE_URL) {

  console.error(
    "❌ DATABASE_URL تنظیم نشده است."
  );

}


const pool = new Pool({

  connectionString:
    DATABASE_URL,

  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false

});


/*
========================================================
نام تورها
========================================================
*/

const TOUR_NAMES = {

  AIR:
    "✈️ تور هوایی",

  RAIL:
    "🚆 تور ریلی",

  BUS:
    "🚌 تور اتوبوسی",

  CARAVAN_BUS:
    "🚍 کاروان اتوبوسی",

  CARAVAN_RAIL:
    "🚆 کاروان ریلی"

};


/*
========================================================
ابزارهای عمومی
========================================================
*/

function normalizeDigits(value) {

  return String(value || "")
    .replace(/[۰-۹]/g, function (d) {

      return String(
        "۰۱۲۳۴۵۶۷۸۹".indexOf(d)
      );

    })
    .replace(/[٠-٩]/g, function (d) {

      return String(
        "٠١٢٣٤٥٦٧٨٩".indexOf(d)
      );

    });

}


function cleanText(value) {

  return String(value || "")
    .trim();

}


function isAdmin(chatId) {

  if (!ADMIN_CHAT_ID) {
    return false;
  }

  return String(chatId) ===
    String(ADMIN_CHAT_ID);

}


function getUsername(user) {

  if (!user) {
    return "";
  }

  return user.username
    ? "@" + user.username
    : "";

}


function getFirstName(user) {

  if (!user) {
    return "";
  }

  return (
    user.first_name ||
    user.name ||
    ""
  );

}


function formatMoney(number) {

  return new Intl.NumberFormat(
    "fa-IR"
  ).format(
    Math.round(
      Number(number || 0)
    )
  );

}


/*
========================================================
API بله
========================================================
*/

async function baleRequest(
  method,
  body = {}
) {

  if (!BOT_TOKEN) {

    throw new Error(
      "BALE_BOT_TOKEN تنظیم نشده است."
    );

  }

  const url =
    `${BALE_API_BASE}${BOT_TOKEN}/${method}`;

  const response =
    await fetch(
      url,
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)

      }
    );

  const data =
    await response.json();

  if (!data.ok) {

    console.error(
      `❌ Bale API ${method}:`,
      data
    );

  }

  return data;

}


async function sendMessage(
  chatId,
  text,
  extra = {}
) {

  return baleRequest(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      ...extra
    }
  );

}


async function answerCallback(
  callbackId,
  text = ""
) {

  if (!callbackId) {
    return;
  }

  return baleRequest(
    "answerCallbackQuery",
    {

      callback_query_id:
        callbackId,

      text

    }
  );

}


/*
========================================================
کیبورد اصلی
========================================================
*/

function mainKeyboard() {

  return {

    keyboard: [

      [
        {
          text: "🏨 رزرو هتل"
        },

        {
          text: "🚌 تورهای مشهد"
        }

      ],

      [
        {
          text: "💎 طرح الماس شهر بهشت"
        }
      ],

      [
        {
          text: "🧳 خدمات گردشگری"
        },

        {
          text: "📞 تماس با ما"
        }

      ],

      [
        {
          text: "📢 کانال"
        }

      ]

    ],

    resize_keyboard: true

  };

}


function backKeyboard() {

  return {

    keyboard: [

      [
        {
          text: "🔙 بازگشت"
        },

        {
          text: "❌ لغو"
        }

      ]

    ],

    resize_keyboard: true

  };

}


function tourInlineKeyboard() {

  return {

    inline_keyboard: [

      [
        {
          text: "✈️ تور هوایی",
          callback_data:
            "TOUR_AIR"
        }
      ],

      [
        {
          text: "🚆 تور ریلی",
          callback_data:
            "TOUR_RAIL"
        }
      ],

      [
        {
          text: "🚌 تور اتوبوسی",
          callback_data:
            "TOUR_BUS"
        }
      ],

      [
        {
          text: "🚍 کاروان اتوبوسی",
          callback_data:
            "TOUR_CARAVAN_BUS"
        }
      ],

      [
        {
          text: "🚆 کاروان ریلی",
          callback_data:
            "TOUR_CARAVAN_RAIL"
        }
      ]

    ]

  };

}


/*
========================================================
دیتابیس
========================================================
*/

async function columnExists(
  tableName,
  columnName
) {

  const result =
    await pool.query(

      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = $1
      AND column_name = $2
      LIMIT 1
      `,

      [
        tableName,
        columnName
      ]

    );

  return result.rowCount > 0;

}


async function initDB() {

  if (!DATABASE_URL) {

    throw new Error(
      "DATABASE_URL تنظیم نشده است."
    );

  }


  /*
  sessions
  */

  const sessionsExists =
    await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'sessions'
      LIMIT 1
      `
    );


  if (
    sessionsExists.rowCount > 0 &&
    !(await columnExists(
      "sessions",
      "user_id"
    ))
  ) {

    console.log(
      "⚠️ ساختار قدیمی sessions پیدا شد؛ جدول sessions بازسازی می‌شود."
    );

    await pool.query(
      `DROP TABLE IF EXISTS sessions`
    );

  }


  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS sessions (

      user_id TEXT PRIMARY KEY,

      state TEXT NOT NULL,

      data JSONB
        DEFAULT '{}'::jsonb,

      updated_at TIMESTAMPTZ
        DEFAULT NOW()

    )
    `
  );


  /*
  requests
  */

  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS requests (

      id SERIAL PRIMARY KEY,

      request_code TEXT UNIQUE NOT NULL,

      user_id TEXT,

      chat_id TEXT,

      username TEXT,

      first_name TEXT,

      applicant_name TEXT,

      bale_id TEXT,

      request_type TEXT,

      payment_type TEXT,

      data JSONB
        DEFAULT '{}'::jsonb,

      payload JSONB
        DEFAULT '{}'::jsonb,

      status TEXT
        DEFAULT 'pending',

      created_at TIMESTAMPTZ
        DEFAULT NOW(),

      updated_at TIMESTAMPTZ
        DEFAULT NOW()

    )
    `
  );


  /*
  ستون‌های لازم برای دیتابیس‌های قدیمی
  */

  const columns = [

    [
      "user_id",
      "TEXT"
    ],

    [
      "chat_id",
      "TEXT"
    ],

    [
      "username",
      "TEXT"
    ],

    [
      "first_name",
      "TEXT"
    ],

    [
      "applicant_name",
      "TEXT"
    ],

    [
      "bale_id",
      "TEXT"
    ],

    [
      "request_type",
      "TEXT"
    ],

    [
      "payment_type",
      "TEXT"
    ],

    [
      "data",
      "JSONB DEFAULT '{}'::jsonb"
    ],

    [
      "payload",
      "JSONB DEFAULT '{}'::jsonb"
    ],

    [
      "status",
      "TEXT DEFAULT 'pending'"
    ],

    [
      "updated_at",
      "TIMESTAMPTZ DEFAULT NOW()"
    ]

  ];


  for (
    const [name, type] of columns
  ) {

    await pool.query(
      `
      ALTER TABLE requests
      ADD COLUMN IF NOT EXISTS
      ${name} ${type}
      `
    );

  }


  console.log(
    "✅ Database آماده است."
  );

}


/*
========================================================
Session
========================================================
*/

async function getSession(
  userId
) {

  const result =
    await pool.query(

      `
      SELECT
        user_id,
        state,
        data
      FROM sessions
      WHERE user_id = $1
      `,

      [String(userId)]

    );


  if (!result.rowCount) {

    return {

      state: "MAIN",

      data: {}

    };

  }


  return {

    state:
      result.rows[0].state,

    data:
      result.rows[0].data || {}

  };

}


async function saveSession(
  userId,
  state,
  data = {}
) {

  await pool.query(

    `
    INSERT INTO sessions
      (
        user_id,
        state,
        data,
        updated_at
      )

    VALUES
      (
        $1,
        $2,
        $3::jsonb,
        NOW()
      )

    ON CONFLICT (user_id)

    DO UPDATE SET

      state =
        EXCLUDED.state,

      data =
        EXCLUDED.data,

      updated_at =
        NOW()
    `,

    [
      String(userId),
      state,
      JSON.stringify(data)
    ]

  );

}


async function clearSession(
  userId
) {

  await pool.query(

    `
    DELETE FROM sessions
    WHERE user_id = $1
    `,

    [String(userId)]

  );

}


/*
========================================================
تاریخ شمسی
========================================================
*/

function isJalaliLeap(year) {

  const y =
    ((year - 474) % 2820 + 2820) %
      2820 + 474;

  return (
    ((y + 38) * 682) %
      2816
  ) < 682;

}


function jalaliToGregorian(
  jy,
  jm,
  jd
) {

  jy =
    Number(jy);

  jm =
    Number(jm);

  jd =
    Number(jd);


  jy += 1595;


  let days =
    -355668 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(
      ((jy % 33) + 3) / 4
    ) +
    jd;


  if (jm < 7) {

    days +=
      (jm - 1) * 31;

  } else {

    days +=
      (jm - 7) * 30 +
      186;

  }


  let gy =
    400 *
    Math.floor(
      days / 146097
    );


  days %= 146097;


  if (days > 36524) {

    gy +=
      100 *
      Math.floor(
        --days / 36524
      );

    days %= 36524;

    if (days >= 365) {
      days++;
    }

  }


  gy +=
    4 *
    Math.floor(
      days / 1461
    );


  days %= 1461;


  if (days > 365) {

    gy +=
      Math.floor(
        (days - 1) / 365
      );

    days =
      (days - 1) % 365;

  }


  const gd =
    days + 1;


  const monthDays = [

    0,

    31,
    28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31

  ];


  const leap =
    (
      gy % 4 === 0 &&
      gy % 100 !== 0
    ) ||
    gy % 400 === 0;


  if (leap) {
    monthDays[2] = 29;
  }


  let gm = 1;
  let day = gd;


  while (
    gm <= 12 &&
    day > monthDays[gm]
  ) {

    day -=
      monthDays[gm];

    gm++;

  }


  return {

    year: gy,

    month: gm,

    day

  };

}


function parseJalaliDate(
  value
) {

  const text =
    normalizeDigits(value)
      .replace(/-/g, "/")
      .replace(/\./g, "/")
      .replace(/\s+/g, "");


  const match =
    text.match(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
    );


  if (!match) {
    return null;
  }


  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);


  if (
    year < 1300 ||
    year > 1500 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {

    return null;

  }


  let maxDay;


  if (month <= 6) {

    maxDay = 31;

  } else if (month <= 11) {

    maxDay = 30;

  } else {

    maxDay =
      isJalaliLeap(year)
        ? 30
        : 29;

  }


  if (day > maxDay) {
    return null;
  }


  const gregorian =
    jalaliToGregorian(
      year,
      month,
      day
    );


  return {

    year,
    month,
    day,
    text:
      `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
    gregorian

  };

}


function compareGregorian(
  a,
  b
) {

  const da =
    Date.UTC(
      a.year,
      a.month - 1,
      a.day
    );

  const db =
    Date.UTC(
      b.year,
      b.month - 1,
      b.day
    );


  if (da < db) return -1;

  if (da > db) return 1;

  return 0;

}


function isPastJalaliDate(
  parsed
) {

  const now =
    new Date();

  const today = {

    year:
      now.getUTCFullYear(),

    month:
      now.getUTCMonth() + 1,

    day:
      now.getUTCDate()

  };


  return (
    compareGregorian(
      parsed.gregorian,
      today
    ) < 0
  );

}


function validateFutureJalaliDate(
  value
) {

  const parsed =
    parseJalaliDate(value);


  if (!parsed) {

    return {

      ok: false,

      message:
        "❌ تاریخ معتبر نیست.\nمثال صحیح:\n۱۴۰۵/۰۷/۱۵"

    };

  }


  if (
    isPastJalaliDate(parsed)
  ) {

    return {

      ok: false,

      message:
        "❌ این تاریخ گذشته است. لطفاً تاریخ آینده وارد کنید."

    };

  }


  return {

    ok: true,

    value:
      parsed.text

  };

}


/*
========================================================
اعتبارسنجی تلفن
========================================================
*/

function validatePhone(
  value
) {

  const phone =
    normalizeDigits(value)
      .replace(/\s|-/g, "");


  if (
    !/^09\d{9}$/.test(phone)
  ) {

    return null;

  }


  return phone;

}


/*
========================================================
اعتبارسنجی کد ملی
========================================================
*/

function validateNationalCode(
  value
) {

  const code =
    normalizeDigits(value)
      .replace(/\s|-/g, "");


  if (
    !/^\d{10}$/.test(code)
  ) {

    return null;

  }


  if (
    /^(\d)\1{9}$/.test(code)
  ) {

    return null;

  }


  let sum = 0;


  for (
    let i = 0;
    i < 9;
    i++
  ) {

    sum +=
      Number(code[i]) *
      (10 - i);

  }


  const remainder =
    sum % 11;

  const check =
    Number(code[9]);


  if (
    remainder < 2
  ) {

    return check === remainder
      ? code
      : null;

  }


  return check ===
    11 - remainder
    ? code
    : null;

}
/*
========================================================
متن طرح الماس
========================================================
*/

const DIAMOND_TEXT = `

💎 طرح الماس شهر بهشت

۴۰ درصد با تو / ۶۰ درصد با ما

با طرح الماس شهر بهشت می‌توانید
بخشی از هزینه سفر خود را به صورت
اعتباری تأمین کنید.

🔹 مدت بازپرداخت:
۱۲ ماهه

🔹 کارمزد / سود:
۳٪

━━━━━━━━━━━━━━

📲 مراحل دریافت اعتبار:

۱️⃣ نصب اپلیکیشن کیوبانک مهر

۲️⃣ انجام احراز هویت

۳️⃣ انجام اعتبارسنجی

۴️⃣ بررسی رتبه اعتباری

━━━━━━━━━━━━━━

🟢 رتبه A و B:

نیازی به ضامن ندارید.

«خودت ضامن حسابت هستی»

━━━━━━━━━━━━━━

🟡 رتبه C و D و پایین‌تر:

یک ضامن نیاز است.

همچنین:

• معرفی ضامن
• نامه کسر از حقوق
• فیش حقوقی

━━━━━━━━━━━━━━

🏦 مراجعه به شعبه لازم نیست.

مدارک باید به صورت اصل و
تصویر/مدارک مورد تأیید سامانه
ارسال شوند.

━━━━━━━━━━━━━━

💰 سهم پرداخت مشتری:

۴۰٪ مبلغ نهایی سفر

💎 سهم اعتبار:

۶۰٪ مبلغ نهایی سفر

━━━━━━━━━━━━━━

📌 پس از تأیید درخواست توسط دفتر،
مبلغ ۴۰٪ سهم مشتری اعلام می‌شود.

بعد از پرداخت و ارسال تصویر رسید،
فرآیند اعتبار ادامه پیدا می‌کند.

`;


/*
========================================================
اطلاعات پرداخت
========================================================
*/

function paymentInfoText() {

  const bankName =
    process.env.BANK_NAME ||
    "";

  const owner =
    process.env.BANK_OWNER ||
    "";

  const card =
    process.env.CARD_NUMBER ||
    "";

  const account =
    process.env.ACCOUNT_NUMBER ||
    "";

  const iban =
    process.env.IBAN ||
    "";

  const custom =
    process.env.PAYMENT_INSTRUCTIONS ||
    "";


  let text =
    "💳 اطلاعات پرداخت\n\n";


  if (custom) {

    text +=
      custom;

  } else {

    if (bankName) {

      text +=
        `🏦 بانک: ${bankName}\n`;

    }

    if (owner) {

      text +=
        `👤 به نام: ${owner}\n`;

    }

    if (card) {

      text +=
        `💳 شماره کارت: ${card}\n`;

    }

    if (account) {

      text +=
        `🏦 شماره حساب: ${account}\n`;

    }

    if (iban) {

      text +=
        `🔹 شبا: ${iban}\n`;

    }


    if (
      !bankName &&
      !owner &&
      !card &&
      !account &&
      !iban
    ) {

      text +=
        "اطلاعات حساب هنوز در تنظیمات ربات وارد نشده است.\n\n";

      text +=
        `📞 جهت دریافت اطلاعات پرداخت با دفتر تماس بگیرید:\n${CONFIG.CONTACT_PHONE}`;

    }

  }


  text +=
    "\n\n📸 پس از پرداخت، تصویر رسید را ارسال کنید.";


  return text;

}


/*
========================================================
دکمه نصب کیوبانک
========================================================
*/

function qBankKeyboard() {

  const url =
    process.env.QIBANK_URL ||
    "";


  if (url) {

    return {

      inline_keyboard: [

        [
          {
            text:
              "📲 نصب کیوبانک مهر",

            url

          }

        ]

      ]

    };

  }


  return {

    inline_keyboard: [

      [
        {
          text:
            "📲 نصب کیوبانک مهر",

          callback_data:
            "INSTALL_QBANK"

        }

      ]

    ]

  };

}


/*
========================================================
منوی تورها
========================================================
*/

async function showTourMenu(
  chatId
) {

  await sendMessage(

    chatId,

    "🚌 تورهای مشهد\n\nلطفاً نوع سفر را انتخاب کنید:",

    {
      reply_markup:
        tourInlineKeyboard()
    }

  );

}


/*
========================================================
شروع نوع تور
========================================================
*/

async function startTourType(
  chatId,
  type
) {

  const data = {

    tourType:
      type

  };


  await saveSession(

    chatId,

    "TOUR_DATE_IN",

    data

  );


  await sendMessage(

    chatId,

    `${TOUR_NAMES[type] || "تور"}\n\n📅 تاریخ ورود به مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۵`,

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
مرحله تاریخ ورود
========================================================
*/

async function askTourDateOut(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_DATE_OUT",

    data

  );


  await sendMessage(

    chatId,

    "📅 تاریخ خروج از مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۸",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
مرحله بزرگسال
========================================================
*/

async function askTourAdults(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_ADULTS",

    data

  );


  await sendMessage(

    chatId,

    "👨 تعداد بزرگسال را وارد کنید:",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
مرحله کودک
========================================================
*/

async function askTourChildren(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_CHILDREN",

    data

  );


  await sendMessage(

    chatId,

    "👧 تعداد کودک ۳ تا ۵ سال را وارد کنید:",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
مرحله تعداد شب
========================================================
*/

async function askTourNights(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_NIGHTS",

    data

  );


  await sendMessage(

    chatId,

    "🌙 تعداد شب اقامت را وارد کنید:",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
انتخاب پرداخت
========================================================
*/

async function askTourPayment(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_PAYMENT",

    data

  );


  await sendMessage(

    chatId,

    "💳 روش پرداخت را انتخاب کنید:",

    {

      reply_markup: {

        inline_keyboard: [

          [
            {
              text:
                "💵 پرداخت نقدی",

              callback_data:
                "TOUR_PAYMENT_CASH"

            }
          ],

          [
            {
              text:
                "💎 طرح الماس شهر بهشت",

              callback_data:
                "TOUR_PAYMENT_LOAN"

            }
          ]

        ]

      }

    }

  );

}


/*
========================================================
نام
========================================================
*/

async function askTourName(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_NAME",

    data

  );


  await sendMessage(

    chatId,

    "👤 نام و نام خانوادگی را وارد کنید:",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
تلفن
========================================================
*/

async function askTourPhone(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_PHONE",

    data

  );


  await sendMessage(

    chatId,

    "📱 شماره موبایل را وارد کنید.\nمثال: ۰۹۱۲۱۲۳۴۵۶۷",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
کد ملی
========================================================
*/

async function askTourNationalCode(
  chatId,
  data
) {

  await saveSession(

    chatId,

    "TOUR_NATIONAL_CODE",

    data

  );


  await sendMessage(

    chatId,

    "🪪 کد ملی را وارد کنید:",

    {
      reply_markup:
        backKeyboard()
    }

  );

}


/*
========================================================
کد درخواست
========================================================
*/

function generateRequestCode() {

  return (
    "SMT-" +
    Math.floor(
      1000 +
      Math.random() * 9000
    )
  );

}


/*
========================================================
خلاصه درخواست تور
========================================================
*/

function tourRequestText(
  request
) {

  const data =
    request.data || {};


  let text =
    "🆕 درخواست جدید تور مشهد\n\n";


  text +=
    `🆔 کد درخواست: ${request.request_code}\n`;

  text +=
    `👤 نام: ${data.name || request.applicant_name || "-"}\n`;

  text +=
    `📱 موبایل: ${data.phone || "-"}\n`;

  text +=
    `🆔 Bale ID: ${request.bale_id || request.user_id || "-"}\n`;

  text +=
    `🔹 کاربر: ${request.username || "-"}\n\n`;


  text +=
    `🚌 نوع سفر: ${TOUR_NAMES[data.tourType] || data.tourType || "-"}\n`;

  text +=
    `📅 ورود به مشهد: ${data.dateIn || "-"}\n`;

  text +=
    `📅 خروج از مشهد: ${data.dateOut || "-"}\n`;

  text +=
    `🌙 تعداد شب: ${formatMoney(data.nights)} شب\n`;

  text +=
    `👨 بزرگسال: ${formatMoney(data.adults)} نفر\n`;

  text +=
    `👧 کودک ۳ تا ۵ سال: ${formatMoney(data.children)} نفر\n`;

  text +=
    `💳 پرداخت: ${data.paymentType === "loan" ? "💎 طرح الماس" : "💵 نقدی"}\n`;


  if (data.nationalCode) {

    text +=
      `🪪 کد ملی: ${data.nationalCode}\n`;

  }


  text +=
    "\n━━━━━━━━━━━━━━\n";

  text +=
    "لطفاً وضعیت درخواست را مشخص کنید.";

  return text;

}
/*
========================================================
ثبت درخواست تور
========================================================
*/

async function createTourRequest(
  chatId,
  user,
  data
) {

  const requestCode =
    generateRequestCode();


  const requestData = {

    ...data,

    createdAt:
      new Date().toISOString()

  };


  const result =
    await pool.query(

      `
      INSERT INTO requests
      (
        request_code,
        user_id,
        chat_id,
        username,
        first_name,
        applicant_name,
        bale_id,
        request_type,
        payment_type,
        data,
        payload,
        status
      )

      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $10::jsonb,
        'pending'
      )

      RETURNING *
      `,

      [

        requestCode,

        String(chatId),

        String(chatId),

        getUsername(user),

        getFirstName(user),

        data.name || "",

        String(chatId),

        "tour",

        data.paymentType || "cash",

        JSON.stringify(
          requestData
        )

      ]

    );


  return result.rows[0];

}


/*
========================================================
ارسال درخواست به مدیر
========================================================
*/

async function sendRequestToAdmin(
  request
) {

  if (!ADMIN_CHAT_ID) {

    console.error(
      "❌ ADMIN_CHAT_ID تنظیم نشده است."
    );

    return false;

  }


  const text =
    tourRequestText(request);


  const result =
    await sendMessage(

      ADMIN_CHAT_ID,

      text,

      {

        reply_markup: {

          inline_keyboard: [

            [
              {
                text:
                  "✅ تأیید درخواست",

                callback_data:
                  `APPROVE_REQUEST_${request.request_code}`

              },

              {
                text:
                  "❌ رد درخواست",

                callback_data:
                  `REJECT_REQUEST_${request.request_code}`

              }

            ]

          ]

        }

      }

    );


  return !!result?.ok;

}


/*
========================================================
طرح الماس
========================================================
*/

async function sendDiamondPlan(
  chatId
) {

  await sendMessage(

    chatId,

    DIAMOND_TEXT,

    {
      reply_markup:
        qBankKeyboard()
    }

  );

}


/*
========================================================
درخواست لیست همراهان / مسافران
========================================================
*/

function isCaravan(
  requestType
) {

  return (
    requestType ===
      "CARAVAN_BUS" ||
    requestType ===
      "CARAVAN_RAIL"
  );

}


async function askPassengerList(
  chatId,
  requestType,
  requestCode
) {

  const caravan =
    isCaravan(requestType);


  const title =
    caravan
      ? "👥 لیست مسافران کاروان"
      : "👥 لیست همراهان";


  const text = `

${title}

🆔 کد درخواست: ${requestCode}

لطفاً لیست را یکی از روش‌های زیر ارسال کنید:

📎 فایل Excel / CSV / TXT

📷 تصویر لیست

⌨️ ورود متنی لیست

فرمت اطلاعات:

نام و نام خانوادگی | کد ملی | تاریخ تولد

مثال:

علی رضایی | ۱۲۳۴۵۶۷۸۹۰ | ۱۳۶۲/۰۶/۱۷

`;


  await saveSession(

    chatId,

    "PASSENGER_LIST",

    {

      requestCode,

      requestType

    }

  );


  await sendMessage(

    chatId,

    text,

    {

      reply_markup: {

        keyboard: [

          [
            {
              text:
                "⌨️ ورود متنی لیست"
            },

            {
              text:
                "📷 ارسال تصویر لیست"
            }
          ],

          [
            {
              text:
                "📎 ارسال فایل"
            }
          ],

          [
            {
              text:
                "⏳ ارسال بعداً"
            }
          ]

        ],

        resize_keyboard: true

      }

    }

  );

}


/*
========================================================
به‌روزرسانی اطلاعات درخواست
========================================================
*/

async function getRequestByCode(
  code
) {

  const result =
    await pool.query(

      `
      SELECT *
      FROM requests
      WHERE request_code = $1
      LIMIT 1
      `,

      [code]

    );


  if (!result.rowCount) {
    return null;
  }


  return result.rows[0];

}


async function updateRequestStatus(
  code,
  status
) {

  const result =
    await pool.query(

      `
      UPDATE requests

      SET
        status = $2,
        updated_at = NOW()

      WHERE request_code = $1

      RETURNING *
      `,

      [
        code,
        status
      ]

    );


  if (!result.rowCount) {
    return null;
  }


  return result.rows[0];

}


/*
========================================================
ثبت رسید / لیست در data
========================================================
*/

async function updateRequestData(
  code,
  extraData
) {

  const request =
    await getRequestByCode(code);


  if (!request) {
    return null;
  }


  const oldData =
    request.data || {};


  const newData = {

    ...oldData,

    ...extraData

  };


  const result =
    await pool.query(

      `
      UPDATE requests

      SET
        data = $2::jsonb,
        payload = $2::jsonb,
        updated_at = NOW()

      WHERE request_code = $1

      RETURNING *
      `,

      [
        code,
        JSON.stringify(newData)
      ]

    );


  return result.rows[0];

}


/*
========================================================
ارسال لیست متنی به مدیر
========================================================
*/

async function sendPassengerTextToAdmin(
  request,
  text,
  user
) {

  if (!ADMIN_CHAT_ID) {
    return false;
  }


  const caravan =
    isCaravan(
      request.data?.requestType
    );


  const title =
    caravan
      ? "👥 لیست مسافران کاروان"
      : "👥 لیست همراهان";


  const adminText = `

${title}

🆔 درخواست: ${request.request_code}

👤 درخواست‌کننده:
${request.data?.name || request.applicant_name || "-"}

📱 موبایل:
${request.data?.phone || "-"}

🔹 کاربر:
${request.username || getUsername(user) || "-"}

━━━━━━━━━━━━━━

${text}

`;


  await sendMessage(

    ADMIN_CHAT_ID,

    adminText

  );


  return true;

}


/*
========================================================
ارسال فایل به مدیر
========================================================
*/

async function sendPassengerDocumentToAdmin(
  request,
  document,
  caption
) {

  if (!ADMIN_CHAT_ID) {
    return false;
  }


  const text =
    caption ||
    `📎 فایل لیست برای درخواست ${request.request_code}`;


  const result =
    await baleRequest(

      "sendDocument",

      {

        chat_id:
          ADMIN_CHAT_ID,

        document:
          document.file_id,

        caption:
          text

      }

    );


  return !!result?.ok;

}


/*
========================================================
ارسال تصویر لیست به مدیر
========================================================
*/

async function sendPassengerPhotoToAdmin(
  request,
  photo
) {

  if (!ADMIN_CHAT_ID) {
    return false;
  }


  const fileId =
    photo[photo.length - 1]?.file_id;


  if (!fileId) {
    return false;
  }


  const caption =
    `📷 تصویر لیست همراهان/مسافران\n🆔 درخواست: ${request.request_code}`;


  const result =
    await baleRequest(

      "sendPhoto",

      {

        chat_id:
          ADMIN_CHAT_ID,

        photo:
          fileId,

        caption

      }

    );


  return !!result?.ok;

}


/*
========================================================
پردازش لیست
========================================================
*/

async function finishPassengerList(
  chatId,
  requestCode
) {

  await updateRequestData(

    requestCode,

    {

      passengerListReceived:
        true,

      passengerListReceivedAt:
        new Date().toISOString()

    }

  );


  await clearSession(
    chatId
  );


  await sendMessage(

    chatId,

    `✅ لیست با موفقیت دریافت شد.\n\n🆔 کد درخواست: ${requestCode}\n\nکارشناس دفتر ادامه مراحل را انجام می‌دهد.`,

    {
      reply_markup:
        mainKeyboard()
    }

  );

}


/*
========================================================
بررسی لیست متنی
========================================================
*/

function validatePassengerListText(
  text
) {

  const lines =
    String(text || "")
      .split(/\r?\n/)
      .map(
        line => line.trim()
      )
      .filter(Boolean);


  if (!lines.length) {

    return {

      ok: false,

      message:
        "❌ لیست خالی است."

    };

  }


  /*
  اگر خط اول عنوان باشد
  آن را حذف می‌کنیم.
  */

  if (
    lines[0]
      .includes("نام و نام خانوادگی")
  ) {

    lines.shift();

  }


  if (!lines.length) {

    return {

      ok: false,

      message:
        "❌ اطلاعات مسافران وارد نشده است."

    };

  }


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i];


    const parts =
      line.split("|")
        .map(
          x => x.trim()
        );


    if (parts.length !== 3) {

      return {

        ok: false,

        message:
          `❌ فرمت خط ${i + 1} صحیح نیست.\n\nفرمت صحیح:\nنام و نام خانوادگی | کد ملی | تاریخ تولد`

      };

    }


    const nationalCode =
      validateNationalCode(
        parts[1]
      );


    if (!nationalCode) {

      return {

        ok: false,

        message:
          `❌ کد ملی خط ${i + 1} صحیح نیست.`

      };

    }


    const birthDate =
      parseJalaliDate(
        parts[2]
      );


    if (!birthDate) {

      return {

        ok: false,

        message:
          `❌ تاریخ تولد خط ${i + 1} صحیح نیست.\nمثال: ۱۳۶۲/۰۶/۱۷`

      };

    }

  }


  return {

    ok: true,

    lines

  };

}


/*
========================================================
منوی خدمات
========================================================
*/

async function showServices(
  chatId
) {

  await sendMessage(

    chatId,

    `🧳 خدمات گردشگری

• رزرو و هماهنگی تورهای مشهد
• تور هوایی
• تور ریلی
• تور اتوبوسی
• کاروان‌های زیارتی
• خدمات سفر و گردشگری

برای دریافت اطلاعات بیشتر با دفتر تماس بگیرید:

📞 ${CONFIG.CONTACT_PHONE}`,

    {
      reply_markup:
        mainKeyboard()
    }

  );

}


/*
========================================================
تماس
========================================================
*/

async function showContact(
  chatId
) {

  await sendMessage(

    chatId,

    `📞 تماس با ما

👤 مسئول:
${CONFIG.ADMIN_NAME}

📱 شماره تماس:
${CONFIG.CONTACT_PHONE}

🤖 ربات:
${CONFIG.BOT_USERNAME}

🌐 سایت:
${CONFIG.WEBSITE_URL}`,

    {
      reply_markup:
        mainKeyboard()
    }

  );

}


/*
========================================================
کانال
========================================================
*/

async function showChannel(
  chatId
) {

  await sendMessage(

    chatId,

    `📢 کانال سفر مشهد توس

برای مشاهده اطلاعیه‌ها و طرح‌های جدید سفر عضو کانال شوید:

${CONFIG.CHANNEL_URL}`,

    {
      reply_markup:
        mainKeyboard()
    }

  );

}
/*
========================================================
شروع ربات
========================================================
*/

async function startBot(
  chatId
) {

  await clearSession(
    chatId
  );


  await sendMessage(

    chatId,

    `🌹 به ربات ${CONFIG.BOT_TITLE} خوش آمدید.

سفر مشهد توس
خدمات گردشگری و زیارتی مشهد مقدس

لطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,

    {
      reply_markup:
        mainKeyboard()
    }

  );

}


/*
========================================================
بازگشت در مراحل تور
========================================================
*/

async function handleTourBack(
  chatId,
  session
) {

  const state =
    session.state;


  const data =
    session.data || {};


  const previous = {

    TOUR_DATE_IN:
      "MENU",

    TOUR_DATE_OUT:
      "TOUR_DATE_IN",

    TOUR_ADULTS:
      "TOUR_DATE_OUT",

    TOUR_CHILDREN:
      "TOUR_ADULTS",

    TOUR_NIGHTS:
      "TOUR_CHILDREN",

    TOUR_PAYMENT:
      "TOUR_NIGHTS",

    TOUR_NAME:
      "TOUR_PAYMENT",

    TOUR_PHONE:
      "TOUR_NAME",

    TOUR_NATIONAL_CODE:
      "TOUR_PHONE"

  };


  const prev =
    previous[state];


  if (!prev) {

    await showTourMenu(
      chatId
    );

    return;

  }


  if (prev === "MENU") {

    await showTourMenu(
      chatId
    );

    return;

  }


  if (
    prev === "TOUR_DATE_IN"
  ) {

    await saveSession(
      chatId,
      "TOUR_DATE_IN",
      {
        tourType:
          data.tourType
      }
    );


    await sendMessage(

      chatId,

      `${TOUR_NAMES[data.tourType] || "تور"}\n\n📅 تاریخ ورود به مشهد را وارد کنید.`,

      {
        reply_markup:
          backKeyboard()
      }

    );

    return;

  }


  if (
    prev === "TOUR_DATE_OUT"
  ) {

    await askTourDateOut(
      chatId,
      data
    );

    return;

  }


  if (
    prev === "TOUR_ADULTS"
  ) {

    await askTourAdults(
      chatId,
      data
    );

    return;

  }


  if (
    prev === "TOUR_CHILDREN"
  ) {

    await askTourChildren(
      chatId,
      data
    );

    return;

  }


  if (
    prev === "TOUR_NIGHTS"
  ) {

    await askTourNights(
      chatId,
      data
    );

    return;

  }


  if (
    prev === "TOUR_PAYMENT"
  ) {

    await askTourPayment(
      chatId,
      data
    );

    return;

  }


  if (
    prev === "TOUR_NAME"
  ) {

    await askTourName(
      chatId,
      data
    );

    return;

  }


  if (
    prev === "TOUR_PHONE"
  ) {

    await askTourPhone(
      chatId,
      data
    );

    return;

  }

}


/*
========================================================
پردازش پیام متنی
========================================================
*/

async function handleTextMessage(
  message
) {

  const chatId =
    message?.chat?.id;


  if (!chatId) {
    return;
  }


  const user =
    message.from ||
    message.sender ||
    {};


  const text =
    cleanText(
      message.text
    );


  if (!text) {
    return;
  }


  /*
  START
  */

  if (
    text === "/start" ||
    text === "/start "
  ) {

    await startBot(
      chatId
    );

    return;

  }


  /*
  لغو
  */

  if (
    text === "❌ لغو"
  ) {

    await clearSession(
      chatId
    );


    await sendMessage(

      chatId,

      "❌ عملیات لغو شد.",

      {
        reply_markup:
          mainKeyboard()
      }

    );

    return;

  }


  /*
  بازگشت
  */

  if (
    text === "🔙 بازگشت"
  ) {

    const session =
      await getSession(
        chatId
      );


    if (
      session.state.startsWith(
        "TOUR_"
      )
    ) {

      await handleTourBack(
        chatId,
        session
      );

    } else {

      await showTourMenu(
        chatId
      );

    }

    return;

  }


  /*
  منوی اصلی
  */

  if (
    text === "🏨 رزرو هتل"
  ) {

    await sendMessage(

      chatId,

      "🏨 رزرو هتل فعلاً غیر فعال است.\n\nبه‌محض فعال شدن، اطلاع‌رسانی خواهد شد.",

      {
        reply_markup:
          mainKeyboard()
      }

    );

    return;

  }


  if (
    text === "🚌 تورهای مشهد"
  ) {

    await showTourMenu(
      chatId
    );

    return;

  }


  if (
    text === "💎 طرح الماس شهر بهشت"
  ) {

    await sendDiamondPlan(
      chatId
    );

    return;

  }


  if (
    text === "🧳 خدمات گردشگری"
  ) {

    await showServices(
      chatId
    );

    return;

  }


  if (
    text === "📞 تماس با ما"
  ) {

    await showContact(
      chatId
    );

    return;

  }


  if (
    text === "📢 کانال"
  ) {

    await showChannel(
      chatId
    );

    return;

  }


  /*
  انتخاب ورود متنی لیست
  */

  if (
    text === "⌨️ ورود متنی لیست"
  ) {

    const session =
      await getSession(
        chatId
      );


    if (
      session.state !==
      "PASSENGER_LIST"
    ) {

      await sendMessage(

        chatId,

        "ابتدا باید یک درخواست تأییدشده داشته باشید.",

        {
          reply_markup:
            mainKeyboard()
        }

      );

      return;

    }


    await saveSession(

      chatId,

      "PASSENGER_LIST_TEXT",

      session.data

    );


    await sendMessage(

      chatId,

      `⌨️ لیست را در یک پیام ارسال کنید.

فرمت هر خط:

نام و نام خانوادگی | کد ملی | تاریخ تولد

مثال:

علی رضایی | ۱۲۳۴۵۶۷۸۹۰ | ۱۳۶۲/۰۶/۱۷

برای هر نفر یک خط جداگانه.`,

      {
        reply_markup:
          backKeyboard()
      }

    );

    return;

  }


  /*
  ارسال تصویر
  */

  if (
    text === "📷 ارسال تصویر لیست"
  ) {

    await sendMessage(

      chatId,

      "📷 حالا تصویر لیست را ارسال کنید.",

      {
        reply_markup:
          backKeyboard()
      }

    );

    return;

  }


  /*
  ارسال فایل
  */

  if (
    text === "📎 ارسال فایل"
  ) {

    await sendMessage(

      chatId,

      "📎 حالا فایل لیست را ارسال کنید.\n\nفرمت Excel، CSV یا TXT قابل ارسال است.",

      {
        reply_markup:
          backKeyboard()
      }

    );

    return;

  }


  /*
  ارسال بعداً
  */

  if (
    text === "⏳ ارسال بعداً"
  ) {

    await clearSession(
      chatId
    );


    await sendMessage(

      chatId,

      "⏳ ارسال لیست به زمان دیگری موکول شد.",

      {
        reply_markup:
          mainKeyboard()
      }

    );

    return;

  }


  /*
  Session
  */

  const session =
    await getSession(
      chatId
    );


  const data =
    session.data || {};


  /*
  تاریخ ورود
  */

  if (
    session.state ===
    "TOUR_DATE_IN"
  ) {

    const result =
      validateFutureJalaliDate(
        text
      );


    if (!result.ok) {

      await sendMessage(

        chatId,

        result.message,

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.dateIn =
      result.value;


    await askTourDateOut(
      chatId,
      data
    );

    return;

  }


  /*
  تاریخ خروج
  */

  if (
    session.state ===
    "TOUR_DATE_OUT"
  ) {

    const result =
      validateFutureJalaliDate(
        text
      );


    if (!result.ok) {

      await sendMessage(

        chatId,

        result.message,

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    const arrival =
      parseJalaliDate(
        data.dateIn
      );


    const departure =
      parseJalaliDate(
        result.value
      );


    if (
      compareGregorian(
        departure.gregorian,
        arrival.gregorian
      ) <= 0
    ) {

      await sendMessage(

        chatId,

        "❌ تاریخ خروج باید بعد از تاریخ ورود باشد.",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.dateOut =
      result.value;


    await askTourAdults(
      chatId,
      data
    );

    return;

  }


  /*
  بزرگسال
  */

  if (
    session.state ===
    "TOUR_ADULTS"
  ) {

    const adults =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isInteger(adults) ||
      adults < 1 ||
      adults > 1000
    ) {

      await sendMessage(

        chatId,

        "❌ تعداد بزرگسال صحیح نیست.",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.adults =
      adults;


    await askTourChildren(
      chatId,
      data
    );

    return;

  }


  /*
  کودک
  */

  if (
    session.state ===
    "TOUR_CHILDREN"
  ) {

    const children =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isInteger(children) ||
      children < 0 ||
      children > 1000
    ) {

      await sendMessage(

        chatId,

        "❌ تعداد کودک صحیح نیست.",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.children =
      children;


    await askTourNights(
      chatId,
      data
    );

    return;

  }


  /*
  تعداد شب
  */

  if (
    session.state ===
    "TOUR_NIGHTS"
  ) {

    const nights =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isInteger(nights) ||
      nights < 1 ||
      nights > 365
    ) {

      await sendMessage(

        chatId,

        "❌ تعداد شب اقامت صحیح نیست.",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.nights =
      nights;


    await askTourPayment(
      chatId,
      data
    );

    return;

  }


  /*
  نام
  */

  if (
    session.state ===
    "TOUR_NAME"
  ) {

    if (
      text.length < 3
    ) {

      await sendMessage(

        chatId,

        "❌ نام و نام خانوادگی را کامل وارد کنید.",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.name =
      text;


    await askTourPhone(
      chatId,
      data
    );

    return;

  }


  /*
  تلفن
  */

  if (
    session.state ===
    "TOUR_PHONE"
  ) {

    const phone =
      validatePhone(
        text
      );


    if (!phone) {

      await sendMessage(

        chatId,

        "❌ شماره موبایل صحیح نیست.\nمثال: ۰۹۱۲۱۲۳۴۵۶۷",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.phone =
      phone;


    if (
      data.paymentType ===
      "loan"
    ) {

      await askTourNationalCode(
        chatId,
        data
      );

    } else {

      const request =
        await createTourRequest(
          chatId,
          user,
          data
        );


      const sent =
        await sendRequestToAdmin(
          request
        );


      await clearSession(
        chatId
      );


      if (sent) {

        await sendMessage(

          chatId,

          `✅ درخواست شما ثبت شد.

🆔 کد درخواست:
${request.request_code}

درخواست برای بررسی به دفتر ارسال شد.

پس از تأیید، نتیجه از طریق همین ربات اطلاع داده می‌شود.`,

          {
            reply_markup:
              mainKeyboard()
          }

        );

      } else {

        await sendMessage(

          chatId,

          `⚠️ درخواست شما ثبت شد اما اتصال به دفتر در حال حاضر برقرار نیست.

🆔 کد درخواست:
${request.request_code}

لطفاً با دفتر تماس بگیرید:
${CONFIG.CONTACT_PHONE}`,

          {
            reply_markup:
              mainKeyboard()
          }

        );

      }

    }

    return;

  }


  /*
  کد ملی
  */

  if (
    session.state ===
    "TOUR_NATIONAL_CODE"
  ) {

    const nationalCode =
      validateNationalCode(
        text
      );


    if (!nationalCode) {

      await sendMessage(

        chatId,

        "❌ کد ملی صحیح نیست.",

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    data.nationalCode =
      nationalCode;


    const request =
      await createTourRequest(
        chatId,
        user,
        data
      );


    const sent =
      await sendRequestToAdmin(
        request
      );


    await clearSession(
      chatId
    );


    if (sent) {

      await sendMessage(

        chatId,

        `✅ درخواست طرح الماس شما ثبت شد.

🆔 کد درخواست:
${request.request_code}

درخواست برای بررسی به دفتر ارسال شد.

پس از تأیید مدیر، مراحل طرح الماس و پرداخت ۴۰٪ برای شما ارسال خواهد شد.`,

        {
          reply_markup:
            mainKeyboard()
        }

      );

    } else {

      await sendMessage(

        chatId,

        `⚠️ درخواست ثبت شد اما ارسال به دفتر انجام نشد.

🆔 کد درخواست:
${request.request_code}

📞 ${CONFIG.CONTACT_PHONE}`,

        {
          reply_markup:
            mainKeyboard()
        }

      );

    }

    return;

  }


  /*
  لیست متنی
  */

  if (
    session.state ===
    "PASSENGER_LIST_TEXT"
  ) {

    const validation =
      validatePassengerListText(
        text
      );


    if (!validation.ok) {

      await sendMessage(

        chatId,

        validation.message,

        {
          reply_markup:
            backKeyboard()
        }

      );

      return;

    }


    const request =
      await getRequestByCode(
        data.requestCode
      );


    if (!request) {

      await clearSession(
        chatId
      );


      await sendMessage(

        chatId,

        "❌ درخواست پیدا نشد.",

        {
          reply_markup:
            mainKeyboard()
        }

      );

      return;

    }


    await sendPassengerTextToAdmin(
      request,
      text,
      user
    );


    await finishPassengerList(
      chatId,
      data.requestCode
    );


    return;

  }


  /*
  اگر هیچ مرحله‌ای پیدا نشد
  */

  await sendMessage(

    chatId,

    "لطفاً یکی از گزینه‌های منو را انتخاب کنید.",

    {
      reply_markup:
        mainKeyboard()
    }

  );

}


/*
========================================================
پردازش Callback
========================================================
*/

async function handleCallback(
  callback
) {

  const callbackId =
    callback?.id;


  const data =
    callback?.data || "";


  const message =
    callback?.message;


  const chatId =
    message?.chat?.id;


  const from =
    callback?.from ||
    message?.from ||
    {};


  await answerCallback(
    callbackId
  );


  /*
  نوع تور
  */

  if (
    data === "TOUR_AIR" ||
    data === "TOUR_RAIL" ||
    data === "TOUR_BUS" ||
    data === "TOUR_CARAVAN_BUS" ||
    data === "TOUR_CARAVAN_RAIL"
  ) {

    const type =
      data.replace(
        "TOUR_",
        ""
      );


    await startTourType(
      chatId,
      type
    );

    return;

  }


  /*
  پرداخت نقدی
  */

  if (
    data ===
    "TOUR_PAYMENT_CASH"
  ) {

    const session =
      await getSession(
        chatId
      );


    const tourData =
      session.data || {};


    tourData.paymentType =
      "cash";


    await askTourName(
      chatId,
      tourData
    );


    return;

  }


  /*
  پرداخت طرح الماس
  */

  if (
    data ===
    "TOUR_PAYMENT_LOAN"
  ) {

    const session =
      await getSession(
        chatId
      );


    const tourData =
      session.data || {};


    tourData.paymentType =
      "loan";


    await askTourName(
      chatId,
      tourData
    );


    return;

  }


  /*
  نصب کیوبانک
  */

  if (
    data ===
    "INSTALL_QBANK"
  ) {

    await sendMessage(

      chatId,

      `📲 نصب کیوبانک مهر

لطفاً اپلیکیشن کیوبانک مهر را از مسیر رسمی نصب کرده و مراحل زیر را انجام دهید:

۱️⃣ نصب برنامه
۲️⃣ احراز هویت
۳️⃣ اعتبارسنجی
۴️⃣ مشاهده رتبه اعتباری

پس از تکمیل مراحل، نتیجه را به دفتر اطلاع دهید.

📞 ${CONFIG.CONTACT_PHONE}`

    );

    return;

  }


  /*
  تأیید درخواست
  */

  if (
    data.startsWith(
      "APPROVE_REQUEST_"
    )
  ) {

    if (!isAdmin(chatId)) {

      await answerCallback(
        callbackId,
        "⛔ شما دسترسی مدیر ندارید."
      );

      return;

    }


    const code =
      data.replace(
        "APPROVE_REQUEST_",
        ""
      );


    const request =
      await getRequestByCode(
        code
      );


    if (!request) {

      await sendMessage(

        chatId,

        "❌ درخواست پیدا نشد."

      );

      return;

    }


    if (
      request.status !==
      "pending"
    ) {

      await sendMessage(

        chatId,

        `⚠️ این درخواست قبلاً تعیین تکلیف شده است.\n\nوضعیت: ${request.status}`

      );

      return;

    }


    const updated =
      await updateRequestStatus(
        code,
        "approved"
      );


    const customerId =
      request.user_id ||
      request.chat_id;


    await sendMessage(

      customerId,

      `✅ درخواست شما تأیید شد.

🆔 کد درخواست:
${code}

${TOUR_NAMES[request.data?.tourType] || "درخواست سفر"}

لطفاً مراحل بعدی را طبق پیام‌های بعدی انجام دهید.`

    );


    /*
    اگر طرح الماس باشد
    */

    if (
      request.payment_type ===
        "loan" ||
      request.data?.paymentType ===
        "loan"
    ) {

      await sendDiamondPlan(
        customerId
      );


      await sendMessage(

        customerId,

        `💰 مرحله پرداخت

طبق طرح الماس:

۴۰٪ مبلغ نهایی سفر
بر عهده مشتری است.

مبلغ دقیق توسط دفتر اعلام می‌شود.

پس از پرداخت، تصویر رسید را در همین ربات ارسال کنید.

📞 ${CONFIG.CONTACT_PHONE}`,

        {
          reply_markup:
            qBankKeyboard()
        }

      );

    } else {

      await sendMessage(

        customerId,

        paymentInfoText()

      );

    }


    /*
    درخواست لیست همراهان/مسافران
    */

    await askPassengerList(

      customerId,

      request.data?.tourType,

      code

    );


    /*
    اطلاع مدیر
    */

    await sendMessage(

      chatId,

      `✅ درخواست ${code} تأیید شد.`

    );


    return;

  }


  /*
  رد درخواست
  */

  if (
    data.startsWith(
      "REJECT_REQUEST_"
    )
  ) {

    if (!isAdmin(chatId)) {

      await answerCallback(
        callbackId,
        "⛔ شما دسترسی مدیر ندارید."
      );

      return;

    }


    const code =
      data.replace(
        "REJECT_REQUEST_",
        ""
      );


    const request =
      await getRequestByCode(
        code
      );


    if (!request) {

      await sendMessage(
        chatId,
        "❌ درخواست پیدا نشد."
      );

      return;

    }


    if (
      request.status !==
      "pending"
    ) {

      await sendMessage(

        chatId,

        `⚠️ این درخواست قبلاً تعیین تکلیف شده است.\n\nوضعیت: ${request.status}`

      );

      return;

    }


    await updateRequestStatus(
      code,
      "rejected"
    );


    const customerId =
      request.user_id ||
      request.chat_id;


    await sendMessage(

      customerId,

      `❌ درخواست شما مورد تأیید قرار نگرفت.

🆔 کد درخواست:
${code}

برای بررسی بیشتر با دفتر تماس بگیرید:

📞 ${CONFIG.CONTACT_PHONE}`,

      {
        reply_markup:
          mainKeyboard()
      }

    );


    await sendMessage(

      chatId,

      `❌ درخواست ${code} رد شد.`

    );


    return;

  }


  /*
  Callbackهای محاسبه ریلی مدیر
  */

  if (
    data === "RAIL_CALC"
  ) {

    if (!isAdmin(chatId)) {

      await sendMessage(
        chatId,
        "⛔ دسترسی ندارید."
      );

      return;

    }


    await startRailCalculation(
      chatId
    );

    return;

  }


  if (
    data === "RAIL_AHVAZ"
  ) {

    if (!isAdmin(chatId)) {
      return;
    }


    await saveSession(

      chatId,

      "RAIL_ADULTS",

      {
        route:
          "AHVAZ"
      }

    );


    await sendMessage(

      chatId,

      "👨 تعداد بزرگسال را وارد کنید:",

      {
        reply_markup:
          backKeyboard()
      }

    );

    return;

  }


  if (
    data === "RAIL_SHIRAZ"
  ) {

    if (!isAdmin(chatId)) {
      return;
    }


    await saveSession(

      chatId,

      "RAIL_ADULTS",

      {
        route:
          "SHIRAZ"
      }

    );


    await sendMessage(

      chatId,

      "👨 تعداد بزرگسال را وارد کنید:",

      {
        reply_markup:
          backKeyboard()
      }

    );

    return;

  }


}


/*
========================================================
محاسبه ریلی مدیر
========================================================
*/

async function startRailCalculation(
  chatId
) {

  await sendMessage(

    chatId,

    "🧮 محاسبه تور ریلی\n\nمسیر را انتخاب کنید:",

    {

      reply_markup: {

        inline_keyboard: [

          [
            {
              text:
                "🚆 اهواز",

              callback_data:
                "RAIL_AHVAZ"
            }
          ],

          [
            {
              text:
                "🚆 شیراز",

              callback_data:
                "RAIL_SHIRAZ"
            }
          ]

        ]

      }

    }

  );

}


/*
========================================================
پردازش مراحل محاسبه ریلی
========================================================
*/

async function handleRailText(
  message,
  session
) {

  const chatId =
    message.chat.id;


  const text =
    cleanText(
      message.text
    );


  const data =
    session.data || {};


  if (
    session.state ===
    "RAIL_ADULTS"
  ) {

    const adults =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isInteger(adults) ||
      adults < 0
    ) {

      await sendMessage(
        chatId,
        "❌ تعداد نامعتبر است."
      );

      return true;

    }


    data.adults =
      adults;


    await saveSession(
      chatId,
      "RAIL_CHILDREN",
      data
    );


    await sendMessage(

      chatId,

      "👧 تعداد کودک ۲ تا ۱۲ سال را وارد کنید:",

      {
        reply_markup:
          backKeyboard()
      }

    );


    return true;

  }


  if (
    session.state ===
    "RAIL_CHILDREN"
  ) {

    const children =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isInteger(children) ||
      children < 0
    ) {

      await sendMessage(
        chatId,
        "❌ تعداد نامعتبر است."
      );

      return true;

    }


    data.children =
      children;


    await saveSession(
      chatId,
      "RAIL_HOTEL",
      data
    );


    await sendMessage(

      chatId,

      "🏨 قیمت هتل برای هر نفر در هر شب را به تومان وارد کنید:\nمثال: ۲۳۰۰۰۰۰",

      {
        reply_markup:
          backKeyboard()
      }

    );


    return true;

  }


  if (
    session.state ===
    "RAIL_HOTEL"
  ) {

    const hotel =
      Number(
        normalizeDigits(text)
          .replace(/,/g, "")
      );


    if (
      !Number.isFinite(hotel) ||
      hotel <= 0
    ) {

      await sendMessage(
        chatId,
        "❌ مبلغ هتل صحیح نیست."
      );

      return true;

    }


    data.hotelPricePerPersonPerNight =
      hotel;


    await saveSession(
      chatId,
      "RAIL_NIGHTS",
      data
    );


    await sendMessage(

      chatId,

      "🌙 تعداد شب اقامت را وارد کنید:",

      {
        reply_markup:
          backKeyboard()
      }

    );


    return true;

  }


  if (
    session.state ===
    "RAIL_NIGHTS"
  ) {

    const nights =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isInteger(nights) ||
      nights <= 0
    ) {

      await sendMessage(
        chatId,
        "❌ تعداد شب صحیح نیست."
      );

      return true;

    }


    data.nights =
      nights;


    await saveSession(
      chatId,
      "RAIL_CHILD_HOTEL",
      data
    );


    await sendMessage(

      chatId,

      "👧 درصد هزینه هتل کودک را وارد کنید.\nمثال: ۵۰",

      {
        reply_markup:
          backKeyboard()
      }

    );


    return true;

  }


  if (
    session.state ===
    "RAIL_CHILD_HOTEL"
  ) {

    const percent =
      Number(
        normalizeDigits(text)
      );


    if (
      !Number.isFinite(percent) ||
      percent < 0 ||
      percent > 100
    ) {

      await sendMessage(
        chatId,
        "❌ درصد باید بین صفر تا صد باشد."
      );

      return true;

    }


    data.childHotelPercent =
      percent;


    await saveSession(
      chatId,
      "RAIL_PRIVATE",
      data
    );


    await sendMessage(

      chatId,

      "🚃 آیا کوپه اختصاصی می‌خواهید؟",

      {

        reply_markup: {

          inline_keyboard: [

            [
              {
                text:
                  "✅ بله",

                callback_data:
                  "RAIL_PRIVATE_YES"
              },

              {
                text:
                  "❌ خیر",

                callback_data:
                  "RAIL_PRIVATE_NO"
              }

            ]

          ]

        }

      }

    );


    return true;

  }


  return false;

}


/*
========================================================
Webhook
========================================================
*/

app.post(
  "/webhook",
  async (req, res) => {

    res.status(200).json({
      ok: true
    });


    try {

      const update =
        req.body;


      /*
      Callback
      */

      if (
        update.callback_query
      ) {

        await handleCallback(
          update.callback_query
        );

        return;

      }


      /*
      پیام
      */

      if (
        update.message
      ) {

        const message =
          update.message;


        const chatId =
          message?.chat?.id;


        if (!chatId) {
          return;
        }


        /*
        فایل لیست
        */

        if (
          message.document
        ) {

          const session =
            await getSession(
              chatId
            );


          if (
            session.state ===
              "PASSENGER_LIST" ||
            session.state ===
              "PASSENGER_LIST_TEXT"
          ) {

            const request =
              await getRequestByCode(
                session.data?.requestCode
              );


            if (request) {

              await sendPassengerDocumentToAdmin(

                request,

                message.document,

                `📎 فایل لیست\n🆔 درخواست: ${request.request_code}\n👤 ${request.data?.name || request.applicant_name || "-"}`

              );


              await finishPassengerList(

                chatId,

                request.request_code

              );

            }


            return;

          }

        }


        /*
        تصویر لیست
        */

        if (
          message.photo
        ) {

          const session =
            await getSession(
              chatId
            );


          if (
            session.state ===
            "PASSENGER_LIST"
          ) {

            const request =
              await getRequestByCode(
                session.data?.requestCode
              );


            if (request) {

              await sendPassengerPhotoToAdmin(

                request,

                message.photo

              );


              await finishPassengerList(

                chatId,

                request.request_code

              );

            }


            return;

          }

        }


        /*
        محاسبه ریلی مدیر
        */

        if (
          isAdmin(chatId) &&
          message.text
        ) {

          const session =
            await getSession(
              chatId
            );


          if (
            session.state.startsWith(
              "RAIL_"
            )
          ) {

            const handled =
              await handleRailText(

                message,

                session

              );


            if (handled) {
              return;
            }

          }

        }


        /*
        متن عادی
        */

        await handleTextMessage(
          message
        );

      }

    } catch (error) {

      console.error(
        "❌ Webhook error:",
        error
      );

    }

  }
);


/*
========================================================
Health
========================================================
*/

app.get(
  "/",
  (req, res) => {

    res.status(200).send(
      "Safar Mashhad Toos Bot is running."
    );

  }
);


app.get(
  "/health",
  (req, res) => {

    res.status(200).json({

      ok: true,

      bot:
        CONFIG.BOT_TITLE,

      time:
        new Date().toISOString()

    });

  }
);


/*
========================================================
شروع سرور
========================================================
*/

async function startServer() {

  try {

    await initDB();


    app.listen(
      PORT,
      () => {

        console.log(
          "===================================="
        );

        console.log(
          "🤖 سفر مشهد توس Bot"
        );

        console.log(
          `🚀 Server running on port ${PORT}`
        );

        console.log(
          `👤 Admin configured: ${ADMIN_CHAT_ID ? "YES" : "NO"}`
        );

        console.log(
          `🔐 Bot token configured: ${BOT_TOKEN ? "YES" : "NO"}`
        );

        console.log(
          "===================================="
        );

      }
    );

  } catch (error) {

    console.error(
      "❌ Startup error:",
      error
    );

    process.exit(1);

  }

}


startServer();
