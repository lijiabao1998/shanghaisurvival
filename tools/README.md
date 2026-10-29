# CMAB 上海街區資料工具

`cmab_extract.py` 讀取 CMAB 的 Shapefile，依使用者指定的 WGS84 經緯度和公尺範圍選取建築，將實際 `.prj` 的座標轉為當地 UTM；輸出包含來源散列、投影、來源欄位和完整建築輪廓的 JSON，以及可選頂視 SVG。高度來自資料集推算；屋頂輪廓不等於已測量地面輪廓。它不產生道路、入口、室內或玩法。完整多邊形只要與選取範圍相交即保留，故 JSON 中可能有選取範圍以外的座標；SVG 只顯示框內。

第一次安裝依賴（Python 3.13 測試）：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tools\requirements.txt
```

從本項目根目錄重建已選上海樣本：

```powershell
.\.venv\Scripts\python.exe tools\cmab_extract.py --shp data\sources\cmab-v7\shanghai-core\processed_shanghai_20201231_all.shp --archive data\sources\cmab-v7\shanghai.zip --lon 121.484 --lat 31.221 --size-m 250 --out data\samples\shanghai_huangpu_250m.json --svg data\samples\shanghai_huangpu_250m.svg
.\.venv\Scripts\python.exe tools\validate_cmab_sample.py data\samples\shanghai_huangpu_250m.json
```

來源與授權資訊見 `data/sources/cmab-v7/SOURCE.md`。實際 SHP 的 `Height` 原值保存在 `source_attributes`，但因尚未確認其欄位單位及缺失值約定，輸出的 `height_m` 保持 null。`validate_cmab_sample.py` 核對輸出與原始檔案的散列及幾何；它不驗證原始資料與現地是否一致，也不驗證道路或可玩性。
