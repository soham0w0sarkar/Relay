"use client";

import { useEffect, useRef, useState } from "react";
import { createWeavo, type PeerPresence } from "@weavo/client";
import { RemoteCursors } from "./RemoteCursors";
import {
  appendClientDelta,
  getOrCreateClientId,
  hasClientSnapshot,
  loadClientStorage,
  saveClientSnapshot,
} from "./lib/clientStorage";

const CHECKPOINT_EVERY_OPS = 50;
const HEARTBEAT_MS = 750;
/**
 * Cursors should drop quickly, but not so fast that a mobile network stall or a
 * throttled free relay looks like someone leaving. Roughly ten missed
 * heartbeats before the cursor goes, and longer still before membership does.
 */
const PRESENCE_TIMEOUT_MS = 8_000;
const REMOVAL_TIMEOUT_MS = 20_000;

const roomIdFromUrl = (weavoUrl: string) =>
  new URL(weavoUrl).searchParams.get("room") ?? "";

export function WeavoTextarea({
  weavoUrl,
  skipRestoreOnce = false,
  displayName,
  displayColor,
}: {
  weavoUrl: string;
  /** Skip restoring local storage once (after joining a new room). */
  skipRestoreOnce?: boolean;
  displayName: string;
  displayColor: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipRestore = useRef(skipRestoreOnce);
  const weavoRef = useRef<ReturnType<typeof createWeavo> | null>(null);
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState<PeerPresence[]>([]);
  const [selfId, setSelfId] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    if (skipRestoreOnce) skipRestore.current = true;
  }, [skipRestoreOnce]);

  useEffect(() => {
    weavoRef.current?.setIdentity({
      name: displayName,
      color: displayColor,
    });
  }, [displayName, displayColor]);

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
    let closed = false;

    const weavo = createWeavo(weavoUrl, {
      clientId,
      name: displayName,
      color: displayColor,
      heartbeatIntervalMs: HEARTBEAT_MS,
      presenceTimeoutMs: PRESENCE_TIMEOUT_MS,
      removalTimeoutMs: REMOVAL_TIMEOUT_MS,
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
    weavoRef.current = weavo;

    const checkpoint = () => {
      if (!roomId || closed) return;
      saveClientSnapshot(roomId, clientId, weavo.snapshot());
      opsSinceCheckpoint = 0;
    };

    /** Graceful leave: LEAVE on the wire, then close the socket. */
    const teardown = () => {
      if (closed) return;
      checkpoint();
      closed = true;
      weavoRef.current = null;
      weavo.disconnect();
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

    // Tab close / mobile background kill — React cleanup often does not run.
    window.addEventListener("pagehide", teardown);

    return () => {
      window.removeEventListener("pagehide", teardown);
      el.removeEventListener("input", syncText);
      unsubJoined();
      unsubPresence();
      unsubText();
      unbind();
      // Leave button / room switch: unmount sends LEAVE to peers.
      teardown();
    };
    // Identity updates go through setIdentity — do not reconnect on rename.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- room URL / restore only
  }, [weavoUrl, skipRestoreOnce]);

  return (
    <div className="editor-shell">
      {peers.length > 0 ? (
        <div className="presence-bar" aria-label="People in this room">
          {peers.map((peer) => (
            <span
              key={peer.clientId}
              className={
                peer.clientId === selfId
                  ? "presence-chip presence-chip-self"
                  : "presence-chip"
              }
            >
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
