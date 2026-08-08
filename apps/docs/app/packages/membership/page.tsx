import type { Metadata } from "next";
import { ScenarioPlayer } from "../../../components/ScenarioPlayer";
import { MEMBERSHIP_SCENARIO } from "../../../lib/scenarios";
import styles from "../../prose.module.css";

export const metadata: Metadata = {
  title: "@weavo/membership",
};

export default function MembershipPackagePage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>@weavo/membership</h1>
      <p className={styles.subtitle}>
        Shared member snapshots, presence LWW map, and leave/remove on the same
        consensus spine as join.
      </p>

      <ScenarioPlayer scenario={MEMBERSHIP_SCENARIO} />

      <h2 className={styles.h2}>Owns</h2>
      <ul className={styles.list}>
        <li>Versioned UUID → shortId tables</li>
        <li>CASPaxos prepare / accept / commit</li>
        <li>JOIN / LEAVE / HEARTBEAT message handling</li>
        <li>Liveness suspect → removal proposal</li>
      </ul>

      <h2 className={styles.h2}>Handle sketch</h2>
      <pre className={styles.pre}>
        <code>{`const membership = createMembership(send, {
  clientId,
  getPresence: () => ({ cursor, name, color }),
  getStateVector: () => Object.fromEntries(sv),
});

membership.requestJoin();
membership.onPresence((peers) => { /* ... */ });
membership.leave();`}</code>
      </pre>

      <p className={styles.note}>
        Pass <code className={styles.inlineCode}>heartbeatIntervalMs: 0</code> in
        tests to disable the timer.
      </p>
    </article>
  );
}
