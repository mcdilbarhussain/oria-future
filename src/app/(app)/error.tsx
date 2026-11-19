"use client";
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-4xl font-black text-red-200">Error</p>
      <h1 className="mt-2 text-lg font-bold">Something went wrong loading this page</h1>
      <p className="mt-2 text-sm text-slate-500">The error has been logged{error.digest ? ` (ref ${error.digest})` : ""}. Try again, or contact your administrator if it persists.</p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
