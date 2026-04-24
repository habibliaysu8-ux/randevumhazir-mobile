const API = {
  async get(url) {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Bir hata oluştu.');
    return data;
  },
  async post(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Bir hata oluştu.');
    return data;
  },
  async patch(url, payload) {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Bir hata oluştu.');
    return data;
  }
};

const Store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  }
};

function byId(id) {
  return document.getElementById(id);
}

function money(value) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(date) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
}

function todayLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createTimeOptions(start = '09:00', end = '21:00', stepMinutes = 30) {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  let current = startHour * 60 + startMinute;
  const finish = endHour * 60 + endMinute;
  const options = [];
  while (current <= finish) {
    const hours = String(Math.floor(current / 60)).padStart(2, '0');
    const minutes = String(current % 60).padStart(2, '0');
    options.push(`${hours}:${minutes}`);
    current += stepMinutes;
  }
  return options;
}

function showToast(message, type = 'default') {
  const el = byId('toast');
  if (!el) return;
  el.textContent = message;
  el.style.background = type === 'error'
    ? 'rgba(154, 74, 86, 0.96)'
    : type === 'success'
      ? 'rgba(57, 111, 87, 0.96)'
      : 'rgba(31, 26, 36, 0.96)';
  el.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

async function fillProvinceSelect(select, selectedId = '34') {
  const { data } = await API.get('/api/geo/provinces');
  select.innerHTML = data.map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
  select.value = String(selectedId || '34');
}

async function fillDistrictSelect(select, provinceId = 34, selectedDistrict, placeholder = 'Tüm ilçeler') {
  const { data } = await API.get(`/api/geo/districts?provinceId=${provinceId}`);
  select.innerHTML = `<option value="">${placeholder}</option>` + data.map((item) => `<option value="${item.name}">${item.name}</option>`).join('');
  if (selectedDistrict) select.value = selectedDistrict;
}

function optionText(select) {
  return select.options[select.selectedIndex]?.textContent || '';
}

function populateTimeSelect(select, placeholder = 'Herhangi bir saat', selectedValue = '') {
  const options = createTimeOptions();
  select.innerHTML = `<option value="">${placeholder}</option>` + options.map((item) => `<option value="${item}">${item}</option>`).join('');
  if (selectedValue) select.value = selectedValue;
}
