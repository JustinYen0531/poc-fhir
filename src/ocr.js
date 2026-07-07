const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';

let tesseractPromise = null;

function loadTesseract() {
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;

  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_SCRIPT_URL;
    script.async = true;
    script.onload = () => window.Tesseract?.createWorker
      ? resolve(window.Tesseract)
      : reject(new Error('OCR 套件載入後無法使用。'));
    script.onerror = () => reject(new Error('無法載入 OCR 套件，請檢查網路連線。'));
    document.head.appendChild(script);
  }).catch(error => {
    tesseractPromise = null;
    throw error;
  });

  return tesseractPromise;
}

export async function recognizeClinicalNote(imageFile, onProgress = () => {}) {
  if (!imageFile?.type.startsWith('image/')) {
    throw new Error('請選擇圖片檔案。');
  }
  if (imageFile.size > MAX_IMAGE_SIZE) {
    throw new Error('圖片不可超過 10 MB。');
  }

  const { createWorker } = await loadTesseract();
  const worker = await createWorker('chi_tra+eng', 1, {
    logger(message) {
      if (message.status === 'recognizing text') {
        onProgress(Math.round((message.progress || 0) * 100));
      }
    },
  });

  try {
    const result = await worker.recognize(imageFile);
    return result.data.text.replace(/\r\n/g, '\n').trim();
  } finally {
    await worker.terminate();
  }
}
