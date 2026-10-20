"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { VendorRow } from "@/server/master/vendors";
import { Field, FormFooter, fieldErrorsOf } from "@/components/form/form-parts";
import { FormSheet } from "../_components/form-sheet";
import { RowActions } from "../_components/row-actions";
import { deleteVendorAction, saveVendorAction } from "./actions";

interface TradeOption {
  id: string;
  name: string;
}

function VendorForm({ vendor, trades, onDone }: { vendor: VendorRow | null; trades: TradeOption[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveVendorAction, null);
  const [name, setName] = useState(vendor?.name ?? "");
  const [tradeIds, setTradeIds] = useState<string[]>(vendor?.tradeIds ?? []);
  const [contactName, setContactName] = useState(vendor?.contactName ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [taxId, setTaxId] = useState(vendor?.taxId ?? "");
  const [note, setNote] = useState(vendor?.note ?? "");
  const errors = fieldErrorsOf(state);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  const toggle = (id: string, on: boolean) =>
    setTradeIds((cur) => (on ? [...cur, id] : cur.filter((t) => t !== id)));

  return (
    <form action={action} className="space-y-5">
      {vendor && <input type="hidden" name="id" value={vendor.id} />}
      <input type="hidden" name="phoneTouched" value={phoneTouched ? "1" : "0"} />
      <Field label="廠商名稱" htmlFor="vendor-name" error={errors.name}>
        <Input id="vendor-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </Field>
      <Field label="承作工種" error={errors.tradeIds}>
        {trades.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無工種，請先到「工種」分頁新增。</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {trades.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="tradeIds"
                  value={t.id}
                  checked={tradeIds.includes(t.id)}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                  className="size-4 rounded border-input accent-primary"
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="聯絡人" htmlFor="vendor-contact" error={errors.contactName}>
          <Input id="vendor-contact" name="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={30} />
        </Field>
        <Field label="電話" htmlFor="vendor-phone" error={errors.phone}>
          <Input id="vendor-phone" name="phone" type="tel" value={phone} onChange={(e) => {
              setPhone(e.target.value);
              setPhoneTouched(true);
            }} maxLength={20} />
        </Field>
      </div>
      <Field label="統一編號" htmlFor="vendor-tax" error={errors.taxId} hint="8 位數字，可留空。">
        <Input id="vendor-tax" name="taxId" inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={8} />
      </Field>
      <Field label="備註" htmlFor="vendor-note" error={errors.note}>
        <Textarea id="vendor-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
      </Field>
      <FormFooter state={state} pending={pending} onCancel={onDone} />
    </form>
  );
}

function TradeBadges({ ids, trades }: { ids: string[]; trades: TradeOption[] }) {
  const names = ids.map((id) => trades.find((t) => t.id === id)?.name).filter((n): n is string => Boolean(n));
  if (names.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((n) => (
        <Badge key={n} variant="secondary">
          {n}
        </Badge>
      ))}
    </div>
  );
}

export function VendorsManager({
  vendors,
  trades,
  canEdit,
}: {
  vendors: VendorRow[];
  trades: TradeOption[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<VendorRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setEditing(null);

  const actions = (v: VendorRow) => (
    <RowActions name={v.name} onEdit={() => setEditing(v)} onDelete={() => deleteVendorAction(v.id)} onError={setError} />
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          共 {vendors.length} 家廠商{!canEdit && "（唯讀）"}
        </p>
        {canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> 新增廠商
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {vendors.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">尚無廠商</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>承作工種</TableHead>
                  <TableHead>聯絡人</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>統編</TableHead>
                  {canEdit && <TableHead className="w-28 text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>
                      <TradeBadges ids={v.tradeIds} trades={trades} />
                    </TableCell>
                    <TableCell>{v.contactName || "—"}</TableCell>
                    <TableCell className="tabular-nums">{v.phoneMasked || "—"}</TableCell>
                    <TableCell className="tabular-nums">{v.taxId || "—"}</TableCell>
                    {canEdit && <TableCell>{actions(v)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {vendors.map((v) => (
              <li key={v.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <p className="font-medium">{v.name}</p>
                    <TradeBadges ids={v.tradeIds} trades={trades} />
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">聯絡人</dt>
                      <dd>{v.contactName || "—"}</dd>
                      <dt className="text-muted-foreground">電話</dt>
                      <dd className="tabular-nums">{v.phoneMasked || "—"}</dd>
                      <dt className="text-muted-foreground">統編</dt>
                      <dd className="tabular-nums">{v.taxId || "—"}</dd>
                    </dl>
                    {canEdit && actions(v)}
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
          title={editing === "new" ? "新增廠商" : "編輯廠商"}
        >
          {editing !== null && (
            <VendorForm
              key={editing === "new" ? "new" : editing.id}
              vendor={editing === "new" ? null : editing}
              trades={trades}
              onDone={close}
            />
          )}
        </FormSheet>
      )}
    </section>
  );
}
