"use strict";

const { Pool } = require("pg");

const DEFAULT_PRODUCTS = [
  ["stuffed_chicken", "مرغ شکم‌پر نمکی", 900000],
  ["royal_chicken", "چلو مرغ همایونی", 480000],
  ["shrimp", "چلو دوپیازه میگو", 570000],
  ["ghormeh", "چلو قورمه‌سبزی", 400000],
  ["gheimeh_shirazi", "چلو خورشت قیمه شیرازی", 400000],
  ["gheimeh_eggplant", "چلو قیمه بادمجان", 410000],
  ["istanboli", "استانبولی مرغ", 370000],
  ["adas", "عدس‌پلو با سویا", 300000],
  ["zereshk", "زرشک‌پلو با مرغ سسی", 450000],
  ["joojeh", "چلو جوجه", 480000],
  ["plain_rice", "چلو ساده", 130000],
  ["stew_bowl", "کاسه خورشت قیمه", 260000],
  ["ghormeh_bowl", "کاسه خورشت قورمه‌سبزی", 260000]
];

let pool = null;
let enabled = false;
let api = null;
let adminId = "";
let sendMessage = null;
let sendPhoto = null;

function normNumber(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،,\s]/g, "");
}
function faNum(value) { return Number(value || 0).toLocaleString("fa-IR"); }
function money(value) { return `${faNum(value)} تومان`; }
function getChatId(message) { return String(message?.chat?.id || message?.from?.id || ""); }
function userName(message) {
  return [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ").trim() || null;
}
function parseJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value || "{}"); } catch (_) { return fallback; }
}
function isAdmin(chatId) { return !!adminId && String(chatId) === String(adminId); }
function replyKeyboard(rows, extra = {}) {
  return { keyboard: rows.map(row => row.map(item => typeof item === "string" ? ({ text: item }) : item)), resize_keyboard: true, one_time_keyboard: false, is_persistent: true, ...extra };
}
function foodHomeKeyboard() {
  return replyKeyboard([
    ["🍽️ مشاهده منو", "🛒 شروع سفارش"],
    ["🛒 سبد خرید", "📦 پیگیری سفارش"],
    ["📍 نشانی مجموعه", "📞 تماس با مامان حسنا"],
    ["🏠 انتخاب کسب‌وکار"]
  ]);
}
function adminKeyboard() {
  return replyKeyboard([
    ["🧾 سفارش‌های جدید", "💵 در انتظار هزینه پیک"],
    ["🧾 رسیدهای پرداخت", "📦 همه سفارش‌ها"],
    ["📋 فهرست غذاها", "➕ افزودن غذا"],
    ["✏️ ویرایش غذا", "⛔ فعال/غیرفعال غذا"],
    ["📦 تنظیم موجودی", "💰 تغییر قیمت"],
    ["📸 تغییر عکس غذا", "🗑️ حذف از منو"],
    ["📅 منوی امروز", "🕒 منوی فردا"],
    ["💳 تنظیم کارت پرداخت", "📝 توضیح پرداخت"],
    ["🏠 انتخاب پنل مدیریت"]
  ]);
}
function businessKeyboard() {
  return replyKeyboard([
    ["🚌 سفر مشهد توس"],
    ["🍲 غذای خانگی مامان حسنا"]
  ]);
}

async function query(text, params = []) { return pool.query(text, params); }
async function getSession(chatId) {
  const r = await query("SELECT state,data FROM food_sessions WHERE chat_id=$1", [String(chatId)]);
  return r.rows[0] || null;
}
async function saveSession(chatId, state, data = {}) {
  await query(`INSERT INTO food_sessions(chat_id,state,data,updated_at) VALUES($1,$2,$3,NOW())
    ON CONFLICT(chat_id) DO UPDATE SET state=EXCLUDED.state,data=EXCLUDED.data,updated_at=NOW()`,
    [String(chatId), state, JSON.stringify(data)]);
}
async function clearSession(chatId) { await query("DELETE FROM food_sessions WHERE chat_id=$1", [String(chatId)]); }

async function init(options = {}) {
  const connectionString = String(process.env.FOOD_DATABASE_URL || "").trim();
  if (!connectionString) {
    console.warn("⚠️ FOOD_DATABASE_URL is not set; Maman Hosna module is disabled. Travel bot will continue normally.");
    enabled = false;
    return false;
  }
  if (!options.sendMessage || !options.sendPhoto || !options.bale) throw new Error("Food module requires Bale send helpers.");
  sendMessage = options.sendMessage;
  sendPhoto = options.sendPhoto;
  api = options.bale;
  adminId = String(options.adminId || "").trim();
  pool = new Pool({
    connectionString,
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000
  });
  pool.on("error", error => console.error("Maman Hosna database pool error:", error.message));

  await query(`
    CREATE TABLE IF NOT EXISTS products(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customers(
      chat_id TEXT PRIMARY KEY, name TEXT, phone TEXT, address TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders(
      id BIGSERIAL PRIMARY KEY, chat_id TEXT NOT NULL, customer_name TEXT, phone TEXT, address TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb, subtotal INTEGER NOT NULL DEFAULT 0,
      delivery_fee INTEGER, total INTEGER, status TEXT NOT NULL DEFAULT 'در انتظار تعیین هزینه ارسال',
      invoice_sent BOOLEAN NOT NULL DEFAULT FALSE, survey_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS food_sessions(
      chat_id TEXT PRIMARY KEY, state TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS food_settings(
      setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Additive-only migration: no existing food, customer, or order rows are deleted or rewritten.
  const additions = [
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_file_id TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS menu_today BOOLEAN NOT NULL DEFAULT TRUE",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS menu_tomorrow BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS address TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee INTEGER",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS total INTEGER",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'در انتظار تعیین هزینه ارسال'",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_sent BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_file_id TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_type TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_note TEXT",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()"
  ];
  for (const statement of additions) await query(statement);

  // مقدار اولیه کارت مامان حسنا؛ فقط در صورت نبودن تنظیم قبلی ثبت می‌شود.
  await query(`INSERT INTO food_settings(setting_key,setting_value,updated_at) VALUES
    ('bank_name','بانک مسکن',NOW()),
    ('card_number','6280231395242646',NOW()),
    ('card_owner','خانم گرگی',NOW())
    ON CONFLICT(setting_key) DO NOTHING`);

  for (const [id, name, price] of DEFAULT_PRODUCTS) {
    await query(`INSERT INTO products(id,name,price,stock) VALUES($1,$2,$3,0)
      ON CONFLICT(id) DO NOTHING`, [id, name, price]);
  }
  enabled = true;
  console.log("✅ Maman Hosna module connected to its separate database.");
  return true;
}

async function getProducts() {
  const r = await query(`SELECT id,name,price,stock,photo_file_id,active,menu_today,menu_tomorrow
    FROM products ORDER BY array_position(ARRAY[
      'stuffed_chicken','royal_chicken','shrimp','ghormeh','gheimeh_shirazi','gheimeh_eggplant',
      'istanboli','adas','zereshk','joojeh','plain_rice','stew_bowl','ghormeh_bowl'
    ], id), name`);
  return r.rows;
}
async function getProduct(id) {
  return (await query("SELECT * FROM products WHERE id=$1", [String(id)])).rows[0] || null;
}
async function getSetting(key) {
  const r = await query("SELECT setting_value FROM food_settings WHERE setting_key=$1", [key]);
  return r.rows[0]?.setting_value || "";
}
async function setSetting(key, value) {
  await query(`INSERT INTO food_settings(setting_key,setting_value,updated_at) VALUES($1,$2,NOW())
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`, [key, String(value ?? "")]);
}

function productCaption(p) {
  const available = p.active !== false && Number(p.stock) > 0;
  return `🍲 ${p.name}\n💰 قیمت هر پرس: ${money(p.price)}\n📦 موجودی: ${faNum(p.stock)} عدد\n${available ? "✅ قابل سفارش" : "⛔ فعلاً ناموجود"}`;
}
function menuInline(products) {
  const rows = [];
  for (const p of products) {
    const available = p.active !== false && Number(p.stock) > 0;
    const label = `${available ? "➕" : "⛔"} ${p.name} | ${faNum(p.price)} ت`;
    rows.push([{ text: label.slice(0, 64), callback_data: available ? `FOOD_ADD:${p.id}` : `FOOD_INFO:${p.id}` }]);
  }
  rows.push([{ text: "🛒 مشاهده سبد خرید", callback_data: "FOOD_CART" }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "FOOD_HOME" }]);
  return { inline_keyboard: rows };
}
function cartText(cart) {
  if (!cart?.length) return "🛒 سبد خرید شما خالی است.";
  const lines = cart.map(i => `• ${i.name} × ${faNum(i.quantity)} = ${money(i.unit_price * i.quantity)}`);
  const sum = cart.reduce((n, i) => n + Number(i.unit_price) * Number(i.quantity), 0);
  return `🛒 سبد خرید شما\n\n${lines.join("\n")}\n\nجمع غذاها: ${money(sum)}\n\nبرای کم یا زیاد کردن تعداد از دکمه‌های زیر استفاده کنید.`;
}
function cartKeyboard(cart) {
  const rows = [];
  for (const item of cart) rows.push([
    { text: `➖ ${item.name}`, callback_data: `FOOD_MINUS:${item.product_id}` },
    { text: `${faNum(item.quantity)} عدد`, callback_data: `FOOD_NOOP` },
    { text: `➕ ${item.name}`, callback_data: `FOOD_ADD:${item.product_id}` }
  ]);
  rows.push([{ text: "✅ ادامه و ثبت سفارش", callback_data: "FOOD_CHECKOUT" }]);
  rows.push([{ text: "🍽️ بازگشت به منو", callback_data: "FOOD_MENU" }]);
  return { inline_keyboard: rows };
}
async function showMenu(chatId) {
  const products = await getProducts();
  const availableCount = products.filter(p => p.active !== false && Number(p.stock) > 0).length;
  await sendMessage(chatId,
    `🍲 منوی غذای خانگی مامان حسنا\n\nهمه غذاها نمایش داده می‌شوند؛ غذاهای ناموجود یا غیرفعال قابل مشاهده‌اند اما امکان سفارش ندارند.\n✅ غذاهای قابل سفارش: ${faNum(availableCount)} از ${faNum(products.length)}`,
    foodHomeKeyboard());
  for (const p of products) {
    const available = p.active !== false && Number(p.stock) > 0;
    const markup = { inline_keyboard: [[{ text: available ? `➕ افزودن به سبد (${faNum(p.stock)} موجود)` : "⛔ فعلاً ناموجود", callback_data: available ? `FOOD_ADD:${p.id}` : `FOOD_INFO:${p.id}` }]] };
    if (p.photo_file_id) await sendPhoto(chatId, p.photo_file_id, productCaption(p), markup);
    else await sendMessage(chatId, productCaption(p), markup);
  }
  await sendMessage(chatId, "برای مشاهده سبد خرید یا ادامه ثبت سفارش از دکمه زیر استفاده کنید:", { inline_keyboard: [[{ text: "🛒 مشاهده سبد خرید", callback_data: "FOOD_CART" }]] });
}
async function showCart(chatId) {
  const s = await getSession(chatId);
  const cart = Array.isArray(s?.data?.cart) ? s.data.cart : [];
  return sendMessage(chatId, cartText(cart), cartKeyboard(cart));
}
async function showHome(chatId, name = "") {
  await clearSession(chatId);
  await sendMessage(chatId,
    `🍲 به بخش مستقل «غذای خانگی مامان حسنا» خوش آمدید${name ? `، ${name}` : ""}.\n\nتهیه و سفارش غذاهای خانگی با طعم اصیل ایرانی، ویژه همشهریان عزیز شهر بوشهر.\n📍 ثبت سفارش و ارسال فقط داخل شهر بوشهر انجام می‌شود.\n\nاز دکمه‌های زیر برای مشاهده منو و ثبت سفارش استفاده کنید.`,
    foodHomeKeyboard());
}

function extractPhoto(message) {
  const photos = message?.photo;
  if (!Array.isArray(photos) || !photos.length) return null;
  return photos[photos.length - 1]?.file_id || null;
}
function extractDocument(message) { return message?.document?.file_id || null; }

async function sendAdminOrder(orderId, intro = "🛒 سفارش جدید مامان حسنا") {
  if (!adminId) return;
  const row = (await query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!row) return;
  const items = Array.isArray(row.items) ? row.items : parseJson(row.items, []);
  const itemLines = items.map(i => `• ${i.name} × ${faNum(i.quantity)} = ${money(Number(i.unit_price) * Number(i.quantity))}`).join("\n");
  const mapUrl = row.latitude != null && row.longitude != null
    ? `https://maps.google.com/?q=${row.latitude},${row.longitude}` : "";
  const inline = [];
  if (row.status === "در انتظار تعیین هزینه ارسال") inline.push([{ text: `💵 تعیین هزینه پیک سفارش #${row.id}`, callback_data: `FOODADMIN_FEE:${row.id}` }]);
  if (row.receipt_file_id) inline.push([{ text: `✅ تأیید پرداخت #${row.id}`, callback_data: `FOODADMIN_PAID:${row.id}` }, { text: `⚠️ رد رسید #${row.id}`, callback_data: `FOODADMIN_REJECT:${row.id}` }]);
  if (["فاکتور صادر شده", "پرداخت تأیید شد"].includes(row.status)) inline.push([{ text: `🍳 شروع آماده‌سازی #${row.id}`, callback_data: `FOODADMIN_PREP:${row.id}` }]);
  if (row.status === "در حال آماده‌سازی") inline.push([{ text: `🥘 آماده تحویل #${row.id}`, callback_data: `FOODADMIN_READY:${row.id}` }]);
  if (row.status === "آماده تحویل") inline.push([{ text: `🚚 تحویل به پیک #${row.id}`, callback_data: `FOODADMIN_SENT:${row.id}` }]);
  if (row.status === "ارسال‌شده") inline.push([{ text: `✅ تحویل شد #${row.id}`, callback_data: `FOODADMIN_DELIVERED:${row.id}` }]);
  if (!["تحویل‌شده", "لغو شده"].includes(row.status)) inline.push([{ text: `❌ لغو سفارش #${row.id} و برگشت موجودی`, callback_data: `FOODADMIN_CANCEL:${row.id}` }]);
  inline.push([{ text: "📋 پنل مدیریت غذا", callback_data: "FOODADMIN_HOME" }]);
  const locationLine = row.latitude != null && row.longitude != null
    ? `\n📍 مختصات: ${row.latitude}, ${row.longitude}\n🗺️ نقشه: ${mapUrl}` : "\n📍 موقعیت نقشه: ثبت نشده";
  const feeLine = row.delivery_fee == null ? "هزینه پیک: در انتظار تعیین" : `هزینه پیک: ${money(row.delivery_fee)}`;
  const totalLine = row.total == null ? "مبلغ نهایی: پس از تعیین هزینه پیک" : `مبلغ نهایی: ${money(row.total)}`;
  await sendMessage(adminId,
    `${intro} #${row.id}\n👤 مشتری: ${row.customer_name || "ثبت نشده"}\n🆔 شناسه بله: ${row.chat_id}\n☎️ تلفن: ${row.phone || "ثبت نشده"}\n🏠 نشانی: ${row.address || "ثبت نشده"}${locationLine}\n\n${itemLines}\n\nجمع غذاها: ${money(row.subtotal)}\n${feeLine}\n${totalLine}\n📌 وضعیت: ${row.status}`,
    { inline_keyboard: inline });
  if (row.latitude != null && row.longitude != null) {
    try { await api("sendLocation", { chat_id: adminId, latitude: Number(row.latitude), longitude: Number(row.longitude) }); }
    catch (e) { console.warn("Could not send food order location pin:", e.message); }
  }
  if (row.receipt_file_id) {
    try {
      if (row.receipt_type === "document") await api("sendDocument", { chat_id: adminId, document: row.receipt_file_id, caption: `🧾 رسید پرداخت سفارش #${row.id}` });
      else await sendPhoto(adminId, row.receipt_file_id, `🧾 رسید پرداخت سفارش #${row.id}`);
    } catch (e) { console.error("Food receipt forwarding failed:", e.message); }
  }
}

async function cancelOrderAndRestoreStock(orderId) {
  const client = await pool.connect();
  let order = null;
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId]);
    order = result.rows[0] || null;
    if (!order) throw new Error("سفارش پیدا نشد.");
    if (["تحویل‌شده", "لغو شده"].includes(order.status)) {
      await client.query("ROLLBACK");
      return { order, changed: false };
    }
    const items = Array.isArray(order.items) ? order.items : parseJson(order.items, []);
    for (const item of items) {
      if (item.product_id) {
        await client.query("UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2", [Math.max(0, Number(item.quantity) || 0), String(item.product_id)]);
      }
    }
    await client.query("UPDATE orders SET status='لغو شده',updated_at=NOW() WHERE id=$1", [orderId]);
    await client.query("COMMIT");
    return { order, changed: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function beginCheckout(chatId, cart) {
  if (!cart.length) return sendMessage(chatId, "سبد خرید خالی است. ابتدا از منو غذا انتخاب کنید.", foodHomeKeyboard());
  await saveSession(chatId, "checkout_phone", { cart });
  await sendMessage(chatId,
    "برای ثبت سفارش، شماره تماس خود را ارسال کنید. می‌توانید شماره را بنویسید یا دکمه ارسال شماره تماس را بزنید.",
    replyKeyboard([[{ text: "📱 ارسال شماره تماس", request_contact: true }], ["🔙 بازگشت به سبد خرید"], ["🏠 انتخاب کسب‌وکار"]]));
}
async function askAddress(chatId, data) {
  await saveSession(chatId, "checkout_address", data);
  await sendMessage(chatId, "حالا نشانی دقیق و کامل تحویل غذا را بنویسید؛ نام خیابان، کوچه، پلاک و واحد را در صورت وجود ذکر کنید.",
    replyKeyboard([["🔙 بازگشت به سبد خرید"], ["🏠 انتخاب کسب‌وکار"]]));
}
async function askLocation(chatId, data) {
  await saveSession(chatId, "checkout_location", data);
  await sendMessage(chatId,
    "اکنون موقعیت دقیق محل تحویل را از روی نقشه ارسال کنید.\n\nدر پایین صفحه دکمه «📍 ارسال موقعیت مکانی» را بزنید و محل تحویل را روی نقشه انتخاب کنید. ثبت سفارش پس از دریافت هر دو مورد، یعنی نشانی متنی و موقعیت نقشه، انجام می‌شود.",
    replyKeyboard([[{ text: "📍 ارسال موقعیت مکانی", request_location: true }], ["🔙 بازگشت به سبد خرید"], ["🏠 انتخاب کسب‌وکار"]]));
}
async function createOrder(chatId, message, data) {
  const cart = Array.isArray(data.cart) ? data.cart : [];
  const client = await pool.connect();
  let orderId;
  let subtotal = 0;
  try {
    await client.query("BEGIN");
    const finalItems = [];
    for (const item of cart) {
      const p = (await client.query("SELECT id,name,price,stock,active FROM products WHERE id=$1 FOR UPDATE", [item.product_id])).rows[0];
      const quantity = Number(item.quantity);
      if (!p || !p.active || !Number.isInteger(quantity) || quantity < 1 || Number(p.stock) < quantity) {
        throw new Error(`موجودی غذای «${p?.name || item.name}» کافی نیست. لطفاً سبد را اصلاح کنید.`);
      }
      await client.query("UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2", [quantity, p.id]);
      const unitPrice = Number(p.price);
      subtotal += unitPrice * quantity;
      finalItems.push({ product_id: p.id, name: p.name, quantity, unit_price: unitPrice });
    }
    await client.query(`INSERT INTO customers(chat_id,name,phone,address,updated_at)
      VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(chat_id) DO UPDATE SET
      name=COALESCE(EXCLUDED.name,customers.name),phone=EXCLUDED.phone,address=EXCLUDED.address,updated_at=NOW()`,
      [String(chatId), userName(message), data.phone, data.address]);
    const inserted = await client.query(`INSERT INTO orders(
      chat_id,customer_name,phone,address,items,subtotal,status,latitude,longitude,created_at,updated_at
    ) VALUES($1,$2,$3,$4,$5::jsonb,$6,'در انتظار تعیین هزینه ارسال',$7,$8,NOW(),NOW()) RETURNING id`,
      [String(chatId), userName(message), data.phone, data.address, JSON.stringify(finalItems), subtotal, data.latitude, data.longitude]);
    orderId = inserted.rows[0].id;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }

  await clearSession(chatId);
  await sendMessage(chatId,
    `✅ سفارش شما با موفقیت ثبت شد.\n\n🧾 شماره سفارش: #${orderId}\nجمع غذاها: ${money(subtotal)}\nهزینه پیک: پس از بررسی مدیریت اعلام می‌شود.\n\nپس از تعیین هزینه ارسال، فاکتور نهایی و شماره کارت برای شما ارسال خواهد شد.`,
    foodHomeKeyboard());
  await sendAdminOrder(orderId, "🛒 سفارش جدید؛ لطفاً هزینه پیک را تعیین کنید");
}

async function issueInvoice(orderId, deliveryFee) {
  const row = (await query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  if (!row) throw new Error("سفارش پیدا نشد.");
  if (row.status !== "در انتظار تعیین هزینه ارسال") throw new Error(`وضعیت سفارش «${row.status}» است و امکان صدور فاکتور جدید وجود ندارد.`);
  const fee = Number(deliveryFee);
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000000) throw new Error("هزینه پیک معتبر نیست.");
  const bank = await getSetting("bank_name");
  const card = normNumber(await getSetting("card_number"));
  const owner = await getSetting("card_owner");
  if (!/^\d{16}$/.test(card) || !owner) throw new Error("ابتدا از پنل مدیریت غذا، شماره کارت ۱۶ رقمی، نام صاحب کارت و بانک مامان حسنا را ثبت کنید.");
  const note = await getSetting("payment_note");
  const total = Number(row.subtotal || 0) + fee;
  await query(`UPDATE orders SET delivery_fee=$1,total=$2,status='فاکتور صادر شده',invoice_sent=TRUE,updated_at=NOW() WHERE id=$3`, [fee, total, orderId]);
  const items = Array.isArray(row.items) ? row.items : parseJson(row.items, []);
  const lines = items.map(i => `• ${i.name} × ${faNum(i.quantity)} = ${money(i.unit_price * i.quantity)}`).join("\n");
  const cardText = `\n💳 اطلاعات واریز\nبانک: ${bank || "ثبت نشده"}\nشماره کارت: ${card}\nبه نام: ${owner}`;
  await sendMessage(row.chat_id,
    `🧾 فاکتور نهایی سفارش #${orderId}\n\n${lines}\n\nجمع غذاها: ${money(row.subtotal)}\nهزینه پیک: ${money(fee)}\n━━━━━━━━━━━━\n💰 مبلغ قابل پرداخت: ${money(total)}${cardText}${note ? `\n\n${note}` : ""}\n\nپس از واریز، تصویر یا فایل رسید را همین‌جا ارسال کنید.`,
    foodHomeKeyboard());
  await saveSession(row.chat_id, "await_receipt", { orderId });
}

async function listOrders(chatId, where, title) {
  const rows = (await query(`SELECT id,customer_name,status,total,created_at FROM orders WHERE ${where} ORDER BY id DESC LIMIT 15`)).rows;
  if (!rows.length) return sendMessage(chatId, `در حال حاضر ${title} وجود ندارد.`, adminKeyboard());
  for (const r of rows) {
    await sendMessage(chatId, `🧾 سفارش #${r.id}\n👤 ${r.customer_name || "مشتری"}\n📌 ${r.status}\n💰 ${r.total == null ? "مبلغ نهایی تعیین نشده" : money(r.total)}\n📅 ${new Date(r.created_at).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}`, {
      inline_keyboard: [[{ text: `🔎 مشاهده جزئیات #${r.id}`, callback_data: `FOODADMIN_VIEW:${r.id}` }]]
    });
  }
}

async function showAdminHome(chatId) {
  await saveSession(chatId, "admin_home", {});
  await sendMessage(chatId,
    "🍲 پنل مدیریت مستقل غذای خانگی مامان حسنا\n\nاز این پنل می‌توانید سفارش‌ها، منو، قیمت، موجودی، عکس غذاها، منوی امروز و فردا و اطلاعات پرداخت را با موبایل مدیریت کنید.",
    adminKeyboard());
}
async function showProductList(chatId, mode = "view") {
  const products = await getProducts();
  const labels = products.map(p => {
    const status = p.active === false ? "⛔ غیرفعال" : Number(p.stock) > 0 ? `✅ موجودی ${faNum(p.stock)}` : "ناموجود";
    return [{ text: `${p.name} | ${money(p.price)} | ${status}`.slice(0, 60), callback_data: `FOODADMIN_PRODUCT:${mode}:${p.id}` }];
  });
  labels.push([{ text: "🔙 پنل مدیریت", callback_data: "FOODADMIN_HOME" }]);
  return sendMessage(chatId, "غذا را از فهرست انتخاب کنید:", { inline_keyboard: labels });
}
async function showDailyMenu(chatId, which) {
  const products = await getProducts();
  const today = which === "today";
  const rows = products.map(p => [{
    text: `${(today ? p.menu_today : p.menu_tomorrow) ? "✅" : "⬜"} ${p.name}`.slice(0, 60),
    callback_data: `FOODADMIN_TOGGLE:${which}:${p.id}`
  }]);
  rows.push([{ text: "🔙 پنل مدیریت", callback_data: "FOODADMIN_HOME" }]);
  await sendMessage(chatId, `📅 مدیریت منوی ${today ? "امروز" : "فردا"}\n\nروی هر غذا بزنید تا در منوی ${today ? "امروز" : "فردا"} فعال یا غیرفعال شود.\n\nنکته: طبق تنظیم شما، در منوی مشتری همه غذاها نمایش داده می‌شوند؛ وضعیت موجودی و فعال/غیرفعال بودن کنار هر غذا مشخص است.`, { inline_keyboard: rows });
}

async function handleAdminMessage(chatId, message, session, text) {
  const data = session?.data || {};
  const photoId = extractPhoto(message);
  if (session?.state === "admin_add_photo") {
    if (photoId) {
      await query("UPDATE products SET photo_file_id=$1,updated_at=NOW() WHERE id=$2", [photoId, data.productId]);
      await clearSession(chatId);
      await sendMessage(chatId, "✅ غذا همراه با تصویر ذخیره شد.", adminKeyboard());
      return true;
    }
    if (["⏭️ بدون عکس", "بدون عکس", "رد شدن"].includes(text)) {
      await clearSession(chatId);
      await sendMessage(chatId, "✅ غذا بدون عکس ذخیره شد.", adminKeyboard());
      return true;
    }
    await sendMessage(chatId, "لطفاً عکس غذا را از گالری ارسال کنید یا «⏭️ بدون عکس» را بزنید.", replyKeyboard([["⏭️ بدون عکس"], ["🏠 انتخاب پنل مدیریت"]]));
    return true;
  }
  if (session?.state === "admin_edit_photo") {
    if (!photoId) {
      await sendMessage(chatId, "لطفاً تصویر جدید را از گالری ارسال کنید.", adminKeyboard());
      return true;
    }
    await query("UPDATE products SET photo_file_id=$1,updated_at=NOW() WHERE id=$2", [photoId, data.productId]);
    await clearSession(chatId);
    await sendMessage(chatId, "✅ تصویر غذا به‌روزرسانی شد.", adminKeyboard());
    return true;
  }
  if (session?.state === "admin_bank_card") {
    if (text.length < 16) return sendMessage(chatId, "شماره کارت ۱۶ رقمی را وارد کنید.", adminKeyboard()).then(() => true);
    const digits = normNumber(text);
    if (!/^\d{16}$/.test(digits)) { await sendMessage(chatId, "شماره کارت باید دقیقاً ۱۶ رقم باشد.", adminKeyboard()); return true; }
    await setSetting("card_number", digits);
    await saveSession(chatId, "admin_bank_owner", {});
    await sendMessage(chatId, "نام صاحب کارت را وارد کنید:", adminKeyboard());
    return true;
  }
  if (session?.state === "admin_bank_owner") {
    if (text.length < 3) { await sendMessage(chatId, "نام صاحب کارت را کامل وارد کنید.", adminKeyboard()); return true; }
    await setSetting("card_owner", text);
    await saveSession(chatId, "admin_bank_name", {});
    await sendMessage(chatId, "نام بانک را وارد کنید (مثلاً مهر ایران):", adminKeyboard());
    return true;
  }
  if (session?.state === "admin_bank_name") {
    await setSetting("bank_name", text);
    await clearSession(chatId);
    await sendMessage(chatId, "✅ اطلاعات کارت پرداخت ذخیره شد.", adminKeyboard());
    return true;
  }
  if (session?.state === "admin_bank_note") {
    await setSetting("payment_note", text === "حذف" ? "" : text.slice(0, 500));
    await clearSession(chatId);
    await sendMessage(chatId, text === "حذف" ? "✅ توضیح پرداخت پاک شد." : "✅ توضیح پرداخت ذخیره شد.", adminKeyboard());
    return true;
  }
  if (session?.state === "admin_fee_entry") {
    const fee = Number(normNumber(text));
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 100000000) { await sendMessage(chatId, "هزینه پیک را فقط به‌صورت عدد معتبر و به تومان وارد کنید. برای ارسال رایگان عدد ۰ را بفرستید.", adminKeyboard()); return true; }
    try {
      await issueInvoice(data.orderId, fee);
      await clearSession(chatId);
      await sendMessage(chatId, `✅ فاکتور نهایی سفارش #${data.orderId} برای مشتری ارسال شد.`, adminKeyboard());
    } catch (error) {
      await sendMessage(chatId, `⚠️ فاکتور ارسال نشد: ${error.message}`, adminKeyboard());
    }
    return true;
  }
  if (session?.state === "admin_add_name") {
    if (text.length < 2 || text.length > 80) { await sendMessage(chatId, "نام غذا را بین ۲ تا ۸۰ نویسه وارد کنید.", adminKeyboard()); return true; }
    await saveSession(chatId, "admin_add_price", { name: text.trim() });
    await sendMessage(chatId, `قیمت «${text.trim()}» را به تومان وارد کنید. نمونه: ۴۸۰۰۰۰`, adminKeyboard());
    return true;
  }
  if (session?.state === "admin_add_price") {
    const price = Number(normNumber(text));
    if (!Number.isSafeInteger(price) || price < 1 || price > 100000000) { await sendMessage(chatId, "قیمت معتبر به تومان وارد کنید.", adminKeyboard()); return true; }
    await saveSession(chatId, "admin_add_stock", { ...data, price });
    await sendMessage(chatId, "موجودی اولیه را به تعداد پرس وارد کنید. برای ناموجود بودن عدد ۰ را بفرستید.", adminKeyboard());
    return true;
  }
  if (session?.state === "admin_add_stock") {
    const stock = Number(normNumber(text));
    if (!Number.isSafeInteger(stock) || stock < 0 || stock > 100000) { await sendMessage(chatId, "موجودی باید عددی از صفر به بالا باشد.", adminKeyboard()); return true; }
    const id = `food_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await query(`INSERT INTO products(id,name,price,stock,active,menu_today,menu_tomorrow,created_at,updated_at)
      VALUES($1,$2,$3,$4,TRUE,TRUE,FALSE,NOW(),NOW())`, [id, data.name, data.price, stock]);
    await saveSession(chatId, "admin_add_photo", { productId: id });
    await sendMessage(chatId, `✅ «${data.name}» ثبت شد. حالا عکس غذا را از گالری گوشی ارسال کنید؛ اگر فعلاً عکس ندارید، «⏭️ بدون عکس» را بزنید.`, replyKeyboard([["⏭️ بدون عکس"], ["🏠 انتخاب پنل مدیریت"]]));
    return true;
  }
  if (session?.state === "admin_edit_name") {
    if (text.length < 2 || text.length > 80) { await sendMessage(chatId, "نام غذا معتبر نیست.", adminKeyboard()); return true; }
    await query("UPDATE products SET name=$1,updated_at=NOW() WHERE id=$2", [text.trim(), data.productId]);
    await clearSession(chatId); await sendMessage(chatId, "✅ نام غذا تغییر کرد.", adminKeyboard()); return true;
  }
  if (session?.state === "admin_edit_price" || session?.state === "admin_edit_stock") {
    const value = Number(normNumber(text));
    const min = session.state === "admin_edit_price" ? 1 : 0;
    if (!Number.isSafeInteger(value) || value < min || value > 100000000) { await sendMessage(chatId, "عدد معتبر وارد کنید.", adminKeyboard()); return true; }
    const column = session.state === "admin_edit_price" ? "price" : "stock";
    await query(`UPDATE products SET ${column}=$1,updated_at=NOW() WHERE id=$2`, [value, data.productId]);
    await clearSession(chatId); await sendMessage(chatId, "✅ اطلاعات غذا به‌روزرسانی شد.", adminKeyboard()); return true;
  }
  if (session?.state === "admin_order_note") {
    await query("UPDATE orders SET admin_note=$1,updated_at=NOW() WHERE id=$2", [text.slice(0, 1000), data.orderId]);
    await clearSession(chatId); await sendMessage(chatId, "✅ یادداشت سفارش ذخیره شد.", adminKeyboard()); return true;
  }
  if (session?.state?.startsWith("admin_")) {
    if (text === "🏠 انتخاب پنل مدیریت") { await clearSession(chatId); await sendMessage(chatId, "پنل موردنظر را انتخاب کنید.", replyKeyboard([["🧮 مدیریت سفر", "🍲 مدیریت غذا"]])); return true; }
    return false;
  }
  return false;
}

async function handleCustomerMessage(chatId, message, session, text) {
  const data = session?.data || {};
  if (session?.state === "checkout_phone") {
    if (text === "🔙 بازگشت به سبد خرید") return showCart(chatId).then(() => true);
    const phone = String(message?.contact?.phone_number || text).replace(/[\s()-]/g, "");
    if (!/^[+0-9۰-۹٠-٩]{8,18}$/.test(phone)) { await sendMessage(chatId, "شماره تماس معتبر وارد کنید یا دکمه ارسال شماره تماس را بزنید.", replyKeyboard([[{ text: "📱 ارسال شماره تماس", request_contact: true }], ["🔙 بازگشت به سبد خرید"]])); return true; }
    await askAddress(chatId, { ...data, phone }); return true;
  }
  if (session?.state === "checkout_address") {
    if (text === "🔙 بازگشت به سبد خرید") return showCart(chatId).then(() => true);
    if (text.length < 8) { await sendMessage(chatId, "نشانی کوتاه است. لطفاً آدرس دقیق‌تر همراه خیابان، کوچه و پلاک را وارد کنید."); return true; }
    await askLocation(chatId, { ...data, address: text }); return true;
  }
  if (session?.state === "checkout_location") {
    if (text === "🔙 بازگشت به سبد خرید") return showCart(chatId).then(() => true);
    if (!message?.location) { await sendMessage(chatId, "برای ادامه حتماً موقعیت مکانی را با دکمه «📍 ارسال موقعیت مکانی» ارسال کنید.", replyKeyboard([[{ text: "📍 ارسال موقعیت مکانی", request_location: true }], ["🔙 بازگشت به سبد خرید"]])); return true; }
    try {
      await createOrder(chatId, message, { ...data, latitude: message.location.latitude, longitude: message.location.longitude });
    } catch (error) {
      await sendMessage(chatId, `⚠️ سفارش ثبت نشد: ${error.message}\n\nبه منو برگردید و سبد خرید را اصلاح کنید.`, foodHomeKeyboard());
    }
    return true;
  }
  if (session?.state === "await_receipt") {
    const photoId = extractPhoto(message); const documentId = extractDocument(message);
    if (!photoId && !documentId) { await sendMessage(chatId, "لطفاً تصویر یا فایل رسید واریز را همین‌جا ارسال کنید.", foodHomeKeyboard()); return true; }
    const fileId = photoId || documentId; const type = photoId ? "photo" : "document";
    await query("UPDATE orders SET receipt_file_id=$1,receipt_type=$2,status='رسید دریافت شد',updated_at=NOW() WHERE id=$3 AND chat_id=$4", [fileId, type, data.orderId, String(chatId)]);
    await clearSession(chatId);
    await sendMessage(chatId, `✅ رسید سفارش #${data.orderId} دریافت شد و برای بررسی به مدیریت ارسال شد.`, foodHomeKeyboard());
    await sendAdminOrder(data.orderId, "🧾 رسید پرداخت جدید؛ بررسی مدیریت لازم است");
    return true;
  }
  if (session?.state === "customer_order") {
    if (text === "🛒 سبد خرید") return showCart(chatId).then(() => true);
  }
  if (text === "🍽️ مشاهده منو" || text === "🛒 شروع سفارش") {
    if (text === "🛒 شروع سفارش") await saveSession(chatId, "customer_order", { cart: [] });
    return showMenu(chatId).then(() => true);
  }
  if (text === "🛒 سبد خرید") return showCart(chatId).then(() => true);
  if (text === "📦 پیگیری سفارش") {
    const rows = (await query("SELECT id,status,total,created_at FROM orders WHERE chat_id=$1 ORDER BY id DESC LIMIT 10", [String(chatId)])).rows;
    await sendMessage(chatId, rows.length ? rows.map(r => `🧾 سفارش #${r.id}\n📌 وضعیت: ${r.status}\n💰 مبلغ: ${r.total == null ? "در انتظار تعیین هزینه پیک" : money(r.total)}\n📅 ${new Date(r.created_at).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" })}`).join("\n\n") : "هنوز سفارشی ثبت نکرده‌اید.", foodHomeKeyboard()); return true;
  }
  if (text === "📍 نشانی مجموعه") { await sendMessage(chatId, "📍 نشانی مجموعه مامان حسنا:\nبرای مشاهده موقعیت روی نقشه، لینک زیر را باز کنید:\nhttps://nshn.ir/rbEeWfOx7eoI\n\n🚚 سفارش و ارسال غذا فقط در محدوده شهر بوشهر انجام می‌شود.", foodHomeKeyboard()); return true; }
  if (text === "📞 تماس با مامان حسنا") { await sendMessage(chatId, "☎️ تماس با مامان حسنا\n۰۹۱۷۷۷۰۰۹۶۱\n۰۹۱۷۹۰۶۸۵۴۴", foodHomeKeyboard()); return true; }
  if (text === "🏠 انتخاب کسب‌وکار") { await clearSession(chatId); await sendMessage(chatId, "یکی از دو کسب‌وکار را انتخاب کنید.", businessKeyboard()); return true; }
  if (text === "🍲 غذای خانگی مامان حسنا") { await showHome(chatId, userName(message)); return true; }
  return false;
}

async function handleMessage(message) {
  if (!enabled || !message || message.chat?.type === "channel" || message.from?.is_bot) return false;
  const chatId = getChatId(message);
  if (!chatId) return false;
  const text = String(message.text || "").trim();
  const session = await getSession(chatId);
  if (isAdmin(chatId)) {
    if (text === "🍲 مدیریت غذا" || text === "🍲 غذای خانگی مامان حسنا") { await showAdminHome(chatId); return true; }
    if (text === "/foodadmin" || text === "📊 پنل مدیریت غذا") { await showAdminHome(chatId); return true; }
    if (session?.state?.startsWith("admin_") || [
      "🧾 سفارش‌های جدید", "💵 در انتظار هزینه پیک", "🧾 رسیدهای پرداخت", "📦 همه سفارش‌ها",
      "📋 فهرست غذاها", "➕ افزودن غذا", "✏️ ویرایش غذا", "⛔ فعال/غیرفعال غذا", "🗑️ حذف از منو",
      "📦 تنظیم موجودی", "💰 تغییر قیمت", "📸 تغییر عکس غذا", "📅 منوی امروز", "🕒 منوی فردا",
      "💳 تنظیم کارت پرداخت", "📝 توضیح پرداخت", "🏠 انتخاب پنل مدیریت", "⏭️ بدون عکس"
    ].includes(text)) {
      if (await handleAdminMenu(chatId, message, session, text)) return true;
      if (await handleAdminMessage(chatId, message, session, text)) return true;
    }
  }
  if (session && !session.state.startsWith("admin_")) return handleCustomerMessage(chatId, message, session, text).then(handled => handled);
  if (text === "🍲 غذای خانگی مامان حسنا") { await showHome(chatId, userName(message)); return true; }
  if (text === "🏠 انتخاب کسب‌وکار") { await sendMessage(chatId, "یکی از دو کسب‌وکار را انتخاب کنید.", businessKeyboard()); return true; }
  if (["🍽️ مشاهده منو", "🛒 شروع سفارش", "🛒 سبد خرید", "📦 پیگیری سفارش", "📞 تماس با مامان حسنا", "📍 نشانی مجموعه"].includes(text)) {
    await saveSession(chatId, "customer_order", { cart: [] });
    return handleCustomerMessage(chatId, message, await getSession(chatId), text);
  }
  return false;
}

async function handleAdminMenu(chatId, message, session, text) {
  if (text === "🏠 انتخاب پنل مدیریت") {
    await clearSession(chatId);
    await sendMessage(chatId, "پنل موردنظر را انتخاب کنید.", replyKeyboard([["🧮 مدیریت سفر", "🍲 مدیریت غذا"]]));
    return true;
  }
  if (text === "🧾 سفارش‌های جدید") return listOrders(chatId, "status='در انتظار تعیین هزینه ارسال'", "سفارش جدید").then(() => true);
  if (text === "💵 در انتظار هزینه پیک") return listOrders(chatId, "status='در انتظار تعیین هزینه ارسال'", "سفارش در انتظار هزینه پیک").then(() => true);
  if (text === "🧾 رسیدهای پرداخت") return listOrders(chatId, "status='رسید دریافت شد'", "رسید پرداخت برای بررسی").then(() => true);
  if (text === "📦 همه سفارش‌ها") return listOrders(chatId, "TRUE", "سفارشی").then(() => true);
  if (text === "📋 فهرست غذاها") {
    const ps = await getProducts();
    await sendMessage(chatId, "📋 فهرست همه غذاها\n\n" + ps.map(p => `${p.name}\nقیمت: ${money(p.price)} | موجودی: ${faNum(p.stock)} | ${p.active ? "فعال" : "غیرفعال"} | امروز: ${p.menu_today ? "بله" : "خیر"} | فردا: ${p.menu_tomorrow ? "بله" : "خیر"}`).join("\n\n"), adminKeyboard()); return true;
  }
  if (text === "➕ افزودن غذا") {
    await saveSession(chatId, "admin_add_name", {}); await sendMessage(chatId, "نام غذای جدید را وارد کنید:", adminKeyboard()); return true;
  }
  if (text === "✏️ ویرایش غذا") return showProductList(chatId, "edit").then(() => true);
  if (text === "⛔ فعال/غیرفعال غذا") return showProductList(chatId, "active").then(() => true);
  if (text === "📦 تنظیم موجودی") return showProductList(chatId, "stock").then(() => true);
  if (text === "💰 تغییر قیمت") return showProductList(chatId, "price").then(() => true);
  if (text === "📸 تغییر عکس غذا") return showProductList(chatId, "photo").then(() => true);
  if (text === "🗑️ حذف از منو") return showProductList(chatId, "delete").then(() => true);
  if (text === "📅 منوی امروز") return showDailyMenu(chatId, "today").then(() => true);
  if (text === "🕒 منوی فردا") return showDailyMenu(chatId, "tomorrow").then(() => true);
  if (text === "💳 تنظیم کارت پرداخت") {
    await saveSession(chatId, "admin_bank_card", {});
    await sendMessage(chatId, "شماره کارت ۱۶ رقمی مربوط به کسب‌وکار مامان حسنا را وارد کنید.\n\nکارت سفر مشهد توس به‌صورت خودکار استفاده نمی‌شود.", adminKeyboard()); return true;
  }
  if (text === "📝 توضیح پرداخت") {
    await saveSession(chatId, "admin_bank_note", {});
    await sendMessage(chatId, "توضیحی که باید زیر فاکتور و اطلاعات کارت برای مشتری فرستاده شود وارد کنید. برای پاک‌کردن توضیح، کلمه «حذف» را بفرستید.", adminKeyboard()); return true;
  }
  if (session?.state?.startsWith("admin_")) return handleAdminMessage(chatId, message, session, text);
  return false;
}

async function handleCallback(callback) {
  if (!enabled) return false;
  const data = String(callback?.data || "");
  if (!data.startsWith("FOOD_") && !data.startsWith("FOODADMIN_")) return false;
  const chatId = String(callback?.message?.chat?.id || "");
  if (!chatId) return true;
  try { await api("answerCallbackQuery", { callback_query_id: callback.id }); } catch (_) {}
  const [action, arg1, arg2] = data.split(":");
  if (action.startsWith("FOODADMIN_") && !isAdmin(chatId)) {
    await sendMessage(chatId, "⛔ این عملیات فقط برای مدیریت فعال است."); return true;
  }
  if (action === "FOOD_HOME") { await showHome(chatId); return true; }
  if (action === "FOOD_MENU") { await showMenu(chatId); return true; }
  if (action === "FOOD_CART") { await showCart(chatId); return true; }
  if (action === "FOOD_NOOP") return true;
  if (action === "FOOD_INFO") {
    const p = await getProduct(arg1); if (p) await sendMessage(chatId, productCaption(p)); return true;
  }
  if (action === "FOOD_ADD" || action === "FOOD_MINUS") {
    const p = await getProduct(arg1);
    if (!p) { await sendMessage(chatId, "این غذا پیدا نشد."); return true; }
    const s = await getSession(chatId); const cart = Array.isArray(s?.data?.cart) ? s.data.cart : [];
    const found = cart.find(i => i.product_id === p.id);
    if (action === "FOOD_ADD") {
      if (!p.active || Number(p.stock) <= 0) { await sendMessage(chatId, "این غذا فعلاً موجود نیست."); return true; }
      if (found) { if (found.quantity >= Number(p.stock)) { await sendMessage(chatId, `از این غذا فقط ${faNum(p.stock)} عدد موجود است.`); return true; } found.quantity += 1; }
      else cart.push({ product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.price) });
    } else if (found) {
      found.quantity -= 1; if (found.quantity <= 0) cart.splice(cart.indexOf(found), 1);
    }
    await saveSession(chatId, "customer_order", { cart });
    if (p.photo_file_id && action === "FOOD_ADD") await sendPhoto(chatId, p.photo_file_id, productCaption(p), cartKeyboard(cart));
    else await sendMessage(chatId, `${p.name}\n${action === "FOOD_ADD" ? "✅ به سبد اضافه شد." : "تعداد سبد به‌روزرسانی شد."}\n\n${cartText(cart)}`, cartKeyboard(cart));
    return true;
  }
  if (action === "FOOD_CHECKOUT") {
    const s = await getSession(chatId); const cart = Array.isArray(s?.data?.cart) ? s.data.cart : [];
    await beginCheckout(chatId, cart); return true;
  }
  if (action === "FOODADMIN_HOME") { await showAdminHome(chatId); return true; }
  if (action === "FOODADMIN_FEE") {
    await saveSession(chatId, "admin_fee_entry", { orderId: Number(arg1) });
    await sendMessage(chatId, `هزینه پیک سفارش #${arg1} را به تومان وارد کنید. اگر ارسال رایگان است عدد ۰ را بفرستید. پس از ثبت، فاکتور نهایی و اطلاعات پرداخت برای مشتری ارسال می‌شود.`, adminKeyboard()); return true;
  }
  if (action === "FOODADMIN_VIEW") { await sendAdminOrder(Number(arg1), "🔎 جزئیات سفارش"); return true; }
  if (action === "FOODADMIN_CANCEL") {
    const result = await cancelOrderAndRestoreStock(Number(arg1));
    if (!result.changed) {
      await sendMessage(chatId, `این سفارش قبلاً «${result.order.status}» شده و لغو مجدد انجام نشد.`, adminKeyboard());
      return true;
    }
    await sendMessage(result.order.chat_id, `❌ سفارش #${arg1} توسط مدیریت لغو شد. موجودی غذاها به انبار برگشت. برای هماهنگی با مامان حسنا پیام بدهید.`, foodHomeKeyboard());
    await sendMessage(chatId, `✅ سفارش #${arg1} لغو شد و موجودی اقلام به انبار برگشت.`, adminKeyboard());
    await sendAdminOrder(Number(arg1), "❌ سفارش لغوشده");
    return true;
  }
  if (action === "FOODADMIN_TOGGLE") {
    const which = arg1; const id = arg2;
    const column = which === "today" ? "menu_today" : "menu_tomorrow";
    await query(`UPDATE products SET ${column}=NOT ${column},updated_at=NOW() WHERE id=$1`, [id]);
    await showDailyMenu(chatId, which); return true;
  }
  if (action === "FOODADMIN_PRODUCT") {
    const mode = arg1; const id = arg2; const p = await getProduct(id);
    if (!p) { await sendMessage(chatId, "غذا پیدا نشد.", adminKeyboard()); return true; }
    if (mode === "active") {
      await query("UPDATE products SET active=NOT active,updated_at=NOW() WHERE id=$1", [id]);
      await sendMessage(chatId, `وضعیت «${p.name}» تغییر کرد.`, adminKeyboard()); return true;
    }
    if (mode === "delete") {
      await query("UPDATE products SET active=FALSE,menu_today=FALSE,menu_tomorrow=FALSE,updated_at=NOW() WHERE id=$1", [id]);
      await sendMessage(chatId, `✅ «${p.name}» از منوی فعال خارج شد. اطلاعات و سوابق سفارش‌های قبلی حذف نشده‌اند.`, adminKeyboard()); return true;
    }
    if (mode === "photo") {
      await saveSession(chatId, "admin_edit_photo", { productId: id });
      await sendMessage(chatId, `عکس جدید «${p.name}» را از گالری گوشی ارسال کنید.`, adminKeyboard()); return true;
    }
    if (mode === "price") {
      await saveSession(chatId, "admin_edit_price", { productId: id });
      await sendMessage(chatId, `قیمت جدید «${p.name}» را به تومان وارد کنید:`, adminKeyboard()); return true;
    }
    if (mode === "stock") {
      await saveSession(chatId, "admin_edit_stock", { productId: id });
      await sendMessage(chatId, `موجودی جدید «${p.name}» را به تعداد پرس وارد کنید:`, adminKeyboard()); return true;
    }
    await saveSession(chatId, "admin_edit_select", { productId: id });
    await sendMessage(chatId, `کدام بخش «${p.name}» را ویرایش می‌کنید؟`, replyKeyboard([["✏️ نام غذا", "💰 قیمت"], ["📦 موجودی", "📸 عکس"], ["⛔ فعال/غیرفعال"], ["🏠 انتخاب پنل مدیریت"]])); return true;
  }
  if (action.startsWith("FOODADMIN_")) {
    const orderId = Number(arg1);
    const transitions = {
      FOODADMIN_PAID: ["رسید دریافت شد", "پرداخت تأیید شد", "✅ پرداخت سفارش #" + orderId + " تأیید شد."],
      FOODADMIN_REJECT: ["رسید دریافت شد", "فاکتور صادر شده", "⚠️ رسید سفارش #" + orderId + " تأیید نشد؛ لطفاً رسید صحیح ارسال کنید."],
      FOODADMIN_PREP: ["فاکتور صادر شده", "در حال آماده‌سازی", "🍳 سفارش #" + orderId + " وارد مرحله آماده‌سازی شد."],
      FOODADMIN_READY: ["در حال آماده‌سازی", "آماده تحویل", "🥘 سفارش #" + orderId + " آماده تحویل است."],
      FOODADMIN_SENT: ["آماده تحویل", "ارسال‌شده", "🚚 سفارش #" + orderId + " تحویل پیک شد."],
      FOODADMIN_DELIVERED: ["ارسال‌شده", "تحویل‌شده", "✅ سفارش #" + orderId + " تحویل داده شد."]
    };
    const transition = transitions[action];
    if (transition) {
      const row = (await query("SELECT chat_id,status FROM orders WHERE id=$1", [orderId])).rows[0];
      if (!row) { await sendMessage(chatId, "سفارش پیدا نشد.", adminKeyboard()); return true; }
      if (row.status !== transition[0]) { await sendMessage(chatId, `وضعیت فعلی سفارش «${row.status}» است و این دکمه برای آن معتبر نیست.`, adminKeyboard()); return true; }
      await query("UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2", [transition[1], orderId]);
      await sendMessage(row.chat_id, transition[2], foodHomeKeyboard());
      await sendMessage(chatId, "✅ وضعیت سفارش به‌روزرسانی شد.", adminKeyboard());
      return true;
    }
  }
  return true;
}

async function resetSession(chatId) {
  if (!enabled || !pool) return;
  await clearSession(chatId);
}
async function shutdown() {
  enabled = false;
  if (pool) {
    const oldPool = pool;
    pool = null;
    await oldPool.end().catch(() => {});
  }
}

module.exports = {
  init,
  isEnabled: () => enabled,
  resetSession,
  shutdown,
  handleMessage,
  handleCallback,
  showHome,
  showAdminHome,
  businessKeyboard
};
