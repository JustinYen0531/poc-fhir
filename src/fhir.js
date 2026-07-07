// FHIR R4 client — thin wrapper over fetch for the point-of-care app.

let baseUrl = 'https://hapi.fhir.org/baseR4';

export function setBaseUrl(url) {
  baseUrl = url.replace(/\/+$/, '');
}

export function getBaseUrl() {
  return baseUrl;
}

async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Accept': 'application/fhir+json',
      // HAPI 會快取相同搜尋 60 秒;寫入後需重新查詢,故停用搜尋快取
      'Cache-Control': 'no-cache',
      ...(options.body ? { 'Content-Type': 'application/fhir+json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`FHIR ${options.method || 'GET'} ${path} 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function ping() {
  return request('/metadata?_summary=true');
}

export async function searchPatients(query) {
  const q = query.trim();
  if (!q) return [];
  // 純數字或含連字號者視為 ID,其他視為姓名
  const param = /^[\w-]+$/.test(q) && /\d/.test(q) ? `_id=${encodeURIComponent(q)}` : `name=${encodeURIComponent(q)}`;
  const bundle = await request(`/Patient?${param}&_count=15`);
  return (bundle.entry || []).map(e => e.resource);
}

/** 建立新的 Patient，由 FHIR 伺服器配置唯一的資源 ID。 */
export async function createPatient(values) {
  const patient = {
    resourceType: 'Patient',
    active: true,
    name: [{
      use: 'official',
      family: values.family.trim(),
      given: [values.given.trim()],
    }],
    gender: values.gender || 'unknown',
    ...(values.birthDate ? { birthDate: values.birthDate } : {}),
  };

  const created = await request('/Patient', { method: 'POST', body: JSON.stringify(patient) });
  if (!created.id) throw new Error('伺服器已回應，但未提供新病人 ID');
  return created;
}

export async function getPatientEverything(patientId) {
  const [vitals, conditions, medications, allergies, notes] = await Promise.all([
    request(`/Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=30`),
    request(`/Condition?patient=${patientId}&_count=30`),
    request(`/MedicationRequest?patient=${patientId}&_count=30`),
    request(`/AllergyIntolerance?patient=${patientId}&_count=30`),
    request(`/DocumentReference?patient=${patientId}&_sort=-date&_count=20`),
  ]);
  const unwrap = b => (b.entry || []).map(e => e.resource);
  return {
    vitals: unwrap(vitals),
    conditions: unwrap(conditions),
    medications: unwrap(medications),
    allergies: unwrap(allergies),
    notes: unwrap(notes),
  };
}

// LOINC 編碼對照:床邊常用生命徵象
const VITAL_CODES = {
  hr:   { code: '8867-4',  display: 'Heart rate',                unit: '/min',  ucum: '/min' },
  temp: { code: '8310-5',  display: 'Body temperature',          unit: 'Cel',   ucum: 'Cel' },
  spo2: { code: '2708-6',  display: 'Oxygen saturation',         unit: '%',     ucum: '%' },
  rr:   { code: '9279-1',  display: 'Respiratory rate',          unit: '/min',  ucum: '/min' },
  pain: { code: '72514-3', display: 'Pain severity score',        unit: 'score', ucum: '{score}' },
  glucose: { code: '2339-0', display: 'Blood glucose',            unit: 'mg/dL', ucum: 'mg/dL' },
  weight: { code: '29463-7', display: 'Body weight',               unit: 'kg',    ucum: 'kg' },
  height: { code: '8302-2', display: 'Body height',               unit: 'cm',    ucum: 'cm' },
  oxygenFlow: { code: '3151-8', display: 'Inhaled oxygen flow rate', unit: 'L/min', ucum: 'L/min' },
  fio2: { code: '3150-0', display: 'Inhaled oxygen concentration', unit: '%',     ucum: '%' },
};

const TEXT_ASSESSMENTS = {
  respiratorySupport: 'Respiratory support method',
  avpu: 'AVPU consciousness assessment',
  leftPupil: 'Left pupil response',
  rightPupil: 'Right pupil response',
  capillaryRefill: 'Capillary refill time',
};

function vitalsMeta() {
  return {
    status: 'final',
    category: [{
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
        display: 'Vital Signs',
      }],
    }],
    effectiveDateTime: new Date().toISOString(),
  };
}

/**
 * 依表單值建立 Observation 資源並 POST 至 FHIR 伺服器。
 * values: { sbp, dbp, hr, temp, spo2, rr } — 空值略過。
 * 血壓以單一 Observation + component 表示(FHIR 標準作法)。
 */
export async function recordVitals(patientId, values) {
  const observations = [];

  if (values.sbp || values.dbp) {
    const components = [];
    if (values.sbp) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
        valueQuantity: { value: Number(values.sbp), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      });
    }
    if (values.dbp) {
      components.push({
        code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
        valueQuantity: { value: Number(values.dbp), unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      });
    }
    observations.push({
      resourceType: 'Observation',
      ...vitalsMeta(),
      code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }], text: 'Blood pressure' },
      subject: { reference: `Patient/${patientId}` },
      component: components,
    });
  }

  for (const [key, meta] of Object.entries(VITAL_CODES)) {
    if (!values[key]) continue;
    observations.push({
      resourceType: 'Observation',
      ...vitalsMeta(),
      code: { coding: [{ system: 'http://loinc.org', code: meta.code, display: meta.display }], text: meta.display },
      subject: { reference: `Patient/${patientId}` },
      valueQuantity: {
        value: Number(values[key]),
        unit: meta.unit,
        system: 'http://unitsofmeasure.org',
        code: meta.ucum,
      },
    });
  }

  if (values.weight && values.height) {
    const heightMeters = Number(values.height) / 100;
    const bmi = Number(values.weight) / (heightMeters * heightMeters);
    observations.push({
      resourceType: 'Observation',
      ...vitalsMeta(),
      code: { coding: [{ system: 'http://loinc.org', code: '39156-5', display: 'Body mass index' }], text: 'Body mass index' },
      subject: { reference: `Patient/${patientId}` },
      valueQuantity: { value: Number(bmi.toFixed(1)), unit: 'kg/m²', system: 'http://unitsofmeasure.org', code: 'kg/m2' },
    });
  }

  const gcsParts = [values.gcsEye, values.gcsVerbal, values.gcsMotor];
  if (gcsParts.every(Boolean)) {
    const gcsComponents = [
      { code: '9267-6', display: 'Glasgow coma score eye opening', value: values.gcsEye },
      { code: '9270-0', display: 'Glasgow coma score verbal', value: values.gcsVerbal },
      { code: '9268-4', display: 'Glasgow coma score motor', value: values.gcsMotor },
    ];
    observations.push({
      resourceType: 'Observation',
      ...vitalsMeta(),
      code: { coding: [{ system: 'http://loinc.org', code: '9269-2', display: 'Glasgow coma score total' }], text: 'Glasgow coma score' },
      subject: { reference: `Patient/${patientId}` },
      valueInteger: gcsParts.reduce((total, value) => total + Number(value), 0),
      component: gcsComponents.map(item => ({
        code: { coding: [{ system: 'http://loinc.org', code: item.code, display: item.display }] },
        valueInteger: Number(item.value),
      })),
    });
  }

  for (const [key, display] of Object.entries(TEXT_ASSESSMENTS)) {
    if (!values[key]) continue;
    observations.push({
      resourceType: 'Observation',
      ...vitalsMeta(),
      code: { text: display },
      subject: { reference: `Patient/${patientId}` },
      valueString: values[key],
    });
  }

  for (const [key, display] of [['fluidIntake', 'Fluid intake'], ['urineOutput', 'Urine output']]) {
    if (!values[key]) continue;
    observations.push({
      resourceType: 'Observation',
      ...vitalsMeta(),
      code: { text: display },
      subject: { reference: `Patient/${patientId}` },
      valueQuantity: { value: Number(values[key]), unit: 'mL', system: 'http://unitsofmeasure.org', code: 'mL' },
    });
  }

  const results = [];
  for (const obs of observations) {
    results.push(await request('/Observation', { method: 'POST', body: JSON.stringify(obs) }));
  }
  return results;
}

/** 將臨床紀錄以 DocumentReference 儲存(內容 base64 編碼)。 */
export async function saveClinicalNote(patientId, text) {
  const doc = {
    resourceType: 'DocumentReference',
    status: 'current',
    type: {
      coding: [{ system: 'http://loinc.org', code: '34109-9', display: 'Note' }],
      text: 'Clinical note',
    },
    subject: { reference: `Patient/${patientId}` },
    date: new Date().toISOString(),
    content: [{
      attachment: {
        contentType: 'text/plain; charset=utf-8',
        // 支援 UTF-8(中文)的 base64 編碼
        data: btoa(String.fromCharCode(...new TextEncoder().encode(text))),
      },
    }],
  };
  return request('/DocumentReference', { method: 'POST', body: JSON.stringify(doc) });
}

/** 解碼 DocumentReference 附件內文(容錯處理)。 */
export function decodeNoteText(docRef) {
  const data = docRef?.content?.[0]?.attachment?.data;
  if (!data) return docRef?.description || '(無內容)';
  try {
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '(無法解碼內容)';
  }
}
