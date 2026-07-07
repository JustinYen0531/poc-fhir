import { createWorker } from 'tesseract.js';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export async function recognizeClinicalNote(imageFile, onProgress = () => {}) {
  if (!imageFile?.type.startsWith('image/')) {
    throw new Error('請選擇圖片檔案。');
  }
  if (imageFile.size > MAX_IMAGE_SIZE) {
    throw new Error('圖片不可超過 10 MB。');
  }

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
