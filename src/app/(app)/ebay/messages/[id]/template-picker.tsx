"use client";
export function TemplatePicker({ templates }: { templates: { id: string; name: string; body: string }[] }) {
  return (
    <select className="input w-56" defaultValue="" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); const ta = document.getElementById("reply-body") as HTMLTextAreaElement | null; if (t && ta) ta.value = t.body; }}>
      <option value="">Insert template…</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}
