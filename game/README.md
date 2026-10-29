# 上海街區白模

雙擊 `start.cmd` 開啟。畫面使用參考《保衛台北》的固定斜俯視、正交第三人稱鏡頭；WASD 按畫面方向移動，滑鼠滾輪縮放，Shift 跑步、空白鍵跳躍、F 開關手電筒。角色靠近遮擋建築時會顯示局部剖視，進入示意建築時隱藏屋頂；碰撞仍然存在。

本機驗證使用官方 Godot 4.6.3 Windows 版（ZIP SHA-256 `e39986a178d585ce7ac198fb8de6ea436366dc0cc00e594810c2e3e104c04b90`）。已放在本機 `.tools/`，不納入版控。啟動腳本將本次程序的 `APPDATA` 指向該目錄內的 `profile`：本機預設的 Godot `user://logs` 建立失敗，這個設定不更改系統環境變數。

場景由 `data/block.json` 建構：

- 建築輪廓是 CMAB 上海來源中與 250 m 範圍相交的建築，以 Shapely 0.2 m 簡化供白模使用，部分跨出邊界的建築保留全形；原始資料和樣本不會被修改。屋頂輪廓與高度都是推估資料。`Height` 欄位暫按米解讀，欄位映射尚待來源明確確認；並非實測樓高。
- 道路是 OpenStreetMap 實際道路中心線；顯示寬度是依道路類別估算。資料來源彼此存在重疊，不能當成精確對齊。道路邊線是程序化示意；道路是平面視覺白模，沒有實測路寬與車行功能。
- 一個入口、其空白室內及角色出生點為了測試而虛構，不代表真實門位或室內配置。其餘建築目前不可進入。窗格、水塔與角色為程序生成的視覺示意，不代表實景；地面為平面，無實測地形。
- 頂部 HUD 顯示資料來源、操作及限制。建築資料：Yecheng Zhang、Huimin Zhao、Ying Long，CMAB，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，本作重新投影和簡化。道路資料 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，ODbL，已重新投影和估算路寬。

資料更新後，在項目根目錄重新生成：

```powershell
.\.venv\Scripts\python.exe game\build_demo_data.py
```

測試：

```powershell
$env:APPDATA = (Resolve-Path game\.tools\profile).Path
& .\game\.tools\Godot_v4.6.3-stable_win64_console.exe --headless --path (Resolve-Path game).Path --script res://tests/walk_test.gd
```

該測試確認角色落地、W 鍵可移動且鏡頭跟隨、角色從室外走過示意門且屋頂隱藏，並被實體牆擋住；它不驗證資料與現地是否完全一致或整個街區的可通行性。預設道路與建築存在交疊。
