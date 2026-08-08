import type { Metadata } from "next";
import styles from "../../prose.module.css";

export const metadata: Metadata = {
  title: "@weavo/sync",
};

export default function SyncPackagePage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>@weavo/sync</h1>
      <p className={styles.subtitle}>
        State vectors and the buffer that parks ops until their dependencies —
        including membership version — are known.
      </p>
      <ul className={styles.list}>
        <li>Compare clocks to find missing ops</li>
        <li>Hold ops whose membership table has not arrived yet</li>
        <li>Release parked ops once the version lands</li>
      </ul>
    </article>
  );
}
