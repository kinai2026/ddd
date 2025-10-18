# AI 音樂生成器（3 分鐘，含曲風介面）

這是一個純前端（無需後端）即可運行的 AI 風格音樂生成器範例，使用 WebAudio API 實時合成 3 分鐘左右的音樂，並可選擇曲風（EDM、Lo‑Fi、Ambient、Classical、Hip‑Hop）。支援即時錄音，生成完成後可下載音檔（webm/ogg）。

## 使用方式

1. 直接用瀏覽器開啟 index.html（建議使用 Chrome/Edge/Firefox 最新版）。
2. 在頁面上選擇曲風、可選填寫「隨機種子」，點「開始生成（3 分鐘）」。
3. 生成過程會即時播放並錄音，完成後可點「下載音檔」。

> 注意：錄音使用 MediaRecorder，實作會以 webm/opus 或 ogg/opus 為主，依瀏覽器支援而定。

## 特色

- 純前端程式性作曲（procedural composition），模擬 AI 音樂生成。
- 多曲風：
  - EDM：四拍重擊、低音律動、簡單 lead、pad 和絃。
  - Lo‑Fi：輕鬆鼓點、爵士感和絃、稀疏旋律、類黑膠底噪。
  - Ambient：長音墊樂、隨機氛圍音符，無鼓或極少鼓。
  - Classical：大調和聲、琶音伴奏與簡單主旋律。
  - Hip‑Hop：808 低音、基本鼓點與稀疏和聲點綴。
- 可設定長度（預設 180 秒 = 3 分鐘）。
- 可設定隨機種子以重現同一首音樂。

## 檔案結構

- index.html：主頁面與介面
- src/styles.css：簡易樣式
- src/app.js：音訊合成與曲風邏輯、錄音與下載

## 部署（Deploy）

此專案為純靜態網站，不需要伺服器端邏輯，將整個資料夾部署到任何支援靜態託管的平台即可（需 HTTPS 以提升相容性）。以下提供多種方式：

### A. GitHub Pages（推薦，免費且自動 HTTPS）

1. 將專案推到 GitHub 儲存庫。
2. 進入儲存庫 Settings > Pages。
3. 將 Source 設為「Deploy from a branch」，Branch 選擇主分支（例如 main）與根目錄（/），按下 Save。
4. 等待數十秒，頁面上會顯示公開網址（例如 https://USERNAME.github.io/REPO）。

注意：本專案的 index.html 位於根目錄，直接啟用 Pages 即可。

### B. Vercel

1. 登入 https://vercel.com 並 Import Git 專案。
2. Framework 選擇「Other」或自動偵測為靜態網站；Build Command 留空；Output 目錄為根目錄（./）。
3. 部署完成後 Vercel 會提供 HTTPS 網址，綁定自訂網域亦可。

### C. Netlify

- 方式一：到 https://app.netlify.com 將 Git 專案連結到 Netlify。
  - Build Command 留空，Publish directory 設為根目錄（./）。
- 方式二：直接使用 Netlify Drop（拖拉整個資料夾）https://app.netlify.com/drop。

### D. Cloudflare Pages

1. 到 https://pages.cloudflare.com 建立新專案並連接 Git。
2. Build Command 留空，Build output directory 設為根目錄（./）。
3. 完成後會自動發佈於 HTTPS 網址。

### E. Docker + NGINX（自架主機）

本 repo 已提供 Dockerfile，可快速打包成靜態站台映像：

- 建置映像
  docker build -t ai-music-gen .

- 執行容器（對外服務於 8080）
  docker run --rm -p 8080:80 ai-music-gen

- 瀏覽 http://localhost:8080

### F. 本地預覽（無需部署）

若想在本機以 HTTP 方式預覽（避免 file:// 造成的瀏覽器限制），可使用以下任一方式：

- Python 3（內建）
  python3 -m http.server 8080
  開啟 http://localhost:8080

- Node.js（需先安裝）
  npx serve -l 8080
  或
  npx http-server -p 8080

## 瀏覽器相容性與小提醒

- 建議透過 HTTPS 網址開啟，以提升 MediaRecorder 與 AudioContext 的相容性。
- Safari 對 MediaRecorder 支援度較其他瀏覽器低，若無法錄音，下載按鈕會保持停用，但仍可正常播放音樂。
- 若首次點擊「開始生成」沒有聲音，請再點一次或與頁面互動（部分行動瀏覽器需使用者手勢才能啟動音訊）。
- 下載檔案格式多為 webm/opus 或 ogg/opus，依瀏覽器支援而定。

## 開發說明

- 不依賴第三方函式庫，全部使用原生 WebAudio API 與標準 DOM。
- 錄音透過 AudioContext 的 createMediaStreamDestination 串接 MediaRecorder。
- 若瀏覽器不支援 MediaRecorder，仍可播放，但無法下載音檔。

## 已知限制

- 生成邏輯為程式性與隨機的組合，非深度學習模型；適合 Demo 與原型。
- 不同瀏覽器對於音色與壓縮器、濾波器的表現會略有差異。
- 若裝置效能較低，長時間合成與錄音可能導致音訊爆音或延遲。

## 授權

此範例程式碼可作為學習與原型用途，自由調整與擴充。
