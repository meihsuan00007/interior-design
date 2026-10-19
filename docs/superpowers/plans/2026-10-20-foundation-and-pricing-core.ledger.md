# SDD ledger — plan: docs/superpowers/plans/2026-10-20-foundation-and-pricing-core.md

Spec: docs/architecture-plan.md + CLAUDE.md (D1–D9). Branch: feat/plan-1-foundation (from main 8bbbf72).

## Pre-flight scan
| 範圍 | 產出 → 使用 | 結果 |
|---|---|---|
| T1 ↔ T5/T7 | env.ts getServerEnv（金鑰、SESSION_IDLE_MINUTES=120）→ crypto、middleware | 一致 |
| T2 ↔ T3/T4 | D/roundYuan/sum/format* → pricing | 一致 |
| T3 ↔ T4 | types.ts EffectiveCost/EffectiveSource、Map 輸出 → computeItems | 一致；DocumentSettlement 介面區塊缺 settledOn，但規則與測試都用 → 見 Ruling 2 |
| T6 ↔ T7 | memberships/audit_logs、config.toml | 一致 |
| T1 自身 | git init、刪空資料夾 | 已在 setup 完成 → Ruling 1 |
| T2 自身 | 測試 vs 規則 | 一致（17.1×675=11542.5→11543） |
| T3 自身 | 平均分攤 34/33/33 | 一致 |
| T4 自身 | 2372051×5%=118602.55→118603；內含 110000×5/105=5238.09→5238；折讓測試 N=110000 | 一致 |
| T5 自身 | — | 一致 |
| T6 自身 | RLS 表允許監工 select quote_items（含單價），與 spec「監工隱藏預算」及 CLAUDE.md 權限規定衝突；測試 isnt_empty quote_items 亦同 | 衝突 → Ruling 3 |
| T7 自身 | config.toml 速率限制鍵名可能隨 CLI 版本不同 | 實作時依實際 CLI 鍵名 |

Ruling 1: T1 Step 1 的 git init 與刪除空資料夾已由 controller 於 setup 完成（main 8bbbf72，工作分支 feat/plan-1-foundation）— 實作者跳過 — 若錯：無成本。
Ruling 2: DocumentSettlement 含 `settledOn: string` 欄位 — 規則與測試都需要 — 若錯：介面多一欄。
Ruling 3: quote_items、quote_fees 的 select 限 admin/designer 案場成員；監工改讀 `quote_items_scope` view（只含 id、project_id、section/parent、名稱、單位、數量、規格、備註，無任何金額欄位，以 security_barrier 並在 view 內檢查 app.is_project_member）；pgTAP 改為「監工 select quote_items = 0」與「監工 quote_items_scope 非空」，plan(9) — spec 要求監工隱藏預算且權限須在資料庫層 — 若錯：監工畫面需另讀資料來源。
Ruling 4: Task 6 前 controller 啟動 Docker Desktop（本機、免費：小型企業授權）— 若錯：無費用。

## Progress
Task 1: implementer DONE_WITH_CONCERNS (16b20bb). Ruling 5: shadcn 樣式用 radix-nova（CLI 已無 New York）— 外觀細節可日後調整 — 若錯：換主題 CSS。
Task 1: review → Important: `cn@0.5.0` 第三方套件取代 clsx+tailwind-merge。⚠️ 開機時未呼叫 getServerEnv → Ruling 6: 本任務補 `src/instrumentation.ts`（nodejs runtime register() 呼叫 getServerEnv()）並建立本機 `.env.local`（已被 .env.* 忽略）— Global Constraint 要求缺金鑰拒絕啟動 — 若錯：開發時需先設定 env 才能啟動。
Task 1: minor (deferred): globals.css `--font-sans` 自我參照需在瀏覽器確認字型；shadcn 在 dependencies；lucide-react ^1.x；env 測試 _omit 寫法；缺 32/33 bytes 邊界與 SESSION_IDLE_MINUTES 非數字測試。
Ruling 7: 缺金鑰時 next start 持續運作但所有請求回 500（不服務任何頁面）— 視為符合「拒絕啟動」意圖 — 若錯：需改為 process.exit。
Task 1: fix round 1/5 (3 addressed, 0 open; commits 16b20bb..db83422)
Task 1: minor (deferred): Next 多個 lockfile 警告（C:\Users\User\package-lock.json）可設 outputFileTracingRoot；port 3000 被其他程式佔用；lock 中 shadcn 依賴的 cn@0.2.6（間接，未使用）
Task 1: complete (commits 8bbbf72..db83422, review clean)
Task 2: minor (deferred): formatMarkup 可能輸出 -0.00；D() 接受不安全整數與字串 "NaN"；formatter 缺 .5 邊界測試
Task 2: complete (commits db83422..5503338, review clean)
Task 3 rulings (dispatch): settledOn 為分攤日期；負殘差照分攤不拋錯；無報價的文件成員權重 0 仍入 Map；多文件取第一個；權重=最新報價 — 依 spec D2/D7 — 若錯：分攤邏輯小改。
Task 3: minor (deferred): createdAt 以字串比較，資料層需統一 ISO UTC 格式（Task 6 之後載入時正規化）；不等權重的餘數分配未測
Task 3: complete (commits 5503338..2efde77, review clean)
Task 4 rulings (dispatch): 單層巢狀；母項成本含子項連結；fixed 費用 roundYuan(value)、percent 費用 roundYuan((S1+S2)×value)；空摘要 label="" — 依 spec D7 — 若錯：總計小改。
Task 4: review → Important ×2（子項旗標被忽略併入母項；孤兒/兩層子項金額消失）
Ruling 8: 子項若 isOptional/isOwnerSupplied/isPaidDirectlyByOwner/isComplimentary 為 true，不併入母項 clientTotal；子項成本併入母項時排除 isOptional/isOwnerSupplied/isPaidDirectlyByOwner 子項（管銷服務子項成本仍併入，與最上層規則一致）；子項的 includeInMgmtFee 不使用，由母項決定 — D4/D7 業主直付不得進入 ①～⑦ — 若錯：子項標記行為需調整。
Ruling 9: computeItems 遇到 parentId 不存在、母項本身是子項、或 id 重複時拋錯（訊息含項目 id）— 單層巢狀裁定 + 不可默默少算金額 — 若錯：呼叫端需先清理資料。
Ruling 10: Minor #3（管銷服務但同時選配/業主自備/業主直付的成本不計）與 #6 測試缺口一併修正 — 金額正確性 — 若錯：無。
Task 4: fix round 1/5 (2 addressed + ruling 10, 0 open; commits ec74484..8526744)
Task 4: minor (deferred): 部分成本連結缺有效成本時仍回報單一來源（UI 無法警示，日後可加 missingLinks）；負數 netTotal 的內含稅與百分比費用未測
Task 4: complete (commits 2efde77..8526744, review clean)
Task 5 rulings (dispatch): decrypt 驗 v1/4 段/IV 12 bytes、錯誤訊息不含明文與金鑰；金鑰須 32 bytes；blindIndex 含 kind；server-only 未安裝則略過 — 安全性 — 若錯：小改。
Task 5: minor (deferred): 電話正規化後為空字串時所有盲索引相同（呼叫端需略過空值）；GCM 無 AAD（可綁欄位/租戶）；lazy env 路徑無測試；blind-index.ts 缺 server-only 註解
Task 5: complete (commits 8526744..f37fc07, review clean)
Task 6: implementer DONE_WITH_CONCERNS (dbf2293).
Ruling 11: db client 以 postgres 角色連線會繞過 RLS → 使用者請求一律走 Supabase client（帶 JWT）；Drizzle db 只用於遷移、種子與受控的伺服器端特權寫入 — RLS 為權限主防線 — 若錯：需改 db client。Task 7 dispatch 帶入。
Ruling 12: 設計師新增案場需特權寫入（建立 project + 自己的 project_members）→ 於計畫 2 以 security definer 函式 app.create_project() 實作 — 不屬本計畫範圍 — 若錯：計畫 2 調整。
Ruling 13: 欄位命名 _enc/_bidx、markup_rate_used numeric(10,6)、quote_fees rate/amount 分欄、admin 可看全公司業主、audit_logs 需 actor_id=auth.uid()、view 定義放 src/db/views.ts — 合理偏離，接受 — 若錯：遷移小改。
Ruling 14: issued 版本凍結 trigger（計畫 5）、cost_item_effective view（計畫 3）、分攤比例 ≤1 檢查（計畫 3）延後 — 本 brief 未列 — 若錯：無。
Task 6: review → Important ×4（org 可改搬家跨租戶；client_id 可改指向他人業主；scope view 過濾無測試；markup_rate_used 可反推成本繞過 can_view_cost）
Ruling 15: 所有資料表 organization_id 不可更新；子表 project_id 不可更新（trigger 拒絕）— 租戶隔離 — 若錯：搬移案場需特權函式。
Ruling 16: projects.client_id 變更（新值非 null）時，只有 admin，或該業主已連結到使用者可編輯的其他案場時才允許 — 業主個資只能經由自己的案場看到 — 若錯：設計師換業主需 admin 協助。
Ruling 17: markup_rate_used 移出 quote_items，改放新表 quote_item_pricing_meta（quote_item_id PK、organization_id、project_id、markup_rate_used），RLS 依 app.can_view_cost — spec 成本可見性須在 DB 層 — 若錯：多一個 join。
Ruling 18: can_view_unit_price（看單價 vs 只看總價）DB 層強制延後到計畫 3（報價編輯器設計 API 與 view 時一併處理）— 本計畫尚無讀價格的畫面 — 若錯：計畫 3 前不得上線。
Ruling 19: 一併 revoke truncate/trigger/references on all public tables from authenticated — 縱深防禦 — 無成本。監工可讀 vendors 接受（施工需聯絡廠商）。
Ruling 20: 設計師建立新業主並連到案場 → 併入計畫 2 的特權函式 app.create_project()/link_client（同 Ruling 12）— 若錯：計畫 2 調整。
Task 6: fix round 1/5 (5 addressed, 0 open; commits dbf2293..478361e)
Task 6: minor (deferred): supabase_admin 在 public 的預設 ACL 仍授權 anon/authenticated（目前無其建立的表）；memberships.user_id 可更新；policy 未用 (select auth.uid()) 快取；check_parent_scope 錯誤碼可探測他租戶 UUID 存在；quotes.ts:54 格式
Task 6: complete (commits f37fc07..478361e, review clean)
Task 7 rulings (dispatch): writeAudit 走使用者 Supabase client；login_failed 走 service-role、actor_id null、只存 email_bidx，查無使用者不寫 DB；isSessionIdle 純函式 — 依 spec 4.4 與 Ruling 11 — 若錯：稽核寫入路徑小改。
Task 7: review → Critical ×1（aal1 繞過 TOTP 直讀 PostgREST）、Important ×3（刪 cookie 繞過閒置；錯誤路徑記錄明文 email；速率限制以伺服器 IP 計）
Ruling 21: 所有業務表加 restrictive RLS policy：使用者有 verified factor 時要求 jwt aal=aal2（helper app.mfa_satisfied()）；middleware 對非 /login 路徑檢查 aal；pgTAP 覆蓋 — spec 權限需在 DB 層 — 若錯：無。
Ruling 22: 已登入但 last_activity cookie 缺失或無效 → 視為閒置；cookie 值以 HMAC 簽章（金鑰由 BLIND_INDEX_KEY 以標籤 session-activity 衍生）、未來時間戳無效。不採用 Supabase [auth.sessions] inactivity_timeout（雲端版需 Pro 付費方案，使用者要求涉及費用須先確認）— 若錯：上線後可另加。
Ruling 23: 失敗登入錯誤路徑只記錄固定訊息 + email_bidx。
Ruling 24: 應用層登入速率限制以 DB 表 login_attempts（ip_hash、email_bidx、attempted_at；僅 service role 可存取，RLS 啟用無 policy）實作：同 email 15 分鐘內失敗 ≥5 次、同 IP 15 分鐘內嘗試 ≥20 次即拒絕（訊息仍為「帳號或密碼錯誤」或「嘗試次數過多，請稍後再試」）— 免費、可跨 serverless 實例 — 若錯：門檻可調。
Ruling 25: Minor 1/2/3/4/5/6/7 一併修（matcher 跳脫、/login 判斷、signOut scope local、稽核不阻塞、writeAudit 包 try/catch、idle 設定驗證、MFA 失敗稽核）— 便宜且實質 — 若錯：無。
Ruling 26: 接受 Task 7 修正偏離：audit_logs 的 restrictive MFA policy 只限 select（insert 仍需 actor_id=auth.uid()，aal1 可寫自己的失敗紀錄）；MFA 失敗稽核以伺服器端 Drizzle 寫入（actor_id 由伺服器驗證過的 getUser 決定）— 若錯：aal1 使用者可插入自己名下的稽核列（無讀取權）。
Task 7: fix round 1/5 (4 addressed + minors, 0 open; commits 17b18bb..f98d5f8)
Task 7: minor (deferred): 未來新表不會自動加 MFA restrictive policy（加 pgTAP 守門）；audit_logs MFA policy 可改 for all；Edge 缺 BLIND_INDEX_KEY 時 500 無清楚訊息；GoTrue sign_in_sign_ups 以伺服器 IP 計可能全體共用 10 次/5 分（上線前確認）；login_attempts 無清理；x-forwarded-for 在 Vercel 以外可偽造；per-email 鎖定可被他人觸發
Task 7: complete (commits 478361e..f98d5f8, review clean)
Final review: Needs fixes — must-fix: 關閉公開註冊；未來新表 RLS/MFA/anon 守門 pgTAP。
Ruling 27: quote_fees 移除 kind 'mgmt'（管理費由系統依 quote_versions.mgmt_fee_rate_snapshot 計算，不手填）並移除 seed 的 mgmt 列；discount 若為 percent，計畫 3 以 (S1+S2+F+D) 為基礎換算並 roundYuan 為固定金額 — spec「管理費由系統計算」— 若錯：計畫 3 調整。本 fix wave 處理移除 mgmt。
Ruling 28 (計畫 3): 新增 cost_items.vendor_document_id 或連結表供 DocumentSettlement.costItemIds；document_date 為 null 時以建立日期代入 — 若錯：計畫 3 調整。
Ruling 29 (計畫 3): 有效成本單一真實來源 = TypeScript resolveEffectiveCosts；不建 cost_item_effective SQL view（架構計畫 §3.5 改述）— 避免兩套規則漂移 — 若錯：報表需另寫 SQL。
Ruling 30: can_view_unit_price DB 層強制為上線前必要條件（同 Ruling 18），計畫 3 實作 — 若錯：設計師可經 API 讀單價。
Ruling 31: final fix wave 一併修：被節流的請求不再記為失敗（避免無限延長鎖定）；audit_logs 加 BEFORE UPDATE OR DELETE 拒絕 trigger；env 與 parseIdleMinutes 上限一致；盤點文件社區名遮罩（三重○○○A3/A5）— 便宜 — 若錯：無。
Ruling 32: 只關閉 [auth] enable_signup；[auth.email] enable_signup 維持 true（本機它控制 email 登入開關，關閉會導致無法登入）；匿名 signUp 已確認回 422 — 若錯：無。
Ruling 33: audit_logs 僅追加 trigger 也會擋住刪除公司時的連鎖刪除 — 符合稽核不可刪原則；未來刪除公司需走保存年限流程（第三階段）— 若錯：刪公司前需處理。
