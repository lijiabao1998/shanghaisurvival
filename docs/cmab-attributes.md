# CMAB 屬性可用性（上海）

**結論先講：只有 `Height` 和幾何輪廓是乾淨可用的。`Function` 有微弱信號，`Age`、`Quality`、`Structure`、`Style` 基本不可用。**

這份文件決定室內生成器要不要綁在 CMAB 屬性上。

## 方法

1. 三個 500 m 視窗，用 `tools/cmab_extract.py` 從同一份上海 SHP 取出：
   - 老西門（121.484, 31.221）— 舊城廂西側，同時是既有 250 m 遊戲樣本的來源
   - 老城廂（121.494, 31.223）— 里弄住宅
   - 曹楊新村（121.397, 31.243）— 1950 年代工人新村
2. 用 `tools/attribute_report.py` 比較街區級分佈。
3. 直接讀 `processed_shanghai_20201231_all.dbf` 全部 **471,297** 筆，看全市分佈，排除「只是取樣太小」的可能。

三個視窗的原始資料在 `data/samples/probe_*.json`，可重跑。

## 街區級：三個都退化

| 視窗 | 棟數 | Function 主類 | Age 主年 | Quality 中位數 | 判定 |
|---|---|---|---|---|---|
| 老西門 | 231 | Residence 48.5% | **1985（86.1%）** | 0.062 | 退化 |
| 老城廂 | 172 | Residence 89.0% | **1985（82.0%）** | 0.000 | 退化 |
| 曹楊新村 | 102 | Residence 83.3% | **1985（83.3%）** | 0.000 | 退化 |

三個在歷史上、形態上、功能上完全不同的街區，`Age` 都塌在同一年。這不是取樣問題。

## 全市：欄位本身的問題

| 欄位 | 完整度 | 分佈 | 可用性 |
|---|---|---|---|
| **Height** | **471,297 / 471,297（100%）** | 3.0–136.0 m，中位 18.5 | ✅ 可用 |
| **幾何輪廓** | 100% | — | ✅ 可用 |
| Function | 100%，6 類 | Residence 73.3%、Office 20.5% | ⚠️ 弱 |
| Age | 100%，35 值 | **1985 佔 18.5%、1984 佔 6.9%** | ❌ |
| Quality | 71.0%（29.0% 無法解析） | **可解析的其中 75.6% 是 0** | ❌ |
| Structure | 62.9% | Reinforced concrete 61.4%、**M（缺值）37.1%** | ❌ |
| Style | 62.9% | Modern 54.5%、**M 37.1%** | ❌ |

三點值得單獨記下來：

- **`Age` 有 1984–1986 的尖峰**，合計約 25%。模型對老建築明顯回退到年代中點；街區同質時就整片塌成同一年。
- **`Structure` 與 `Style` 的缺值率完全相同（37.1%）**，指向同一批缺街景覆蓋的建築；不是隨機缺失。
- **`Height` 上限 136 m。** 上海中心（632 m）、環球金融中心（492 m）、金茂（421 m）都不在資料裡。CMAB 不能表現上海的天際線——**陸家嘴這類超高層街區不適合用這份資料**。

## 對遊戲設計的影響

1. **室內生成器不要綁在屬性上。** 用 `footprint` 形狀 + `Height`（→ 層數）+ 街區密度 + 種子 RNG 驅動；`Function` 只當輕微修飾（Residence → 住宅格局，Office → 開放樓層，其餘 → 混合）。
2. **不要用 `Age` / `Quality` / `Structure` / `Style`** 決定破敗程度或材質——它們在街區內幾乎是常數。
3. **不要為了「屬性更好」換街區。** 老城廂比老西門更退化，因為它更同質。原本假設「屬性退化是商業街區造成的」被否證——純住宅的老城廂反而更糟。
4. **密度差異是真的。** 三個 500 m 視窗分別是 231 / 172 / 102 棟，差 2.3 倍。這個信號在幾何裡，不在屬性裡——它比任何屬性欄位都更適合驅動玩法（喪屍數量、搜刮點密度、街道寬窄）。

## 重跑

```powershell
.\.venv\Scripts\python.exe tools\cmab_extract.py --shp data\sources\cmab-v7\shanghai-core\processed_shanghai_20201231_all.shp --archive data\sources\cmab-v7\shanghai.zip --lon 121.494 --lat 31.223 --size-m 500 --out data\samples\probe_laochengxiang_500m.json
.\.venv\Scripts\python.exe tools\attribute_report.py data\samples\probe_*.json
```
