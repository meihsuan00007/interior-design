"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, type FormState } from "./actions";

const initial: FormState = {};

export function LoginForm({ idle }: { idle: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      {idle && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          閒置過久，已自動登出
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        電子郵件
        <Input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        密碼
        <Input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "登入中…" : "登入"}
      </Button>
    </form>
  );
}
