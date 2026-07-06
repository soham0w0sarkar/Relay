import {
  createReplica,
  generateClientId,
  getText,
  onInput as localInput,
  restoreFromStorage,
  takeSnapshot,
  type DocumentSnapshot,
  type Operation,
} from "@weavo/core";
import {
  createTransport,
  createWebSocketTransport,
  type RawTransport,
} from "@weavo/transport";
import { manageTransport } from "./transport";
import { createBuffer, update, type StateVector } from "@weavo/sync";
import { createSubscription } from "./Subscription";
import { textChangeFromDiff, toTextChange } from "./textChange";
import {
  reconcileBefore,
  transformPosition,
  transformSnapshot,
  type InputSnapshot,
} from "./inputSnapshot";
import type { TextChange } from "./types";

export type WeavoOptions = {

  onOp?: (op: Operation) => void;
  initial?: {
    snapshot: DocumentSnapshot;
    delta?: Operation[];
  };
};

const captureSnapshot = (el: HTMLTextAreaElement): InputSnapshot => ({
  start: el.selectionStart,
  end: el.selectionEnd,
  value: el.value,
});

export const createWeavo = (
  urlOrTransport: string | RawTransport,
  options: WeavoOptions = {},
) => {
  const clientId = generateClientId();

  const restored = options.initial
    ? restoreFromStorage(options.initial.snapshot, options.initial.delta ?? [])
    : null;

  const doc = restored?.doc ?? createReplica(clientId);
  const sv: StateVector = restored?.stateVector ?? new Map();
  const buffer = createBuffer();
  const rawTransport =
    typeof urlOrTransport === "string"
      ? createWebSocketTransport(urlOrTransport)
      : urlOrTransport;
  const transport = createTransport(rawTransport);
  const subscription = createSubscription();

  let before: InputSnapshot | null = null;
  let boundEl: HTMLTextAreaElement | null = null;
  let pendingInput = false;

  const emitChange = (change: TextChange) => subscription.emit(change);

  const applyRemoteToBound = (prevText: string, newText: string) => {
    const change = textChangeFromDiff(prevText, newText);
    if (!change) return;

    if (boundEl) {
      const selectionStart = boundEl.selectionStart;
      const selectionEnd = boundEl.selectionEnd;
      boundEl.value = newText;
      boundEl.selectionStart = transformPosition(selectionStart, change);
      boundEl.selectionEnd = transformPosition(selectionEnd, change);
      if (before) before = transformSnapshot(before, change);
    }
    emitChange(change);
  };

  const notifyOp = (op: Operation) => options.onOp?.(op);

  const onApplied = (op: Operation, _index: number) => {
    notifyOp(op);
    const prevText = boundEl?.value ?? "";
    applyRemoteToBound(prevText, getText(doc.store));
  };

  const processLocalInput = (event: InputEvent, snapshot: InputSnapshot) => {
    const applied = localInput(event, doc, snapshot);
    if (!applied) return;
    applied.forEach(({ op, index }) => {
      if(op.type === "insert") {
        update(sv, op.id);
      }
      notifyOp(op);
      emitChange(toTextChange(op, index));
      transport.send({ type: "op", op });
    });
  };

  manageTransport(transport, doc, sv, buffer, onApplied);
  transport.connect();

  const bind = (el: HTMLTextAreaElement) => {
    boundEl = el;

    const text = getText(doc.store);
    if (text) {
      el.value = text;
      before = captureSnapshot(el);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        before = captureSnapshot(el);
        pendingInput = true;
      }
    };

    const onBeforeInput = (event: Event) => {
      before = captureSnapshot(event.target as HTMLTextAreaElement);
      pendingInput = true;
    };

    const onInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      if (!before) return;
      const snapshot = reconcileBefore(
        before,
        el.value,
        inputEvent.inputType,
        inputEvent.data,
      );
      before = snapshot;
      processLocalInput(inputEvent, snapshot);
      pendingInput = false;
    };

    const refreshSnapshot = () => {
      if (pendingInput) return;
      before = captureSnapshot(el);
    };

    el.addEventListener("keydown", onKeyDown, true);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("input", onInput);
    el.addEventListener("click", refreshSnapshot);
    el.addEventListener("select", refreshSnapshot);
    el.addEventListener("keyup", refreshSnapshot);

    return () => {
      el.removeEventListener("keydown", onKeyDown, true);
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("input", onInput);
      el.removeEventListener("click", refreshSnapshot);
      el.removeEventListener("select", refreshSnapshot);
      el.removeEventListener("keyup", refreshSnapshot);
      if (boundEl === el) boundEl = null;
    };
  };

  return {
    bind,
    textSubscribe: subscription.subscribe,
    snapshot: (): DocumentSnapshot => takeSnapshot(doc, sv),
    disconnect: () => transport.disconnect(),
  };
};
