import type { Metadata } from "next";
import { ScenarioPlayer } from "../../../components/ScenarioPlayer";
import { PRESENCE_SCENARIO } from "../../../lib/scenarios";
import styles from "../../prose.module.css";

export const metadata: Metadata = {
  title: "Presence & leave",
};

export default function PresencePage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>Presence & leave</h1>
      <p className={styles.subtitle}>
        Cursors can flicker. The member set cannot. Different stakes, different
        tools.
      </p>

      <ScenarioPlayer scenario={PRESENCE_SCENARIO} />

      <h2 className={styles.h2}>Presence is ephemeral</h2>
      <p className={styles.p}>
        After join, peers broadcast <code className={styles.inlineCode}>HEARTBEAT</code>{" "}
        (~2s) with <code className={styles.inlineCode}>{`{ cursor, name, color }`}</code>,
        plus piggybacked membership version and state vector. Receivers keep the
        higher timestamp (LWW). Miss ~10s and the peer drops from the local
        presence map — cursors disappear from the UI.
      </p>
      <pre className={styles.pre}>
        <code>{`weavo.onPresence((peers) => {
  // Map<clientId, { cursor, name, color }>
});

weavo.setIdentity({ name: "Ada", color: "#0f766e" });`}</code>
      </pre>

      <h2 className={styles.h2}>Leave is durable</h2>
      <p className={styles.p}>
        Removing someone from the shortId table still runs CASPaxos.
      </p>
      <ul className={styles.list}>
        <li>
          <strong>Graceful</strong> — <code>disconnect()</code> broadcasts{" "}
          <code>LEAVE</code>. Peers drop presence immediately and propose{" "}
          <code>removeMember</code>.
        </li>
        <li>
          <strong>Ungraceful</strong> — silence → suspect (~10s) → propose remove
          (~30s from lastSeen). A heartbeat before <code>COMMIT</code> cancels
          the removal. After commit, a returning peer rejoins with{" "}
          <code>JOIN_REQUEST</code>.
        </li>
      </ul>

      <h2 className={styles.h2}>Timeline</h2>
      <pre className={styles.pre}>
        <code>{`graceful:
  LEAVE → presence gone → CASPaxos REMOVE → new version

ungraceful:
  no heartbeats
    → 10s  presence / cursor gone (SUSPECT)
    → 30s  propose REMOVE
    → heartbeat before COMMIT → revive (stay)
    → after COMMIT → JOIN_REQUEST to come back`}</code>
      </pre>

      <p className={styles.note}>
        Quorum for a leave uses the post-removal size so a departing peer is not
        required to vote on its own exit.
      </p>
    </article>
  );
}
