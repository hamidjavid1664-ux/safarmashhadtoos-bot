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
  RAIL: "🚆 تور ریلی",
  BUS: "🚌 تور اتوبوسی",
  CARAVAN_BUS: "🚍 کاروان اتوبوسی",
  CARAVAN_RAIL: "🚆 کاروان ریلی",
  HOTEL: "🏨 فقط هتل"
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
          text: "🏨 رزرو هتل"
        },
        {
          text: "🚌 تورهای مشهد"
        }
      ],
      [
        {
          text: "💎 طرح الماس شهر بهشت"
        },
        {
          text: "🧳 خدمات گردشگری"
        }
      ],
      [
        {
          text: "📞 تماس با ما"
        },
        {
          text: "📢 کانال"
        }
      ]
    ],
    resize_keyboard: true
  };
}

function tourKeyboard() {
  return {
    keyboard: [
      [
        {
          text: "✈️ تور هوایی"
        },
        {
          text: "🚆 تور ریلی"
        }
      ],
      [
        {
          text: "🚌 تور اتوبوسی"
        },
        {
          text: "🚍 کاروان اتوبوسی"
        }
      ],
      [
        {
          text: "🚆 کاروان ریلی"
        },
        {
          text: "🏨 فقط هتل"
        }
      ],
      [
        {
          text: "🔙 بازگشت"
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
      ],
      [
        {
          text: "🏠 منوی اصلی"
        }
      ]
    ],
    resize_keyboard: true
  };
}

/*
 * =========================================================
 * پیام‌های ثابت
 * =========================================================
 */

const paymentInfoText = `
💳 اطلاعات پرداخت

🏦 بانک: مهر ایران
👤 صاحب حساب: مهدی رشیدیان طرقی

💳 شماره کارت:
۶۰۶۳۷۳۱۱۶۱۴۳۷۱۷۴

🏦 شماره حساب:
۳۶۳۴۷۰۰۱۴۵۱۷۲۱۷۰۰۱

🔹 شماره شبا:
IR160600363470014517217001

⚠️ لطفاً پس از پرداخت، تصویر رسید را همینجا ارسال کنید.
`;

const diamondText = `
💎 طرح الماس شهر بهشت

✨ ۴۰ درصد با تو
✨ ۶۰ درصد با ما

⏱ مدت بازپرداخت: ۱۲ ماهه
💰 سود/کارمزد: ۳٪

🔹 رتبه A و B:
نیازی به ضامن ندارید.
«خودت ضامن حسابت هستی»

🔹 رتبه C و D و پایین‌تر:
یک ضامن + گواهی کسر از حقوق + فیش حقوقی

✅ مراجعه حضوری به شعبه لازم نیست.
✅ مدارک باید اصل باشند و تصویر واضح آن‌ها ارسال شود.

📲 برای شروع، ابتدا کیوبانک مهر را نصب کنید.
`;

function diamondKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "📲 نصب کیوبانک مهر",
          url: "https://qbank24.ir/downloads"
        }
      ],
      [
        {
          text: "🔙 بازگشت"
        }
      ]
    ]
  };
}

function diamondPaymentText(req, calc) {
  let total = 0;
  let cash = 0;
  let loan = 0;

  if (calc) {
    total = Number(
      calc.finalCost ??
      calc.totalCost ??
      calc.finalPrice ??
      req?.payload?.totalCost ??
      0
    );

    loan = Number(
      calc.loanAmount ??
      0
    );

    cash = Number(
      calc.customerCash ??
      (total - loan)
    );
  }

  return `
💎 درخواست شما در طرح الماس شهر بهشت تأیید شد.

${total > 0
  ? `💰 مبلغ کل تور: ${money(total)} تومان
💵 سهم پرداختی شما (۴۰٪): ${money(cash)} تومان`
  : `💰 مبلغ نهایی پس از محاسبه مدیر اعلام می‌شود.`}

📌 توجه:
در این مرحله اطلاعات حساب یا کارت برای شما ارسال نمی‌شود.

بعد از محاسبه نهایی، مبلغ پرداختی شما از طرف مدیر اعلام خواهد شد.

${diamondText}
`;
}

