"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PeerPresence } from "@weavo/client";

type Caret = {
  clientId: string;
  name: string;
  color: string;
  top: number;
  left: number;
  height: number;
};

/** Trailing anchor so the caret always has a character to measure against. */
const TAIL = "\u200b";

const LABEL_HEIGHT = 18;

export function RemoteCursors({
  textareaRef,
  peers,
  text,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  peers: PeerPresence[];
  text: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [carets, setCarets] = useState<Caret[]>([]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    const inner = innerRef.current;
    const mirror = mirrorRef.current;
    if (!el || !inner || !mirror) return;

    const syncScroll = () => {
      inner.style.transform = `translateY(${-el.scrollTop}px)`;
    };

    const measure = () => {
      const node = mirror.firstChild;
      if (!node) return;

      mirror.style.width = `${el.clientWidth}px`;
      syncScroll();

      const base = inner.getBoundingClientRect();
      const range = document.createRange();

      setCarets(
        peers.map((peer) => {
          const offset = Math.max(0, Math.min(peer.cursor, text.length));
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const rect =
            range.getClientRects()[0] ?? range.getBoundingClientRect();

          return {
            clientId: peer.clientId,
            name: peer.name,
            color: peer.color,
            top: rect.top - base.top,
            left: rect.left - base.left,
            height: rect.height,
          };
        }),
      );
    };

    measure();

    el.addEventListener("scroll", syncScroll, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", syncScroll);
      observer.disconnect();
    };
  }, [peers, text, textareaRef]);

  return (
    <div className="cursor-layer" aria-hidden>
      <div className="cursor-layer-inner" ref={innerRef}>
        <div className="cursor-mirror" ref={mirrorRef}>
          {text + TAIL}
        </div>
        {carets.map((caret) => (
          <span
            key={caret.clientId}
            className="remote-caret"
            style={{
              top: caret.top,
              left: caret.left,
              height: caret.height,
              background: caret.color,
            }}
          >
            <span
              className={
                caret.top < LABEL_HEIGHT
                  ? "remote-caret-label remote-caret-label-below"
                  : "remote-caret-label"
              }
              style={{ background: caret.color }}
            >
              {caret.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
