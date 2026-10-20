# 計畫 2：主檔與案場管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓設計師能在系統中維護工種、單位、品項、廠商，並新增、搜尋、檢視案場（含業主資料、成員指派、平面圖與現場照片上傳），手機上操作順手。

**Architecture:** 延續計畫 1：使用者請求一律走 `@supabase/ssr` client（RLS 生效）。需要跨越 RLS 的寫入（建立案場並把自己加為成員、為案場建立業主）改用 Postgres `security definer` 函式，由函式自行檢查呼叫者權限。業主個資在伺服器端加密後才送進資料庫，解密只在伺服器端進行並寫稽核紀錄。檔案放 Supabase Storage 私有 bucket，只發有時效的簽名網址。

**Tech Stack:** Next.js 15 App Router（Server Components + Server Actions）、Supabase（Postgres RLS、Storage）、Drizzle（schema 與遷移）、zod、shadcn/ui、Framer Motion、Vitest、pgTAP。

**Spec:** [docs/architecture-plan.md](../../architecture-plan.md)（§3.2、§3.3、§4 畫面 2/3/4/11/12/14）、[CLAUDE.md](../../../CLAUDE.md)（D1～D9、上線前必做清單）、[計畫 1 裁定](./2026-10-20-foundation-and-pricing-core.ledger.md)（特別是 Ruling 11、12、16、20、33）

## Global Constraints

- 介面文字、註解、文件：台灣繁體中文與台灣用語；程式識別字英文。
- 使用者請求一律用 `createClient()`（`src/lib/supabase/server.ts`）；**不得**在使用者請求路徑使用 Drizzle `db`（它以 postgres 角色連線、繞過 RLS）。
- 需要繞過 RLS 的寫入只能透過本計畫定義的 `security definer` 函式，函式一律 `set search_path = ''`、完整限定名稱、開頭檢查 `auth.uid()` 的角色與公司。
- 業主姓名、電話、Email、身分證字號、案場完整地址：寫入前以 `encryptField` 加密；電話、Email、身分證字號、姓名另存 `blindIndex`；**正規化後為空字串時不寫盲索引（存 null）**。
- 解密業主聯絡資料（電話、Email、身分證字號）必須先寫 `client.view_pii` 稽核紀錄，metadata 只放 `client_id` 與欄位名稱。
- 每張新資料表：`organization_id`、RLS、`mfa_required` restrictive policy、organization_id 不可變更 trigger、anon 無權限——`supabase/tests/guards.test.sql` 會檢查。
- 檔案：私有 bucket，簽名網址有效 10 分鐘；單檔上限 50 MB；允許 `image/*`、`application/pdf`、`.dwg`、`.dxf`。
- 金額與數字：Decimal / `numeric`，禁止浮點數。坪數 `numeric(10,2)`。
- 數字欄位在手機上用 `inputMode="decimal"`（坪數）或 `inputMode="numeric"`（樓層、排序）。
- 動畫用 Framer Motion，一律尊重 `prefers-reduced-motion`（`useReducedMotion()` 為 true 時不做位移／縮放動畫）。
- 測試只用虛構資料；`data/legacy/` 不得讀取或引用。

## Review Focus

1. **設計師建立案場後立刻看得到它**（計畫 1 Task 6 發現 `insert … returning` 會失敗）→ 透過 `app.create_project()` 一次完成案場與成員寫入，回傳 id，RLS 下立即可讀。（Task 2 測試）
2. **業主電話只填了「-」或空白** → 盲索引存 null，不會和其他空值業主「互相匹配」。（Task 3 測試）
3. **監工打開案場詳情** → 看得到案名、行政區、完整施工地址、成員、檔案；看不到業主姓名與聯絡方式，也看不到「顯示聯絡資料」按鈕。（Task 6 測試）
4. **未被指派的設計師猜到檔案路徑** → Storage 下載與簽名網址都被拒絕。（Task 2 pgTAP）
5. **手機上新增案場** → 單欄表單、坪數跳出數字鍵盤、送出後直接進入案場詳情；網路錯誤時表單內容不會遺失。（Task 5、6）

---

## 檔案結構

```
src/
├─ server/                          # 只在伺服器端執行（import "server-only"）
│  ├─ context.ts                    # getAppContext()：目前使用者、所屬公司、角色
│  ├─ pii.ts                        # 業主個資加密／解密與稽核
│  ├─ master/{trades,units,catalog,vendors}.ts
│  └─ projects/{queries,mutations,files}.ts
├─ lib/validation/{master,project}.ts   # zod schema（前後端共用）
├─ components/
│  ├─ ui/…                          # shadcn 元件（新增 label、select、textarea、dialog、badge、table、card、sheet、tabs）
│  ├─ app-shell/{nav,mobile-nav}.tsx
│  └─ motion/{fade-in,list-item}.tsx    # 尊重 reduced motion 的動畫元件
└─ app/(app)/
   ├─ projects/page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
   └─ master/{trades,units,catalog,vendors}/page.tsx
supabase/
├─ migrations/<ts>_plan2_*.sql
├─ seed.sql                          # 補預設工種、單位、虛構品項與廠商
└─ tests/{projects_fn,storage}.test.sql
tests/
├─ server/…                          # 純函式與 zod 單元測試
└─ integration/…                     # 對本機 Supabase 的整合測試（npm run test:integration）
```

---

### Task 1: 資料庫補強：案場狀態、檔案表、預設工種與單位

**Files:**
- Modify: `src/db/schema/projects.ts`（狀態值、`project_files`）
- Create: `supabase/migrations/<ts>_plan2_schema.sql`（drizzle-kit 產生）、`<ts>_plan2_rls.sql`（`--custom`）
- Modify: `supabase/seed.sql`
- Test: `supabase/tests/guards.test.sql`（不需修改，但必須通過）、`supabase/tests/rls.test.sql`（新增斷言）

**Interfaces:**
- Produces：`PROJECT_STATUSES = ["lead","quoting","contracted","in_progress","completed","warranty","archived"]`，對應「洽談中、報價中、已簽約、施工中、完工、保固中、已封存」。舊值 `closed` 以遷移改為 `archived`。
- Produces：`PROJECT_STATUS_LABEL: Record<ProjectStatus, string>`（`src/db/schema/projects.ts` 匯出）。
- Produces：表 `project_files`：`id`、`organization_id`、`project_id`、`storage_path text not null unique`、`file_name text not null`、`mime_type text not null`、`size_bytes bigint not null check (size_bytes between 1 and 52428800)`、`kind text not null check in ('floor_plan','photo','rendering','drawing','other')`、`is_deidentified boolean not null default false`、`uploaded_by uuid not null references auth.users`、timestamps。RLS：select = `app.is_project_member(project_id)`；insert/delete = 案場成員且角色 admin／designer（監工可上傳 `photo`：insert 時 `kind = 'photo'` 允許監工）；update 不允許。
- Produces：SQL 函式 `app.seed_org_defaults(org uuid) returns void`（security definer）：插入預設工種與單位（已存在同名則略過）。

**預設工種（依序，`sort` = 10、20…）：** 保護工程、拆除、泥作、水電、空調、木作、鋁門窗、玄關門、系統櫃、衛浴、玻璃、油漆、木地板、石材、燈具、窗簾、貼膜、清潔、垃圾清運、設計費、監工管理費、代購（`is_proxy_purchase = true`、`default_include_in_mgmt_fee = false`）、其他。

**預設單位：** 式、坪、尺、才、組、只、樘、m²、處、迴、開、支、個、張、台、片、米、條、公分。

- [ ] **Step 1: 寫失敗的 pgTAP 斷言（加入 `rls.test.sql`）**
  - `project_files`：監工可 insert `kind='photo'`、不可 insert `kind='floor_plan'`；未指派設計師 select 為 0；乙公司 admin select 為 0。
  - `select app.seed_org_defaults(<甲>)` 執行兩次後，甲的 trades 數 = 23、units 數 = 19（不重複）。
  - `projects.status = 'closed'` 的 check 失敗（舊值已移除）。
- [ ] **Step 2: 執行 `npx supabase db reset && npx supabase test db`，確認新斷言失敗**
- [ ] **Step 3: 修改 schema、`npx drizzle-kit generate --name plan2_schema`；遷移內先 `update projects set status='archived' where status='closed'` 再換 check**
- [ ] **Step 4: 寫 `plan2_rls` 自訂遷移：project_files 的 RLS、`mfa_required`、organization_id／project_id 不可變更 trigger、parent scope trigger、`app.seed_org_defaults`；seed 對甲、乙兩家公司呼叫它，並加入 5 個虛構品項、3 家虛構廠商（電話以 `'v1:seed:seed:seed'` 佔位）**
- [ ] **Step 5: `npx supabase db reset && npx supabase test db` 全綠；`npx drizzle-kit generate` 無待產生變更**
- [ ] **Step 6: Commit** `feat: 案場狀態補齊、案場檔案表與預設工種單位`

---

### Task 2: 特權函式：建立案場、建立業主、指派成員；Storage 權限

**Files:**
- Create: `supabase/migrations/<ts>_plan2_functions.sql`、`supabase/migrations/<ts>_plan2_storage.sql`
- Test: `supabase/tests/projects_fn.test.sql`、`supabase/tests/storage.test.sql`

**Interfaces（皆在 schema `app`，`security definer`、`set search_path = ''`，`grant execute ... to authenticated`）：**

```sql
app.create_project(p_org uuid, p_name text, p_district text, p_address_full_enc text,
                   p_ping numeric, p_condition text, p_floor text, p_has_elevator boolean,
                   p_hoa_rules text, p_status text) returns uuid
-- 呼叫者在 p_org 的角色須為 admin 或 designer；插入 projects，並插入 project_members(呼叫者)。

app.create_client_for_project(p_project uuid, p_name_enc text, p_phone_enc text, p_email_enc text,
                   p_national_id_enc text, p_name_bidx text, p_phone_bidx text, p_email_bidx text,
                   p_national_id_bidx text) returns uuid
-- 呼叫者須為 app.is_project_editor(p_project)；在案場所屬公司建立 clients 並設定 projects.client_id
-- （繞過 Ruling 16 的 check_project_client：新業主只連到這一個案場）。

app.set_project_member(p_project uuid, p_user uuid, p_add boolean) returns void
-- 呼叫者須為該公司 admin，或該案場的 designer 成員；p_user 必須是同公司成員；
-- 不得移除自己以外的最後一位 designer／admin（案場至少保留一位可編輯者）。
```

**Storage：** bucket `project-files`（`public = false`、`file_size_limit = 52428800`、`allowed_mime_types` 含 `image/*`、`application/pdf`、`application/acad`、`image/vnd.dwg`、`application/dxf`、`application/octet-stream`）。物件路徑 `<organization_id>/<project_id>/<kind>/<uuid>-<檔名>`（kind 同 project_files.kind）。`storage.objects` policy（bucket = project-files）：
- select：`app.is_project_member((storage.foldername(name))[2]::uuid)` 且 `app.mfa_satisfied()`，且路徑第 1 段等於該案場的 organization_id
- insert：案場成員且角色 admin／designer；監工僅能上傳到路徑第 3 段為 `photo` 者
- delete：案場成員且角色 admin／designer
- update：不允許

- [ ] **Step 1: 寫失敗的 pgTAP（`projects_fn.test.sql`）**
  - 設計師呼叫 `create_project` 後，同一交易內 `select count(*) from projects where id = <回傳值>` = 1，且 `project_members` 有呼叫者。
  - 監工呼叫 `create_project` 拋錯（42501）；乙公司 admin 對甲公司呼叫拋錯。
  - 設計師對自己的案場 `create_client_for_project` 成功並可 select 該業主；對未指派案場呼叫拋錯。
  - `set_project_member`：設計師把同公司監工加入自己的案場成功；加入乙公司使用者拋錯；未指派設計師呼叫拋錯；移除案場唯一的 designer 拋錯。
- [ ] **Step 2: 寫失敗的 pgTAP（`storage.test.sql`）**：以 `storage.objects` 直接插入模擬（`set local role authenticated` + jwt claims）：成員可讀自己案場路徑的物件；未指派設計師與乙公司 admin 讀到 0；監工 insert `…/photo/…` 成功、`…/floor_plan/…` 失敗；aal1（有 verified factor）讀到 0。
- [ ] **Step 3: 執行 `npx supabase test db` 確認失敗**
- [ ] **Step 4: 實作兩個遷移（Storage 用 `insert into storage.buckets … on conflict do update`；不得讓 anon 有任何權限）**
- [ ] **Step 5: `npx supabase db reset && npx supabase test db` 全綠**
- [ ] **Step 6: Commit** `feat: 建立案場／業主／指派成員的特權函式與 Storage 權限`

---

### Task 3: 伺服器端基礎：使用者情境、業主個資加解密與稽核、整合測試環境

**Files:**
- Create: `src/server/context.ts`、`src/server/pii.ts`
- Modify: `src/lib/crypto/blind-index.ts`（空值回傳 null）、`src/lib/audit.ts`（無變更介面，只確認 `client.view_pii` 可用）
- Create: `vitest.integration.config.ts`、`tests/integration/setup.ts`、`package.json` script `test:integration`
- Test: `tests/server/pii.test.ts`、`tests/lib/crypto/blind-index.test.ts`（新增）、`tests/integration/context.test.ts`

**Interfaces:**
- Produces：`blindIndexOrNull(kind, value: string | null | undefined, key?): string | null`——正規化後為空字串回傳 null。原 `blindIndex` 保留，空值時拋錯（防止誤用）。
- Produces（`context.ts`）：
  ```ts
  interface AppContext { userId: string; memberships: { organizationId: string; organizationName: string; role: Role; canViewCost: boolean; canViewUnitPrice: boolean }[] }
  getAppContext(): Promise<AppContext>          // 未登入時 redirect("/login")
  requireOrgRole(ctx: AppContext, orgId: string, roles: Role[]): void   // 不符拋 ForbiddenError
  class ForbiddenError extends Error
  ```
  單一公司的使用者，目前公司 = 唯一那家；多公司使用者以 cookie `current_org`（httpOnly，值必須是自己的 membership）選擇，預設第一家。`getCurrentOrg(ctx): AppContext["memberships"][number]`。
- Produces（`pii.ts`）：
  ```ts
  interface ClientPiiInput { name: string; phone?: string; email?: string; nationalId?: string }
  encryptClientPii(i: ClientPiiInput): { nameEnc: string; phoneEnc: string | null; emailEnc: string | null; nationalIdEnc: string | null; nameBidx: string | null; phoneBidx: string | null; emailBidx: string | null; nationalIdBidx: string | null }
  decryptClientName(row: { name_enc: string }): string
  revealClientContact(clientId: string, organizationId: string): Promise<{ phone: string | null; email: string | null; nationalId: string | null }>
  // 先寫 client.view_pii 稽核（metadata: { fields: "phone,email,national_id" }），再以 RLS client 讀取並解密
  maskPhone(phone: string): string   // "0912345678" → "0912-***-678"；長度 < 8 回傳 "***"
  ```
- Produces：`npm run test:integration`——對本機 Supabase 執行，用 seed 使用者以 `signInWithPassword` 取得 client。整合測試不併入 `npm test`。

- [ ] **Step 1: 寫失敗的單元測試**
  - `blindIndexOrNull("phone", "-")` → null；`blindIndexOrNull("phone", " 0912-345-678 ")` = `blindIndex("phone", "0912345678")`；`blindIndex("phone", "")` 拋錯。
  - `encryptClientPii({ name: "王小明", phone: "" })` → `phoneEnc` 與 `phoneBidx` 皆為 null、`nameEnc` 以 `v1:` 開頭。
  - `maskPhone("0912345678") === "0912-***-678"`；`maskPhone("123") === "***"`。
- [ ] **Step 2: 寫失敗的整合測試（`tests/integration/context.test.ts`）**：以 designer@jia.example 登入後，`getAppContext` 等價邏輯（抽出可注入 Supabase client 的 `loadAppContext(supabase)`）回傳甲公司、角色 designer。
- [ ] **Step 3: 執行 `npx vitest run tests/server tests/lib/crypto` 與 `npm run test:integration` 確認失敗**
- [ ] **Step 4: 實作**（`server-only` 套件若未安裝則 `npm install server-only`；確認 vitest 以 alias 將它 mock 成空模組）
- [ ] **Step 5: 單元與整合測試全綠；`npm test && npm run typecheck && npm run lint`**
- [ ] **Step 6: Commit** `feat: 使用者情境、業主個資加解密與稽核、整合測試環境`

---

### Task 4: 主檔管理：工種、單位、品項、廠商

**Files:**
- Create: `src/lib/validation/master.ts`、`src/server/master/{trades,units,catalog,vendors}.ts`
- Create: `src/app/(app)/master/layout.tsx`（分頁：工種｜單位｜品項｜廠商）、`master/{trades,units,catalog,vendors}/page.tsx` 與各自的 `actions.ts`、表單元件
- Create（shadcn）：`label`、`select`、`textarea`、`dialog`、`badge`、`table`、`card`、`sheet`、`tabs`
- Test: `tests/lib/validation/master.test.ts`、`tests/integration/master.test.ts`

**Interfaces:**
- zod schema（`master.ts`）：
  - `tradeSchema`：name 1～30 字、sort 0～9999 整數、defaultIncludeInMgmtFee、isProxyPurchase；**isProxyPurchase 為 true 時 defaultIncludeInMgmtFee 必須為 false**（refine，訊息「代購工種不可預設計入管銷」）。
  - `unitSchema`：name 1～10 字、sort。
  - `catalogItemSchema`：name 1～100、tradeId uuid|null、unitId uuid|null、spec ≤ 500、defaultVendorId uuid|null、pricingMethod ∈ PRICING_METHODS、note ≤ 1000。
  - `vendorSchema`：name 1～60、tradeIds uuid[]、contactName ≤ 30、phone ≤ 20（伺服器端加密存 `phone_enc`）、taxId 為空或 8 位數字、note ≤ 1000。
- `PRICING_METHOD_LABEL`：unit_x_qty「單價 × 數量」、per_ping「按坪數」、lump_sum「一式」、package「套裝方案」、percent「百分比加成」。
- 每個 server 模組匯出 `list…(orgId)`、`create…(orgId, input)`、`update…(orgId, id, input)`、`delete…(orgId, id)`，全部經 RLS client；刪除被外鍵參照（品項被報價引用、工種被品項引用）時回傳友善錯誤「此工種仍有品項使用，無法刪除」等，不拋 500。刪除寫 `record.delete` 稽核。
- 畫面行為：
  - 列表在桌機為表格、手機為卡片清單；新增／編輯用 `Sheet`（手機由下方滑出）。
  - 工種與單位支援上下移動排序（按鈕，不做拖曳）；代購工種顯示 `Badge`「代購・不計管銷」。
  - 品項可依工種篩選、依名稱搜尋（`ilike`，伺服器端）。
  - 廠商電話在列表顯示 `maskPhone`；編輯時解密顯示完整號碼（廠商不是業主，不寫 `client.view_pii`）。
  - 監工：可看廠商列表（Ruling 19），所有新增／編輯按鈕隱藏，server action 也拒絕（RLS 會擋，action 回傳「沒有權限」）。

- [ ] **Step 1: 寫失敗的 zod 單元測試**：代購工種 refine、統編 8 碼、名稱長度邊界、pricingMethod 非法值。
- [ ] **Step 2: 寫失敗的整合測試**：designer 新增工種→列表看得到；supervisor 新增工種被拒；刪除被品項引用的工種回傳友善錯誤；廠商電話在 DB 為 `v1:` 密文。
- [ ] **Step 3: 確認失敗後實作 server 模組與 actions**
- [ ] **Step 4: 實作畫面（Server Component 讀取 + Client Component 表單；`useActionState` 顯示錯誤；送出失敗保留輸入）**
- [ ] **Step 5: `npm test && npm run test:integration && npm run typecheck && npm run lint && npm run build`**
- [ ] **Step 6: 手動驗證（記錄於報告）**：`npm run dev`，以 designer 帳號在桌機與手機寬度（DevTools 390px）新增工種、品項、廠商。
- [ ] **Step 7: Commit** `feat: 主檔管理（工種、單位、品項、廠商）`

---

### Task 5: 應用程式外框與案場列表、新增、編輯

**Files:**
- Create: `src/components/app-shell/{nav,mobile-nav}.tsx`、`src/components/motion/{fade-in,list-item}.tsx`
- Modify: `src/app/(app)/layout.tsx`（改用 app-shell；首頁 `/` 導向 `/projects`）
- Create: `src/lib/validation/project.ts`、`src/server/projects/{queries,mutations}.ts`
- Create: `src/app/(app)/projects/page.tsx`、`projects/new/page.tsx`、`projects/[id]/edit/page.tsx`、`projects/project-form.tsx`、`projects/actions.ts`
- Test: `tests/lib/validation/project.test.ts`、`tests/integration/projects.test.ts`

**Interfaces:**
- `projectSchema`：name 1～60（必填）、district ≤ 20、addressFull ≤ 200、ping 為空或 0.01～9999.99 的十進位字串（以 Decimal 驗證，不轉 number）、condition ∈ new/resale/old｜空、floor ≤ 10、hasElevator boolean｜空、hoaRules ≤ 2000、status ∈ PROJECT_STATUSES；業主區塊（選填）：clientName（填了才建立業主）、clientPhone、clientEmail（email 格式）、clientNationalId（台灣身分證格式 `^[A-Z][12]\d{8}$` 或空）。
- `createProject(ctx, input): Promise<string>`：加密地址 → `rpc("create_project")` → 若有業主資料，`encryptClientPii` → `rpc("create_client_for_project")`。回傳案場 id。
- `updateProject(ctx, id, input)`：一般欄位經 RLS update；業主資料若已存在則 update clients（需 `client:view_pii` 權限）。
- `listProjects(ctx, { q?: string; status?: ProjectStatus | "active"; })`：`active` = 非 archived；q 比對案名與行政區（`ilike`）。回傳 `{ id, name, district, status, ping, updatedAt }[]`，依 `updated_at desc`。**列表不解密任何個資。**
- 外框：
  - 桌機左側／頂部導覽：案場、主檔（admin／designer 才顯示）、安全設定、登出；目前公司名稱；多公司時可切換（`current_org` cookie）。
  - 手機底部導覽列：案場、新增案場（中間大按鈕）、主檔、我的。
  - 頁面切換淡入（`fade-in`，150ms），列表項目依序出現（stagger 30ms，最多前 20 筆）；reduced motion 時直接顯示。
- 案場列表：搜尋框（防抖 300ms，寫入 URL query）、狀態篩選 chips（全部進行中｜洽談中｜報價中｜已簽約｜施工中｜完工｜保固中｜已封存），手機為卡片、桌機為表格；狀態以顏色 Badge 顯示。
- 新增／編輯表單（手機優先、單欄）：分段「基本資料」「屋況」「業主資料」（監工不顯示此段）；坪數 `inputMode="decimal"`、樓層 `inputMode="numeric"`；送出中按鈕停用並顯示「儲存中…」；失敗時保留所有輸入並顯示錯誤；成功導向案場詳情。

- [ ] **Step 1: 寫失敗的 zod 測試**：坪數 "12.5" 通過、"12.555" 失敗、"abc" 失敗、"0" 失敗；身分證格式；有業主電話但沒有業主姓名 → 錯誤「請填寫業主姓名」。
- [ ] **Step 2: 寫失敗的整合測試**：designer 建立含業主的案場 → 回傳 id、列表看得到、clients 的 phone_enc 為密文、phone_bidx 非 null；只填空白電話 → phone_bidx 為 null；supervisor 建立被拒；搜尋 q=行政區名稱 只回傳相符案場；status=active 不含 archived。
- [ ] **Step 3: 確認失敗後實作 server 與 actions**
- [ ] **Step 4: 實作外框、列表、表單**
- [ ] **Step 5: `npm test && npm run test:integration && npm run typecheck && npm run lint && npm run build`**
- [ ] **Step 6: 手動驗證（記錄於報告）**：390px 寬度下新增案場，確認數字鍵盤（以 DevTools 檢查 `inputmode` 屬性）、底部導覽、reduced motion（DevTools Rendering → Emulate prefers-reduced-motion）。
- [ ] **Step 7: Commit** `feat: 應用外框、案場列表與新增編輯`

---

### Task 6: 案場詳情：業主聯絡資料揭露、成員指派、檔案上傳

**Files:**
- Create: `src/app/(app)/projects/[id]/page.tsx`、`[id]/client-card.tsx`、`[id]/members-card.tsx`、`[id]/files-card.tsx`、`[id]/actions.ts`
- Create: `src/server/projects/files.ts`
- Test: `tests/integration/project-detail.test.ts`、`tests/server/files.test.ts`

**Interfaces:**
- `getProjectDetail(ctx, id)`：回傳案場欄位（地址解密給所有案場成員——施工需要）、`client: { id, name } | null`（只有 `client:view_pii` 為 true 才回傳，姓名解密）、成員清單（姓名以 email 前綴顯示）、檔案清單、`perms`（`can()` 結果）。找不到或無權限 → `notFound()`。
- 業主卡片：顯示姓名與「顯示聯絡資料」按鈕 → server action 呼叫 `revealClientContact`（寫稽核）→ 顯示電話（可點擊撥號 `tel:`）、Email、身分證字號（預設遮罩，再點一次才顯示）。
- 成員卡片：列出成員與角色；admin／案場 designer 可從同公司成員下拉選單加入、移除（`rpc("set_project_member")`），錯誤訊息以中文顯示（如「案場至少需保留一位可編輯者」）。
- 檔案（`files.ts`）：
  ```ts
  validateUpload(f: { name: string; size: number; type: string }): { ok: true } | { ok: false; message: string }
  // 50 MB 上限、允許類型；副檔名 .dwg/.dxf 即使 type 為空或 octet-stream 也允許
  buildStoragePath(orgId: string, projectId: string, kind: FileKind, fileName: string, uuid: string): string
  // `${orgId}/${projectId}/${kind}/${uuid}-${safeName}`；safeName 移除 / \ 與控制字元，保留中文，截斷至 100 字元
  createSignedDownloadUrl(ctx, fileId): Promise<string>   // 有效 600 秒
  ```
  上傳流程：瀏覽器以使用者的 Supabase client 直接上傳到 Storage（RLS 生效）→ 成功後呼叫 server action 寫 `project_files` 列。失敗時刪除已上傳物件。
- 檔案卡片：依類型分組（平面圖、現場照片、渲染圖、圖說、其他）；手機上「拍照上傳」按鈕使用 `<input type="file" accept="image/*" capture="environment">`；圖片顯示縮圖（簽名網址），其他類型顯示圖示與檔名；admin／designer 可刪除（寫 `record.delete` 稽核）。

- [ ] **Step 1: 寫失敗的單元測試（`files.test.ts`）**：50 MB + 1 位元組被拒；`.dwg` 且 type 空字串通過；`.exe` 被拒；`buildStoragePath` 對 `"../../平面圖 v2.pdf"` 產生不含 `/`、`..` 的安全檔名且保留「平面圖」。
- [ ] **Step 2: 寫失敗的整合測試**：
  - designer `revealClientContact` 後 audit_logs 多一筆 `client.view_pii`，metadata 不含電話本身。
  - supervisor 的 `getProjectDetail` 中 `client` 為 null，地址有值。
  - designer 加入監工成功；未指派 designer 呼叫被拒。
  - designer 上傳小型 PDF 並取得簽名網址，以 fetch 下載 200；未指派 designer 取得簽名網址失敗。
- [ ] **Step 3: 確認失敗後實作**
- [ ] **Step 4: `npm test && npm run test:integration && npm run typecheck && npm run lint && npm run build && npx supabase test db`**
- [ ] **Step 5: 手動驗證（記錄於報告）**：以 designer 建立案場→上傳平面圖 PDF 與照片→顯示聯絡資料；以 supervisor 登入同案場，確認看不到業主區塊、可上傳照片。
- [ ] **Step 6: Commit** `feat: 案場詳情、業主聯絡資料揭露、成員指派與檔案上傳`

---

## 不在本計畫範圍

- 報價單、成本、防漏項、版本、PDF（計畫 3～5）。
- 使用者邀請與帳號管理畫面（admin 目前以 Supabase Studio 新增；列入後續計畫）。
- 去識別化圖說分享連結給廠商（第二階段）。
- 個資權利申請與保存年限（第三階段）。

## 費用備註

本計畫全部在本機 Supabase 執行，不產生費用。上線後檔案儲存：Supabase 免費方案含 1 GB、Pro 方案含 100 GB；照片與平面圖累積後可能超出免費額度——屆時需使用者確認。
