"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TradeRow } from "@/server/master/trades";
import { CheckboxField, Field, FormFooter, fieldErrorsOf } from "@/components/form/form-parts";
import { FormSheet } from "../_components/form-sheet";
import { RowActions } from "../_components/row-actions";
import { deleteTradeAction, moveTradeAction, saveTradeAction } from "./actions";

function TradeForm({ trade, nextSort, onDone }: { trade: TradeRow | null; nextSort: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveTradeAction, null);
  const [name, setName] = useState(trade?.name ?? "");
  const [sort, setSort] = useState(String(trade?.sort ?? nextSort));
  const [isProxy, setIsProxy] = useState(trade?.isProxyPurchase ?? false);
  const [includeMgmt, setIncludeMgmt] = useState(trade?.defaultIncludeInMgmtFee ?? true);
  const errors = fieldErrorsOf(state);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-5">
      {trade && <input type="hidden" name="id" value={trade.id} />}
      <Field label="工種名稱" htmlFor="trade-name" error={errors.name}>
        <Input id="trade-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />
      </Field>
      <Field label="排序" htmlFor="trade-sort" error={errors.sort} hint="數字越小越前面（0～9999）。">
        <Input
          id="trade-sort"
          name="sort"
          inputMode="numeric"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        />
      </Field>
      <div className="space-y-4">
        <CheckboxField
          id="trade-proxy"
          name="isProxyPurchase"
          checked={isProxy}
          onChange={(v) => {
            setIsProxy(v);
            if (v) setIncludeMgmt(false);
          }}
          label="代購工種"
          description="代購項目由公司代收代付，預設不計入工程管理費。"
        />
        <CheckboxField
          id="trade-mgmt"
          name="defaultIncludeInMgmtFee"
          checked={includeMgmt}
          onChange={setIncludeMgmt}
          label="預設計入管銷"
          description="新增報價項目時，是否預設計入工程管理費的計算基礎。"
        />
        {errors.defaultIncludeInMgmtFee && (
          <p role="alert" className="text-xs text-destructive">
            {errors.defaultIncludeInMgmtFee}
          </p>
        )}
      </div>
      <FormFooter state={state} pending={pending} onCancel={onDone} />
    </form>
  );
}

function TradeBadges({ trade }: { trade: TradeRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {trade.isProxyPurchase && <Badge variant="secondary">代購・不計管銷</Badge>}
      {!trade.isProxyPurchase && !trade.defaultIncludeInMgmtFee && <Badge variant="outline">預設不計管銷</Badge>}
    </div>
  );
}

export function TradesManager({ trades, canEdit }: { trades: TradeRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<TradeRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setEditing(null);
  const nextSort = (trades.at(-1)?.sort ?? 0) + 10;

  const actions = (t: TradeRow, i: number) => (
    <RowActions
      name={t.name}
      onEdit={() => setEditing(t)}
      onDelete={() => deleteTradeAction(t.id)}
      onMove={(d) => moveTradeAction(t.id, d)}
      isFirst={i === 0}
      isLast={i === trades.length - 1}
      onError={setError}
    />
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">共 {trades.length} 個工種</p>
        {canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> 新增工種
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {trades.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">尚無工種</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">排序</TableHead>
                  <TableHead>名稱</TableHead>
                  <TableHead>管銷設定</TableHead>
                  {canEdit && <TableHead className="w-48 text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((t, i) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">{t.sort}</TableCell>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <TradeBadges trade={t} />
                    </TableCell>
                    {canEdit && <TableCell>{actions(t, i)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {trades.map((t, i) => (
              <li key={t.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <p className="font-medium">{t.name}</p>
                        <TradeBadges trade={t} />
                      </div>
                      <span className="text-xs text-muted-foreground">排序 {t.sort}</span>
                    </div>
                    {canEdit && actions(t, i)}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {canEdit && (
        <FormSheet
          open={editing !== null}
          onOpenChange={(o) => !o && close()}
          title={editing === "new" ? "新增工種" : "編輯工種"}
        >
          {editing !== null && (
            <TradeForm
              key={editing === "new" ? "new" : editing.id}
              trade={editing === "new" ? null : editing}
              nextSort={nextSort}
              onDone={close}
            />
          )}
        </FormSheet>
      )}
    </section>
  );
}
