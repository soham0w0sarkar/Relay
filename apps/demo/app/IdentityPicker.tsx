"use client";

import { DISPLAY_COLORS } from "./lib/clientStorage";
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
  return (
    <div className={styles.identity}>
      <label className={styles.identityName}>
        <span className={styles.identityLabel}>Your name</span>
        <input
          type="text"
          className={styles.identityInput}
          value={name}
          maxLength={24}
          autoComplete="nickname"
          spellCheck={false}
          placeholder="Name"
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={() => onNameCommit?.()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <div
        className={styles.identityColors}
        role="radiogroup"
        aria-label="Your color"
      >
        {DISPLAY_COLORS.map((swatch) => {
          const selected = swatch === color;
          return (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`Color ${swatch}`}
              className={`${styles.colorSwatch}${selected ? ` ${styles.colorSwatchSelected}` : ""}`}
              style={{ background: swatch }}
              onClick={() => onColorChange(swatch)}
            />
          );
        })}
      </div>
    </div>
  );
}
