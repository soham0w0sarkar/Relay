import Image from "next/image";
import Link from "next/link";
import styles from "./prose.module.css";

export default function HomePage() {
  return (
    <div className={styles.hero}>
      <div className={styles.brandMark}>
        <Image src="/logo.png" alt="" width={56} height={56} priority />
        <h1 className={styles.brandName}>Weavo</h1>
      </div>
      <p className={styles.lede}>
        Collaborative text for the browser. Bind a textarea, join a room, and
        peers converge over a CRDT — no central editor server required.
      </p>
      <div className={styles.actions}>
        <Link href="/getting-started" className={styles.primary}>
          Get started
        </Link>
        <Link href="/architecture" className={styles.secondary}>
          Architecture
        </Link>
      </div>

      <h2 className={styles.h2}>What you are looking at</h2>
      <p className={styles.p}>
        These docs cover the packages under the hood: how ops move, how
        membership assigns short ids, how presence stays ephemeral, and how
        leave keeps the member set honest.
      </p>

      <div className={styles.cards}>
        <Link href="/getting-started" className={styles.card}>
          <p className={styles.cardTitle}>Getting started</p>
          <p className={styles.cardBody}>
            Relay server, createWeavo, and a React textarea in a few minutes.
          </p>
        </Link>
        <Link href="/concepts/presence" className={styles.card}>
          <p className={styles.cardTitle}>Presence & leave</p>
          <p className={styles.cardBody}>
            Heartbeats for cursors; CASPaxos for who still owns a shortId.
          </p>
        </Link>
        <Link href="/packages" className={styles.card}>
          <p className={styles.cardTitle}>Package map</p>
          <p className={styles.cardBody}>
            core, sync, transport, membership, client — one concern each.
          </p>
        </Link>
      </div>
    </div>
  );
}
