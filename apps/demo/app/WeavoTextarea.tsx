"use client";

import { useEffect, useRef, useState } from "react";
import { createWeavo, type PeerPresence } from "@weavo/client";
import { RemoteCursors } from "./RemoteCursors";
import {
  appendClientDelta,
  getOrCreateClientId,
  getOrCreateDisplayName,
  hasClientSnapshot,
  loadClientStorage,
  saveClientSnapshot,
} from "./lib/clientStorage";

const CHECKPOINT_EVERY_OPS = 50;
const HEARTBEAT_MS = 750;

const roomIdFromUrl = (weavoUrl: string) =>
  new URL(weavoUrl).searchParams.get("room") ?? "";

export function WeavoTextarea({
  weavoUrl,
  skipRestoreOnce = false,
}: {
  weavoUrl: string;
  /** Skip restoring local storage once (after joining a new room). */
  skipRestoreOnce?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipRestore = useRef(skipRestoreOnce);
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [selfId, setSelfId] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (skipRestoreOnce) skipRestore.current = true;
  }, [skipRestoreOnce]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    setJoined(false);
    setPeers([]);
    setText("");

    const roomId = roomIdFromUrl(weavoUrl);
    const clientId = getOrCreateClientId();
    setSelfId(clientId);
    const doRestore = !skipRestore.current;
    skipRestore.current = false;
    const stored = doRestore ? loadClientStorage(roomId, clientId) : null;
    let opsSinceCheckpoint = 0;

    const weavo = createWeavo(weavoUrl, {
      clientId,
      name: getOrCreateDisplayName(),
      heartbeatIntervalMs: HEARTBEAT_MS,
      initial: stored?.snapshot
        ? { snapshot: stored.snapshot, delta: stored.delta }
        : undefined,
      onOp(op) {
        appendClientDelta(roomId, clientId, op);
        opsSinceCheckpoint++;
        if (
          opsSinceCheckpoint >= CHECKPOINT_EVERY_OPS ||
          !hasClientSnapshot(roomId, clientId)
        ) {
          saveClientSnapshot(roomId, clientId, weavo.snapshot());
          opsSinceCheckpoint = 0;
        }
      },
    });

    const checkpoint = () => {
      if (!roomId) return;
      saveClientSnapshot(roomId, clientId, weavo.snapshot());
      opsSinceCheckpoint = 0;
    };

    const unsubJoined = weavo.membership.onJoined(() => setJoined(true));
    if (weavo.membership.isJoined()) setJoined(true);

    const unsubPresence = weavo.onPresence((all) =>
      setPeers([...all.values()]),
    );

    const unbind = weavo.bind(el);

    const syncText = () => setText(el.value);
    const unsubText = weavo.textSubscribe(syncText);
    el.addEventListener("input", syncText);
    syncText();

    const onPageHide = () => checkpoint();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      checkpoint();
      window.removeEventListener("pagehide", onPageHide);
      el.removeEventListener("input", syncText);
      unsubJoined();
      unsubPresence();
      unsubText();
      unbind();
      weavo.disconnect();
    };
  }, [weavoUrl, skipRestoreOnce]);

  return (
    <div className="editor-shell">
      {peers.length > 0 ? (
        <div className="presence-bar" aria-label="People in this room">
          {peers.map((peer) => (
            <span key={peer.clientId} className="presence-chip">
              <span
                className="presence-dot"
                style={{ background: peer.color }}
                aria-hidden
              />
              {peer.name}
              {peer.clientId === selfId ? " (you)" : ""}
            </span>
          ))}
        </div>
      ) : null}
      <div className="editor-canvas">
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          defaultValue=""
          placeholder={joined ? "Start typing…" : "Joining room…"}
          rows={10}
          spellCheck={false}
          aria-busy={!joined}
        />
        <RemoteCursors
          textareaRef={textareaRef}
          peers={peers.filter((peer) => peer.clientId !== selfId)}
          text={text}
        />
        {!joined ? (
          <div className="editor-joining" role="status" aria-live="polite">
            <span className="editor-joining-spinner" aria-hidden />
            Joining room…
          </div>
        ) : null}
      </div>
    </div>
  );
}
