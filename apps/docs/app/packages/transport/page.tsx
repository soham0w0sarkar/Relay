import type { Metadata } from "next";
import styles from "../../prose.module.css";

export const metadata: Metadata = {
  title: "@weavo/transport",
};

export default function TransportPackagePage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>@weavo/transport</h1>
      <p className={styles.subtitle}>
        Versioned binary frames for ops, sync, and membership — plus a WebSocket
        transport and persistence codecs.
      </p>
      <ul className={styles.list}>
        <li>shortId compression against a membership version</li>
        <li>UUID fallback for unmapped peers</li>
        <li>Snapshot / delta persistence that stays UUID-stable</li>
        <li>Membership subtypes encoded with full UUIDs on the consensus path</li>
      </ul>
    </article>
  );
}
