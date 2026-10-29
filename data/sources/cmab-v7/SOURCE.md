# CMAB 上海資料來源

- 資料集：Zhang, Yecheng; Zhao, Huimin; Long, Ying, *CMAB: A Multi-Attribute Building Dataset of China*。
- 資料發布頁：https://doi.org/10.6084/m9.figshare.27992417
- 本次取得：Figshare 第 7 版，2026-10-29；來源 API：https://api.figshare.com/v2/articles/27992417
- 發布頁授權：CC BY 4.0：https://creativecommons.org/licenses/by/4.0/ 。使用時應標示來源、作者、授權及變更。
- 官方附件：`shanghai.zip`，https://ndownloader.figshare.com/files/53799290 ，337,102,437 bytes；發布方 MD5 `41c6a0014287fc2101f69c497018ea5c`，下載後核對一致。
- 官方附帶的 `metadata.csv` 和 `README.txt` 分別來自 files/51059453 和 files/51059462；其 MD5 分別為 `855996710c96c924c87db37ca30190b2`、`54f6ce6b795ae451ec1edaf992a5975d`，與 API 一致。
- `shanghai-core/` 只解壓 `processed_shanghai_20201231_all` 的 SHP、SHX、DBF、PRJ、CPG；完整 ZIP 另含其他區域檔案。解壓檔經 Python zipfile 的 CRC 檢查。
- 實際 `.prj` 為 WGS 84 / Web Mercator Auxiliary Sphere（EPSG:3857，公尺），`.cpg` 為 UTF-8；SHP 為 Polygon，DBF 記錄 471,297 筆。欄位為 `merged_id`、`Height`、`Function`、`Age`、`Quality`、`Structure`、`Style`。高度等屬性為資料集估計值，不能視為逐棟實測。
- 原始資料是現實地理資料，包含坐標。資料來源授權及衍生使用邊界應按實際發布用途核對。
