"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
};

export default function MultiSelectDropdown({
  name,
  options,
  defaultValues,
  placeholder,
}: {
  name: string;
  options: Option[];
  defaultValues?: string[];
  placeholder: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultValues ?? []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedLabels = useMemo(() => {
    const set = new Set(selected);
    return options.filter((o) => set.has(o.value)).map((o) => o.label);
  }, [options, selected]);

  function toggleValue(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  return (
    <div ref={rootRef} className="msdWrap">
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}

      <button
        type="button"
        className="msdTrigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="msdValue">
          {selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder}
        </span>
        <span className="msdChevron" aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="msdMenu" role="listbox" aria-multiselectable="true">
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label key={o.value} className="msdItem">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(o.value)}
                  className="h-4 w-4"
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
