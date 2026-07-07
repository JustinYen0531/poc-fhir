// 畫面渲染 — 將 FHIR 資源轉成人可讀的 HTML 片段。

import { decodeNoteText } from './fhir.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function humanName(patient) {
  const name = patient.name?.[0];
  if (!name) return '(未命名)';
  if (name.text) return name.text;
  return [name.family, ...(name.given || [])].filter(Boolean).join(' ') || '(未命名)';
}

export function patientCard(patient) {
  const gender = { male: '男', female: '女', other: '其他', unknown: '不詳' }[patient.gender] || '不詳';
  return `
    <button class="patient-result" data-patient-id="${esc(patient.id)}">
      <span class="pr-name">${esc(humanName(patient))}</span>
      <span class="pr-meta">${gender} · ${esc(patient.birthDate || '生日不詳')} · ID: ${esc(patient.id)}</span>
    </button>`;
}

export function patientBanner(patient) {
  const gender = { male: '男', female: '女', other: '其他', unknown: '不詳' }[patient.gender] || '不詳';
  const age = patient.birthDate
    ? Math.floor((Date.now() - new Date(patient.birthDate)) / (365.25 * 24 * 3600 * 1000))
    : null;
  return `
    <div class="pb-main">
      <span class="pb-name">${esc(humanName(patient))}</span>
      <span class="pb-tags">
        <span class="tag">${gender}</span>
        ${age !== null ? `<span class="tag">${age} 歲</span>` : ''}
        <span class="tag">ID: ${esc(patient.id)}</span>
      </span>
    </div>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? esc(iso) : d.toLocaleString('zh-TW', { hour12: false });
}

function obsValue(obs) {
  if (obs.valueQuantity) {
    return `${obs.valueQuantity.value} ${obs.valueQuantity.unit || ''}`;
  }
  if (obs.component?.length) {
    return obs.component
      .map(c => `${c.code?.coding?.[0]?.display || c.code?.text || ''}: ${c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit || ''}` : '—'}`)
      .join(' / ');
  }
  if (obs.valueString) return obs.valueString;
  if (obs.valueCodeableConcept) return obs.valueCodeableConcept.text || obs.valueCodeableConcept.coding?.[0]?.display || '—';
  return '—';
}

export function vitalsTable(vitals) {
  if (!vitals.length) return `<p class="hint">尚無生命徵象紀錄。</p>`;
  const rows = vitals.map(o => `
    <tr>
      <td>${esc(o.code?.text || o.code?.coding?.[0]?.display || '(未知項目)')}</td>
      <td class="val">${esc(obsValue(o))}</td>
      <td class="dim">${fmtDate(o.effectiveDateTime || o.issued)}</td>
    </tr>`).join('');
  return `<table class="data-table"><thead><tr><th>項目</th><th>數值</th><th>時間</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function conditionsList(conditions) {
  if (!conditions.length) return `<p class="hint">無診斷紀錄。</p>`;
  return `<ul class="clinical-list">${conditions.map(c => `
    <li>
      <span class="cl-main">${esc(c.code?.text || c.code?.coding?.[0]?.display || '(未命名診斷)')}</span>
      <span class="dim">${esc(c.clinicalStatus?.coding?.[0]?.code || '')} ${fmtDate(c.recordedDate)}</span>
    </li>`).join('')}</ul>`;
}

export function medicationsList(meds) {
  if (!meds.length) return `<p class="hint">無用藥紀錄。</p>`;
  return `<ul class="clinical-list">${meds.map(m => {
    const name = m.medicationCodeableConcept?.text
      || m.medicationCodeableConcept?.coding?.[0]?.display
      || m.medicationReference?.display
      || '(未命名藥物)';
    const dose = m.dosageInstruction?.[0]?.text || '';
    return `<li><span class="cl-main">${esc(name)}</span><span class="dim">${esc(dose)} ${esc(m.status || '')}</span></li>`;
  }).join('')}</ul>`;
}

export function allergiesList(allergies) {
  if (!allergies.length) return `<p class="hint">無已知過敏。</p>`;
  return `<ul class="clinical-list">${allergies.map(a => `
    <li>
      <span class="cl-main allergy">⚠ ${esc(a.code?.text || a.code?.coding?.[0]?.display || '(未命名過敏原)')}</span>
      <span class="dim">${esc(a.criticality || '')} ${esc(a.type || '')}</span>
    </li>`).join('')}</ul>`;
}

export function notesList(notes) {
  if (!notes.length) return `<p class="hint">尚無臨床紀錄。</p>`;
  return notes.map(n => `
    <div class="note-card">
      <div class="dim">${fmtDate(n.date)}</div>
      <div class="note-text">${esc(decodeNoteText(n))}</div>
    </div>`).join('');
}
