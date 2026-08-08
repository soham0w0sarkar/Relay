"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV } from "../lib/nav";
import logo from "../public/logo.png";
import styles from "./DocsShell.module.css";

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <div className={styles.atmosphere} aria-hidden />
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} onClick={() => setOpen(false)}>
          <Image src={logo} alt="" width={36} height={36} priority />
          <span>Weavo</span>
        </Link>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="docs-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>

      <div className={styles.body}>
        <aside
          id="docs-nav"
          className={`${styles.sidebar}${open ? ` ${styles.sidebarOpen}` : ""}`}
        >
          <nav className={styles.nav} aria-label="Documentation">
            {NAV.map((section) => (
              <div key={section.title} className={styles.section}>
                <p className={styles.sectionTitle}>{section.title}</p>
                <ul className={styles.list}>
                  {section.items.map((item) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname === item.href ||
                          pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`${styles.link}${active ? ` ${styles.linkActive}` : ""}`}
                          onClick={() => setOpen(false)}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
