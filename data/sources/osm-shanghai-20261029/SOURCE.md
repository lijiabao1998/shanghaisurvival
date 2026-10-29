# 上海道路來源與初步疊合

- 來源：© OpenStreetMap contributors，資料透過 Geofabrik 的上海固定快照取得：<https://download.geofabrik.de/asia/china/shanghai-261028-free.shp.zip>。資料更新至 2026-10-28 21:21:02 UTC，取得於 2026-10-29。
- 授權：Open Database License 1.0（ODbL），見 <https://www.openstreetmap.org/copyright> 和 <https://opendatacommons.org/licenses/odbl/1-0/>；遊戲及資料發布應保留適當署名、授權、來源與衍生資料庫義務。
- ZIP：47,501,365 bytes。MD5 `9baff64715e67297166c123d0989825b` 與 [Geofabrik 發布的校驗值](https://download.geofabrik.de/asia/china/shanghai-261028-free.shp.zip.md5) 一致；SHA-256 `e8071eba5f1f7ea974c26dfed67aadb3a3df83cafd8de2d933f76c496ff60d26`。
- 解壓僅取 `gis_osm_roads_free_1.{shp,shx,dbf,prj,cpg}` 與原始 `README`。該 Shapefile 的 CRS 為 WGS84 經緯度；轉換時採用建築樣本的 EPSG:32651 與完全相同原點，並把中心線裁至 250 m 範圍。
- 道路輸出有 OSM ID、道路類型、名稱、單行／速限／層級／橋樑／隧道欄位。此 Shapefile 並不包含實測道路寬度：本樣本的 `residential` 以 6 m、`service` 以 4 m 供白模視覺使用，均為估計，不代表現地寬度或實際可通行範圍。
- 本次樣本中的多個非空中文路名為亂碼。例如 2026-10-29 核查 [OSM way 40040178](https://api.openstreetmap.org/api/0.6/way/40040178) 時，其 `name` 原值也已出現亂碼。輸出保留來源原文以利追溯，不作猜測性修正，也不作遊戲內街道路牌。
- 本次取得 52 段（9 段住宅街道、43 段服務道路）。19 段道路中心線與至少一個 CMAB 屋頂輪廓相交，33 段按估計寬度生成的路面與屋頂輪廓相交；這是幾何疊合結果，並非已判定地圖錯誤。可能因素包括屋頂伸出、兩資料來源及年代不同、估算寬度、坐標偏差或真實道路與建築的層次；未經實地核查。不能宣稱兩組資料已精確對齊。
- 僅作偏移敏感度分析：取中心 210 × 210 m 區域，將道路線與 CMAB 屋頂多邊形聯集疊合；原始座標下中心線與屋頂重疊長度約 105.3 m／道路總長 2396.9 m（4.39%）。對道路假設東西與南北各 -10 至 +10 m、每 2 m 格點平移，最低是向北 2 m，約 4.07%。這個單一相交指標不能確認真實位置或偏移原因；沒有對實際數據平移或校正。

## 重現

依 `tools/requirements.txt` 安裝依賴，下載固定 ZIP 並僅解壓上述道路元件到此目錄；保留同一份建築樣本。從項目根目錄執行：

```powershell
.\.venv\Scripts\python.exe tools\extract_osm_roads.py --shp data\sources\osm-shanghai-20261029\gis_osm_roads_free_1.shp --buildings data\samples\shanghai_huangpu_250m.json --archive data\sources\osm-shanghai-20261029\geofabrik-shanghai-261028.shp.zip --out data\samples\shanghai_huangpu_roads.json --svg data\samples\shanghai_huangpu_roads_overlay.svg
```

預覽中紅線表示中心線與屋頂多邊形相交、藍線表示未相交；這不顯示完整估計路面或證明現地街道位置。
