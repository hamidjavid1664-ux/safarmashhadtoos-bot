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

💳 پس از تأیید، مسافر باید ۴۰٪ هزینه کل سفر را پرداخت کند و رسید را ارسال نماید.

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

⚠️ پس از پرداخت، تصویر فیش واریزی را همین‌جا ارسال کنید.`;
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
  const total = Number(
    req.payload?.totalCost || 0
  );

  if (total > 0) {
    const cash = Number(
      req.payload?.calculation?.customerCash ??
      req.payload?.calculation?.cashAmount ??
      Math.ceil(total * 0.4)
    );

    return `💎 درخواست طرح الماس تأیید شد.

🆔 درخواست: ${req.request_code}
💰 هزینه کل سفر: ${money(total)} تومان
💳 سهم نقدی ۴۰٪: ${money(cash)} تومان

✅ درخواست شما توسط مدیر تأیید شد.

⚠️ اطلاعات حساب و شماره کارت در این مرحله مجدداً ارسال نمی‌شود.`;
  }

  return `💎 درخواست طرح الماس تأیید شد.

🆔 درخواست: ${req.request_code}

✅ درخواست شما توسط مدیر تأیید شد.

پس از مشخص شدن مبلغ نهایی، ادامه مراحل پرداخت اطلاع‌رسانی خواهد شد.`;
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
    return null;
  }

  const paymentType =
    req.payment_type ||
    payload.paymentType ||
    "cash";

  let text = `💰 مبلغ سفر شما محاسبه شد.
━━━━━━━━━━━━━━━━━━
🆔 شماره درخواست: ${req.request_code}
🚍 نوع سفر: ${
    TOUR_NAMES[req.request_type] ||
    "تور"
  }
👤 متقاضی: ${
    req.applicant_name || ""
  }
📱 تلفن: ${
    req.phone || ""
  }
━━━━━━━━━━━━━━━━━━
💰 مبلغ کل سفر: ${money(total)} تومان
`;

  if (paymentType === "loan") {
    const customerCash = Number(
      calc.customerCash ??
      calc.cashAmount ??
      calc.customerPayment ??
      calc.payableCash ??
      Math.ceil(total * 0.4)
    );

    text += `
💎 نوع پرداخت: طرح الماس شهر بهشت
💳 مبلغ نقدی موردنیاز: ${money(customerCash)} تومان

${paymentInfoText()}

⚠️ این پیام صرفاً جهت اعلام مبلغ و اطلاعات واریز است.
✅ تأیید نهایی درخواست هنوز انجام نشده است.
`;
  } else {
    text += `
💵 نوع پرداخت: نقدی
💳 مبلغ قابل واریز: ${money(total)} تومان

${paymentInfoText()}

⚠️ این پیام صرفاً جهت اعلام مبلغ و اطلاعات واریز است.
✅ تأیید نهایی درخواست هنوز انجام نشده است.
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

  await sendMessage(
    chatId,
    "💳 نوع پرداخت را انتخاب کنید:",
    {
      inline_keyboard: [
        [
          {
            text: "💵 پرداخت نقدی",
            callback_data:
              "TOUR_PAYMENT_CASH"
          }
        ],
        [
          {
            text: "💎 طرح الماس شهر بهشت",
            callback_data:
              "TOUR_PAYMENT_LOAN"
          }
        ],
        [
          {
            text: "🔙 بازگشت",
            callback_data:
              "TOUR_BACK"
          }
        ]
      ]
    }
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
   * طرح الماس
   */
  if (
    req.payment_type === "loan"
  ) {
    await sendMessage(
      req.user_id,
      diamondPaymentText(req)
    );
  }

  /*
   * نقدی
   */
  else {
    await sendMessage(
      req.user_id,
      `✅ درخواست شما تأیید شد.

🆔 شماره درخواست: ${code}

💵 نوع پرداخت: نقدی

در صورت انجام پرداخت، تصویر رسید واریزی را ارسال کنید.`
    );
  }

  /*
   * فقط یک‌بار منتظر رسید می‌مانیم.
   * قبلاً این بخش جداگانه دوباره اجرا می‌شد و پیام رسید
   * برای مشتری دو بار ارسال می‌شد.
   */
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

  await sendMessage(
    req.user_id,
    `🧾 پس از انجام پرداخت، لطفاً تصویر یا فایل رسید واریزی را ارسال کنید.

بعد از تأیید دریافت رسید، برای تورهای ریلی/هوایی/اتوبوسی از شما لیست مسافران یا همراهان دریافت می‌شود.`
  );
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
      "PASSENGER_LIST",
      d
    );

    await sendMessage(
      chatId,
      `✅ رسید پرداخت دریافت شد.

📋 لطفاً لیست ${
        String(d.tourType || "").startsWith("CARAVAN")
          ? "مسافران"
          : "مسافران / همراهان"
      } را ارسال کنید.

مشخصات هر نفر:
نام و نام خانوادگی | کد ملی | تاریخ تولد

مثال:
علی رضایی | ۱۲۳۴۵۶۷۸۹۰ | ۱۳۶۲/۰۶/۱۷

می‌توانید متن، تصویر یا فایل ارسال کنید.`
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

  if (
    d.paymentType ===
    "loan"
  ) {
    out += `
💎 طرح الماس

💳 سهم نقدی ۴۰٪:
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
      "🌹 به ربات سفر مشهد توس خوش آمدید.\n\nبرای دریافت خدمات گزینه موردنظر را انتخاب کنید.",
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

  } catch (e) {
    console.error(
      "❌ Startup error:",
      e
    );

    process.exit(1);
  }
})();
