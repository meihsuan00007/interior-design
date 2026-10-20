"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/server/master/action";

const GENERIC_ERROR = "操作失敗，請稍後再試";

interface RowActionsProps {
  /** 顯示在刪除確認視窗的名稱 */
  name: string;
  onEdit: () => void;
  onDelete: () => Promise<ActionResult>;
  /** 提供時顯示上下移動按鈕 */
  onMove?: (direction: "up" | "down") => Promise<ActionResult>;
  isFirst?: boolean;
  isLast?: boolean;
  /** 移動、刪除失敗時的訊息回報給列表顯示 */
  onError: (message: string | null) => void;
}

export function RowActions({ name, onEdit, onDelete, onMove, isFirst, isLast, onError }: RowActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dialogError, setDialogError] = useState<string | null>(null);

  function move(direction: "up" | "down") {
    startTransition(async () => {
      try {
        const r = await onMove!(direction);
        onError(r.ok ? null : r.message);
      } catch {
        onError(GENERIC_ERROR);
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      try {
        const r = await onDelete();
        if (r.ok) {
          setConfirmOpen(false);
          onError(null);
        } else {
          setDialogError(r.message);
        }
      } catch {
        setDialogError(GENERIC_ERROR);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {onMove && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${name} 上移`}
            disabled={pending || isFirst}
            onClick={() => move("up")}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${name} 下移`}
            disabled={pending || isLast}
            onClick={() => move("down")}
          >
            <ArrowDown />
          </Button>
        </>
      )}
      <Button type="button" variant="ghost" size="icon" aria-label={`編輯 ${name}`} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`刪除 ${name}`}
        onClick={() => {
          setDialogError(null);
          setConfirmOpen(true);
        }}
      >
        <Trash2 />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確定要刪除「{name}」？</DialogTitle>
            <DialogDescription>刪除後無法復原，並會留下稽核紀錄。</DialogDescription>
          </DialogHeader>
          {dialogError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {dialogError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={pending}>
              {pending ? "刪除中…" : "確定刪除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
