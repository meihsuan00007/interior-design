# 共用元件與工具清單（開發前必讀）

> **用途**：新的 Claude Code session 在新增或修改畫面前，先讀這份文件（或 grep 關鍵字），確認已經有的元件，**不要再寫一套新的**。
> 新增任何共用元件、工具函式或顯示用的標籤對照表時，**必須同步更新本文件**（含「搜尋關鍵字」欄）。
>
> 使用者不寫程式、只透過 Claude Code 修改，所以一致性只能靠這份清單維持。

最後更新：2026-10-20（計畫 2：主檔與案場）

---

## 0. 快速對照：要做 X，用哪個

| 要做的事 | 用這個 | 檔案 |
|---|---|---|
| 按鈕 | `Button` | [src/components/ui/button.tsx](../src/components/ui/button.tsx) |
| 標籤／徽章（小色塊文字） | `Badge`；案場狀態用 `StatusBadge` | [badge.tsx](../src/components/ui/badge.tsx)、[status-badge.tsx](../src/app/(app)/projects/status-badge.tsx) |
| 確認視窗（刪除、移除等危險操作） | `ConfirmDialog` | [src/app/(app)/projects/[id]/confirm.tsx](../src/app/(app)/projects/[id]/confirm.tsx) |
| 列表每列的「上移／下移／編輯／刪除」 | `RowActions`（內含刪除確認視窗） | [src/app/(app)/master/_components/row-actions.tsx](../src/app/(app)/master/_components/row-actions.tsx) |
| 新增／編輯表單的側欄（桌機右側滑出、手機下方滑出） | `FormSheet` | [src/app/(app)/master/_components/form-sheet.tsx](../src/app/(app)/master/_components/form-sheet.tsx) |
| 表單欄位（標題＋輸入框＋提示＋錯誤） | `Field` | [src/components/form/form-parts.tsx](../src/components/form/form-parts.tsx) |
| 表單底部「取消／儲存」＋整體錯誤訊息 | `FormFooter` | 同上 |
| 下拉選單（可含「未指定」） | `SelectField` | 同上 |
| 勾選框（含說明文字） | `CheckboxField` | 同上 |
| 從伺服器結果取出各欄位錯誤 | `fieldErrorsOf(state)` | 同上 |
| 文字輸入框／多行輸入 | `Input`／`Textarea` | [src/components/ui/](../src/components/ui/) |
| 表格（桌機） | `Table` 系列 | [table.tsx](../src/components/ui/table.tsx) |
| 卡片（手機版列表每一筆） | `Card`、`CardContent` | [card.tsx](../src/components/ui/card.tsx) |
| 分頁籤 | `Tabs`；主檔頁籤用 `MasterTabs` | [tabs.tsx](../src/components/ui/tabs.tsx)、[master/_components/tabs.tsx](../src/app/(app)/master/_components/tabs.tsx) |
| 頁面淡入／列表依序出現 | `FadeIn`、`ListItem` | [src/components/motion/](../src/components/motion/) |
| 判斷桌機或手機 | `useIsDesktop()` | [master/_components/use-is-desktop.ts](../src/app/(app)/master/_components/use-is-desktop.ts) |
| 金額顯示（千分位、加成率、毛利率） | `formatTWD`、`formatMarkup`、`formatMarginRate` | [src/lib/money/format.ts](../src/lib/money/format.ts) |
| 金額運算 | `D()`、`roundYuan()`、`sum()`（禁止浮點數） | [src/lib/money/decimal.ts](../src/lib/money/decimal.ts) |
| 伺服器寫入動作（新增／修改／刪除） | `runWrite()`；主檔用 `runMasterWrite()` | [src/server/actions.ts](../src/server/actions.ts)、[src/server/master/action.ts](../src/server/master/action.ts) |
| 權限判斷（畫面顯示用） | `can(member, action)` | [src/lib/auth/permissions.ts](../src/lib/auth/permissions.ts) |
| 寫稽核紀錄 | `writeAudit()` | [src/lib/audit.ts](../src/lib/audit.ts) |
| 業主個資加密／解密／遮罩 | `encryptClientPii`、`revealClientContact`、`maskPhone` | [src/server/pii.ts](../src/server/pii.ts) |
| 搜尋時跳脫 `%`、`_` | `escapeLike()` | [src/lib/escape-like.ts](../src/lib/escape-like.ts) |
| 合併 CSS class | `cn()` | [src/lib/utils.ts](../src/lib/utils.ts) |

---

## 1. 基礎元件（`src/components/ui/`，shadcn）

**搜尋關鍵字**：button, btn, 按鈕, badge, tag, chip, 標籤, 徽章, dialog, modal, popup, 彈窗, 對話框, sheet, drawer, 側欄, 抽屜, input, textarea, 輸入框, label, select, dropdown, 下拉, table, 表格, card, 卡片, tabs, 頁籤

- 這一層是 shadcn 產生的原始元件，**不要直接改它的樣式**來做特例；要特例就在使用處用 `className` 覆寫，或在上一層包一個元件。
- 需要新的 shadcn 元件（例如 Tooltip、Popover）時，用 `npx shadcn add <名稱>` 加入此資料夾，並在本文件登記。

### Button 的變體（`variant`）與使用時機

| variant | 外觀 | 用在 |
|---|---|---|
| `default` | 實心主色 | 頁面主要動作：「新增工種」「新增案場」「儲存」 |
| `outline` | 外框 | 次要動作：「取消」「編輯」（頁首）「登出」 |
| `ghost` | 無底色 | 表格列裡的小圖示按鈕（上移、下移、編輯、刪除） |
| `destructive` | 淡紅底紅字 | 確認視窗裡的「確定刪除」「移除」 |
| `secondary`、`link` | — | 目前未使用；要用前先想是否真的需要 |

`size`：一般用預設；圖示按鈕用 `icon`；手機頂部列用 `sm`。
按鈕裡放圖示的寫法：`<Button><Plus /> 新增工種</Button>`（圖示來自 `lucide-react`）。
按鈕當連結用：`<Button asChild><Link href="...">…</Link></Button>`。

### Badge 的使用慣例

- 案場狀態一律用 `StatusBadge`（顏色已依狀態定義），不要自己再配色。
- 屬性提示（例如工種「代購・不計管銷」）用 `variant="secondary"`；較弱的提示（「預設不計管銷」）用 `variant="outline"`。
- 角色標籤（管理者／設計師／監工）用 `variant="secondary"`。

---

## 2. 表單（`src/components/form/form-parts.tsx`）

**搜尋關鍵字**：form, field, 表單, 欄位, FormFooter, 儲存, 取消, SelectField, 下拉, CheckboxField, 勾選, checkbox, fieldErrors, 錯誤訊息

標準表單寫法（參考 [master/trades/view.tsx](../src/app/(app)/master/trades/view.tsx) 的 `TradeForm`）：

1. `const [state, action, pending] = useActionState(伺服器動作, null);`
2. 每個欄位用 `<Field label="…" htmlFor="…" error={errors.欄位名} hint="…">` 包住 `Input`／`SelectField`。
3. 結尾放 `<FormFooter state={state} pending={pending} onCancel={…} />`，它會顯示整體錯誤並提供「取消／儲存」（送出中顯示「儲存中…」）。
4. `state?.ok` 為真時關閉側欄（`useEffect`）。

> ⚠️ **已知不一致**：案場詳情的「選擇要加入的成員」、「檔案類型」與公司切換 `OrgSwitcher` 用的是瀏覽器原生 `<select>`（class `h-10 rounded-lg border bg-background px-2 text-sm`），不是 `SelectField`。新畫面一律用 `SelectField`；原生 `<select>` 只在不送表單、選了就立即執行的情境下沿用。

伺服器端讀表單值用 `formString`、`formBool`、`formNullable`、`formInt`（[src/server/actions.ts](../src/server/actions.ts)），驗證失敗回傳 `validationFailure(zodError)`。

---

## 3. 視窗與側欄

**搜尋關鍵字**：modal, dialog, confirm, 確認, 刪除確認, 彈窗, sheet, drawer, 側欄, 新增視窗, 編輯視窗

| 元件 | 用途 | 備註 |
|---|---|---|
| `FormSheet` | 新增／編輯表單 | 桌機右側滑出、手機下方滑出；描述文字預設「填寫後按「儲存」。」 |
| `ConfirmDialog` | 危險操作確認 | 參數：`title`、`description`、`confirmLabel`、`pending`、`error`、`onConfirm`；按鈕「取消」＋紅色確認鈕（處理中顯示「處理中…」） |
| `RowActions` | 列表列操作 | 內建刪除確認視窗，文案固定為「確定要刪除「名稱」？／刪除後無法復原，並會留下稽核紀錄。」 |

> ⚠️ **已知重複（待整併）**：`RowActions` 內自己寫了一份刪除確認視窗，與 `ConfirmDialog` 結構相同。之後改動任一個時，應改成 `RowActions` 內部使用 `ConfirmDialog`。
> ⚠️ **位置待調整**：`FormSheet`、`RowActions`、`useIsDesktop` 放在 `master/_components/`，`ConfirmDialog` 放在 `projects/[id]/`，但它們已是全站共用性質。若其他功能（例如報價單）要用，**先把它們搬到 `src/components/`**，再更新本文件路徑，不要複製一份。

---

## 4. 版面與頁面結構慣例

**搜尋關鍵字**：layout, page, 版面, 頁首, header, 標題, 空狀態, empty, 錯誤提示, error banner, alert, 列表, list, 手機版, mobile, RWD

### 應用外框（`src/components/app-shell/`）
- `AppShell`：桌機左側導覽 `DesktopNav`、手機頂部列 `MobileTopBar`＋底部導覽 `MobileNav`。
- 新增主選單項目時，**桌機與手機兩邊都要改**（`nav.tsx` 的 `items`、`mobile-nav.tsx` 的 `Tab`）。
- `OrgSwitcher`：屬於多家公司的使用者才會出現的公司切換下拉。

### 頁面骨架
- 頁面最外層：`<main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-6 md:py-8">`（詳情頁用 `max-w-4xl`）。
- 頁首：左邊 `<h1 className="text-2xl font-semibold tracking-tight">`，右邊主要動作按鈕。
- 列表頁：**桌機用 `Table`（`hidden md:block`）、手機用 `Card` 清單（`md:hidden`）**，兩者都要做。
- 列表項目要依序淡入時用 `ListItem`（`as="tr"` 給表格列）。

### 重複出現但尚未抽成元件的樣式（新寫時沿用相同 class，或順手抽成元件）
| 樣式 | class | 出現處 |
|---|---|---|
| 錯誤提示框 | `role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"` | 8 個檔案（主檔四頁、表單、確認視窗等） |
| 空狀態文字 | `className="py-12 text-center text-sm text-muted-foreground"`（案場列表為 `py-16`） | 主檔四頁、案場列表 |
| 欄位小錯誤 | `role="alert" className="text-xs text-destructive"` | `Field`、工種表單 |
| 篩選膠囊（chip） | 見 [projects/page.tsx](../src/app/(app)/projects/page.tsx) 的 `CHIPS` | 只在案場列表 |

> 若要新增第三種以上用法，建議抽成 `ErrorAlert`、`EmptyState` 放到 `src/components/`，並登記於此。

---

## 5. 顯示用標籤對照表（中文名稱）

**搜尋關鍵字**：label, 標籤對照, 中文名稱, 狀態名稱, status label, 角色名稱, role label, 屋況, 計價方式

| 對照表 | 內容 | 位置 |
|---|---|---|
| `PROJECT_STATUS_LABEL` | 案場狀態中文名 | [src/db/schema/projects.ts](../src/db/schema/projects.ts) |
| `PRICING_METHOD_LABEL`／`PRICING_METHOD_OPTIONS` | 計價方式（單價 × 數量、按坪數、一式…） | [src/lib/pricing-method.ts](../src/lib/pricing-method.ts) |
| `ROLE_LABEL` | 管理者／設計師／監工 | ⚠️ 目前只寫在 [projects/[id]/members.tsx](../src/app/(app)/projects/[id]/members.tsx) |
| `FILE_KIND_LABEL`／`FILE_KINDS` | 檔案類型（平面圖、現場照片、渲染圖、圖說、其他） | [src/lib/project-files.ts](../src/lib/project-files.ts) |
| 屋況（新成屋／中古屋／老屋） | — | ⚠️ **重複兩處**：[projects/form.tsx](../src/app/(app)/projects/form.tsx) 與 [projects/[id]/page.tsx](../src/app/(app)/projects/[id]/page.tsx) 的 `CONDITION_LABEL` |

> ⚠️ 規則：新的中文標籤對照表放在 `src/lib/`（不可匯入資料庫 schema，讓前端元件能用），**不要在頁面裡各寫一份**。`ROLE_LABEL` 與屋況標籤下次修改時應搬到 `src/lib/`。

---

## 6. 金額與數字

**搜尋關鍵字**：money, 金額, 千分位, TWD, 新台幣, decimal, 加成率, markup, 毛利率, margin, 四捨五入, round

- 一律使用 `src/lib/money/`：`D("123.5")` 建立、`roundYuan` 四捨五入到元、`formatTWD` 千分位。
- `D()` 不接受小數的 JS number，必須用字串，防止浮點數誤差。
- 加成率顯示 `formatMarkup`（`1.35`），毛利率顯示 `formatMarginRate`（`26%`），無法計算時兩者都顯示「—」（CLAUDE.md D1）。
- 計價核心邏輯在 [src/domain/pricing/](../src/domain/pricing/)（管理費、總計、採用成本），**不要在畫面裡重算**。

---

## 7. 伺服器端共用

**搜尋關鍵字**：server action, 伺服器動作, runWrite, 權限, permission, role, 角色, audit, 稽核, 個資, PII, 加密, encrypt, 遮罩, mask, context, 目前公司, current org

- 寫入動作一律走 `runWrite({ revalidate, roles, label }, fn)`：自動處理登入、目前公司（從 cookie，不信任表單傳來的公司 id）、角色檢查、錯誤轉成中文訊息。
- 可顯示給使用者的錯誤丟 `UserError`（主檔用 `MasterError`）。
- 資料庫錯誤轉友善訊息：`throwDbError`、`assertAffected`（[src/server/master/common.ts](../src/server/master/common.ts)）。
- 刪除前先寫稽核：`auditBeforeDelete`／`auditThenRpc`。
- 上下排序：`moveSortable`；跨表參照檢查：`verifyRefs`。
- 讀目前登入者與公司：`getAppContext()`、`getCurrentOrgFromCookie(ctx)`（[src/server/context.ts](../src/server/context.ts)）。
- `can()` 只是畫面顯示用，真正的權限由資料庫 RLS 強制，兩者規則必須一致。

---

## 8. 動畫

**搜尋關鍵字**：animation, motion, 動畫, 淡入, fade, stagger

- 換頁淡入已由 [src/app/(app)/template.tsx](../src/app/(app)/template.tsx) 統一處理，頁面不用再包 `FadeIn`。
- 列表依序出現用 `ListItem`（間隔 30ms、只對前 20 筆）。常數在 [stagger.ts](../src/components/motion/stagger.ts)。
- 動畫用 CSS（`.fade-in`），不引入動畫函式庫。
