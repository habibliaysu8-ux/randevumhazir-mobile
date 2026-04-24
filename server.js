const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const nodemailer = require('nodemailer');
const crypto = require('node:crypto');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const GEO_CACHE_FILE = path.join(DATA_DIR, 'geo-cache.json');

let pgPool = null;
let pgReady = false;

function usePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPgPool() {
  if (!usePostgres()) return null;
  if (!pgPool) {
    const sslSetting = String(process.env.DATABASE_SSL || 'true').toLowerCase();
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslSetting === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  return pgPool;
}


const PROVINCES = [
  { id: 34, name: 'İstanbul' },
  { id: 6, name: 'Ankara' },
  { id: 35, name: 'İzmir' }
];

const DISTRICTS_BY_PROVINCE = {
  34: [
    'Adalar', 'Arnavutköy', 'Ataşehir', 'Avcılar', 'Bağcılar', 'Bahçelievler', 'Bakırköy', 'Başakşehir',
    'Bayrampaşa', 'Beşiktaş', 'Beykoz', 'Beylikdüzü', 'Beyoğlu', 'Büyükçekmece', 'Çatalca', 'Çekmeköy',
    'Esenler', 'Esenyurt', 'Eyüpsultan', 'Fatih', 'Gaziosmanpaşa', 'Güngören', 'Kadıköy', 'Kağıthane',
    'Kartal', 'Küçükçekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sarıyer', 'Silivri', 'Sultanbeyli',
    'Sultangazi', 'Şile', 'Şişli', 'Tuzla', 'Ümraniye', 'Üsküdar', 'Zeytinburnu'
  ],
  6: [
    'Akyurt', 'Altındağ', 'Ayaş', 'Bala', 'Beypazarı', 'Çamlıdere', 'Çankaya', 'Çubuk', 'Elmadağ', 'Etimesgut',
    'Evren', 'Gölbaşı', 'Güdül', 'Haymana', 'Kahramankazan', 'Kalecik', 'Keçiören', 'Kızılcahamam', 'Mamak',
    'Nallıhan', 'Polatlı', 'Pursaklar', 'Sincan', 'Şereflikoçhisar', 'Yenimahalle'
  ],
  35: [
    'Aliağa', 'Balçova', 'Bayındır', 'Bayraklı', 'Bergama', 'Beydağ', 'Bornova', 'Buca', 'Çeşme', 'Çiğli',
    'Dikili', 'Foça', 'Gaziemir', 'Güzelbahçe', 'Karabağlar', 'Karaburun', 'Karşıyaka', 'Kemalpaşa', 'Kınık',
    'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlıdere', 'Ödemiş', 'Seferihisar', 'Selçuk', 'Tire', 'Torbalı', 'Urla'
  ]
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const PARTNER_PLANS = [
  { code: 'daily', name: 'Günlük Paket', price: 200, durationDays: 1, description: '2 ücretsiz günden sonra 1 gün boyunca mağaza yayını ve saat açma erişimi sağlar.' },
  { code: 'weekly', name: 'Haftalık Paket', price: 142, durationDays: 7, description: '2 ücretsiz günden sonra 7 gün boyunca mağaza yayını ve hizmet yönetimi sağlar.' }
];

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2$120000$${salt}$${hash}`;
}

function verifyPassword(storedPassword, incomingPassword) {
  const stored = String(storedPassword || '');
  const incoming = String(incomingPassword || '');
  if (!stored.startsWith('pbkdf2$')) return stored === incoming;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], 'hex');
  const actual = crypto.pbkdf2Sync(incoming, salt, iterations, expected.length, 'sha256');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function addMinutesToIso(baseDate, minutes) {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setMinutes(date.getMinutes() + Number(minutes || 0));
  return date.toISOString();
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

function addMinutesToTime(time, minutesToAdd) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  const total = hours * 60 + minutes + minutesToAdd;
  const newHours = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const newMinutes = String(total % 60).padStart(2, '0');
  return `${newHours}:${newMinutes}`;
}

function nextDate(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


function addDaysToIso(baseDate, days) {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function ensurePartnerBilling(user) {
  if (!user || user.role !== 'partner') return user;
  const startedAt = user.billing?.trialStartedAt || user.createdAt || nowIso();
  const rawTrialEndsAt = user.billing?.trialEndsAt;
  const needsTrialRefresh = !rawTrialEndsAt || new Date(rawTrialEndsAt).getTime() <= new Date(startedAt).getTime();
  user.billing = {
    trialStartedAt: startedAt,
    trialEndsAt: needsTrialRefresh ? addDaysToIso(startedAt, 2) : rawTrialEndsAt,
    activePlan: user.billing?.activePlan || null,
    planStartedAt: user.billing?.planStartedAt || null,
    planEndsAt: user.billing?.planEndsAt || null,
    lastPaymentId: user.billing?.lastPaymentId || null
  };
  return user;
}

function normalizeDb(db) {
  db.users = Array.isArray(db.users) ? db.users : [];
  db.salons = Array.isArray(db.salons) ? db.salons : [];
  db.staff = Array.isArray(db.staff) ? db.staff : [];
  db.services = Array.isArray(db.services) ? db.services : [];
  db.slots = Array.isArray(db.slots) ? db.slots : [];
  db.bookings = Array.isArray(db.bookings) ? db.bookings : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.passwordResets = Array.isArray(db.passwordResets) ? db.passwordResets : [];
  db.users.forEach(ensurePartnerBilling);
  return db;
}

function getPartnerBilling(user) {
  const partner = ensurePartnerBilling(user);
  const now = Date.now();
  const trialEndsAtMs = partner.billing?.trialEndsAt ? new Date(partner.billing.trialEndsAt).getTime() : 0;
  const planEndsAtMs = partner.billing?.planEndsAt ? new Date(partner.billing.planEndsAt).getTime() : 0;
  const trialActive = trialEndsAtMs > now;
  const paidActive = Boolean(partner.billing?.activePlan && planEndsAtMs > now);
  const status = paidActive ? 'paid' : trialActive ? 'trial' : 'expired';
  return {
    status,
    accessActive: trialActive || paidActive,
    trialEndsAt: partner.billing.trialEndsAt,
    plan: PARTNER_PLANS.find((item) => item.code === partner.billing.activePlan) || null,
    planStartedAt: partner.billing.planStartedAt,
    planEndsAt: partner.billing.planEndsAt,
    plans: PARTNER_PLANS
  };
}

function maskCard(number) {
  const digits = String(number || '').replace(/\D/g, '');
  return digits ? `**** **** **** ${digits.slice(-4)}` : '';
}

function validateCardPayload(card = {}) {
  const holder = String(card.holder || '').trim();
  const number = String(card.number || '').replace(/\D/g, '');
  const expiry = String(card.expiry || '').trim();
  const cvc = String(card.cvc || '').replace(/\D/g, '');
  if (holder.length < 3) return 'Kart üzerindeki ad soyad gerekli.';
  if (number.length < 12) return 'Kart numarası geçerli görünmüyor.';
  if (!/^\d{2}\/\d{2,4}$/.test(expiry)) return 'Son kullanma tarihi AA/YY biçiminde olmalı.';
  if (cvc.length < 3 || cvc.length > 4) return 'CVC geçerli görünmüyor.';
  return null;
}

function requirePartnerBillingAccess(res, partner) {
  const billing = getPartnerBilling(partner);
  if (!billing.accessActive) {
    json(res, 402, { error: '2 günlük ücretsiz süre bitti. Devam etmek için paket seçip kartla ödeme yap.' });
    return null;
  }
  return billing;
}


function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isNumericLike(value) {
  return /^\+?[\d\s()-]{5,}$/.test(String(value || '').trim());
}

function isMeaningfulLabel(value) {
  const cleaned = String(value || '').trim();
  return cleaned.length >= 2 && !isNumericLike(cleaned);
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

function publicUser(user) {
  if (!user) return null;
  ensurePartnerBilling(user);
  const { password, ...rest } = user;
  return rest;
}

function requireRole(db, userId, role) {
  const user = db.users.find((item) => item.id === userId);
  if (!user || user.role !== role) return null;
  return user;
}

function createSeedDb() {
  const createdAt = nowIso();
  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@randevumhazir.com').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || 'Admin123!').trim();
  const adminName = String(process.env.ADMIN_NAME || 'Randevumhazır Admin').trim();
  return {
    users: [
      { id: 'admin_1', role: 'admin', name: adminName, email: adminEmail, phone: '05000000000', password: hashPassword(adminPassword), createdAt }
    ],
    salons: [],
    staff: [],
    services: [],
    slots: [],
    bookings: [],
    payments: []
  };
}

function ensureDataFiles() {
  ensureDirectories();
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(createSeedDb(), null, 2), 'utf-8');
  }
  if (!fs.existsSync(GEO_CACHE_FILE)) {
    const districtsByProvinceId = Object.fromEntries(PROVINCES.map((province) => [
      province.id,
      getDistricts(province.id)
    ]));
    fs.writeFileSync(GEO_CACHE_FILE, JSON.stringify({
      provinces: PROVINCES,
      districtsByProvinceId,
      updatedAt: nowIso()
    }, null, 2), 'utf-8');
  }
}

async function ensurePostgresState() {
  const pool = getPgPool();
  if (!pool || pgReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS rh_state (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const existing = await pool.query('SELECT id FROM rh_state WHERE id = $1', ['main']);
  if (!existing.rowCount) {
    await pool.query('INSERT INTO rh_state (id, data) VALUES ($1, $2::jsonb)', ['main', JSON.stringify(createSeedDb())]);
  }
  pgReady = true;
}

async function readDb() {
  if (usePostgres()) {
    await ensurePostgresState();
    const result = await getPgPool().query('SELECT data FROM rh_state WHERE id = $1', ['main']);
    return normalizeDb(result.rows[0]?.data || createSeedDb());
  }
  ensureDataFiles();
  return normalizeDb(safeJsonParse(fs.readFileSync(DB_FILE, 'utf-8'), createSeedDb()));
}

async function writeDb(db) {
  const data = normalizeDb(db);
  if (usePostgres()) {
    await ensurePostgresState();
    await getPgPool().query(
      'INSERT INTO rh_state (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
      ['main', JSON.stringify(data)]
    );
    return;
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getService(db, serviceId) {
  return db.services.find((item) => item.id === serviceId) || null;
}

function getStaff(db, staffId) {
  return db.staff.find((item) => item.id === staffId) || null;
}

function slotMatchesRequest(db, slot, options = {}) {
  const service = getService(db, slot.serviceId);
  const staff = getStaff(db, slot.staffId);
  const q = slugify(options.q);
  const category = String(options.category || '').trim();
  const date = String(options.date || '').trim();
  const time = String(options.time || '').trim();

  if (category && !(service?.category === category || service?.name?.toLowerCase().includes(category.toLowerCase()))) {
    return false;
  }
  if (date && slot.date !== date) {
    return false;
  }
  if (time) {
    if (date) {
      if (slot.startTime < time) return false;
    } else if (slot.startTime !== time) {
      return false;
    }
  }
  if (q) {
    const searchBag = [service?.name, service?.category, staff?.name].map(slugify).join(' ');
    if (!searchBag.includes(q)) return false;
  }
  return true;
}

function sortSlots(a, b) {
  return `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`);
}

function getSalonSummary(db, salon, filters = {}) {
  const services = db.services.filter((item) => item.salonId === salon.id);
  const staff = db.staff.filter((item) => item.salonId === salon.id);
  const openSlots = db.slots
    .filter((item) => item.salonId === salon.id && item.status === 'open' && item.date >= nextDate(0))
    .sort(sortSlots)
    .map((slot) => ({
      ...slot,
      service: services.find((item) => item.id === slot.serviceId) || null,
      staff: staff.find((item) => item.id === slot.staffId) || null
    }));

  const matchingSlots = openSlots.filter((slot) => slotMatchesRequest(db, slot, filters));
  const slotPool = matchingSlots.length ? matchingSlots : openSlots;

  return {
    ...salon,
    services,
    staff,
    serviceCount: services.length,
    staffCount: staff.length,
    openSlotCount: openSlots.length,
    nextAvailableSlot: slotPool[0] || null,
    matchingSlotCount: matchingSlots.length,
    matchingSlotsPreview: slotPool.slice(0, 4)
  };
}

async function ensureFutureSlots() {
  const db = await readDb();
  const salonIds = new Set(db.salons.map((item) => item.id));
  let changed = false;

  db.slots = db.slots.filter((slot) => {
    const keep = salonIds.has(slot.salonId);
    if (!keep) changed = true;
    return keep;
  });

  db.services = db.services.filter((service) => {
    const keep = salonIds.has(service.salonId);
    if (!keep) changed = true;
    return keep;
  });

  db.staff = db.staff.filter((member) => {
    const keep = salonIds.has(member.salonId);
    if (!keep) changed = true;
    return keep;
  });

  if (changed) await writeDb(db);
}

function getProvinces() {
  return PROVINCES;
}

function getProvinceById(provinceId) {
  return PROVINCES.find((item) => item.id === Number(provinceId)) || PROVINCES[0];
}

function getDistricts(provinceId) {
  const districts = DISTRICTS_BY_PROVINCE[Number(provinceId)] || [];
  return districts.map((name, index) => ({ id: Number(`${Number(provinceId)}${String(index + 1).padStart(2, '0')}`), name, provinceId: Number(provinceId) }));
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  json(res, 404, { error: 'Not found' });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}


let mailTransporter = null;

function hasMailConfig() {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_PORT && process.env.MAIL_USER && process.env.MAIL_PASS && process.env.MAIL_FROM);
}

function getMailTransporter() {
  if (!hasMailConfig()) return null;
  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 587),
      secure: String(process.env.MAIL_SECURE || 'false') === 'true',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });
  }
  return mailTransporter;
}

async function sendAppMail({ to, subject, text, html }) {
  const email = String(to || '').trim();
  if (!email) return false;
  const transporter = getMailTransporter();
  if (!transporter) {
    console.log('[MAIL DISABLED]', subject, '=>', email);
    return false;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject,
    text,
    html: html || `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${text}</pre>`
  });
  return true;
}

function bookingSummaryText(booking) {
  return [
    `Salon: ${booking.salonName || '-'}`,
    `Hizmet: ${booking.serviceName || '-'}`,
    `Uzman: ${booking.staffName || '-'}`,
    `Tarih: ${booking.date || '-'} ${booking.startTime || ''}`.trim(),
    `Durum: ${booking.status || '-'}`,
    booking.notes ? `Not: ${booking.notes}` : ''
  ].filter(Boolean).join('\n');
}

async function sendBookingCreatedMails(db, booking) {
  const customer = db.users.find((item) => item.id === booking.customerId);
  const partner = db.users.find((item) => item.id === booking.partnerId);
  const admins = db.users.filter((item) => item.role === 'admin' && item.email);
  const summary = bookingSummaryText(booking);

  try {
    if (customer?.email) {
      await sendAppMail({
        to: customer.email,
        subject: 'Rezervasyon talebin alındı',
        text: `Rezervasyon talebin alındı.

${summary}`
      });
    }
    if (partner?.email) {
      await sendAppMail({
        to: partner.email,
        subject: 'Yeni rezervasyon talebi aldın',
        text: `Yeni bir rezervasyon talebi aldın.

${summary}`
      });
    }
    for (const admin of admins) {
      await sendAppMail({
        to: admin.email,
        subject: 'Yeni rezervasyon bildirimi',
        text: `Sistemde yeni rezervasyon oluşturuldu.

${summary}`
      });
    }
  } catch (error) {
    console.error('BOOKING MAIL ERROR:', error.message || error);
  }
}

async function sendBookingStatusMails(db, booking) {
  const customer = db.users.find((item) => item.id === booking.customerId);
  const partner = db.users.find((item) => item.id === booking.partnerId);
  const admins = db.users.filter((item) => item.role === 'admin' && item.email);
  const statusLabel = booking.status === 'confirmed' ? 'onaylandı' : booking.status === 'rejected' ? 'reddedildi' : booking.status;
  const summary = bookingSummaryText(booking);

  try {
    if (customer?.email) {
      await sendAppMail({
        to: customer.email,
        subject: `Rezervasyonun ${statusLabel}`,
        text: `Rezervasyon durumun güncellendi: ${statusLabel}.

${summary}`
      });
    }
    if (partner?.email) {
      await sendAppMail({
        to: partner.email,
        subject: `Rezervasyon ${statusLabel}`,
        text: `Rezervasyon durumu güncellendi: ${statusLabel}.

${summary}`
      });
    }
    for (const admin of admins) {
      await sendAppMail({
        to: admin.email,
        subject: `Rezervasyon ${statusLabel}`,
        text: `Rezervasyon durumu güncellendi: ${statusLabel}.

${summary}`
      });
    }
  } catch (error) {
    console.error('BOOKING STATUS MAIL ERROR:', error.message || error);
  }
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  if (!fs.existsSync(filePath)) return notFound(res);
  if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const db = await readDb();

  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, app: 'randevumhazır', cities: PROVINCES.map((item) => item.name), time: nowIso() });
  }

  if (req.method === 'GET' && pathname === '/api/geo/provinces') {
    return json(res, 200, { data: getProvinces() });
  }

  if (req.method === 'GET' && pathname === '/api/geo/districts') {
    const provinceId = Number(url.searchParams.get('provinceId')) || 34;
    return json(res, 200, { data: getDistricts(provinceId) });
  }

  if (req.method === 'GET' && pathname === '/api/catalog') {
    const defaultCategories = ['Protez Tırnak', 'Manikür', 'Pedikür', 'Cilt Bakımı', 'Saç', 'Lazer', 'Kaş ve Kirpik', 'Masaj', 'Makyaj'];
    const defaultServiceNames = [
      'Jel Protez Tırnak',
      'Kalıcı Oje',
      'Klasik Manikür',
      'Spa Pedikür',
      'Saç Kesimi',
      'Fön',
      'Dip Boya',
      'Cilt Bakımı',
      'Hydrafacial',
      'Kaş Tasarımı',
      'Kirpik Lifting',
      'Bölgesel Lazer',
      'Tüm Vücut Lazer',
      'Gelin Makyajı'
    ];
    const categories = [...new Set(defaultCategories.concat(db.services.map((item) => item.category)).filter(isMeaningfulLabel))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
    const serviceNames = [...new Set(defaultServiceNames.concat(db.services.map((item) => item.name)).filter(isMeaningfulLabel))]
      .sort((a, b) => a.localeCompare(b, 'tr'));
    const services = [{ value: '', label: 'Tüm hizmetler' }]
      .concat(categories.map((item) => ({ value: item, label: item, kind: 'category' })))
      .concat(serviceNames.filter((item) => !categories.includes(item)).map((item) => ({ value: item, label: item, kind: 'service' })));
    return json(res, 200, { data: { services, categories, cities: PROVINCES } });
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readBody(req);
    const role = body.role;
    if (!['customer', 'partner'].includes(role)) return json(res, 400, { error: 'Geçersiz rol.' });
    const email = String(body.email || '').trim().toLowerCase();
    if (!body.name || !email || !body.password) return json(res, 400, { error: 'Ad, e-posta ve şifre zorunludur.' });
    if (db.users.some((item) => item.email === email)) return json(res, 409, { error: 'Bu e-posta zaten kayıtlı.' });

    const createdAt = nowIso();
    const user = {
      id: uid(role),
      role,
      name: String(body.name).trim(),
      email,
      phone: String(body.phone || '').trim(),
      password: hashPassword(String(body.password)),
      createdAt,
      ...(role === 'partner' ? { billing: { trialStartedAt: createdAt, trialEndsAt: addDaysToIso(createdAt, 2), activePlan: null, planStartedAt: null, planEndsAt: null, lastPaymentId: null } } : {})
    };
    db.users.push(user);
    await writeDb(db);
    return json(res, 201, { user: publicUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = String(body.role || '');
    const user = db.users.find((item) => item.email === email && (!role || item.role === role));
    if (!user || !verifyPassword(user.password, password)) return json(res, 401, { error: 'E-posta, şifre veya rol hatalı.' });
    if (!String(user.password || '').startsWith('pbkdf2$')) {
      user.password = hashPassword(password);
      await writeDb(db);
    }
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/forgot-password') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '').trim();
    if (!email) return json(res, 400, { error: 'E-posta adresi zorunlu.' });

    db.passwordResets = (db.passwordResets || []).filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > Date.now());
    const user = db.users.find((item) => item.email === email && (!role || item.role === role));

    let devResetUrl = null;
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const reset = {
        id: uid('reset'),
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: addMinutesToIso(null, 45),
        usedAt: null,
        createdAt: nowIso()
      };
      db.passwordResets.push(reset);
      await writeDb(db);

      const resetUrl = publicBaseUrl(req) + '/reset-password.html?token=' + encodeURIComponent(token);
      devResetUrl = resetUrl;
      await sendAppMail({
        to: user.email,
        subject: 'Randevumhazır şifre yenileme bağlantısı',
        text: 'Şifreni yenilemek için bu linke tıkla:\n\n' + resetUrl + '\n\nBu link 45 dakika geçerlidir.'
      });
    }

    return json(res, 200, {
      ok: true,
      message: 'Eğer bu e-posta sistemde kayıtlıysa şifre yenileme linki gönderildi.',
      ...(process.env.NODE_ENV !== 'production' && devResetUrl ? { devResetUrl } : {})
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/reset-password') {
    const body = await readBody(req);
    const token = String(body.token || '').trim();
    const password = String(body.password || '');
    if (!token || password.length < 6) return json(res, 400, { error: 'Token ve en az 6 karakter yeni şifre zorunlu.' });

    const tokenHash = hashResetToken(token);
    const reset = (db.passwordResets || []).find((item) => item.tokenHash === tokenHash && !item.usedAt && new Date(item.expiresAt).getTime() > Date.now());
    if (!reset) return json(res, 400, { error: 'Şifre yenileme linki geçersiz veya süresi dolmuş.' });

    const user = db.users.find((item) => item.id === reset.userId);
    if (!user) return json(res, 404, { error: 'Kullanıcı bulunamadı.' });

    user.password = hashPassword(password);
    reset.usedAt = nowIso();
    await writeDb(db);

    await sendAppMail({
      to: user.email,
      subject: 'Randevumhazır şifren değiştirildi',
      text: 'Randevumhazır hesabının şifresi başarıyla değiştirildi. Bu işlemi sen yapmadıysan hemen bizimle iletişime geç.'
    });

    return json(res, 200, { ok: true, message: 'Şifren değiştirildi. Yeni şifrenle giriş yapabilirsin.' });
  }

  if (req.method === 'POST' && pathname === '/api/partner/subscribe') {
    const body = await readBody(req);
    const partner = requireRole(db, body.partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });

    const plan = PARTNER_PLANS.find((item) => item.code === String(body.planCode || ''));
    if (!plan) return json(res, 400, { error: 'Geçersiz paket seçimi.' });

    const cardError = validateCardPayload(body.card);
    if (cardError) return json(res, 400, { error: cardError });

    ensurePartnerBilling(partner);
    const payment = {
      id: uid('payment'),
      partnerId: partner.id,
      planCode: plan.code,
      planName: plan.name,
      amount: plan.price,
      cardHolder: String(body.card.holder || '').trim(),
      cardMasked: maskCard(body.card.number),
      status: 'paid',
      createdAt: nowIso()
    };

    partner.billing.activePlan = plan.code;
    partner.billing.planStartedAt = payment.createdAt;
    partner.billing.planEndsAt = addDaysToIso(payment.createdAt, plan.durationDays);
    partner.billing.lastPaymentId = payment.id;

    db.payments.push(payment);
    await writeDb(db);

    return json(res, 201, {
      data: {
        payment,
        billing: { ...getPartnerBilling(partner), payments: db.payments.filter((item) => item.partnerId === partner.id).slice(-5).reverse() }
      }
    });
  }

  if (req.method === 'GET' && pathname === '/api/stores') {
    const cityId = Number(url.searchParams.get('cityId') || 34);
    const district = String(url.searchParams.get('district') || '').trim();
    const category = String(url.searchParams.get('category') || '').trim();
    const featured = url.searchParams.get('featured') === '1';
    const qRaw = String(url.searchParams.get('q') || '').trim();
    const q = isMeaningfulLabel(qRaw) ? qRaw : '';
    const date = String(url.searchParams.get('date') || '').trim();
    const time = String(url.searchParams.get('time') || '').trim();

    const filters = { q, category, date, time };

    const results = db.salons
      .filter((salon) => salon.status === 'active' && (cityId ? salon.cityId === cityId : true))
      .filter((salon) => (district ? salon.district === district : true))
      .filter((salon) => (featured ? salon.isFeatured : true))
      .map((salon) => getSalonSummary(db, salon, filters))
      .filter((salon) => {
        const qText = slugify(q);
        const textMatch = !qText || [
          salon.name,
          salon.city,
          salon.district,
          salon.category,
          ...(salon.categories || []),
          ...salon.services.map((item) => item.name),
          ...salon.services.map((item) => item.category)
        ].map(slugify).some((value) => value.includes(qText));

        const categoryMatch = !category || salon.categories.includes(category) || salon.category === category || salon.services.some((item) => item.category === category);
        const availabilityConstrained = Boolean(date || time || category);
        const slotReady = !availabilityConstrained || salon.matchingSlotCount > 0;
        return textMatch && categoryMatch && slotReady;
      })
      .sort((a, b) => {
        if ((b.matchingSlotCount || 0) !== (a.matchingSlotCount || 0)) return (b.matchingSlotCount || 0) - (a.matchingSlotCount || 0);
        if ((b.isFeatured ? 1 : 0) !== (a.isFeatured ? 1 : 0)) return Number(b.isFeatured) - Number(a.isFeatured);
        if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
        return a.name.localeCompare(b.name, 'tr');
      });

    return json(res, 200, { data: results });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/stores/')) {
    const salonId = pathname.split('/').pop();
    const salon = db.salons.find((item) => item.id === salonId);
    if (!salon) return json(res, 404, { error: 'Salon bulunamadı.' });
    const staff = db.staff.filter((item) => item.salonId === salonId);
    const services = db.services.filter((item) => item.salonId === salonId);
    const slots = db.slots
      .filter((item) => item.salonId === salonId && item.status === 'open' && item.date >= nextDate(0))
      .sort(sortSlots)
      .map((slot) => ({
        ...slot,
        staff: staff.find((item) => item.id === slot.staffId) || null,
        service: services.find((item) => item.id === slot.serviceId) || null
      }));

    return json(res, 200, { data: { ...salon, staff, services, slots } });
  }

  if (req.method === 'POST' && pathname === '/api/bookings') {
    const body = await readBody(req);
    const customer = requireRole(db, body.customerId, 'customer');
    if (!customer) return json(res, 403, { error: 'Müşteri oturumu gerekli.' });
    const slot = db.slots.find((item) => item.id === body.slotId);
    if (!slot || slot.status !== 'open') return json(res, 409, { error: 'Bu saat artık uygun değil.' });

    const salon = db.salons.find((item) => item.id === slot.salonId);
    const service = db.services.find((item) => item.id === slot.serviceId);
    const staff = db.staff.find((item) => item.id === slot.staffId);

    const booking = {
      id: uid('booking'),
      customerId: customer.id,
      salonId: slot.salonId,
      serviceId: slot.serviceId,
      staffId: slot.staffId,
      slotId: slot.id,
      partnerId: slot.partnerId,
      salonName: salon?.name || '',
      serviceName: service?.name || '',
      staffName: staff?.name || '',
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: 'pending',
      notes: String(body.notes || '').trim(),
      createdAt: nowIso()
    };

    slot.status = 'booked';
    db.bookings.push(booking);
    await writeDb(db);
    await sendBookingCreatedMails(db, booking);
    return json(res, 201, { data: booking });
  }

  if (req.method === 'PATCH' && pathname === '/api/partner/bookings/status') {
    const body = await readBody(req);
    const partner = requireRole(db, body.partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });

    const bookingId = String(body.bookingId || '').trim();
    const status = String(body.status || '').trim();
    if (!bookingId || !['confirmed', 'rejected'].includes(status)) {
      return json(res, 400, { error: 'Geçersiz işlem.' });
    }

    const booking = db.bookings.find((item) => item.id === bookingId && item.partnerId === partner.id);
    if (!booking) return json(res, 404, { error: 'Rezervasyon bulunamadı.' });

    booking.status = status;
    booking.updatedAt = nowIso();

    const slot = db.slots.find((item) => item.id === booking.slotId);
    if (slot) {
      slot.status = status === 'rejected' ? 'open' : 'booked';
    }

    await writeDb(db);
    await sendBookingStatusMails(db, booking);
    return json(res, 200, { data: booking });
  }

  if (req.method === 'GET' && pathname === '/api/customer/dashboard') {
    const customerId = url.searchParams.get('userId');
    const customer = requireRole(db, customerId, 'customer');
    if (!customer) return json(res, 403, { error: 'Müşteri oturumu gerekli.' });
    const bookings = db.bookings
      .filter((item) => item.customerId === customer.id)
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

    return json(res, 200, { data: { user: publicUser(customer), bookings } });
  }

  if (req.method === 'POST' && pathname === '/api/partner/salon') {
    const body = await readBody(req);
    const partner = requireRole(db, body.partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });
    if (!requirePartnerBillingAccess(res, partner)) return;
    if (!body.name || !body.cityId || !body.district || !body.address) return json(res, 400, { error: 'Salon adı, şehir, ilçe ve adres zorunlu.' });

    let salon = db.salons.find((item) => item.partnerId === partner.id && item.id === body.id);
    if (!salon) salon = db.salons.find((item) => item.partnerId === partner.id);

    const city = getProvinceById(body.cityId);

    const payload = {
      partnerId: partner.id,
      name: String(body.name).trim(),
      slug: slugify(body.name),
      category: String(body.category || 'Güzellik').trim(),
      categories: Array.isArray(body.categories) && body.categories.length ? body.categories.filter(Boolean) : [String(body.category || 'Güzellik').trim()],
      cityId: city.id,
      city: city.name,
      district: String(body.district).trim(),
      address: String(body.address).trim(),
      description: String(body.description || '').trim(),
      coverImage: String(body.coverImage || '').trim() || 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80'
    };

    if (salon) {
      Object.assign(salon, payload);
    } else {
      salon = {
        id: uid('salon'),
        rating: 4.8,
        reviewCount: 0,
        isFeatured: false,
        status: 'active',
        createdAt: nowIso(),
        ...payload
      };
      db.salons.push(salon);
    }

    await writeDb(db);
    return json(res, 200, { data: salon });
  }

  if (req.method === 'POST' && pathname === '/api/partner/services') {
    const body = await readBody(req);
    const partner = requireRole(db, body.partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });
    if (!requirePartnerBillingAccess(res, partner)) return;
    const salon = db.salons.find((item) => item.partnerId === partner.id && item.id === body.salonId);
    if (!salon) return json(res, 400, { error: 'Önce salon oluştur.' });

    const service = {
      id: uid('service'),
      salonId: salon.id,
      name: String(body.name || '').trim(),
      duration: Number(body.duration || 0),
      price: Number(body.price || 0),
      category: String(body.category || salon.category).trim(),
      createdAt: nowIso()
    };
    if (!service.name || !service.duration || !service.price) return json(res, 400, { error: 'Hizmet adı, süre ve fiyat zorunlu.' });
    if (!isMeaningfulLabel(service.name) || !isMeaningfulLabel(service.category)) return json(res, 400, { error: 'Hizmet adı ve kategori sayı gibi görünemez.' });
    db.services.push(service);
    if (!salon.categories.includes(service.category)) salon.categories.push(service.category);
    await writeDb(db);
    return json(res, 201, { data: service });
  }

  if (req.method === 'POST' && pathname === '/api/partner/staff') {
    const body = await readBody(req);
    const partner = requireRole(db, body.partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });
    if (!requirePartnerBillingAccess(res, partner)) return;
    const salon = db.salons.find((item) => item.partnerId === partner.id && item.id === body.salonId);
    if (!salon) return json(res, 400, { error: 'Önce salon oluştur.' });

    const staff = {
      id: uid('staff'),
      salonId: salon.id,
      name: String(body.name || '').trim(),
      title: String(body.title || 'Uzman').trim(),
      createdAt: nowIso()
    };
    if (!staff.name) return json(res, 400, { error: 'Uzman adı zorunlu.' });
    db.staff.push(staff);
    await writeDb(db);
    return json(res, 201, { data: staff });
  }

  if (req.method === 'POST' && pathname === '/api/partner/slots') {
    const body = await readBody(req);
    const partner = requireRole(db, body.partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });
    if (!requirePartnerBillingAccess(res, partner)) return;
    const salon = db.salons.find((item) => item.partnerId === partner.id && item.id === body.salonId);
    const service = db.services.find((item) => item.id === body.serviceId && item.salonId === body.salonId);
    const staff = db.staff.find((item) => item.id === body.staffId && item.salonId === body.salonId);
    if (!salon || !service || !staff) return json(res, 400, { error: 'Salon, hizmet ve uzman seçimi zorunlu.' });

    const slot = {
      id: uid('slot'),
      partnerId: partner.id,
      salonId: salon.id,
      serviceId: service.id,
      staffId: staff.id,
      date: String(body.date || '').trim(),
      startTime: String(body.startTime || '').trim(),
      endTime: addMinutesToTime(String(body.startTime || '00:00'), Number(service.duration)),
      status: 'open',
      createdAt: nowIso()
    };
    if (!slot.date || !slot.startTime) return json(res, 400, { error: 'Tarih ve saat zorunlu.' });
    if (slot.date < nextDate(0)) return json(res, 400, { error: 'Geçmiş gün için saat açılamaz.' });
    db.slots.push(slot);
    await writeDb(db);
    return json(res, 201, { data: slot });
  }

  if (req.method === 'GET' && pathname === '/api/partner/dashboard') {
    const partnerId = url.searchParams.get('userId');
    const partner = requireRole(db, partnerId, 'partner');
    if (!partner) return json(res, 403, { error: 'Partner oturumu gerekli.' });
    const salons = db.salons.filter((item) => item.partnerId === partner.id);
    const salonIds = salons.map((item) => item.id);
    const services = db.services.filter((item) => salonIds.includes(item.salonId));
    const staff = db.staff.filter((item) => salonIds.includes(item.salonId));
    const slots = db.slots.filter((item) => salonIds.includes(item.salonId) && item.date >= nextDate(0)).sort(sortSlots);
    const bookings = db.bookings.filter((item) => item.partnerId === partner.id).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    const billing = getPartnerBilling(partner);
    const payments = db.payments.filter((item) => item.partnerId === partner.id).slice(-5).reverse();

    return json(res, 200, {
      data: {
        user: publicUser(partner),
        salons,
        services,
        staff,
        slots,
        bookings,
        billing: { ...billing, payments },
        stats: {
          salonCount: salons.length,
          serviceCount: services.length,
          openSlotCount: slots.filter((item) => item.status === 'open').length,
          bookingCount: bookings.length
        }
      }
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/dashboard') {
    const adminId = url.searchParams.get('userId');
    const admin = requireRole(db, adminId, 'admin');
    if (!admin) return json(res, 403, { error: 'Admin oturumu gerekli.' });
    const salons = db.salons.map((item) => getSalonSummary(db, item));
    const users = db.users.map(publicUser);
    const bookings = [...db.bookings].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

    return json(res, 200, {
      data: {
        user: publicUser(admin),
        stats: {
          totalUsers: users.length,
          totalCustomers: users.filter((item) => item.role === 'customer').length,
          totalPartners: users.filter((item) => item.role === 'partner').length,
          totalSalons: salons.length,
          totalBookings: bookings.length,
          activeSlots: db.slots.filter((item) => item.status === 'open' && item.date >= nextDate(0)).length
        },
        users,
        salons,
        bookings
      }
    });
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/admin/salons/')) {
    const salonId = pathname.split('/').pop();
    const body = await readBody(req);
    const admin = requireRole(db, body.adminId, 'admin');
    if (!admin) return json(res, 403, { error: 'Admin oturumu gerekli.' });
    const salon = db.salons.find((item) => item.id === salonId);
    if (!salon) return json(res, 404, { error: 'Salon bulunamadı.' });
    if (typeof body.isFeatured === 'boolean') salon.isFeatured = body.isFeatured;
    if (body.status) salon.status = body.status;
    await writeDb(db);
    return json(res, 200, { data: salon });
  }

  return notFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === '/partner') return serveStatic(req, res, '/partner.html');
    if (url.pathname === '/admin') return serveStatic(req, res, '/admin.html');
    if (url.pathname === '/customer' || url.pathname === '/musteri') return serveStatic(req, res, '/index.html');

    serveStatic(req, res, url.pathname);
  } catch (error) {
    json(res, 500, { error: error.message || 'Beklenmeyen hata oluştu.' });
  }
});

(async () => {
  ensureDataFiles();
  await ensureFutureSlots();
  server.listen(PORT, () => {
    const dbMode = usePostgres() ? 'PostgreSQL/Supabase' : 'local JSON';
    console.log(`randevumhazır running at http://localhost:${PORT} (${dbMode})`);
  });
})().catch((error) => {
  console.error('STARTUP ERROR:', error);
  process.exit(1);
});
