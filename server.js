require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const CONFIG = require("./config");
const PRICING = require("./pricing");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;


/* =========================================================
   DATABASE
========================================================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDB() {

  console.log("🔄 Initializing database...");

  /*
   * جدول sessions
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      user_id TEXT PRIMARY KEY,
      state TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);


  /*
   * جدول requests
   *
   * این ساختار کامل‌تر از نسخه قبلی است
   * و اطلاعات درخواست تور، پرداخت و مسافر را نگه می‌دارد.
   */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
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
    );
  `);


  /*
   * اگر جدول requests از نسخه قبلی وجود داشته باشد
   * ستون‌های جدید را اضافه می‌کنیم.
   */

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS applicant_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS phone TEXT;
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS bale_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS payment_type TEXT;
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
  `);

  await pool.query(`
    ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);


  console.log("✅ Database initialized successfully");
}


/* =========================================================
   SESSION
========================================================= */

async function getSession(userId) {

  const result = await pool.query(
    `
      SELECT *
      FROM sessions
      WHERE user_id = $1
    `,
    [String(userId)]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
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
        $3,
        NOW()
      )

      ON CONFLICT (user_id)

      DO UPDATE SET
        state = EXCLUDED.state,
        data = EXCLUDED.data,
        updated_at = NOW()
    `,
    [
      String(userId),
      state,
      JSON.stringify(data)
    ]
  );
}


async function clearSession(userId) {

  await pool.query(
    `
      DELETE FROM sessions
      WHERE user_id = $1
    `,
    [String(userId)]
  );
}


/* =========================================================
   HELPERS
========================================================= */

function getUserId(message) {

  return String(
    message?.sender?.id ||
    message?.from?.id ||
    message?.chat?.id ||
    ""
  );
}


function getChatId(message) {

  return String(
    message?.chat?.id ||
    message?.sender?.id ||
    message?.from?.id ||
    ""
  );
}


function getUsername(message) {

  return (
    message?.sender?.username ||
    message?.from?.username ||
    ""
  );
}


function getFirstName(message) {

  return (
    message?.sender?.first_name ||
    message?.sender?.firstName ||
    message?.from?.first_name ||
    message?.from?.firstName ||
    "کاربر"
  );
}


function getLastName(message) {

  return (
    message?.sender?.last_name ||
    message?.sender?.lastName ||
    message?.from?.last_name ||
    message?.from?.lastName ||
    ""
  );
}


/* =========================================================
   تبدیل اعداد فارسی به انگلیسی
========================================================= */

function toEnglishDigits(value) {

  if (!value) return "";

  return String(value)
    .replace(/[۰-۹]/g, d =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    )
    .replace(/[٠-٩]/g, d =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
    );
}


/* =========================================================
   تبدیل اعداد انگلیسی به فارسی
========================================================= */

function toPersianDigits(value) {

  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
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


/* =========================================================
   اعتبارسنجی تعداد شب
========================================================= */

function parsePositiveNumber(text) {

  const value = Number(
    toEnglishDigits(text)
      .replace(/[^\d]/g, "")
  );

  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return null;
  }

  return value;
}


/* =========================================================
   تاریخ تولد همراهان
   فرمت صحیح:
   YYYY/MM/DD
   مثال:
   1362/06/17
========================================================= */

function normalizeBirthDate(text) {

  const value =
    toEnglishDigits(text)
      .trim()
      .replace(/[-.]/g, "/");

  const parts =
    value.split("/");

  if (parts.length !== 3) {
    return null;
  }

  const year =
    parts[0].trim();

  const month =
    parts[1].trim().padStart(2, "0");

  const day =
    parts[2].trim().padStart(2, "0");

  if (
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^\d{2}$/.test(day)
  ) {
    return null;
  }

  const monthNumber =
    Number(month);

  const dayNumber =
    Number(day);

  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > 31
  ) {
    return null;
  }

  return `${year}/${month}/${day}`;
}


/* =========================================================
   BALE API
========================================================= */

async function baleRequest(
  method,
  body
) {

  const token =
    CONFIG.BOT_TOKEN;

  if (!token) {

    throw new Error(
      "BALE_BOT_TOKEN در Environment Variables تنظیم نشده است."
    );
  }

  const url =
    `${CONFIG.BALE_API_BASE}${token}/${method}`;

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
    await response
      .json()
      .catch(() => ({}));

  console.log(
    "📡 BALE:",
    method,
    data
  );

  if (
    !response.ok ||
    data.ok === false
  ) {

    throw new Error(
      data.description ||
      `Bale API ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage(
  chatId,
  text,
  replyMarkup
) {

  const body = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) {

    body.reply_markup =
      replyMarkup;
  }

  return baleRequest(
    "sendMessage",
    body
  );
}


/* =========================================================
   CALLBACK
========================================================= */

async function answerCallback(
  callbackId
) {

  try {

    await baleRequest(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId
      }
    );

  } catch (error) {

    console.error(
      "Callback error:",
      error.message
    );
  }
}


/* =========================================================
   دسترسی و محاسبات مدیر
========================================================= */
function isAdmin(chatId){ return String(chatId)===String(CONFIG.ADMIN_CHAT_ID); }
function managerCalculationKeyboard(){return {inline_keyboard:[[{text:"🚆 محاسبه تور ریلی",callback_data:"ADMIN_RAIL_CALC"}],[{text:"✈️ محاسبه تور هوایی",callback_data:"ADMIN_AIR_CALC"}],[{text:"🚌 محاسبه تور اتوبوسی",callback_data:"ADMIN_BUS_CALC"}],[{text:"🚍 محاسبه کاروان اتوبوسی",callback_data:"ADMIN_CARAVAN_BUS_CALC"}],[{text:"🚆 محاسبه کاروان ریلی",callback_data:"ADMIN_CARAVAN_RAIL_CALC"}],[{text:"🏨 محاسبه فقط هتل",callback_data:"ADMIN_HOTEL_CALC"}],[{text:"💎 محاسبه طرح الماس",callback_data:"ADMIN_DIAMOND_CALC"}],[{text:"🔙 خروج",callback_data:"ADMIN_CALC_EXIT"}]]};}
async function showManagerCalculations(chatId){if(!isAdmin(chatId))return;await saveSession(chatId,"ADMIN_CALC_MENU",{});await sendMessage(chatId,"🧮 محاسبات مدیر\n\nنوع محاسبه را انتخاب کنید:",managerCalculationKeyboard());}
async function startManualManagerCalc(chatId,type){if(!isAdmin(chatId))return;await saveSession(chatId,"ADMIN_CALC_ADULTS",{type});await sendMessage(chatId,`نوع محاسبه: ${type}\n\n👨 تعداد بزرگسال را وارد کنید:`);}
async function handleManagerCalculationText(chatId,text,session){if(!isAdmin(chatId)||!session||!session.state.startsWith("ADMIN_CALC_"))return false;const d=session.data||{},v=Number(toEnglishDigits(text).replace(/[^\d]/g,""));if(session.state==="ADMIN_CALC_ADULTS"){if(!Number.isInteger(v)||v<=0){await sendMessage(chatId,"❌ تعداد بزرگسال نامعتبر است.");return true;}await saveSession(chatId,"ADMIN_CALC_CHILDREN",{...d,adults:v});await sendMessage(chatId,"👧 تعداد کودک ۳ تا ۵ سال را وارد کنید:");return true;}if(session.state==="ADMIN_CALC_CHILDREN"){if(!Number.isInteger(v)||v<0){await sendMessage(chatId,"❌ تعداد کودک نامعتبر است.");return true;}await saveSession(chatId,"ADMIN_CALC_NIGHTS",{...d,children:v});await sendMessage(chatId,"🌙 تعداد شب اقامت را وارد کنید:");return true;}if(session.state==="ADMIN_CALC_NIGHTS"){if(!Number.isInteger(v)||v<=0){await sendMessage(chatId,"❌ تعداد شب نامعتبر است.");return true;}await saveSession(chatId,"ADMIN_CALC_TICKET",{...d,nights:v});await sendMessage(chatId,"🎫 قیمت بلیت/هزینه رفت‌وبرگشت هر بزرگسال را وارد کنید:");return true;}if(session.state==="ADMIN_CALC_TICKET"){if(v<0){await sendMessage(chatId,"❌ مبلغ نامعتبر است.");return true;}await saveSession(chatId,"ADMIN_CALC_HOTEL",{...d,ticketAdult:v});await sendMessage(chatId,"🏨 قیمت هتل هر بزرگسال برای هر شب را وارد کنید (پیش‌فرض ۲۳۰۰۰۰۰):");return true;}if(session.state==="ADMIN_CALC_HOTEL"){if(v<0){await sendMessage(chatId,"❌ مبلغ نامعتبر است.");return true;}await saveSession(chatId,"ADMIN_CALC_PAYMENT",{...d,hotelAdult:v||2300000});await sendMessage(chatId,"💳 نوع پرداخت را انتخاب کنید:",{inline_keyboard:[[{text:"💵 نقدی",callback_data:"ADMIN_MANUAL_CASH"}],[{text:"💎 طرح الماس",callback_data:"ADMIN_MANUAL_LOAN"}]]});return true;}return false;}
async function startRailCalculation(chatId){
  if(!isAdmin(chatId)) return;
  await saveSession(chatId,"RAILCALC_ROUTE",{});
  const routes=CONFIG.RAIL?.TICKET_PRICES||{};
  const rows=[];
  for(const [key,val] of Object.entries(routes)) rows.push([{text:`🚆 ${val.name||key}`,callback_data:`RAILCALC_ROUTE:${key}`}]);
  rows.push([{text:"🔙 خروج",callback_data:"ADMIN_CALC_EXIT"}]);
  await sendMessage(chatId,"🚆 محاسبه تور ریلی\n\nمسیر را انتخاب کنید:",{inline_keyboard:rows});
}

async function handleRailCalculationText(chatId,text,session){
  if(!isAdmin(chatId)||!session||!session.state.startsWith("RAILCALC_")) return false;
  const d=session.data||{};
  const v=Number(toEnglishDigits(text).replace(/[^\d]/g,""));
  if(session.state==="RAILCALC_ADULTS"){if(!Number.isInteger(v)||v<=0){await sendMessage(chatId,"❌ تعداد بزرگسال نامعتبر است.");return true;}await saveSession(chatId,"RAILCALC_CHILDREN",{...d,adults:v});await sendMessage(chatId,"👧 تعداد کودک را وارد کنید:");return true;}
  if(session.state==="RAILCALC_CHILDREN"){if(!Number.isInteger(v)||v<0){await sendMessage(chatId,"❌ تعداد کودک نامعتبر است.");return true;}await saveSession(chatId,"RAILCALC_NIGHTS",{...d,children:v});await sendMessage(chatId,"🌙 تعداد شب اقامت را وارد کنید:");return true;}
  if(session.state==="RAILCALC_NIGHTS"){if(!Number.isInteger(v)||v<=0){await sendMessage(chatId,"❌ تعداد شب نامعتبر است.");return true;}await saveSession(chatId,"RAILCALC_HOTEL",{...d,nights:v});await sendMessage(chatId,"🏨 قیمت هتل هر بزرگسال برای هر شب را وارد کنید:");return true;}
  if(session.state==="RAILCALC_HOTEL"){if(v<0){await sendMessage(chatId,"❌ مبلغ نامعتبر است.");return true;}await saveSession(chatId,"RAILCALC_PRIVATE",{...d,hotelPricePerPersonPerNight:v||2300000});await sendMessage(chatId,"🚃 برای تعداد فرد ۳ یا ۵ نفر، کوپه اختصاصی می‌خواهید؟",{inline_keyboard:[[{text:"✅ بله",callback_data:"RAILCALC_PRIVATE_YES"}],[{text:"❌ خیر",callback_data:"RAILCALC_PRIVATE_NO"}]]});return true;}
  return false;
}

async function finishManualManagerCalc(chatId,paymentType){if(!isAdmin(chatId))return;const s=await getSession(chatId),d=s?.data||{};try{const r=PRICING.calculateManualTour({...d,paymentType});await saveSession(chatId,"MAIN",{});await sendMessage(chatId,PRICING.formatManualCalculation(r),managerCalculationKeyboard());}catch(e){await sendMessage(chatId,"❌ خطا در محاسبه:\n"+e.message,managerCalculationKeyboard());}}

/* =========================================================
   MAIN KEYBOARD
========================================================= */

function mainKeyboard() {
  const keyboard=[
    [{text:"🏨 رزرو هتل"},{text:"🚌 تورهای مشهد"}],
    [{text:"💎 طرح الماس شهر بهشت"},{text:"🧳 خدمات گردشگری"}],
    [{text:"📞 تماس با ما"},{text:"📢 کانال"}]
  ];
  if(isAdmin(arguments[0])) keyboard.push([{text:"🧮 محاسبات مدیر"}]);
  return {keyboard,resize_keyboard:true};
}
/* =========================================================
   فرم تور - تعداد شب اقامت
========================================================= */

async function askTourNights(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_NIGHTS",
    data
  );

  await sendMessage(
    chatId,

    "🌙 تعداد شب اقامت را وارد کنید.\n\n" +
    "مثلاً:\n" +
    "۳"
  );
}


/* =========================================================
   تعداد بزرگسال
========================================================= */

async function askTourAdults(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_ADULTS",
    data
  );

  await sendMessage(
    chatId,

    "👨 تعداد بزرگسال را وارد کنید.\n\n" +
    "مثلاً:\n" +
    "۲"
  );
}


/* =========================================================
   تعداد کودک ۳ تا ۵ سال
========================================================= */

async function askTourChildren(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_CHILDREN",
    data
  );

  await sendMessage(
    chatId,

    "👧 تعداد کودک ۳ تا ۵ سال را وارد کنید.\n\n" +
    "اگر کودک ندارید عدد ۰ را بفرستید."
  );
}


/* =========================================================
   نوع پرداخت
========================================================= */

async function askTourPayment(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_PAYMENT",
    data
  );

  await sendMessage(
    chatId,

    "💳 نوع پرداخت را انتخاب کنید:",

    {
      inline_keyboard: [

        [
          {
            text: "💵 پرداخت نقدی",
            callback_data: "TOUR_PAYMENT_CASH"
          }
        ],

        [
          {
            text: "💎 طرح الماس شهر بهشت",
            callback_data: "TOUR_PAYMENT_LOAN"
          }
        ],

        [
          {
            text: "🔙 بازگشت",
            callback_data: "TOUR_BACK"
          }
        ]

      ]
    }
  );
}


/* =========================================================
   نام و نام خانوادگی
========================================================= */

async function askTourName(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_NAME",
    data
  );

  await sendMessage(
    chatId,

    "👤 لطفاً نام و نام خانوادگی خود را وارد کنید."
  );
}


/* =========================================================
   شماره تماس
========================================================= */

async function askTourPhone(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_PHONE",
    data
  );

  await sendMessage(
    chatId,

    "📱 لطفاً شماره تماس خود را وارد کنید.\n\n" +
    "مثال:\n" +
    "۰۹۱۷۷۷۰۰۹۶۱"
  );
}


/* =========================================================
   کد ملی برای طرح الماس
========================================================= */

async function askTourNationalCode(chatId, data) {

  await saveSession(
    chatId,
    "TOUR_NATIONAL_CODE",
    data
  );

  await sendMessage(
    chatId,

    "🪪 لطفاً کد ملی متقاضی اصلی را وارد کنید."
  );
}


/* =========================================================
   تأیید نهایی اطلاعات
========================================================= */

async function showTourConfirmation(chatId, data) {

  const typeNames = {

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

  const paymentText =
    data.paymentType === "loan"
      ? "💎 طرح الماس"
      : "💵 نقدی";


  const text =

    "📋 لطفاً اطلاعات درخواست خود را بررسی کنید.\n\n" +

    `🚍 نوع سفر: ${typeNames[data.tourType] || data.tourType}\n` +

    `📅 تاریخ ورود به مشهد: ${data.departureDate}\n` +

    `📅 تاریخ خروج از مشهد: ${data.returnDate}\n` +

    `🌙 تعداد شب اقامت: ${data.nights} شب\n` +

    `👨 بزرگسال: ${data.adults} نفر\n` +

    `👧 کودک ۳ تا ۵ سال: ${data.children} نفر\n` +

    `💳 نوع پرداخت: ${paymentText}\n` +

    `👤 نام و نام خانوادگی: ${data.applicantName}\n` +

    `📱 شماره تماس: ${data.phone}\n` +

    (
      data.paymentType === "loan"
        ? `🪪 کد ملی: ${data.nationalCode}\n`
        : ""
    ) +

    "\nآیا اطلاعات صحیح است؟";


  await sendMessage(
    chatId,
    text,
    {
      inline_keyboard: [

        [
          {
            text: "✅ ارسال درخواست برای مدیر",
            callback_data: "TOUR_SUBMIT"
          }
        ],

        [
          {
            text: "✏️ اصلاح اطلاعات",
            callback_data: "TOUR_EDIT"
          }
        ],

        [
          {
            text: "❌ لغو درخواست",
            callback_data: "TOUR_CANCEL"
          }
        ]

      ]
    }
  );
}
/* =========================================================
   پردازش فرم تور
========================================================= */

async function handleTourText(
  chatId,
  text,
  session
) {

  const data = session.data || {};


  /* تاریخ ورود */

  if (session.state === "TOUR_DATE") {

    await askTourReturnDate(
      chatId,
      {
        ...data,
        departureDate: text
      }
    );

    return true;
  }


  /* تاریخ خروج */

  if (session.state === "TOUR_RETURN_DATE") {

    await askTourNights(
      chatId,
      {
        ...data,
        returnDate: text
      }
    );

    return true;
  }


  /* تعداد شب */

  if (session.state === "TOUR_NIGHTS") {

    const nights =
      Number(
        toEnglishDigits(text)
          .replace(/[^\d]/g, "")
      );

    if (
      !Number.isInteger(nights) ||
      nights <= 0
    ) {

      await sendMessage(
        chatId,
        "❌ تعداد شب اقامت نامعتبر است.\nلطفاً یک عدد صحیح وارد کنید."
      );

      return true;
    }


    await askTourAdults(
      chatId,
      {
        ...data,
        nights
      }
    );

    return true;
  }


  /* تعداد بزرگسال */

  if (session.state === "TOUR_ADULTS") {

    const adults =
      Number(
        toEnglishDigits(text)
          .replace(/[^\d]/g, "")
      );

    if (
      !Number.isInteger(adults) ||
      adults <= 0
    ) {

      await sendMessage(
        chatId,
        "❌ تعداد بزرگسال باید حداقل ۱ نفر باشد."
      );

      return true;
    }


    await askTourChildren(
      chatId,
      {
        ...data,
        adults
      }
    );

    return true;
  }


  /* تعداد کودک */

  if (session.state === "TOUR_CHILDREN") {

    const children =
      Number(
        toEnglishDigits(text)
          .replace(/[^\d]/g, "")
      );

    if (
      !Number.isInteger(children) ||
      children < 0
    ) {

      await sendMessage(
        chatId,
        "❌ تعداد کودک نامعتبر است."
      );

      return true;
    }


    await askTourPayment(
      chatId,
      {
        ...data,
        children
      }
    );

    return true;
  }


  /* نام */

  if (session.state === "TOUR_NAME") {

    if (text.length < 3) {

      await sendMessage(
        chatId,
        "❌ لطفاً نام و نام خانوادگی کامل را وارد کنید."
      );

      return true;
    }


    await askTourPhone(
      chatId,
      {
        ...data,
        applicantName: text
      }
    );

    return true;
  }


  /* تلفن */

  if (session.state === "TOUR_PHONE") {

    const phone =
      toEnglishDigits(text)
        .replace(/\s/g, "");

    if (
      !/^09\d{9}$/.test(phone)
    ) {

      await sendMessage(
        chatId,
        "❌ شماره تماس صحیح نیست.\nمثال: ۰۹۱۷۷۷۰۰۹۶۱"
      );

      return true;
    }


    if (data.paymentType === "loan") {

      await askTourNationalCode(
        chatId,
        {
          ...data,
          phone
        }
      );

      return true;
    }


    await showTourConfirmation(
      chatId,
      {
        ...data,
        phone
      }
    );

    return true;
  }


  /* کد ملی */

  if (
    session.state ===
    "TOUR_NATIONAL_CODE"
  ) {

    const nationalCode =
      toEnglishDigits(text)
        .replace(/\D/g, "");

    if (
      !/^\d{10}$/.test(nationalCode)
    ) {

      await sendMessage(
        chatId,
        "❌ کد ملی باید ۱۰ رقم باشد."
      );

      return true;
    }


    await showTourConfirmation(
      chatId,
      {
        ...data,
        nationalCode
      }
    );

    return true;
  }


  return false;
}


/* =========================================================
   تاریخ برگشت
========================================================= */

async function askTourReturnDate(
  chatId,
  data
) {

  await saveSession(
    chatId,
    "TOUR_RETURN_DATE",
    data
  );

  await sendMessage(
    chatId,

    "📅 تاریخ خروج از مشهد را وارد کنید.\n\n" +
    "مثال:\n" +
    "۱۴۰۵/۰۷/۱۳"
  );
}
/* =========================================================
   طرح الماس شهر بهشت
========================================================= */

function diamondPlanText() {

  return (

    "💎 طرح الماس شهر بهشت\n\n" +

    "با طرح الماس شهر بهشت، بخشی از هزینه سفر شما " +
    "از طریق تسهیلات تأمین می‌شود و می‌توانید مراحل " +
    "درخواست را بدون مراجعه حضوری به شعبه انجام دهید.\n\n" +

    "📌 برای استفاده از طرح:\n\n" +

    "۱️⃣ نصب اپلیکیشن کیوبانک\n" +
    "۲️⃣ تکمیل احراز هویت\n" +
    "۳️⃣ انجام اعتبارسنجی\n" +
    "۴️⃣ دریافت رتبه اعتباری\n\n" +

    "🟢 رتبه A و B:\n" +
    "بدون ضامن؛ خودت ضامن حسابت هستی.\n\n" +

    "🟡 رتبه C و D و پایین‌تر:\n" +
    "یک ضامن + نامه کسر از حقوق + فیش حقوقی\n\n" +

    "⏳ بازپرداخت: ۱۲ ماهه\n\n" +

    "💰 کارمزد/سود: ۳ درصد سود\n\n" +

    "🚫 بدون مراجعه به شعبه\n\n" +

    "📄 مدارک باید به صورت اصل مدارک بارگذاری شود.\n\n" +

    "📌 پس از دریافت رتبه اعتباری، " +
    "کد ملی متقاضی اصلی را ارسال کنید تا ادامه مراحل انجام شود.\n\n" +

    "💳 در درخواست سفر با طرح الماس، پس از طی مراحل " +
    "و تأیید اطلاعات حساب بانکی، مسافر باید " +
    "۴۰٪ هزینه کل سفر را پرداخت کند.\n\n" +

    "🧾 پس از ارسال فیش واریزی و بررسی آن، " +
    "مراحل فعال‌سازی وام برای ایشان انجام می‌شود.\n\n" +

    "📞 پشتیبانی و راهنمایی:\n" +
    "۰۹۱۷۷۷۰۰۹۶۱"

  );
}


async function sendDiamondPlan(
  chatId
) {

  await sendMessage(

    chatId,

    diamondPlanText(),

    {
      inline_keyboard: [

        [
          {
            text:
              "📲 نصب کیوبانک مهر",

            url:
              "https://qbank24.ir/downloads"
          }
        ],

        [
          {
            text:
              "🔙 بازگشت",

            callback_data:
              "DIAMOND_BACK"
          }
        ]

      ]
    }
  );
}
/* =========================================================
   اطلاعات حساب بانکی
========================================================= */

function cashAccountText() {

  return (

    "💵 اطلاعات پرداخت\n\n" +

    "🏦 بانک: مهر ایران\n" +

    "👤 به نام: مهدی رشیدیان طرقی\n\n" +

    "💳 شماره کارت:\n" +
    "6063731161437174\n\n" +

    "🏦 شماره حساب:\n" +
    "363470014517217001\n\n" +

    "🔗 شماره شبا:\n" +
    "IR160600363470014517217001\n\n" +

    "⚠️ پس از پرداخت، تصویر فیش واریزی را ارسال کنید."
  );
}


function diamondPaymentText(
  request
) {

  const total =
    Number(
      request.payload?.totalCost || 0
    );

  if (total > 0) {

    const fortyPercent =
      Math.ceil(
        total * 0.40
      );

    return (

      "💎 درخواست طرح الماس تأیید شد.\n\n" +

      `🆔 درخواست: ${request.request_code}\n\n` +

      `💰 هزینه کل سفر: ${toPersianDigits(total)} تومان\n` +

      `💳 سهم مسافر (۴۰٪): ${toPersianDigits(fortyPercent)} تومان\n\n` +

      "لطفاً ۴۰٪ هزینه کل را پرداخت کنید و " +
      "تصویر فیش واریزی را ارسال نمایید.\n\n" +

      "پس از بررسی فیش، مراحل فعال‌سازی وام انجام می‌شود."
    );

  }

  return (

    "💎 درخواست طرح الماس شما تأیید شد.\n\n" +

    `🆔 شماره درخواست: ${request.request_code}\n\n` +

    "پس از طی مراحل اعتبارسنجی و ارسال اطلاعات حساب بانکی، " +
    "باید ۴۰٪ هزینه کل سفر را پرداخت کنید.\n\n" +

    "🧾 پس از پرداخت، تصویر فیش واریزی را ارسال کنید.\n\n" +

    "پس از بررسی فیش، مراحل فعال‌سازی وام انجام می‌شود."

  );
}
/* =========================================================
   وضعیت ارسال لیست مسافران
========================================================= */

async function askPassengerFile(
  chatId,
  requestCode,
  tourType
) {

  await saveSession(

    chatId,

    "WAITING_PASSENGER_FILE",

    {
      requestCode,
      tourType
    }
  );


  let text = "";

  if (
    tourType === "CARAVAN_BUS" ||
    tourType === "CARAVAN_RAIL"
  ) {

    text =
      "📋 درخواست شما تأیید شد.\n\n" +

      "اکنون لطفاً **فایل لیست کامل مسافران** را ارسال کنید.\n\n" +

      "مشخصات موردنیاز هر مسافر:\n" +

      "👤 نام و نام خانوادگی\n" +

      "🪪 کد ملی\n" +

      "🎂 تاریخ تولد\n\n" +

      "فرمت تاریخ تولد حتماً به صورت زیر باشد:\n" +

      "1362/06/17\n\n" +

      `🆔 شماره درخواست: ${requestCode}`;

  } else {

    text =
      "📋 درخواست شما تأیید شد.\n\n" +

      "لطفاً فایل لیست همراهان را ارسال کنید.\n\n" +

      "مشخصات هر همراه:\n" +

      "👤 نام و نام خانوادگی\n" +

      "🪪 کد ملی\n" +

      "🎂 تاریخ تولد\n\n" +

      "فرمت تاریخ تولد:\n" +

      "1362/06/17\n\n" +

      `🆔 شماره درخواست: ${requestCode}`;
  }


  await sendMessage(
    chatId,
    text
  );
}


/* =========================================================
   ارسال فایل مشتری به گروه مدیران
========================================================= */

async function forwardPassengerDocument(
  message,
  session
) {

  const document =
    message.document;

  if (!document) {
    return false;
  }


  const fileId =
    document.file_id;


  if (!fileId) {
    return false;
  }


  const requestCode =
    session.data.requestCode;


  const caption =

    "📋 فایل لیست مسافران\n\n" +

    `🆔 درخواست: ${requestCode}\n` +

    `👤 کاربر: ${getFirstName(message)}\n` +

    `🔹 ${getUsername(message) || "بدون نام کاربری"}\n` +

    `🆔 Bale ID: ${getUserId(message)}`;


  try {

    await baleRequest(
      "sendDocument",
      {
        chat_id:
          CONFIG.ADMIN_CHAT_ID,

        document:
          fileId,

        caption
      }
    );


    await pool.query(

      `
      UPDATE requests
      SET
        status = 'passenger_file_received',
        updated_at = NOW()
      WHERE request_code = $1
      `,

      [requestCode]
    );


    await clearSession(
      getChatId(message)
    );


    await sendMessage(

      getChatId(message),

      "✅ فایل لیست مسافران با موفقیت برای مدیر ارسال شد.\n\n" +

      `🆔 شماره درخواست: ${requestCode}`,

      mainKeyboard()
    );


    return true;

  } catch (error) {

    console.error(
      "❌ Send passenger file error:",
      error
    );


    await sendMessage(

      getChatId(message),

      "❌ ارسال فایل انجام نشد.\nلطفاً دوباره فایل را ارسال کنید."
    );


    return true;
  }
}
/* =========================================================
   ثبت درخواست تور
========================================================= */

async function submitTourRequest(
  chatId
) {

  const session =
    await getSession(chatId);


  if (!session) {

    await sendMessage(
      chatId,
      "❌ اطلاعات درخواست پیدا نشد. لطفاً دوباره شروع کنید."
    );

    return;
  }


  const data =
    session.data || {};


  const messageInfo =
    session.data.messageInfo || {};


  const requestCode =
    "SMT-" +
    Math.floor(
      1000 +
      Math.random() * 9000
    );


  const payload = {

    tourType:
      data.tourType,

    departureDate:
      data.departureDate,

    returnDate:
      data.returnDate,

    nights:
      data.nights,

    adults:
      data.adults,

    children:
      data.children,

    paymentType:
      data.paymentType,

    applicantName:
      data.applicantName,

    phone:
      data.phone,

    nationalCode:
      data.nationalCode || "",

    totalCost:
      data.totalCost || null
  };


  await pool.query(

    `
    INSERT INTO requests
    (
      request_code,
      user_id,
      chat_id,
      username,
      first_name,
      request_type,
      data,
      status
    )

    VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8)
    `,

    [

      requestCode,

      String(chatId),

      String(chatId),

      messageInfo.username ||
        getUsername(messageInfo) ||
        "ندارد",

      messageInfo.firstName ||
        "کاربر",

      data.tourType,

      JSON.stringify(payload),

      "pending"
    ]
  );


  const typeNames = {

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


  const paymentText =
    data.paymentType === "loan"
      ? "💎 طرح الماس"
      : "💵 نقدی";


  const adminText =

    "📋 درخواست جدید سفر\n\n" +

    `🆔 شماره درخواست: ${requestCode}\n\n` +

    `🚍 نوع سفر: ${typeNames[data.tourType] || data.tourType}\n` +

    `📅 ورود به مشهد: ${data.departureDate}\n` +

    `📅 خروج از مشهد: ${data.returnDate}\n` +

    `🌙 تعداد شب اقامت: ${data.nights} شب\n` +

    `👨 بزرگسال: ${data.adults} نفر\n` +

    `👧 کودک ۳ تا ۵ سال: ${data.children} نفر\n` +

    `💳 پرداخت: ${paymentText}\n\n` +

    `👤 نام و نام خانوادگی: ${data.applicantName}\n` +

    `📱 شماره تماس: ${data.phone}\n` +

    (
      data.paymentType === "loan"
        ? `🪪 کد ملی: ${data.nationalCode}\n`
        : ""
    ) +

    `\n👤 کاربر بله: ${messageInfo.username || "ندارد"}\n` +

    `🆔 Bale ID: ${chatId}`;


  await sendMessage(

    CONFIG.ADMIN_CHAT_ID,

    adminText,

    {
      inline_keyboard: [

        [
          {
            text:
              "✅ تأیید درخواست",

            callback_data:
              `APPROVE_REQUEST:${requestCode}`
          },

          {
            text:
              "❌ رد درخواست",

            callback_data:
              `REJECT_REQUEST:${requestCode}`
          }
        ]

      ]
    }
  );


  await clearSession(
    chatId
  );


  await sendMessage(

    chatId,

    "✅ درخواست شما با موفقیت ثبت شد.\n\n" +

    `🆔 شماره درخواست: ${requestCode}\n\n` +

    "درخواست برای مدیر ارسال شد و پس از بررسی، نتیجه به شما اطلاع داده می‌شود.",

    mainKeyboard()
  );
}
/* =========================================================
   CALLBACK های جدید
========================================================= */

async function handleTourCallback(
  callback
) {

  const data =
    callback.data || "";

  const message =
    callback.message;

  const chatId =
    message?.chat?.id;

  if (!chatId) {
    return true;
  }


  /* انتخاب نوع تور */

  if (data === "TOUR_AIR") {

    await startTourType(
      chatId,
      "AIR"
    );

    return true;
  }


  if (data === "TOUR_RAIL") {

    await startTourType(
      chatId,
      "RAIL"
    );

    return true;
  }


  if (data === "TOUR_BUS") {

    await startTourType(
      chatId,
      "BUS"
    );

    return true;
  }


  if (data === "TOUR_CARAVAN_BUS") {

    await startTourType(
      chatId,
      "CARAVAN_BUS"
    );

    return true;
  }


  if (data === "TOUR_CARAVAN_RAIL") {

    await startTourType(
      chatId,
      "CARAVAN_RAIL"
    );

    return true;
  }


  /* رزرو هتل فعلاً غیرفعال */

  if (data === "TOUR_HOTEL") {

    await sendMessage(

      chatId,

      "🏨 رزرو هتل فعلاً غیرفعال است.\n\n" +
      "لطفاً از بخش تورهای مشهد استفاده کنید."
    );

    return true;
  }


  /* پرداخت نقدی */

  if (
    data === "TOUR_PAYMENT_CASH"
  ) {

    const session =
      await getSession(chatId);


    await askTourName(

      chatId,

      {
        ...session.data,

        paymentType:
          "cash"
      }
    );

    return true;
  }


  /* طرح الماس */

  if (
    data === "TOUR_PAYMENT_LOAN"
  ) {

    const session =
      await getSession(chatId);


    await askTourName(

      chatId,

      {
        ...session.data,

        paymentType:
          "loan"
      }
    );

    return true;
  }


  /* ارسال درخواست */

  if (
    data === "TOUR_SUBMIT"
  ) {

    await submitTourRequest(
      chatId
    );

    return true;
  }


  /* اصلاح */

  if (
    data === "TOUR_EDIT"
  ) {

    const session =
      await getSession(chatId);


    await saveSession(

      chatId,

      "TOUR_DATE",

      session.data
    );


    await sendMessage(

      chatId,

      "📅 لطفاً تاریخ ورود به مشهد را دوباره وارد کنید."
    );

    return true;
  }


  /* لغو */

  if (
    data === "TOUR_CANCEL"
  ) {

    await clearSession(
      chatId
    );


    await sendMessage(

      chatId,

      "❌ درخواست لغو شد.",

      mainKeyboard()
    );

    return true;
  }


  /* بازگشت از طرح الماس */

  if (
    data === "DIAMOND_BACK"
  ) {

    await sendMessage(

      chatId,

      "لطفاً یکی از گزینه‌های منو را انتخاب کنید.",

      mainKeyboard()
    );

    return true;
  }


  return false;
}
/* =========================================================
   تأیید درخواست مدیر
========================================================= */

async function approveRequest(
  chatId,
  code
) {

  if (!isAdmin(chatId)) {
    return;
  }


  const result =
    await pool.query(

      `
      SELECT *
      FROM requests
      WHERE request_code = $1
      `,

      [code]
    );


  if (!result.rows.length) {

    await sendMessage(
      chatId,
      "❌ درخواست پیدا نشد."
    );

    return;
  }


  const request =
    result.rows[0];


  await pool.query(

    `
    UPDATE requests
    SET
      status = 'approved',
      updated_at = NOW()
    WHERE request_code = $1
    `,

    [code]
  );


  await sendMessage(

    chatId,

    `✅ درخواست ${code} تأیید شد.`
  );


  const payload =
    request.data || {};


  /* ================================================
     کاروان / تور هوایی / تور ریلی
  ================================================ */

  const needsPassengerFile =
    [
      "AIR",
      "RAIL",
      "CARAVAN_BUS",
      "CARAVAN_RAIL"
    ].includes(
      payload.tourType
    );


  if (needsPassengerFile) {

    await askPassengerFile(

      request.user_id,

      code,

      payload.tourType
    );
  }


  /* ================================================
     پرداخت نقدی
  ================================================ */

  if (
    request.payment_type ===
    "cash"
  ) {

    await sendMessage(

      request.user_id,

      "✅ درخواست سفر شما توسط مدیر تأیید شد.\n\n" +

      cashAccountText() +

      `\n\n🆔 شماره درخواست: ${code}`
    );
  }


  /* ================================================
     طرح الماس
  ================================================ */

  if (
    request.payment_type ===
    "loan"
  ) {

    await sendMessage(

      request.user_id,

      diamondPaymentText(
        request
      )
    );


    await sendMessage(

      request.user_id,

      "📌 مراحل طرح الماس:\n\n" +

      "۱️⃣ نصب کیوبانک مهر\n" +

      "۲️⃣ تکمیل احراز هویت\n" +

      "۳️⃣ اعتبارسنجی\n" +

      "۴️⃣ دریافت رتبه اعتباری\n\n" +

      "🟢 رتبه A و B: بدون ضامن\n" +

      "🟡 رتبه C و D و پایین‌تر: یک ضامن + نامه کسر از حقوق + فیش حقوقی\n\n" +

      "📄 اصل مدارک باید بارگذاری شود.\n\n" +

      "پس از تکمیل مراحل، اطلاعات حساب بانکی را ارسال کنید.",

      {
        inline_keyboard: [

          [
            {
              text:
                "📲 نصب کیوبانک مهر",

              url:
                "https://qbank24.ir/downloads"
            }
          ]

        ]
      }
    );
  }
}
/* =========================================================
   دریافت پیام
========================================================= */

async function handleMessage(
  message
) {

  const chatId =
    message?.chat?.id;

  if (!chatId) {
    return;
  }


  /* فایل لیست مسافران */

  const session =
    await getSession(chatId);


  if (
    message.document &&
    session?.state ===
      "WAITING_PASSENGER_FILE"
  ) {

    await forwardPassengerDocument(
      message,
      session
    );

    return;
  }


  const text =
    String(
      message.text || ""
    ).trim();


  /* شروع */

  if (
    text === "/start"
  ) {

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

      "🌹 به ربات سفر مشهد توس خوش آمدید.\n\n" +

      "برای دریافت خدمات گردشگری گزینه موردنظر را انتخاب کنید.",

      mainKeyboard()
    );

    return;
  }


  /* منوی اصلی */

  if (
    text === "🚌 تورهای مشهد"
  ) {

    await startTours(
      chatId
    );

    return;
  }


  /* هتل غیرفعال */

  if (
    text === "🏨 رزرو هتل"
  ) {

    await sendMessage(

      chatId,

      "🏨 رزرو هتل فعلاً غیر فعال است.\n\n" +
      "به‌زودی این بخش فعال خواهد شد.",

      mainKeyboard()
    );

    return;
  }


  if(text==="🧮 محاسبات مدیر"){if(isAdmin(chatId))await showManagerCalculations(chatId);return;}

  /* طرح الماس */

  if (
    text ===
      "💎 طرح الماس شهر بهشت"
  ) {

    await sendDiamondPlan(
      chatId
    );

    return;
  }


  /* خدمات */

  if (
    text ===
      "🧳 خدمات گردشگری"
  ) {

    await sendMessage(

      chatId,

      "🧳 خدمات گردشگری\n\n" +

      "✈️ تورهای هوایی\n" +
      "🚆 تورهای ریلی\n" +
      "🚌 تورهای اتوبوسی\n" +
      "🚍 کاروان‌های زیارتی\n" +
      "🏨 رزرو هتل — فعلاً غیرفعال\n\n" +

      `☎️ ${CONFIG.CONTACT.phone}`,

      mainKeyboard()
    );

    return;
  }


  /* تماس */

  if (
    text ===
      "📞 تماس با ما"
  ) {

    await sendMessage(

      chatId,

      "📞 تماس با ما\n\n" +

      `👤 ${CONFIG.CONTACT.name}\n` +

      `☎️ ${CONFIG.CONTACT.phone}`,

      mainKeyboard()
    );

    return;
  }


  /* کانال */

  if (
    text ===
      "📢 کانال"
  ) {

    await sendMessage(

      chatId,

      `📢 کانال سفر مشهد توس\n\n${CONFIG.CHANNEL_URL}`,

      mainKeyboard()
    );

    return;
  }


  if(session&&isAdmin(chatId)){if(await handleRailCalculationText(chatId,text,session))return;if(await handleManagerCalculationText(chatId,text,session))return;}

  /* فرم تور */

  if (session) {

    const handled =
      await handleTourText(
        chatId,
        text,
        session
      );

    if (handled) {
      return;
    }
  }


  await sendMessage(

    chatId,

    "لطفاً یکی از گزینه‌های منو را انتخاب کنید.",

    mainKeyboard()
  );
}
/* =========================================================
   CALLBACK اصلی
========================================================= */

async function handleCallback(
  callback
) {

  const data =
    callback?.data || "";

  const message =
    callback?.message;

  const chatId =
    message?.chat?.id;

  if (!chatId) {
    return;
  }


  console.log(
    "📞 CALLBACK:",
    data,
    "chatId:",
    chatId
  );


  await answerCallback(
    callback.id
  );


  /* Callback تور */

  const tourHandled =
    await handleTourCallback(
      callback
    );

  if (tourHandled) {
    return;
  }


  if(data==="ADMIN_CALC_MENU"){if(!isAdmin(chatId))return;await showManagerCalculations(chatId);return;}
  if(data.startsWith("RAILCALC_ROUTE:")){if(!isAdmin(chatId))return;const route=data.split(":")[1];await saveSession(chatId,"RAILCALC_ADULTS",{route});await sendMessage(chatId,"👨 تعداد بزرگسال را وارد کنید:");return;}
  if(data==="RAILCALC_PRIVATE_YES"||data==="RAILCALC_PRIVATE_NO"){if(!isAdmin(chatId))return;const ss=await getSession(chatId);const d={...(ss?.data||{}),privateCompartment:data==="RAILCALC_PRIVATE_YES"};await saveSession(chatId,"RAILCALC_PAYMENT",d);await sendMessage(chatId,"💳 نوع پرداخت را انتخاب کنید:",{inline_keyboard:[[{text:"💵 نقدی",callback_data:"RAILCALC_CASH"}],[{text:"💎 طرح الماس",callback_data:"RAILCALC_LOAN"}]]});return;}
  if(data==="RAILCALC_CASH"||data==="RAILCALC_LOAN"){if(!isAdmin(chatId))return;const ss=await getSession(chatId);try{const r=PRICING.calculateRailTour({...ss.data,paymentType:data==="RAILCALC_LOAN"?"loan":"cash"});await saveSession(chatId,"MAIN",{});await sendMessage(chatId,PRICING.formatRailCalculation(r),managerCalculationKeyboard());}catch(e){await sendMessage(chatId,"❌ خطا در محاسبه:\n"+e.message,managerCalculationKeyboard());}return;}
  if(data==="ADMIN_RAIL_CALC"){if(!isAdmin(chatId))return;await startRailCalculation(chatId);return;}
  if(data==="ADMIN_AIR_CALC"){if(!isAdmin(chatId))return;await startManualManagerCalc(chatId,"AIR");return;}
  if(data==="ADMIN_BUS_CALC"){if(!isAdmin(chatId))return;await startManualManagerCalc(chatId,"BUS");return;}
  if(data==="ADMIN_CARAVAN_BUS_CALC"){if(!isAdmin(chatId))return;await startManualManagerCalc(chatId,"CARAVAN_BUS");return;}
  if(data==="ADMIN_CARAVAN_RAIL_CALC"){if(!isAdmin(chatId))return;await startManualManagerCalc(chatId,"CARAVAN_RAIL");return;}
  if(data==="ADMIN_HOTEL_CALC"){if(!isAdmin(chatId))return;await startManualManagerCalc(chatId,"HOTEL");return;}
  if(data==="ADMIN_DIAMOND_CALC"){if(!isAdmin(chatId))return;await startManualManagerCalc(chatId,"DIAMOND");return;}
  if(data==="ADMIN_MANUAL_CASH"){if(!isAdmin(chatId))return;await finishManualManagerCalc(chatId,"cash");return;}
  if(data==="ADMIN_MANUAL_LOAN"){if(!isAdmin(chatId))return;await finishManualManagerCalc(chatId,"loan");return;}
  if(data==="ADMIN_CALC_EXIT"){if(!isAdmin(chatId))return;await saveSession(chatId,"MAIN",{});await sendMessage(chatId,"✅ از محاسبات مدیر خارج شدی.",mainKeyboard());return;}

  /* تأیید مدیر */

  if (
    data.startsWith(
      "APPROVE_REQUEST:"
    )
  ) {

    if (
      !isAdmin(chatId)
    ) {
      return;
    }


    const code =
      data.split(":")[1];


    await approveRequest(
      chatId,
      code
    );

    return;
  }


  /* رد درخواست */

  if (
    data.startsWith(
      "REJECT_REQUEST:"
    )
  ) {

    if (
      !isAdmin(chatId)
    ) {
      return;
    }


    const code =
      data.split(":")[1];


    const result =
      await pool.query(

        `
        SELECT *
        FROM requests
        WHERE request_code = $1
        `,

        [code]
      );


    if (
      !result.rows.length
    ) {

      await sendMessage(
        chatId,
        "❌ درخواست پیدا نشد."
      );

      return;
    }


    const request =
      result.rows[0];


    await pool.query(

      `
      UPDATE requests
      SET
        status = 'rejected',
        updated_at = NOW()
      WHERE request_code = $1
      `,

      [code]
    );


    await sendMessage(

      chatId,

      `❌ درخواست ${code} رد شد.`
    );


    await sendMessage(

      request.user_id,

      "❌ درخواست شما توسط مدیر تأیید نشد.\n\n" +

      `🆔 شماره درخواست: ${code}\n\n` +

      `☎️ ${CONFIG.CONTACT.phone}`,

      mainKeyboard()
    );

    return;
  }


  console.log(
    "⚠️ Unknown callback:",
    data
  );
}


/* =========================================================
   WEBHOOK
========================================================= */

app.post(
  "/webhook",

  async (
    req,
    res
  ) => {

    /*
     * پاسخ سریع به بله
     */

    res.sendStatus(200);


    try {

      const update =
        req.body;


      console.log(
        "📩 Bale update:",
        JSON.stringify(
          update,
          null,
          2
        )
      );


      if (
        update.message
      ) {

        await handleMessage(
          update.message
        );
      }


      if (
        update.callback_query
      ) {

        await handleCallback(
          update.callback_query
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


/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/",
  (
    req,
    res
  ) => {

    res.send(
      "Safar Mashhad Toos Bot is running ✅"
    );
  }
);


/* =========================================================
   START
========================================================= */

async function startServer() {

  try {

    await initDB();


    app.listen(

      CONFIG.PORT,

      () => {

        console.log(
          `🚀 Server running on port ${CONFIG.PORT}`
        );

        console.log(
          `👤 ADMIN_CHAT_ID: ${CONFIG.ADMIN_CHAT_ID}`
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
