import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

/** The setting a search result points at, to flash it once shown. */
export const HighlightContext = createContext<string | null>(null);

export const Group: React.FC<{ title?: string; foot?: React.ReactNode; children: React.ReactNode }> = ({ title, foot, children }) => (
  <section>
    {title && <div className="sw-group-title">{title}</div>}
    <div className="sw-group">{children}</div>
    {foot && <div className="sw-group-foot">{foot}</div>}
  </section>
);

/** One line of a group: label (and description) on the left, control on the right. */
export const Row: React.FC<{ id?: string; label: React.ReactNode; desc?: React.ReactNode; disabled?: boolean; children?: React.ReactNode }> = ({
  id,
  label,
  desc,
  disabled,
  children,
}) => {
  const highlight = useContext(HighlightContext);
  const ref = useRef<HTMLDivElement>(null);
  const flash = !!id && highlight === id;
  useEffect(() => {
    if (flash) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flash]);
  return (
    <div ref={ref} className={`sw-row ${flash ? "flash" : ""} ${disabled ? "disabled" : ""}`} data-setting={id}>
      <div className="sw-row-text">
        <span className="sw-row-label">{label}</span>
        {desc && <span className="sw-row-desc">{desc}</span>}
      </div>
      {children}
    </div>
  );
};

export const Switch: React.FC<{ on: boolean; onChange: (on: boolean) => void; disabled?: boolean; label: string }> = ({ on, onChange, disabled, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className={`sw-switch ${on ? "on" : ""}`} disabled={disabled} onClick={() => onChange(!on)} />
);

/** A macOS pop-up button: shows the value, opens a menu with a check mark. */
export function Popup<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <div className="sw-popup" ref={ref}>
      <button type="button" className="sw-popup-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {current}
        <span className="chev">
          <ChevronsUpDown size={11} strokeWidth={2.6} />
        </span>
      </button>
      {open && (
        <div className="sw-menu" role="listbox">
          {options.map(([v, text]) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={v === value}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
            >
              <span className="check">{v === value && <Check size={13} strokeWidth={2.6} />}</span>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="sw-seg" role="radiogroup">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? "on" : ""} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const Slider: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void; left?: string; right?: string; label: string }> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  left,
  right,
  label,
}) => (
  <div className="sw-slider">
    {left && <span>{left}</span>}
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    {right && <span>{right}</span>}
  </div>
);

/** A text field that saves on Enter or when focus leaves. */
export const Field: React.FC<{ value: string; placeholder: string; onCommit: (v: string) => void; label: string; width?: number }> = ({
  value,
  placeholder,
  onCommit,
  label,
  width,
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft.trim() !== value && onCommit(draft.trim());
  return (
    <input
      className="sw-field"
      style={width ? { width } : undefined}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        }
      }}
    />
  );
};
