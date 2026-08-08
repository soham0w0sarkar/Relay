"use client";

import { useEffect, useRef, useState } from "react";
import { DISPLAY_COLORS, normalizeHexColor } from "./lib/clientStorage";
import styles from "./page.module.css";

export function IdentityPicker({
  name,
  color,
  onNameChange,
  onNameCommit,
  onColorChange,
}: {
  name: string;
  color: string;
  onNameChange: (name: string) => void;
  onNameCommit?: () => void;
  onColorChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(color);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    setHexDraft(color);
    setOpen((value) => !value);
  };

  const editHex = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHexColor(value);
    if (normalized) onColorChange(normalized);
  };

  return (
    <div className={styles.identity}>
      <input
        type="text"
        className={styles.identityInput}
        value={name}
        maxLength={24}
        autoComplete="nickname"
        spellCheck={false}
        placeholder="Your name"
        aria-label="Your name"
        onChange={(e) => onNameChange(e.target.value)}
        onBlur={() => onNameCommit?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />

      <div className={styles.colorPicker} ref={pickerRef}>
        <button
          type="button"
          className={styles.colorTrigger}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Your color, ${color}`}
          onClick={toggle}
        >
          <span className={styles.colorDot} style={{ background: color }} />
          <span
            className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ""}`}
            aria-hidden
          />
        </button>

        {open && (
          <div className={styles.colorMenu}>
            <div className={styles.colorGrid}>
              {DISPLAY_COLORS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={option.name}
                  aria-label={option.name}
                  aria-pressed={option.value === color}
                  className={`${styles.swatch}${option.value === color ? ` ${styles.swatchActive}` : ""}`}
                  style={{ background: option.value }}
                  onClick={() => {
                    onColorChange(option.value);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
            <input
              type="text"
              className={styles.hexInput}
              value={hexDraft}
              maxLength={7}
              spellCheck={false}
              placeholder="#7c3aed"
              aria-label="Custom hex color"
              onChange={(e) => editHex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
