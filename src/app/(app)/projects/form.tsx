"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, SelectField, fieldErrorsOf } from "@/components/form/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/server/actions";

export interface ProjectFormValues {
  name: string;
  district: string;
  addressFull: string;
  ping: string;
  condition: string;
  floor: string;
  /** "" = 不確定、"true"／"false" */
  hasElevator: string;
  hoaRules: string;
  status: string;
  clientName: string;
}

const CONDITION_OPTIONS = [
  { value: "new", label: "新成屋" },
  { value: "resale", label: "中古屋" },
  { value: "old", label: "老屋" },
];

const ELEVATOR_OPTIONS = [
  { value: "true", label: "有電梯" },
  { value: "false", label: "無電梯" },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1 border-b pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * 新增／編輯案場表單（手機優先、單欄）。所有欄位為受控元件：送出失敗時輸入不會被清掉。
 * 業主區塊只在 showClient 為真時顯示；編輯時電話／Email／身分證不預填，留空表示不變更。
 */
export function ProjectForm({
  action,
  statusOptions,
  initial,
  projectId,
  showClient,
  hasClient,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  statusOptions: { value: string; label: string }[];
  initial: ProjectFormValues;
  /** 有值代表編輯 */
  projectId?: string;
  showClient: boolean;
  hasClient: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [v, setV] = useState(initial);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");
  const errors = fieldErrorsOf(state);
  const set = (key: keyof ProjectFormValues) => (value: string) => setV((prev) => ({ ...prev, [key]: value }));
  const keepHint = hasClient ? "留空表示不變更" : undefined;

  return (
    <form action={formAction} className="mx-auto w-full max-w-xl space-y-8">
      {projectId && <input type="hidden" name="id" value={projectId} />}

      <Section title="基本資料">
        <Field label="案場名稱" htmlFor="p-name" error={errors.name}>
          <Input id="p-name" name="name" value={v.name} onChange={(e) => set("name")(e.target.value)} maxLength={60} required className="h-10" />
        </Field>
        <Field label="狀態" htmlFor="p-status" error={errors.status}>
          <SelectField id="p-status" name="status" value={v.status} onChange={set("status")} options={statusOptions} />
        </Field>
        <Field label="行政區" htmlFor="p-district" error={errors.district}>
          <Input id="p-district" name="district" value={v.district} onChange={(e) => set("district")(e.target.value)} maxLength={20} className="h-10" />
        </Field>
        <Field label="完整地址" htmlFor="p-address" error={errors.addressFull} hint="加密儲存，列表不會顯示。">
          <Input id="p-address" name="addressFull" autoComplete="off" value={v.addressFull} onChange={(e) => set("addressFull")(e.target.value)} maxLength={200} className="h-10" />
        </Field>
      </Section>

      <Section title="屋況">
        <Field label="坪數" htmlFor="p-ping" error={errors.ping} hint="0.01～9999.99，最多兩位小數。">
          <Input id="p-ping" name="ping" inputMode="decimal" value={v.ping} onChange={(e) => set("ping")(e.target.value)} className="h-10" />
        </Field>
        <Field label="屋況" htmlFor="p-condition" error={errors.condition}>
          <SelectField id="p-condition" name="condition" value={v.condition} onChange={set("condition")} options={CONDITION_OPTIONS} noneLabel="未指定" />
        </Field>
        <Field label="樓層" htmlFor="p-floor" error={errors.floor}>
          <Input id="p-floor" name="floor" inputMode="numeric" value={v.floor} onChange={(e) => set("floor")(e.target.value)} maxLength={10} className="h-10" />
        </Field>
        <Field label="電梯" htmlFor="p-elevator" error={errors.hasElevator}>
          <SelectField id="p-elevator" name="hasElevator" value={v.hasElevator} onChange={set("hasElevator")} options={ELEVATOR_OPTIONS} noneLabel="不確定" />
        </Field>
        <Field label="社區規約" htmlFor="p-hoa" error={errors.hoaRules} hint="施工時段、搬運限制等。">
          <Textarea id="p-hoa" name="hoaRules" rows={4} value={v.hoaRules} onChange={(e) => set("hoaRules")(e.target.value)} maxLength={2000} />
        </Field>
      </Section>

      {showClient && (
        <Section
          title="業主資料"
          hint={hasClient ? "電話、Email、身分證字號不會預先顯示；留空表示不變更。" : "選填。填了姓名才會建立業主，個資加密儲存。"}
        >
          <Field label="業主姓名" htmlFor="p-client-name" error={errors.clientName}>
            <Input id="p-client-name" name="clientName" autoComplete="off" value={v.clientName} onChange={(e) => set("clientName")(e.target.value)} maxLength={60} className="h-10" />
          </Field>
          <Field label="電話" htmlFor="p-client-phone" error={errors.clientPhone}>
            <Input id="p-client-phone" name="clientPhone" type="tel" inputMode="tel" autoComplete="off" placeholder={keepHint} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="h-10" />
          </Field>
          <Field label="Email" htmlFor="p-client-email" error={errors.clientEmail}>
            <Input id="p-client-email" name="clientEmail" type="email" inputMode="email" autoComplete="off" placeholder={keepHint} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={100} className="h-10" />
          </Field>
          <Field label="身分證字號" htmlFor="p-client-nid" error={errors.clientNationalId}>
            <Input id="p-client-nid" name="clientNationalId" autoComplete="off" autoCapitalize="characters" placeholder={keepHint} value={nationalId} onChange={(e) => setNationalId(e.target.value)} maxLength={10} className="h-10" />
          </Field>
        </Section>
      )}

      {state && !state.ok && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-10">
          <Link href="/projects">取消</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? "儲存中…" : "儲存"}
        </Button>
      </div>
    </form>
  );
}
