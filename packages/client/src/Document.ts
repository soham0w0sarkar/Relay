import {
  createReplica,
  generateClientId,
  getText,
  onInput as localInput,
  restoreFromStorage,
  takeSnapshot,
  type ClientId,
  type DocumentSnapshot,
  type Operation,
} from "@weavo/core";
import {
  createMembership,
  getClientId,
  type MembershipHandle,
} from "@weavo/membership";
import { createBuffer, update, type StateVector } from "@weavo/sync";
import {
  createTransport,
  createWebSocketTransport,
  type RawTransport,
} from "@weavo/transport";
import { createSubscription } from "./Subscription";
import {
  reconcileBefore,
  transformPosition,
  transformSnapshot,
  type InputSnapshot,
} from "./inputSnapshot";
import { textChangeFromDiff, toTextChange } from "./textChange";
import { manageTransport } from "./transport";
import type { CompositionState, TextChange } from "./types";

export type WeavoOptions = {
  clientId?: ClientId;
  onOp?: (op: Operation) => void;
  foundingGraceMs?: number;
  initialMembers?: ClientId[];
  initialVersion?: number;
  name?: string;
  color?: string;
  heartbeatIntervalMs?: number;
  presenceTimeoutMs?: number;
  removalTimeoutMs?: number;
  initial?: {
    snapshot: DocumentSnapshot;
    delta?: Operation[];
  };
};

const colorFromId = (clientId: ClientId): string => {
  let hash = 0;
  for (let index = 0; index < clientId.length; index++) {
    hash = (hash * 31 + clientId.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 70% 45%)`;
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
  const restored = options.initial
    ? restoreFromStorage(options.initial.snapshot, options.initial.delta ?? [])
    : null;

  const clientId = options.clientId ?? generateClientId();
  const doc = restored?.doc ?? createReplica(clientId);
  const sv: StateVector = restored?.stateVector ?? new Map();
  const buffer = createBuffer();
  const rawTransport =
    typeof urlOrTransport === "string"
      ? createWebSocketTransport(urlOrTransport)
      : urlOrTransport;

  const displayName = options.name ?? clientId.slice(0, 8);
  const displayColor = options.color ?? colorFromId(clientId);
  let presenceName = displayName;
  let presenceColor = displayColor;

  let boundEl: HTMLTextAreaElement | null = null;

  let membership!: MembershipHandle;
  const transport = createTransport(rawTransport, {
    idCodec: {
      encodeVersion: () => membership.getCurrent()?.version ?? 0,
      shortIdOf: (id) => membership.shortIdOf(id),
      clientIdOf: (version, shortId) => {
        const table = membership.getVersion(version);
        return table ? getClientId(table, shortId) : null;
      },
      hasVersion: (version) => membership.getVersion(version) !== null,
      onMissingVersion: (version) => membership.requestMembership(version),
    },
  });
  membership = createMembership((message) => transport.send(message), {
    clientId,
    getPresence: () => ({
      cursor: boundEl?.selectionStart ?? 0,
      name: presenceName,
      color: presenceColor,
    }),
    getStateVector: () => Object.fromEntries(sv),
    ...(options.foundingGraceMs !== undefined
      ? { foundingGraceMs: options.foundingGraceMs }
      : {}),
    ...(options.initialMembers !== undefined
      ? { initialMembers: options.initialMembers }
      : {}),
    ...(options.initialVersion !== undefined
      ? { initialVersion: options.initialVersion }
      : {}),
    ...(options.heartbeatIntervalMs !== undefined
      ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
      : {}),
    ...(options.presenceTimeoutMs !== undefined
      ? { presenceTimeoutMs: options.presenceTimeoutMs }
      : {}),
    ...(options.removalTimeoutMs !== undefined
      ? { removalTimeoutMs: options.removalTimeoutMs }
      : {}),
  });
  const subscription = createSubscription();

  let before: InputSnapshot | null = null;
  let pendingInput = false;
  let composition: CompositionState | null = null;

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

  const onApplied = (op: Operation, index: number) => {
    notifyOp(op);

    if (composition) {
      const change = toTextChange(op, index);
      composition.docStart = transformPosition(composition.docStart, change);
      composition.docEnd = transformPosition(composition.docEnd, change);
      emitChange(change);
      return;
    }

    const prevText = boundEl?.value ?? "";
    applyRemoteToBound(prevText, getText(doc.store));
  };

  const processLocalInput = (event: InputEvent, snapshot: InputSnapshot) => {
    if (!membership.isJoined()) return;

    const applied = localInput(event, doc, snapshot);
    if (!applied) return;
    applied.forEach(({ op, index }) => {
      if (op.type === "insert") {
        update(sv, op.id);
      }
      notifyOp(op);
      emitChange(toTextChange(op, index));
      transport.send({ type: "op", op });
    });
  };

  const resolveDelete = (
    snapshot: InputSnapshot,
    currentValue: string,
  ): InputSnapshot | null => {
    const removed = textChangeFromDiff(snapshot.value, currentValue);
    if (!removed || !removed.delete) return null;
    return {
      start: removed.index,
      end: removed.index + removed.delete,
      value: snapshot.value,
    };
  };

  const commitComposition = (comp: CompositionState) => {
    const el = boundEl;
    if (!el) return;

    const tailLength = comp.value.length - comp.end;
    const composedEnd = Math.max(comp.start, el.value.length - tailLength);
    const composed = el.value.slice(comp.start, composedEnd);

    if (composed.length > 0 || comp.docEnd > comp.docStart) {
      processLocalInput(
        new InputEvent("input", { inputType: "insertText", data: composed }),
        { start: comp.docStart, end: comp.docEnd, value: getText(doc.store) },
      );
    }

    applyRemoteToBound(el.value, getText(doc.store));
    before = captureSnapshot(el);
  };

  manageTransport(transport, doc, sv, buffer, onApplied, membership);
  transport.connect();

  const bind = (el: HTMLTextAreaElement) => {
    boundEl = el;

    const text = getText(doc.store);
    if (text) {
      el.value = text;
      before = captureSnapshot(el);
    }

    let unsubJoined: (() => void) | undefined;
    if (!membership.isJoined()) {
      el.readOnly = true;
      unsubJoined = membership.onJoined(() => {
        el.readOnly = false;
        unsubJoined?.();
        unsubJoined = undefined;
      });
    } else {
      el.readOnly = false;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (composition) return;
      if (event.key === "Backspace" || event.key === "Delete") {
        before = captureSnapshot(el);
        pendingInput = true;
      }
    };

    const onBeforeInput = (event: Event) => {
      if (!membership.isJoined()) {
        event.preventDefault();
        return;
      }
      if (composition) return;
      before = captureSnapshot(event.target as HTMLTextAreaElement);
      pendingInput = true;
    };

    const onInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      if (composition || inputEvent.inputType === "insertCompositionText") {
        return;
      }
      if (!before) return;

      if (inputEvent.inputType.startsWith("delete")) {
        const range = resolveDelete(before, el.value);
        if (range) {
          processLocalInput(
            new InputEvent("input", { inputType: "deleteContentForward" }),
            range,
          );
        }
        before = captureSnapshot(el);
        pendingInput = false;
        return;
      }

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

    const onCompositionStart = () => {
      if (!membership.isJoined()) return;
      composition = {
        value: el.value,
        start: el.selectionStart,
        end: el.selectionEnd,
        docStart: el.selectionStart,
        docEnd: el.selectionEnd,
      };
      pendingInput = false;
    };

    const onCompositionEnd = () => {
      const comp = composition;
      composition = null;
      if (comp) commitComposition(comp);
    };

    const refreshSnapshot = () => {
      if (pendingInput || composition) return;
      before = captureSnapshot(el);
    };

    el.addEventListener("keydown", onKeyDown, true);
    el.addEventListener("beforeinput", onBeforeInput);
    el.addEventListener("input", onInput);
    el.addEventListener("compositionstart", onCompositionStart);
    el.addEventListener("compositionend", onCompositionEnd);
    el.addEventListener("click", refreshSnapshot);
    el.addEventListener("select", refreshSnapshot);
    el.addEventListener("keyup", refreshSnapshot);

    return () => {
      unsubJoined?.();
      el.removeEventListener("keydown", onKeyDown, true);
      el.removeEventListener("beforeinput", onBeforeInput);
      el.removeEventListener("input", onInput);
      el.removeEventListener("compositionstart", onCompositionStart);
      el.removeEventListener("compositionend", onCompositionEnd);
      el.removeEventListener("click", refreshSnapshot);
      el.removeEventListener("select", refreshSnapshot);
      el.removeEventListener("keyup", refreshSnapshot);
      if (boundEl === el) boundEl = null;
      composition = null;
    };
  };

  return {
    bind,
    textSubscribe: subscription.subscribe,
    onPresence: membership.onPresence,
    getPresence: () => membership.getPresence(),
    setIdentity: (identity: { name?: string; color?: string }) => {
      if (identity.name !== undefined) presenceName = identity.name;
      if (identity.color !== undefined) presenceColor = identity.color;
    },
    snapshot: (): DocumentSnapshot => takeSnapshot(doc, sv),
    disconnect: () => {
      membership.leave();
      transport.disconnect();
    },
    membership,
  };
};
