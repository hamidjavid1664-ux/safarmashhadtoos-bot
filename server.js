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
  "BUS",
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

const DIAMOND_LOAN_OPTIONS = [80, 70, 60, 50];

function diamondRatioKeyboard(requestCode = "") {
  return {
    inline_keyboard: [
      [
        { text: "💎 وام ۸۰٪ / نقد ۲۰٪", callback_data: `DIAMOND_RATIO:80${requestCode ? `:${requestCode}` : ""}` },
        { text: "💎 وام ۷۰٪ / نقد ۳۰٪", callback_data: `DIAMOND_RATIO:70${requestCode ? `:${requestCode}` : ""}` }
      ],
      [
        { text: "💎 وام ۶۰٪ / نقد ۴۰٪", callback_data: `DIAMOND_RATIO:60${requestCode ? `:${requestCode}` : ""}` },
        { text: "💎 وام ۵۰٪ / نقد ۵۰٪", callback_data: `DIAMOND_RATIO:50${requestCode ? `:${requestCode}` : ""}` }
      ]
    ]
  };
}

function feedbackRatingKeyboard(step) {
  return {
    inline_keyboard: [[1,2,3,4,5].map(n => ({ text: `${n} ⭐`, callback_data: `FEEDBACK_RATE:${step}:${n}` }))]
  };
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
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(x => x.type === type)?.value || "";
  const y = en(get("year")).padStart(4, "0");
  const m = en(get("month")).padStart(2, "0");
  const d = en(get("day")).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/*
 * =========================================================
 * دیتابیس
 * =========================================================
 */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_settings(
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions(
      user_id TEXT PRIMARY KEY,
      state TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO bot_settings(key,value) VALUES('diamond_loan_enabled','false')
     ON CONFLICT(key) DO NOTHING`
  );

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


async function getDiamondEnabled() {
  try {
    const r = await pool.query(
      "SELECT value FROM bot_settings WHERE key='diamond_loan_enabled' LIMIT 1"
    );
    if (!r.rows.length) return false;
    return String(r.rows[0].value).toLowerCase() === "true";
  } catch (e) {
    console.error("Diamond status read error:", e);
    // در صورت خطای موقت دیتابیس، طرح الماس غیرفعال در نظر گرفته می‌شود
    // تا فرم سفر نقدی همچنان بدون توقف کار کند.
    return false;
  }
}

async function setDiamondEnabled(enabled) {
  await pool.query(
    `INSERT INTO bot_settings(key,value) VALUES('diamond_loan_enabled',$1)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
    [enabled ? "true" : "false"]
  );
}

function diamondUnavailableText() {
  return `💎 اطلاعیه مهم درباره طرح الماس شهر بهشت

همراه گرامی، زائر محترم امام رضا (ع) 🌷

با توجه به تکمیل ظرفیت فعلی تخصیص اعتبار طرح الماس، در حال حاضر امکان اختصاص وام برای ثبت درخواست‌های جدید فراهم نیست.

⏳ این محدودیت موقتی است و فعال‌شدن مجدد طرح، منوط به تأمین اعتبار توسط سرمایه‌گذار و اعلام ظرفیت جدید خواهد بود.

🚌 خبر خوب اینکه همچنان می‌توانید از خدمات سفر نقدی شهر بهشت استفاده کنید!

شما می‌توانید تورهای هوایی، ریلی و اتوبوسی مشهد و همچنین خدمات رزرو هتل را به‌صورت نقدی دریافت کنید.

🙏 از اعتماد و همراهی شما سپاسگزاریم.

💚 شهر بهشت | سفر هوشمندانه به مشهد مقدس`;
}

function diamondUnavailableKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🚌 مشاهده تورهای نقدی", callback_data: "DIAMOND_CASH_TOURS" }],
      [{ text: "🔙 بازگشت", callback_data: "DIAMOND_BACK" }]
    ]
  };
}

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

async function getChannelTarget() {
  // اولویت: ENV، سپس config، سپس شناسه‌ای که از channel_post خود کانال ذخیره شده است
  if (process.env.CHANNEL_ID) return String(process.env.CHANNEL_ID).trim();
  if (CONFIG.CHANNEL_ID) return String(CONFIG.CHANNEL_ID).trim();
  try {
    const r = await pool.query(
      "SELECT value FROM bot_settings WHERE key='channel_id' LIMIT 1"
    );
    if (r.rows[0]?.value) return String(r.rows[0].value).trim();
  } catch (e) {
    console.error("channel target lookup:", e.message);
  }
  return "@safarmashhadtoos";
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

async function sendVoice(
  chatId,
  voice,
  caption
) {
  return bale("sendVoice", {
    chat_id: String(chatId),
    voice,
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
      ],
      [
        {
          text: "📋 پیگیری درخواست"
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
          text: "🚆 تور ریلی",
          callback_data: "TOUR_RAIL"
        }
      ],
      [
        {
          text: "🚌 تور اتوبوسی",
          callback_data: "TOUR_BUS"
        }
      ],
      [
        {
          text: "🚍 کاروان اتوبوسی",
          callback_data: "TOUR_CARAVAN_BUS"
        }
      ],
      [
        {
          text: "🚆 کاروان ریلی",
          callback_data: "TOUR_CARAVAN_RAIL"
        }
      ],
      [
        {
          text: "🏨 فقط هتل",
          callback_data: "TOUR_HOTEL"
        }
      ],
      [
        {
          text: "🔙 بازگشت",
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
          text: "🔙 بازگشت",
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
  return `💎 طرح الماس شهر بهشت

۱️⃣ نصب کیوبانک مهر
۲️⃣ تکمیل احراز هویت
۳️⃣ انجام اعتبارسنجی
۴️⃣ دریافت رتبه اعتباری

🟢 رتبه A و B: بدون ضامن؛ خودت ضامن حسابت هستی.

🟡 رتبه C و D و پایین‌تر: یک ضامن + نامه کسر از حقوق + فیش حقوقی

⏳ بازپرداخت: ۱۲ ماهه
💰 سود: ۳ درصد
🚫 بدون مراجعه به شعبه
📄 اصل مدارک باید بارگذاری شود.

💳 پس از تأیید، مسافر باید سهم نقدی تعیین‌شده توسط مدیر را پرداخت کند و رسید را ارسال نماید.

📌 سهم نقدی می‌تواند بر اساس طرح انتخابی مدیر متفاوت باشد (۸۰٪ وام / ۲۰٪ نقد، ۷۰٪ / ۳۰٪، ۶۰٪ / ۴۰٪ یا ۵۰٪ / ۵۰٪).

☎️ پشتیبانی: ${CONFIG.CONTACT.phone}`;
}

async function sendDiamondPlan(chatId) {
  const enabled = await getDiamondEnabled();

  if (!enabled) {
    return sendMessage(
      chatId,
      diamondUnavailableText(),
      diamondUnavailableKeyboard()
    );
  }

  return sendMessage(
    chatId,
    diamondPlanText(),
    {
      inline_keyboard: [
        [
          {
            text: "📲 نصب کیوبانک مهر",
            url: "https://qbank24.ir/downloads"
          }
        ],
        [
          {
            text: "🤖 دانلود کیوبانک برای اندروید",
            url: "https://mehr-apps.hot.ir-central1.arvanstorage.ir/Qbank_8.0.5.apk?versionId="
          }
        ],
        [
          {
            text: "🔙 بازگشت",
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
 * =========================================================
 */

function paymentInfoText() {
  return `💵 اطلاعات پرداخت

🏦 بانک: ${CONFIG.PAYMENT.bank}
👤 به نام: ${CONFIG.PAYMENT.owner}

💳 شماره کارت:
${CONFIG.PAYMENT.card}

🏦 شماره حساب:
${CONFIG.PAYMENT.account}

🔗 شماره شبا:
${CONFIG.PAYMENT.iban}

⚠️ پس از پرداخت، تصویر یا فایل رسید واریزی را همین‌جا ارسال کنید.`;
}

/*
 * =========================================================
 * پیام طرح الماس بعد از تأیید
 *
 * نکته:
 * اینجا دیگر شماره حساب ارسال نمی‌شود.
 * =========================================================
 */

function diamondPaymentText(req) {
  const payload = req.payload || {};
  const calc = payload.calculation || {};
  const total = Number(calc.finalPrice ?? payload.totalCost ?? 0);
  const cash = Number(calc.customerCash ?? 0);
  const loan = Number(calc.loanAmount ?? 0);
  const loanPercent = Number(calc.loanPercent ?? 60);
  const cashPercent = 100 - loanPercent;

  if (total > 0 && cash > 0 && loan > 0) {
    return `💎 درخواست طرح الماس شما تأیید شد.

🆔 درخواست: ${req.request_code}
💰 هزینه کل سفر: ${money(total)} تومان

💎 سهم طرح الماس: ${loanPercent}٪
💳 مبلغ نقدی قابل پرداخت (${cashPercent}٪): ${money(cash)} تومان
💎 مبلغ تأمین‌شده از طرح (${loanPercent}٪): ${money(loan)} تومان

${paymentInfoText()}

بعد از تأیید رسید، در صورت نیاز لیست مسافران یا همراهان از شما دریافت می‌شود.`;
  }

  return `💎 درخواست طرح الماس شما تأیید شد.

🆔 درخواست: ${req.request_code}

برای ادامه مراحل پرداخت، اطلاعات لازم را از همین ربات دریافت خواهید کرد.`;
}

/*
 * =========================================================
 * متن مبلغ محاسبه‌شده برای مشتری
 *
 * این قسمت تنها جایی است که اطلاعات واریز
 * همراه مبلغ محاسبه‌شده برای مشتری ارسال می‌شود.
 * =========================================================
 */

function calculatedPaymentText(req) {
  const payload = req.payload || {};
  const calc = payload.calculation || {};
  const total = Number(calc.finalPrice ?? calc.finalCost ?? calc.totalCost ?? payload.totalCost ?? 0);
  if (total <= 0) return null;

  const paymentType = req.payment_type || payload.paymentType || "cash";
  let text = `💰 مبلغ سفر شما محاسبه شد.
━━━━━━━━━━━━━━━━━━
🆔 شماره درخواست: ${req.request_code}
🚍 نوع سفر: ${TOUR_NAMES[req.request_type] || "تور"}
👤 متقاضی: ${req.applicant_name || ""}
📱 تلفن: ${req.phone || ""}
━━━━━━━━━━━━━━━━━━
💰 مبلغ کل سفر: ${money(total)} تومان
`;

  if (paymentType === "loan") {
    const loanPercent = Number(calc.loanPercent ?? 60);
    const cashPercent = 100 - loanPercent;
    const customerCash = Number(calc.customerCash ?? 0);
    const loanAmount = Number(calc.loanAmount ?? 0);
    text += `
💎 نوع پرداخت: طرح الماس شهر بهشت
💎 سهم طرح: ${loanPercent}٪
💳 مبلغ نقدی موردنیاز (${cashPercent}٪): ${money(customerCash)} تومان
💎 مبلغ تأمین‌شده از طرح (${loanPercent}٪): ${money(loanAmount)} تومان

⚠️ این پیام فقط جهت اعلام مبلغ است.
⚠️ تا تأیید نهایی مدیر، هیچ پرداختی انجام ندهید.
`;
  } else {
    text += `
💵 نوع پرداخت: نقدی
💳 مبلغ قابل پرداخت: ${money(total)} تومان

⚠️ این پیام فقط جهت اعلام مبلغ است.
⚠️ تا تأیید نهایی مدیر، هیچ پرداختی انجام ندهید.
`;
  }

  return text;
}

/*
 * =========================================================
 * ارسال مبلغ محاسبه‌شده به مشتری
 * =========================================================
 */

async function sendCalculatedAmountToCustomer(
  adminId,
  code
) {
  if (!isAdmin(adminId)) {
    return;
  }

  const r =
    await pool.query(
      "SELECT * FROM requests WHERE request_code=$1",
      [code]
    );

  if (!r.rows.length) {
    await sendMessage(
      adminId,
      "❌ درخواست پیدا نشد."
    );
    return;
  }

  const req = r.rows[0];

  const payload =
    req.payload || {};

  const calc =
    payload.calculation || {};

  const total = Number(
    calc.finalCost ??
    calc.totalCost ??
    payload.totalCost ??
    0
  );

  if (total <= 0) {
    await sendMessage(
      adminId,
      "❌ مبلغ محاسبه‌شده برای این درخواست پیدا نشد."
    );
    return;
  }

  if (req.status === "rejected") {
    await sendMessage(
      adminId,
      "❌ این درخواست قبلاً رد شده است."
    );
    return;
  }

  const customerText =
    calculatedPaymentText(req);

  if (!customerText) {
    await sendMessage(
      adminId,
      "❌ متن مبلغ قابل ارسال ساخته نشد."
    );
    return;
  }

  try {
    await sendMessage(
      req.user_id,
      customerText
    );

    await pool.query(
      `UPDATE requests
       SET payload = payload || $2::jsonb,
           updated_at = NOW()
       WHERE request_code=$1`,
      [
        code,
        JSON.stringify({
          calculationSentToCustomer: true,
          calculationSentAt:
            new Date().toISOString()
        })
      ]
    );

    await sendMessage(
      adminId,
      `✅ مبلغ درخواست ${code} برای مشتری ارسال شد.

💰 مبلغ کل: ${money(total)} تومان

⚠️ درخواست هنوز تأیید نشده است.`
    );

  } catch (e) {
    console.error(
      "Send calculated amount error:",
      e
    );

    await sendMessage(
      adminId,
      `❌ ارسال مبلغ برای مشتری انجام نشد.

${e.message}`
    );
  }
}

/*
 * =========================================================
 * شروع فرم تور
 * =========================================================
 */

async function startTour(
  chatId,
  type
) {
  await saveSession(
    chatId,
    "TOUR_DATE_IN",
    {
      tourType: type
    }
  );

  await sendMessage(
    chatId,
    `📋 ${TOUR_NAMES[type]}

📅 تاریخ ورود به مشهد را وارد کنید.
مثال: ۱۴۰۵/۰۷/۱۳`,
    backKeyboard()
  );
}

async function askTourOut(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_DATE_OUT",
    d
  );

  await sendMessage(
    chatId,
    "📅 تاریخ خروج از مشهد را وارد کنید.\nمثال: ۱۴۰۵/۰۷/۱۶",
    backKeyboard()
  );
}

async function askNights(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_NIGHTS",
    d
  );

  await sendMessage(
    chatId,
    "🌙 تعداد شب اقامت را وارد کنید.\nمثال: ۳",
    backKeyboard()
  );
}

async function askAdults(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_ADULTS",
    d
  );

  await sendMessage(
    chatId,
    "👨 تعداد بزرگسال را وارد کنید.\nمثال: ۲",
    backKeyboard()
  );
}

async function askChildren(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_CHILDREN",
    d
  );

  await sendMessage(
    chatId,
    "👶 تعداد کودک ۳ تا ۵ سال را وارد کنید.\nاگر کودک ندارید ۰ بفرستید.",
    backKeyboard()
  );
}

async function askPayment(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_PAYMENT",
    d
  );

  const enabled = await getDiamondEnabled();
  const rows = [
    [
      {
        text: "💵 پرداخت نقدی",
        callback_data: "TOUR_PAYMENT_CASH"
      }
    ]
  ];

  if (enabled) {
    rows.push([
      {
        text: "💎 طرح الماس شهر بهشت",
        callback_data: "TOUR_PAYMENT_LOAN"
      }
    ]);
  }

  rows.push([
    {
      text: "🔙 بازگشت",
      callback_data: "TOUR_BACK"
    }
  ]);

  await sendMessage(
    chatId,
    "💳 نوع پرداخت را انتخاب کنید:",
    { inline_keyboard: rows }
  );
}

async function askName(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_NAME",
    d
  );

  await sendMessage(
    chatId,
    "👤 لطفاً نام و نام خانوادگی خود را وارد کنید.",
    backKeyboard()
  );
}

async function askPhone(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_PHONE",
    d
  );

  await sendMessage(
    chatId,
    "📱 شماره تماس را وارد کنید.\nمثال: ۰۹۱۷۷۷۰۰۹۶۱",
    backKeyboard()
  );
}

async function askNational(
  chatId,
  d
) {
  await saveSession(
    chatId,
    "TOUR_NATIONAL",
    d
  );

  await sendMessage(
    chatId,
    "🪪 کد ملی متقاضی اصلی را وارد کنید.",
    backKeyboard()
  );
}

/*
 * =========================================================
 * تأیید نهایی مشتری
 * =========================================================
 */

async function showConfirm(
  chatId,
  d
) {
  let s = `📋 بررسی نهایی درخواست
━━━━━━━━━━━━━━━━━━
🚍 نوع سفر: ${
    TOUR_NAMES[d.tourType]
  }
📅 ورود به مشهد: ${
    d.departureDate
  }
📅 خروج از مشهد: ${
    d.returnDate
  }
🌙 تعداد شب: ${
    d.nights
  }
👨 بزرگسال: ${
    d.adults
  } نفر
👶 کودک ۳ تا ۵ سال: ${
    d.children
  } نفر
💳 پرداخت: ${
    d.paymentType === "loan"
      ? "💎 طرح الماس"
      : "💵 نقدی"
  }
👤 نام: ${
    d.applicantName
  }
📱 تلفن: ${
    d.phone
  }
`;

  if (d.paymentType === "loan") {
    s += `🪪 کد ملی: ${
      d.nationalCode
    }\n`;
  }

  s += `━━━━━━━━━━━━━━━━━━
آیا اطلاعات صحیح است؟`;

  await saveSession(
    chatId,
    "TOUR_CONFIRM",
    d
  );

  await sendMessage(
    chatId,
    s,
    {
      inline_keyboard: [
        [
          {
            text: "✅ ارسال درخواست",
            callback_data:
              "TOUR_SUBMIT"
          }
        ],
        [
          {
            text: "✏️ اصلاح",
            callback_data:
              "TOUR_EDIT"
          }
        ],
        [
          {
            text: "❌ لغو",
            callback_data:
              "TOUR_CANCEL"
          }
        ]
      ]
    }
  );
}

/*
 * =========================================================
 * متن فرم تور
 * =========================================================
 */

async function handleTourText(
  chatId,
  text,
  s
) {
  const d = s.data || {};

  if (s.state === "TOUR_DATE_IN") {
    const x =
      normalizeDate(text);

    if (!x) {
      await sendMessage(
        chatId,
        "❌ تاریخ صحیح نیست. مثال: ۱۴۰۵/۰۷/۱۳"
      );
      return true;
    }

    await askTourOut(
      chatId,
      {
        ...d,
        departureDate: x
      }
    );

    return true;
  }

  if (s.state === "TOUR_DATE_OUT") {
    const x =
      normalizeDate(text);

    if (!x) {
      await sendMessage(
        chatId,
        "❌ تاریخ صحیح نیست. مثال: ۱۴۰۵/۰۷/۱۶"
      );
      return true;
    }

    await askNights(
      chatId,
      {
        ...d,
        returnDate: x
      }
    );

    return true;
  }

  if (s.state === "TOUR_NIGHTS") {
    const n = Number(
      en(text).replace(/\D/g, "")
    );

    if (
      !Number.isInteger(n) ||
      n <= 0
    ) {
      await sendMessage(
        chatId,
        "❌ تعداد شب صحیح نیست."
      );
      return true;
    }

    await askAdults(
      chatId,
      {
        ...d,
        nights: n
      }
    );

    return true;
  }

  if (s.state === "TOUR_ADULTS") {
    const n = Number(
      en(text).replace(/\D/g, "")
    );

    if (
      !Number.isInteger(n) ||
      n <= 0
    ) {
      await sendMessage(
        chatId,
        "❌ تعداد بزرگسال باید حداقل ۱ نفر باشد."
      );
      return true;
    }

    await askChildren(
      chatId,
      {
        ...d,
        adults: n
      }
    );

    return true;
  }

  if (s.state === "TOUR_CHILDREN") {
    const n = Number(
      en(text).replace(/\D/g, "")
    );

    if (
      !Number.isInteger(n) ||
      n < 0
    ) {
      await sendMessage(
        chatId,
        "❌ تعداد کودک صحیح نیست."
      );
      return true;
    }

    await askPayment(
      chatId,
      {
        ...d,
        children: n
      }
    );

    return true;
  }

  if (s.state === "TOUR_NAME") {
    if (text.length < 3) {
      await sendMessage(
        chatId,
        "❌ نام و نام خانوادگی را کامل وارد کنید."
      );
      return true;
    }

    await askPhone(
      chatId,
      {
        ...d,
        applicantName: text
      }
    );

    return true;
  }

  if (s.state === "TOUR_PHONE") {
    const p =
      en(text).replace(/\s/g, "");

    if (!validPhone(p)) {
      await sendMessage(
        chatId,
        "❌ شماره تماس صحیح نیست."
      );
      return true;
    }

    if (d.paymentType === "loan") {
      await askNational(
        chatId,
        {
          ...d,
          phone: p
        }
      );

      return true;
    }

    await showConfirm(
      chatId,
      {
        ...d,
        phone: p
      }
    );

    return true;
  }

  if (s.state === "TOUR_NATIONAL") {
    const n =
      en(text).replace(/\D/g, "");

    if (!validNational(n)) {
      await sendMessage(
        chatId,
        "❌ کد ملی باید ۱۰ رقم باشد."
      );
      return true;
    }

    await showConfirm(
      chatId,
      {
        ...d,
        nationalCode: n
      }
    );

    return true;
  }

  return false;
}

/*
 * =========================================================
 * ساخت شماره درخواست
 * =========================================================
 */

function requestCode() {
  return `SMT-${Date.now()
    .toString()
    .slice(-6)}${Math.floor(
    Math.random() * 90 + 10
  )}`;
}

/*
 * =========================================================
 * ثبت درخواست مشتری
 * =========================================================
 */

async function submitRequest(chatId) {
  const s =
    await getSession(chatId);

  if (!s) return;

  const d = s.data || {};

  const code =
    requestCode();

  const info =
    d.messageInfo || {};

  const nationalCode =
    d.nationalCode ||
    d.national_code ||
    "";

  const payload = {
    ...d,
    nationalCode
  };

  await pool.query(
    `INSERT INTO requests(
      request_code,
      user_id,
      chat_id,
      username,
      applicant_name,
      phone,
      bale_id,
      request_type,
      payment_type,
      payload,
      status
    )
    VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending'
    )`,
    [
      code,
      String(chatId),
      String(chatId),
      info.username || "ندارد",
      d.applicantName,
      d.phone,
      String(chatId),
      d.tourType,
      d.paymentType,
      JSON.stringify(payload)
    ]
  );

  let admin =
    `📋 درخواست جدید سفر
━━━━━━━━━━━━━━━━━━
🆔 ${code}
🚍 ${
      TOUR_NAMES[d.tourType]
    }
📅 ورود: ${
      d.departureDate
    }
📅 خروج: ${
      d.returnDate
    }
🌙 شب: ${
      d.nights
    }
👨 بزرگسال: ${
      d.adults
    }
👶 کودک: ${
      d.children
    }
💳 پرداخت: ${
      d.paymentType === "loan"
        ? "💎 طرح الماس"
        : "💵 نقدی"
    }
👤 ${
      d.applicantName
    }
📱 ${
      d.phone
    }
`;

  if (nationalCode) {
    admin += `🪪 کد ملی: ${nationalCode}\n`;
  }

  admin += `👤 بله: ${
    info.username || "ندارد"
  }
🆔 Bale ID: ${chatId}`;

  const buttons = [
    [
      {
        text: "✅ تأیید درخواست",
        callback_data:
          `APPROVE_REQUEST:${code}`
      },
      {
        text: "❌ رد درخواست",
        callback_data:
          `REJECT_REQUEST:${code}`
      }
    ]
  ];

  /*
   * محاسبه ریلی
   */
  if (d.tourType === "RAIL") {
    buttons.push([
      {
        text: "🧮 محاسبه این درخواست",
        callback_data:
          `CALC_REQUEST:${code}`
      }
    ]);
  }

  /*
   * محاسبه تور هوایی
   */
  if (d.tourType === "AIR") {
    buttons.push([
      {
        text: "✈️ محاسبه این درخواست هوایی",
        callback_data:
          `CALC_AIR_REQUEST:${code}`
      }
    ]);
  }

  /*
   * محاسبه تور اتوبوسی
   */
  if (d.tourType === "BUS") {
    buttons.push([
      {
        text: "🚌 محاسبه این درخواست اتوبوسی",
        callback_data:
          `CALC_BUS_REQUEST:${code}`
      }
    ]);
  }

  /*
   * محاسبه فقط هتل
   */
  if (d.tourType === "HOTEL") {
    buttons.push([
      {
        text: "🏨 محاسبه این درخواست هتل",
        callback_data:
          `CALC_HOTEL_REQUEST:${code}`
      }
    ]);
  }

  await sendMessage(
    CONFIG.ADMIN_CHAT_ID,
    admin,
    {
      inline_keyboard:
        buttons
    }
  );

  await clearSession(chatId);

  await sendMessage(
    chatId,
    `✅ درخواست شما ثبت شد.

🆔 شماره درخواست: ${code}

پس از بررسی مدیر، نتیجه به شما اطلاع داده می‌شود.`,
    mainKeyboard()
  );
}

/*
 * =========================================================
 * تأیید درخواست
 *
 * نکته مهم:
 * بعد از تأیید دیگر paymentInfoText()
 * برای مشتری ارسال نمی‌شود.
 * =========================================================
 */

async function approveRequest(
  adminId,
  code
) {
  if (!isAdmin(adminId)) return;

  const r =
    await pool.query(
      "SELECT * FROM requests WHERE request_code=$1",
      [code]
    );

  if (!r.rows.length) {
    await sendMessage(
      adminId,
      "❌ درخواست پیدا نشد."
    );
    return;
  }

  const req = r.rows[0];

  const payload =
    req.payload || {};

  await pool.query(
    "UPDATE requests SET status='approved',updated_at=NOW() WHERE request_code=$1",
    [code]
  );

  await sendMessage(
    adminId,
    `✅ درخواست ${code} تأیید شد.`
  );

  /*
   * یک پیام کامل و واحد برای پرداخت ارسال می‌شود.
   */
  if (req.payment_type === "loan") {
    await sendMessage(req.user_id, diamondPaymentText(req));
  } else {
    const total = Number(payload.calculation?.finalPrice ?? payload.totalCost ?? 0);
    await sendMessage(req.user_id, `✅ درخواست شما تأیید شد.\n\n🆔 شماره درخواست: ${code}\n💰 هزینه کل سفر: ${money(total)} تومان\n💵 مبلغ قابل پرداخت: ${money(total)} تومان\n\n${paymentInfoText()}\n\n⚠️ پس از پرداخت، تصویر یا فایل رسید واریزی را همین‌جا ارسال کنید.\nبعد از تأیید رسید، در صورت نیاز لیست مسافران یا همراهان از شما دریافت می‌شود.`);
  }

  await saveSession(
    req.user_id,
    "PAYMENT_RECEIPT",
    {
      requestCode: code,
      tourType: payload.tourType || req.tour_type || "",
      paymentType: req.payment_type,
      applicantName: req.applicant_name,
      phone: req.phone
    }
  );

}

/*
 * =========================================================
 * بازخورد بعد از سفر
 * =========================================================
 */

const FEEDBACK_QUESTIONS = [
  "⭐ میزان رضایت کلی شما از سفر",
  "🏨 کیفیت هتل",
  "👨‍💼 رفتار کارکنان هتل",
  "🛏️ وضعیت اتاق و نظافت",
  "🍽️ کیفیت غذا و مهمان‌نوازی",
  "📍 موقعیت هتل و دسترسی به حرم",
  "💰 ارزش خدمات نسبت به هزینه",
  "🤝 پشتیبانی و پاسخگویی سفر مشهد توس"
];

async function startFeedback(request) {
  const payload = request.payload || {};
  await saveSession(request.user_id, "FEEDBACK_RATE", {
    requestCode: request.request_code,
    step: 0,
    ratings: {},
    feedbackText: "",
    consent: null,
    tourType: payload.tourType || request.request_type || "",
    applicantName: request.applicant_name || ""
  });

  await pool.query(
    `UPDATE requests SET payload = payload || $2::jsonb, updated_at=NOW() WHERE request_code=$1`,
    [request.request_code, JSON.stringify({ feedbackSentAt: new Date().toISOString() })]
  );

  await sendMessage(
    request.user_id,
    `🌟 سلام ${request.applicant_name || "دوست عزیز"}

سفر شما به مشهد به پایان رسیده است. خوشحال می‌شویم تجربه‌تان را با ما در میان بگذارید.

${FEEDBACK_QUESTIONS[0]}`,
    feedbackRatingKeyboard(0)
  );
}

async function finishFeedback(chatId, session) {
  const d = session.data || {};
  const ratings = d.ratings || {};
  const reqCode = d.requestCode || "";
  const avg = Object.values(ratings).length
    ? (Object.values(ratings).reduce((a,b)=>a+Number(b),0) / Object.values(ratings).length).toFixed(1)
    : "-";

  let admin = `🌟 بازخورد مشتری بعد از سفر\n━━━━━━━━━━━━━━━━━━\n🆔 درخواست: ${reqCode}\n👤 مشتری: ${d.applicantName || ""}\n📊 میانگین امتیاز: ${avg} از ۵\n\n`;
  FEEDBACK_QUESTIONS.forEach((q,i) => {
    admin += `${q}: ${ratings[i] || "-"} ⭐\n`;
  });
  if (d.feedbackText) admin += `\n💬 نظر مشتری:\n${d.feedbackText}\n`;
  admin += `\n📢 اجازه انتشار با نام کوچک: ${d.consent === true ? "✅ بله" : "❌ خیر"}`;

  const adminKeyboard = d.consent === true
    ? { inline_keyboard: [[{ text: "📢 انتشار در کانال", callback_data: `FEEDBACK_PUBLISH:${reqCode}` }]] }
    : undefined;

  await sendMessage(CONFIG.ADMIN_CHAT_ID, admin, adminKeyboard);

  const update = {
    feedback: {
      ratings,
      average: avg,
      text: d.feedbackText || "",
      consent: d.consent === true,
      photoFileId: d.photoFileId || "",
      voiceFileId: d.voiceFileId || "",
      channelPublished: false,
      completedAt: new Date().toISOString()
    }
  };
  await pool.query(
    `UPDATE requests SET payload = payload || $2::jsonb, updated_at=NOW() WHERE request_code=$1`,
    [reqCode, JSON.stringify(update)]
  );

  await clearSession(chatId);
  await sendMessage(chatId, "🙏 از اینکه تجربه سفرتان را با ما در میان گذاشتید صمیمانه سپاسگزاریم.\n\n🌹 نظرات شما به ما کمک می‌کند خدمات سفر مشهد توس را بهتر کنیم.", mainKeyboard());
}

async function runFeedbackScheduler() {
  try {
    const today = todayJalali();
    if (!today) return;
    const todayDay = jalaliToDay(today);
    const r = await pool.query(`
      SELECT * FROM requests
      WHERE status IN ('approved','receipt_received','passenger_received')
        AND COALESCE(payload->>'feedbackSentAt','') = ''
        AND payload->>'returnDate' IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 50
    `);
    for (const req of r.rows) {
      const out = normalizeDate(req.payload?.returnDate);
      if (!out) continue;
      if (jalaliToDay(out) < todayDay) {
        await startFeedback(req);
      }
    }
  } catch (e) {
    console.error("Feedback scheduler error:", e);
  }
}

/*
 * =========================================================
 * رد درخواست
 * =========================================================
 */

async function rejectRequest(
  adminId,
  code
) {
  if (!isAdmin(adminId)) return;

  const r =
    await pool.query(
      "SELECT * FROM requests WHERE request_code=$1",
      [code]
    );

  if (!r.rows.length) {
    await sendMessage(
      adminId,
      "❌ درخواست پیدا نشد."
    );
    return;
  }

  const req = r.rows[0];

  await pool.query(
    "UPDATE requests SET status='rejected',updated_at=NOW() WHERE request_code=$1",
    [code]
  );

  await sendMessage(
    adminId,
    `❌ درخواست ${code} رد شد.`
  );

  await sendMessage(
    req.user_id,
    `❌ درخواست شما تأیید نشد.

🆔 ${code}
☎️ ${CONFIG.CONTACT.phone}`,
    mainKeyboard()
  );
}

/*
 * =========================================================
 * دریافت رسید
 * =========================================================
 */

async function afterReceipt(
  chatId,
  session
) {
  const d =
    session.data || {};

  await pool.query(
    "UPDATE requests SET status='receipt_received',updated_at=NOW() WHERE request_code=$1",
    [d.requestCode]
  );

  if (
    NEED_PASSENGER_LIST.includes(
      d.tourType
    )
  ) {
    await saveSession(
      chatId,
      "PASSENGER_METHOD",
      d
    );

    await sendMessage(
      chatId,
      `✅ رسید پرداخت دریافت شد.

👥 حالا لطفاً روش ارسال اطلاعات ${
        String(d.tourType || "").startsWith("CARAVAN")
          ? "مسافران"
          : "مسافران / همراهان"
      } را انتخاب کنید.

📱 برای استفاده با موبایل، هر کدام از روش‌های زیر را که برایتان راحت‌تر است انتخاب کنید.`,
      {
        keyboard: [
          [{ text: "✍️ ثبت مرحله‌ای مسافران" }],
          [{ text: "📋 ارسال متن چندنفره" }],
          [{ text: "📷 ارسال عکس لیست" }],
          [{ text: "📎 ارسال فایل لیست" }],
          [{ text: "🔙 بازگشت به منوی اصلی" }]
        ],
        resize_keyboard: true
      }
    );
  } else {
    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ رسید پرداخت دریافت شد و درخواست برای ادامه کار ثبت گردید.",
      mainKeyboard()
    );
  }
}

/*
 * =========================================================
 * روش‌های ارسال لیست مسافران
 * =========================================================
 */

function passengerMethodKeyboard() {
  return {
    keyboard: [
      [{ text: "✍️ ثبت مرحله‌ای مسافران" }],
      [{ text: "📋 ارسال متن چندنفره" }],
      [{ text: "📷 ارسال عکس لیست" }],
      [{ text: "📎 ارسال فایل لیست" }],
      [{ text: "🔙 بازگشت به منوی اصلی" }]
    ],
    resize_keyboard: true
  };
}

function passengerInputKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ افزودن مسافر" }, { text: "✅ تکمیل لیست" }],
      [{ text: "🔙 بازگشت به انتخاب روش" }]
    ],
    resize_keyboard: true
  };
}

async function startPassengerStep(chatId, session) {
  const d = session.data || {};
  await saveSession(chatId, "PASSENGER_STEP", {
    ...d,
    passengers: [],
    passengerDraft: {},
    passengerStep: "name"
  });

  await sendMessage(
    chatId,
    `👤 مسافر اول

① نام و نام خانوادگی را وارد کنید.

مثال: علی رضایی`,
    passengerInputKeyboard()
  );
}

async function finishPassengerList(chatId, data) {
  const good = Array.isArray(data.passengers) ? data.passengers : [];

  if (!good.length) {
    await sendMessage(chatId, "❌ هنوز هیچ مسافری ثبت نشده است.");
    return false;
  }

  await sendMessage(
    CONFIG.ADMIN_CHAT_ID,
    `📋 لیست همراهان/مسافران\n🆔 درخواست: ${data.requestCode}\n👤 کاربر: ${data.applicantName || ""}\n📱 ${data.phone || ""}\n\n` +
      good.map((x, i) => `${i + 1}. ${x.name} | ${x.nationalCode} | ${x.birthDate}`).join("\n")
  );

  await pool.query(
    "UPDATE requests SET status='passenger_received',payload=payload || $2::jsonb,updated_at=NOW() WHERE request_code=$1",
    [data.requestCode, JSON.stringify({ passengers: good })]
  );

  await clearSession(chatId);
  await sendMessage(
    chatId,
    "✅ لیست با موفقیت دریافت و برای مدیر ارسال شد.",
    mainKeyboard()
  );
  return true;
}

async function handlePassengerStepText(chatId, text, session) {
  const d = session.data || {};
  const step = d.passengerStep || "name";
  const draft = { ...(d.passengerDraft || {}) };
  const passengers = Array.isArray(d.passengers) ? [...d.passengers] : [];

  if (text === "🔙 بازگشت به انتخاب روش") {
    await saveSession(chatId, "PASSENGER_METHOD", { ...d });
    await sendMessage(chatId, "👥 روش ارسال اطلاعات را انتخاب کنید.", passengerMethodKeyboard());
    return true;
  }

  if (text === "➕ افزودن مسافر") {
    if (step !== "name" || Object.keys(draft).length) {
      await sendMessage(chatId, "ℹ️ ابتدا اطلاعات مسافر فعلی را کامل کنید.");
      return true;
    }
    await sendMessage(chatId, `👤 مسافر ${passengers.length + 1}\n\nنام و نام خانوادگی را وارد کنید.`);
    return true;
  }

  if (text === "✅ تکمیل لیست") {
    if (step !== "name" || Object.keys(draft).length) {
      await sendMessage(chatId, "❌ اطلاعات مسافر فعلی کامل نشده است.");
      return true;
    }
    return finishPassengerList(chatId, d);
  }

  if (step === "name") {
    if (!text.trim()) {
      await sendMessage(chatId, "❌ نام و نام خانوادگی را وارد کنید.");
      return true;
    }
    await saveSession(chatId, "PASSENGER_STEP", { ...d, passengerDraft: { name: text.trim() }, passengerStep: "national" });
    await sendMessage(chatId, "🪪 کد ملی را وارد کنید.");
    return true;
  }

  if (step === "national") {
    const nc = en(text).replace(/\D/g, "");
    if (!validNational(nc)) {
      await sendMessage(chatId, "❌ کد ملی صحیح نیست. لطفاً کد ملی ۱۰ رقمی را وارد کنید.");
      return true;
    }
    await saveSession(chatId, "PASSENGER_STEP", { ...d, passengerDraft: { ...draft, nationalCode: nc }, passengerStep: "birth" });
    await sendMessage(chatId, "🎂 تاریخ تولد را به شکل ۱۳۶۲/۰۶/۱۷ وارد کنید.");
    return true;
  }

  if (step === "birth") {
    const bd = normalizeDate(text);
    if (!bd) {
      await sendMessage(chatId, "❌ تاریخ تولد صحیح نیست. نمونه صحیح: ۱۳۶۲/۰۶/۱۷");
      return true;
    }
    passengers.push({ name: draft.name, nationalCode: draft.nationalCode, birthDate: bd });
    const next = { ...d, passengers, passengerDraft: {}, passengerStep: "name" };
    await saveSession(chatId, "PASSENGER_STEP", next);
    await sendMessage(chatId, `✅ مسافر ${passengers.length} ثبت شد.\n\nبرای ادامه، «➕ افزودن مسافر» را بزنید یا اگر تمام شد «✅ تکمیل لیست» را انتخاب کنید.`, passengerInputKeyboard());
    return true;
  }

  return true;
}

/*
 * =========================================================
 * متن لیست مسافران
 * =========================================================
 */

async function handlePassengerText(
  chatId,
  text,
  session
) {
  if (
    session.state !==
    "PASSENGER_LIST"
  ) {
    return false;
  }

  const lines =
    text
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean);

  if (!lines.length) {
    await sendMessage(
      chatId,
      "❌ لیست خالی است."
    );
    return true;
  }

  const good = [];

  for (const line of lines) {
    const p =
      line
        .split("|")
        .map(x => x.trim());

    if (p.length !== 3) {
      await sendMessage(
        chatId,
        `❌ این خط صحیح نیست:
${line}

فرمت:
نام و نام خانوادگی | کد ملی | ۱۳۶۲/۰۶/۱۷`
      );
      return true;
    }

    const nc =
      en(p[1]).replace(
        /\D/g,
        ""
      );

    const bd =
      normalizeDate(p[2]);

    if (
      !p[0] ||
      !validNational(nc) ||
      !bd
    ) {
      await sendMessage(
        chatId,
        `❌ اطلاعات این خط صحیح نیست:
${line}`
      );
      return true;
    }

    good.push({
      name: p[0],
      nationalCode: nc,
      birthDate: bd
    });
  }

  await sendMessage(
    CONFIG.ADMIN_CHAT_ID,
    `📋 لیست همراهان/مسافران
🆔 درخواست: ${
      session.data.requestCode
    }
👤 کاربر: ${
      session.data.applicantName
    }
📱 ${
      session.data.phone
    }

` +
      good
        .map(
          (x, i) =>
            `${i + 1}. ${x.name} | ${x.nationalCode} | ${x.birthDate}`
        )
        .join("\n")
  );

  await pool.query(
    "UPDATE requests SET status='passenger_received',payload=payload || $2::jsonb,updated_at=NOW() WHERE request_code=$1",
    [
      session.data.requestCode,
      JSON.stringify({
        passengers: good
      })
    ]
  );

  await clearSession(chatId);

  await sendMessage(
    chatId,
    "✅ لیست با موفقیت دریافت و برای مدیر ارسال شد.",
    mainKeyboard()
  );

  return true;
}

/*
 * =========================================================
 * دریافت فایل و تصویر
 * =========================================================
 */

async function handleMedia(
  message,
  session
) {
  const chatId =
    getChatId(message);

  if (session?.state === "FEEDBACK_CONTENT") {
    const d = session.data || {};
    if (message.voice?.file_id) {
      await sendVoice(CONFIG.ADMIN_CHAT_ID, message.voice.file_id, `🎤 پیام صوتی بازخورد\n🆔 درخواست: ${d.requestCode}`);
      await saveSession(chatId, "FEEDBACK_CONSENT", { ...d, voiceFileId: message.voice.file_id });
      await sendMessage(chatId, "📷 اگر عکس یادگاری دارید همین‌جا بفرستید؛ در غیر این صورت «⏭️ بدون عکس» را بزنید.", { keyboard: [[{text:"⏭️ بدون عکس"}]], resize_keyboard:true });
      return true;
    }
    if (message.photo?.length) {
      const photo = message.photo[message.photo.length - 1];
      await sendPhoto(CONFIG.ADMIN_CHAT_ID, photo.file_id, `📷 عکس یادگاری بازخورد\n🆔 درخواست: ${d.requestCode}`);
      await saveSession(chatId, "FEEDBACK_CONSENT", { ...d, photoFileId: photo.file_id });
      await sendMessage(chatId, "📢 آیا اجازه می‌دهید نظر یا عکس شما با نام کوچک در کانال «سفر مشهد توس» منتشر شود؟", { inline_keyboard: [[{text:"✅ بله، با افتخار", callback_data:"FEEDBACK_CONSENT:YES"},{text:"❌ خیر، فقط داخلی", callback_data:"FEEDBACK_CONSENT:NO"}]] });
      return true;
    }
  }

  if (session?.state === "FEEDBACK_CONSENT" && message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    const d = session.data || {};
    await sendPhoto(CONFIG.ADMIN_CHAT_ID, photo.file_id, `📷 عکس یادگاری بازخورد\n🆔 درخواست: ${d.requestCode}`);
    await saveSession(chatId, "FEEDBACK_CONSENT", { ...d, photoFileId: photo.file_id });
    await sendMessage(chatId, "📢 آیا اجازه می‌دهید نظر یا عکس شما با نام کوچک در کانال «سفر مشهد توس» منتشر شود؟", { inline_keyboard: [[{text:"✅ بله، با افتخار", callback_data:"FEEDBACK_CONSENT:YES"},{text:"❌ خیر، فقط داخلی", callback_data:"FEEDBACK_CONSENT:NO"}]] });
    return true;
  }

  /*
   * رسید پرداخت - تصویر
   */
  if (
    message.photo?.length &&
    session?.state ===
      "PAYMENT_RECEIPT"
  ) {
    const photo =
      message.photo[
        message.photo.length - 1
      ];

    await sendPhoto(
      CONFIG.ADMIN_CHAT_ID,
      photo.file_id,
      `🧾 رسید پرداخت
🆔 درخواست: ${
        session.data.requestCode
      }
👤 ${
        session.data.applicantName
      }
📱 ${
        session.data.phone
      }`
    );

    await afterReceipt(
      chatId,
      session
    );

    return true;
  }

  /*
   * رسید پرداخت - فایل
   */
  if (
    message.document?.file_id &&
    session?.state ===
      "PAYMENT_RECEIPT"
  ) {
    await sendDocument(
      CONFIG.ADMIN_CHAT_ID,
      message.document.file_id,
      `🧾 رسید پرداخت
🆔 درخواست: ${
        session.data.requestCode
      }
👤 ${
        session.data.applicantName
      }`
    );

    await afterReceipt(
      chatId,
      session
    );

    return true;
  }

  /*
   * لیست مسافران - تصویر
   */
  if (
    message.photo?.length &&
    session?.state ===
      "PASSENGER_LIST"
  ) {
    const p =
      message.photo[
        message.photo.length - 1
      ];

    await sendPhoto(
      CONFIG.ADMIN_CHAT_ID,
      p.file_id,
      `📋 تصویر لیست مسافران
🆔 درخواست: ${
        session.data.requestCode
      }`
    );

    await pool.query(
      "UPDATE requests SET status='passenger_received',updated_at=NOW() WHERE request_code=$1",
      [
        session.data.requestCode
      ]
    );

    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ تصویر لیست دریافت و برای مدیر ارسال شد.",
      mainKeyboard()
    );

    return true;
  }

  /*
   * لیست مسافران - فایل
   */
  if (
    message.document?.file_id &&
    session?.state ===
      "PASSENGER_LIST"
  ) {
    await sendDocument(
      CONFIG.ADMIN_CHAT_ID,
      message.document.file_id,
      `📋 فایل لیست مسافران
🆔 درخواست: ${
        session.data.requestCode
      }`
    );

    await pool.query(
      "UPDATE requests SET status='passenger_received',updated_at=NOW() WHERE request_code=$1",
      [
        session.data.requestCode
      ]
    );

    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ فایل لیست دریافت و برای مدیر ارسال شد.",
      mainKeyboard()
    );

    return true;
  }

  return false;
}

/*
 * =========================================================
 * منوی محاسبات مدیر
 * =========================================================
 */

function managerCalcMenu(
  canSendAmount = false,
  requestCode = ""
) {
  const rows = [
    [
      {
        text: "🚆 محاسبه تور ریلی",
        callback_data:
          "ADMIN_RAIL_CALC"
      }
    ],
    [
      {
        text: "✈️ محاسبه دستی تور هوایی",
        callback_data:
          "ADMIN_MANUAL_AIR"
      }
    ],
    [
      {
        text: "🚌 محاسبه دستی تور اتوبوسی",
        callback_data:
          "ADMIN_MANUAL_BUS"
      }
    ],
    [
      {
        text: "🚍 محاسبه دستی کاروان اتوبوسی",
        callback_data:
          "ADMIN_MANUAL_CARAVAN_BUS"
      }
    ],
    [
      {
        text: "🚆 محاسبه دستی کاروان ریلی",
        callback_data:
          "ADMIN_MANUAL_CARAVAN_RAIL"
      }
    ]
  ];

  if (
    canSendAmount &&
    requestCode
  ) {
    rows.push([
      {
        text: "📨 ارسال مبلغ برای مشتری",
        callback_data:
          `SEND_CALC_AMOUNT:${requestCode}`
      }
    ]);
  }

  if (requestCode) {
    rows.push([
      {
        text: "💬 بازخورد مشتری",
        callback_data: `TEST_FEEDBACK:${requestCode}`
      }
    ]);
  }

  rows.push([
    {
      text: "💎 مدیریت وام الماس",
      callback_data: "ADMIN_DIAMOND_STATUS"
    }
  ]);

  rows.push([
    {
      text: "🔙 خروج",
      callback_data:
        "ADMIN_CALC_EXIT"
    }
  ]);

  return {
    inline_keyboard: rows
  };
}

/*
 * =========================================================
 * شروع محاسبه ریلی
 * =========================================================
 */

async function startRailCalc(
  chatId,
  prefill = {}
) {
  await saveSession(
    chatId,
    "RAIL_ROUTE",
    prefill
  );

  await sendMessage(
    chatId,
    "🧮 محاسبه داخلی تور ریلی\n\nابتدا مسیر را انتخاب کنید:",
    {
      inline_keyboard: [
        [
          {
            text: "🚆 اهواز ↔ مشهد",
            callback_data:
              "RAIL_ROUTE:AHVAZ"
          }
        ],
        [
          {
            text: "🚆 شیراز ↔ مشهد",
            callback_data:
              "RAIL_ROUTE:SHIRAZ"
          }
        ],
        [
          {
            text: "🔙 خروج",
            callback_data:
              "ADMIN_CALC_EXIT"
          }
        ]
      ]
    }
  );
}

/*
 * =========================================================
 * متن محاسبه ریلی
 * =========================================================
 */

async function railText(
  chatId,
  text,
  s
) {
  const d =
    s.data || {};

  const v =
    Number(
      en(text).replace(
        /\D/g,
        ""
      )
    );

  if (
    s.state ===
    "RAIL_ADULTS"
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
      "RAIL_CHILDREN",
      {
        ...d,
        adults: v
      }
    );

    await sendMessage(
      chatId,
      "👶 تعداد کودک ۲ تا ۱۲ سال را وارد کنید.\nاگر کودک ندارید ۰ بفرستید:"
    );

    return true;
  }

  if (
    s.state ===
    "RAIL_CHILDREN"
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
      "RAIL_NIGHTS",
      {
        ...d,
        children: v
      }
    );

    await sendMessage(
      chatId,
      "🌙 تعداد شب اقامت را وارد کنید:"
    );

    return true;
  }

  if (
    s.state ===
    "RAIL_NIGHTS"
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
      "RAIL_HOTEL",
      {
        ...d,
        nights: v
      }
    );

    await sendMessage(
      chatId,
      "🏨 قیمت هتل هر نفر / هر شب را وارد کنید.\nمثال: ۲۲۰۰۰۰۰"
    );

    return true;
  }

  if (
    s.state ===
    "RAIL_HOTEL"
  ) {
    if (v <= 0) {
      await sendMessage(
        chatId,
        "❌ قیمت هتل صحیح نیست."
      );
      return true;
    }

    await saveSession(
      chatId,
      "RAIL_PAYMENT",
      {
        ...d,
        hotelPricePerPersonPerNight:
          v
      }
    );

    await sendMessage(
      chatId,
      "💳 نوع محاسبه را انتخاب کنید:",
      {
        inline_keyboard: [
          [
            {
              text: "💵 نقدی",
              callback_data:
                "RAIL_PAYMENT_CASH"
            },
            {
              text: "💎 طرح الماس",
              callback_data:
                "RAIL_PAYMENT_LOAN"
            }
          ],
          [
            {
              text: "🔙 خروج",
              callback_data:
                "ADMIN_CALC_EXIT"
            }
          ]
        ]
      }
    );

    return true;
  }

  return false;
}

/*
 * =========================================================
 * محاسبات دستی
 * =========================================================
 */

async function showDiamondRatioSelection(chatId, data, result) {
  const requestCode = data.requestCode || "";
  await saveSession(chatId, "DIAMOND_RATIO_SELECT", {
    ...data,
    pendingDiamondCalculation: result
  });

  await sendMessage(
    chatId,
    `💎 انتخاب سهم طرح الماس

💰 مبلغ کل سفر: ${money(result.finalPrice)} تومان

لطفاً درصد تأمین طرح را انتخاب کنید.
مبلغ وام به پله‌های ۵ میلیون تومانی رو به بالا رُند می‌شود و مبلغ نقدی از مبلغ کل محاسبه می‌شود.`,
    diamondRatioKeyboard(requestCode)
  );
}

async function finalizeDiamondCalculation(chatId, loanPercent, requestCodeFromCallback = "") {
  const s = await getSession(chatId);
  if (!s || s.state !== "DIAMOND_RATIO_SELECT") return;
  const d = s.data || {};
  const base = d.pendingDiamondCalculation;
  if (!base) {
    await sendMessage(chatId, "❌ محاسبه موقت طرح الماس پیدا نشد.");
    return;
  }

  const split = PRICING.applyDiamondSplit(base.finalPrice, Number(loanPercent));
  const result = {
    ...base,
    finalPrice: split.total,
    loanPercent: split.loanPercent,
    cashPercent: split.cashPercent,
    loanAmount: split.loanAmount,
    customerCash: split.customerCash,
    cashPercentActual: split.cashPercentActual,
    loanPercentActual: split.loanPercentActual
  };

  if (d.requestCode) {
    await pool.query(
      `UPDATE requests SET payload = payload || $2::jsonb, updated_at=NOW() WHERE request_code=$1`,
      [d.requestCode, JSON.stringify({ calculation: result, totalCost: result.finalPrice, calculatedAt: new Date().toISOString() })]
    );
  }

  await saveSession(chatId, "ADMIN_CALC", { ...d, calculation: result });

  let out = d.type === "RAIL"
    ? PRICING.formatRailCalculation(result)
    : PRICING.formatManualCalculation(result);

  if (d.requestCode) {
    out += `\n\n🆔 درخواست: ${d.requestCode}\n👤 متقاضی: ${d.applicantName || ""}\n📱 تلفن: ${d.phone || ""}`;
  }

  await sendMessage(chatId, out, managerCalcMenu(Boolean(d.requestCode), d.requestCode || ""));
}

async function finishAirCalc(
  chatId,
  data,
  paymentType,
  profitPerPerson
) {
  const d = data || {};

  const result =
    PRICING.calculateManualTour({
      ...d,
      type: "AIR",
      paymentType,
      manualProfit: profitPerPerson,
      childPercent: 100,
      childHotelPercent: 50
    });

  if (paymentType === "loan") {
    await showDiamondRatioSelection(chatId, d, result);
    return;
  }

  if (d.requestCode) {
    await pool.query(
      `UPDATE requests
       SET payload = payload || $2::jsonb,
           updated_at = NOW()
       WHERE request_code=$1`,
      [
        d.requestCode,
        JSON.stringify({
          calculation: result,
          totalCost: result.finalPrice,
          calculatedAt: new Date().toISOString()
        })
      ]
    );
  }

  await saveSession(
    chatId,
    "ADMIN_CALC",
    {
      requestCode: d.requestCode || "",
      calculation: result
    }
  );

  let out =
    PRICING.formatManualCalculation(result);

  if (d.requestCode) {
    out += `\n\n🆔 درخواست: ${d.requestCode}\n👤 متقاضی: ${d.applicantName || ""}\n📱 تلفن: ${d.phone || ""}`;
  }

  await sendMessage(
    chatId,
    out,
    managerCalcMenu(
      Boolean(d.requestCode),
      d.requestCode || ""
    )
  );
}

async function manualText(
  chatId,
  text,
  s
) {
  const d =
    s.data || {};

  const v =
    Number(
      en(text).replace(
        /\D/g,
        ""
      )
    );

  /*
   * =======================================================
   * محاسبه اختصاصی تور هوایی
   * قیمت پرواز بزرگسال و کودک جداگانه دستی وارد می‌شود.
   * =======================================================
   */

  if (
    d.type === "AIR" &&
    s.state === "MAN_ADULTS" &&
    d.requestCode
  ) {
    await saveSession(chatId, "MAN_AIR_TICKET_ADULT_OUT", d);
    await sendMessage(
      chatId,
      `✈️ محاسبه تور هوایی\n\n🆔 درخواست: ${d.requestCode}\n👨 بزرگسال: ${d.adults} نفر\n👶 کودک: ${d.children} نفر\n🌙 تعداد شب: ${d.nights}\n\n✈️ مبلغ بلیت رفت هر بزرگسال را وارد کنید:`
    );
    return true;
  }

  if (d.type === "AIR" && s.state === "MAN_AIR_TICKET_ADULT_OUT") {
    if (v <= 0) {
      await sendMessage(chatId, "❌ مبلغ بلیت رفت بزرگسال صحیح نیست.");
      return true;
    }
    await saveSession(chatId, "MAN_AIR_TICKET_ADULT_BACK", {...d, ticketAdultOutbound: v});
    await sendMessage(chatId, "✈️ مبلغ بلیت برگشت هر بزرگسال را وارد کنید:");
    return true;
  }

  if (d.type === "AIR" && s.state === "MAN_AIR_TICKET_ADULT_BACK") {
    if (v <= 0) {
      await sendMessage(chatId, "❌ مبلغ بلیت برگشت بزرگسال صحیح نیست.");
      return true;
    }
    const next = {...d, ticketAdultReturn: v};
    if (Number(d.children || 0) > 0) {
      await saveSession(chatId, "MAN_AIR_TICKET_CHILD_OUT", next);
      await sendMessage(chatId, "👶 مبلغ بلیت رفت هر کودک ۳ تا ۵ سال را وارد کنید:");
    } else {
      await saveSession(chatId, "MAN_AIR_PAYMENT", {...next, ticketChildOutbound: 0, ticketChildReturn: 0});
      await sendMessage(chatId, "🏨 قیمت هتل هر بزرگسال / هر شب را وارد کنید:\n\n👶 کودک ۳ تا ۵ سال به‌صورت خودکار نیم‌بهای بزرگسال محاسبه می‌شود.");
    }
    return true;
  }

  if (d.type === "AIR" && s.state === "MAN_AIR_TICKET_CHILD_OUT") {
    if (v < 0) {
      await sendMessage(chatId, "❌ مبلغ بلیت رفت کودک صحیح نیست.");
      return true;
    }
    await saveSession(chatId, "MAN_AIR_TICKET_CHILD_BACK", {...d, ticketChildOutbound: v});
    await sendMessage(chatId, "👶 مبلغ بلیت برگشت هر کودک ۳ تا ۵ سال را وارد کنید:");
    return true;
  }

  if (d.type === "AIR" && s.state === "MAN_AIR_TICKET_CHILD_BACK") {
    if (v < 0) {
      await sendMessage(chatId, "❌ مبلغ بلیت برگشت کودک صحیح نیست.");
      return true;
    }
    await saveSession(chatId, "MAN_AIR_PAYMENT", {...d, ticketChildReturn: v});
    await sendMessage(chatId, "🏨 قیمت هتل هر بزرگسال / هر شب را وارد کنید:\n\n👶 کودک ۳ تا ۵ سال به‌صورت خودکار نیم‌بهای بزرگسال محاسبه می‌شود.");
    return true;
  }

  if (d.type === "AIR" && s.state === "MAN_AIR_PAYMENT") {
    if (v <= 0) {
      await sendMessage(chatId, "❌ قیمت هتل صحیح نیست.");
      return true;
    }
    const nextData = {...d, hotelAdult: v};

    if (d.requestCode) {
      if (d.paymentType === "loan") {
        await saveSession(chatId, "MAN_AIR_LOAN_PROFIT", nextData);
        await sendMessage(chatId, "💎 سود هر نفر برای طرح الماس را وارد کنید.\n\nمبلغ باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد:");
      } else {
        await finishAirCalc(chatId, nextData, "cash", 3500000);
      }
    } else {
      await saveSession(chatId, "MAN_AIR_PAYMENT_SELECT", nextData);
      await sendMessage(chatId, "💳 نوع پرداخت را انتخاب کنید:", {
        inline_keyboard: [
          [{text: "💵 نقدی", callback_data: "AIR_PAYMENT_CASH"}],
          [{text: "💎 طرح الماس", callback_data: "AIR_PAYMENT_LOAN"}],
          [{text: "🔙 خروج", callback_data: "ADMIN_CALC_EXIT"}]
        ]
      });
    }
    return true;
  }

  if (d.type === "AIR" && s.state === "MAN_AIR_LOAN_PROFIT") {
    if (v < 5000000 || v > 6000000) {
      await sendMessage(chatId, "❌ سود طرح الماس باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد.");
      return true;
    }
    await finishAirCalc(chatId, d, "loan", v);
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
      "👶 تعداد کودک را وارد کنید:"
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
      "🌙 تعداد شب را وارد کنید:"
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

    const nextState =
      d.type === "AIR"
        ? "MAN_AIR_TICKET_ADULT_OUT"
        : d.type === "BUS"
          ? "MAN_BUS_HOTEL"
          : "MAN_TICKET";

    await saveSession(
      chatId,
      nextState,
      {
        ...d,
        nights: v
      }
    );

    await sendMessage(
      chatId,
      d.type === "AIR"
        ? "✈️ مبلغ بلیت رفت هر بزرگسال را وارد کنید:"
        : d.type === "BUS"
          ? "🏨 قیمت هتل هر بزرگسال / هر شب را وارد کنید:"
          : "🎫 هزینه بلیت/سفر هر بزرگسال را وارد کنید:"
    );

    return true;
  }

  /* محاسبه اتوبوسی: هتل */
  if (d.type === "BUS" && s.state === "MAN_BUS_HOTEL") {
    if (v <= 0) {
      await sendMessage(chatId, "❌ قیمت هتل صحیح نیست.");
      return true;
    }

    const nextData = {
      ...d,
      hotelAdult: v,
      ticketAdult: 4000000,
      childPercent: 100,
      childHotelPercent: 50
    };

    // اگر درخواست از طرف مشتری ثبت شده باشد، نوع پرداخت از خود درخواست می‌آید.
    if (d.requestCode) {
      if (d.paymentType === "loan") {
        await saveSession(chatId, "MAN_BUS_LOAN_PROFIT", nextData);
        await sendMessage(
          chatId,
          "💎 سود هر نفر برای طرح الماس را وارد کنید.\n\nمبلغ باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد:"
        );
      } else {
        await saveSession(chatId, "MAN_BUS_PROFIT", nextData);
        await sendMessage(
          chatId,
          "💵 سود هر نفر برای محاسبه نقدی را وارد کنید:"
        );
      }
    } else {
      await saveSession(chatId, "MAN_BUS_PAYMENT_SELECT", nextData);
      await sendMessage(chatId, "💳 نوع پرداخت را انتخاب کنید:", {
        inline_keyboard: [
          [{text: "💵 نقدی", callback_data: "BUS_PAYMENT_CASH"}],
          [{text: "💎 طرح الماس", callback_data: "BUS_PAYMENT_LOAN"}],
          [{text: "🔙 خروج", callback_data: "ADMIN_CALC_EXIT"}]
        ]
      });
    }
    return true;
  }

  /* محاسبه اتوبوسی: سود نقدی */
  if (d.type === "BUS" && s.state === "MAN_BUS_PROFIT") {
    if (v < 0) {
      await sendMessage(chatId, "❌ سود صحیح نیست.");
      return true;
    }

    const r = PRICING.calculateManualTour({
      ...d,
      ticketAdult: 4000000,
      childPercent: 100,
      childHotelPercent: 50,
      manualProfit: v,
      paymentType: "cash"
    });

    if (d.requestCode) {
      await pool.query(
        `UPDATE requests
         SET payload = payload || $2::jsonb,
             updated_at = NOW()
         WHERE request_code=$1`,
        [
          d.requestCode,
          JSON.stringify({
            calculation: r,
            totalCost: Number(r.finalPrice ?? r.finalCost ?? r.totalCost ?? 0),
            calculatedAt: new Date().toISOString()
          })
        ]
      );
    }

    await saveSession(chatId, "ADMIN_CALC", {
      ...d,
      calculation: r
    });

    await sendMessage(
      chatId,
      "🚌 نتیجه محاسبه تور اتوبوسی\n💵 نوع پرداخت: نقدی\n\n" + PRICING.formatManualCalculation(r),
      managerCalcMenu(true, d.requestCode || "")
    );
    return true;
  }

  /* محاسبه اتوبوسی: سود طرح الماس */
  if (d.type === "BUS" && s.state === "MAN_BUS_LOAN_PROFIT") {
    if (v < 5000000 || v > 6000000) {
      await sendMessage(chatId, "❌ سود طرح الماس باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد.");
      return true;
    }

    const r = PRICING.calculateManualTour({
      ...d,
      ticketAdult: 4000000,
      childPercent: 100,
      childHotelPercent: 50,
      manualProfit: v,
      paymentType: "loan"
    });

    await showDiamondRatioSelection(chatId, d, r);
    return true;

    if (d.requestCode) {
      await pool.query(
        `UPDATE requests
         SET payload = payload || $2::jsonb,
             updated_at = NOW()
         WHERE request_code=$1`,
        [
          d.requestCode,
          JSON.stringify({
            calculation: r,
            totalCost: Number(r.finalPrice ?? r.finalCost ?? r.totalCost ?? 0),
            calculatedAt: new Date().toISOString()
          })
        ]
      );
    }

    await saveSession(chatId, "ADMIN_CALC", {
      ...d,
      paymentType: "loan",
      calculation: r
    });

    await sendMessage(
      chatId,
      "🚌 نتیجه محاسبه تور اتوبوسی\n💎 نوع پرداخت: طرح الماس\n\n" + PRICING.formatManualCalculation(r),
      managerCalcMenu(true, d.requestCode || "")
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
      "🏨 قیمت هتل هر بزرگسال/شب را وارد کنید:"
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
      "📈 سود هر نفر را وارد کنید:"
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
    `🏨 محاسبه رزرو فقط هتل

🆔 درخواست: ${
      prefill.requestCode ||
      "محاسبه دستی"
    }

👨 بزرگسال: ${adults}
👶 کودک: ${children}
🌙 تعداد شب: ${nights}

💰 قیمت هتل هر نفر / هر شب را وارد کنید:
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

  const baseResult = {
    type: "HOTEL",
    hotelPricePerPersonPerNight: price,
    adults,
    children,
    totalPassengers: adults + children,
    nights,
    hotelAdult: price,
    childHotel: price * 0.5,
    adultHotel,
    childHotelTotal: childHotel,
    ticketAdult: 0,
    childTicket: 0,
    busRental: 0,
    netPurchaseTotal: finalCost,
    profitPerPerson: 0,
    totalProfit: 0,
    finalCost,
    finalPrice: finalCost,
    totalCost: finalCost
  };

  // برای هتل نیز مانند تورهای ریلی، هوایی و اتوبوسی،
  // درصد طرح الماس توسط مدیر انتخاب می‌شود.
  if (d.paymentType === "loan") {
    await showDiamondRatioSelection(chatId, d, baseResult);
    return true;
  }

  const result = baseResult;

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
    `🏨 محاسبه رزرو فقط هتل
━━━━━━━━━━━━━━━━━━
👨 بزرگسال: ${adults}
👶 کودک: ${children}
🌙 تعداد شب: ${nights}

💰 قیمت هتل هر نفر / هر شب:
${money(price)} تومان

👨 هزینه بزرگسال:
${money(adultHotel)} تومان

👶 هزینه کودک:
${money(childHotel)} تومان

━━━━━━━━━━━━━━━━━━
💰 مبلغ نهایی:
${money(finalCost)} تومان
`;

  if (d.paymentType === "loan") {
    out += `
💎 طرح الماس

💳 سهم نقدی طبق درصد انتخابی مدیر:
${money(result.customerCash)} تومان
`;
  }

  if (d.requestCode) {
    out += `
━━━━━━━━━━━━━━━━━━
🆔 درخواست: ${
      d.requestCode
    }
👤 متقاضی: ${
      d.applicantName || ""
    }
📱 تلفن: ${
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
      "🌿 السلام علیک یا علی‌بن‌موسی‌الرضا (ع) 🌿\n\nبه ربات رسمی سفر مشهد توس خوش آمدید.\n\n🕌 همراه شما برای برنامه‌ریزی سفر زیارتی به مشهد مقدس\n\nاز منوی زیر می‌توانید خدمات موردنظر را انتخاب کنید:\n🏨 رزرو هتل و اقامت\n🚌 تورهای هوایی، ریلی و اتوبوسی\n💎 آشنایی با طرح الماس شهر بهشت\n🧳 سایر خدمات گردشگری\n\n📞 برای راهنمایی بیشتر، از بخش «تماس با ما» استفاده کنید.\n\n✨ شهر بهشت؛ سفر هوشمندانه به مشهد مقدس",
      mainKeyboard()
    );

    return;
  }

  /*
   * تورهای مشهد
   */
  if (
    text ===
    "🚌 تورهای مشهد"
  ) {
    await saveSession(
      chatId,
      "TOUR_MENU",
      {}
    );

    await sendMessage(
      chatId,
      "🚌 تورهای مشهد\n\nنوع سفر را انتخاب کنید:",
      tourMenu()
    );

    return;
  }

  /*
   * رزرو هتل قدیمی
   */
  if (
    text ===
    "🏨 رزرو هتل"
  ) {
    await sendMessage(
      chatId,
      "🏨 برای رزرو هتل، از مسیر «🚌 تورهای مشهد» گزینه «🏨 فقط هتل» را انتخاب کنید.",
      mainKeyboard()
    );

    return;
  }

  /*
   * پیگیری درخواست مشتری
   */
  if (text === "📋 پیگیری درخواست") {
    await saveSession(chatId, "TRACK_REQUEST_CODE", {});
    await sendMessage(
      chatId,
      `📋 پیگیری درخواست

لطفاً کد درخواست خود را وارد کنید.

مثال: SMT-123456

🔒 فقط وضعیت درخواست‌های ثبت‌شده با حساب خودتان نمایش داده می‌شود.

برای لغو، /start را بفرستید.`,
      mainKeyboard()
    );
    return;
  }

  /*
   * طرح الماس
   */
  if (
    text ===
    "💎 طرح الماس شهر بهشت"
  ) {
    await sendDiamondPlan(
      chatId
    );
    return;
  }

  /*
   * خدمات
   */
  if (
    text ===
    "🧳 خدمات گردشگری"
  ) {
    await sendMessage(
      chatId,
      "🧳 خدمات گردشگری\n\n✈️ تورهای هوایی\n🚆 تورهای ریلی\n🚌 تورهای اتوبوسی\n🚍 کاروان‌های زیارتی\n🏨 فقط هتل\n\n☎️ " +
        CONFIG.CONTACT.phone,
      mainKeyboard()
    );

    return;
  }

  /*
   * تماس
   */
  if (
    text ===
    "📞 تماس با ما"
  ) {
    await sendMessage(
      chatId,
      `📞 تماس با ما

👤 ${CONFIG.CONTACT.name}
☎️ ${CONFIG.CONTACT.phone}
${CONFIG.WEBSITE_URL}`,
      mainKeyboard()
    );

    return;
  }

  /*
   * کانال
   */
  if (
    text ===
    "📢 کانال"
  ) {
    await sendMessage(
      chatId,
      `📢 کانال سفر مشهد توس

${CONFIG.CHANNEL_URL}`,
      mainKeyboard()
    );

    return;
  }

  /*
   * محاسبات مدیر
   */
  if (
    text ===
      "🧮 محاسبات مدیر" &&
    isAdmin(chatId)
  ) {
    await saveSession(
      chatId,
      "ADMIN_CALC",
      {}
    );

    await sendMessage(
      chatId,
      "🧮 محاسبات مدیر\n\nنوع محاسبه را انتخاب کنید:",
      managerCalcMenu()
    );

    return;
  }

  /*
   * دستور محاسبات مدیر
   * /railcalc برای نمایش همه انواع محاسبه
   */
  if (
    text === "/railcalc" &&
    isAdmin(chatId)
  ) {
    await saveSession(
      chatId,
      "ADMIN_CALC",
      {}
    );

    await sendMessage(
      chatId,
      "🧮 محاسبات مدیر\n\nنوع محاسبه را انتخاب کنید:",
      managerCalcMenu()
    );

    return;
  }

  session =
    await getSession(chatId);

  /*
   * دریافت کد و نمایش وضعیت درخواست خود مشتری
   */
  if (session?.state === "TRACK_REQUEST_CODE" && text) {
    const code = text.trim().toUpperCase().replace(/\s+/g, "");
    if (code === "/START") {
      await clearSession(chatId);
      await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
      return;
    }

    const tracked = await pool.query(
      `SELECT request_code, applicant_name, request_type, payment_type, status, payload, created_at, updated_at
       FROM requests
       WHERE request_code=$1 AND user_id=$2
       LIMIT 1`,
      [code, String(chatId)]
    );

    if (!tracked.rows.length) {
      await sendMessage(
        chatId,
        `❌ درخواستی با این کد برای حساب شما پیدا نشد.

کد را بررسی کنید و دوباره بفرستید، یا برای راهنمایی با مدیر تماس بگیرید.
📞 ۰۹۱۷۷۷۰۰۹۶۱

برای بازگشت به منوی اصلی /start را بفرستید.`
      );
      return;
    }

    const req = tracked.rows[0];
    const payload = req.payload || {};
    const statusLabels = {
      pending: "⏳ در انتظار بررسی و محاسبه مدیر",
      approved: "✅ درخواست تأیید شده؛ مراحل پرداخت را طبق پیام مدیر انجام دهید",
      receipt_received: "🧾 رسید پرداخت دریافت شده؛ در انتظار بررسی/ادامه مراحل",
      passenger_received: "👥 اطلاعات مسافران دریافت شده",
      rejected: "❌ درخواست رد شده؛ برای توضیحات با مدیر تماس بگیرید"
    };
    const statusText = statusLabels[req.status] || "🔄 در حال پیگیری توسط مجموعه";
    const type = payload.tourType || payload.type || req.request_type || "ثبت درخواست سفر";
    const payment = req.payment_type === "LOAN" || req.payment_type === "loan"
      ? "طرح الماس / اعتباری"
      : req.payment_type === "CASH" || req.payment_type === "cash"
      ? "نقدی"
      : "طبق توافق با مدیر";
    const dateText = req.created_at
      ? new Date(req.created_at).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })
      : "ثبت شده";

    await clearSession(chatId);
    await sendMessage(
      chatId,
      `📋 وضعیت درخواست شما

🆔 کد درخواست: ${req.request_code}
👤 نام متقاضی: ${req.applicant_name || "ثبت‌شده در فرم"}
🧳 نوع درخواست: ${type}
💳 روش پرداخت: ${payment}
📅 تاریخ ثبت: ${dateText}

📌 وضعیت فعلی:
${statusText}

☎️ برای راهنمایی بیشتر: ۰۹۱۷۷۷۰۰۹۶۱`,
      mainKeyboard()
    );
    return;
  }

  /*
   * بازخورد متنی / مرحله‌ای
   */
  if (session?.state === "FEEDBACK_CONTENT" && text) {
    if (text === "⏭️ بدون متن") {
      await saveSession(chatId, "FEEDBACK_CONSENT", { ...session.data });
      await sendMessage(chatId, "📢 آیا اجازه می‌دهید نظر یا عکس شما با نام کوچک در کانال «سفر مشهد توس» منتشر شود؟", { inline_keyboard: [[{text:"✅ بله، با افتخار", callback_data:"FEEDBACK_CONSENT:YES"},{text:"❌ خیر، فقط داخلی", callback_data:"FEEDBACK_CONSENT:NO"}]] });
      return;
    }
    await saveSession(chatId, "FEEDBACK_CONTENT", { ...session.data, feedbackText: text.trim() });
    await sendMessage(chatId, "📷 اگر عکس یادگاری دارید همین‌جا بفرستید؛ یا اگر ندارید «⏭️ بدون عکس» را بزنید.", { keyboard: [[{text:"⏭️ بدون عکس"}]], resize_keyboard:true });
    return;
  }

  if (session?.state === "FEEDBACK_CONSENT" && text) {
    if (text === "⏭️ بدون عکس") {
      await sendMessage(chatId, "📢 آیا اجازه می‌دهید نظر یا عکس شما با نام کوچک در کانال «سفر مشهد توس» منتشر شود؟", { inline_keyboard: [[{text:"✅ بله، با افتخار", callback_data:"FEEDBACK_CONSENT:YES"},{text:"❌ خیر، فقط داخلی", callback_data:"FEEDBACK_CONSENT:NO"}]] });
    }
    return true;
  }

  /*
   * انتخاب روش ارسال لیست مسافران
   */
  if (session?.state === "PASSENGER_METHOD" && text) {
    if (text === "🔙 بازگشت به منوی اصلی") {
      await clearSession(chatId);
      await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
      return;
    }

    if (text === "✍️ ثبت مرحله‌ای مسافران") {
      await startPassengerStep(chatId, session);
      return;
    }

    if (text === "📋 ارسال متن چندنفره") {
      await saveSession(chatId, "PASSENGER_LIST", session.data || {});
      await sendMessage(
        chatId,
        `📋 لطفاً اطلاعات همه مسافران را در چند خط ارسال کنید.\n\nفرمت هر خط:
نام و نام خانوادگی | کد ملی | تاریخ تولد\n\nمثال:
علی رضایی | ۱۲۳۴۵۶۷۸۹۰ | ۱۳۶۲/۰۶/۱۷\nمحمد احمدی | ۰۹۸۷۶۵۴۳۲۱ | ۱۳۷۰/۰۲/۱۰`,
        passengerMethodKeyboard()
      );
      return;
    }

    if (text === "📷 ارسال عکس لیست") {
      await saveSession(chatId, "PASSENGER_LIST", session.data || {});
      await sendMessage(chatId, "📷 لطفاً عکس واضح لیست مسافران را همین‌جا ارسال کنید.", passengerMethodKeyboard());
      return;
    }

    if (text === "📎 ارسال فایل لیست") {
      await saveSession(chatId, "PASSENGER_LIST", session.data || {});
      await sendMessage(chatId, "📎 لطفاً فایل Excel یا PDF لیست مسافران را همین‌جا ارسال کنید.", passengerMethodKeyboard());
      return;
    }

    await sendMessage(chatId, "لطفاً یکی از روش‌های ارسال لیست را انتخاب کنید.", passengerMethodKeyboard());
    return;
  }

  /*
   * ثبت مرحله‌ای مسافران
   */
  if (session?.state === "PASSENGER_STEP" && text) {
    if (await handlePassengerStepText(chatId, text, session)) return;
  }

  /*
   * لیست مسافران
   */
  if (
    session?.state ===
      "PASSENGER_LIST" &&
    text
  ) {
    if (
      await handlePassengerText(
        chatId,
        text,
        session
      )
    ) {
      return;
    }
  }

  /*
   * محاسبات مدیر
   */
  if (
    session &&
    isAdmin(chatId)
  ) {
    /*
     * ریلی
     */
    if (
      await railText(
        chatId,
        text,
        session
      )
    ) {
      return;
    }

    /*
     * فقط هتل
     */
    if (
      await hotelCalcText(
        chatId,
        text,
        session
      )
    ) {
      return;
    }

    /*
     * دستی
     */
    if (
      await manualText(
        chatId,
        text,
        session
      )
    ) {
      return;
    }
  }

  /*
   * فرم مشتری
   */
  if (
    session &&
    text
  ) {
    if (
      await handleTourText(
        chatId,
        text,
        session
      )
    ) {
      return;
    }
  }

  await sendMessage(
    chatId,
    "لطفاً یکی از گزینه‌های منو را انتخاب کنید.",
    mainKeyboard()
  );
}

/*
 * =========================================================
 * Callback ها
 * =========================================================
 */

async function handleCallback(
  cb
) {
  const data =
    cb?.data || "";

  const chatId =
    String(
      cb?.message?.chat?.id || ""
    );

  if (!chatId) return;

  await answerCallback(
    cb.id
  );

  if (data.startsWith("FEEDBACK_RATE:")) {
    const parts = data.split(":");
    const step = Number(parts[1]);
    const rating = Number(parts[2]);
    if (rating < 1 || rating > 5) return;
    const s = await getSession(chatId);
    if (!s || s.state !== "FEEDBACK_RATE" || Number(s.data?.step) !== step) return;
    const d = s.data || {};
    const ratings = { ...(d.ratings || {}), [step]: rating };
    const next = step + 1;
    if (next < FEEDBACK_QUESTIONS.length) {
      await saveSession(chatId, "FEEDBACK_RATE", { ...d, ratings, step: next });
      await sendMessage(chatId, FEEDBACK_QUESTIONS[next], feedbackRatingKeyboard(next));
    } else {
      await saveSession(chatId, "FEEDBACK_CONTENT", { ...d, ratings });
      await sendMessage(chatId, "💬 اگر پیشنهادی، انتقادی یا خاطره‌ای از سفر دارید، برای ما ارسال کنید.\n\n✍️ می‌توانید متن بنویسید یا 🎤 پیام صوتی بفرستید. اگر مایل نیستید، «⏭️ بدون متن» را بزنید.", { keyboard: [[{text:"⏭️ بدون متن"}]], resize_keyboard:true });
    }
    return;
  }

  if (data.startsWith("FEEDBACK_CONSENT:")) {
    const s = await getSession(chatId);
    if (!s) return;
    const yes = data.endsWith(":YES");
    await finishFeedback(chatId, { ...s, data: { ...(s.data || {}), consent: yes } });
    return;
  }

  if (data.startsWith("FEEDBACK_PUBLISH:")) {
    if (!isAdmin(chatId)) return;

    const code = data.substring("FEEDBACK_PUBLISH:".length).trim();
    if (!code) return;

    const rr = await pool.query(
      "SELECT * FROM requests WHERE request_code=$1",
      [code]
    );

    if (!rr.rows.length) {
      await sendMessage(CONFIG.ADMIN_CHAT_ID, "❌ اطلاعات بازخورد این درخواست پیدا نشد.");
      return;
    }

    const req = rr.rows[0];
    const feedback = req.payload?.feedback || {};

    if (feedback.consent !== true) {
      await sendMessage(CONFIG.ADMIN_CHAT_ID, "❌ این مشتری اجازه انتشار در کانال را نداده است.");
      return;
    }

    if (feedback.channelPublished === true) {
      await sendMessage(CONFIG.ADMIN_CHAT_ID, "ℹ️ این بازخورد قبلاً در کانال منتشر شده است.");
      return;
    }

    const firstName = String(req.applicant_name || "زائر عزیز").trim().split(/\s+/)[0] || "زائر عزیز";
    const ratings = feedback.ratings || {};
    const avg = feedback.average || "-";

    let post = `🌟 تجربه زائران «سفر مشهد توس»\n━━━━━━━━━━━━━━━━━━\n👤 ${firstName}\n📊 امتیاز کلی: ${avg} از ۵\n\n`;
    FEEDBACK_QUESTIONS.forEach((q, i) => {
      post += `${q}: ${ratings[i] || "-"} ⭐\n`;
    });
    if (feedback.text) {
      post += `\n💬 نظر زائر:\n${feedback.text}\n`;
    }
    post += `\n🌹 سپاس از اعتماد شما به «سفر مشهد توس»`;

    // کانال از تنظیمات پروژه خوانده می‌شود؛ در config.js مقدار CHANNEL_ID را می‌توان
    // به شناسه کانال یا @username کانال اختصاص داد. اگر CHANNEL_ID تنظیم نشده باشد،
    // از username ثابت کانال فعلی استفاده می‌کنیم.
    const channelId = await getChannelTarget();

    try {
      if (feedback.photoFileId) {
        await sendPhoto(channelId, feedback.photoFileId, post);
      } else {
        await sendMessage(channelId, post);
      }
    } catch (e) {
      console.error("❌ Channel publish error:", e.message);
      await sendMessage(
        CONFIG.ADMIN_CHAT_ID,
        `❌ انتشار در کانال انجام نشد.\n\nخطای بله: ${e.message}\n\n🔧 اگر ربات ادمین کانال است، مقدار CHANNEL_ID کانال را در تنظیمات Render قرار دهید.`
      );
      return;
    }

    await pool.query(
      `UPDATE requests
       SET payload = payload || $2::jsonb, updated_at=NOW()
       WHERE request_code=$1`,
      [code, JSON.stringify({
        feedback: {
          ...feedback,
          channelPublished: true,
          channelPublishedAt: new Date().toISOString()
        }
      })]
    );

    await sendMessage(CONFIG.ADMIN_CHAT_ID, `✅ بازخورد درخواست ${code} با نام «${firstName}» با موفقیت در کانال منتشر شد.`);
    return;
  }

  if (data.startsWith("DIAMOND_RATIO:")) {
    if (!isAdmin(chatId)) return;
    const parts = data.split(":");
    const percent = Number(parts[1]);
    const code = parts.slice(2).join(":") || "";
    if (![50,60,70,80].includes(percent)) return;
    await finalizeDiamondCalculation(chatId, percent, code);
    return;
  }

  if (data.startsWith("TEST_FEEDBACK:")) {
    if (!isAdmin(chatId)) return;
    const code = data.substring("TEST_FEEDBACK:".length);
    const rr = await pool.query("SELECT * FROM requests WHERE request_code=$1", [code]);
    if (!rr.rows.length) { await sendMessage(chatId, "❌ درخواست پیدا نشد."); return; }
    await startFeedback(rr.rows[0]);
    await sendMessage(chatId, `💬 بازخورد مشتری برای درخواست ${code} شروع شد.`);
    return;
  }

  if (data === "DIAMOND_CASH_TOURS") {
    await sendMessage(chatId, "🚌 خدمات سفر نقدی\n\nلطفاً نوع سفر موردنظر را انتخاب کنید:", tourMenu());
    return;
  }

  /*
   * =======================================================
   * تورها
   * =======================================================
   */

  if (
    data.startsWith("TOUR_")
  ) {

    /*
     * فقط هتل - فعال
     */
    if (
      data ===
      "TOUR_HOTEL"
    ) {
      await startTour(
        chatId,
        "HOTEL"
      );
      return;
    }

    /*
     * انتخاب پرداخت
     */
    if (
      data ===
        "TOUR_PAYMENT_CASH" ||
      data ===
        "TOUR_PAYMENT_LOAN"
    ) {
      if (data === "TOUR_PAYMENT_LOAN" && !(await getDiamondEnabled())) {
        await sendMessage(chatId, diamondUnavailableText(), diamondUnavailableKeyboard());
        return;
      }

      const s =
        await getSession(
          chatId
        );

      if (!s) return;

      await askName(
        chatId,
        {
          ...s.data,
          paymentType:
            data ===
            "TOUR_PAYMENT_LOAN"
              ? "loan"
              : "cash"
        }
      );

      return;
    }

    /*
     * ثبت درخواست
     */
    if (
      data ===
      "TOUR_SUBMIT"
    ) {
      await submitRequest(
        chatId
      );
      return;
    }

    /*
     * اصلاح
     */
    if (
      data ===
      "TOUR_EDIT"
    ) {
      const s =
        await getSession(
          chatId
        );

      await startTour(
        chatId,
        s?.data?.tourType ||
          "BUS"
      );

      return;
    }

    /*
     * لغو
     */
    if (
      data ===
      "TOUR_CANCEL"
    ) {
      await clearSession(
        chatId
      );

      await sendMessage(
        chatId,
        "❌ درخواست لغو شد.",
        mainKeyboard()
      );

      return;
    }

    /*
     * بازگشت
     */
    if (
      data ===
      "TOUR_BACK"
    ) {
      await goBack(
        chatId
      );
      return;
    }

    // کاروان‌ها فعلاً فعال نیستند
    if (
      data === "TOUR_CARAVAN_BUS" ||
      data === "TOUR_CARAVAN_RAIL"
    ) {
      await clearSession(chatId);
      await sendMessage(
        chatId,
        "ℹ️ جهت اطلاعات بیشتر درباره کاروان اتوبوسی و کاروان ریلی، لطفاً با مدیر تماس بگیرید.\n\n📞 ۰۹۱۷۷۷۰۰۹۶۱",
        mainKeyboard()
      );
      return;
    }

    const map = {
      TOUR_AIR: "AIR",
      TOUR_RAIL: "RAIL",
      TOUR_BUS: "BUS"
    };

    if (map[data]) {
      await startTour(
        chatId,
        map[data]
      );
      return;
    }
  }

  /*
   * =======================================================
   * صفحه اصلی
   * =======================================================
   */

  if (
    data ===
      "BACK_MAIN" ||
    data ===
      "DIAMOND_BACK"
  ) {
    await clearSession(
      chatId
    );

    await sendMessage(
      chatId,
      "🏠 صفحه اصلی",
      mainKeyboard()
    );

    return;
  }

  /*
   * =======================================================
   * تأیید درخواست
   * =======================================================
   */

  if (
    data.startsWith(
      "APPROVE_REQUEST:"
    )
  ) {
    await approveRequest(
      chatId,
      data.split(":")[1]
    );

    return;
  }

  /*
   * =======================================================
   * رد درخواست
   * =======================================================
   */

  if (
    data.startsWith(
      "REJECT_REQUEST:"
    )
  ) {
    await rejectRequest(
      chatId,
      data.split(":")[1]
    );

    return;
  }

  /*
   * =======================================================
   * ارسال مبلغ برای مشتری
   * =======================================================
   */

  if (
    data.startsWith(
      "SEND_CALC_AMOUNT:"
    ) &&
    isAdmin(chatId)
  ) {
    const code =
      data.substring(
        "SEND_CALC_AMOUNT:"
          .length
      );

    await sendCalculatedAmountToCustomer(
      chatId,
      code
    );

    return;
  }

  /*
   * =======================================================
   * مدیریت وضعیت وام الماس
   * =======================================================
   */

  if (data === "ADMIN_DIAMOND_STATUS" && isAdmin(chatId)) {
    const enabled = await getDiamondEnabled();
    await sendMessage(
      chatId,
      `💎 مدیریت وضعیت وام الماس\n\nوضعیت فعلی: ${enabled ? "🟢 فعال" : "🔴 غیرفعال"}\n\n🔒 این بخش فقط برای مدیر نمایش داده می‌شود.\n\nوقتی وام غیرفعال باشد، مشتریان درخواست جدید وام ثبت نمی‌کنند و به خدمات سفر نقدی هدایت می‌شوند.`,
      {
        inline_keyboard: [
          [
            { text: "🟢 فعال‌سازی وام الماس", callback_data: "ADMIN_DIAMOND_ENABLE" }
          ],
          [
            { text: "🔴 توقف موقت وام الماس", callback_data: "ADMIN_DIAMOND_DISABLE" }
          ],
          [
            { text: "🔄 بروزرسانی وضعیت", callback_data: "ADMIN_DIAMOND_STATUS" }
          ],
          [
            { text: "🔙 بازگشت به محاسبات", callback_data: "ADMIN_CALC_EXIT" }
          ]
        ]
      }
    );
    return;
  }

  if (data === "ADMIN_DIAMOND_ENABLE" && isAdmin(chatId)) {
    await setDiamondEnabled(true);
    await sendMessage(
      chatId,
      "🟢 طرح الماس با موفقیت فعال شد.\n\nاز این لحظه مشتریان می‌توانند درخواست جدید طرح الماس ثبت کنند.",
      { inline_keyboard: [[{ text: "💎 مدیریت وام الماس", callback_data: "ADMIN_DIAMOND_STATUS" }], [{ text: "🔙 محاسبات مدیر", callback_data: "ADMIN_CALC_EXIT" }]] }
    );
    return;
  }

  if (data === "ADMIN_DIAMOND_DISABLE" && isAdmin(chatId)) {
    await setDiamondEnabled(false);
    await sendMessage(
      chatId,
      "🔴 طرح الماس موقتاً غیرفعال شد.\n\nدرخواست‌های جدید وام ثبت نمی‌شوند و مشتریان به خدمات سفر نقدی هدایت خواهند شد.\n\nدرخواست‌های قبلی و اطلاعات آن‌ها حفظ می‌شوند.",
      { inline_keyboard: [[{ text: "💎 مدیریت وام الماس", callback_data: "ADMIN_DIAMOND_STATUS" }], [{ text: "🔙 محاسبات مدیر", callback_data: "ADMIN_CALC_EXIT" }]] }
    );
    return;
  }

  /*
   * =======================================================
   * محاسبه ریلی
   * =======================================================
   */

  if (
    data ===
      "ADMIN_RAIL_CALC" &&
    isAdmin(chatId)
  ) {
    await startRailCalc(
      chatId
    );
    return;
  }

  /*
   * =======================================================
   * اتصال درخواست هتل به محاسبه
   * =======================================================
   */

  if (
    data.startsWith(
      "CALC_HOTEL_REQUEST:"
    ) &&
    isAdmin(chatId)
  ) {
    const code =
      data.substring(
        "CALC_HOTEL_REQUEST:"
          .length
      );

    const rr =
      await pool.query(
        "SELECT * FROM requests WHERE request_code=$1",
        [code]
      );

    if (!rr.rows.length) {
      await sendMessage(
        chatId,
        "❌ درخواست پیدا نشد."
      );

      return;
    }

    const rq =
      rr.rows[0];

    const p =
      rq.payload || {};

    await startHotelCalc(
      chatId,
      {
        requestCode: code,

        applicantName:
          rq.applicant_name ||
          "",

        phone:
          rq.phone || "",

        adults:
          Number(
            p.adults || 0
          ),

        children:
          Number(
            p.children || 0
          ),

        nights:
          Number(
            p.nights || 0
          ),

        paymentType:
          p.paymentType ||
          rq.payment_type ||
          "cash"
      }
    );

    return;
  }

  /*
   * =======================================================
   * اتصال درخواست ریلی به محاسبه
   * =======================================================
   */

  if (
    data.startsWith(
      "CALC_REQUEST:"
    ) &&
    isAdmin(chatId)
  ) {
    const code =
      data.split(":")[1];

    const rr =
      await pool.query(
        "SELECT * FROM requests WHERE request_code=$1",
        [code]
      );

    if (!rr.rows.length) {
      await sendMessage(
        chatId,
        "❌ درخواست پیدا نشد."
      );

      return;
    }

    const rq =
      rr.rows[0];

    const p =
      rq.payload || {};

    const nationalCode =
      p.nationalCode ||
      p.national_code ||
      rq.national_code ||
      "";

    await startRailCalc(
      chatId,
      {
        requestCode: code,

        applicantName:
          rq.applicant_name ||
          "",

        phone:
          rq.phone ||
          "",

        nationalCode,

        adults:
          Number(
            p.adults || 0
          ),

        children:
          Number(
            p.children || 0
          ),

        nights:
          Number(
            p.nights || 0
          ),

        paymentType:
          p.paymentType ||
          rq.payment_type ||
          "cash"
      }
    );

    return;
  }

  /*
   * =======================================================
   * انتخاب مسیر ریلی
   * =======================================================
   */

  if (
    data.startsWith(
      "RAIL_ROUTE:"
    ) &&
    isAdmin(chatId)
  ) {
    const route =
      data.split(":")[1];

    const trains =
      PRICING.getTrainsForRoute(
        route
      );

    const rows =
      trains.map(t => [
        {
          text:
            `🚆 ${t.train} | ${t.stars} | ${t.berth || ""} | ${money(t.ticket)} تومان`,
          callback_data:
            `RAIL_TRAIN:${t.key}`
        }
      ]);

    rows.push([
      {
        text: "🔙 تغییر مسیر",
        callback_data:
          "ADMIN_RAIL_CALC"
      }
    ]);

    const ss =
      await getSession(
        chatId
      );

    await saveSession(
      chatId,
      "RAIL_TRAIN",
      {
        ...(ss?.data || {}),
        route
      }
    );

    await sendMessage(
      chatId,
      "🚆 قطار موردنظر را انتخاب کنید:",
      {
        inline_keyboard:
          rows
      }
    );

    return;
  }

  /*
   * =======================================================
   * انتخاب قطار
   * =======================================================
   */

  if (
    data.startsWith(
      "RAIL_TRAIN:"
    ) &&
    isAdmin(chatId)
  ) {
    const trainKey =
      data.split(":")[1];

    const ss =
      await getSession(
        chatId
      );

    const d =
      ss?.data || {};

    const train =
      PRICING
        .getTrainsForRoute(
          d.route ||
            "AHVAZ"
        )
        .find(
          x =>
            x.key ===
            trainKey
        );

    if (!train) {
      await sendMessage(
        chatId,
        "❌ قطار پیدا نشد."
      );

      return;
    }

    await saveSession(
      chatId,
      "RAIL_BERTH",
      {
        ...d,
        trainKey
      }
    );

    const berth =
      train.berth || "";

    await sendMessage(
      chatId,
      `✅ ${train.train} انتخاب شد.

⭐ درجه: ${train.stars}
🚆 نوع کوپه: ${berth}
💰 قیمت بلیت یک‌طرفه: ${money(train.ticket)} تومان

🚆 وضعیت اجاره کوپه را انتخاب کنید:`,
      {
        inline_keyboard: [
          [
            {
              text:
                "🚫 بدون اجاره کوپه",
              callback_data:
                "RAIL_BERTH_NONE"
            }
          ],
          [
            {
              text:
                `🚆 اجاره کوپه ${berth}`,
              callback_data:
                "RAIL_BERTH_RENT"
            }
          ],
          [
            {
              text:
                "🔙 تغییر قطار",
              callback_data:
                `RAIL_ROUTE:${d.route || "AHVAZ"}`
            }
          ]
        ]
      }
    );

    return;
  }

  /*
   * =======================================================
   * اجاره / عدم اجاره کوپه
   * =======================================================
   */

  if (
    (
      data ===
        "RAIL_BERTH_NONE" ||
      data ===
        "RAIL_BERTH_RENT"
    ) &&
    isAdmin(chatId)
  ) {
    const ss =
      await getSession(
        chatId
      );

    if (!ss) return;

    const d =
      ss.data || {};

    const trainKey =
      d.trainKey;

    if (!trainKey) {
      await sendMessage(
        chatId,
        "❌ قطار انتخاب نشده است. لطفاً دوباره قطار را انتخاب کنید."
      );
      return;
    }

    const train =
      PRICING
        .getTrainsForRoute(
          d.route ||
            "AHVAZ"
        )
        .find(
          x =>
            x.key ===
            trainKey
        );

    if (!train) {
      await sendMessage(
        chatId,
        "❌ قطار انتخاب‌شده پیدا نشد."
      );
      return;
    }

    const berthOption =
      data ===
      "RAIL_BERTH_RENT"
        ? (
            train.berth ||
            "6 تخته"
          )
        : "بدون اجاره";

    const berthText =
      berthOption ===
      "بدون اجاره"
        ? "🚫 بدون اجاره کوپه"
        : `🚆 اجاره ${berthOption}`;

    const preAdults =
      Number(
        d.adults || 0
      );

    const preNights =
      Number(
        d.nights || 0
      );

    const nextState =
      preAdults > 0 &&
      preNights > 0
        ? "RAIL_HOTEL"
        : "RAIL_ADULTS";

    await saveSession(
      chatId,
      nextState,
      {
        ...d,
        trainKey,
        berthOption
      }
    );

    if (
      preAdults > 0 &&
      preNights > 0
    ) {
      await sendMessage(
        chatId,
        `${berthText}

👨 تعداد بزرگسال: ${preAdults}
🌙 تعداد شب: ${preNights}

🏨 قیمت هتل هر نفر / هر شب را وارد کنید:`
      );
    } else {
      await sendMessage(
        chatId,
        `${berthText}

👨 تعداد بزرگسال را وارد کنید:`
      );
    }

    return;
  }

  /*
   * =======================================================
   * محاسبه نهایی ریلی
   * =======================================================
   */

  if (
    (
      data ===
        "RAIL_PAYMENT_CASH" ||
      data ===
        "RAIL_PAYMENT_LOAN"
    ) &&
    isAdmin(chatId)
  ) {
    const ss =
      await getSession(
        chatId
      );

    if (!ss) return;

    const d =
      ss.data || {};

    try {
      const result =
        PRICING.calculateRailTour({
          ...d,

          paymentType:
            data ===
            "RAIL_PAYMENT_LOAN"
              ? "loan"
              : "cash",

          childHotelPercent:
            50,

          childTicketPercent:
            60,

          berthOption:
            d.berthOption ||
            "بدون اجاره"
        });

      /*
       * ذخیره محاسبه داخل درخواست
       */
      if (
        d.requestCode
      ) {
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
                Number(
                  result.finalPrice ??
                  result.finalCost ??
                  result.totalCost ??
                  0
                ),

              calculatedAt:
                new Date().toISOString()
            })
          ]
        );
      }

      /*
       * نگه داشتن session
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
        PRICING.formatRailCalculation(
          result
        );

      if (
        d.requestCode
      ) {
        out += `

🆔 درخواست: ${
          d.requestCode
        }
👤 متقاضی: ${
          d.applicantName ||
          ""
        }
📱 تلفن: ${
          d.phone || ""
        }
🪪 کد ملی: ${
          d.nationalCode ||
          "ثبت نشده"
        }`;
      }

      await sendMessage(
        chatId,
        out,
        managerCalcMenu(
          Boolean(
            d.requestCode
          ),
          d.requestCode ||
            ""
        )
      );

    } catch (e) {
      console.error(
        "Rail calculation error:",
        e
      );

      await sendMessage(
        chatId,
        `❌ خطا در محاسبه:
${e.message}`
      );
    }

    return;
  }

  /*
   * =======================================================
   * پرداخت محاسبه دستی تور اتوبوسی
   * =======================================================
   */

  if (
    (data === "BUS_PAYMENT_CASH" ||
      data === "BUS_PAYMENT_LOAN") &&
    isAdmin(chatId)
  ) {
    const s = await getSession(chatId);

    if (!s || s.state !== "MAN_BUS_PAYMENT_SELECT") {
      return;
    }

    const d = s.data || {};

    if (data === "BUS_PAYMENT_CASH") {
      await saveSession(chatId, "MAN_BUS_PROFIT", d);
      await sendMessage(chatId, "💵 سود هر نفر برای محاسبه نقدی را وارد کنید:");
    } else {
      await saveSession(chatId, "MAN_BUS_LOAN_PROFIT", d);
      await sendMessage(
        chatId,
        "💎 سود هر نفر برای طرح الماس را وارد کنید.\n\nمبلغ باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد:"
      );
    }

    return;
  }

  /*
   * =======================================================
   * پرداخت محاسبه تور هوایی
   * =======================================================
   */

  if (
    (data === "AIR_PAYMENT_CASH" ||
      data === "AIR_PAYMENT_LOAN") &&
    isAdmin(chatId)
  ) {
    const s = await getSession(chatId);

    if (!s || s.state !== "MAN_AIR_PAYMENT_SELECT") {
      return;
    }

    const d = s.data || {};

    if (data === "AIR_PAYMENT_CASH") {
      await finishAirCalc(
        chatId,
        d,
        "cash",
        3500000
      );
    } else {
      await saveSession(
        chatId,
        "MAN_AIR_LOAN_PROFIT",
        d
      );

      await sendMessage(
        chatId,
        "💎 سود هر نفر برای طرح الماس را وارد کنید.\n\nمبلغ باید بین ۵٬۰۰۰٬۰۰۰ تا ۶٬۰۰۰٬۰۰۰ تومان باشد:"
      );
    }

    return;
  }

  /*
   * =======================================================
   * اتصال درخواست هوایی به محاسبه
   * =======================================================
   */

  if (
    data.startsWith("CALC_AIR_REQUEST:") &&
    isAdmin(chatId)
  ) {
    const code = data.substring("CALC_AIR_REQUEST:".length);

    const rr = await pool.query(
      "SELECT * FROM requests WHERE request_code=$1",
      [code]
    );

    if (!rr.rows.length) {
      await sendMessage(chatId, "❌ درخواست پیدا نشد.");
      return;
    }

    const rq = rr.rows[0];
    const p = rq.payload || {};

    await saveSession(
      chatId,
      "MAN_AIR_TICKET_ADULT_OUT",
      {
        type: "AIR",
        requestCode: code,
        applicantName: rq.applicant_name || "",
        phone: rq.phone || "",
        nationalCode: p.nationalCode || p.national_code || rq.national_code || "",
        adults: Number(p.adults || 0),
        children: Number(p.children || 0),
        nights: Number(p.nights || 0),
        paymentType: p.paymentType || rq.payment_type || "cash"
      }
    );

    await sendMessage(
      chatId,
      `✈️ محاسبه تور هوایی\n\n🆔 درخواست: ${code}\n👤 متقاضی: ${rq.applicant_name || ""}\n👨 بزرگسال: ${Number(p.adults || 0)} نفر\n👶 کودک: ${Number(p.children || 0)} نفر\n🌙 تعداد شب: ${Number(p.nights || 0)}\n\n✈️ مبلغ بلیت رفت هر بزرگسال را وارد کنید:`
    );

    return;
  }

  /*
   * =======================================================
   * اتصال درخواست اتوبوسی به محاسبه
   * =======================================================
   */

  if (
    data.startsWith("CALC_BUS_REQUEST:") &&
    isAdmin(chatId)
  ) {
    const code = data.substring("CALC_BUS_REQUEST:".length);

    const rr = await pool.query(
      "SELECT * FROM requests WHERE request_code=$1",
      [code]
    );

    if (!rr.rows.length) {
      await sendMessage(chatId, "❌ درخواست پیدا نشد.");
      return;
    }

    const rq = rr.rows[0];
    const p = rq.payload || {};

    await saveSession(chatId, "MAN_BUS_HOTEL", {
      type: "BUS",
      requestCode: code,
      applicantName: rq.applicant_name || "",
      phone: rq.phone || "",
      nationalCode: p.nationalCode || p.national_code || rq.national_code || "",
      adults: Number(p.adults || 0),
      children: Number(p.children || 0),
      nights: Number(p.nights || 0),
      paymentType: p.paymentType || rq.payment_type || "cash",
      busTicketRoundTrip: 4000000,
      ticketAdult: 4000000,
      childPercent: 100,
      childHotelPercent: 50
    });

    await sendMessage(
      chatId,
      `🚌 محاسبه درخواست تور اتوبوسی\n\n🆔 درخواست: ${code}\n👤 متقاضی: ${rq.applicant_name || ""}\n👨 بزرگسال: ${Number(p.adults || 0)} نفر\n👶 کودک: ${Number(p.children || 0)} نفر\n🌙 تعداد شب: ${Number(p.nights || 0)}\n🎫 بلیت رفت و برگشت هر صندلی: ۴٬۰۰۰٬۰۰۰ تومان\n👶 کودک ۳ تا ۵ سال: بلیت کامل\n\n🏨 قیمت هتل هر بزرگسال / هر شب را وارد کنید:`
    );

    return;
  }

  /*
   * =======================================================
   * محاسبه اختصاصی تور اتوبوسی
   * بلیت رفت و برگشت هر صندلی = ۴٬۰۰۰٬۰۰۰ تومان
   * کودک ۳ تا ۵ سال نیز صندلی کامل دارد.
   * =======================================================
   */

  if (
    data === "ADMIN_MANUAL_BUS" &&
    isAdmin(chatId)
  ) {
    await saveSession(chatId, "MAN_ADULTS", {
      type: "BUS",
      busTicketRoundTrip: 4000000
    });

    await sendMessage(
      chatId,
      "🚌 محاسبه تور اتوبوسی\n\n🎫 بلیت رفت و برگشت هر صندلی: ۴٬۰۰۰٬۰۰۰ تومان\n👶 کودک ۳ تا ۵ سال: بلیت کامل\n\n👨 تعداد بزرگسال را وارد کنید:"
    );
    return;
  }

  /*
   * =======================================================
   * سایر محاسبات دستی
   * =======================================================
   */

  if (
    data.startsWith(
      "ADMIN_MANUAL_"
    ) &&
    isAdmin(chatId)
  ) {
    const type =
      data.replace(
        "ADMIN_MANUAL_",
        ""
      );

    await saveSession(
      chatId,
      "MAN_ADULTS",
      {
        type
      }
    );

    await sendMessage(
      chatId,
      `🧮 محاسبه دستی ${type}

👨 تعداد بزرگسال:`
    );

    return;
  }

  /*
   * =======================================================
   * خروج از محاسبات
   * =======================================================
   */

  if (
    data ===
      "ADMIN_CALC_EXIT" &&
    isAdmin(chatId)
  ) {
    await saveSession(
      chatId,
      "MAIN",
      {}
    );

    await sendMessage(
      chatId,
      "✅ خروج از محاسبات مدیر.",
      mainKeyboard()
    );

    return;
  }
}

/*
 * =========================================================
 * برگشت در فرم
 * =========================================================
 */

async function goBack(
  chatId
) {
  const s =
    await getSession(
      chatId
    );

  const d =
    s?.data || {};

  const state =
    s?.state;

  if (
    state ===
    "TOUR_DATE_OUT"
  ) {
    return startTour(
      chatId,
      d.tourType
    );
  }

  if (
    state ===
    "TOUR_NIGHTS"
  ) {
    return askTourOut(
      chatId,
      d
    );
  }

  if (
    state ===
    "TOUR_ADULTS"
  ) {
    return askNights(
      chatId,
      d
    );
  }

  if (
    state ===
    "TOUR_CHILDREN"
  ) {
    return askAdults(
      chatId,
      d
    );
  }

  if (
    state ===
    "TOUR_PAYMENT"
  ) {
    return askChildren(
      chatId,
      d
    );
  }

  if (
    state ===
    "TOUR_NAME"
  ) {
    return askPayment(
      chatId,
      d
    );
  }

  if (
    state ===
    "TOUR_PHONE"
  ) {
    return askName(
      chatId,
      d
    );
  }

  if (
    state ===
    "TOUR_NATIONAL"
  ) {
    return askPhone(
      chatId,
      d
    );
  }

  await clearSession(
    chatId
  );

  await sendMessage(
    chatId,
    "🏠 صفحه اصلی",
    mainKeyboard()
  );
}

/*
 * =========================================================
 * WEBHOOK
 * =========================================================
 */

app.post(
  "/webhook",
  async (
    req,
    res
  ) => {
    res.sendStatus(200);

    try {
      // وقتی ربات ادمین کانال باشد، بله channel_post را برای وبهوک می‌فرستد.
      // شناسه واقعی کانال را ذخیره می‌کنیم تا انتشار با chat_id قطعی انجام شود.
      if (req.body?.channel_post?.chat?.id) {
        const channelChatId = String(req.body.channel_post.chat.id);
        await pool.query(
          `INSERT INTO bot_settings(key, value) VALUES('channel_id', $1)
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
          [channelChatId]
        );
      }

      if (
        req.body?.message
      ) {
        await handleMessage(
          req.body.message
        );
      }

      if (
        req.body?.callback_query
      ) {
        await handleCallback(
          req.body.callback_query
        );
      }

    } catch (e) {
      console.error(
        "❌ Webhook error:",
        e
      );
    }
  }
);

/*
 * =========================================================
 * صفحه تست Render
 * =========================================================
 */

app.get(
  "/",
  (
    req,
    res
  ) =>
    res.send(
      "Safar Mashhad Toos Bot is running ✅"
    )
);

/*
 * =========================================================
 * START SERVER
 * =========================================================
 */

(async () => {
  try {
    await initDB();

    app.listen(
      CONFIG.PORT,
      "0.0.0.0",
      () =>
        console.log(
          `🚀 Server running on port ${CONFIG.PORT}`
        )
    );

    setTimeout(runFeedbackScheduler, 5000);
    setInterval(runFeedbackScheduler, 6 * 60 * 60 * 1000);

  } catch (e) {
    console.error(
      "❌ Startup error:",
      e
    );

    process.exit(1);
  }
})();
