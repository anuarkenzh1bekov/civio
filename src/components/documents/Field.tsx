"use client";

export const inputClass =
  "mt-1.5 h-11 w-full rounded-xl bg-panel px-3 text-[0.9375rem] ring-1 ring-line placeholder:text-ink-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  maxLength = 200,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "tel";
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        maxLength={maxLength}
        inputMode={inputMode}
        className={inputClass}
      />
    </label>
  );
}
