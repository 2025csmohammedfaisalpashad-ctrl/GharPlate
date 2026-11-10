import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../services/api";
import { useHousehold } from "../hooks/useHousehold";
import {
  HeartPulse,
  Droplet,
  Scale,
  History,
  Trash2,
  Edit3,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Clock,
  ShieldCheck,
  Target,
} from "lucide-react";

const AHA_HOME_BP_URL =
  "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home";
const ICMR_HTN_URL =
  "https://www.icmr.gov.in/icmrobject/uploads/STWs/1778941063_hypertensioninadults_final.pdf";
const ADA_GLUCOSE_URL =
  "https://diabetesjournals.org/care/article/48/Supplement_1/S128/157561/6-Glycemic-Goals-and-Hypoglycemia-Standards-of";
const ICMR_DIABETES_URL =
  "https://www.icmr.gov.in/icmrobject/custom_data/pdf/resource-guidelines/ICMR_GuidelinesType2diabetes2018_0.pdf";

function statusBadgeStyle(toneOrColor?: string) {
  switch (toneOrColor) {
    case "normal":
    case "emerald":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "monitor":
    case "amber":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "caution":
    case "orange":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "rose":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "urgent":
    case "red":
      return "bg-red-100 text-red-900 border-red-300 font-bold";
    default:
      return "bg-stone-100 text-stone-700 border-stone-200";
  }
}

export const HealthMeasurementsSubNav: React.FC = () => {
  const location = useLocation();
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      to: "/health/measurements",
      exact: true,
    },
    {
      id: "blood-pressure",
      label: "Blood Pressure",
      to: "/health/blood-pressure",
    },
    {
      id: "blood-glucose",
      label: "Blood Glucose",
      to: "/health/blood-glucose",
    },
    {
      id: "body-measurements",
      label: "Body Measurements",
      to: "/fitness/goals",
    },
  ];

  return (
    <div
      data-testid="health-measurements-tabs"
      className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-stone-200/90 bg-white p-1.5 shadow-2xs"
    >
      {tabs.map((t) => {
        const active = t.exact
          ? location.pathname === t.to
          : location.pathname.startsWith(t.to);
        return (
          <Link
            key={t.id}
            to={t.to}
            data-testid={`health-tab-${t.id}`}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-emerald-800 text-white shadow-2xs"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
};

export const DualSeriesLineChart: React.FC<{
  points: {
    date: string;
    systolic: number;
    diastolic: number;
    pulse?: number | null;
  }[];
  targetSystolicMax?: number | null;
  targetDiastolicMax?: number | null;
}> = ({ points, targetSystolicMax, targetDiastolicMax }) => {
  if (!points || points.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-stone-200/80">
        No recorded blood pressure sessions in this window yet. Missing days are never invented.
      </div>
    );
  }
  const allVals = points.flatMap((p) => [p.systolic, p.diastolic]);
  if (targetSystolicMax) allVals.push(targetSystolicMax);
  if (targetDiastolicMax) allVals.push(targetDiastolicMax);
  const minVal = Math.max(40, Math.min(...allVals) - 10);
  const maxVal = Math.min(240, Math.max(...allVals) + 12);
  const range = Math.max(maxVal - minVal, 20);
  const width = 580;
  const height = 175;

  const toX = (i: number) =>
    points.length === 1 ? width / 2 : 36 + (i / (points.length - 1)) * (width - 64);
  const toY = (val: number) => height - 26 - ((val - minVal) / range) * (height - 48);

  const sysPoints = points.map((p, i) => `${toX(i)},${toY(p.systolic)}`).join(" ");
  const diaPoints = points.map((p, i) => `${toX(i)},${toY(p.diastolic)}`).join(" ");

  return (
    <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-stone-200/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-stone-600">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 inline-block" /> Systolic (mmHg)
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-stone-700">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-500 inline-block" /> Diastolic (mmHg)
          </span>
        </div>
        <span className="text-[11px] text-stone-400">
          Actual recorded readings only ({points.length} reading{points.length === 1 ? "" : "s"})
        </span>
      </div>
      <svg
        data-testid="bp-svg-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-44 overflow-visible"
      >
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={28}
            x2={width - 20}
            y1={22 + r * (height - 48)}
            y2={22 + r * (height - 48)}
            stroke="#e7e5e4"
            strokeWidth="1"
          />
        ))}
        {targetSystolicMax && (
          <line
            x1={28}
            x2={width - 20}
            y1={toY(targetSystolicMax)}
            y2={toY(targetSystolicMax)}
            stroke="#047857"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}
        {targetDiastolicMax && (
          <line
            x1={28}
            x2={width - 20}
            y1={toY(targetDiastolicMax)}
            y2={toY(targetDiastolicMax)}
            stroke="#78716c"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}
        {points.length > 1 && (
          <>
            <polyline
              fill="none"
              stroke="#047857"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sysPoints}
            />
            <polyline
              fill="none"
              stroke="#57534e"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={diaPoints}
            />
          </>
        )}
        {points.map((p, idx) => (
          <g key={`${p.date}-${idx}`}>
            <circle cx={toX(idx)} cy={toY(p.systolic)} r="3.5" fill="#047857">
              <title>{`${p.date}: ${p.systolic}/${p.diastolic} mmHg`}</title>
            </circle>
            <text
              x={toX(idx)}
              y={toY(p.systolic) - 7}
              textAnchor="middle"
              className="text-[9px] fill-emerald-900 font-semibold"
            >
              {p.systolic}
            </text>
            <circle cx={toX(idx)} cy={toY(p.diastolic)} r="3.5" fill="#57534e">
              <title>{`${p.date}: Diastolic ${p.diastolic} mmHg`}</title>
            </circle>
            <text
              x={toX(idx)}
              y={toY(p.diastolic) + 12}
              textAnchor="middle"
              className="text-[9px] fill-stone-700 font-semibold"
            >
              {p.diastolic}
            </text>
            <text
              x={toX(idx)}
              y={height - 6}
              textAnchor="middle"
              className="text-[9px] fill-stone-500"
            >
              {p.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export const GlucoseSeriesChart: React.FC<{
  points: { date: string; value_mg_dl: number; context_label?: string }[];
  label: string;
  color?: string;
}> = ({ points, label, color = "#047857" }) => {
  if (!points || points.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center text-xs text-stone-400 bg-stone-50 rounded-xl border border-stone-200/80">
        No recorded {label.toLowerCase()} readings in this window.
      </div>
    );
  }
  const vals = points.map((p) => p.value_mg_dl);
  const minVal = Math.max(40, Math.min(...vals) - 12);
  const maxVal = Math.min(400, Math.max(...vals) + 15);
  const range = Math.max(maxVal - minVal, 20);
  const width = 540;
  const height = 150;
  const toX = (i: number) =>
    points.length === 1 ? width / 2 : 34 + (i / (points.length - 1)) * (width - 60);
  const toY = (v: number) => height - 24 - ((v - minVal) / range) * (height - 44);
  const poly = points.map((p, i) => `${toX(i)},${toY(p.value_mg_dl)}`).join(" ");

  return (
    <div className="bg-[#FAF8F5] rounded-2xl p-4 border border-stone-200/80">
      <div className="flex items-center justify-between text-xs text-stone-600 mb-1.5">
        <span className="font-semibold text-stone-800">{label}</span>
        <span className="text-[11px] text-stone-400">{points.length} reading(s) in mg/dL</span>
      </div>
      <svg
        data-testid="glucose-svg-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 overflow-visible"
      >
        {[0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={28}
            x2={width - 20}
            y1={20 + r * (height - 44)}
            y2={20 + r * (height - 44)}
            stroke="#e7e5e4"
            strokeWidth="1"
          />
        ))}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={poly}
          />
        )}
        {points.map((p, idx) => (
          <g key={`${p.date}-${idx}`}>
            <circle cx={toX(idx)} cy={toY(p.value_mg_dl)} r="3.5" fill={color}>
              <title>{`${p.date}: ${p.value_mg_dl} mg/dL`}</title>
            </circle>
            <text
              x={toX(idx)}
              y={toY(p.value_mg_dl) - 7}
              textAnchor="middle"
              className="text-[9px] fill-stone-700 font-semibold"
            >
              {Math.round(p.value_mg_dl)}
            </text>
            <text
              x={toX(idx)}
              y={height - 5}
              textAnchor="middle"
              className="text-[9px] fill-stone-500"
            >
              {p.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// ============================================================================
// 1. HEALTH MEASUREMENTS WORKSPACE (/health/measurements)
// ============================================================================
export const HealthMeasurementsWorkspacePage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [summary, setSummary] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [historyDays, setHistoryDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      const [sumRes, histRes, tlRes] = await Promise.all([
        api.getHealthMeasurementsSummary(activeMember?.id, 30),
        api.getHealthMeasurementsHistory({
          member_id: activeMember?.id,
          days: historyDays,
        }),
        api.getDailyActivityTimeline(activeMember?.id),
      ]);
      setSummary(sumRes);
      setHistoryData(histRes);
      setTimeline(tlRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [activeMember?.id, historyDays]);

  const latestBp =
    summary?.blood_pressure?.latest || summary?.blood_pressure?.latest_reading;
  const latestBg =
    summary?.blood_glucose?.latest || summary?.blood_glucose?.latest_reading;
  const latestBody = summary?.body_measurements?.latest;

  const bpSys = latestBp?.systolic_mmhg ?? latestBp?.systolic_mm_hg;
  const bpDia = latestBp?.diastolic_mmhg ?? latestBp?.diastolic_mm_hg;
  const bgVal = latestBg?.entered_value ?? latestBg?.glucose_value;
  const bgUnit = latestBg?.entered_unit ?? latestBg?.unit ?? "mg/dL";
  const bgCtx = latestBg?.context_label ?? latestBg?.measurement_context_label;

  return (
    <div className="space-y-6" data-testid="health-measurements-workspace">
      <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <HeartPulse className="w-3.5 h-3.5" /> Health Measurements
          </span>
          <h1 className="text-2xl font-extrabold text-stone-900 mt-2">
            Personal Vitals &amp; Clinical Measurement Log
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Optional self-monitoring for{" "}
            <span className="font-semibold text-stone-900">
              {summary?.member?.display_name ||
                activeMember?.display_name ||
                "Active Profile"}
            </span>
            . Switch between Overview, Blood Pressure, Blood Glucose, and Body Measurements below.
          </p>
        </div>
        <HealthMeasurementsSubNav />
      </div>

      {/* 3 Clean Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Blood Pressure */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700">
                <HeartPulse className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-stone-500">
                {summary?.blood_pressure?.total_readings_14d ?? 0} logs (14d)
              </span>
            </div>
            <h2 className="text-base font-bold text-stone-900">Blood Pressure</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Systolic, diastolic, pulse &amp; morning/evening trends
            </p>
            {latestBp ? (
              <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] border border-stone-200/70">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-stone-900">
                    {bpSys}/{bpDia}{" "}
                    <span className="text-xs font-normal text-stone-500">mmHg</span>
                  </span>
                  {latestBp.pulse_bpm && (
                    <span className="text-xs text-stone-600">{latestBp.pulse_bpm} bpm</span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${statusBadgeStyle(
                      latestBp.interpretation?.status_tone ||
                        latestBp.classification?.color
                    )}`}
                  >
                    {latestBp.interpretation?.category_label ||
                      latestBp.classification?.label ||
                      "Recorded"}
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {latestBp.logged_date || latestBp.measured_at?.slice(0, 10)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] border border-dashed border-stone-200 text-xs text-stone-500">
                No readings logged yet. Optional for hypertension or heart monitoring.
              </div>
            )}
          </div>
          <Link
            to="/health/blood-pressure"
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-800 text-white hover:bg-emerald-700 text-xs font-semibold transition"
          >
            Open Blood Pressure →
          </Link>
        </div>

        {/* Card 2: Blood Glucose */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700">
                <Droplet className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-stone-500">
                {summary?.blood_glucose?.total_readings_14d ?? 0} logs (14d)
              </span>
            </div>
            <h2 className="text-base font-bold text-stone-900">Blood Glucose</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Fasting, pre-meal, post-meal &amp; bedtime in mg/dL or mmol/L
            </p>
            {latestBg ? (
              <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] border border-stone-200/70">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-stone-900">
                    {bgVal}{" "}
                    <span className="text-xs font-normal text-stone-500">{bgUnit}</span>
                  </span>
                  <span className="text-[11px] font-medium text-stone-600">{bgCtx}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-stone-500">
                    {latestBg.value_mg_dl} mg/dL ({latestBg.value_mmol_l} mmol/L)
                  </span>
                  <span className="text-[11px] text-stone-400">
                    {latestBg.logged_date || latestBg.measured_at?.slice(0, 10)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] border border-dashed border-stone-200 text-xs text-stone-500">
                No glucose readings logged yet. Supports mg/dL and mmol/L.
              </div>
            )}
          </div>
          <Link
            to="/health/blood-glucose"
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-800 text-white hover:bg-emerald-700 text-xs font-semibold transition"
          >
            Open Blood Glucose →
          </Link>
        </div>

        {/* Card 3: Body Measurements */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700">
                <Scale className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-medium text-stone-500">
                {summary?.body_measurements?.recent_count || 0} entries
              </span>
            </div>
            <h2 className="text-base font-bold text-stone-900">Body Measurements</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Weight, waist circumference &amp; fitness milestones
            </p>
            {latestBody ? (
              <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] border border-stone-200/70">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-stone-900">
                    {latestBody.weight_kg ?? "—"}{" "}
                    <span className="text-xs font-normal text-stone-500">kg</span>
                  </span>
                  {latestBody.waist_cm && (
                    <span className="text-xs text-stone-600">Waist {latestBody.waist_cm} cm</span>
                  )}
                </div>
                <div className="mt-1.5 text-[11px] text-stone-400">
                  Logged {latestBody.logged_date || latestBody.logged_at?.slice(0, 10)}
                </div>
              </div>
            ) : (
              <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] border border-dashed border-stone-200 text-xs text-stone-500">
                Track weight and waist trend lines in Goals &amp; Habits or Progress Analytics.
              </div>
            )}
          </div>
          <Link
            to="/fitness/goals"
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 text-stone-800 hover:bg-stone-200 text-xs font-semibold transition"
          >
            Open Body Progress →
          </Link>
        </div>
      </div>

      {/* Unified Chronological Daily Activity Timeline + Recent History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-800" /> Recent Health Readings
              </h2>
              <p className="text-xs text-stone-500">
                Recorded Blood Pressure and Blood Glucose logs
              </p>
            </div>
            <select
              aria-label="Filter history range"
              value={historyDays}
              onChange={(e) => setHistoryDays(Number(e.target.value))}
              className="text-xs border border-stone-200 rounded-xl px-2.5 py-1.5 bg-[#FAF8F5] text-stone-700 font-medium"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-stone-400">Loading history...</div>
          ) : (
            <div className="space-y-3">
              {(historyData?.blood_pressure?.readings || []).slice(0, 4).map((bp: any) => (
                <div
                  key={`bp-${bp.id}`}
                  className="flex items-center justify-between rounded-2xl border border-stone-200/70 bg-[#FAF8F5] px-4 py-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-900">
                      BP: {bp.systolic_mmhg}/{bp.diastolic_mmhg} mmHg
                    </span>
                    <span className="text-stone-500 ml-2">
                      ({bp.time_of_day}, {bp.reading_sequence?.replace("_", " ")})
                    </span>
                  </div>
                  <span className="text-stone-400">{bp.logged_date}</span>
                </div>
              ))}
              {(historyData?.blood_glucose?.readings || []).slice(0, 4).map((bg: any) => (
                <div
                  key={`bg-${bg.id}`}
                  className="flex items-center justify-between rounded-2xl border border-stone-200/70 bg-[#FAF8F5] px-4 py-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-900">
                      Glucose: {bg.entered_value} {bg.entered_unit}
                    </span>
                    <span className="text-stone-500 ml-2">({bg.context_label})</span>
                  </div>
                  <span className="text-stone-400">{bg.logged_date}</span>
                </div>
              ))}
              {!(historyData?.blood_pressure?.readings || []).length &&
                !(historyData?.blood_glucose?.readings || []).length && (
                  <div className="py-8 text-center text-xs text-stone-500 bg-[#FAF8F5] rounded-2xl border border-dashed border-stone-200">
                    No BP or glucose readings recorded in this window yet.
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Today's Unified Timeline */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs">
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-800" /> Today&apos;s Activity Timeline
          </h2>
          <p className="text-xs text-stone-500 mt-0.5 mb-4">
            Meals, water, vitals, workouts &amp; completed habits in chronological order
          </p>

          {!timeline?.events?.length ? (
            <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-dashed border-stone-200 text-xs text-stone-500">
              No events logged for today yet. Use Quick Add in the top header to log food, water, or vitals.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {timeline.events.map((ev: any, i: number) => (
                <div
                  key={`${ev.id}-${i}`}
                  className="p-3 rounded-2xl bg-[#FAF8F5] border border-stone-200/70 flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{ev.icon || "•"}</span>
                      <span className="text-xs font-semibold text-stone-900">{ev.title}</span>
                    </div>
                    {ev.subtitle && (
                      <p className="text-[11px] text-stone-500 mt-0.5">{ev.subtitle}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-stone-400 whitespace-nowrap">
                    {ev.time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BLOOD PRESSURE TRACKER (/health/blood-pressure)
// ============================================================================
export const BloodPressureTrackerPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [bpData, setBpData] = useState<any>(null);
  const [daysWindow, setDaysWindow] = useState<number>(30);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showTargetForm, setShowTargetForm] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Entry form state
  const [systolic, setSystolic] = useState<string>("122");
  const [diastolic, setDiastolic] = useState<string>("78");
  const [pulse, setPulse] = useState<string>("72");
  const [loggedDate, setLoggedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [loggedTime, setLoggedTime] = useState<string>("08:00");
  const [timeOfDay, setTimeOfDay] = useState<string>("morning");
  const [armUsed, setArmUsed] = useState<string>("left");
  const [bodyPosition, setBodyPosition] = useState<string>("seated");
  const [readingSequence, setReadingSequence] = useState<string>("first");
  const [notes, setNotes] = useState<string>("");

  // Clinician Target State
  const [targetSysMin, setTargetSysMin] = useState<string>("90");
  const [targetSysMax, setTargetSysMax] = useState<string>("130");
  const [targetDiaMin, setTargetDiaMin] = useState<string>("60");
  const [targetDiaMax, setTargetDiaMax] = useState<string>("80");
  const [targetSavedMsg, setTargetSavedMsg] = useState<string | null>(null);

  const fetchBp = async () => {
    setLoading(true);
    try {
      const res = await api.getBloodPressure({
        member_id: activeMember?.id,
        days: daysWindow,
      });
      setBpData(res);
      const td = res?.clinician_target?.target_details;
      if (td) {
        if (td.systolic_min) setTargetSysMin(String(td.systolic_min));
        if (td.systolic_max) setTargetSysMax(String(td.systolic_max));
        if (td.diastolic_min) setTargetDiaMin(String(td.diastolic_min));
        if (td.diastolic_max) setTargetDiaMax(String(td.diastolic_max));
      }
    } catch (e: any) {
      setError(e.message || "Failed to load blood pressure records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBp();
  }, [activeMember?.id, daysWindow]);

  const handleSaveBp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        member_id: activeMember?.id,
        systolic_mmhg: Number(systolic),
        diastolic_mmhg: Number(diastolic),
        pulse_bpm: pulse ? Number(pulse) : null,
        logged_date: loggedDate,
        logged_time: loggedTime,
        time_of_day: timeOfDay,
        measurement_arm: armUsed,
        measurement_position: bodyPosition,
        reading_sequence: readingSequence,
        notes: notes.trim() || undefined,
      };
      if (editingId) {
        await api.updateBloodPressure(editingId, payload);
        setEditingId(null);
      } else {
        await api.addBloodPressure(payload);
      }
      setNotes("");
      await fetchBp();
    } catch (err: any) {
      setError(err.message || "Unable to save blood pressure reading.");
    }
  };

  const handleEditBp = (r: any) => {
    setEditingId(r.id);
    setSystolic(String(r.systolic_mmhg ?? r.systolic_mm_hg));
    setDiastolic(String(r.diastolic_mmhg ?? r.diastolic_mm_hg));
    setPulse(r.pulse_bpm ? String(r.pulse_bpm) : "");
    setLoggedDate(r.logged_date || new Date().toISOString().slice(0, 10));
    setLoggedTime(r.logged_time || "08:00");
    setTimeOfDay(r.time_of_day || "morning");
    setArmUsed(r.measurement_arm || "left");
    setBodyPosition(r.measurement_position || "seated");
    setReadingSequence(r.reading_sequence || "first");
    setNotes(r.notes || "");
  };

  const handleDeleteBp = async (id: number) => {
    await api.deleteBloodPressure(id);
    await fetchBp();
  };

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.saveHealthMeasurementTarget({
      member_id: activeMember?.id,
      measurement_type: "blood_pressure",
      target_details: {
        systolic_min: Number(targetSysMin) || 90,
        systolic_max: Number(targetSysMax) || 130,
        diastolic_min: Number(targetDiaMin) || 60,
        diastolic_max: Number(targetDiaMax) || 80,
      },
      clinician_confirmed: true,
    });
    setTargetSavedMsg("Saved clinician blood pressure target range.");
    setTimeout(() => setTargetSavedMsg(null), 3000);
    await fetchBp();
  };

  const latest = bpData?.latest_reading;
  const chartPoints = (bpData?.monthly_series || [])
    .filter((d: any) => d.status === "reading_recorded" && d.systolic_mmhg !== null)
    .map((d: any) => ({
      date: d.date,
      systolic: d.systolic_mmhg,
      diastolic: d.diastolic_mmhg,
      pulse: d.pulse_bpm,
    }));

  return (
    <div className="space-y-6" data-testid="blood-pressure-tracker-page">
      {/* Header + Internal Tabs */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-emerald-800" /> Blood Pressure &amp; Pulse Tracker
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Record home sessions, compare morning vs. evening averages, and review trends without interpolating missing days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthMeasurementsSubNav />
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition"
            data-testid="toggle-bp-guide"
          >
            <Info className="w-3.5 h-3.5 text-emerald-800" />
            Measurement Guide
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Home BP Measurement Guidance */}
      {showGuide && (
        <div
          className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-3 text-xs text-stone-700"
          data-testid="bp-measurement-guide"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-800" /> Home Blood Pressure Measurement Checklist (AHA &amp; ICMR Guidance)
            </h2>
            <div className="flex items-center gap-3">
              <a
                href={AHA_HOME_BP_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-800 font-semibold hover:underline"
              >
                AHA Home BP Guide <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={ICMR_HTN_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-800 font-semibold hover:underline"
              >
                ICMR Hypertension STW <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 list-disc list-inside text-stone-700">
            <li>Rest quietly for 5 minutes before measuring; avoid talking during the reading.</li>
            <li>Sit with your back supported, feet flat on the floor, and legs uncrossed.</li>
            <li>Support your upper arm at heart level on a flat table or armrest.</li>
            <li>Avoid caffeine, smoking, or vigorous exercise for 30 minutes before measuring.</li>
            <li>Take 2 readings 1 minute apart and record each reading without overwriting the first.</li>
          </ul>
        </div>
      )}

      {/* Urgent / Warning Banner if latest reading is high/low */}
      {latest?.interpretation?.is_urgent && (
        <div
          className="bg-red-50 border border-red-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-red-900"
          data-testid="bp-urgent-warning"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">
              {latest.interpretation.category_label}: {latest.systolic_mmhg}/{latest.diastolic_mmhg} mmHg
            </p>
            <p className="mt-1">{latest.interpretation.urgent_warning}</p>
            <p className="mt-1 text-[11px] text-red-700">
              {latest.interpretation.non_diagnostic_notice}
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Graph-First Trend + Compact Entry Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Graph-First Systolic & Diastolic Line Chart */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Blood Pressure Trend ({daysWindow} Days)
              </h2>
              <p className="text-xs text-stone-500">
                Avg:{" "}
                <strong className="text-stone-800">
                  {bpData?.summary_stats?.avg_systolic_mmhg
                    ? `${bpData.summary_stats.avg_systolic_mmhg}/${bpData.summary_stats.avg_diastolic_mmhg} mmHg`
                    : "No readings yet"}
                </strong>{" "}
                • Morning:{" "}
                <strong className="text-stone-800">
                  {bpData?.summary_stats?.morning_avg_systolic_mmhg ?? "—"}
                </strong>{" "}
                • Evening:{" "}
                <strong className="text-stone-800">
                  {bpData?.summary_stats?.evening_avg_systolic_mmhg ?? "—"}
                </strong>
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysWindow(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    daysWindow === d
                      ? "bg-emerald-800 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {d}d
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowTargetForm((v) => !v)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200"
              >
                <Target className="w-3.5 h-3.5 inline mr-1" />
                Target
              </button>
            </div>
          </div>

          <DualSeriesLineChart
            points={chartPoints}
            targetSystolicMax={
              bpData?.clinician_target?.target_details?.systolic_max
            }
            targetDiastolicMax={
              bpData?.clinician_target?.target_details?.diastolic_max
            }
          />

          {showTargetForm && (
            <form
              onSubmit={handleSaveTargets}
              className="rounded-2xl bg-[#FAF8F5] p-4 border border-stone-200/80 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  Clinician-Provided Target Range (mmHg)
                </span>
                {targetSavedMsg && (
                  <span className="text-xs font-semibold text-emerald-800">
                    {targetSavedMsg}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div>
                  <label className="block text-[11px] text-stone-500">Sys Min</label>
                  <input
                    type="number"
                    value={targetSysMin}
                    onChange={(e) => setTargetSysMin(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500">Sys Max</label>
                  <input
                    type="number"
                    value={targetSysMax}
                    onChange={(e) => setTargetSysMax(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500">Dia Min</label>
                  <input
                    type="number"
                    value={targetDiaMin}
                    onChange={(e) => setTargetDiaMin(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500">Dia Max</label>
                  <input
                    type="number"
                    value={targetDiaMax}
                    onChange={(e) => setTargetDiaMax(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-emerald-800 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Clean BP Entry Form */}
        <form
          onSubmit={handleSaveBp}
          className="lg:col-span-5 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs space-y-4"
          data-testid="bp-entry-form"
        >
          <h2 className="text-base font-bold text-stone-900">
            {editingId ? "Edit Reading" : "Record Blood Pressure"}
          </h2>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Systolic *
              </label>
              <input
                type="number"
                required
                min={50}
                max={260}
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm font-bold text-stone-900"
                data-testid="bp-systolic-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Diastolic *
              </label>
              <input
                type="number"
                required
                min={30}
                max={180}
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm font-bold text-stone-900"
                data-testid="bp-diastolic-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Pulse (bpm)
              </label>
              <input
                type="number"
                min={25}
                max={240}
                value={pulse}
                onChange={(e) => setPulse(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm text-stone-900"
                data-testid="bp-pulse-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Date</label>
              <input
                type="date"
                value={loggedDate}
                onChange={(e) => setLoggedDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Time</label>
              <input
                type="time"
                value={loggedTime}
                onChange={(e) => setLoggedTime(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Slot</label>
              <select
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-stone-200 text-xs bg-white"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Arm</label>
              <select
                value={armUsed}
                onChange={(e) => setArmUsed(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-stone-200 text-xs bg-white"
              >
                <option value="left">Left Arm</option>
                <option value="right">Right Arm</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Posture</label>
              <select
                value={bodyPosition}
                onChange={(e) => setBodyPosition(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-stone-200 text-xs bg-white"
              >
                <option value="seated">Seated</option>
                <option value="standing">Standing</option>
                <option value="supine">Lying</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Reading #</label>
              <select
                value={readingSequence}
                onChange={(e) => setReadingSequence(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-stone-200 text-xs bg-white"
                data-testid="bp-sequence-select"
              >
                <option value="first">1st Reading</option>
                <option value="repeat_2">2nd Repeat</option>
                <option value="repeat_3">3rd Repeat</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-stone-600 mb-1">
              Optional Note
            </label>
            <input
              type="text"
              placeholder="e.g., rested 5 mins, before morning tea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-stone-200 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs"
              data-testid="bp-submit-button"
            >
              {editingId ? "Update Reading" : "Save BP Reading"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="py-2.5 px-3 rounded-xl bg-stone-100 text-stone-700 text-xs font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Readings List */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs">
        <h2 className="text-base font-bold text-stone-900 mb-3">
          Recorded Readings ({bpData?.readings?.length || 0})
        </h2>
        {loading ? (
          <div className="py-6 text-center text-xs text-stone-400">Loading readings...</div>
        ) : !bpData?.readings?.length ? (
          <div className="py-6 text-center text-xs text-stone-500 bg-[#FAF8F5] rounded-2xl border border-dashed border-stone-200">
            No blood pressure readings recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {bpData.readings.map((r: any) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/70 bg-[#FAF8F5] px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-extrabold text-stone-900">
                    {r.systolic_mmhg}/{r.diastolic_mmhg} mmHg
                  </span>
                  {r.pulse_bpm && (
                    <span className="text-stone-600">{r.pulse_bpm} bpm</span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] border ${statusBadgeStyle(
                      r.interpretation?.status_tone
                    )}`}
                  >
                    {r.interpretation?.category_label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-stone-500">
                  <span>
                    {r.logged_date} {r.logged_time} • {r.time_of_day} ({r.reading_sequence})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleEditBp(r)}
                    className="p-1 text-stone-500 hover:text-stone-900"
                    title="Edit reading"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBp(r.id)}
                    className="p-1 text-rose-500 hover:text-rose-700"
                    title="Delete reading"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. BLOOD GLUCOSE TRACKER (/health/blood-glucose)
// ============================================================================
export const BloodGlucoseTrackerPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [bgData, setBgData] = useState<any>(null);
  const [daysWindow, setDaysWindow] = useState<number>(30);
  const [contextFilter, setContextFilter] = useState<string>("");
  const [chartMode, setChartMode] = useState<"fasting" | "post_meal">("fasting");
  const [showTargetForm, setShowTargetForm] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [glucoseValue, setGlucoseValue] = useState<string>("98");
  const [unit, setUnit] = useState<"mg/dL" | "mmol/L">("mg/dL");
  const [measurementContext, setMeasurementContext] = useState<string>("fasting");
  const [loggedDate, setLoggedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [loggedTime, setLoggedTime] = useState<string>("08:00");
  const [mealReference, setMealReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Clinician targets
  const [fastingMin, setFastingMin] = useState<string>("80");
  const [fastingMax, setFastingMax] = useState<string>("130");
  const [postMealMax, setPostMealMax] = useState<string>("180");
  const [targetSavedMsg, setTargetSavedMsg] = useState<string | null>(null);

  const fetchBg = async () => {
    setLoading(true);
    try {
      const res = await api.getBloodGlucose({
        member_id: activeMember?.id,
        days: daysWindow,
        measurement_context: contextFilter || undefined,
      });
      setBgData(res);
      const td = res?.clinician_target?.target_details;
      if (td) {
        if (td.fasting_min_mg_dl) setFastingMin(String(td.fasting_min_mg_dl));
        if (td.fasting_max_mg_dl) setFastingMax(String(td.fasting_max_mg_dl));
        if (td.post_meal_max_mg_dl) setPostMealMax(String(td.post_meal_max_mg_dl));
      }
    } catch (e: any) {
      setError(e.message || "Failed to load blood glucose readings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBg();
  }, [activeMember?.id, daysWindow, contextFilter]);

  const handleSaveBg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        member_id: activeMember?.id,
        glucose_value: Number(glucoseValue),
        measurement_unit: unit,
        measurement_context: measurementContext,
        logged_date: loggedDate,
        logged_time: loggedTime,
        meal_reference: mealReference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (editingId) {
        await api.updateBloodGlucose(editingId, payload);
        setEditingId(null);
      } else {
        await api.addBloodGlucose(payload);
      }
      setMealReference("");
      setNotes("");
      await fetchBg();
    } catch (err: any) {
      setError(err.message || "Unable to save blood glucose reading.");
    }
  };

  const handleEditBg = (r: any) => {
    setEditingId(r.id);
    setGlucoseValue(String(r.entered_value ?? r.glucose_value));
    setUnit((r.entered_unit || r.unit) === "mmol/L" ? "mmol/L" : "mg/dL");
    setMeasurementContext(r.measurement_context || "fasting");
    setLoggedDate(r.logged_date || new Date().toISOString().slice(0, 10));
    setLoggedTime(r.logged_time || "08:00");
    setMealReference(r.meal_reference || "");
    setNotes(r.notes || "");
  };

  const handleDeleteBg = async (id: number) => {
    await api.deleteBloodGlucose(id);
    await fetchBg();
  };

  const handleSaveGlucoseTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.saveHealthMeasurementTarget({
      member_id: activeMember?.id,
      measurement_type: "blood_glucose",
      target_details: {
        fasting_min_mg_dl: Number(fastingMin) || 80,
        fasting_max_mg_dl: Number(fastingMax) || 130,
        post_meal_max_mg_dl: Number(postMealMax) || 180,
      },
      clinician_confirmed: true,
    });
    setTargetSavedMsg("Saved clinician blood glucose target range.");
    setTimeout(() => setTargetSavedMsg(null), 3000);
    await fetchBg();
  };

  const latest = bgData?.latest_reading;
  const convertedPreview =
    unit === "mmol/L"
      ? `${Math.round(Number(glucoseValue || 0) * 18.0182 * 10) / 10} mg/dL`
      : `${Math.round((Number(glucoseValue || 0) / 18.0182) * 100) / 100} mmol/L`;

  const fastingPoints = (bgData?.fasting_readings || [])
    .slice()
    .reverse()
    .map((r: any) => ({
      date: r.logged_date,
      value_mg_dl: r.value_mg_dl,
      context_label: r.context_label,
    }));

  const postMealPoints = (bgData?.post_meal_readings || [])
    .slice()
    .reverse()
    .map((r: any) => ({
      date: r.logged_date,
      value_mg_dl: r.value_mg_dl,
      context_label: r.context_label,
    }));

  return (
    <div className="space-y-6" data-testid="blood-glucose-tracker-page">
      {/* Header + Internal Tabs */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
            <Droplet className="w-6 h-6 text-emerald-800" /> Blood Glucose Tracker (mg/dL &amp; mmol/L)
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Context-aware logging for fasting, pre-meal, post-meal, and bedtime readings. Fasting and post-meal trends are always separated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HealthMeasurementsSubNav />
          <a
            href={ADA_GLUCOSE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 text-stone-700 text-xs font-semibold hover:bg-stone-200"
          >
            ADA Standards <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={ICMR_DIABETES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-stone-100 text-stone-700 text-xs font-semibold hover:bg-stone-200"
          >
            ICMR Guide <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Urgent Warning if hypoglycemia or severe hyperglycemia */}
      {latest?.interpretation?.is_urgent && (
        <div
          className="bg-red-50 border border-red-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-red-900"
          data-testid="bg-urgent-warning"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">
              {latest.entered_value} {latest.entered_unit} ({latest.context_label})
            </p>
            <p className="mt-1">{latest.interpretation.urgent_warning}</p>
            <p className="mt-1 text-[11px] text-red-700">
              {latest.interpretation.non_diagnostic_notice}
            </p>
          </div>
        </div>
      )}

      {/* Main Grid: Graph-First Single Prominent Chart + Entry Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Single Prominent Context-Separated Glucose Chart */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Glucose Trend ({daysWindow} Days)
              </h2>
              <p className="text-xs text-stone-500">
                Fasting Avg:{" "}
                <strong className="text-stone-800">
                  {bgData?.context_summaries?.fasting?.avg_mg_dl
                    ? `${bgData.context_summaries.fasting.avg_mg_dl} mg/dL`
                    : "—"}
                </strong>{" "}
                • Post-Meal Avg:{" "}
                <strong className="text-stone-800">
                  {bgData?.context_summaries?.post_meal?.avg_mg_dl
                    ? `${bgData.context_summaries.post_meal.avg_mg_dl} mg/dL`
                    : "—"}
                </strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setChartMode("fasting")}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    chartMode === "fasting"
                      ? "bg-emerald-800 text-white"
                      : "text-stone-600"
                  }`}
                >
                  Fasting
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("post_meal")}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    chartMode === "post_meal"
                      ? "bg-emerald-800 text-white"
                      : "text-stone-600"
                  }`}
                >
                  Post-Meal
                </button>
              </div>
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDaysWindow(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                    daysWindow === d
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {d}d
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowTargetForm((v) => !v)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200"
              >
                <Target className="w-3.5 h-3.5 inline mr-1" />
                Target
              </button>
            </div>
          </div>

          {chartMode === "fasting" ? (
            <GlucoseSeriesChart
              points={fastingPoints}
              label="Fasting Blood Glucose (mg/dL)"
              color="#047857"
            />
          ) : (
            <GlucoseSeriesChart
              points={postMealPoints}
              label="Post-Meal Blood Glucose (mg/dL)"
              color="#57534e"
            />
          )}

          {showTargetForm && (
            <form
              onSubmit={handleSaveGlucoseTargets}
              className="rounded-2xl bg-[#FAF8F5] p-4 border border-stone-200/80 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">
                  Clinician-Configured Glucose Targets (mg/dL)
                </span>
                {targetSavedMsg && (
                  <span className="text-xs font-semibold text-emerald-800">
                    {targetSavedMsg}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-[11px] text-stone-500">Fasting Min</label>
                  <input
                    type="number"
                    value={fastingMin}
                    onChange={(e) => setFastingMin(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500">Fasting Max</label>
                  <input
                    type="number"
                    value={fastingMax}
                    onChange={(e) => setFastingMax(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500">Post-Meal Max</label>
                  <input
                    type="number"
                    value={postMealMax}
                    onChange={(e) => setPostMealMax(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-white text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-emerald-800 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  Save
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Clean Glucose Entry Form */}
        <form
          onSubmit={handleSaveBg}
          className="lg:col-span-5 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs space-y-4"
          data-testid="bg-entry-form"
        >
          <h2 className="text-base font-bold text-stone-900">
            {editingId ? "Edit Reading" : "Record Blood Glucose"}
          </h2>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Glucose Value *
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={glucoseValue}
                onChange={(e) => setGlucoseValue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm font-bold text-stone-900"
                data-testid="bg-value-input"
              />
              <span className="text-[10px] text-stone-400 mt-0.5 block">
                Equivalent: {convertedPreview}
              </span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Unit *</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as "mg/dL" | "mmol/L")}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white font-semibold"
                data-testid="bg-unit-select"
              >
                <option value="mg/dL">mg/dL</option>
                <option value="mmol/L">mmol/L</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Measurement Context *
            </label>
            <select
              value={measurementContext}
              onChange={(e) => setMeasurementContext(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs bg-white font-medium"
              data-testid="bg-context-select"
            >
              <option value="fasting">Fasting (8+ hrs no caloric intake)</option>
              <option value="before_breakfast">Before Breakfast</option>
              <option value="after_breakfast">After Breakfast (Post-Meal)</option>
              <option value="before_lunch">Before Lunch</option>
              <option value="after_lunch">After Lunch (Post-Meal)</option>
              <option value="before_dinner">Before Dinner</option>
              <option value="after_dinner">After Dinner (Post-Meal)</option>
              <option value="bedtime">Bedtime</option>
              <option value="random">Random / Unscheduled</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Date</label>
              <input
                type="date"
                value={loggedDate}
                onChange={(e) => setLoggedDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-stone-600 mb-1">Time</label>
              <input
                type="time"
                value={loggedTime}
                onChange={(e) => setLoggedTime(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-stone-600 mb-1">
              Optional Meal Reference
            </label>
            <input
              type="text"
              placeholder="e.g., 2 idlis + sambar"
              value={mealReference}
              onChange={(e) => setMealReference(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-stone-200 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs"
              data-testid="bg-submit-button"
            >
              {editingId ? "Update Reading" : "Save Glucose Reading"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="py-2.5 px-3 rounded-xl bg-stone-100 text-stone-700 text-xs font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Readings List */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-bold text-stone-900">
            Recorded Readings ({bgData?.readings?.length || 0})
          </h2>
          <select
            aria-label="Filter glucose context"
            value={contextFilter}
            onChange={(e) => setContextFilter(e.target.value)}
            className="text-xs border border-stone-200 rounded-xl px-2.5 py-1.5 bg-[#FAF8F5] text-stone-700"
          >
            <option value="">All Contexts</option>
            <option value="fasting">Fasting</option>
            <option value="pre_meal">Pre-Meal</option>
            <option value="post_meal">Post-Meal</option>
            <option value="bedtime">Bedtime</option>
            <option value="random">Random</option>
          </select>
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs text-stone-400">Loading readings...</div>
        ) : !bgData?.readings?.length ? (
          <div className="py-6 text-center text-xs text-stone-500 bg-[#FAF8F5] rounded-2xl border border-dashed border-stone-200">
            No blood glucose readings recorded yet.
          </div>
        ) : (
          <div className="space-y-2">
            {bgData.readings.map((r: any) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/70 bg-[#FAF8F5] px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-extrabold text-stone-900">
                    {r.entered_value} {r.entered_unit}
                  </span>
                  <span className="text-stone-500">
                    ({r.value_mg_dl} mg/dL • {r.value_mmol_l} mmol/L)
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                    {r.context_label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-stone-500">
                  {r.meal_reference && <span>Meal: {r.meal_reference}</span>}
                  <span>
                    {r.logged_date} {r.logged_time}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleEditBg(r)}
                    className="p-1 text-stone-500 hover:text-stone-900"
                    title="Edit reading"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBg(r.id)}
                    className="p-1 text-rose-500 hover:text-rose-700"
                    title="Delete reading"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
