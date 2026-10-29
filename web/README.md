> 病毒爆發首版：現行生存規則與操作請先讀根目錄 README 的「病毒爆發首版」。下列白模與舊切片筆記保留供歷史對照。

# 上海倖存者上海街區：Three.js 原型

和《保衛台北》一樣採用 Vite、TypeScript 和 Three.js。這是獨立製作的上海原型，並未直接複製台北項目程式碼。

```powershell
cd web
npm install
npm run dev
```

Windows 已安裝依賴後也可雙擊 `start.cmd` 啟動，再在瀏覽器開啟顯示的本機網址，遊玩期間保留終端機視窗。

依終端機顯示的本機網址進入；WASD 移動、Shift 奔跑、空白鍵跳躍、滑鼠滾輪縮放、F 開關手電筒。觸控螢幕可使用畫面左下角方向鍵移動。建築的門洞和室內為測試示意；進入建築或被前景遮住時屋頂和遮擋立面會隱藏或淡出。

`npm run build` 做 TypeScript 型別檢查及正式建置。若上游街區資料更新，先在專案根目錄執行 `.\.venv\Scripts\python.exe tools\build_demo_data.py`（直接寫入 `web/public/data/block.json`，不需手動複製），然後重建。

## 生存循環切片（`survival.html`）

`survival.html` 是獨立的 10 分鐘生存切片，跑在同一份街區資料上，不改動 `index.html` 的行為。三個頁面都是 Vite 的建置入口。

- WASD 移動、Shift 跑（耗體力，噪音半徑 20 m）、F 手電筒、按住 E 搜刮
- 手電筒是唯一主動光源，也是唯一消耗電池的地方；開燈感應半徑 22 m，關燈 9 m
- 目標：撐到 05:00（現實 8 分鐘）。被抓三次死亡，撐到天亮即勝利
- 80 隻喪屍，26 m 外生成、休眠中；跑步與搜刮都會把牠們引來
- 眼睛顏色代表狀態：暗綠休眠、黃綠遊蕩、紅色追擊
- `?play` 跳過開場直接開始，`?debug` 暴露 `__modu.state()` 與 `swarm()` / `wakeAll()` / `hurt()`

`stress.html` 是屍群壓力測試台（`?bench=1` 依序跑三種渲染模式），與玩法無關，結論見 `docs/tech-stack.md` 的 ADR-010。

## 渲染取捨

- **窗戶是貼圖不是幾何**（`src/windows.ts`）。每個牆面只有一個四邊形，UV 以 3.2 m × 3.1 m 平鋪；`alphaTest` 讓它留在不透明批次，`polygonOffset` 處理與牆面共面的深度競爭。改之前每棟樓的窗戶四邊形是牆面三角形的 7.4 倍。
- **碰撞與遮擋查表**（`src/spatial.ts`）。牆段與建築輪廓分別放進 8 m / 32 m 的均勻網格，玩家每幀只查所在格與鄰格，不再掃全區。
- **地面依資料範圍生成**，不再固定 280 × 280，避免邊緣建築浮空。移動範圍也改由資料 bbox 決定。
- `?data=block_1000m.json` 可直接切換到 1 km 場景，不改程式碼；`?debug` 會在右上角顯示 fps、draw calls、triangles 與載入毫秒，並暴露 `__shanghai.state()`。

CMAB 樓頂輪廓與推估樓高來自 Zhang、Zhao、Long，CC BY 4.0；上海資料的 Height 欄位暫按米解讀，欄位映射仍待核實。道路 © OpenStreetMap contributors，ODbL；路寬按道路類型估算。程序生成的店面、招牌、陽台、雨棚、路燈、樹木、車輛與垃圾桶均為原型示意，招牌名稱不代表真實商家；門和室內也不是實測。部分道路和建築來源幾何互相重疊，資料尚未精確對齊。部分 OSM 中文路名原文有亂碼，未用於路牌。

詳細來源及完整資料重建見 `data/sources/cmab-v7/SOURCE.md`、`data/sources/osm-shanghai-20261029/SOURCE.md`。
