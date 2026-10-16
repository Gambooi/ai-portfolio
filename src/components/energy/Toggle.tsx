"use client";

/** Segmented control; the selected pill slides between options. */
export function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="radiogroup" aria-label={label}
      className="relative inline-grid rounded-lg border border-border p-0.5 text-sm"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span aria-hidden className="absolute inset-y-0.5 left-0.5 rounded-md bg-foreground transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`relative z-10 whitespace-nowrap rounded-md px-3 py-1 transition-colors duration-200 ${value === o.value ? "text-background" : "text-muted hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
