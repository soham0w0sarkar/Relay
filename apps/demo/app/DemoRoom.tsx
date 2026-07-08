"use client";

import { useCallback, useEffect, useState } from "react";
import { WeavoTextarea } from "./WeavoTextarea";
import { buildWeavoRoomUrl } from "./lib/weavoUrl";
import {
  checkWeavoServerReady,
  isRemoteWeavoServer,
} from "./lib/weavoReady";
import {
  createRoomId,
  loadStoredRoomId,
  parseRoomId,
  shortRoomId,
  storeRoomId,
} from "./lib/roomId";
import {
  clearClientStorage,
  getOrCreateClientId,
} from "./lib/clientStorage";
import styles from "./page.module.css";

type ServerStatus = "checking" | "ready" | "unavailable";

export function DemoRoom() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [skipRestoreOnce, setSkipRestoreOnce] = useState(false);

  const pingServer = useCallback(async () => {
    setServerStatus("checking");
    try {
      await checkWeavoServerReady();
      setServerStatus("ready");
    } catch {
      setServerStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    setRoomId(loadStoredRoomId());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    pingServer();
  }, [hydrated, pingServer]);

  const enterRoom = useCallback((id: string, fresh: boolean) => {
    if (fresh) {
      clearClientStorage(id, getOrCreateClientId());
      setSkipRestoreOnce(true);
    }
    storeRoomId(id);
    setRoomId(id);
    setJoinInput("");
    setJoinError(false);
  }, []);

  const createRoom = useCallback(() => {
    enterRoom(createRoomId(), true);
  }, [enterRoom]);

  const joinRoom = useCallback(() => {
    const id = parseRoomId(joinInput);
    if (!id) {
      setJoinError(true);
      return;
    }
    enterRoom(id, true);
  }, [enterRoom, joinInput]);

  const leaveRoom = useCallback(() => {
    if (roomId) clearClientStorage(roomId, getOrCreateClientId());
    setSkipRestoreOnce(true);
    storeRoomId(null);
    setRoomId(null);
  }, [roomId]);

  const copyId = useCallback(async () => {
    if (!roomId) return;
    await navigator.clipboard.writeText(roomId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [roomId]);

  if (!hydrated) return null;

  if (serverStatus !== "ready") {
    const remote = isRemoteWeavoServer();

    return (
      <div className={styles.serverWait}>
        <p className={styles.serverMessage}>
          {serverStatus === "checking"
            ? "Waking up the sync server…"
            : remote
              ? "Sorry — this demo runs on a free hosted server. It sleeps when idle and can take up to a minute to start."
              : "Could not reach the sync server. Make sure it is running locally."}
        </p>
        {serverStatus === "unavailable" && (
          <button
            type="button"
            className={styles.retryButton}
            onClick={pingServer}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className={styles.lobby}>
        <button type="button" className={styles.createButton} onClick={createRoom}>
          New room
        </button>

        <div className={styles.divider}>
          <span />
          <span>or</span>
          <span />
        </div>

        <div className={`${styles.joinRow} ${joinError ? styles.joinRowError : ""}`}>
          <input
            type="text"
            className={styles.roomInput}
            placeholder="Room ID"
            value={joinInput}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            onChange={(e) => {
              setJoinInput(e.target.value);
              setJoinError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") joinRoom();
            }}
            aria-invalid={joinError}
          />
          <button type="button" className={styles.joinButton} onClick={joinRoom}>
            Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.session}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarDesktop}>
          <code className={styles.roomId} title={roomId}>
            {roomId}
          </code>
          <div className={styles.actions}>
            <button type="button" className={styles.ghostButton} onClick={copyId}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className={styles.ghostButton} onClick={createRoom}>
              New
            </button>
            <button type="button" className={styles.ghostButton} onClick={leaveRoom}>
              Leave
            </button>
          </div>
        </div>

        <div className={styles.toolbarMobile}>
          <div className={styles.mobileRoomRow}>
            <span className={styles.liveDot} aria-hidden />
            <code className={styles.roomIdShort} title={roomId}>
              {shortRoomId(roomId)}
            </code>
            <button type="button" className={styles.copyPill} onClick={copyId}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className={styles.mobileActions}>
            <button type="button" className={styles.outlineButton} onClick={createRoom}>
              New room
            </button>
            <button type="button" className={styles.outlineButton} onClick={leaveRoom}>
              Leave
            </button>
          </div>
        </div>
      </div>

      <WeavoTextarea
        weavoUrl={buildWeavoRoomUrl(roomId)}
        skipRestoreOnce={skipRestoreOnce}
      />
    </div>
  );
}
