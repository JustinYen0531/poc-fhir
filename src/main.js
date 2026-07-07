import * as fhir from './fhir.js';
import * as voice from './voice.js';
import * as render from './render.js';

const $ = sel => document.querySelector(sel);

const state = {
  patient: null,
  data: null,
  activeTab: 'vitals',
};

// ---------- 提示訊息 ----------
let toastTimer = null;
function toast(message, kind = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------- 伺服器連線 ----------
async function checkServer() {
  const dot = $('#server-status');
  dot.className = 'status-dot pending';
  dot.title = '連線中…';
  fhir.setBaseUrl($('#server-url').value);
  try {
    await fhir.ping();
    dot.className = 'status-dot ok';
    dot.title = '已連線';
  } catch (err) {
    dot.className = 'status-dot fail';
    dot.title = `連線失敗:${err.message}`;
  }
}

$('#server-url').addEventListener('change', checkServer);

// ---------- 病人搜尋 ----------
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = $('#search-input').value.trim();
  const box = $('#search-results');
  if (!query) return;
  box.innerHTML = `<p class="hint">搜尋中…</p>`;
  try {
    const patients = await fhir.searchPatients(query);
    box.innerHTML = patients.length
      ? patients.map(render.patientCard).join('')
      : `<p class="hint">找不到符合的病人。</p>`;
  } catch (err) {
    box.innerHTML = `<p class="hint error">搜尋失敗:${err.message}</p>`;
  }
});

$('#search-results').addEventListener('click', (e) => {
  const btn = e.target.closest('.patient-result');
  if (btn) selectPatient(btn.dataset.patientId);
});

// ---------- 新病人建立 ----------
$('#create-patient-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const values = Object.fromEntries(new FormData(form).entries());
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '建立中…';
  try {
    const patient = await fhir.createPatient(values);
    form.reset();
    await activatePatient(patient);
    toast(`已建立新病人，FHIR ID：${patient.id}`, 'ok');
  } catch (err) {
    toast(`建立病人失敗:${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '建立並選取新病人';
  }
});

// ---------- 病人選取與資料載入 ----------
async function selectPatient(patientId) {
  const header = $('#patient-header');
  header.classList.remove('empty');
  header.innerHTML = `<p class="hint">載入病人資料中…</p>`;
  $('#tab-content').innerHTML = '';
  try {
    const res = await fetch(`${fhir.getBaseUrl()}/Patient/${patientId}`, { headers: { Accept: 'application/fhir+json' } });
    if (!res.ok) throw new Error(`無法讀取病人 (${res.status})`);
    await activatePatient(await res.json());
  } catch (err) {
    header.innerHTML = `<p class="hint error">${err.message}</p>`;
  }
}

async function activatePatient(patient) {
  state.patient = patient;
  state.data = null;
  const header = $('#patient-header');
  header.classList.remove('empty');
  header.innerHTML = render.patientBanner(patient);
  $('#clinical-tabs').classList.remove('hidden');
  $('#vitals-form button[type=submit]').disabled = false;
  $('#save-note').disabled = false;
  $('#export-actions').classList.add('hidden');
  await refreshClinicalData();
}

async function refreshClinicalData() {
  if (!state.patient) return;
  const content = $('#tab-content');
  content.innerHTML = `<p class="hint">載入臨床資料中…</p>`;
  try {
    state.data = await fhir.getPatientEverything(state.patient.id);
    renderTab();
    $('#export-actions').classList.remove('hidden');
  } catch (err) {
    content.innerHTML = `<p class="hint error">載入失敗:${err.message}</p>`;
  }
}

// ---------- FHIR JSON 匯出 ----------
function createCollectionBundle(resources) {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: resources.length,
    entry: resources.map(resource => ({
      ...(resource.id ? { fullUrl: `${fhir.getBaseUrl()}/${resource.resourceType}/${resource.id}` } : {}),
      resource,
    })),
  };
}

function downloadFhirJson(bundle, filename) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

$('#export-bundle').addEventListener('click', () => {
  if (!state.patient || !state.data) return;
  const resources = [state.patient, ...Object.values(state.data).flat()];
  downloadFhirJson(createCollectionBundle(resources), `patient-${state.patient.id}-fhir-bundle.json`);
  toast(`已匯出完整 FHIR Bundle（${resources.length} 筆資源）。`, 'ok');
});

$('#export-observations').addEventListener('click', () => {
  if (!state.patient || !state.data) return;
  const observations = state.data.vitals;
  downloadFhirJson(createCollectionBundle(observations), `patient-${state.patient.id}-observations.json`);
  toast(`已匯出床邊 Observation（${observations.length} 筆）。`, 'ok');
});

// ---------- 分頁 ----------
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.activeTab = tab.dataset.tab;
    renderTab();
  });
});

function renderTab() {
  if (!state.data) return;
  const { vitals, conditions, medications, allergies, notes } = state.data;
  const views = {
    vitals: () => render.vitalsTable(vitals),
    conditions: () => render.conditionsList(conditions),
    medications: () => render.medicationsList(medications),
    allergies: () => render.allergiesList(allergies),
    notes: () => render.notesList(notes),
  };
  $('#tab-content').innerHTML = views[state.activeTab]();
}

// ---------- 生命徵象寫入 ----------
$('#vitals-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.patient) return;
  const form = e.target;
  const values = Object.fromEntries(new FormData(form).entries());
  if (!Object.values(values).some(v => v)) {
    toast('請至少填寫一項生命徵象。', 'warn');
    return;
  }
  const gcsValues = [values.gcsEye, values.gcsVerbal, values.gcsMotor];
  if (gcsValues.some(Boolean) && !gcsValues.every(Boolean)) {
    toast('GCS 請完整填寫睜眼、語言與動作三項。', 'warn');
    return;
  }
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '寫入中…';
  try {
    const created = await fhir.recordVitals(state.patient.id, values);
    toast(`已寫入 ${created.length} 筆 Observation 至 FHIR 伺服器。`, 'ok');
    form.reset();
    await refreshClinicalData();
  } catch (err) {
    toast(`寫入失敗:${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '寫入 FHIR';
  }
});

// ---------- 臨床紀錄儲存 ----------
$('#save-note').addEventListener('click', async () => {
  const text = $('#note-input').value.trim();
  if (!text || !state.patient) return;
  const btn = $('#save-note');
  btn.disabled = true;
  btn.textContent = '儲存中…';
  try {
    await fhir.saveClinicalNote(state.patient.id, text);
    toast('臨床紀錄已儲存至 FHIR(DocumentReference)。', 'ok');
    $('#note-input').value = '';
    await refreshClinicalData();
  } catch (err) {
    toast(`儲存失敗:${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存紀錄至 FHIR';
  }
});

// ---------- 語音輸入 ----------
function setupVoice() {
  const statusEl = $('#voice-status');
  if (!voice.isSupported()) {
    statusEl.textContent = '⚠ 此瀏覽器不支援語音辨識(建議使用 Chrome / Edge)。';
    document.querySelectorAll('.mic-btn').forEach(b => (b.disabled = true));
    return;
  }

  document.querySelectorAll('.mic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.micTarget);
      if (voice.isDictating(target)) {
        voice.stopDictation();
        return;
      }
      voice.startDictation(target, $('#voice-lang').value, (stateName, detail) => {
        if (stateName === 'listening') {
          btn.classList.add('recording');
          statusEl.textContent = '🔴 聆聽中… 再按一次結束。';
        } else if (stateName === 'stopped') {
          btn.classList.remove('recording');
          statusEl.textContent = '';
        } else if (stateName === 'error') {
          btn.classList.remove('recording');
          statusEl.textContent = `⚠ ${detail}`;
        }
      });
    });
  });
}

// ---------- 啟動 ----------
setupVoice();
checkServer();
