export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(212,169,58,0.18),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(53,82,145,0.5),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-base font-black text-navy-950">OF</span>
            <span className="text-lg font-extrabold tracking-[0.25em]">ORIA FUTURE</span>
          </div>
          <div>
            <h2 className="max-w-md text-4xl font-bold leading-tight text-white">One command centre for every store, shelf and supplier.</h2>
            <p className="mt-4 max-w-md text-navy-200">Multi-account eBay operations, UK warehouse inventory, China supplier procurement, finance and team collaboration — in one secure ERP.</p>
            <div className="mt-10 grid max-w-md grid-cols-3 gap-4 text-sm">
              {[["eBay", "Multi-account"], ["Stock", "Real-time"], ["Finance", "Audited"]].map(([a, b]) => (
                <div key={a} className="rounded-xl border border-white/10 bg-white/5 p-3"><p className="font-semibold text-gold-300">{a}</p><p className="text-xs text-navy-200">{b}</p></div>
              ))}
            </div>
          </div>
          <p className="text-xs text-navy-300">Authorised personnel only. All activity is logged.</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-sm font-black text-gold-400">OF</span>
            <span className="text-lg font-extrabold tracking-[0.2em] text-navy-900">ORIA FUTURE</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
