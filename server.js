require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const CONFIG = require("./config");
const PRICING = require("./pricing");

const app = express();

app.use(express.json({ limit: "20mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/*
 * =========================================================
 * نام انواع خدمات
 * =========================================================
 */

const TOUR_NAMES = {
  AIR: "✈️ تور هوایی",
  RAIL: "�� تور ریلی",
  BUS: "�� تور اتوبوسی",
  CARAVAN_BUS: "�� کاروان اتوبوسی",
  CARAVAN_RAIL: "�� کاروان ریلی",
  HOTEL: "�� فقط هتل"
};

const NEED_PASSENGER_LIST = [
  "AIR",
  "RAIL",
  "CARAVAN_BUS",
  "CARAVAN_RAIL"
];

/*
 * =========================================================
 * ابزارهای عمومی
 * =========================================================
 */

function isAdmin(chatId) {
  return String(chatId) === String(CONFIG.ADMIN_CHAT_ID);
}

function en(v) {
  return String(v ?? "")
    .replace(/[۰-۹]/g, d =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    )
    .replace(/[٠-٩]/g, d =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
    );

}

function fa(v) {
  return String(v ?? "")
    .replace(/0/g, "۰")
    .replace(/1/g, "۱")
    .replace(/2/g, "۲")
    .replace(/3/g, "۳")
    .replace(/4/g, "۴")
    .replace(/5/g, "۵")
    .replace(/6/g, "۶")
    .replace(/7/g, "۷")
    .replace(/8/g, "۸")
    .replace(/9/g, "۹");
}

function money(v) {
  return Number(v || 0).toLocaleString("fa-IR");
}

function getChatId(m) {
  return String(
    m?.chat?.id ??
    m?.sender?.id ??
    m?.from?.id ??
    ""
  );
}

function getUsername(m) {
  return (
    m?.sender?.username ||
    m?.from?.username ||
    ""
  );
}

function getFirstName(m) {
  return (
    m?.sender?.first_name ||
    m?.sender?.firstName ||
    m?.from?.first_name ||
    m?.from?.firstName ||
    "کاربر"
  );
}

function validPhone(v) {
  return /^09\d{9}$/.test(
    en(v).replace(/\s/g, "")
  );
}

function validNational(v) {
  return /^\d{10}$/.test(

    en(v).replace(/\D/g, "")
  );
}

function normalizeDate(v) {
  const p = en(v)
    .trim()
    .replace(/[.-]/g, "/")
    .split("/");

  if (p.length !== 3) return null;

  const y = Number(p[0]);
  const m = Number(p[1]);
  const d = Number(p[2]);

  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    y < 1300 ||
    y > 1500 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > (m <= 6 ? 31 : m <= 11 ? 30 : 30)
  ) {
    return null;
  }

  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

function jalaliToDay(v) {
  const [jy, jm, jd] = v.split("/").map(Number);

  let days =
    -355668 +
    365 * (jy - 1) +
    Math.floor((jy - 1) / 33) * 8 +
    Math.floor(((jy - 1) % 33 + 3) / 4) +
    jd -
    1;

  const md = [
    31, 31, 31, 31, 31, 31,
    30, 30, 30, 30, 30, 29
  ];

  for (let i = 0; i < jm - 1; i++) {
    days += md[i];
  }

  return days;
}


function todayJalali() {
  const d = new Date();

  const gy = d.getUTCFullYear();
  const gm = d.getUTCMonth() + 1;
  const gd = d.getUTCDate();

  let gDay =
    Date.UTC(gy, gm - 1, gd) / 86400000;

  let jy = gy - 621;

  while (
    jalaliToDay(`${jy + 1}/01/01`) -
      jalaliToDay("1/01/01") <=
    gDay - Date.UTC(1, 0, 1) / 86400000
  ) {
    jy++;
  }

  return null;
}

/*
 * =========================================================
 * دیتابیس
 * =========================================================
 */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions(
      user_id TEXT PRIMARY KEY,
      state TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests(
      id SERIAL PRIMARY KEY,
      request_code TEXT UNIQUE,
      user_id TEXT,
      chat_id TEXT,
      username TEXT,
      applicant_name TEXT,
      phone TEXT,
      bale_id TEXT,
      request_type TEXT,
      payment_type TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),

      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const cols = [
    "applicant_name",
    "phone",
    "bale_id",
    "payment_type",
    "payload",
    "status",
    "updated_at",
    "username",
    "request_type"
  ];

  for (const c of cols) {
    const type =
      c === "payload"
        ? "JSONB DEFAULT '{}'::jsonb"
        : c === "status"
        ? "TEXT DEFAULT 'pending'"
        : "TEXT";

    await pool.query(
      `ALTER TABLE requests ADD COLUMN IF NOT EXISTS ${c} ${type}`
    );
  }
}

async function getSession(id) {
  const r = await pool.query(
    "SELECT * FROM sessions WHERE user_id=$1",
    [String(id)]
  );

  return r.rows[0] || null;
}

async function saveSession(
  id,
  state,
  data = {}
) {
  await pool.query(
    `INSERT INTO sessions(
      user_id,
      state,
      data,
      updated_at
    )
    VALUES($1,$2,$3,NOW())
    ON CONFLICT(user_id)
    DO UPDATE SET
      state=EXCLUDED.state,

      data=EXCLUDED.data,
      updated_at=NOW()`,
    [
      String(id),
      state,
      JSON.stringify(data)
    ]
  );
}

async function clearSession(id) {
  await pool.query(
    "DELETE FROM sessions WHERE user_id=$1",
    [String(id)]
  );
}

/*
 * =========================================================
 * ارتباط با بله
 * =========================================================
 */

async function bale(method, body) {
  if (!CONFIG.BOT_TOKEN) {
    throw new Error(
      "BALE_BOT_TOKEN / BOT_TOKEN تنظیم نشده است."
    );
  }

  const r = await fetch(
    `${CONFIG.BALE_API_BASE}${CONFIG.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const j =
    await r.json().catch(() => ({}));

  if (!r.ok || j.ok === false) {
    throw new Error(
      j.description ||
      `Bale ${r.status}`
    );
  }

  return j;
}

async function sendMessage(

  chatId,
  text,
  reply_markup
) {
  const b = {
    chat_id: String(chatId),
    text
  };

  if (reply_markup) {
    b.reply_markup = reply_markup;
  }

  return bale("sendMessage", b);
}

async function sendPhoto(
  chatId,
  photo,
  caption
) {
  return bale("sendPhoto", {
    chat_id: String(chatId),
    photo,
    caption
  });
}

async function sendDocument(
  chatId,
  document,
  caption
) {
  return bale("sendDocument", {
    chat_id: String(chatId),
    document,
    caption
  });
}

async function answerCallback(id) {
  try {
    await bale(
      "answerCallbackQuery",
      {
        callback_query_id: id
      }
    );
  } catch (e) {
    console.log(
      "callback:",
      e.message
    );
  }
}


/*
 * =========================================================
 * منوی اصلی
 * =========================================================
 */

function mainKeyboard() {
  return {
    keyboard: [
      [
        {
          text: "�� رزرو هتل"
        },
        {
          text: "�� تورهای مشهد"
        }
      ],
      [
        {
          text: "�� طرح الماس شهر بهشت"
        },
        {
          text: "�� خدمات گردشگری"
        }
      ],
      [
        {
          text: "�� تماس با ما"
        },
        {
          text: "�� کانال"
        }
      ]
    ],
    resize_keyboard: true
  };
}

/*
 * =========================================================
 * منوی تورها
 * =========================================================
 */

function tourMenu() {
  return {
    inline_keyboard: [
      [
        {
          text: "✈️ تور هوایی",
          callback_data: "TOUR_AIR"
        }
      ],
      [

        {
          text: "�� تور ریلی",
          callback_data: "TOUR_RAIL"
        }
      ],
      [
        {
          text: "�� تور اتوبوسی",
          callback_data: "TOUR_BUS"
        }
      ],
      [
        {
          text: "�� کاروان اتوبوسی",
          callback_data: "TOUR_CARAVAN_BUS"
        }
      ],
      [
        {
          text: "�� کاروان ریلی",
          callback_data: "TOUR_CARAVAN_RAIL"
        }
      ],
      [
        {
          text: "�� فقط هتل",
          callback_data: "TOUR_HOTEL"
        }
      ],
      [
        {
          text: "�� بازگشت",
          callback_data: "BACK_MAIN"
        }
      ]
    ]
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "�� بازگشت",
          callback_data: "TOUR_BACK"
        },
        {
          text: "❌ لغو",
          callback_data: "TOUR_CANCEL"
        }
      ]
    ]
  };
}


/*
 * =========================================================
 * طرح الماس
 * =========================================================
 */

function diamondPlanText() {
  return `�� طرح الماس شهر بهشت

۱️⃣ نصب کیوبانک مهر
۲️⃣ تکمیل احراز هویت
۳️⃣ انجام اعتبارسنجی
۴️⃣ دریافت رتبه اعتباری

�� رتبه A و B: بدون ضامن؛ خودت ضامن حسابت هستی.

�� رتبه C و D و پایین‌تر: یک ضامن + نامه کسر از حقوق + فیش حقوقی

⏳ بازپرداخت: ۱۲ ماهه
�� سود: ۳ درصد
�� بدون مراجعه به شعبه
�� اصل مدارک باید بارگذاری شود.

�� پس از تأیید، مسافر باید ۴۰٪ هزینه کل سفر را پرداخت کند و رسید را ارسال نماید.

☎️ پشتیبانی: ${CONFIG.CONTACT.phone}`;
}

function sendDiamondPlan(chatId) {
  return sendMessage(
    chatId,
    diamondPlanText(),
    {
      inline_keyboard: [
        [
          {
            text: "�� نصب کیوبانک مهر",
            url: CONFIG.DIAMOND_QBANK_URL
          }
        ],
        [
          {
            text: "�� بازگشت",
            callback_data: "DIAMOND_BACK"
          }
        ]
      ]
    }
  );
}

/*
 * =========================================================
 * اطلاعات پرداخت

        );
      } else {
        await finishAirCalc(
          chatId,
          nextData,
          "cash",
          3500000
        );
      }
    } else {
      await saveSession(
        chatId,
        "MAN_AIR_PAYMENT_SELECT",
        nextData
      );

      await sendMessage(
        chatId,
        "�� نوع پرداخت را انتخاب کنید:",
        {
          inline_keyboard: [
            [
              {
                text: "�� نقدی",
                callback_data: "AIR_PAYMENT_CASH"
              }
            ],
            [
              {
                text: "�� طرح الماس",
                callback_data: "AIR_PAYMENT_LOAN"
              }
            ],
            [
              {
                text: "�� خروج",
                callback_data: "ADMIN_CALC_EXIT"
              }
            ]
          ]
        }
      );
    }

    return true;
  }

  if (
    d.type === "AIR" &&
    s.state === "MAN_AIR_LOAN_PROFIT"
  ) {
    if (v < 5000000 || v > 6000000) {
      await sendMessage(
        chatId,
        "❌ سود طرح الماس باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد."

      );
      return true;
    }

    await finishAirCalc(
      chatId,
      d,
      "loan",
      v
    );

    return true;
  }

  if (
    s.state ===
    "MAN_ADULTS"
  ) {
    if (v <= 0) {
      await sendMessage(
        chatId,
        "❌ تعداد بزرگسال صحیح نیست."
      );
      return true;
    }

    await saveSession(
      chatId,
      "MAN_CHILDREN",
      {
        ...d,
        adults: v
      }
    );

    await sendMessage(
      chatId,
      "�� تعداد کودک را وارد کنید:"
    );

    return true;
  }

  if (
    s.state ===
    "MAN_CHILDREN"
  ) {
    if (v < 0) {
      await sendMessage(
        chatId,
        "❌ تعداد کودک صحیح نیست."
      );
      return true;
    }


    await saveSession(
      chatId,
      "MAN_NIGHTS",
      {
        ...d,
        children: v
      }
    );

    await sendMessage(
      chatId,
      "�� تعداد شب را وارد کنید:"
    );

    return true;
  }

  if (
    s.state ===
    "MAN_NIGHTS"
  ) {
    if (v <= 0) {
      await sendMessage(
        chatId,
        "❌ تعداد شب صحیح نیست."
      );
      return true;
    }

    await saveSession(
      chatId,
      d.type === "AIR"
        ? "MAN_AIR_TICKET_ADULT"
        : "MAN_TICKET",
      {
        ...d,
        nights: v
      }
    );

    await sendMessage(
      chatId,
      d.type === "AIR"
        ? "✈️ هزینه پرواز رفت هر بزرگسال را وارد کنید:"
        : "�� هزینه بلیت/سفر هر بزرگسال را وارد کنید:"
    );

    return true;
  }

  if (
    s.state ===
    "MAN_TICKET"
  ) {
    if (v < 0) {

      await sendMessage(
        chatId,
        "❌ مبلغ صحیح نیست."
      );
      return true;
    }

    await saveSession(
      chatId,
      "MAN_HOTEL",
      {
        ...d,
        ticketAdult: v
      }
    );

    await sendMessage(
      chatId,
      "�� قیمت هتل هر بزرگسال/شب را وارد کنید:"
    );

    return true;
  }

  if (
    s.state ===
    "MAN_HOTEL"
  ) {
    if (v < 0) {
      await sendMessage(
        chatId,
        "❌ مبلغ صحیح نیست."
      );
      return true;
    }

    await saveSession(
      chatId,
      "MAN_PROFIT",
      {
        ...d,
        hotelAdult: v
      }
    );

    await sendMessage(
      chatId,
      "�� سود هر نفر را وارد کنید:"
    );

    return true;
  }

  if (
    s.state ===

    "MAN_PROFIT"
  ) {
    if (v < 0) {
      await sendMessage(
        chatId,
        "❌ سود صحیح نیست."
      );
      return true;
    }

    const r =
      PRICING.calculateManualTour({
        ...d,
        manualProfit: v,
        paymentType:
          "cash"
      });

    await saveSession(
      chatId,
      "ADMIN_CALC",
      {}
    );

    await sendMessage(
      chatId,
      PRICING.formatManualCalculation(
        r
      ),
      managerCalcMenu()
    );

    return true;
  }

  return false;
}

/*
 * =========================================================
 * محاسبه فقط هتل
 * =========================================================
 */

async function startHotelCalc(
  chatId,
  prefill = {}
) {
  await saveSession(
    chatId,
    "HOTEL_CALC_PRICE",
    prefill
  );

  const nights =

    Number(prefill.nights || 0);

  const adults =
    Number(prefill.adults || 0);

  const children =
    Number(prefill.children || 0);

  await sendMessage(
    chatId,
    `�� محاسبه رزرو فقط هتل

�� درخواست: ${
      prefill.requestCode ||
      "محاسبه دستی"
    }

�� بزرگسال: ${adults}
�� کودک: ${children}
�� تعداد شب: ${nights}

�� قیمت هتل هر نفر / هر شب را وارد کنید:
مثال: ۱۴۵۰۰۰۰`
  );
}

async function hotelCalcText(
  chatId,
  text,
  session
) {
  const d =
    session.data || {};

  if (
    session.state !==
    "HOTEL_CALC_PRICE"
  ) {
    return false;
  }

  const price =
    Number(
      en(text).replace(
        /\D/g,
        ""
      )
    );

  if (price <= 0) {
    await sendMessage(
      chatId,
      "❌ قیمت هتل صحیح نیست."
    );
    return true;

  }

  const adults =
    Number(d.adults || 0);

  const children =
    Number(d.children || 0);

  const nights =
    Number(d.nights || 0);

  /*
   * بزرگسال ۱۰۰٪
   */
  const adultHotel =
    adults *
    nights *
    price;

  /*
   * کودک ۵۰٪
   */
  const childHotel =
    children *
    nights *
    price *
    0.5;

  const finalCost =
    Math.round(
      adultHotel +
      childHotel
    );

  const result = {
    type: "HOTEL",

    hotelPricePerPersonPerNight:
      price,

    adults,

    children,

    nights,

    adultHotel,

    childHotel,

    finalCost,

    totalCost:
      finalCost,


    customerCash:
      Math.ceil(
        finalCost * 0.4
      )
  };

  /*
   * ذخیره محاسبه داخل درخواست
   */
  if (d.requestCode) {
    await pool.query(
      `UPDATE requests
       SET payload = payload || $2::jsonb,
           updated_at = NOW()
       WHERE request_code=$1`,
      [
        d.requestCode,
        JSON.stringify({
          calculation:
            result,

          totalCost:
            finalCost,

          calculatedAt:
            new Date().toISOString()
        })
      ]
    );
  }

  /*
   * نگه داشتن session مدیر
   */
  await saveSession(
    chatId,
    "ADMIN_CALC",
    {
      ...d,
      calculation:
        result
    }
  );

  let out =
    `�� محاسبه رزرو فقط هتل
━━━━━━━━━━━━━━━━━━
�� بزرگسال: ${adults}
�� کودک: ${children}
�� تعداد شب: ${nights}

�� قیمت هتل هر نفر / هر شب:
${money(price)} تومان

�� هزینه بزرگسال:

${money(adultHotel)} تومان

�� هزینه کودک:
${money(childHotel)} تومان

━━━━━━━━━━━━━━━━━━
�� مبلغ نهایی:
${money(finalCost)} تومان
`;

  if (
    d.paymentType ===
    "loan"
  ) {
    out += `
�� طرح الماس

�� سهم نقدی ۴۰٪:
${money(result.customerCash)} تومان
`;
  }

  if (d.requestCode) {
    out += `
━━━━━━━━━━━━━━━━━━
�� درخواست: ${
      d.requestCode
    }
�� متقاضی: ${
      d.applicantName || ""
    }
�� تلفن: ${
      d.phone || ""
    }`;
  }

  await sendMessage(
    chatId,
    out,
    managerCalcMenu(
      Boolean(d.requestCode),
      d.requestCode || ""
    )
  );

  return true;
}

/*
 * =========================================================
 * پردازش پیام
 * =========================================================
 */

async function handleMessage(

  message
) {
  const chatId =
    getChatId(message);

  if (!chatId) return;

  let session =
    await getSession(chatId);

  /*
   * فایل و تصویر
   */
  if (
    await handleMedia(
      message,
      session
    )
  ) {
    return;
  }

  const text =
    String(
      message.text || ""
    ).trim();

  /*
   * /start
   */
  if (text === "/start") {
    await clearSession(
      chatId
    );

    await saveSession(
      chatId,
      "MAIN",
      {}
    );

    await sendMessage(
      chatId,
      "�� به ربات سفر مشهد توس خوش آمدید.\n\nبرای دریافت خدمات گزینه موردنظر را انتخاب کنید.",
      mainKeyboard()
    );

    return;
  }

  /*
   * تورهای مشهد
   */
  if (

