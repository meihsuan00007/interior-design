"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PRICING_METHOD_LABEL, PRICING_METHOD_OPTIONS } from "@/lib/pricing-method";
import type { CatalogItemRow } from "@/server/master/catalog";
import { Field, FormFooter, SelectField, fieldErrorsOf } from "../_components/form-parts";
import { FormSheet } from "../_components/form-sheet";
import { RowActions } from "../_components/row-actions";
import { deleteCatalogItemAction, saveCatalogItemAction } from "./actions";

interface Option {
  id: string;
  name: string;
}

interface Lookups {
  trades: Option[];
  units: Option[];
  vendors: Option[];
}

const toOptions = (list: Option[]) => list.map((o) => ({ value: o.id, label: o.name }));

function CatalogForm({ item, lookups, onDone }: { item: CatalogItemRow | null; lookups: Lookups; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveCatalogItemAction, null);
  const [name, setName] = useState(item?.name ?? "");
  const [tradeId, setTradeId] = useState(item?.tradeId ?? "");
  const [unitId, setUnitId] = useState(item?.unitId ?? "");
  const [vendorId, setVendorId] = useState(item?.defaultVendorId ?? "");
  const [pricingMethod, setPricingMethod] = useState<string>(item?.pricingMethod ?? "unit_x_qty");
  const [spec, setSpec] = useState(item?.spec ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const errors = fieldErrorsOf(state);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-5">
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="品項名稱" htmlFor="item-name" error={errors.name}>
        <Input id="item-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </Field>
      <Field label="工種" htmlFor="item-trade" error={errors.tradeId}>
        <SelectField id="item-trade" name="tradeId" value={tradeId} onChange={setTradeId} options={toOptions(lookups.trades)} noneLabel="未指定" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="單位" htmlFor="item-unit" error={errors.unitId}>
          <SelectField id="item-unit" name="unitId" value={unitId} onChange={setUnitId} options={toOptions(lookups.units)} noneLabel="未指定" />
        </Field>
        <Field label="計價方式" htmlFor="item-method" error={errors.pricingMethod}>
          <SelectField
            id="item-method"
            name="pricingMethod"
            value={pricingMethod}
            onChange={setPricingMethod}
            options={PRICING_METHOD_OPTIONS}
          />
        </Field>
      </div>
      <Field label="預設廠商" htmlFor="item-vendor" error={errors.defaultVendorId}>
        <SelectField id="item-vendor" name="defaultVendorId" value={vendorId} onChange={setVendorId} options={toOptions(lookups.vendors)} noneLabel="未指定" />
      </Field>
      <Field label="規格" htmlFor="item-spec" error={errors.spec}>
        <Textarea id="item-spec" name="spec" value={spec} onChange={(e) => setSpec(e.target.value)} rows={3} maxLength={500} />
      </Field>
      <Field label="備註" htmlFor="item-note" error={errors.note}>
        <Textarea id="item-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
      </Field>
      <FormFooter state={state} pending={pending} onCancel={onDone} />
    </form>
  );
}

export function CatalogManager({
  items,
  trades,
  units,
  vendors,
  canEdit,
  filtered,
}: Lookups & { items: CatalogItemRow[]; canEdit: boolean; filtered: boolean }) {
  const [editing, setEditing] = useState<CatalogItemRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setEditing(null);
  const lookups = useMemo(() => ({ trades, units, vendors }), [trades, units, vendors]);
  const nameOf = (list: Option[], id: string | null) => list.find((o) => o.id === id)?.name ?? "—";

  const actions = (it: CatalogItemRow) => (
    <RowActions
      name={it.name}
      onEdit={() => setEditing(it)}
      onDelete={() => deleteCatalogItemAction(it.id)}
      onError={setError}
    />
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">共 {items.length} 個品項</p>
        {canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> 新增品項
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{filtered ? "沒有符合條件的品項" : "尚無品項"}</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>工種</TableHead>
                  <TableHead>單位</TableHead>
                  <TableHead>計價方式</TableHead>
                  <TableHead>預設廠商</TableHead>
                  {canEdit && <TableHead className="w-28 text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <p className="font-medium">{it.name}</p>
                      {it.spec && <p className="max-w-xs truncate text-xs text-muted-foreground">{it.spec}</p>}
                    </TableCell>
                    <TableCell>{nameOf(trades, it.tradeId)}</TableCell>
                    <TableCell>{nameOf(units, it.unitId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{PRICING_METHOD_LABEL[it.pricingMethod]}</Badge>
                    </TableCell>
                    <TableCell>{nameOf(vendors, it.defaultVendorId)}</TableCell>
                    {canEdit && <TableCell>{actions(it)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {items.map((it) => (
              <li key={it.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <p className="font-medium">{it.name}</p>
                      {it.spec && <p className="text-xs text-muted-foreground">{it.spec}</p>}
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">工種</dt>
                      <dd>{nameOf(trades, it.tradeId)}</dd>
                      <dt className="text-muted-foreground">單位</dt>
                      <dd>{nameOf(units, it.unitId)}</dd>
                      <dt className="text-muted-foreground">計價</dt>
                      <dd>{PRICING_METHOD_LABEL[it.pricingMethod]}</dd>
                      <dt className="text-muted-foreground">廠商</dt>
                      <dd>{nameOf(vendors, it.defaultVendorId)}</dd>
                    </dl>
                    {canEdit && actions(it)}
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
          title={editing === "new" ? "新增品項" : "編輯品項"}
        >
          {editing !== null && (
            <CatalogForm
              key={editing === "new" ? "new" : editing.id}
              item={editing === "new" ? null : editing}
              lookups={lookups}
              onDone={close}
            />
          )}
        </FormSheet>
      )}
    </section>
  );
}
