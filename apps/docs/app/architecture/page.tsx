import type { Metadata } from "next";
import { ScenarioPlayer } from "../../components/ScenarioPlayer";
import {
  MEMBERSHIP_SCENARIO,
  OP_SCENARIO,
  PRESENCE_SCENARIO,
} from "../../lib/scenarios";
import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "Architecture",
};

export default function ArchitecturePage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>Architecture</h1>
      <p className={styles.subtitle}>
        Correctness lives on the clients. The relay only forwards opaque frames.
      </p>

      <h2 className={styles.h2}>One keystroke, three peers</h2>
      <p className={styles.p}>
        An input event never travels as an input event. It becomes a snapshot
        diff, then a CRDT operation, then bytes. Follow one character from
        Alice&apos;s keyboard into two other replicas — including the peer that
        is missing the membership table it was encoded against.
      </p>
      <ScenarioPlayer scenario={OP_SCENARIO} />

      <h2 className={styles.h2}>A join, ballot by ballot</h2>
      <p className={styles.p}>
        A wrong member set corrupts every future op, so a join pays for
        consensus first. Three acceptors, one proposer chosen by rank, and a
        commit that lands the same table on every peer.
      </p>
      <ScenarioPlayer scenario={MEMBERSHIP_SCENARIO} />

      <h2 className={styles.h2}>A peer disappears</h2>
      <p className={styles.p}>
        Cursors are last-write-wins and expire on purpose; membership does not.
        Watch the two clocks diverge when Carol stops sending heartbeats.
      </p>
      <ScenarioPlayer scenario={PRESENCE_SCENARIO} />

      <h2 className={styles.h2}>Package map</h2>
      <pre className={styles.pre}>
        <code>{`@weavo/core         CRDT node store + skip list
@weavo/sync         state vectors + dependency buffer
@weavo/transport    binary frames, codecs, WebSocket
@weavo/membership   shortId table, CASPaxos, presence
@weavo/client       textarea adapter + orchestration
weavo-server        dumb relay`}</code>
      </pre>

      <h2 className={styles.h2}>Two structures per document</h2>
      <p className={styles.p}>
        The CRDT orders characters by operation ids. The textarea thinks in
        indices. A replica keeps both:
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Structure</th>
              <th>Owns</th>
              <th>Fast at</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Node store</td>
              <td>Causal order, tombstones</td>
              <td>Merge / history</td>
            </tr>
            <tr>
              <td>Skip list</td>
              <td>Visible positions</td>
              <td>Caret index ↔ op id</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className={styles.h2}>Why membership exists</h2>
      <p className={styles.p}>
        Full UUIDs on every op are heavy. Membership commits a sorted UUID →{" "}
        <code className={styles.inlineCode}>shortId</code> table so the wire can
        compress. Every peer must share the same table for a given version, or
        ops decode as the wrong replica.
      </p>
      <p className={styles.p}>
        Joins and leaves propose the <strong>next</strong> snapshot through
        prepare → accept → commit. Until commit, encoding keeps using the
        previous version.
      </p>

      <h2 className={styles.h2}>Whose package?</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Idea</th>
              <th>Home</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Concurrent insert order</td>
              <td>
                <code>@weavo/core</code>
              </td>
            </tr>
            <tr>
              <td>Missing clocks / buffer</td>
              <td>
                <code>@weavo/sync</code>
              </td>
            </tr>
            <tr>
              <td>Wire + persistence</td>
              <td>
                <code>@weavo/transport</code>
              </td>
            </tr>
            <tr>
              <td>Member set / presence</td>
              <td>
                <code>@weavo/membership</code>
              </td>
            </tr>
            <tr>
              <td>Textarea + selection</td>
              <td>
                <code>@weavo/client</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className={styles.note}>
        Longer design notes live in <code className={styles.inlineCode}>ARCHITECTURE.md</code>{" "}
        at the repo root — these pages are the product-facing cut.
      </p>
    </article>
  );
}
