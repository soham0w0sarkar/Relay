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
import type { TextChange } from "./types";

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
      name: displayName,
      color: displayColor,
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
  });
  const subscription = createSubscription();

  let before: InputSnapshot | null = null;
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
      unsubJoined?.();
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
    onPresence: membership.onPresence,
    getPresence: () => membership.getPresence(),
    snapshot: (): DocumentSnapshot => takeSnapshot(doc, sv),
    disconnect: () => {
      membership.cancel();
      transport.disconnect();
    },
    membership,
  };
};
