const PARTNER_KEY = 'randevumhazir_partner';
const PARTNER_ACTION_BUTTONS = ['saveSalonBtn', 'addServiceBtn', 'addStaffBtn', 'addSlotBtn'];

function openModal(id) { byId(id)?.classList.add('open'); }
function closeModal(id) { byId(id)?.classList.remove('open'); }
function byIds(ids = []) { return ids.map((id) => byId(id)).filter(Boolean); }

const partnerState = {
  partner: Store.get(PARTNER_KEY),
  dashboard: null,
  selectedPlanCode: 'daily'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearPartnerAuthInputs() {
  ['partnerLoginEmail', 'partnerLoginPassword', 'partnerRegisterName', 'partnerRegisterPhone', 'partnerRegisterEmail', 'partnerRegisterPassword'].forEach((id) => {
    const el = byId(id);
    if (el) el.value = '';
  });
}

function clearPaymentInputs() {
  ['cardHolder', 'cardNumber', 'cardExpiry', 'cardCvc'].forEach((id) => {
    const el = byId(id);
    if (el) el.value = '';
  });
}

function tableFrom(columns, rowsHtml) {
  return `
    <table class="table">
      <thead><tr>${columns.map((col) => `<th>${col}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${columns.length}">Kayıt yok.</td></tr>`}</tbody>
    </table>
  `;
}

function bookingStatusLabel(status) {
  if (status === 'confirmed') return 'onaylandı';
  if (status === 'rejected') return 'reddedildi';
  return 'beklemede';
}

function bookingStatusBadgeClass(status) {
  if (status === 'confirmed') return 'success';
  if (status === 'rejected') return '';
  return '';
}

async function updateBookingStatus(bookingId, status) {
  if (!partnerState.partner) throw new Error('Önce partner girişi yap.');
  const { data } = await API.patch('/api/partner/bookings/status', {
    partnerId: partnerState.partner.id,
    bookingId,
    status
  });
  return data;
}

function getPrimarySalon() {
  return partnerState.dashboard?.salons?.[0] || null;
}

function getBillingData() {
  return partnerState.dashboard?.billing || { status: 'trial', accessActive: true, plans: [], payments: [] };
}

function hasPartnerAccess() {
  return Boolean(getBillingData().accessActive);
}

function togglePartnerView() {
  const isAuthenticated = Boolean(partnerState.partner);
  byId('partnerAuthSection').hidden = isAuthenticated;
  byId('partnerWorkspaceSection').hidden = !isAuthenticated;
  byId('partnerLogoutBtn').style.visibility = isAuthenticated ? 'visible' : 'hidden';
}

function setWorkspaceLocked(isLocked) {
  byIds(PARTNER_ACTION_BUTTONS).forEach((button) => {
    button.disabled = isLocked;
    button.classList.toggle('is-disabled', isLocked);
  });

  ['salonName', 'salonCategory', 'salonProvince', 'salonDistrict', 'salonAddress', 'salonCoverImage', 'salonDescription',
   'serviceName', 'serviceCategory', 'serviceDuration', 'servicePrice', 'staffName', 'staffTitle',
   'slotService', 'slotStaff', 'slotDate', 'slotTime'].forEach((id) => {
    const el = byId(id);
    if (el) el.disabled = isLocked;
  });
}

function resetPartnerForms() {
  [
    'salonName', 'salonCategory', 'salonAddress', 'salonCoverImage', 'salonDescription',
    'serviceName', 'serviceCategory', 'serviceDuration', 'servicePrice',
    'staffName', 'staffTitle'
  ].forEach((id) => { if (byId(id)) byId(id).value = ''; });

  byId('slotDate').value = '';
  byId('slotTime').value = '';
}

function hydrateSalonForm() {
  const salon = getPrimarySalon();
  if (!salon) {
    resetPartnerForms();
    byId('salonProvince').value = '34';
    fillDistrictSelect(byId('salonDistrict'), 34).catch(() => {});
    return;
  }
  byId('salonName').value = salon.name || '';
  byId('salonCategory').value = salon.category || '';
  byId('salonAddress').value = salon.address || '';
  byId('salonCoverImage').value = salon.coverImage || '';
  byId('salonDescription').value = salon.description || '';
  byId('salonProvince').value = String(salon.cityId || 34);
  fillDistrictSelect(byId('salonDistrict'), Number(salon.cityId || 34), salon.district).catch(() => {});
}

function fillPartnerSelects() {
  const services = partnerState.dashboard?.services || [];
  const staff = partnerState.dashboard?.staff || [];
  byId('slotService').innerHTML = '<option value="">Hizmet seç</option>' + services.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${item.duration} dk</option>`).join('');
  byId('slotStaff').innerHTML = '<option value="">Uzman seç</option>' + staff.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.title)}</option>`).join('');
}

function renderSlotPreview(slots, services, staff, salons) {
  const container = byId('partnerSlotPreview');
  if (!container) return;
  const openSlots = (slots || []).filter((item) => item.status === 'open');
  if (!openSlots.length) {
    container.innerHTML = '<div class="empty-state">Henüz açık saat yok. Yeni bir saat yayınladığında burada kısa özet görünür.</div>';
    return;
  }
  container.innerHTML = openSlots.slice(0, 6).map((slot) => {
    const service = services.find((item) => item.id === slot.serviceId);
    const member = staff.find((item) => item.id === slot.staffId);
    const salon = salons.find((item) => item.id === slot.salonId);
    return `
      <article class="slot-preview-card">
        <div class="slot-preview-time">${escapeHtml(slot.startTime)}</div>
        <strong>${escapeHtml(service?.name || '-')}</strong>
        <span>${escapeHtml(member?.name || '-')} · ${escapeHtml(formatDate(slot.date))}</span>
        <span class="muted">${escapeHtml(salon?.name || '-')}</span>
      </article>
    `;
  }).join('');
}

function billingStatusText(billing) {
  if (billing.status === 'paid') {
    return `${billing.plan?.name || 'Paket'} aktif · Bitiş ${formatDate(billing.planEndsAt?.slice(0, 10))}`;
  }
  if (billing.status === 'trial') {
    return `2 günlük ücretsiz kullanım aktif · Bitiş ${formatDate(billing.trialEndsAt?.slice(0, 10))}`;
  }
  return 'Ücretsiz süre bitti · Devam etmek için paket seç';
}

function renderBillingPanel() {
  const container = byId('partnerBillingPanel');
  if (!container) return;

  if (!partnerState.partner || !partnerState.dashboard) {
    container.innerHTML = '<div class="empty-state">Giriş yaptığında paket ve ödeme bilgisi burada görünür.</div>';
    return;
  }

  const billing = getBillingData();
  const plans = billing.plans || [];
  if (!plans.find((item) => item.code === partnerState.selectedPlanCode) && plans[0]) {
    partnerState.selectedPlanCode = plans[0].code;
  }

  const payments = billing.payments || [];
  const statusClass = billing.status === 'paid' ? 'is-paid' : billing.status === 'trial' ? 'is-trial' : 'is-expired';

  container.innerHTML = `
    <div class="partner-billing-grid">
      <article class="billing-status-card ${statusClass}">
        <div class="eyebrow">Kullanım durumu</div>
        <h3>${billingStatusText(billing)}</h3>
        <p class="muted">Mağaza açma, hizmet ekleme ve saat yayınlama erişimi bu duruma göre çalışır.</p>
        ${billing.accessActive
          ? '<div class="billing-access-pill success">Erişim açık</div>'
          : '<div class="billing-access-pill danger">Erişim kilitli</div>'}
      </article>

      <article class="billing-plan-card">
        <div class="eyebrow">Paket seç</div>
        <div class="plan-grid">
          ${plans.map((plan) => `
            <button type="button" class="plan-card ${partnerState.selectedPlanCode === plan.code ? 'active' : ''}" data-plan-code="${plan.code}">
              <strong>${escapeHtml(plan.name)}</strong>
              <span>${money(plan.price)}</span>
              <small>${escapeHtml(plan.description)}</small>
            </button>
          `).join('')}
        </div>
      </article>

      <article class="billing-payment-card">
        <div class="eyebrow">Kartla ödeme</div>
        <div class="form-stack compact-stack">
          <div class="field"><label>Kart üzerindeki ad soyad</label><input id="cardHolder" type="text" placeholder="Ad Soyad" autocomplete="off" /></div>
          <div class="field"><label>Kart numarası</label><input id="cardNumber" type="text" inputmode="numeric" placeholder="0000 0000 0000 0000" autocomplete="off" /></div>
          <div class="billing-inline-fields">
            <div class="field"><label>Son kullanma</label><input id="cardExpiry" type="text" placeholder="AA/YY" autocomplete="off" /></div>
            <div class="field"><label>CVC</label><input id="cardCvc" type="text" inputmode="numeric" placeholder="123" autocomplete="off" /></div>
          </div>
          <button id="purchasePlanBtn" class="button dark full">Kartla öde ve paketi başlat</button>
          <p class="muted tiny">İlk 2 gün ücretsizdir. Sonrasında seçtiğin paket kadar erişim açılır.</p>
        </div>
      </article>
    </div>

    <div class="billing-history-card">
      <div class="section-header"><h3>Son ödemeler</h3></div>
      ${payments.length ? `
        <div class="payment-history-list">
          ${payments.map((payment) => `
            <div class="payment-history-item">
              <div>
                <strong>${escapeHtml(payment.planName)}</strong>
                <div class="muted">${escapeHtml(payment.cardMasked)} · ${escapeHtml(formatDate(payment.createdAt.slice(0, 10)))}</div>
              </div>
              <span>${money(payment.amount)}</span>
            </div>
          `).join('')}
        </div>
      ` : '<div class="empty-state compact-empty">Henüz kart ödemesi yok.</div>'}
    </div>
  `;

  byId('purchasePlanBtn')?.addEventListener('click', () => purchasePlan().catch((error) => showToast(error.message, 'error')));
  container.querySelectorAll('[data-plan-code]').forEach((button) => {
    button.addEventListener('click', () => {
      partnerState.selectedPlanCode = button.dataset.planCode;
      renderBillingPanel();
    });
  });
}

function renderPartnerDashboard() {
  const data = partnerState.dashboard;

  if (!partnerState.partner || !data) {
    byId('partnerMetrics').innerHTML = `
      <div class="metric-card"><span class="muted">Salon</span><strong>0</strong></div>
      <div class="metric-card"><span class="muted">Hizmet</span><strong>0</strong></div>
      <div class="metric-card"><span class="muted">Açık saat</span><strong>0</strong></div>
      <div class="metric-card"><span class="muted">Rezervasyon</span><strong>0</strong></div>
    `;
    byId('partnerSummaryText').textContent = 'Giriş yaptıktan sonra mağaza profilini oluşturup hizmet vermeye başlayabilirsin.';
    byId('partnerListsSummary').innerHTML = '<div class="empty-state">Henüz içerik yok.</div>';
    byId('partnerSlotPreview').innerHTML = '<div class="empty-state">Henüz açık saat yok.</div>';
    byId('partnerSlotsTable').innerHTML = '<div class="empty-state">Henüz veri yok.</div>';
    byId('partnerBookingsTable').innerHTML = '<div class="empty-state">Henüz rezervasyon yok.</div>';
    byId('openSlotsModalBtn').disabled = true;
    renderBillingPanel();
    return;
  }

  byId('partnerSummaryText').textContent = data.salons.length
    ? `${data.salons[0].name} yayında. Yeni hizmet ve saatler müşteri panelinde aramaya dahil edilir.`
    : 'İlk adım olarak mağaza profilini oluştur. Sonra hizmet, uzman ve saat ekleyebilirsin.';

  byId('partnerMetrics').innerHTML = `
    <div class="metric-card"><span class="muted">Salon</span><strong>${data.stats.salonCount}</strong></div>
    <div class="metric-card"><span class="muted">Hizmet</span><strong>${data.stats.serviceCount}</strong></div>
    <div class="metric-card"><span class="muted">Açık saat</span><strong>${data.stats.openSlotCount}</strong></div>
    <div class="metric-card"><span class="muted">Rezervasyon</span><strong>${data.stats.bookingCount}</strong></div>
  `;

  const salons = data.salons;
  const services = data.services;
  const staff = data.staff;

  byId('openSlotsModalBtn').disabled = false;

  byId('partnerListsSummary').innerHTML = `
    <div class="info-list compact-list">
      <div class="info-row"><div><strong>Salonlar</strong><div class="muted">${salons.map((item) => escapeHtml(item.name)).join(', ') || '-'}</div></div></div>
      <div class="info-row"><div><strong>Hizmetler</strong><div class="muted">${services.map((item) => escapeHtml(item.name)).join(', ') || '-'}</div></div></div>
      <div class="info-row"><div><strong>Uzmanlar</strong><div class="muted">${staff.map((item) => escapeHtml(item.name)).join(', ') || '-'}</div></div></div>
    </div>
  `;

  renderSlotPreview(data.slots, services, staff, salons);

  byId('partnerSlotsTable').innerHTML = tableFrom(
    ['Salon', 'Hizmet', 'Uzman', 'Tarih/Saat', 'Durum'],
    data.slots.filter((item) => item.status === 'open').map((slot) => {
      const service = services.find((item) => item.id === slot.serviceId);
      const member = staff.find((item) => item.id === slot.staffId);
      const salon = salons.find((item) => item.id === slot.salonId);
      return `
        <tr>
          <td>${escapeHtml(salon?.name || '-')}</td>
          <td>${escapeHtml(service?.name || '-')}</td>
          <td>${escapeHtml(member?.name || '-')}</td>
          <td>${escapeHtml(formatDate(slot.date))} · ${escapeHtml(slot.startTime)}</td>
          <td><span class="status-badge ${slot.status === 'open' ? 'success' : ''}">${escapeHtml(slot.status)}</span></td>
        </tr>
      `;
    }).join('')
  );

  byId('partnerBookingsTable').innerHTML = tableFrom(
    ['Salon', 'Hizmet', 'Uzman', 'Tarih/Saat', 'Durum'],
    data.bookings.map((booking) => `
      <tr>
        <td>${escapeHtml(booking.salonName)}</td>
        <td>${escapeHtml(booking.serviceName)}</td>
        <td>${escapeHtml(booking.staffName)}</td>
        <td>${escapeHtml(formatDate(booking.date))} · ${escapeHtml(booking.startTime)}</td>
        <td>
          ${booking.status === 'pending'
            ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span>${bookingStatusLabel(booking.status)}</span>
                <button type="button" class="button soft" data-booking-action="confirm" data-booking-id="${booking.id}">Onayla</button>
                <button type="button" class="button soft" data-booking-action="reject" data-booking-id="${booking.id}">Reddet</button>
              </div>`
            : `<span class="status-badge ${bookingStatusBadgeClass(booking.status)}">${escapeHtml(bookingStatusLabel(booking.status))}</span>`}
        </td>
      </tr>
    `).join('')
  );

  hydrateSalonForm();
  fillPartnerSelects();
  renderBillingPanel();
  setWorkspaceLocked(!hasPartnerAccess());
}

async function loadPartnerDashboard() {
  if (!partnerState.partner) {
    partnerState.dashboard = null;
    togglePartnerView();
    renderPartnerDashboard();
    return;
  }

  try {
    const { data } = await API.get(`/api/partner/dashboard?userId=${partnerState.partner.id}`);
    partnerState.dashboard = data;
    togglePartnerView();
    renderPartnerDashboard();
  } catch (error) {
    partnerState.partner = null;
    partnerState.dashboard = null;
    Store.remove(PARTNER_KEY);
    togglePartnerView();
    renderPartnerDashboard();
    throw error;
  }
}

async function loginPartner() {
  const email = byId('partnerLoginEmail').value.trim();
  const password = byId('partnerLoginPassword').value.trim();
  const { user } = await API.post('/api/auth/login', { email, password, role: 'partner' });
  partnerState.partner = user;
  Store.set(PARTNER_KEY, user);
  await loadPartnerDashboard();
  showToast('Partner girişi başarılı.', 'success');
}

async function registerPartner() {
  const name = byId('partnerRegisterName').value.trim();
  const phone = byId('partnerRegisterPhone').value.trim();
  const email = byId('partnerRegisterEmail').value.trim();
  const password = byId('partnerRegisterPassword').value.trim();
  const { user } = await API.post('/api/auth/register', { role: 'partner', name, phone, email, password });
  partnerState.partner = user;
  Store.set(PARTNER_KEY, user);
  clearPartnerAuthInputs();
  await loadPartnerDashboard();
  showToast('Partner hesabı oluşturuldu. 2 günlük ücretsiz kullanım başladı.', 'success');
}

async function purchasePlan() {
  if (!partnerState.partner) throw new Error('Önce partner girişi yap.');
  const planCode = partnerState.selectedPlanCode;
  if (!planCode) throw new Error('Önce paket seç.');

  await API.post('/api/partner/subscribe', {
    partnerId: partnerState.partner.id,
    planCode,
    card: {
      holder: byId('cardHolder')?.value.trim(),
      number: byId('cardNumber')?.value.trim(),
      expiry: byId('cardExpiry')?.value.trim(),
      cvc: byId('cardCvc')?.value.trim()
    }
  });

  clearPaymentInputs();
  await loadPartnerDashboard();
  showToast('Paket aktif edildi.', 'success');
}

async function saveSalon() {
  if (!partnerState.partner) throw new Error('Önce partner girişi yap.');
  const salon = getPrimarySalon();
  await API.post('/api/partner/salon', {
    id: salon?.id,
    partnerId: partnerState.partner.id,
    name: byId('salonName').value.trim(),
    category: byId('salonCategory').value.trim(),
    categories: [byId('salonCategory').value.trim()].filter(Boolean),
    cityId: Number(byId('salonProvince').value),
    district: byId('salonDistrict').value,
    address: byId('salonAddress').value.trim(),
    coverImage: byId('salonCoverImage').value.trim(),
    description: byId('salonDescription').value.trim()
  });
  await loadPartnerDashboard();
  showToast('Salon profili kaydedildi.', 'success');
}

async function addService() {
  const salon = getPrimarySalon();
  if (!salon) throw new Error('Önce salon profilini kaydet.');
  await API.post('/api/partner/services', {
    partnerId: partnerState.partner.id,
    salonId: salon.id,
    name: byId('serviceName').value.trim(),
    category: byId('serviceCategory').value.trim(),
    duration: Number(byId('serviceDuration').value),
    price: Number(byId('servicePrice').value)
  });
  byId('serviceName').value = '';
  byId('serviceCategory').value = '';
  byId('serviceDuration').value = '';
  byId('servicePrice').value = '';
  await loadPartnerDashboard();
  showToast('Hizmet eklendi.', 'success');
}

async function addStaff() {
  const salon = getPrimarySalon();
  if (!salon) throw new Error('Önce salon profilini kaydet.');
  await API.post('/api/partner/staff', {
    partnerId: partnerState.partner.id,
    salonId: salon.id,
    name: byId('staffName').value.trim(),
    title: byId('staffTitle').value.trim()
  });
  byId('staffName').value = '';
  byId('staffTitle').value = '';
  await loadPartnerDashboard();
  showToast('Uzman eklendi.', 'success');
}

async function addSlot() {
  const salon = getPrimarySalon();
  if (!salon) throw new Error('Önce salon profilini kaydet.');
  await API.post('/api/partner/slots', {
    partnerId: partnerState.partner.id,
    salonId: salon.id,
    serviceId: byId('slotService').value,
    staffId: byId('slotStaff').value,
    date: byId('slotDate').value,
    startTime: byId('slotTime').value
  });
  byId('slotDate').value = '';
  byId('slotTime').value = '';
  await loadPartnerDashboard();
  showToast('Saat yayınlandı. Müşteri panelinde aramaya dahil edildi.', 'success');
}

function bindEvents() {
  byId('partnerLoginBtn').addEventListener('click', () => loginPartner().catch((error) => showToast(error.message, 'error')));
  byId('partnerRegisterBtn').addEventListener('click', () => registerPartner().catch((error) => showToast(error.message, 'error')));
  byId('saveSalonBtn').addEventListener('click', () => saveSalon().catch((error) => showToast(error.message, 'error')));
  byId('addServiceBtn').addEventListener('click', () => addService().catch((error) => showToast(error.message, 'error')));
  byId('addStaffBtn').addEventListener('click', () => addStaff().catch((error) => showToast(error.message, 'error')));
  byId('addSlotBtn').addEventListener('click', () => addSlot().catch((error) => showToast(error.message, 'error')));
  byId('salonProvince').addEventListener('change', () => {
    fillDistrictSelect(byId('salonDistrict'), Number(byId('salonProvince').value));
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.close));
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  byId('openSlotsModalBtn').addEventListener('click', () => {
    if (!partnerState.partner || !partnerState.dashboard) {
      showToast('Önce giriş yap.', 'error');
      return;
    }
    openModal('slotsModal');
  });

  byId('partnerBookingsTable').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-booking-action]');
    if (!button) return;

    button.disabled = true;
    const action = button.dataset.bookingAction;
    const bookingId = button.dataset.bookingId;
    const status = action === 'confirm' ? 'confirmed' : 'rejected';

    try {
      await updateBookingStatus(bookingId, status);
      await loadPartnerDashboard();
      showToast(status === 'confirmed' ? 'Randevu onaylandı.' : 'Randevu reddedildi.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
      button.disabled = false;
    }
  });

  byId('partnerLogoutBtn').addEventListener('click', () => {
    partnerState.partner = null;
    partnerState.dashboard = null;
    Store.remove(PARTNER_KEY);
    closeModal('slotsModal');
    clearPaymentInputs();
    togglePartnerView();
    renderPartnerDashboard();
    showToast('Çıkış yapıldı.');
  });
}

async function initPartnerPage() {
  await fillProvinceSelect(byId('salonProvince'), 34);
  await fillDistrictSelect(byId('salonDistrict'), 34);
  populateTimeSelect(byId('slotTime'), 'Saat seç');
  byId('slotDate').value = '';
  byId('slotDate').min = todayLocalDate();
  togglePartnerView();
  clearPartnerAuthInputs();
  setTimeout(clearPartnerAuthInputs, 200);
  bindEvents();
  await loadPartnerDashboard();
}

initPartnerPage().catch((error) => showToast(error.message, 'error'));
