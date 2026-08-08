"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scenario, ScenarioStep } from "../lib/scenarios";
import styles from "./ScenarioPlayer.module.css";

const GUTTER = 84;
const COL_W = 162;
const HEAD_H = 90;
const ROW_TOP = 30;
const ROW_H = 44;
const PAD_BOTTOM = 24;

const TRAVEL_MS = 900;
const STAGGER_MS = 150;
const HOLD_MS = 850;
const NOTE_MS = 1500;

type Hop = { points: number[]; y: number; warn: boolean };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

const pointOnRow = (points: number[], t: number): number => {
  const spans: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const span = Math.abs((points[i] ?? 0) - (points[i - 1] ?? 0));
    spans.push(span);
    total += span;
  }
  if (total === 0) return points[0] ?? 0;

  let travelled = t * total;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i] ?? 0;
    if (travelled <= span || i === spans.length - 1) {
      const from = points[i] ?? 0;
      const to = points[i + 1] ?? 0;
      return from + (to - from) * (span === 0 ? 1 : clamp(travelled / span, 0, 1));
    }
    travelled -= span;
  }
  return points[points.length - 1] ?? 0;
};

export function ScenarioPlayer({ scenario }: { scenario: Scenario }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const packetRefs = useRef<(SVGCircleElement | null)[]>([]);

  const width = GUTTER + COL_W * scenario.columns.length;
  const rowY = useCallback((index: number) => HEAD_H + ROW_TOP + index * ROW_H, []);
  const height = rowY(scenario.steps.length - 1) + PAD_BOTTOM;

  const columnX = useMemo(() => {
    const map = new Map<string, number>();
    scenario.columns.forEach((column, index) => {
      map.set(column.id, GUTTER + COL_W * index + COL_W / 2);
    });
    return map;
  }, [scenario.columns]);

  const x = useCallback((id: string) => columnX.get(id) ?? 0, [columnX]);

  const step = scenario.steps[active];

  const hops = useMemo<Hop[]>(() => {
    if (!step || step.kind !== "send") return [];
    const y = rowY(active);
    const warn = step.tone === "warn";
    const list: Hop[] = [];
    for (const origin of step.from) {
      for (const target of step.to) {
        if (origin === target) continue;
        const points = [x(origin)];
        if (step.via && step.via !== origin && step.via !== target) {
          points.push(x(step.via));
        }
        points.push(x(target));
        list.push({ points, y, warn });
      }
    }
    return list;
  }, [active, rowY, step, x]);

  const state = useMemo(() => {
    const merged: Record<string, string[]> = {};
    for (let index = 0; index <= active; index++) {
      const patch = scenario.steps[index]?.set;
      if (!patch) continue;
      for (const [id, lines] of Object.entries(patch)) merged[id] = lines;
    }
    return merged;
  }, [active, scenario.steps]);

  const dimmed = useMemo(() => {
    const set = new Set<string>();
    for (let index = 0; index <= active; index++) {
      for (const id of scenario.steps[index]?.dim ?? []) set.add(id);
    }
    return set;
  }, [active, scenario.steps]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const place = useCallback(
    (elapsed: number) => {
      hops.forEach((hop, index) => {
        const packet = packetRefs.current[index];
        if (!packet) return;
        const offset = index * STAGGER_MS;
        const local = clamp((elapsed - offset) / TRAVEL_MS, 0, 1);
        packet.setAttribute("cx", String(pointOnRow(hop.points, easeInOut(local))));
        packet.setAttribute("opacity", elapsed < offset ? "0" : "1");
      });
    },
    [hops],
  );

  useEffect(() => {
    packetRefs.current.length = hops.length;

    if (reduced || !playing) {
      place(hops.length * STAGGER_MS + TRAVEL_MS);
      return;
    }

    const total =
      hops.length === 0
        ? NOTE_MS
        : hops.length * STAGGER_MS + TRAVEL_MS + HOLD_MS;

    let raf = 0;
    let startedAt = 0;
    place(0);

    const tick = (now: number) => {
      if (startedAt === 0) startedAt = now;
      const elapsed = now - startedAt;
      place(elapsed);
      if (elapsed >= total) {
        setActive((current) => (current + 1) % scenario.steps.length);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, hops.length, place, playing, reduced, scenario.steps.length]);

  const goTo = (index: number) => {
    setPlaying(false);
    setActive((index + scenario.steps.length) % scenario.steps.length);
  };

  const renderRow = (item: ScenarioStep, index: number) => {
    const y = rowY(index);
    const warn = item.tone === "warn";

    if (item.kind === "note") {
      const positions = item.on.map(x);
      const left = Math.min(...positions);
      const right = Math.max(...positions);
      const textWidth = item.text.length * 6.4 + 32;
      const boxWidth = Math.max(
        positions.length > 1 ? right - left + 140 : 210,
        textWidth,
      );
      const centre = clamp(
        (left + right) / 2,
        boxWidth / 2 + 8,
        width - boxWidth / 2 - 8,
      );
      return (
        <>
          <rect
            x={centre - boxWidth / 2}
            y={y - 14}
            width={boxWidth}
            height={28}
            rx={8}
            className={`${styles.note}${warn ? ` ${styles.noteWarn}` : ""}`}
          />
          <text x={centre} y={y + 4} className={styles.noteText}>
            {item.text}
          </text>
        </>
      );
    }

    const involved = [...item.from, ...item.to, ...(item.via ? [item.via] : [])];
    const positions = involved.map(x);
    const left = Math.min(...positions);
    const right = Math.max(...positions);

    return (
      <>
        <line
          x1={left}
          y1={y}
          x2={right}
          y2={y}
          className={`${styles.wire}${warn ? ` ${styles.wireWarn}` : ""}`}
        />
        <text
          x={(left + right) / 2}
          y={y - 9}
          className={`${styles.wireLabel}${warn ? ` ${styles.wireLabelWarn}` : ""}`}
        >
          {item.wire}
        </text>
        {item.via ? (
          <circle
            cx={x(item.via)}
            cy={y}
            r={3.5}
            className={`${styles.viaDot}${warn ? ` ${styles.viaDotWarn}` : ""}`}
          />
        ) : null}
        {item.from.map((id) => (
          <circle
            key={`origin-${id}`}
            cx={x(id)}
            cy={y}
            r={4}
            className={`${styles.originDot}${warn ? ` ${styles.originDotWarn}` : ""}`}
          />
        ))}
        {item.to.map((id) => {
          const targetX = x(id);
          const priorX = item.via ? x(item.via) : x(item.from[0] ?? id);
          const dir = targetX >= priorX ? 1 : -1;
          return (
            <path
              key={`head-${id}`}
              d={`M ${targetX} ${y} L ${targetX - dir * 9} ${y - 4.5} L ${targetX - dir * 9} ${y + 4.5} Z`}
              className={`${styles.head}${warn ? ` ${styles.headWarn}` : ""}`}
            />
          );
        })}
        {item.selfDeliver
          ? item.from.map((id) => {
              const ox = x(id);
              return (
                <g key={`self-${id}`}>
                  <path
                    d={`M ${ox + 7} ${y - 10} C ${ox + 32} ${y - 16}, ${ox + 32} ${y + 16}, ${ox + 7} ${y + 10}`}
                    className={styles.selfArc}
                  />
                  <path
                    d={`M ${ox + 6} ${y + 11} L ${ox + 16} ${y + 6} L ${ox + 15} ${y + 16} Z`}
                    className={styles.head}
                  />
                </g>
              );
            })
          : null}
      </>
    );
  };

  return (
    <figure className={styles.figure}>
      <div className={styles.chart}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={scenario.caption}
        >
          {scenario.columns.map((column) => {
            const cx = x(column.id);
            const lines = state[column.id] ?? [];
            const isDim = dimmed.has(column.id);
            return (
              <g
                key={column.id}
                className={`${styles.column}${isDim ? ` ${styles.columnDim}` : ""}`}
              >
                <line
                  x1={cx}
                  y1={HEAD_H - 4}
                  x2={cx}
                  y2={height - 10}
                  className={`${styles.lifeline}${
                    column.kind === "hub" ? ` ${styles.lifelineHub}` : ""
                  }`}
                />
                <rect
                  x={cx - 68}
                  y={12}
                  width={136}
                  height={44}
                  rx={10}
                  className={`${styles.chip}${
                    column.kind === "hub" ? ` ${styles.chipHub}` : ""
                  }`}
                />
                <text x={cx} y={30} className={styles.colName}>
                  {column.name}
                </text>
                <text x={cx} y={45} className={styles.colRole}>
                  {column.role}
                </text>
                {lines.slice(0, 2).map((line, lineIndex) => (
                  <text
                    key={line}
                    x={cx}
                    y={70 + lineIndex * 12}
                    className={styles.colState}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          {scenario.steps.map((item, index) => (
            <g
              key={item.title}
              className={`${styles.row} ${
                index === active
                  ? styles.rowActive
                  : index < active
                    ? styles.rowPast
                    : styles.rowFuture
              }`}
            >
              <text x={GUTTER - 18} y={rowY(index) + 4} className={styles.clock}>
                {item.clock}
              </text>
              {renderRow(item, index)}
            </g>
          ))}

          {hops.map((hop, index) => (
            <circle
              key={`packet-${active}-${index}`}
              ref={(element) => {
                packetRefs.current[index] = element;
              }}
              cx={hop.points[0]}
              cy={hop.y}
              r={5}
              opacity={0}
              className={`${styles.packet}${hop.warn ? ` ${styles.packetWarn}` : ""}`}
            />
          ))}

          {scenario.steps.map((item, index) => (
            <rect
              key={`hit-${item.title}`}
              x={0}
              y={rowY(index) - ROW_H / 2}
              width={width}
              height={ROW_H}
              className={styles.hit}
              onClick={() => goTo(index)}
            />
          ))}
        </svg>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <span className={styles.count}>
            Step {active + 1} of {scenario.steps.length}
          </span>
          {step?.tally ? <span className={styles.tally}>{step.tally}</span> : null}
          <span className={styles.spacer} />
          {reduced ? null : (
            <button
              type="button"
              className={styles.control}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? "Pause" : "Play"}
            </button>
          )}
          <button
            type="button"
            className={styles.control}
            onClick={() => goTo(active - 1)}
          >
            Back
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => goTo(active + 1)}
          >
            Next
          </button>
        </div>
        <p className={styles.panelTitle}>{step?.title}</p>
        <p className={styles.panelDetail}>{step?.detail}</p>
      </div>

      <figcaption className={styles.caption}>
        {scenario.caption}
        <span className={styles.legend}>
          Time runs downward. A ring marks the sender, arrowheads mark each
          delivery, and a dashed box is work a peer does on its own. Click any
          row to jump to it.
        </span>
      </figcaption>
    </figure>
  );
}
