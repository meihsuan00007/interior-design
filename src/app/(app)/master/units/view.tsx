"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UnitRow } from "@/server/master/units";
import { Field, FormFooter, fieldErrorsOf } from "@/components/form/form-parts";
import { FormSheet } from "../_components/form-sheet";
import { RowActions } from "../_components/row-actions";
import { deleteUnitAction, moveUnitAction, saveUnitAction } from "./actions";

function UnitForm({ unit, nextSort, onDone }: { unit: UnitRow | null; nextSort: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveUnitAction, null);
  const [name, setName] = useState(unit?.name ?? "");
  const [sort, setSort] = useState(String(unit?.sort ?? nextSort));
  const errors = fieldErrorsOf(state);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-5">
      {unit && <input type="hidden" name="id" value={unit.id} />}
      <Field label="單位名稱" htmlFor="unit-name" error={errors.name} hint="例如：式、坪、尺、才、組。">
        <Input id="unit-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={10} required />
      </Field>
      <Field label="排序" htmlFor="unit-sort" error={errors.sort} hint="數字越小越前面（0～9999）。">
        <Input id="unit-sort" name="sort" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} />
      </Field>
      <FormFooter state={state} pending={pending} onCancel={onDone} />
    </form>
  );
}

export function UnitsManager({ units, canEdit }: { units: UnitRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<UnitRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setEditing(null);
  const nextSort = (units.at(-1)?.sort ?? 0) + 10;

  const actions = (u: UnitRow, i: number) => (
    <RowActions
      name={u.name}
      onEdit={() => setEditing(u)}
      onDelete={() => deleteUnitAction(u.id)}
      onMove={(d) => moveUnitAction(u.id, d)}
      isFirst={i === 0}
      isLast={i === units.length - 1}
      onError={setError}
    />
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">共 {units.length} 個單位</p>
        {canEdit && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> 新增單位
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {units.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">尚無單位</p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">排序</TableHead>
                  <TableHead>名稱</TableHead>
                  {canEdit && <TableHead className="w-48 text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {units.map((u, i) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-muted-foreground">{u.sort}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    {canEdit && <TableCell>{actions(u, i)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 md:hidden">
            {units.map((u, i) => (
              <li key={u.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{u.name}</p>
                      <span className="text-xs text-muted-foreground">排序 {u.sort}</span>
                    </div>
                    {canEdit && actions(u, i)}
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
          title={editing === "new" ? "新增單位" : "編輯單位"}
        >
          {editing !== null && (
            <UnitForm
              key={editing === "new" ? "new" : editing.id}
              unit={editing === "new" ? null : editing}
              nextSort={nextSort}
              onDone={close}
            />
          )}
        </FormSheet>
      )}
    </section>
  );
}
