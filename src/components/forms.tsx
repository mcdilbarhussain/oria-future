"use client";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string> };
type ServerAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function SubmitButton({ children, className = "btn-primary", pendingText = "Saving…", confirm: confirmMsg }: { children: ReactNode; className?: string; pendingText?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} onClick={(e) => { if (confirmMsg && !window.confirm(confirmMsg)) e.preventDefault(); }}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * Form bound to a server action. Shows validation/permission errors returned by the backend,
 * resets on success and optionally redirects / closes.
 */
export function ActionForm({ action, children, className, resetOnSuccess = true, onSuccess, successMessage, redirectTo }: {
  action: ServerAction; children: ReactNode; className?: string; resetOnSuccess?: boolean; onSuccess?: (r: ActionResult) => void; successMessage?: string; redirectTo?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      if (redirectTo) router.push(redirectTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && !state.ok && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{state.error}</p>}
      {state?.ok && (state.message || successMessage) && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">{state.message || successMessage}</p>}
    </form>
  );
}

/** One-click action button (e.g. Approve, Delete) with optional confirmation. */
export function ActionButton({ action, fields = {}, children, className = "btn-secondary btn-sm", confirm, pendingText = "…" }: {
  action: ServerAction; fields?: Record<string, string>; children: ReactNode; className?: string; confirm?: string; pendingText?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton className={className} confirm={confirm} pendingText={pendingText}>{children}</SubmitButton>
      {state && !state.ok && <span role="alert" className="ml-2 text-xs text-red-600">{state.error}</span>}
      {state?.ok && state.message && <span className="ml-2 text-xs text-emerald-600">{state.message}</span>}
    </form>
  );
}

export function Modal({ trigger, title, children, triggerClassName = "btn-primary", wide }: { trigger: ReactNode; title: string; children: (close: () => void) => ReactNode; triggerClassName?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal className={clsx("w-full rounded-xl bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-base font-semibold">{title}</h3>
              <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="p-5">{children(() => setOpen(false))}</div>
          </div>
        </div>
      )}
    </>
  );
}

/** Modal containing an ActionForm that closes on success. */
export function ModalForm({ trigger, title, action, children, triggerClassName, wide, submitLabel = "Save" }: { trigger: ReactNode; title: string; action: ServerAction; children: ReactNode; triggerClassName?: string; wide?: boolean; submitLabel?: string }) {
  return (
    <Modal trigger={trigger} title={title} triggerClassName={triggerClassName} wide={wide}>
      {(close) => (
        <ActionForm action={action} onSuccess={() => close()} className="space-y-4">
          {children}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}
