import type { Metadata } from "next";
import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "Getting started",
};

export default function GettingStartedPage() {
  return (
    <article className={styles.prose}>
      <h1 className={styles.title}>Getting started</h1>
      <p className={styles.subtitle}>
        A dumb WebSocket relay plus <code className={styles.inlineCode}>@weavo/client</code>{" "}
        is enough to sync a textarea.
      </p>

      <h2 className={styles.h2}>Install</h2>
      <pre className={styles.pre}>
        <code>{`npm install @weavo/client`}</code>
      </pre>

      <h2 className={styles.h2}>Relay</h2>
      <p className={styles.p}>
        The server only forwards bytes. It does not parse ops, membership, or
        presence.
      </p>
      <pre className={styles.pre}>
        <code>{`npm install ws

# server.js
const { WebSocketServer } = require("ws");
const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    for (const client of wss.clients) {
      if (client !== ws && client.readyState === 1) client.send(data);
    }
  });
});

console.log("ws://localhost:8080");`}</code>
      </pre>

      <h2 className={styles.h2}>Browser</h2>
      <pre className={styles.pre}>
        <code>{`import { createWeavo } from "@weavo/client";

const weavo = createWeavo("ws://localhost:8080?room=notes");
const el = document.querySelector("textarea")!;
const unbind = weavo.bind(el);

weavo.onPresence((peers) => {
  // Map<clientId, { cursor, name, color }>
});

// later
unbind();
weavo.disconnect(); // broadcasts LEAVE, then closes`}</code>
      </pre>

      <h2 className={styles.h2}>React sketch</h2>
      <pre className={styles.pre}>
        <code>{`import { useEffect, useRef } from "react";
import { createWeavo } from "@weavo/client";

export function CollaborativeTextarea({ roomUrl }: { roomUrl: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const weavo = createWeavo(roomUrl, {
      name: "Ada",
      color: "#0f766e",
    });
    const unbind = weavo.bind(el);
    return () => {
      unbind();
      weavo.disconnect();
    };
  }, [roomUrl]);

  return <textarea ref={ref} rows={8} />;
}`}</code>
      </pre>

      <p className={styles.note}>
        Ops and the first sync wait until membership join completes. Until then
        the bound textarea stays read-only.
      </p>
    </article>
  );
}
