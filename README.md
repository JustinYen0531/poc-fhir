# POC-FHIR — Point of Care 與 FHIR 連動 + 多模態輸入

床邊照護(Point of Care)網頁應用,直接與 FHIR R4 伺服器連動,並支援瀏覽器語音與圖片文字輸入。

## 功能

- **病人搜尋**:以姓名或 ID 搜尋 FHIR `Patient` 資源(搜尋框也支援語音輸入)。
- **建立新病人**:新增 `Patient` 資源,由 FHIR 伺服器產生全新的病人 ID,建立後自動選取。
- **臨床資料檢視**:生命徵象(`Observation`)、診斷(`Condition`)、用藥(`MedicationRequest`)、過敏(`AllergyIntolerance`)、臨床紀錄(`DocumentReference`)。
- **護理床邊記錄**:血壓、心率、體溫、SpO₂、呼吸、疼痛、血糖、身高體重與 BMI、氧療、GCS、AVPU、輸入輸出、瞳孔及末梢循環評估,寫回 FHIR `Observation`。
- **FHIR JSON 匯出**:可匯出目前病人的完整 FHIR `Bundle`,或只匯出床邊 `Observation`;選填的床邊評估以收合區塊呈現。
- **隨機測試資料**:一鍵填入多數正常、偶有合理異常且彼此相關的床邊數值;只填表單,不會自動寫入 FHIR。
- **臨床紀錄語音輸入**:透過 Web Speech API 口述紀錄(支援中文/英文),儲存為 `DocumentReference`。
- **臨床紀錄圖片辨識**:透過 Tesseract.js 在使用者裝置內辨識繁體中文／英文圖片文字，人工核對後再儲存為 `DocumentReference`。
- **可切換 FHIR 伺服器**:預設連到公開測試伺服器 `https://hapi.fhir.org/baseR4`,可在頂欄改為自己的伺服器。

## 快速開始

```bash
npm install
npm run dev
```

開啟 <http://localhost:5173>。

> 語音輸入需使用 **Chrome 或 Edge**,且需允許麥克風權限(Web Speech API 需要網路連線)。

## 使用流程

1. 左欄建立新病人,或搜尋既有病人(例如輸入 `Smith`)並點選結果。
2. 新病人由 FHIR 伺服器產生唯一 ID,建立後會自動選取。
3. 中欄檢視該病人的生命徵象、診斷、用藥、過敏與臨床紀錄。
4. 右欄輸入生命徵象後按「寫入 FHIR」,或按 🎤 口述臨床紀錄後儲存。

## 專案結構

```
index.html        # 頁面骨架(三欄式:搜尋 / 病人資料 / 床邊輸入)
src/main.js       # 應用程式進入點、事件與狀態
src/fhir.js       # FHIR R4 client(搜尋、讀取、寫入 Observation / DocumentReference)
src/voice.js      # Web Speech API 語音聽寫封裝
src/render.js     # FHIR 資源 → HTML 渲染
src/style.css     # 樣式
```

## 注意事項

- `hapi.fhir.org` 是公開測試伺服器,**請勿寫入真實病人資料**,且資料會定期清空。
- 語音辨識語言可在右欄切換(中文台灣 / 英文)。
- 若要接自己的 FHIR 伺服器,需該伺服器允許 CORS;含驗證(OAuth2 / SMART on FHIR)的整合可在 `src/fhir.js` 的 `request()` 加上 token。
