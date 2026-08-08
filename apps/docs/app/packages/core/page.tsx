import type { Metadata } from "next";
import styles from "../../prose.module.css";

export const metadata: Metadata = {
  title: "@weavo/core",
};

export default function CorePackagePage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>@weavo/core</h1>
      <p className={styles.subtitle}>
        Deterministic CRDT replica: node store for causal order, skip list for
        visible indices.
      </p>
      <ul className={styles.list}>
        <li>Insert / delete operations with left and right origins</li>
        <li>Tombstones keep history so concurrent anchors stay valid</li>
        <li>Snapshots for persistence and late join restore</li>
      </ul>
      <p className={styles.p}>
        Higher layers never invent their own merge rules for characters — they
        call into core.
      </p>
    </article>
  );
}
