"use client";

import { useEffect, useRef, useState } from "react";
import { createWeavo } from "@weavo/client";
import {
  appendClientDelta,
  getOrCreateClientId,
  hasClientSnapshot,
  loadClientStorage,
  saveClientSnapshot,
} from "./lib/clientStorage";

const CHECKPOINT_EVERY_OPS = 50;

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

  useEffect(() => {
    if (skipRestoreOnce) skipRestore.current = true;
  }, [skipRestoreOnce]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    setJoined(false);

    const roomId = roomIdFromUrl(weavoUrl);
    const clientId = getOrCreateClientId();
    const doRestore = !skipRestore.current;
    skipRestore.current = false;
    const stored = doRestore ? loadClientStorage(roomId, clientId) : null;
    let opsSinceCheckpoint = 0;

    const weavo = createWeavo(weavoUrl, {
      clientId,
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

    const unbind = weavo.bind(el);

    const onPageHide = () => checkpoint();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      checkpoint();
      window.removeEventListener("pagehide", onPageHide);
      unsubJoined();
      unbind();
      weavo.disconnect();
    };
  }, [weavoUrl, skipRestoreOnce]);

  return (
    <div className="editor-shell">
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        defaultValue=""
        placeholder={joined ? "Start typing…" : "Joining room…"}
        rows={10}
        spellCheck={false}
        aria-busy={!joined}
      />
      {!joined ? (
        <div className="editor-joining" role="status" aria-live="polite">
          <span className="editor-joining-spinner" aria-hidden />
          Joining room…
        </div>
      ) : null}
    </div>
  );
}
