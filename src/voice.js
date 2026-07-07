// 語音輸入 — 基於瀏覽器 Web Speech API(Chrome/Edge 支援)。
// 提供 startDictation / stopDictation,將辨識結果即時寫入目標輸入框。

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function isSupported() {
  return Boolean(SpeechRecognition);
}

let recognition = null;
let activeTarget = null;

/**
 * 對指定的 input/textarea 啟動語音聽寫。
 * onStatus(state, detail) — state: 'listening' | 'stopped' | 'error'
 */
export function startDictation(targetEl, lang, onStatus) {
  if (!SpeechRecognition) {
    onStatus('error', '此瀏覽器不支援語音辨識,請使用 Chrome 或 Edge。');
    return;
  }
  stopDictation();

  recognition = new SpeechRecognition();
  activeTarget = targetEl;
  recognition.lang = lang || 'zh-TW';
  recognition.continuous = true;
  recognition.interimResults = true;

  // 聽寫開始前既有的文字,最終結果會附加在其後
  const baseText = targetEl.value ? targetEl.value.replace(/\s+$/, '') + ' ' : '';
  let finalText = '';

  recognition.onresult = (event) => {
    let interim = '';
    finalText = '';
    for (const result of event.results) {
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    targetEl.value = baseText + finalText + interim;
    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
  };

  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': '麥克風權限被拒絕,請於瀏覽器設定允許使用麥克風。',
      'no-speech': '未偵測到語音,請再試一次。',
      'network': '語音服務連線失敗(需要網路連線)。',
      'audio-capture': '找不到麥克風裝置。',
    };
    onStatus('error', messages[event.error] || `語音辨識錯誤:${event.error}`);
  };

  recognition.onend = () => {
    recognition = null;
    activeTarget = null;
    onStatus('stopped');
  };

  recognition.start();
  onStatus('listening');
}

export function stopDictation() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
}

export function isDictating(targetEl) {
  return recognition !== null && (!targetEl || activeTarget === targetEl);
}
