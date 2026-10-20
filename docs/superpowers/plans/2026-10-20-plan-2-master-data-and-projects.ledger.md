# SDD ledger — plan: docs/superpowers/plans/2026-10-20-plan-2-master-data-and-projects.md

Spec: docs/architecture-plan.md + CLAUDE.md + plan-1 ledger (docs/superpowers/plans/2026-10-20-foundation-and-pricing-core.ledger.md). Branch: feat/plan-2-master-data (base a263235, on top of plan-1 618bf92).

## Pre-flight scan
| 範圍 | 產出 → 使用 | 結果 |
|---|---|---|
| T1 ↔ T2 | project_files RLS（監工可上傳 photo）↔ storage policy | 一致 |
| T1 自身 | seed_org_defaults 執行兩次後 trades=23；但現有 seed 已有非預設名稱的工種 → 總數會 >23 | 衝突 → R1 |
| T2 ↔ T5 | create_project / create_client_for_project（definer 以 postgres 執行，check_project_client 豁免特權角色）| 一致 |
| T3 ↔ T4/T5/T6 | blindIndexOrNull、encryptClientPii、maskPhone、getAppContext | 一致 |
| T4 自身 | 測試「刪除被品項引用的工種回傳友善錯誤」但 catalog_items.trade_id 為 on delete set null，不會出錯 | 衝突 → R2 |
| T5 自身 | updateProject 業主不存在時需改呼叫 create_client_for_project | 補述 → R3 |
| T6 自身 | 成員「以 email 前綴顯示」但 RLS client 讀不到 auth.users | 缺口 → R4 |
| 整合測試 | 多任務共用本機 DB，計數斷言會互相干擾 | → R5 |

Ruling R1: seed 既有工種改用預設名稱；pgTAP 斷言改為「23 個預設名稱皆存在且各只有一筆」— 若錯：無。
Ruling R2: 刪除工種／單位時，伺服器端先檢查是否有品項引用，有則回傳「此工種仍有品項使用，無法刪除」（不靠 FK 錯誤）— set null 會默默遺失分類 — 若錯：使用者需先改品項。
Ruling R3: updateProject 遇到案場尚無業主而表單填了業主姓名時，呼叫 create_client_for_project；已有業主則經 RLS update clients — 若錯：小改。
Ruling R4: Task 2 增加 `app.list_org_members(p_org uuid) returns table(user_id uuid, email text, role text)`（security definer，呼叫者須為該公司成員）供成員顯示與指派下拉 — 若錯：成員只能顯示 id。
Ruling R5: 整合測試一律建立帶隨機後綴名稱的資料，只斷言自己建立的資料，不斷言全表筆數 — 若錯：無。

## Progress
Task 1: review → Important: storage_path 未綁定 org/project（實測可指向乙公司路徑）
Ruling R6: storage_path 必須等於 organization_id/project_id/kind/ 前綴且不含 '..'；監工只能 is_deidentified=false；mime_type 白名單且 photo 必須 image/*；created_at/updated_at 插入時強制 now()；uploaded_by FK on delete restrict（帳號停用不刪除）；trades/units 加 unique(organization_id,name)；補 pgTAP（監工插入 A2、org/project 不符、跨前綴路徑）— 安全與資料一致性 — 若錯：小改。
Ruling R7: seed_org_defaults 只靠 grant 限制（僅特權角色可執行，無使用者情境可檢查）— 可接受 — 若錯：無。
Task 1: fix round 1/5 (1 Important + R6 hardening addressed, 0 open; commits 537b693..d87cfce)
Task 1: minor (deferred): '.' 或空路徑段（photo//x）仍允許；'..' 子字串過嚴（a..b.jpg 被拒）
Ruling R8: SVG 排除 —— Storage bucket allowed_mime_types 不含 image/svg+xml，Task 6 validateUpload 拒絕 .svg；project_files mime check 於 Task 2 遷移加上 mime_type <> 'image/svg+xml' — XSS 風險 — 若錯：使用者無法上傳 SVG。
Task 1: complete (commits a263235..d87cfce, review clean)
Task 2: implementer DONE_WITH_CONCERNS (5ad0309).
Ruling R9: app 函式無法經 PostgREST rpc 呼叫 → 於 public 建立同名薄包裝函式（security invoker、search_path ''、revoke public/anon、grant authenticated）轉呼叫 app.*；不公開 app schema — 若錯：多一層函式。
Ruling R10: create_client_for_project 遇到案場已有業主時拒絕（22023「此案場已有業主」），避免遺留無案場的業主個資 — 若錯：更換業主需另做流程。
Ruling R11: anon 對 storage.objects 的 Supabase 預設授權無法撤銷，RLS 無 anon policy 即可 — 接受。
Task 2: fix round 1/5 (R9/R10 + 3 fold-ins addressed, 0 open; commits 5ad0309..59f45da)
Task 2: minor (deferred): 監工可讀全公司成員 email（R4 允許）；mimetype 來自 Content-Type 可偽造（project_files 列另有檢查）
Task 2: complete (commits d87cfce..59f45da, review clean)
Task 3: implementer DONE_WITH_CONCERNS (e116414)；未走 TDD（無 RED 紀錄）— 記錄；revealClientContact 真實 DB 整合測試由 Task 6 涵蓋（計畫原已規定）。
Ruling R12: maskPhone 改為數字少於 8 位一律回傳 "***"（計畫原定 <6 會讓 6、7 位數號碼完整外露）；10 位數仍為 0912-***-678 — 個資保護 — 若錯：短號碼顯示 ***。
Task 3: fix round 1/5 (2 Important + R12 + fold-ins addressed, 0 open; commits e116414..055dc64)
Task 3: minor (deferred): 計畫文件 maskPhone 門檻仍寫 <6（R12 已改 8）；{error} 路徑測試未鎖定固定訊息；錯誤路徑無伺服器端去敏記錄；revealClientContact 於存取檢查前寫稽核（拒絕也留紀錄）
Task 3: complete (commits 59f45da..055dc64, review clean)
Task 4: implementer DONE_WITH_CONCERNS (fd2c4d6). Turbopack 中文路徑 panic → client 檔名改 view.tsx 避開（根治需搬到 ASCII 路徑，待使用者決定）。
Ruling R13: 刪除廠商時品項的 default_vendor_id 被清空可接受（預設廠商僅為建議）— 若錯：改成阻擋。
Ruling R14: record.delete 稽核改為刪除前寫入，稽核失敗則不刪除（fail closed），與 revealClientContact 一致 — 若錯：刪除失敗時會留下一筆「嘗試刪除」紀錄。
Ruling R15: 刪除工種/單位與排序交換改由 SECURITY INVOKER SQL 函式在單一交易內完成（RLS 仍生效）：public.delete_trade(p_id) 檢查品項引用→刪除→清理 vendors.trade_ids；public.delete_unit(p_id)；public.swap_sort(p_table text, p_a uuid, p_b uuid) 只允許 'trades'|'units' — 原子性與無競態 — 若錯：多幾個函式。另外伺服器端驗證 tradeId/unitId/defaultVendorId/tradeIds 屬於目前公司。
Task 4: fix round 1/5 (4 Important + 2 spec + fold-ins addressed, 0 open; commits fd2c4d6..a0aca27)
Task 4: minor (deferred): 被阻擋的刪除仍留 record.delete 稽核；同 sort 時的重新編號非原子；Accessibility：工種多選無 fieldset/legend、錯誤未 aria-describedby；表格與卡片重複掛載 RowActions；整合測試資料殘留於本機 DB；catalog 搜尋 q 無長度上限；vendors/catalog 名稱無唯一約束
Task 4: complete (commits 055dc64..a0aca27, review clean)
Task 5: implementer DONE_WITH_CONCERNS (dea949b).
Ruling R16: 編輯時業主電話/Email/身分證留空 = 不變更；清除既有值改在 Task 6 業主卡片提供明確「清除」操作 — 避免編輯表單在未揭露（未稽核）下顯示個資 — 若錯：小改。
Ruling R17: 新增 npm script test:db = supabase db reset && supabase test db，避免整合測試殘留資料影響 pgTAP 計數 — 若錯：無。
Ruling R18: master 排序交換整合測試不穩定（5 次失敗 2 次）必須修正，併入 Task 5 修正輪 — flaky 測試不可接受 — 若錯：無。
Ruling R19: 業主姓名與施工地址的解密不寫 client.view_pii 稽核（全域約束只要求聯絡資料：電話/Email/身分證字號；姓名每次開案場都會顯示，記錄會淹沒稽核）— 審查 I1 依此駁回 — 若錯：需加姓名稽核。
Ruling R20: 樓層欄位改為一般文字輸入（inputMode=text），可輸入 B1、3~5 — 計畫 numeric 為錯誤 — 若錯：無。
Ruling R21: 動畫改以 CSS（@media prefers-reduced-motion: no-preference）實作，移除 framer-motion — 更簡單且無 SSR/hydration 問題；架構計畫的 Framer Motion 為「建議」— 若錯：日後複雜動畫可再引入。
Task 5: fix round 1/5 (I2, I3, R17, R18, R20, M1/M2/M6/M7 addressed; I1 rejected by R19; commits dea949b..20a2930)
Task 5: minor (deferred): FADE_DURATION 常數未使用且與 CSS 150ms 可能漂移；updateProject 專案與業主兩次請求非交易；既有業主每次存檔都重新加密姓名
Task 5: complete (commits a0aca27..20a2930, review clean)
Task 6: implementer DONE_WITH_CONCERNS (0de9c36).
Ruling R22: Supabase Storage 不接受非 ASCII 物件鍵 → 儲存路徑檔名僅 ASCII（其他字元換成 _），原始中文檔名存 project_files.file_name，下載時以原名提供 — 若錯：無（使用者看到的仍是原檔名）。
Ruling R23: 刪除檔案先刪 DB 列再刪 Storage 物件，物件刪除失敗只留孤兒物件（僅成員可讀、列已刪除不再顯示）— 接受；後續可加定期清理 — 若錯：儲存空間略增。
Task 6: fix round 1/5 (1 Important + 5 fold-ins addressed, 0 open; commits 0de9c36..bf3143c)
Task 6: minor (deferred): 監工上傳失敗時孤兒物件；報告中 regex 顯示被跳脫（程式正確）
Task 6: note → 檔名超過 100 字元會被伺服器拒絕而非截斷 → 列入最終修正（前端先截斷/清理）
Task 6: complete (commits 20a2930..bf3143c, review clean)
Final review: Needs fixes — must-fix I1 長檔名。
Ruling R24: 最終修正一併處理：safeFileName 截斷時保留副檔名；錯誤對應集中到 src/server/db-errors.ts（單一 rpc 對應器，setProjectMember 改以錯誤碼/HINT 而非比對中文訊息）；主檔 action 改 safeParse id；catalog q 上限 50；移除未使用 FADE_DURATION；計畫文件 maskPhone 門檻改 8 — 便宜且降低漂移 — 若錯：無。
Ruling R25: 無障礙（fieldset/legend、aria-describedby）延後到上線前專項處理，列入 CLAUDE.md 上線前清單。
