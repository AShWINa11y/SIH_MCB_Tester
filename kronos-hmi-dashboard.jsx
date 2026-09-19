

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
 
// ---------------------------------------------------------------------------
// Domain helpers — IEC 60898-1 flavoured math, simplified for demonstration.
// (Unchanged from the original — logic only, no styling here.)
// ---------------------------------------------------------------------------
 
const CURVE_INFO = {
  B: { range: "3\u20135 \u00d7 In", desc: "Resistive loads, cable protection" },
  C: { range: "5\u201310 \u00d7 In", desc: "Inductive loads, motors, transformers" },
  D: { range: "10\u201320 \u00d7 In", desc: "High inrush, transformers, X-ray units" },
};
 
// Peak factor "n" per IEC 60898-1 Annex A, keyed by prospective current band.
function peakFactorFor(kA) {
  if (kA <= 1.5) return 1.41;
  if (kA <= 3) return 1.5;
  if (kA <= 4.5) return 1.7;
  if (kA <= 6) return 2.0;
  if (kA <= 10) return 2.1;
  return 2.2;
}
 
function tripWindowFor(curve) {
  if (curve === "B") return [3.2, 5.6];
  if (curve === "C") return [4.5, 7.2];
  return [5.8, 9.4];
}
 
function randBetween(a, b) {
  return a + Math.random() * (b - a);
}
 
// Builds the full high-resolution waveform up front; the UI then reveals it
// point-by-point to imitate a live oscilloscope sweep.
function buildWaveform({ targetKA, curve, forcedOutcome }) {
  const [tMin, tMax] = tripWindowFor(curve);
  let tripTime = randBetween(tMin, tMax);
  const peakFactor = peakFactorFor(targetKA);
  const peakKA = targetKA * peakFactor * randBetween(0.97, 1.03);
 
  let outcome = forcedOutcome;
  if (outcome === "AUTO") {
    outcome = Math.random() < 0.82 ? "PASS" : "FAIL";
  }
  // A FAIL scenario is dramatized as a delayed / re-striking clearance.
  if (outcome === "FAIL") {
    tripTime = tripTime + randBetween(6, 11);
  }
 
  const totalWindow = Math.max(20, tripTime + 6);
  const stepMs = totalWindow / 260;
  const points = [];
  const riseTime = 1.1; // ms to reach crest
  const freqRad = (2 * Math.PI) / 20; // 50 Hz half-cycle-ish envelope for the demo
 
  for (let i = 0; i <= 260; i++) {
    const t = i * stepMs;
    let iVal = 0;
    if (t < tripTime) {
      const rise = Math.min(1, t / riseTime);
      const envelope = Math.sin(rise * (Math.PI / 2));
      const ripple = 1 - 0.06 * Math.sin(freqRad * t * 4);
      const decayOffset = 0.15 * Math.exp(-t / 6); // DC offset decay, asymmetry
      iVal = peakKA * envelope * ripple + peakKA * decayOffset;
      if (outcome === "FAIL" && t > tripTime - 5) {
        // simulated re-strike / contact bounce before eventual clearance
        iVal += peakKA * 0.18 * Math.sin(t * 6);
      }
    } else if (t < tripTime + 0.35) {
      // arc extinction undershoot
      const k = (t - tripTime) / 0.35;
      iVal = -peakKA * 0.05 * (1 - k);
    } else {
      iVal = 0;
    }
    points.push({ t: Number(t.toFixed(3)), i: Number(iVal.toFixed(3)) });
  }
 
  let energy = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].t - points[i - 1].t) / 1000; // ms -> s
    const avgI2 = (points[i].i ** 2 + points[i - 1].i ** 2) / 2;
    energy += avgI2 * dt; // kA^2 * s
  }
 
  const archTemp = 780 + peakKA * 165 + randBetween(-80, 120);
 
  return {
    points,
    tripTime: Number(tripTime.toFixed(2)),
    peakKA: Number(peakKA.toFixed(2)),
    energy: Number(energy.toFixed(3)),
    temp: Math.round(archTemp),
    outcome,
    totalWindow,
  };
}
 
// ---------------------------------------------------------------------------
// Small presentational atoms — restyled for a clean, high-contrast light UI.
// ---------------------------------------------------------------------------
 
function Panel({ step, title, subtitle, children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60 ${className}`}
    >
      <div className="flex items-baseline gap-2 border-b border-slate-100 px-5 py-3.5">
        {step && (
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-50 font-mono text-[11px] font-semibold text-cyan-700">
            {step}
          </span>
        )}
        <h2 className="text-[14px] font-semibold text-slate-800">{title}</h2>
        {subtitle && (
          <span className="ml-auto text-[11px] text-slate-500">{subtitle}</span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
 
// A sub-card used to visually group one control inside a Panel (per the
// "card containerization" request) without introducing a new Panel header.
function SubCard({ title, right, children, className = "" }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-slate-50/60 p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between">
          {title && (
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-slate-500">
              {title}
            </span>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
 
function StatusChip({ label, ok, onToggle, sub }) {
  return (
    <button
      onClick={onToggle}
      className={`group flex w-full items-center justify-between rounded-lg border-l-4 bg-white px-4 py-3 text-left shadow-sm ring-1 ring-inset transition-colors ${
        ok
          ? "border-l-emerald-500 ring-emerald-100 hover:bg-emerald-50/40"
          : "border-l-red-500 ring-red-100 hover:bg-red-50/40"
      }`}
    >
      <div>
        <div className="text-[13px] font-semibold text-slate-800">{label}</div>
        <div className="text-[11.5px] text-slate-500">{sub}</div>
      </div>
      <span className="flex items-center gap-2">
        <span className="text-[10px] font-mono tracking-wide text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
          tap to simulate
        </span>
        <span
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${
            ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              ok ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {ok ? "OK" : "FAULT"}
        </span>
      </span>
    </button>
  );
}
 
function MetricCard({ label, value, unit, accent = "cyan", live }) {
  const colors = {
    cyan: "text-cyan-700",
    amber: "text-amber-600",
    green: "text-emerald-600",
    red: "text-red-600",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {live && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
        )}
      </div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${colors[accent]}`}>
        {value}
        <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}
 
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
 
const STEPS = [
  { id: "config", n: "01", label: "Configure" },
  { id: "safety", n: "02", label: "Verify Safety" },
  { id: "test", n: "03", label: "Execute Test" },
  { id: "report", n: "04", label: "Audit Report" },
];
 
export default function KronosHMI() {
  const [curve, setCurve] = useState("C");
  const [targetKA, setTargetKA] = useState(10);
  const [interlocks, setInterlocks] = useState(false);
  const [status, setStatus] = useState({ enclosure: true, thermal: true, power: true });
  const [forcedOutcome, setForcedOutcome] = useState("AUTO");
 
  const [phase, setPhase] = useState("idle"); // idle | arming | running | complete
  const [waveShown, setWaveShown] = useState([]);
  const [run, setRun] = useState(null); // full precomputed run data
  const [countdown, setCountdown] = useState(3);
  const [clock, setClock] = useState(new Date());
  const [sessionId] = useState(
    () => `SIH26-KRONOS-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [reportOpen, setReportOpen] = useState(false);
 
  const timerRef = useRef(null);
 
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
 
  const allSafe = interlocks && status.enclosure && status.thermal && status.power;
  const activeStep =
    phase === "complete" ? "report" : phase === "idle" ? (interlocks ? "safety" : "config") : "test";
 
  const toggleStatus = (key) => {
    if (phase === "running" || phase === "arming") return;
    setStatus((s) => ({ ...s, [key]: !s[key] }));
  };
 
  const reset = useCallback(() => {
    clearInterval(timerRef.current);
    setPhase("idle");
    setWaveShown([]);
    setRun(null);
    setReportOpen(false);
  }, []);
 
  const startTest = () => {
    if (!allSafe || phase !== "idle") return;
    setPhase("arming");
    setCountdown(3);
    setReportOpen(false);
    let n = 3;
    const armTimer = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(armTimer);
        launchWaveform();
      }
    }, 500);
  };
 
  const launchWaveform = () => {
    const data = buildWaveform({ targetKA, curve, forcedOutcome });
    setRun(data);
    setWaveShown([]);
    setPhase("running");
    let idx = 0;
    const chunk = 4;
    timerRef.current = setInterval(() => {
      idx += chunk;
      setWaveShown(data.points.slice(0, idx));
      if (idx >= data.points.length) {
        clearInterval(timerRef.current);
        setPhase("complete");
      }
    }, 22);
  };
 
  useEffect(() => () => clearInterval(timerRef.current), []);
 
  // live-updating metric readouts derived from whatever of the waveform has
  // been revealed so far, finalized once the run completes.
  const liveMax =
    waveShown.length > 0 ? Math.max(...waveShown.map((p) => p.i)) : 0;
  const displayPeak = run ? (phase === "complete" ? run.peakKA : liveMax).toFixed(2) : "0.00";
  const displayTrip = run && phase === "complete" ? run.tripTime.toFixed(2) : phase === "running" ? "\u2014" : "0.00";
  const displayEnergy = run && phase === "complete" ? run.energy.toFixed(2) : phase === "running" ? "\u2014" : "0.00";
  const displayTemp = run
    ? phase === "complete"
      ? run.temp
      : Math.round((liveMax / (run.peakKA || 1)) * run.temp)
    : 0;
 
  const passed = run?.outcome === "PASS";
 
  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-800 font-sans">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-600">
            <span className="font-mono text-sm font-bold text-white">K</span>
          </div>
          <div>
            <div className="text-[14px] font-semibold leading-tight text-[#1e293b]">
              Team Kronos - MCB Breaking Capacity Test Bench
            </div>
            <div className="text-[11.5px] leading-tight text-[#475569]">
              Automated High-Current Short-Circuit Test System
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11.5px] text-[#475569]">
          <span>
            Standard:{" "}
            <span className="font-semibold text-[#1e293b]">IEC&nbsp;60898-1:2015</span>
          </span>
          <span>
            Session: <span className="font-semibold text-[#1e293b]">{sessionId}</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ONLINE
          </span>
          <span className="font-semibold text-[#1e293b]">
            {clock.toLocaleTimeString("en-IN", { hour12: false })}
          </span>
        </div>
      </header>
 
      {/* Step rail */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white px-5 text-[11.5px]">
        {STEPS.map((s, idx) => (
          <div
            key={s.id}
            className={`flex items-center gap-2 border-r border-slate-100 px-4 py-2.5 ${
              activeStep === s.id
                ? "border-b-2 border-b-cyan-600 font-semibold text-cyan-700"
                : "text-slate-400"
            }`}
          >
            <span className="font-mono">{s.n}</span>
            <span className="tracking-wide">{s.label}</span>
            {idx < STEPS.length - 1 && <span className="ml-3 text-slate-300">/</span>}
          </div>
        ))}
      </div>
 
      {/* Main grid */}
      <main className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-12">
        {/* Left column */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <Panel step="01" title="Pre-Test Configuration">
            <div className="space-y-4">
              <SubCard
                title="MCB Curve Type"
                right={
                  <span className="text-[11px] text-slate-500">
                    {CURVE_INFO[curve].range}
                  </span>
                }
              >
                <div className="grid grid-cols-3 gap-2.5">
                  {["B", "C", "D"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurve(c)}
                      disabled={phase !== "idle"}
                      className={`rounded-lg border-2 px-2 py-3 text-center transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        curve === c
                          ? "border-cyan-600 bg-cyan-50 text-cyan-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-mono text-xl font-bold">{c}</div>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[11.5px] text-slate-500">
                  {CURVE_INFO[curve].desc}
                </p>
              </SubCard>
 
              <SubCard
                title="Target Prospective Fault Current"
                right={
                  <span className="rounded-md bg-cyan-600 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-white">
                    {targetKA.toFixed(1)} kA
                  </span>
                }
              >
                <input
                  type="range"
                  min={1}
                  max={25}
                  step={0.5}
                  value={targetKA}
                  disabled={phase !== "idle"}
                  onChange={(e) => setTargetKA(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <div className="mt-2.5 flex justify-between text-[10.5px] font-medium text-slate-400">
                  <span>1 kA</span>
                  <span>6</span>
                  <span>10</span>
                  <span>16</span>
                  <span>25 kA</span>
                </div>
              </SubCard>
 
              <SubCard>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-semibold text-[#1e293b]">
                      Engage Safety Interlocks
                    </div>
                    <div className="text-[11.5px] text-[#475569]">
                      Required to arm the high-current source
                    </div>
                  </div>
                  <button
                    onClick={() => phase === "idle" && setInterlocks((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      interlocks ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        interlocks ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </SubCard>
 
              <SubCard title="Simulation Outcome (demo control)">
                <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                  {[
                    ["AUTO", "Auto"],
                    ["PASS", "Force Pass"],
                    ["FAIL", "Force Fail"],
                  ].map(([val, lbl]) => (
                    <button
                      key={val}
                      disabled={phase !== "idle"}
                      onClick={() => setForcedOutcome(val)}
                      className={`rounded-md border-2 px-2 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        forcedOutcome === val
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </SubCard>
            </div>
          </Panel>
 
          <Panel step="02" title="System Status &amp; Safety">
            <div className="space-y-2.5">
              <StatusChip
                label="Enclosure Locked"
                sub="Hazard chamber physically sealed"
                ok={status.enclosure}
                onToggle={() => toggleStatus("enclosure")}
              />
              <StatusChip
                label="Thermal Camera Online"
                sub="Arc &amp; contact surface monitoring"
                ok={status.thermal}
                onToggle={() => toggleStatus("thermal")}
              />
              <StatusChip
                label="Power Bank Charged"
                sub="High-current discharge capacitor bank"
                ok={status.power}
                onToggle={() => toggleStatus("power")}
              />
            </div>
 
            <button
              onClick={startTest}
              disabled={!allSafe || phase !== "idle"}
              className={`mt-5 w-full rounded-lg py-3.5 text-center text-sm font-bold tracking-wide transition-all ${
                allSafe && phase === "idle"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30 hover:bg-cyan-700"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              {phase === "arming"
                ? `ARMING \u2014 T-${countdown}`
                : phase === "running"
                ? "TEST IN PROGRESS"
                : phase === "complete"
                ? "TEST COMPLETE"
                : allSafe
                ? "\u25b8 INITIATE TEST"
                : "INTERLOCKS NOT SATISFIED"}
            </button>
            {phase === "complete" && (
              <button
                onClick={reset}
                className="mt-2.5 w-full rounded-lg border border-slate-200 py-2.5 text-[12.5px] font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-50"
              >
                Reset for Next Sample
              </button>
            )}
            <p className="mt-3.5 text-[11px] leading-relaxed text-slate-500">
              Operator remains outside the hazard boundary for the full test
              cycle &mdash; the enclosure isolates fault energy so no human is
              exposed to arc flash, flying contacts, or acoustic shock.
            </p>
          </Panel>
        </div>
 
        {/* Right column */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          <Panel
            step="03"
            title="Live Telemetry &amp; Waveform"
            subtitle={
              run
                ? `Window: 0\u2013${run.totalWindow.toFixed(1)} ms`
                : "Awaiting test initiation"
            }
          >
            <div className="h-64 w-full rounded-lg border border-slate-100 bg-white p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={waveShown} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0891B2" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0891B2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[0, run ? run.totalWindow : 20]}
                    tick={{ fill: "#64748B", fontSize: 10 }}
                    stroke="#CBD5E1"
                    label={{ value: "Time (ms)", position: "insideBottom", offset: -2, fill: "#475569", fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fill: "#64748B", fontSize: 10 }}
                    stroke="#CBD5E1"
                    width={40}
                    label={{ value: "Current (kA)", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: "#FFFFFF", border: "1px solid #E2E8F0", fontSize: 11, borderRadius: 8 }}
                    labelStyle={{ color: "#475569" }}
                    formatter={(v) => [`${v} kA`, "Current"]}
                    labelFormatter={(l) => `t = ${l} ms`}
                  />
                  {run && (
                    <ReferenceLine
                      x={run.tripTime}
                      stroke={passed ? "#10B981" : "#EF4444"}
                      strokeDasharray="4 2"
                      label={{
                        value: phase === "complete" ? "TRIP" : "",
                        position: "top",
                        fill: passed ? "#10B981" : "#EF4444",
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Area type="monotone" dataKey="i" stroke="none" fill="url(#waveFill)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="i" stroke="#0891B2" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
 
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Peak Current" value={displayPeak} unit="kA" accent="cyan" live={phase === "running"} />
              <MetricCard label="Clearing Time" value={displayTrip} unit="ms" accent="amber" live={phase === "running"} />
              <MetricCard label="Let-through I\u00b2t" value={displayEnergy} unit="kA\u00b2s" accent="cyan" live={phase === "running"} />
              <MetricCard label="Est. Arc Temp" value={displayTemp || 0} unit="\u00b0C" accent="red" live={phase === "running"} />
            </div>
          </Panel>
 
          <Panel step="04" title="Automated Results &amp; Compliance">
            {phase !== "complete" ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[12.5px] text-slate-400">
                Run a test cycle to generate a compliance verdict.
              </div>
            ) : (
              <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:justify-between">
                <div
                  className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 py-7 ${
                    passed
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-red-300 bg-red-50"
                  }`}
                >
                  <div
                    className={`font-mono text-5xl font-extrabold tracking-wide ${
                      passed ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {passed ? "PASS" : "FAIL"}
                  </div>
                  <div className="mt-2 text-[11.5px] text-slate-500">
                    IEC 60898-1:2015 &middot; Breaking Capacity Clause 9.11
                  </div>
                </div>
 
                <div className="flex-1 space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-[12.5px] text-slate-600">
                  <Row label="MCB Curve" value={`Type ${curve}`} />
                  <Row label="Target I(cs)" value={`${targetKA.toFixed(1)} kA`} />
                  <Row label="Recorded Peak" value={`${run.peakKA.toFixed(2)} kA`} />
                  <Row label="Clearing Time" value={`${run.tripTime.toFixed(2)} ms`} />
                  <Row
                    label="Verdict Basis"
                    value={
                      passed
                        ? "Cleared within instantaneous window, no re-strike"
                        : "Clearance exceeded window / re-strike detected"
                    }
                  />
                  <button
                    onClick={() => setReportOpen(true)}
                    className="mt-3 w-full rounded-lg bg-cyan-600 py-2.5 text-[12.5px] font-semibold tracking-wide text-white shadow-sm hover:bg-cyan-700"
                  >
                    Generate Digital Audit Report
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </main>
 
      {reportOpen && run && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="text-[12px] text-slate-500">Digital Audit Report</div>
              <div className="font-mono text-sm font-semibold text-cyan-700">{sessionId}</div>
            </div>
            <div className="space-y-2.5 px-5 py-4 text-[12.5px] text-slate-600">
              <Row label="Standard" value="IEC 60898-1:2015" />
              <Row label="Curve / Rating" value={`Type ${curve}`} />
              <Row label="Target Current" value={`${targetKA.toFixed(1)} kA`} />
              <Row label="Peak Current" value={`${run.peakKA.toFixed(2)} kA`} />
              <Row label="Clearing Time" value={`${run.tripTime.toFixed(2)} ms`} />
              <Row label="Let-through I\u00b2t" value={`${run.energy.toFixed(2)} kA\u00b2s`} />
              <Row label="Est. Arc Temp" value={`${run.temp} \u00b0C`} />
              <Row label="Operator Exposure" value="None \u2014 remote-isolated cycle" />
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="font-medium text-slate-500">Verdict</span>
                <span
                  className={`font-mono text-lg font-bold ${
                    passed ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {passed ? "PASS" : "FAIL"}
                </span>
              </div>
            </div>
            <div className="flex gap-2.5 border-t border-slate-100 px-5 py-4">
              <button
                onClick={() => setReportOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-[12.5px] font-medium text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={() => setReportOpen(false)}
                className="flex-1 rounded-lg bg-cyan-600 py-2.5 text-[12.5px] font-semibold text-white hover:bg-cyan-700"
              >
                Export PDF (demo)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono font-medium text-slate-700">{value}</span>
    </div>
  );
}
 
