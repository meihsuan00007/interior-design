# 計畫 1：基礎建設與計價核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可執行的 Next.js 專案骨架、純函式計價核心（加成、毛利、有效成本、結算分攤、管理費、營業稅）、多租戶資料庫與 RLS、欄位加密、登入與權限。

**Architecture:** 計價邏輯全部寫成不依賴資料庫的純函式（`src/domain/pricing/`），以 decimal.js 運算，畫面、PDF、API 共用同一套函式。資料庫用 Supabase Postgres；表結構以 Drizzle schema 定義並產生遷移，RLS policy、輔助函式與 trigger 寫在自訂 SQL 遷移中，以 pgTAP 測試。

**Tech Stack:** Next.js 15（App Router）、TypeScript、Tailwind CSS、shadcn/ui、decimal.js、Drizzle ORM / drizzle-kit、Supabase（Auth、Postgres、本機 CLI）、Vitest、pgTAP、zod。

**Spec:** [docs/architecture-plan.md](../../architecture-plan.md)、[CLAUDE.md](../../../CLAUDE.md)（D1～D8 為已確認決策）、[docs/legacy-data-inventory.md](../../legacy-data-inventory.md)

**本計畫範圍：** 架構計畫 §5 任務 1～5。主檔、案場、報價編輯器、防漏項、版本、PDF、歷史價格會寫在後續計畫 2～6。

## Global Constraints

- 介面文字、註解、文件：台灣繁體中文與台灣用語；程式識別字用英文。
- 禁止浮點數運算：金額、數量、比例一律 `Decimal`（decimal.js）或 Postgres `numeric`。單價與數量 `numeric(14,2)`，金額 `numeric(14,0)`，比例 `numeric(7,6)`。
- 四捨五入 = 「四捨五入、遠離零」（decimal.js `ROUND_HALF_UP`）：`11542.5 → 11543`、`-11542.5 → -11543`。
- 每列小計四捨五入到元，總計 = 各列加總；管理費、稅各自四捨五入到元。
- 加成率 = 對客價 ÷ 成本，顯示倍數兩位小數（`1.35`）；毛利率 = 毛利 ÷ 對客價，顯示整數百分比（`26%`）；分母為 0 或空白時顯示 `—`（U+2014）。
- 有效成本：結算優先，否則最新一次報價。
- 管理費 = 計入管銷項目對客總價合計 × 比例（公司預設 `0.10`，案場可覆寫）；代購工種預設不計入；業主直付強制不計入。
- 計算順序：S1 → S2 → F = S1 × 比例 → D → X → N = S1 + S2 + F + D − X → 稅（外加 N × 5%；內含 N × 5/105 僅顯示）。業主直付不在其中。
- 所有業務資料表帶 `organization_id` 並啟用 RLS。
- `data/legacy/` 的任何內容不得出現在程式碼、測試、種子資料中；測試只能使用虛構資料或「數字」。
- 欄位加密：AES-256-GCM，金鑰只來自環境變數；缺少金鑰時伺服器拒絕啟動。
- 套件管理：npm（本機沒有 pnpm）。

## Review Focus

1. **整筆結算分攤時，所有報價金額為 0，或該文件只有一列成本** → 0 元報價時改為平均分攤；只有一列時整筆給該列；分攤後各列加總必須恰好等於結算總額。（測試在 Task 3）
2. **同一個成本項目在同一天有兩筆報價** → 取建立時間較晚的那筆，結果可重現。（測試在 Task 3）
3. **小數數量 × 單價剛好落在 .5**（17.1 尺 × 675 = 11542.5；追減 −11542.5）→ 11543 與 −11543，不可用銀行家捨入。（測試在 Task 2、4）
4. **對客價為 0 但有成本的項目**（管銷服務）→ 毛利為負數、毛利率顯示 `—`、不報錯；其成本仍計入報價單總成本。（測試在 Task 4）
5. **使用者被移出案場，或屬於 A 公司卻查詢 B 公司的案場** → 立即讀不到任何資料（含成本與業主資料）。（測試在 Task 6）

---

## 檔案結構

```
interior-design/
├─ .env.example
├─ drizzle.config.ts
├─ vitest.config.ts
├─ src/
│  ├─ lib/
│  │  ├─ env.ts                      # 環境變數驗證（zod），缺金鑰即拋錯
│  │  ├─ money/decimal.ts            # Decimal 建構、四捨五入
│  │  ├─ money/format.ts             # 新台幣、加成率、毛利率顯示
│  │  ├─ crypto/field-encryption.ts  # AES-256-GCM
│  │  ├─ crypto/blind-index.ts       # HMAC 盲索引
│  │  ├─ auth/permissions.ts         # 角色權限矩陣（純函式）
│  │  ├─ supabase/server.ts, client.ts
│  │  └─ audit.ts                    # 稽核紀錄寫入
│  ├─ domain/pricing/
│  │  ├─ types.ts
│  │  ├─ effective-cost.ts           # 有效成本、結算分攤、來源標籤
│  │  ├─ mgmt-fee.ts                 # 是否計入管銷的判定
│  │  ├─ item.ts                     # 單一報價項目計算
│  │  └─ totals.ts                   # 報價單總計
│  ├─ db/schema/*.ts, db/client.ts
│  ├─ middleware.ts
│  └─ app/(auth)/login/page.tsx, app/(app)/layout.tsx, app/(app)/page.tsx
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/                    # drizzle-kit 產生（prefix: supabase）+ 自訂 SQL
│  ├─ seed.sql                       # 虛構資料
│  └─ tests/*.test.sql               # pgTAP
└─ tests/ （與 src 同結構的 *.test.ts）
```

---

### Task 1: 專案骨架與環境變數驗證

**Files:**
- Delete: `my-project/`、`my-new-project/`（目前是空資料夾，刪除前先確認為空）
- Create: Next.js 專案於根目錄（保留既有 `.gitignore`、`CLAUDE.md`、`docs/`、`data/`）
- Create: `src/lib/env.ts`、`.env.example`、`vitest.config.ts`
- Modify: `src/app/layout.tsx`（`lang="zh-Hant-TW"`、Noto Sans TC）、`package.json` scripts
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces: `getServerEnv(): ServerEnv`，`ServerEnv` 含 `DATABASE_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`FIELD_ENCRYPTION_KEY`（base64，解碼後必須 32 bytes）、`BLIND_INDEX_KEY`（base64，≥ 32 bytes）、`SESSION_IDLE_MINUTES`（預設 120，即閒置 2 小時）。
- Produces: npm scripts `dev`、`build`、`lint`、`typecheck`（`tsc --noEmit`）、`test`（`vitest run`）。

- [ ] **Step 1: 初始化 git 與 Next.js**

確認 `my-project/`、`my-new-project/` 為空後刪除。執行 `git init -b main`。由於根目錄已有檔案，先在暫存目錄執行 `npx create-next-app@15 tmp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`，再把產生的檔案搬到根目錄（**不覆蓋**既有 `.gitignore`，改為合併其內容）。安裝 `decimal.js zod` 與開發套件 `vitest @vitest/coverage-v8`。執行 `npx shadcn@latest init`（樣式 New York、基底色 neutral）。

- [ ] **Step 2: 寫失敗的測試**

```ts
// tests/lib/env.test.ts
const valid = {
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  BLIND_INDEX_KEY: Buffer.alloc(32, 2).toString("base64"),
};
test("缺少 FIELD_ENCRYPTION_KEY 時拋錯，錯誤訊息包含變數名稱", () => {
  const { FIELD_ENCRYPTION_KEY, ...rest } = valid;
  expect(() => parseServerEnv(rest)).toThrow(/FIELD_ENCRYPTION_KEY/);
});
test("FIELD_ENCRYPTION_KEY 解碼後不是 32 bytes 時拋錯", () => {
  expect(() => parseServerEnv({ ...valid, FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32/);
});
test("SESSION_IDLE_MINUTES 未設定時預設 120（閒置 2 小時）", () => {
  expect(parseServerEnv(valid).SESSION_IDLE_MINUTES).toBe(120);
});
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run tests/lib/env.test.ts`
Expected: FAIL，`parseServerEnv` 未定義

- [ ] **Step 4: 實作 `parseServerEnv(source: Record<string, string | undefined>): ServerEnv` 與 `getServerEnv()`（以 `process.env` 呼叫並快取）於 `src/lib/env.ts`**

用 zod schema；`.env.example` 列出全部變數，金鑰欄位留空，並附產生指令註解：`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`。`layout.tsx` 用 `next/font/google` 載入 `Noto_Sans_TC`（weights 400、500、700），首頁顯示「室內設計報價管理系統」。

- [ ] **Step 5: 驗證**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 全部通過。`npm run dev` 開啟 http://localhost:3000 顯示「室內設計報價管理系統」。

- [ ] **Step 6: Commit**

```bash
git add -A
git status   # 確認 data/legacy/ 沒有出現在待提交清單
git commit -m "chore: 建立 Next.js 專案骨架與環境變數驗證"
```

---

### Task 2: 金額運算與顯示格式

**Files:**
- Create: `src/lib/money/decimal.ts`、`src/lib/money/format.ts`
- Test: `tests/lib/money/decimal.test.ts`、`tests/lib/money/format.test.ts`

**Interfaces:**
- Produces（`decimal.ts`）：`type Num = Decimal`；`D(value: Decimal.Value): Decimal`（字串或 Decimal；傳入 JS `number` 且非整數時拋錯，避免浮點數流入）；`roundYuan(x: Decimal): Decimal`（ROUND_HALF_UP 到整數）；`sum(xs: Decimal[]): Decimal`。
- Produces（`format.ts`）：`formatTWD(x: Decimal): string` → `"2,372,051"`、負數 `"-750"`；`formatMarkup(x: Decimal | null): string` → `"1.35"` 或 `"—"`；`formatMarginRate(x: Decimal | null): string` → `"26%"` 或 `"—"`。

- [ ] **Step 1: 寫失敗的測試**

```ts
test("roundYuan 四捨五入遠離零", () => {
  expect(roundYuan(D("17.1").mul("675")).toString()).toBe("11543");
  expect(roundYuan(D("-11542.5")).toString()).toBe("-11543");
  expect(roundYuan(D("104868.50000000001")).toString()).toBe("104869");
});
test("D() 拒絕非整數的 JS number", () => {
  expect(() => D(0.1)).toThrow();
  expect(D(3).toString()).toBe("3");
});
test("formatTWD 千分位", () => {
  expect(formatTWD(D("2372051"))).toBe("2,372,051");
  expect(formatTWD(D("-750"))).toBe("-750");
  expect(formatTWD(D("0"))).toBe("0");
});
test("formatMarkup 兩位小數，null 顯示破折號", () => {
  expect(formatMarkup(D("162000").div("120000"))).toBe("1.35");
  expect(formatMarkup(null)).toBe("—");
});
test("formatMarginRate 整數百分比，null 顯示破折號", () => {
  expect(formatMarginRate(D("42000").div("162000"))).toBe("26%");
  expect(formatMarginRate(null)).toBe("—");
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/lib/money`
Expected: FAIL，模組不存在

- [ ] **Step 3: 實作上述函式**

`Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })` 只在 `decimal.ts` 設定一次。千分位自行以字串處理（不經過 `Number`）。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/lib/money`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/money tests/lib/money
git commit -m "feat: 金額運算與新台幣、加成率、毛利率顯示格式"
```

---

### Task 3: 有效成本、結算分攤與來源標籤

**Files:**
- Create: `src/domain/pricing/types.ts`、`src/domain/pricing/effective-cost.ts`
- Test: `tests/domain/pricing/effective-cost.test.ts`

**Interfaces:**
- Produces（`types.ts`）：
  ```ts
  type CostPriceSource = "quote" | "settlement";
  interface CostPrice { costItemId: string; source: CostPriceSource; amount: Decimal; pricedOn: string /* YYYY-MM-DD */; createdAt: string /* ISO */ }
  interface DocumentSettlement { vendorDocumentId: string; amount: Decimal; costItemIds: string[]; settledOn: string /* YYYY-MM-DD */ }
  type EffectiveSource = "settlement" | "settlement_allocated" | "quote";
  interface EffectiveCost { amount: Decimal; source: EffectiveSource; date: string }
  ```
- Produces（`effective-cost.ts`）：
  - `resolveEffectiveCosts(prices: CostPrice[], documentSettlements: DocumentSettlement[]): Map<string, EffectiveCost>` — 沒有任何價格的成本項目不會出現在 Map 中。
  - `allocateProportionally(total: Decimal, weights: { id: string; weight: Decimal }[]): Map<string, Decimal>`
  - `costSourceLabel(e: EffectiveCost | null): string` → `"結算"`、`"結算（分攤）"`、`"報價（2025-07-14）"`、`"無成本"`

**規則（Step 3 實作依據）：**
1. 某成本項目有自己的 settlement → 用它（同項目多筆 settlement 時取 `createdAt` 最晚的），source `settlement`。
2. 否則，若屬於某份 `DocumentSettlement` → 分攤額 = 文件結算總額 − 同文件中已有自己 settlement 的項目金額合計，依「各項目最新報價金額」比例分攤給其餘項目（用 `allocateProportionally`），source `settlement_allocated`，date = `settledOn`。
3. 否則用最新一筆 quote：`pricedOn` 最晚者；同日取 `createdAt` 最晚者。source `quote`。
4. `allocateProportionally`：各權重總和為 0 時改為平均分攤；每份先四捨五入到元，差額（總額 − 各份加總）加到原始比例值最大的那一份（同值取陣列中第一個），確保加總恰好等於總額。

- [ ] **Step 1: 寫失敗的測試**

```ts
const q = (id: string, amount: string, pricedOn: string, createdAt = `${pricedOn}T00:00:00Z`) =>
  ({ costItemId: id, source: "quote" as const, amount: D(amount), pricedOn, createdAt });

test("有結算時採用結算", () => {
  const m = resolveEffectiveCosts([q("a", "7000", "2025-07-14"),
    { costItemId: "a", source: "settlement", amount: D("6800"), pricedOn: "2026-01-21", createdAt: "2026-01-21T00:00:00Z" }], []);
  expect(m.get("a")).toMatchObject({ source: "settlement", date: "2026-01-21" });
  expect(m.get("a")!.amount.toString()).toBe("6800");
});
test("沒有結算時採用最新報價；同日取建立時間較晚者", () => {
  const m = resolveEffectiveCosts([
    q("a", "1000", "2025-07-01"), q("a", "1200", "2025-07-14", "2025-07-14T01:00:00Z"),
    q("a", "1100", "2025-07-14", "2025-07-14T09:00:00Z")], []);
  expect(m.get("a")!.amount.toString()).toBe("1100");
  expect(costSourceLabel(m.get("a")!)).toBe("報價（2025-07-14）");
});
test("整筆結算依最新報價比例分攤，加總恰好等於結算額", () => {
  const prices = [q("a", "24050", "2025-07-14"), q("b", "11542.5", "2025-07-14"), q("c", "68970", "2025-07-14")];
  const m = resolveEffectiveCosts(prices, [{ vendorDocumentId: "d", amount: D("120000"), costItemIds: ["a", "b", "c"], settledOn: "2026-01-21" }]);
  const total = ["a", "b", "c"].reduce((s, id) => s.plus(m.get(id)!.amount), D(0));
  expect(total.toString()).toBe("120000");
  expect(costSourceLabel(m.get("a")!)).toBe("結算（分攤）");
});
test("文件中已有自己結算的項目先扣除，其餘再分攤", () => {
  const prices = [q("a", "100", "2025-07-14"), q("b", "100", "2025-07-14"),
    { costItemId: "a", source: "settlement" as const, amount: D("150"), pricedOn: "2026-01-21", createdAt: "2026-01-21T00:00:00Z" }];
  const m = resolveEffectiveCosts(prices, [{ vendorDocumentId: "d", amount: D("400"), costItemIds: ["a", "b"], settledOn: "2026-01-21" }]);
  expect(m.get("a")!.amount.toString()).toBe("150");
  expect(m.get("b")!.amount.toString()).toBe("250");
});
test("權重全為 0 時平均分攤；只有一份時全給該份", () => {
  const even = allocateProportionally(D("100"), [{ id: "a", weight: D(0) }, { id: "b", weight: D(0) }, { id: "c", weight: D(0) }]);
  expect([...even.values()].map(String)).toEqual(["34", "33", "33"]);
  expect(allocateProportionally(D("120000"), [{ id: "a", weight: D(0) }]).get("a")!.toString()).toBe("120000");
});
test("沒有任何價格時不在結果中，標籤為「無成本」", () => {
  expect(resolveEffectiveCosts([], []).has("x")).toBe(false);
  expect(costSourceLabel(null)).toBe("無成本");
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/domain/pricing/effective-cost.test.ts`
Expected: FAIL，模組不存在

- [ ] **Step 3: 依上方「規則」實作 `types.ts` 與 `effective-cost.ts`**

平均分攤 `100 / 3`：各份 33.33 → 四捨五入 33、33、33，差額 1 加到第一份 → `34, 33, 33`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/domain/pricing/effective-cost.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/pricing tests/domain/pricing
git commit -m "feat: 有效成本（結算優先）、整筆結算分攤與來源標籤"
```

---

### Task 4: 報價項目計算、管銷判定與報價單總計

**Files:**
- Create: `src/domain/pricing/mgmt-fee.ts`、`src/domain/pricing/item.ts`、`src/domain/pricing/totals.ts`
- Modify: `src/domain/pricing/types.ts`
- Test: `tests/domain/pricing/mgmt-fee.test.ts`、`item.test.ts`、`totals.test.ts`

**Interfaces:**
- Consumes: Task 2 `D`、`roundYuan`、`sum`；Task 3 `EffectiveCost`、`resolveEffectiveCosts` 的輸出 Map。
- Produces（`mgmt-fee.ts`）：
  ```ts
  type MgmtFeeSource = "default" | "owner_direct" | "manual";
  resolveMgmtFeeInclusion(i: { tradeIsProxyPurchase: boolean; tradeDefaultInclude: boolean; isPaidDirectlyByOwner: boolean; manualInclude: boolean | null }): { include: boolean; source: MgmtFeeSource }
  ```
  優先順序：業主直付 → `{false, "owner_direct"}`（手動不能覆寫）；`manualInclude !== null` → `{manualInclude, "manual"}`；代購工種 → `{false, "default"}`；否則 `{tradeDefaultInclude, "default"}`。
- Produces（`types.ts` 新增）：
  ```ts
  interface QuoteItemInput {
    id: string; parentId: string | null;
    quantity: Decimal | null; clientUnitPrice: Decimal | null;
    isOptional: boolean; isComplimentary: boolean; isOwnerSupplied: boolean; isPaidDirectlyByOwner: boolean;
    includeInMgmtFee: boolean;
    costLinks: { costItemId: string; allocationRatio: Decimal }[];
  }
  interface QuoteItemResult {
    id: string; ownAmount: Decimal; clientTotal: Decimal; countsInTotal: boolean;
    cost: Decimal | null; costSource: EffectiveSource | "mixed" | null; costDate: string | null;
    margin: Decimal | null; markupRate: Decimal | null; marginRate: Decimal | null;
  }
  type TaxMode = "exclusive" | "inclusive";
  interface QuoteFeeInput { kind: "design" | "warranty" | "other"; mode: "percent" | "fixed"; value: Decimal }
  interface QuoteTotalsInput { items: QuoteItemInput[]; effectiveCosts: Map<string, EffectiveCost>; mgmtFeeRate: Decimal; fees: QuoteFeeInput[]; discount: Decimal; taxMode: TaxMode }
  interface QuoteTotals {
    s1: Decimal; s2: Decimal; mgmtFee: Decimal; otherFees: Decimal; discount: Decimal;
    netTotal: Decimal; tax: Decimal; grandTotal: Decimal;
    costTotal: Decimal; itemsMargin: Decimal; totalMargin: Decimal;
    markupRate: Decimal | null; marginRate: Decimal | null;
    costSourceSummary: { settlement: number; quote: number; none: number; label: string; isMixed: boolean };
    items: QuoteItemResult[];
  }
  ```
- Produces：`computeItems(items: QuoteItemInput[], costs: Map<string, EffectiveCost>): QuoteItemResult[]`（`item.ts`）、`computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals`（`totals.ts`）。

**規則（實作依據）：**
- `ownAmount` = `roundYuan(quantity × clientUnitPrice)`；任一為 null → 0。
- 母項 `clientTotal` = 自己的 `ownAmount` + 子項 `ownAmount` 加總；子項的 `countsInTotal` 為 false（避免重複加總），只有最上層項目計入總計。
- `countsInTotal`（最上層）= 非選配、非管銷服務、非業主自備、非業主直付。
- 項目成本 = Σ `roundYuan(有效成本 × allocationRatio)`，母項包含子項的成本連結；全部連結都沒有有效成本 → `cost = null`。`costSource`：所有連結來源相同就用該來源（`settlement_allocated` 視為獨立來源），不同 → `"mixed"`；`costDate` 取最新日期。
- `margin` = clientTotal − cost（cost 為 null → null）；`markupRate` = cost 為 null 或 0 → null，否則 clientTotal ÷ cost；`marginRate` = clientTotal 為 0 或 margin 為 null → null，否則 margin ÷ clientTotal。
- S1 = Σ 計入總計且 `includeInMgmtFee` 的 clientTotal；S2 = Σ 計入總計且不計管銷的 clientTotal（業主直付本來就不計入總計）。
- `mgmtFee` = `roundYuan(S1 × mgmtFeeRate)`；percent 費用的基礎 = S1 + S2，每筆各自 `roundYuan`；`netTotal` = S1 + S2 + mgmtFee + otherFees − discount。
- 稅：exclusive → `tax = roundYuan(netTotal × 0.05)`、`grandTotal = netTotal + tax`；inclusive → `tax = roundYuan(netTotal × 5 ÷ 105)`、`grandTotal = netTotal`。
- `costTotal` = Σ（計入總計 **或** 管銷服務）的最上層項目 cost（null 視為 0）。選配、業主自備、業主直付的成本不計入。
- `itemsMargin` = Σ 計入總計項目的 clientTotal − costTotal；`totalMargin` = netTotal − costTotal；`markupRate`、`marginRate` 以 netTotal 與 costTotal 計算，分母為 0 → null。
- `costSourceSummary`：以計入 costTotal 的最上層項目統計，`settlement`（含 settlement_allocated）、`quote`、`none`（cost 為 null）；`mixed` 來源的項目計入 `quote`。`label` 依序列出非 0 的類別，以「／」連接：`"12 項結算／5 項報價／2 項無成本"`；`isMixed` = 非 0 類別數 ≥ 2。

- [ ] **Step 1: 寫失敗的測試（管銷判定）**

```ts
test("業主直付強制不計入，手動也不能覆寫", () => {
  expect(resolveMgmtFeeInclusion({ tradeIsProxyPurchase: false, tradeDefaultInclude: true, isPaidDirectlyByOwner: true, manualInclude: true }))
    .toEqual({ include: false, source: "owner_direct" });
});
test("代購工種預設不計入，設計師可手動改為計入", () => {
  const base = { tradeIsProxyPurchase: true, tradeDefaultInclude: true, isPaidDirectlyByOwner: false };
  expect(resolveMgmtFeeInclusion({ ...base, manualInclude: null })).toEqual({ include: false, source: "default" });
  expect(resolveMgmtFeeInclusion({ ...base, manualInclude: true })).toEqual({ include: true, source: "manual" });
});
```

- [ ] **Step 2: 寫失敗的測試（項目計算）**

```ts
test("加成率與毛利率：162,000 / 120,000", () => {
  const [r] = computeItems([item({ id: "a", quantity: D(1), clientUnitPrice: D("162000"), costLinks: [{ costItemId: "c", allocationRatio: D(1) }] })],
    new Map([["c", { amount: D("120000"), source: "settlement", date: "2026-01-21" }]]));
  expect(formatMarkup(r.markupRate)).toBe("1.35");
  expect(formatMarginRate(r.marginRate)).toBe("26%");
  expect(r.margin!.toString()).toBe("42000");
});
test("成本為 0 或沒有成本時加成率為 null", () => {
  const [r] = computeItems([item({ id: "a", quantity: D(1), clientUnitPrice: D("2000") })], new Map());
  expect(r.cost).toBeNull(); expect(r.markupRate).toBeNull();
});
test("管銷服務：對客 0 元、有成本 → 毛利為負、毛利率 null", () => {
  const [r] = computeItems([item({ id: "a", quantity: D(1), clientUnitPrice: D(0), isComplimentary: true, costLinks: [{ costItemId: "c", allocationRatio: D(1) }] })],
    new Map([["c", { amount: D("5300"), source: "settlement", date: "2026-01-21" }]]));
  expect(r.margin!.toString()).toBe("-5300"); expect(r.marginRate).toBeNull(); expect(r.countsInTotal).toBe(false);
});
test("母項總價 = 自己的金額 + 有金額的子項", () => {
  const rs = computeItems([
    item({ id: "p", quantity: D(1), clientUnitPrice: D("18000") }),
    item({ id: "c1", parentId: "p", quantity: D(4), clientUnitPrice: D("600") }),
    item({ id: "c2", parentId: "p" }),
  ], new Map());
  expect(rs.find(r => r.id === "p")!.clientTotal.toString()).toBe("20400");
  expect(rs.find(r => r.id === "c1")!.countsInTotal).toBe(false);
});
test("多對一：同一成本項目以比例分給兩個對客項目", () => {
  const costs = new Map([["c", { amount: D("23000"), source: "quote" as const, date: "2025-07-14" }]]);
  const rs = computeItems([
    item({ id: "a", quantity: D(3), clientUnitPrice: D("2500"), costLinks: [{ costItemId: "c", allocationRatio: D("0.5") }] }),
    item({ id: "b", quantity: D(2), clientUnitPrice: D("3000"), costLinks: [{ costItemId: "c", allocationRatio: D("0.5") }] }),
  ], costs);
  expect(rs.map(r => r.cost!.toString())).toEqual(["11500", "11500"]);
});
```

`item(partial)` 為測試內的工廠函式：預設 `parentId: null`、數量與單價 null、所有旗標 false、`includeInMgmtFee: true`、`costLinks: []`。

- [ ] **Step 3: 寫失敗的測試（總計，數字取自盤點報告，不含個資）**

```ts
test("管理費 10%：計入小計 2,156,410 → 215,641，未稅合計 2,372,051", () => {
  const t = computeQuoteTotals({ items: [item({ id: "a", quantity: D(1), clientUnitPrice: D("2156410") })],
    effectiveCosts: new Map(), mgmtFeeRate: D("0.10"), fees: [], discount: D(0), taxMode: "exclusive" });
  expect(t.mgmtFee.toString()).toBe("215641");
  expect(t.netTotal.toString()).toBe("2372051");
  expect(t.tax.toString()).toBe("118603");
  expect(t.grandTotal.toString()).toBe("2490654");
});
test("代購計入 S2、不計管理費；業主直付不計入任何總計", () => {
  const t = computeQuoteTotals({ items: [
      item({ id: "a", quantity: D(1), clientUnitPrice: D("100000") }),
      item({ id: "b", quantity: D(1), clientUnitPrice: D("40743"), includeInMgmtFee: false }),
      item({ id: "c", quantity: D(1), clientUnitPrice: D("69500"), includeInMgmtFee: false, isPaidDirectlyByOwner: true }),
    ], effectiveCosts: new Map(), mgmtFeeRate: D("0.10"), fees: [], discount: D(0), taxMode: "exclusive" });
  expect([t.s1, t.s2, t.mgmtFee, t.netTotal].map(String)).toEqual(["100000", "40743", "10000", "150743"]);
});
test("折讓不影響管理費；內含稅只顯示稅額", () => {
  const t = computeQuoteTotals({ items: [item({ id: "a", quantity: D(1), clientUnitPrice: D("105000") })],
    effectiveCosts: new Map(), mgmtFeeRate: D("0.10"), fees: [], discount: D("5500"), taxMode: "inclusive" });
  expect(t.mgmtFee.toString()).toBe("10500");
  expect(t.netTotal.toString()).toBe("110000");
  expect(t.tax.toString()).toBe("5238");
  expect(t.grandTotal.toString()).toBe("110000");
});
test("追減的 .5 邊界：-11542.5 → -11543", () => {
  const t = computeQuoteTotals({ items: [item({ id: "a", quantity: D("-17.1"), clientUnitPrice: D("675") })],
    effectiveCosts: new Map(), mgmtFeeRate: D("0.10"), fees: [], discount: D(0), taxMode: "exclusive" });
  expect(t.s1.toString()).toBe("-11543");
});
test("成本來源統計：混用時顯示提示", () => {
  const costs = new Map([
    ["c1", { amount: D("100"), source: "settlement" as const, date: "2026-01-21" }],
    ["c2", { amount: D("100"), source: "quote" as const, date: "2025-07-14" }],
  ]);
  const t = computeQuoteTotals({ items: [
      item({ id: "a", quantity: D(1), clientUnitPrice: D("200"), costLinks: [{ costItemId: "c1", allocationRatio: D(1) }] }),
      item({ id: "b", quantity: D(1), clientUnitPrice: D("200"), costLinks: [{ costItemId: "c2", allocationRatio: D(1) }] }),
      item({ id: "c", quantity: D(1), clientUnitPrice: D("200") }),
    ], effectiveCosts: costs, mgmtFeeRate: D("0.10"), fees: [], discount: D(0), taxMode: "exclusive" });
  expect(t.costSourceSummary.label).toBe("1 項結算／1 項報價／1 項無成本");
  expect(t.costSourceSummary.isMixed).toBe(true);
});
test("管銷服務的成本計入總成本", () => {
  const t = computeQuoteTotals({ items: [
      item({ id: "a", quantity: D(1), clientUnitPrice: D("1000"), costLinks: [{ costItemId: "c1", allocationRatio: D(1) }] }),
      item({ id: "b", quantity: D(1), clientUnitPrice: D(0), isComplimentary: true, costLinks: [{ costItemId: "c2", allocationRatio: D(1) }] }),
    ], effectiveCosts: new Map([
      ["c1", { amount: D("700"), source: "quote" as const, date: "2025-07-14" }],
      ["c2", { amount: D("100"), source: "quote" as const, date: "2025-07-14" }],
    ]), mgmtFeeRate: D("0.10"), fees: [], discount: D(0), taxMode: "exclusive" });
  expect(t.costTotal.toString()).toBe("800");
});
```

- [ ] **Step 4: 執行測試確認失敗**

Run: `npx vitest run tests/domain/pricing`
Expected: FAIL，`mgmt-fee`、`item`、`totals` 模組不存在（Task 3 的測試仍 PASS）

- [ ] **Step 5: 依「規則」實作三個模組**

- [ ] **Step 6: 執行測試確認通過**

Run: `npx vitest run tests/domain/pricing && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain/pricing tests/domain/pricing
git commit -m "feat: 報價項目計算、管銷判定與報價單總計"
```

---

### Task 5: 欄位加密與盲索引

**Files:**
- Create: `src/lib/crypto/field-encryption.ts`、`src/lib/crypto/blind-index.ts`
- Test: `tests/lib/crypto/field-encryption.test.ts`、`tests/lib/crypto/blind-index.test.ts`

**Interfaces:**
- Consumes: Task 1 `getServerEnv()`（`FIELD_ENCRYPTION_KEY`、`BLIND_INDEX_KEY`）。
- Produces：`encryptField(plaintext: string, key?: Buffer): string`，輸出格式 `v1:<iv base64>:<authTag base64>:<ciphertext base64>`（iv 12 bytes，每次隨機）；`decryptField(payload: string, key?: Buffer): string`（格式錯誤、竄改、金鑰錯誤皆拋錯）；`blindIndex(kind: "phone" | "email" | "national_id", value: string, key?: Buffer): string`（HMAC-SHA256，hex）。`key` 參數僅供測試注入，正式環境由 env 取得。
- 正規化：phone 只保留數字；email trim + 小寫；national_id trim + 大寫。

- [ ] **Step 1: 寫失敗的測試**

```ts
const key = Buffer.alloc(32, 7);
test("中文往返加解密", () => {
  expect(decryptField(encryptField("台北市大安區某路一段1號5樓", key), key)).toBe("台北市大安區某路一段1號5樓");
});
test("同一明文兩次加密結果不同（隨機 IV）", () => {
  expect(encryptField("0912345678", key)).not.toBe(encryptField("0912345678", key));
});
test("竄改密文或用錯金鑰時拋錯", () => {
  const p = encryptField("secret", key).split(":");
  p[3] = Buffer.from("tampered").toString("base64");
  expect(() => decryptField(p.join(":"), key)).toThrow();
  expect(() => decryptField(encryptField("secret", key), Buffer.alloc(32, 8))).toThrow();
});
test("盲索引：電話格式不同但號碼相同時結果相同", () => {
  expect(blindIndex("phone", "0912-345-678", key)).toBe(blindIndex("phone", "0912345678", key));
  expect(blindIndex("email", " A@Example.com ", key)).toBe(blindIndex("email", "a@example.com", key));
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/lib/crypto`
Expected: FAIL，模組不存在

- [ ] **Step 3: 用 Node `crypto`（`aes-256-gcm`、`createHmac("sha256")`）實作**

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/lib/crypto`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto tests/lib/crypto
git commit -m "feat: AES-256-GCM 欄位加密與盲索引"
```

---

### Task 6: 多租戶資料庫結構與 RLS

**前置：** 啟動 Docker Desktop（目前已安裝但未啟動），確認 `docker info` 能正常回應。

**Files:**
- Create: `supabase/config.toml`（`npx supabase init`）、`drizzle.config.ts`、`src/db/client.ts`
- Create: `src/db/schema/tenancy.ts`（organizations、memberships、project_members、audit_logs）、`master.ts`（trades、units、catalog_items、vendors）、`projects.ts`（clients、projects）、`quotes.ts`（quotes、quote_versions、quote_sections、quote_items、quote_fees）、`costs.ts`（vendor_documents、cost_items、cost_prices、cost_adjustments、quote_item_cost_links）、`index.ts`
- Create: `supabase/migrations/<timestamp>_init.sql`（drizzle-kit 產生）、`supabase/migrations/<timestamp>_rls.sql`（`npx drizzle-kit generate --custom --name rls`，手寫）
- Create: `supabase/seed.sql`（虛構資料：2 家公司「甲設計」「乙設計」、各 1 位 admin、甲公司 1 位 designer 與 1 位 supervisor、2 個虛構案場）
- Test: `supabase/tests/rls.test.sql`

**Interfaces:**
- Consumes: 架構計畫 §3 的欄位定義（本計畫不建 omission_rules、checklist_decisions、import_*、project_files，留給後續計畫）。
- Produces：Drizzle schema 物件（`organizations`、`memberships`…，名稱與資料表同名的 camelCase）；`db`（`src/db/client.ts`，使用 `DATABASE_URL`）。
- Produces（SQL，schema `app`）：
  - `app.org_role(org uuid) returns text` — 目前使用者在該公司的角色，無則 null（`security definer`、`stable`）
  - `app.is_project_member(project uuid) returns boolean` — 是 `project_members` 成員，**或**是該公司 admin
  - `app.can_view_cost(project uuid) returns boolean` — 案場成員且角色為 admin 或 designer，且 `memberships.can_view_cost = true`
- 欄位型別：所有主鍵 `uuid default gen_random_uuid()`；金額 `numeric(14,0)`、單價與數量 `numeric(14,2)`、比例 `numeric(7,6)`；加密欄位 `text`（存 `encryptField` 輸出），盲索引 `text` 並建索引；`organization_id uuid not null`，外鍵指向 organizations。
- `drizzle.config.ts`：`dialect: "postgresql"`、`schema: "./src/db/schema"`、`out: "./supabase/migrations"`、`migrations: { prefix: "supabase" }`。

**RLS 規則：**

| 資料表 | select | insert / update / delete |
|---|---|---|
| organizations | `app.org_role(id) is not null` | 僅 admin |
| memberships | 同公司成員 | 僅 admin |
| projects、quote_sections | `app.is_project_member(project_id)` | 案場成員且角色 admin / designer |
| quotes、quote_versions、quote_items、quote_fees（含金額欄位） | 案場成員且角色 admin / designer | 同左 |
| `quote_items_scope`（view，`security_invoker = false`、`security_barrier`；只含 id、project_id、section_id、parent_id、sort、name、unit_name、quantity、spec、note） | `app.is_project_member(project_id)` | 唯讀 |
| clients | 經由 projects.client_id 關聯的案場，且角色 admin / designer | 同左 |
| vendor_documents、cost_items、cost_prices、cost_adjustments、quote_item_cost_links | `app.can_view_cost(project_id)` | 同左 |
| trades、units、catalog_items、vendors | 同公司成員 | admin / designer |
| audit_logs | 僅 admin | insert：同公司成員；**不允許 update / delete** |

沒有 `project_id` 欄位的子表（quote_sections、quote_items 等）一律冗餘存放 `project_id`，讓 policy 不需多層 join；由 trigger 檢查其與父表一致。

- [ ] **Step 1: 寫失敗的 pgTAP 測試**

`supabase/tests/rls.test.sql`：使用 seed 中的虛構使用者，以 `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'` 切換身分。斷言：

```sql
select plan(9);
-- 乙公司 admin 看不到甲公司任何案場
select is((select count(*) from projects where organization_id = :'org_a'), 0::bigint, '跨租戶讀不到案場');
-- 甲公司 designer 只看得到被指派的案場（seed：指派 1 個、未指派 1 個）
select is((select count(*) from projects), 1::bigint, '未指派的案場讀不到');
-- 甲公司 supervisor（被指派到案場）讀不到成本與業主資料
select is((select count(*) from cost_prices), 0::bigint, '監工讀不到成本');
select is((select count(*) from clients), 0::bigint, '監工讀不到業主資料');
select is((select count(*) from quote_items), 0::bigint, '監工讀不到含金額的報價項目');
select isnt_empty('select 1 from quote_items_scope', '監工讀得到施工範圍（無金額欄位）');
-- 移出案場後立即讀不到
delete from project_members where user_id = :'designer_a';   -- 以 admin 身分執行
select is((select count(*) from projects), 0::bigint, '移出案場後讀不到');
-- audit_logs 不能改、不能刪
select throws_ok($$ update audit_logs set action = 'x' $$, null, 'audit_logs 不可修改');
select throws_ok($$ delete from audit_logs $$, null, 'audit_logs 不可刪除');
select * from finish();
```

（切換身分的細節依 pgTAP 慣例寫在各段 `set local` 之前；`:'org_a'` 等以 seed 中固定的虛構 UUID 取代。）

- [ ] **Step 2: 啟動本機 Supabase 並執行測試確認失敗**

Run: `npx supabase start && npx supabase test db`
Expected: FAIL，資料表不存在

- [ ] **Step 3: 撰寫 Drizzle schema，產生 init 遷移**

Run: `npx drizzle-kit generate --name init`
Expected: `supabase/migrations/` 產生時間戳記開頭的 init SQL

- [ ] **Step 4: 撰寫自訂 RLS 遷移**

內容：`create schema app`、三個輔助函式、所有資料表 `enable row level security` 與上表 policy、`quote_items_scope` view（`where app.is_project_member(project_id)`）、`project_id` 一致性 trigger、audit_logs 的 update / delete 以 policy 不允許加上 `revoke update, delete`。

- [ ] **Step 5: 重建資料庫並執行測試**

Run: `npx supabase db reset && npx supabase test db`
Expected: 9 個測試全部 PASS

- [ ] **Step 6: Commit**

```bash
git add supabase drizzle.config.ts src/db
git commit -m "feat: 多租戶資料庫結構、RLS policy 與 pgTAP 測試"
```

---

### Task 7: 登入、Session 逾時、權限矩陣與稽核紀錄

**Files:**
- Create: `src/lib/supabase/server.ts`、`src/lib/supabase/client.ts`（`@supabase/ssr`）、`src/middleware.ts`
- Create: `src/lib/auth/permissions.ts`、`src/lib/audit.ts`
- Create: `src/app/(auth)/login/page.tsx`、`src/app/(auth)/login/actions.ts`、`src/app/(app)/layout.tsx`、`src/app/(app)/page.tsx`、`src/app/(app)/settings/security/page.tsx`（TOTP 啟用，可選）
- Modify: `supabase/config.toml`（密碼最短 10 碼、登入速率限制 `sign_in_sign_ups = 10`（每 5 分鐘每 IP）、啟用 MFA TOTP）
- Test: `tests/lib/auth/permissions.test.ts`

**Interfaces:**
- Consumes: Task 1 `getServerEnv().SESSION_IDLE_MINUTES`；Task 6 的 `memberships`、`audit_logs`。
- Produces：
  ```ts
  type Role = "admin" | "designer" | "supervisor";
  type Action = "project:view" | "project:edit" | "client:view_pii" | "cost:view" | "price:view_unit" | "price:view_total"
              | "rules:manage" | "users:manage" | "retention:manage";
  interface MemberPerms { role: Role; canViewCost: boolean; canViewUnitPrice: boolean; isProjectMember: boolean }
  can(m: MemberPerms, action: Action): boolean
  writeAudit(e: { action: AuditAction; targetType: string; targetId: string | null; metadata?: Record<string, string | number | boolean> }): Promise<void>
  type AuditAction = "auth.login" | "auth.logout" | "auth.login_failed" | "client.view_pii" | "pdf.export" | "price.update" | "record.delete" | "permission.change";
  ```
- `can` 是畫面顯示用的同步判斷；**真正的存取控制仍由 Task 6 的 RLS 執行**，兩者規則必須一致。

**權限矩陣：**

| Action | admin | designer | supervisor |
|---|---|---|---|
| project:view | ✅ | 案場成員 | 案場成員 |
| project:edit | ✅ | 案場成員 | ❌ |
| client:view_pii | ✅ | 案場成員 | ❌ |
| cost:view | ✅ | 案場成員且 canViewCost | ❌ |
| price:view_unit | ✅ | 案場成員且 canViewUnitPrice | ❌ |
| price:view_total | ✅ | 案場成員 | ❌ |
| rules:manage、users:manage、retention:manage | ✅ | ❌ | ❌ |

- [ ] **Step 1: 寫失敗的測試**

```ts
const m = (p: Partial<MemberPerms>): MemberPerms => ({ role: "designer", canViewCost: true, canViewUnitPrice: true, isProjectMember: true, ...p });
test("監工看不到成本、業主個資、預算", () => {
  for (const a of ["cost:view", "client:view_pii", "price:view_total", "price:view_unit"] as const)
    expect(can(m({ role: "supervisor" }), a)).toBe(false);
  expect(can(m({ role: "supervisor" }), "project:view")).toBe(true);
});
test("設計師未被指派到案場時什麼都看不到", () => {
  expect(can(m({ isProjectMember: false }), "project:view")).toBe(false);
});
test("「看單價」與「只看總價」可個別設定", () => {
  expect(can(m({ canViewUnitPrice: false }), "price:view_unit")).toBe(false);
  expect(can(m({ canViewUnitPrice: false }), "price:view_total")).toBe(true);
});
test("只有 admin 能管理規則、使用者、保存年限", () => {
  expect(can(m({}), "rules:manage")).toBe(false);
  expect(can(m({ role: "admin", isProjectMember: false }), "users:manage")).toBe(true);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run tests/lib/auth`
Expected: FAIL，模組不存在

- [ ] **Step 3: 實作 `can()`，依上方矩陣**

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run tests/lib/auth`
Expected: PASS

- [ ] **Step 5: 實作登入流程與 Session 逾時**

- 登入頁：Email + 密碼表單（shadcn `Input`、`Button`），錯誤訊息統一為「帳號或密碼錯誤」（不透露帳號是否存在）。成功寫 `auth.login`、失敗寫 `auth.login_failed`（metadata 只放 email 的 `blindIndex`，不放明文）。
- `middleware.ts`：以 `@supabase/ssr` 更新 session；cookie `last_activity` 記錄最後活動時間，超過 `SESSION_IDLE_MINUTES` 未活動即登出並導向 `/login?reason=idle`，登入頁顯示「閒置過久，已自動登出」。
- `(app)/layout.tsx`：未登入導向 `/login`。
- 安全設定頁：啟用／停用 TOTP（Supabase `mfa.enroll`、`mfa.challengeAndVerify`），已啟用者登入後需輸入 6 位數驗證碼（`inputMode="numeric"`）。

- [ ] **Step 6: 本機手動驗證**

Run: `npx supabase db reset && npm run dev`
Expected：
1. 用 seed 中的虛構帳號登入成功，進入首頁。
2. 錯誤密碼顯示「帳號或密碼錯誤」，`audit_logs` 出現 `auth.login_failed`。
3. 把 `SESSION_IDLE_MINUTES` 暫設為 1，閒置 1 分鐘後重新整理 → 導回登入頁並顯示閒置訊息。
4. 安全設定頁可啟用 TOTP，重新登入時要求驗證碼。

- [ ] **Step 7: 完整驗證**

Run: `npm test && npm run typecheck && npm run lint && npx supabase test db`
Expected: 全部通過

- [ ] **Step 8: Commit**

```bash
git add -A
git status   # 再次確認 data/legacy/ 不在清單中
git commit -m "feat: 登入、Session 逾時、TOTP、權限矩陣與稽核紀錄"
```

---

## 後續計畫（本計畫完成後撰寫）

| 計畫 | 內容（對應架構計畫 §5） |
|---|---|
| 2 | 主檔（工種、單位、品項、廠商）與案場管理（任務 6、7） |
| 3 | 報價單編輯器與成本面板（任務 8） |
| 4 | 防漏項規則引擎與送出前檢查清單（任務 9） |
| 5 | 版本凍結、版本比較與 PDF 匯出（任務 10、11） |
| 6 | 歷史價格查詢（任務 12） |
