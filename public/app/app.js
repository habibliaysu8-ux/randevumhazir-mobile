const API_BASE = localStorage.getItem('RH_API_BASE') || '';
const state = {
  user: JSON.parse(localStorage.getItem('rh_customer_user') || 'null'),
  authMode: 'login',
  selectedCategory: '',
  stores: [],
  currentStore: null,
  cityId: '34',
  serviceOptions: []
};

const $ = (id) => document.getElementById(id);
const fallbackCategories = ['Tümü', 'Protez Tırnak', 'Manikür', 'Pedikür', 'Cilt Bakımı', 'Saç', 'Lazer', 'Kaş ve Kirpik'];
const fallbackServices = ['Protez Tırnak', 'Jel Protez Tırnak', 'Kalıcı Oje', 'Manikür', 'Klasik Manikür', 'Pedikür', 'Spa Pedikür', 'Cilt Bakımı', 'Hydrafacial', 'Saç', 'Saç Kesimi', 'Fön', 'Dip Boya', 'Lazer', 'Bölgesel Lazer', 'Tüm Vücut Lazer', 'Kaş ve Kirpik', 'Kaş Tasarımı', 'Kirpik Lifting', 'Masaj', 'Makyaj', 'Gelin Makyajı'];

async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
  return data;
}

function toast(msg) {
  $('toast').textContent = msg;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2300);
}

function keepPageStill(action) {
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const x = window.scrollX || document.documentElement.scrollLeft || 0;
  const active = document.activeElement;
  if (active && typeof active.blur === 'function') active.blur();
  const done = () => setTimeout(() => window.scrollTo({ left: x, top: y, behavior: 'auto' }), 0);
  try {
    const result = action && action();
    if (result && typeof result.then === 'function') return result.finally(done);
    done();
    return result;
  } catch (err) {
    done();
    throw err;
  }
}

function setUser(user) {
  state.user = user;
  user ? localStorage.setItem('rh_customer_user', JSON.stringify(user)) : localStorage.removeItem('rh_customer_user');
  renderAuthButton();
}

function renderAuthButton() {
  $('authBtn').textContent = state.user ? state.user.name.split(' ')[0] : 'Giriş yap';
  $('logoutBtn').classList.toggle('hidden', !state.user);
}

function buildDateOptions() {
  const input = $('daySelect');
  const button = $('daySelectButton');
  if (!input) return;
  input.value = '';
  input.dataset.iso = '';
  if (button) { button.textContent = 'Gün seç'; button.style.display = 'block'; }
  const today = new Date();
  state.calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
}

function isoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function renderCalendarDays() {
  const daysBox = $('calendarDays');
  const monthLabel = $('calendarMonthLabel');
  if (!daysBox) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const max = new Date(today);
  max.setDate(today.getDate() + 30);

  const base = state.calendarMonth || new Date(today.getFullYear(), today.getMonth(), 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const selected = $('daySelect')?.dataset.iso || '';

  if (monthLabel) {
    monthLabel.textContent = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(base);
  }

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let html = '';

  for (let i = 0; i < startOffset; i += 1) {
    html += '<span class="calendar-blank"></span>';
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    const iso = isoLocal(d);
    const disabled = d < today || d > max;
    const isToday = iso === isoLocal(today);
    html += `<button type="button" class="calendar-date ${selected === iso ? 'active' : ''} ${isToday ? 'today' : ''}" ${disabled ? 'disabled' : ''} data-calendar-date="${iso}">${day}</button>`;
  }

  daysBox.innerHTML = html;
  document.querySelectorAll('[data-calendar-date]').forEach((btn) => {
    btn.onclick = () => selectCalendarDate(btn.dataset.calendarDate);
  });
}

function changeCalendarMonth(delta) {
  const today = new Date();
  const current = state.calendarMonth || new Date(today.getFullYear(), today.getMonth(), 1);
  state.calendarMonth = new Date(current.getFullYear(), current.getMonth() + delta, 1);
  renderCalendarDays();
}

function openAppCalendar(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const overlay = $('calendarOverlay');
  if (!overlay) return;
  const selected = $('daySelect')?.dataset.iso;
  const base = selected ? new Date(selected + 'T12:00:00') : new Date();
  state.calendarMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  renderCalendarDays();
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeAppCalendar() {
  const overlay = $('calendarOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function selectCalendarDate(iso) {
  const input = $('daySelect');
  const button = $('daySelectButton');
  if (!input) return;
  input.dataset.iso = iso;
  input.value = iso;
  if (button) button.textContent = formatDateLong(iso);
  closeAppCalendar();
  keepPageStill(() => loadStores());
}

function clearCalendarDate() {
  const input = $('daySelect');
  const button = $('daySelectButton');
  if (!input) return;
  input.dataset.iso = '';
  input.value = '';
  if (button) { button.textContent = 'Gün seç'; button.style.display = 'block'; }
  closeAppCalendar();
  keepPageStill(() => loadStores());
}


function buildTimeOptions() {
  const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
  $('timeSelect').innerHTML = '<option value="">Saat seç</option>' + times.map((t) => `<option value="${t}">${t}</option>`).join('');
}

async function loadCatalog() {
  try {
    const data = await api('/api/catalog');
    const cats = ['Tümü', ...(data.data.categories || [])];
    state.serviceOptions = (data.data.services || [])
      .map((item) => item.label || item.name || item.value || '')
      .filter(Boolean)
      .filter((item) => item !== 'Tüm hizmetler');
    renderCategories(cats);
  } catch (e) {
    state.serviceOptions = fallbackServices;
    renderCategories(fallbackCategories);
  }
  renderServiceDropdown(false);
}

function renderCategories(categories = fallbackCategories) {
  state.selectedCategory = '';
  const list = $('categoryList');
  if (list) list.innerHTML = '';
}

function getServiceMatches() {
  const q = $('searchInput').value.trim().toLocaleLowerCase('tr-TR');
  const options = state.serviceOptions.length ? state.serviceOptions : fallbackServices;
  const unique = [...new Set(options)];
  if (!q) return unique.slice(0, 12);
  return unique.filter((item) => item.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 12);
}

function renderServiceDropdown(show = true) {
  const box = $('serviceDropdown');
  if (!box) return;
  const matches = getServiceMatches();
  if (!show || !matches.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = matches.map((item) => '<button type="button" data-service-option="' + esc(item) + '">' + esc(item) + '</button>').join('');
  box.classList.remove('hidden');
  document.querySelectorAll('[data-service-option]').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      keepPageStill(() => {
        $('searchInput').value = btn.dataset.serviceOption;
        box.classList.add('hidden');
        return loadStores();
      });
    };
  });
}

async function loadProvinces() {
  try {
    const data = await api('/api/geo/provinces');
    $('citySelect').innerHTML = data.data.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    $('citySelect').value = state.cityId;
  } catch (e) {
    $('citySelect').innerHTML = '<option value="34">İstanbul</option><option value="6">Ankara</option><option value="35">İzmir</option>';
  }
  await loadDistricts();
}

async function loadDistricts() {
  state.cityId = $('citySelect').value || '34';
  try {
    const data = await api('/api/geo/districts?provinceId=' + encodeURIComponent(state.cityId));
    $('districtSelect').innerHTML = '<option value="">Tüm ilçeler</option>' + data.data.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join('');
  } catch (e) {
    $('districtSelect').innerHTML = '<option value="">Tüm ilçeler</option>';
  }
}

async function loadStores() {
  $('storeList').innerHTML = '<div class="empty">Salonlar yükleniyor...</div>';
  const q = encodeURIComponent($('searchInput').value.trim());
  const district = encodeURIComponent($('districtSelect').value);
  const category = encodeURIComponent(state.selectedCategory);
  const cityId = encodeURIComponent($('citySelect').value || '34');
  const date = encodeURIComponent($('daySelect').dataset.iso || '');
  const time = encodeURIComponent($('timeSelect').value || '');
  try {
    const data = await api(`/api/stores?cityId=${cityId}&q=${q}&district=${district}&category=${category}&date=${date}&time=${time}`);
    state.stores = data.data || [];
    renderStores();
  } catch (e) {
    $('storeList').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderStores() {
  $('resultCount').textContent = `${state.stores.length} sonuç`;
  if (!state.stores.length) {
    $('storeList').innerHTML = '<div class="empty">Henüz uygun salon yok. Partner panelinden salon ve saat ekleyince burada görünecek.</div>';
    return;
  }
  $('storeList').innerHTML = state.stores.map((s) => {
    const next = s.nextAvailableSlot ? `${formatDate(s.nextAvailableSlot.date)} · ${s.nextAvailableSlot.startTime}` : 'Saat bekleniyor';
    return `<article class="store-card">
      <div class="avatar">${pickEmoji(s.category)}</div>
      <div class="store-meta">
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.district || '')} · ${esc(s.city || '')}</p>
        <p>⭐ ${s.rating || 'Yeni'} · ${next}</p>
        <div class="badge-row">${(s.categories || [s.category]).slice(0, 2).map((c) => `<span class="badge">${esc(c)}</span>`).join('')}</div>
        <button class="card-btn" data-store="${s.id}">Randevu al</button>
      </div>
    </article>`;
  }).join('');
  document.querySelectorAll('[data-store]').forEach((btn) => btn.onclick = () => openStore(btn.dataset.store));
}

async function openStore(id) {
  showView('detail');
  $('storeDetail').innerHTML = '<div class="empty">Detay yükleniyor...</div>';
  try {
    const data = await api('/api/stores/' + id);
    state.currentStore = data.data;
    renderStoreDetail();
  } catch (e) {
    $('storeDetail').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function renderStoreDetail() {
  const s = state.currentStore;
  const selectedDate = $('daySelect').dataset.iso || '';
  const selectedTime = $('timeSelect').value || '';
  const slots = (s.slots || [])
    .filter((sl) => !selectedDate || sl.date === selectedDate)
    .filter((sl) => !selectedTime || sl.startTime >= selectedTime)
    .slice(0, 18);

  $('storeDetail').innerHTML = `<div class="detail-card">
    <div class="detail-cover">${pickEmoji(s.category)}</div>
    <h2>${esc(s.name)}</h2>
    <p class="muted">${esc(s.district)}, ${esc(s.city)} · ${esc(s.address || '')}</p>
    <p>${esc(s.description || 'Randevu için uygun gün ve saat seç.')}</p>
    <div class="badge-row">${(s.categories || []).map((c) => `<span class="badge">${esc(c)}</span>`).join('')}</div>
    <h3>Gün ve saat seçimi</h3>
    ${slots.length ? `<div class="slot-grid">${slots.map((sl) => `<button class="slot-btn" data-slot="${sl.id}"><strong>${formatDate(sl.date)}</strong><small>${sl.startTime} - ${sl.endTime}</small><br><small>${esc(sl.service?.name || 'Hizmet')}</small></button>`).join('')}</div>` : '<div class="empty">Seçtiğin gün/saat için açık saat yok.</div>'}
  </div>`;
  document.querySelectorAll('[data-slot]').forEach((btn) => btn.onclick = () => bookSlot(btn.dataset.slot));
}

async function bookSlot(slotId) {
  if (!state.user) {
    openAuth('login');
    toast('Önce giriş yapmalısın.');
    return;
  }
  try {
    await api('/api/bookings', { method: 'POST', body: JSON.stringify({ customerId: state.user.id, slotId }) });
    toast('Randevu talebin gönderildi ✅');
    await openStore(state.currentStore.id);
  } catch (e) {
    toast(e.message);
  }
}

async function loadDashboard() {
  if (!state.user) {
    $('profileBox').innerHTML = '<div class="empty">Randevularını görmek için giriş yap.</div>';
    $('bookingList').innerHTML = '';
    return;
  }
  $('profileBox').innerHTML = `<strong>${esc(state.user.name)}</strong><p class="muted">${esc(state.user.email)}</p>`;
  $('bookingList').innerHTML = '<div class="empty">Randevular yükleniyor...</div>';
  try {
    const data = await api('/api/customer/dashboard?userId=' + state.user.id);
    const list = data.data.bookings || [];
    $('bookingList').innerHTML = list.length ? list.map((b) => `<article class="booking-card"><strong>${esc(b.salonName)}</strong><p class="muted">${formatDate(b.date)} · ${b.startTime} · ${esc(b.serviceName)}</p><span class="badge">${statusText(b.status)}</span></article>`).join('') : '<div class="empty">Henüz randevun yok.</div>';
  } catch (e) {
    $('bookingList').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function showView(view) {
  ['homeView', 'detailView', 'accountView'].forEach((id) => $(id).classList.add('hidden'));
  if (view === 'home') $('homeView').classList.remove('hidden');
  if (view === 'detail') $('detailView').classList.remove('hidden');
  if (view === 'account') { $('accountView').classList.remove('hidden'); loadDashboard(); }
  document.querySelectorAll('.bottom-nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === view || (view === 'detail' && b.dataset.tab === 'home') || (view === 'bookings' && b.dataset.tab === 'bookings')));
}

function clearAuthInputs() {
  ['nameField', 'emailField', 'phoneField', 'passwordField'].forEach((id) => { $(id).value = ''; });
}

function openAuth(mode = 'login') {
  state.authMode = mode;
  const reg = mode === 'register';
  $('authTitle').textContent = reg ? 'Üye ol' : 'Giriş yap';
  $('submitAuth').textContent = reg ? 'Kayıt ol' : 'Giriş yap';
  $('authSwitchText').textContent = reg ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?';
  $('toggleAuth').textContent = reg ? 'Giriş yap' : 'Kayıt ol';
  $('forgotBtn').classList.toggle('hidden', reg);
  ['nameField', 'phoneField'].forEach((id) => $(id).classList.toggle('hidden', !reg));
  $('authError').textContent = '';
  clearAuthInputs();
  $('authModal').showModal();
  setTimeout(clearAuthInputs, 80);
}

$('authForm').onsubmit = async (e) => {
  e.preventDefault();
  const reg = state.authMode === 'register';
  const payload = { role: 'customer', email: $('emailField').value.trim(), password: $('passwordField').value };
  if (reg) { payload.name = $('nameField').value.trim(); payload.phone = $('phoneField').value.trim(); }
  try {
    const data = await api(reg ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    setUser(data.user);
    $('authModal').close();
    toast(reg ? 'Kayıt tamam ✅' : 'Giriş yapıldı ✅');
    loadDashboard();
  } catch (err) {
    $('authError').textContent = err.message;
  }
};

$('toggleAuth').onclick = () => openAuth(state.authMode === 'login' ? 'register' : 'login');
$('forgotBtn').onclick = async () => {
  const email = $('emailField').value.trim();
  if (!email) { $('authError').textContent = 'Önce e-posta adresini yaz.'; return; }
  try {
    const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email, role: 'customer' }) });
    $('authError').textContent = data.message || 'Şifre yenileme linki mail adresine gönderildi.';
    if (data.devResetUrl) console.log('Şifre yenileme linki:', data.devResetUrl);
  } catch (err) {
    $('authError').textContent = err.message;
  }
};
$('authBtn').onclick = () => state.user ? showView('account') : openAuth('login');
$('closeAuth').onclick = () => $('authModal').close();
$('logoutBtn').onclick = () => { setUser(null); toast('Çıkış yapıldı'); showView('home'); };
$('searchInput').addEventListener('focus', () => keepPageStill(() => renderServiceDropdown(true)));
$('searchInput').addEventListener('input', () => keepPageStill(() => renderServiceDropdown(true)));
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('serviceDropdown')?.classList.add('hidden'); keepPageStill(() => loadStores()); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.service-search-wrap')) $('serviceDropdown')?.classList.add('hidden'); });
$('searchBtn').onclick = () => { $('serviceDropdown')?.classList.add('hidden'); keepPageStill(() => loadStores()); };
$('citySelect').onchange = async () => keepPageStill(async () => { await loadDistricts(); return loadStores(); });
$('districtSelect').onchange = () => keepPageStill(() => loadStores());
function bindCalendarTrigger() {
  const trigger = $('daySelectButton');
  const wrap = $('daySelectWrap');
  if (trigger) trigger.addEventListener('click', openAppCalendar);
  if (wrap) wrap.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#daySelectButton')) return;
    openAppCalendar(e);
  });
}
bindCalendarTrigger();
$('calendarPrev') && ($('calendarPrev').onclick = () => changeCalendarMonth(-1));
$('calendarNext') && ($('calendarNext').onclick = () => changeCalendarMonth(1));
$('calendarClose') && ($('calendarClose').onclick = closeAppCalendar);
$('calendarClear') && ($('calendarClear').onclick = clearCalendarDate);
$('calendarOverlay') && ($('calendarOverlay').onclick = (e) => { if (e.target.id === 'calendarOverlay') closeAppCalendar(); });

$('timeSelect').onchange = () => keepPageStill(() => loadStores());
$('backHome').onclick = () => showView('home');
document.querySelectorAll('.bottom-nav button').forEach((b) => b.onclick = () => { if (b.dataset.tab === 'home') showView('home'); else showView('account'); });

function pickEmoji(c = '') { if (c.includes('Tırnak') || c.includes('Manikür')) return '💅'; if (c.includes('Saç')) return '💇‍♀️'; if (c.includes('Lazer')) return '✨'; if (c.includes('Cilt')) return '🧖‍♀️'; return '🌸'; }
function statusText(s) { return { pending: 'Bekliyor', confirmed: 'Onaylandı', rejected: 'Reddedildi' }[s] || s; }
function formatDate(value) { if (!value) return ''; const d = new Date(value + 'T12:00:00'); return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', weekday: 'short' }).format(d); }
function formatDateLong(value) { if (!value) return 'Gün seç'; const d = new Date(value + 'T12:00:00'); return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d); }
function esc(v = '') { return String(v).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {}); }
if ('caches' in window) { caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {}); }

function forceDayFieldReady() {
  const input = $('daySelect');
  const btn = $('daySelectButton');
  if (input) {
    input.type = 'hidden';
    input.value = input.dataset.iso || '';
  }
  if (btn && !btn.textContent.trim()) btn.textContent = 'Gün seç';
  if (btn) btn.style.display = 'block';
}
forceDayFieldReady();
setTimeout(forceDayFieldReady, 50);
setTimeout(forceDayFieldReady, 300);

renderAuthButton();
buildDateOptions();
buildTimeOptions();
loadCatalog();
loadProvinces().then(loadStores);
