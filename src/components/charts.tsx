"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";

const COLORS = ["#1b2e5a", "#c09028", "#355291", "#0f766e", "#9c701f", "#6b21a8", "#b91c1c", "#5370ae"];
const gbp = (v: number) => `£${Number(v).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export function AreaTrend({ data, keys, height = 260, money = true }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color?: string }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>{keys.map((k, i) => (
          <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={k.color ?? COLORS[i]} stopOpacity={0.35} /><stop offset="100%" stopColor={k.color ?? COLORS[i]} stopOpacity={0} /></linearGradient>
        ))}</defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={money ? gbp : undefined} width={60} />
        <Tooltip formatter={(v: number) => (money ? gbp(v) : v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        {keys.map((k, i) => <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color ?? COLORS[i]} fill={`url(#g-${k.key})`} strokeWidth={2} />)}
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, keys, height = 260, money = true, horizontal }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color?: string }[]; height?: number; money?: boolean; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 5, right: 10, left: horizontal ? 20 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? (<><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={money ? gbp : undefined} /><YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={140} /></>)
          : (<><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={money ? gbp : undefined} width={60} /></>)}
        <Tooltip formatter={(v: number) => (money ? gbp(v) : v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        {keys.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color ?? COLORS[i]} radius={[4, 4, 0, 0]} />)}
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, height = 240, money = true }: { data: { label: string; value: number }[]; height?: number; money?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => (money ? gbp(v) : v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, keys, height = 260 }: { data: Record<string, string | number>[]; keys: { key: string; label: string }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={40} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
        {keys.map((k, i) => <Line key={k.key} dataKey={k.key} name={k.label} stroke={COLORS[i]} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
