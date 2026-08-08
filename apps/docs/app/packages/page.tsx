import type { Metadata } from "next";
import Link from "next/link";
import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "Packages",
};

const PACKAGES = [
  {
    href: "/packages/client",
    name: "@weavo/client",
    body: "Bind a textarea, join, sync ops, presence, disconnect.",
  },
  {
    href: "/packages/membership",
    name: "@weavo/membership",
    body: "Versioned shortId tables, CASPaxos, heartbeats, leave.",
  },
  {
    href: "/packages/core",
    name: "@weavo/core",
    body: "YATA-style CRDT, skip list, snapshots, operations.",
  },
  {
    href: "/packages/sync",
    name: "@weavo/sync",
    body: "State vectors, missing-op discovery, dependency buffer.",
  },
  {
    href: "/packages/transport",
    name: "@weavo/transport",
    body: "Binary frames, id codec, persistence codec, WebSocket.",
  },
] as const;

export default function PackagesPage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>Package map</h1>
      <p className={styles.subtitle}>
        One concern per package. If a change wants two packages rewritten for one
        idea, the line was drawn wrong.
      </p>
      <div className={styles.cards}>
        {PACKAGES.map((pkg) => (
          <Link key={pkg.href} href={pkg.href} className={styles.card}>
            <p className={styles.cardTitle}>{pkg.name}</p>
            <p className={styles.cardBody}>{pkg.body}</p>
          </Link>
        ))}
      </div>
    </article>
  );
}
