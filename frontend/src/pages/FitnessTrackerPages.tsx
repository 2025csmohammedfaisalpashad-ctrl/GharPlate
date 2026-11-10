import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { FoodSummary } from '../types/api';

const todayStr = () => new Date().toISOString().slice(0, 10);

const GOAL_CATALOG = [
  { code: 'build_muscle', label: 'Build muscle' },
  { code: 'lose_body_fat', label: 'Lose body fat' },
  { code: 'gain_weight', label: 'Gain weight' },
  { code: 'improve_strength', label: 'Improve strength' },
  { code: 'improve_endurance', label: 'Improve endurance' },
  { code: 'general_fitness', label: 'General fitness' },
  { code: 'maintain_balanced_diet', label: 'Maintain current fitness' },
  { code: 'improve_nutrition', label: 'Improve everyday nutrition' },
];

function formatGoalLabel(code: string | undefined | null): string {
  if (!code) return 'Maintain current fitness';
  const match = GOAL_CATALOG.find((g) => g.code === code);
  if (match) return match.label;
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ==========================================
// SHARED MINIMALIST SVG LINE CHART
// ==========================================
interface LineChartPoint {
  date: string;
  label: string;
  value: number | null;
  secondaryValue?: number | null;
  statusNote?: string;
}

const MinimalistSvgLineChart: React.FC<{
  testId: string;
  points: LineChartPoint[];
  unit: string;
  targetValue?: number | null;
  targetLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  yMaxOverride?: number;
}> = ({
  testId,
  points,
  unit,
  targetValue,
  targetLabel,
  primaryColor = '#065f46',
  secondaryColor = '#d97706',
  yMaxOverride,
}) => {
  const width = 720;
  const height = 220;
  const padX = 44;
  const padY = 26;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const numericVals = points
    .flatMap((p) => [p.value, p.secondaryValue])
    .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(Number(v)));

  const maxVal =
    yMaxOverride ||
    Math.max(
      targetValue ? targetValue * 1.2 : 10,
      ...(numericVals.length > 0 ? numericVals : [100]),
      10
    );

  const plotted = points.map((pt, idx) => {
    const x =
      padX + (points.length > 1 ? (idx / (points.length - 1)) * plotW : plotW / 2);
    const hasPrimary = pt.value !== null && pt.value !== undefined;
    const y = hasPrimary
      ? padY + plotH - (Math.min(maxVal, Math.max(0, Number(pt.value))) / maxVal) * plotH
      : null;
    const hasSecondary = pt.secondaryValue !== null && pt.secondaryValue !== undefined;
    const y2 = hasSecondary
      ? padY +
        plotH -
        (Math.min(maxVal, Math.max(0, Number(pt.secondaryValue))) / maxVal) * plotH
      : null;
    return { ...pt, x, y, y2, hasPrimary, hasSecondary };
  });

  const validPrimary = plotted.filter((p) => p.hasPrimary && p.y !== null);
  const polylinePrimary = validPrimary.map((p) => `${p.x},${p.y}`).join(' ');

  const areaPath =
    validPrimary.length > 1
      ? `M ${validPrimary[0].x},${padY + plotH} ` +
        validPrimary.map((p) => `L ${p.x},${p.y}`).join(' ') +
        ` L ${validPrimary[validPrimary.length - 1].x},${padY + plotH} Z`
      : '';

  const validSecondary = plotted.filter((p) => p.hasSecondary && p.y2 !== null);
  const polylineSecondary = validSecondary.map((p) => `${p.x},${p.y2}`).join(' ');

  const targetY =
    targetValue && targetValue > 0
      ? padY + plotH - (Math.min(maxVal, targetValue) / maxVal) * plotH
      : null;

  const labelStep = points.length <= 10 ? 1 : points.length <= 35 ? 5 : 14;
  const gradId = `gp-grad-${testId}`;

  return (
    <div className="overflow-x-auto">
      <svg
        data-testid={testId}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[500px] h-56 rounded-2xl bg-[#FAF8F5]/90 border border-stone-200/75"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.16" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle horizontal reference gridlines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const gy = padY + plotH - frac * plotH;
          const gVal = Math.round(maxVal * frac);
          return (
            <g key={frac}>
              <line
                x1={padX}
                y1={gy}
                x2={width - padX}
                y2={gy}
                stroke="#e7e5e4"
                strokeWidth="1"
              />
              <text
                x={padX - 6}
                y={gy + 3}
                textAnchor="end"
                className="fill-stone-400 text-[9px] font-medium"
              >
                {gVal}
              </text>
            </g>
          );
        })}

        {/* Baseline */}
        <line
          x1={padX}
          y1={padY + plotH}
          x2={width - padX}
          y2={padY + plotH}
          stroke="#d6d3d1"
          strokeWidth="1"
        />

        {/* Target reference line */}
        {targetY !== null && (
          <>
            <line
              x1={padX}
              y1={targetY}
              x2={width - padX}
              y2={targetY}
              stroke="#94a3b8"
              strokeDasharray="4,4"
              strokeWidth="1.25"
            />
            <text
              x={width - padX - 4}
              y={Math.max(14, targetY - 5)}
              textAnchor="end"
              className="fill-stone-500 text-[9px] font-semibold"
            >
              {targetLabel || `Target (${targetValue} ${unit})`}
            </text>
          </>
        )}

        {/* Subtle area fill under recorded line */}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

        {/* Secondary line (e.g. diastolic) */}
        {validSecondary.length > 1 && (
          <polyline
            fill="none"
            stroke={secondaryColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineSecondary}
          />
        )}

        {/* Primary line */}
        {validPrimary.length > 1 && (
          <polyline
            fill="none"
            stroke={primaryColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePrimary}
          />
        )}

        {/* Data points & unrecorded markers */}
        {plotted.map((pt, idx) => (
          <g key={`${pt.date}-${idx}`}>
            {pt.hasPrimary && pt.y !== null ? (
              <circle
                cx={pt.x}
                cy={pt.y}
                r={4.2}
                fill={primaryColor}
                stroke="#ffffff"
                strokeWidth="1.75"
              >
                <title>
                  {`${pt.date}: ${pt.value} ${unit}${
                    pt.statusNote ? ` • ${pt.statusNote}` : ''
                  }`}
                </title>
              </circle>
            ) : (
              <circle
                cx={pt.x}
                cy={padY + plotH}
                r={2.5}
                fill="#ffffff"
                stroke="#d6d3d1"
                strokeWidth="1.25"
              >
                <title>{`${pt.date}: ${pt.statusNote || 'No entry recorded'}`}</title>
              </circle>
            )}

            {pt.hasSecondary && pt.y2 !== null && (
              <circle
                cx={pt.x}
                cy={pt.y2}
                r={3.5}
                fill={secondaryColor}
                stroke="#ffffff"
                strokeWidth="1.5"
              >
                <title>{`${pt.date}: ${pt.secondaryValue} ${unit}`}</title>
              </circle>
            )}

            {(idx % labelStep === 0 || idx === plotted.length - 1) && (
              <text
                x={pt.x}
                y={height - 6}
                textAnchor="middle"
                className="fill-stone-500 text-[9px] font-medium"
              >
                {pt.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

// ==========================================
// 1. SIMPLIFIED FITNESS DASHBOARD & PROGRESSIVE PROFILE SETUP
// ==========================================
export const FitnessDashboardPage: React.FC = () => {
  const { activeMember, refreshHousehold } = useHousehold();
  const location = useLocation();
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, any> | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Progressive disclosure toggles
  const [editingProfile, setEditingProfile] = useState(false);
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Main graph metric selector
  const [selectedMetric, setSelectedMetric] = useState<
    'protein_g' | 'energy_kcal' | 'workout_consistency' | 'water_ml' | 'body_weight'
  >('protein_g');

  // Form states
  const [primaryGoal, setPrimaryGoal] = useState('maintain_balanced_diet');
  const [secondaryGoal, setSecondaryGoal] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [trainingFreq, setTrainingFreq] = useState(3);
  const [trainingType, setTrainingType] = useState('mixed_fitness');
  const [workoutDuration, setWorkoutDuration] = useState(45);
  const [preferredTime, setPreferredTime] = useState('morning');
  const [activityLevel, setActivityLevel] = useState('moderately_active');
  const [budgetInr, setBudgetInr] = useState('');
  const [targetCalories, setTargetCalories] = useState('');
  const [targetProtein, setTargetProtein] = useState('');
  const [schedule, setSchedule] = useState<Record<string, any>[]>([]);

  // Open workout/schedule drawer if navigated with ?quick=log-workout
  useEffect(() => {
    if (location.search.includes('quick=log-workout')) {
      setScheduleDrawerOpen(true);
    }
  }, [location.search]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, anaRes, measRes] = await Promise.all([
        api.getFitnessProfile(activeMember?.id),
        api.getAnalyticsOverview(activeMember?.id, 14).catch(() => null),
        api.getMeasurements(activeMember?.id).catch(() => []),
      ]);
      setProfile(profRes);
      setAnalytics(anaRes);
      setMeasurements(measRes || []);

      setPrimaryGoal(profRes.primary_goal || 'maintain_balanced_diet');
      setSecondaryGoal(profRes.secondary_goal || '');
      setHeightCm(profRes.height_cm ? String(profRes.height_cm) : '');
      setWeightKg(profRes.current_weight_kg ? String(profRes.current_weight_kg) : '');
      setTargetWeightKg(profRes.target_weight_kg ? String(profRes.target_weight_kg) : '');
      setTrainingFreq(profRes.training_frequency_days_per_week ?? 3);
      setTrainingType(profRes.training_type || 'mixed_fitness');
      setWorkoutDuration(profRes.typical_workout_duration_min ?? 45);
      setPreferredTime(profRes.preferred_training_time || 'morning');
      setActivityLevel(profRes.daily_activity_level || 'moderately_active');
      setBudgetInr(
        profRes.daily_food_budget_inr ? String(profRes.daily_food_budget_inr) : ''
      );
      setTargetCalories(
        profRes.computed_targets?.calories_kcal
          ? String(profRes.computed_targets.calories_kcal)
          : ''
      );
      setTargetProtein(
        profRes.computed_targets?.protein_g
          ? String(profRes.computed_targets.protein_g)
          : ''
      );
      setSchedule(profRes.training_schedule || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeMember?.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await api.updateFitnessProfile(
        {
          member_id: activeMember?.id,
          primary_goal: primaryGoal,
          fitness_goal: primaryGoal,
          secondary_goal: secondaryGoal || null,
          height_cm: heightCm ? Number(heightCm) : null,
          current_weight_kg: weightKg ? Number(weightKg) : null,
          target_weight_kg: targetWeightKg ? Number(targetWeightKg) : null,
          training_frequency_days_per_week: Number(trainingFreq),
          training_type: trainingType,
          typical_workout_duration_min: Number(workoutDuration),
          preferred_training_time: preferredTime,
          daily_activity_level: activityLevel,
          daily_food_budget_inr: budgetInr ? Number(budgetInr) : null,
          target_calories_kcal: targetCalories ? Number(targetCalories) : null,
          target_protein_g: targetProtein ? Number(targetProtein) : null,
          training_schedule: schedule,
        },
        activeMember?.id
      );
      setProfile(updated);
      setFeedback('Saved your fitness profile, daily targets, and training schedule.');
      setEditingProfile(false);
      await refreshHousehold();
    } finally {
      setSaving(false);
    }
  };

  const toggleScheduleDay = (idx: number) => {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === idx
          ? {
              ...d,
              is_training_day: !d.is_training_day,
              workout_type: !d.is_training_day
                ? 'Strength & Conditioning'
                : 'Rest & Recovery',
            }
          : d
      )
    );
  };

  const updateScheduleWorkout = (idx: number, field: string, value: any) => {
    setSchedule((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d))
    );
  };

  // Determine today's training/rest status
  const todayWeekday = useMemo(() => {
    const names = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    return names[new Date().getDay()];
  }, []);

  const todayScheduleSlot = useMemo(
    () =>
      schedule.find((s) => (s.day_of_week || '').toLowerCase() === todayWeekday) ||
      schedule[0],
    [schedule, todayWeekday]
  );

  // Build single main chart series for Your Fitness Progress
  const progressChartConfig = useMemo(() => {
    const weeklySeries: Record<string, any>[] = analytics?.weekly_series || [];
    const targets = profile?.computed_targets || {};

    if (selectedMetric === 'protein_g') {
      return {
        label: 'Daily Protein Intake',
        unit: 'g',
        targetValue: targets.protein_g || 65,
        color: '#065f46',
        points: weeklySeries.map((d) => ({
          date: d.date,
          label: (d.date || '').slice(5),
          value: d.protein_g !== undefined ? d.protein_g : null,
          statusNote: d.food_data_status,
        })),
      };
    }
    if (selectedMetric === 'energy_kcal') {
      return {
        label: 'Daily Energy Intake',
        unit: 'kcal',
        targetValue: targets.calories_kcal || 2000,
        color: '#047857',
        points: weeklySeries.map((d) => ({
          date: d.date,
          label: (d.date || '').slice(5),
          value: d.energy_kcal !== undefined ? d.energy_kcal : null,
          statusNote: d.food_data_status,
        })),
      };
    }
    if (selectedMetric === 'water_ml') {
      return {
        label: 'Daily Water Intake',
        unit: 'ml',
        targetValue: analytics?.targets?.water_ml || 2250,
        color: '#0284c7',
        points: weeklySeries.map((d) => ({
          date: d.date,
          label: (d.date || '').slice(5),
          value: d.water_ml !== undefined ? d.water_ml : null,
        })),
      };
    }
    if (selectedMetric === 'body_weight') {
      const weightByDate = new Map<string, number>();
      measurements.forEach((m) => {
        if (m.weight_kg !== null && m.weight_kg !== undefined) {
          weightByDate.set(m.logged_date, Number(m.weight_kg));
        }
      });
      const basePoints =
        weeklySeries.length > 0
          ? weeklySeries.map((d) => ({
              date: d.date,
              label: (d.date || '').slice(5),
              value: weightByDate.get(d.date) ?? null,
            }))
          : Array.from(weightByDate.entries())
              .reverse()
              .map(([dt, w]) => ({ date: dt, label: dt.slice(5), value: w }));

      return {
        label: 'Recorded Body Weight',
        unit: 'kg',
        targetValue: profile?.target_weight_kg ? Number(profile.target_weight_kg) : null,
        color: '#334155',
        points: basePoints,
      };
    }

    // workout_consistency
    const workoutDates = new Set(
      measurements.filter((m) => m.workout_completed).map((m) => m.logged_date)
    );
    return {
      label: 'Workout & Movement Sessions',
      unit: '%',
      targetValue: 100,
      color: '#065f46',
      points: weeklySeries.map((d) => {
        const loggedToday =
          workoutDates.has(d.date) ||
          (d.is_training_day && d.food_data_status === 'recorded');
        return {
          date: d.date,
          label: (d.date || '').slice(5),
          value: d.is_training_day ? (loggedToday ? 100 : 0) : null,
          statusNote: d.is_training_day ? 'Scheduled training day' : 'Rest day',
        };
      }),
    };
  }, [analytics, measurements, profile, selectedMetric]);

  if (loading && !profile) {
    return <div className="h-72 animate-pulse rounded-3xl bg-stone-200/70" />;
  }

  const targets = profile?.computed_targets || {};
  const trainingDaysCount = schedule.filter((s) => s.is_training_day).length;

  return (
    <div data-testid="fitness-dashboard-page" className="space-y-6">
      {/* 1. Calm Top Overview Card — Selected Goal, Current Targets, Today's Status & Edit Action */}
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-0.5 text-[11px] font-semibold text-emerald-900">
              🏋️ Your Fitness Profile
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              {profile?.member_name || activeMember?.display_name || 'My Fitness'}
            </h1>
            <p className="text-xs text-stone-500">
              Goal: <strong className="text-stone-800">{formatGoalLabel(primaryGoal)}</strong>
              {secondaryGoal ? ` • Secondary: ${formatGoalLabel(secondaryGoal)}` : ''}
              {weightKg ? ` • Weight: ${weightKg} kg` : ''}
              {heightCm ? ` • Height: ${heightCm} cm` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="edit-fitness-profile-btn"
              onClick={() => setEditingProfile((prev) => !prev)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition"
            >
              {editingProfile ? 'Close Profile Editor' : 'Edit Profile'}
            </button>
            <Link
              to="/fitness/protein"
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
            >
              Protein Guide
            </Link>
            <Link
              to="/fitness/tracker"
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
            >
              Open Daily Tracker →
            </Link>
          </div>
        </div>

        {feedback && (
          <div
            data-testid="fitness-profile-saved-banner"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs font-semibold text-emerald-950"
          >
            ✓ {feedback}
          </div>
        )}

        {/* 4 Concise Summary Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-3.5">
            <div className="text-[11px] font-medium text-stone-500">Selected Goal</div>
            <div className="mt-1 text-sm font-bold text-stone-900">
              {formatGoalLabel(primaryGoal)}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-3.5">
            <div className="text-[11px] font-medium text-stone-500">Daily Targets</div>
            <div className="mt-1 text-sm font-bold text-stone-900 tabular-nums">
              {targets.calories_kcal ?? 2000} kcal • {targets.protein_g ?? 65}g P
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-3.5">
            <div className="text-[11px] font-medium text-stone-500">Today’s Schedule</div>
            <div className="mt-1 text-sm font-bold text-stone-900 capitalize">
              {todayScheduleSlot?.is_training_day
                ? `🏋️ ${todayScheduleSlot.workout_type || 'Training'}`
                : '🌿 Rest Day'}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-3.5">
            <div className="text-[11px] font-medium text-stone-500">Weekly Rhythm</div>
            <div className="mt-1 text-sm font-bold text-stone-900 tabular-nums">
              {trainingDaysCount} training / {7 - trainingDaysCount} rest days
            </div>
          </div>
        </div>

        {targets.condition_fitness_cautions &&
          targets.condition_fitness_cautions.length > 0 && (
            <div className="rounded-2xl border border-amber-200/90 bg-amber-50/70 p-3.5 text-xs text-amber-950 space-y-1">
              <div className="font-bold">🩺 Condition-Aware Fitness Note</div>
              {targets.condition_fitness_cautions.map((note: string, i: number) => (
                <p key={i}>• {note}</p>
              ))}
            </div>
          )}
      </section>

      {/* 2. Progressive Profile Editor (Separated into A. Your Goal, B. Personal Details, C. Training Schedule) */}
      <form
        onSubmit={(e) => void handleSave(e)}
        className={`rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-6 ${
          editingProfile ? 'block' : 'hidden'
        }`}
      >
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Edit Your Fitness Profile
            </h2>
            <p className="text-xs text-stone-500">
              Organised into three simple steps. All condition safety rules remain active.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingProfile(false)}
            className="text-xs font-semibold text-stone-500 hover:text-stone-800"
          >
            ✕ Close
          </button>
        </div>

        {/* Section A — Your Goal */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            A. Your Goal
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Primary Goal
              </label>
              <select
                aria-label="Primary Fitness Goal"
                data-testid="primary-goal-select"
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900"
              >
                {(profile?.available_primary_goals || GOAL_CATALOG).map((g: any) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Secondary Goal (Optional)
              </label>
              <select
                aria-label="Secondary Fitness Goal"
                data-testid="secondary-goal-select"
                value={secondaryGoal}
                onChange={(e) => setSecondaryGoal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900"
              >
                <option value="">None (Focus on primary goal)</option>
                {GOAL_CATALOG.filter((g) => g.code !== primaryGoal).map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Compact quick-select pills for immediate goal switching */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(profile?.available_primary_goals || GOAL_CATALOG).map((g: any) => {
              const active = primaryGoal === g.code;
              return (
                <button
                  key={g.code}
                  type="button"
                  data-testid={`goal-option-${g.code}`}
                  onClick={() => setPrimaryGoal(g.code)}
                  className={`rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? 'border-emerald-800 bg-emerald-800 text-white'
                      : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section B — Personal Details */}
        <div className="space-y-3 border-t border-stone-100 pt-4">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            B. Personal Details
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Height (cm)
              </label>
              <input
                type="number"
                step="0.5"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 170"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Current Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                data-testid="fitness-weight-input"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 68"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Target Weight (kg, optional)
              </label>
              <input
                type="number"
                step="0.1"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Activity Level
              </label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="sedentary">Sedentary / Desk Job</option>
                <option value="lightly_active">Lightly Active</option>
                <option value="moderately_active">Moderately Active</option>
                <option value="active">Active</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Training Style
              </label>
              <select
                value={trainingType}
                onChange={(e) => setTrainingType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="strength_training">Gym / Strength</option>
                <option value="mixed_fitness">Mixed Fitness &amp; Home</option>
                <option value="running_endurance">Running &amp; Endurance</option>
                <option value="yoga_mobility">Yoga &amp; Mobility</option>
                <option value="walking">Daily Brisk Walking</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700">
                Daily Food Budget (₹, optional)
              </label>
              <input
                type="number"
                value={budgetInr}
                onChange={(e) => setBudgetInr(e.target.value)}
                placeholder="e.g. 200"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold"
              />
            </div>
          </div>
        </div>

        {/* Section C — Compact Weekly Schedule Summary + Drawer Toggle */}
        <div className="space-y-3 border-t border-stone-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                C. Training Schedule
              </div>
              <p className="text-xs text-stone-500">
                {schedule
                  .map(
                    (s) =>
                      `${(s.day_of_week || '').slice(0, 3).toUpperCase()}: ${
                        s.is_training_day ? s.workout_type || 'Training' : 'Rest'
                      }`
                  )
                  .join(' • ')}
              </p>
            </div>
            <button
              type="button"
              data-testid="toggle-schedule-editor-btn"
              onClick={() => setScheduleDrawerOpen((prev) => !prev)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
            >
              {scheduleDrawerOpen ? 'Hide Weekly Schedule' : 'Edit Weekly Schedule'}
            </button>
          </div>
        </div>

        {/* Optional Advanced Settings for Custom Targets */}
        <div className="border-t border-stone-100 pt-3">
          <button
            type="button"
            data-testid="toggle-advanced-targets-btn"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900"
          >
            {advancedOpen ? '▾ Hide Advanced Target Settings' : '▸ Advanced Settings (Custom Calorie & Protein Targets)'}
          </button>

          {advancedOpen && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 rounded-2xl bg-stone-50 p-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Custom Energy Target (kcal/day)
                </label>
                <input
                  type="number"
                  value={targetCalories}
                  onChange={(e) => setTargetCalories(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Custom Protein Target (g/day)
                </label>
                <input
                  type="number"
                  value={targetProtein}
                  onChange={(e) => setTargetProtein(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold"
                />
              </div>
              <p className="sm:col-span-2 text-[11px] text-stone-500">
                {targets.assumptions_disclosure ||
                  'Targets are conservative educational estimates and never prescribe extreme caloric restriction.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            data-testid="save-fitness-profile-btn"
            className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Fitness Profile'}
          </button>
        </div>
      </form>

      {/* 3. Your Fitness Progress — Single Prominent Metric Graph */}
      <section
        data-testid="fitness-dashboard-progress-section"
        className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Your Fitness Progress</h2>
            <p className="text-xs text-stone-500">
              {progressChartConfig.label} ({progressChartConfig.unit}) — actual recorded entries over the last 7 days
            </p>
          </div>

          <select
            aria-label="Select Fitness Progress Metric"
            data-testid="fitness-dashboard-metric-select"
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as any)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800"
          >
            <option value="protein_g">Metric: Protein (g)</option>
            <option value="energy_kcal">Metric: Energy intake (kcal)</option>
            <option value="workout_consistency">Metric: Workout consistency (%)</option>
            <option value="water_ml">Metric: Water intake (ml)</option>
            <option value="body_weight">Metric: Body weight (kg)</option>
          </select>
        </div>

        <MinimalistSvgLineChart
          testId="fitness-dashboard-progress-chart"
          points={progressChartConfig.points}
          unit={progressChartConfig.unit}
          targetValue={progressChartConfig.targetValue}
          primaryColor={progressChartConfig.color}
        />
      </section>

      {/* 4. Compact Weekly Training Schedule Summary + Expandable Schedule Drawer */}
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Weekly Training Schedule</h2>
            <p className="text-xs text-stone-500">
              Collapsed by default. Click Edit Weekly Schedule to adjust training or rest days.
            </p>
          </div>
          <button
            type="button"
            data-testid="open-schedule-drawer-btn"
            onClick={() => setScheduleDrawerOpen((prev) => !prev)}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition"
          >
            {scheduleDrawerOpen ? 'Hide Schedule Editor' : 'Edit Weekly Schedule'}
          </button>
        </div>

        {/* Compact 7-day pill strip */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
          {schedule.map((item) => (
            <div
              key={`summary-${item.day_of_week}`}
              className={`rounded-2xl border p-2.5 text-xs ${
                item.is_training_day
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                  : 'border-stone-200/75 bg-stone-50 text-stone-600'
              }`}
            >
              <div className="font-bold capitalize">
                {(item.day_of_week || '').slice(0, 3)}
              </div>
              <div className="mt-0.5 text-[11px] truncate">
                {item.is_training_day ? item.workout_type || 'Training' : 'Rest'}
              </div>
            </div>
          ))}
        </div>

        {/* Expandable Schedule Editor */}
        {scheduleDrawerOpen && (
          <div className="space-y-2.5 border-t border-stone-100 pt-4">
            {schedule.map((item, idx) => (
              <div
                key={item.day_of_week}
                data-testid={`schedule-row-${item.day_of_week}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-xs ${
                  item.is_training_day
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-stone-200 bg-stone-50/70'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-[140px]">
                  <button
                    type="button"
                    onClick={() => toggleScheduleDay(idx)}
                    className={`rounded-xl px-2.5 py-1 text-[11px] font-bold transition ${
                      item.is_training_day
                        ? 'bg-emerald-800 text-white'
                        : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {item.is_training_day ? 'Training' : 'Rest'}
                  </button>
                  <span className="font-bold capitalize text-stone-900">
                    {item.day_of_week}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-1 justify-end">
                  <input
                    type="text"
                    value={item.workout_type || ''}
                    onChange={(e) =>
                      updateScheduleWorkout(idx, 'workout_type', e.target.value)
                    }
                    placeholder="Workout focus..."
                    className="rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium w-40 sm:w-48"
                  />
                  {item.is_training_day && (
                    <input
                      type="number"
                      value={item.duration_minutes || 45}
                      onChange={(e) =>
                        updateScheduleWorkout(
                          idx,
                          'duration_minutes',
                          Number(e.target.value)
                        )
                      }
                      className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-semibold w-16 text-center"
                      title="Workout duration (minutes)"
                    />
                  )}
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={(e) => void handleSave(e as any)}
                disabled={saving}
                className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                {saving ? 'Saving...' : 'Save Weekly Schedule'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

// ==========================================
// 2. SIMPLIFIED DAILY FOOD TRACKER ("Today's Food")
// ==========================================
const DEFAULT_MEAL_SLOTS = [
  { code: 'breakfast', label: 'Breakfast' },
  { code: 'mid_morning_snack', label: 'Morning Snack' },
  { code: 'lunch', label: 'Lunch' },
  { code: 'evening_snack', label: 'Evening Snack' },
  { code: 'dinner', label: 'Dinner' },
  { code: 'other', label: 'Other' },
];

export const DailyTrackerPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tracker, setTracker] = useState<Record<string, any> | null>(null);
  const [allFoods, setAllFoods] = useState<FoodSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Progressive UI states
  const [logFoodModalOpen, setLogFoodModalOpen] = useState(false);
  const [logEntryMethod, setLogEntryMethod] = useState<'search' | 'nl' | 'scan'>('search');
  const [moreNutritionOpen, setMoreNutritionOpen] = useState(false);
  const [savedMealsDrawerOpen, setSavedMealsDrawerOpen] = useState(false);
  const [collapsedMeals, setCollapsedMeals] = useState<Record<string, boolean>>({});
  const [expandedMealDetails, setExpandedMealDetails] = useState<Record<string, boolean>>({});

  // Manual food selection state
  const [selectedMealCat, setSelectedMealCat] = useState('breakfast');
  const [selectedFoodSlug, setSelectedFoodSlug] = useState('idli-steamed-rice-lentil');
  const [quantity, setQuantity] = useState(1);
  const [unitName, setUnitName] = useState('standard_serving');
  const [foodFilter, setFoodFilter] = useState('');

  // Natural-language food logging state
  const [nlSentence, setNlSentence] = useState('');
  const [nlParsing, setNlParsing] = useState(false);
  const [nlConfirming, setNlConfirming] = useState(false);
  const [nlPreview, setNlPreview] = useState<Record<string, any> | null>(null);
  const [nlItems, setNlItems] = useState<Record<string, any>[]>([]);
  const [nlError, setNlError] = useState<string | null>(null);

  // Saved Meals / Copy Day state
  const [copySourceDate, setCopySourceDate] = useState(() => {
    const d = new Date(Date.now() - 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [templateName, setTemplateName] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    if (location.search.includes('quick=log-food')) {
      setLogFoodModalOpen(true);
    }
  }, [location.search]);

  const loadDaily = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDailyTracker(activeMember?.id, selectedDate);
      setTracker(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeMember?.id, selectedDate]);

  useEffect(() => {
    void loadDaily();
  }, [loadDaily]);

  useEffect(() => {
    void api
      .searchFoods({ page_size: 100, sort_by: 'name_asc' })
      .then((res) => {
        setAllFoods(res.items);
        if (res.items.length > 0 && !selectedFoodSlug) {
          setSelectedFoodSlug(res.items[0].slug);
        }
      })
      .catch(() => null);
  }, []);

  const handleLogFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFoodSlug) return;
    const res = await api.addDailyFoodLog({
      member_id: activeMember?.id,
      logged_date: selectedDate,
      meal_category: selectedMealCat,
      food_slug: selectedFoodSlug,
      quantity,
      unit_name: unitName,
      logged_time: new Date().toTimeString().slice(0, 5),
    });
    setTracker(res.daily_summary);
    setStatusBanner(`Logged food to ${selectedMealCat.replace(/_/g, ' ')}.`);
    setLogFoodModalOpen(false);
  };

  const handleParseNlFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlSentence.trim()) return;
    setNlParsing(true);
    setNlError(null);
    try {
      const res = await api.parseNaturalLanguageFoodLog({
        member_id: activeMember?.id,
        text: nlSentence.trim(),
        logged_date: selectedDate,
        default_meal_category: selectedMealCat,
      });
      setNlPreview(res);
      setNlItems(res.parsed_items || []);
      if (res.meal_category) {
        setSelectedMealCat(res.meal_category);
      }
    } catch (err: any) {
      setNlError(err.message || 'Unable to parse meal description.');
    } finally {
      setNlParsing(false);
    }
  };

  const handleConfirmNlFood = async () => {
    if (!nlItems.length) return;
    setNlConfirming(true);
    setNlError(null);
    try {
      const res = await api.confirmNaturalLanguageFoodLog({
        member_id: activeMember?.id,
        user_confirmed: true,
        logged_date: selectedDate,
        meal_category: selectedMealCat,
        raw_text: nlSentence,
        items: nlItems.map((it) => ({
          ...it,
          meal_category: selectedMealCat,
          logged_date: selectedDate,
        })),
      });
      setTracker(res.daily_summary);
      setStatusBanner(`Logged ${res.saved_count || nlItems.length} item(s) to ${selectedMealCat.replace(/_/g, ' ')}.`);
      setNlPreview(null);
      setNlItems([]);
      setNlSentence('');
      setLogFoodModalOpen(false);
    } catch (err: any) {
      setNlError(err.message || 'Failed to save parsed food entries.');
    } finally {
      setNlConfirming(false);
    }
  };

  const handleQuickAddWater = async (amountMl: number) => {
    await api.addWaterLog({
      member_id: activeMember?.id,
      logged_date: selectedDate,
      amount_ml: amountMl,
      container_type: 'large_glass',
    });
    await loadDaily();
    setStatusBanner(`Added +${amountMl} ml water.`);
  };

  const handleUpdateEntryQty = async (entryId: number, nextQty: number) => {
    if (nextQty <= 0) return;
    const res = await api.updateDailyFoodLog(entryId, { quantity: nextQty });
    setTracker(res.daily_summary);
  };

  const handleMoveEntryMeal = async (entryId: number, nextMealCategory: string) => {
    const res = await api.updateDailyFoodLog(entryId, {
      meal_category: nextMealCategory,
    });
    setTracker(res.daily_summary);
  };

  const handleDeleteEntry = async (entryId: number) => {
    const res = await api.deleteDailyFoodLog(entryId);
    setTracker(res.daily_summary);
  };

  const handleCopyDay = async (mealCategoryFilter?: string) => {
    const res = await api.copyDayMeals({
      member_id: activeMember?.id,
      source_date: copySourceDate,
      target_date: selectedDate,
      ...(mealCategoryFilter ? { meal_category: mealCategoryFilter } : {}),
    });
    setTracker(res.daily_summary);
    setStatusBanner(
      `Copied ${res.copied_count} entry(s) from ${copySourceDate}${
        mealCategoryFilter ? ` (${mealCategoryFilter})` : ''
      }.`
    );
    setSavedMealsDrawerOpen(false);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    await api.createMealTemplate({
      member_id: activeMember?.id,
      name: templateName.trim(),
      meal_category: selectedMealCat,
      source_date: selectedDate,
    });
    setTemplateName('');
    await loadDaily();
    setStatusBanner('Saved meal to Saved Meals.');
  };

  const handleApplyTemplate = async (templateId: number) => {
    const res = await api.applyMealTemplate(templateId, {
      member_id: activeMember?.id,
      target_date: selectedDate,
    });
    setTracker(res);
    setStatusBanner('Applied saved meal to today’s diary.');
    setSavedMealsDrawerOpen(false);
  };

  const filteredFoods = foodFilter.trim()
    ? allFoods.filter((f) =>
        f.name_en.toLowerCase().includes(foodFilter.trim().toLowerCase())
      )
    : allFoods;

  const totals = tracker?.daily_nutrition?.totals || {};
  const targets = tracker?.targets || {};
  const hydration = tracker?.hydration || {};

  // Separate meals into logged vs empty so we never display huge empty cards
  const allMeals: Record<string, any>[] = tracker?.meals || [];
  const loggedMeals = allMeals.filter((m) => (m.entries || []).length > 0);
  const emptyMeals =
    allMeals.length > 0
      ? allMeals.filter((m) => (m.entries || []).length === 0)
      : DEFAULT_MEAL_SLOTS.map((s) => ({ meal_category: s.code, meal_label: s.label, entries: [] }));

  const openLogForMeal = (mealCode: string) => {
    setSelectedMealCat(mealCode);
    setLogFoodModalOpen(true);
  };

  return (
    <div data-testid="daily-tracker-page" className="space-y-6">
      {/* 5.1 Initial Tracker Header — "Today's Food", Date Picker, + Log Food & Saved Meals */}
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-0.5 text-[11px] font-semibold text-emerald-900">
              📒 Daily Food &amp; Hydration
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              Today’s Food
            </h1>
            <p className="text-xs text-stone-500">
              {tracker?.member?.display_name || activeMember?.display_name || 'Me'} •{' '}
              {formatGoalLabel(tracker?.member?.primary_goal)}
              {tracker?.today_training && (
                <span className="ml-2 font-semibold text-emerald-800">
                  •{' '}
                  {tracker.today_training.is_training_day
                    ? `Training (${tracker.today_training.workout_type})`
                    : 'Rest Day'}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Food Diary Date"
              data-testid="tracker-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-900"
            />
            <button
              type="button"
              data-testid="open-saved-meals-btn"
              onClick={() => setSavedMealsDrawerOpen((prev) => !prev)}
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
            >
              Saved Meals
            </button>
            <button
              type="button"
              data-testid="open-log-food-modal-btn"
              onClick={() => setLogFoodModalOpen((prev) => !prev)}
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
            >
              + Log Food
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-xs font-semibold text-emerald-950">
            ✓ {statusBanner}
          </div>
        )}

        {/* Top 3 Prioritised Summary Cards: Energy, Protein, Water */}
        <div className="grid gap-3.5 sm:grid-cols-3">
          {/* Energy */}
          <div
            data-testid="tracker-stat-energy"
            className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
              <span>Energy</span>
              <span>
                {Math.min(
                  100,
                  Math.round(
                    ((totals.energy_kcal ?? 0) / (targets.calories_kcal || 2000)) * 100
                  )
                )}
                %
              </span>
            </div>
            <div className="text-lg font-extrabold text-stone-900 tabular-nums">
              {totals.energy_kcal !== null && totals.energy_kcal !== undefined
                ? `${totals.energy_kcal} kcal`
                : 'NULL'}
              <span className="ml-1.5 text-xs font-medium text-stone-500">
                / {targets.calories_kcal || 2000} kcal
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
              <div
                className="h-full rounded-full bg-emerald-700 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((totals.energy_kcal ?? 0) / (targets.calories_kcal || 2000)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Protein */}
          <div
            data-testid="tracker-stat-protein"
            className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
              <span>Protein</span>
              <span>
                {Math.min(
                  100,
                  Math.round(
                    ((totals.protein_g ?? 0) / (targets.protein_g || 65)) * 100
                  )
                )}
                %
              </span>
            </div>
            <div className="text-lg font-extrabold text-stone-900 tabular-nums">
              {totals.protein_g !== null && totals.protein_g !== undefined
                ? `${totals.protein_g} g`
                : 'NULL'}
              <span className="ml-1.5 text-xs font-medium text-stone-500">
                / {targets.protein_g || 65} g
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((totals.protein_g ?? 0) / (targets.protein_g || 65)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Water */}
          <div
            data-testid="tracker-stat-hydration"
            className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
              <span>Water</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="tracker-quick-water-250"
                  onClick={() => void handleQuickAddWater(250)}
                  className="rounded-lg bg-emerald-800/10 px-2 py-0.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-800/20"
                >
                  +250 ml
                </button>
                <Link
                  to="/fitness/hydration"
                  className="text-[11px] font-semibold text-emerald-800 hover:underline"
                >
                  Water Tracker →
                </Link>
              </div>
            </div>
            <div className="text-lg font-extrabold text-stone-900 tabular-nums">
              {hydration.total_ml ?? 0} ml
              <span className="ml-1.5 text-xs font-medium text-stone-500">
                / {hydration.goal_ml || 2250} ml
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200/80">
              <div
                className="h-full rounded-full bg-sky-600 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((hydration.total_ml ?? 0) / (hydration.goal_ml || 2250)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Compact "More nutrition" expandable drawer */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            data-testid="toggle-more-nutrition-btn"
            onClick={() => setMoreNutritionOpen((prev) => !prev)}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900"
          >
            {moreNutritionOpen
              ? '▾ Hide secondary nutrients'
              : '▸ More nutrition (Carbs, Fat, Fibre, Sodium & Minerals)'}
          </button>

          {tracker?.daily_nutrition?.has_incomplete_entries && (
            <span
              data-testid="tracker-incomplete-nutrient-alert"
              className="text-[11px] font-medium text-amber-800"
            >
              ℹ️ Unmeasured nutrients remain NULL ({(tracker.daily_nutrition.incomplete_entry_names || []).join(', ')})
            </span>
          )}
        </div>

        {moreNutritionOpen && (
          <div
            data-testid="more-nutrition-panel"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-stone-200/70 bg-stone-50/70 p-4 text-xs"
          >
            {[
              {
                id: 'carbohydrates',
                label: 'Carbohydrates',
                val: totals.carbs_g,
                target: targets.carbs_g || 250,
                unit: 'g',
              },
              {
                id: 'total-fat',
                label: 'Total Fat',
                val: totals.fat_total_g,
                target: targets.fat_g || 55,
                unit: 'g',
              },
              {
                id: 'dietary-fibre',
                label: 'Dietary Fibre',
                val: totals.fibre_g,
                target: targets.fiber_g || 30,
                unit: 'g',
              },
              {
                id: 'sodium',
                label: 'Sodium',
                val: totals.sodium_mg,
                target: 2000,
                unit: 'mg',
              },
            ].map((sec) => (
              <div
                key={sec.id}
                data-testid={`tracker-stat-${sec.id}`}
                className="rounded-xl bg-white p-3 border border-stone-200/60"
              >
                <div className="text-[11px] font-medium text-stone-500">{sec.label}</div>
                <div className="mt-1 font-bold text-stone-900 tabular-nums">
                  {sec.val !== null && sec.val !== undefined
                    ? `${sec.val} ${sec.unit}`
                    : 'NULL'}
                </div>
                <div className="text-[10px] text-stone-400">
                  Target: {sec.target} {sec.unit}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5.2 & 5.3 Unified "+ Log Food" Drawer/Panel (Search Indian Foods, Natural Language, or Scan) */}
      <section
        data-testid="log-food-drawer"
        className={`rounded-3xl border border-stone-200/90 bg-white p-6 shadow-md space-y-5 ${
          logFoodModalOpen ? 'block' : 'hidden'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">Log Food</h2>
            <p className="text-xs text-stone-500">
              Choose when you ate, then search Indian foods, describe your meal in plain English, or scan a label.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLogFoodModalOpen(false)}
            className="text-xs font-semibold text-stone-500 hover:text-stone-800"
          >
            ✕ Close
          </button>
        </div>

        {/* Step 1: When did you eat? */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-stone-700">
            When did you eat?
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DEFAULT_MEAL_SLOTS.map((slot) => (
              <button
                key={slot.code}
                type="button"
                onClick={() => setSelectedMealCat(slot.code)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  selectedMealCat === slot.code
                    ? 'bg-emerald-800 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200/70'
                }`}
              >
                {slot.label}
              </button>
            ))}
            <select
              aria-label="Meal Category Selector"
              data-testid="tracker-meal-category-select"
              value={selectedMealCat}
              onChange={(e) => setSelectedMealCat(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800"
            >
              {(tracker?.meal_categories_catalog || [
                { code: 'early_morning', label: 'Early Morning' },
                { code: 'breakfast', label: 'Breakfast' },
                { code: 'mid_morning_snack', label: 'Morning Snack' },
                { code: 'lunch', label: 'Lunch' },
                { code: 'evening_snack', label: 'Evening Snack' },
                { code: 'pre_workout', label: 'Pre-Workout' },
                { code: 'post_workout', label: 'Post-Workout' },
                { code: 'dinner', label: 'Dinner' },
                { code: 'other', label: 'Other' },
              ]).map((mc: any) => (
                <option key={mc.code} value={mc.code}>
                  {mc.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 2: What did you eat? (3 Entry Methods) */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-700">What did you eat?</span>
            <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-semibold">
              <button
                type="button"
                data-testid="log-mode-search"
                onClick={() => setLogEntryMethod('search')}
                className={`rounded-lg px-3 py-1.5 transition ${
                  logEntryMethod === 'search'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600'
                }`}
              >
                1. Search Indian Foods
              </button>
              <button
                type="button"
                data-testid="log-mode-nl"
                onClick={() => setLogEntryMethod('nl')}
                className={`rounded-lg px-3 py-1.5 transition ${
                  logEntryMethod === 'nl'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600'
                }`}
              >
                2. Describe Meal (AI)
              </button>
              <button
                type="button"
                data-testid="log-mode-scan"
                onClick={() => setLogEntryMethod('scan')}
                className={`rounded-lg px-3 py-1.5 transition ${
                  logEntryMethod === 'scan'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600'
                }`}
              >
                3. Scan Packaged Food
              </button>
            </div>
          </div>

          {/* Entry Method 1: Search Indian Foods */}
          {logEntryMethod === 'search' && (
            <form onSubmit={(e) => void handleLogFood(e)} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600">
                    Filter by food name
                  </label>
                  <input
                    type="text"
                    value={foodFilter}
                    onChange={(e) => setFoodFilter(e.target.value)}
                    placeholder="Type Idli, Ragi, Sambar, Dal, Egg..."
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-600">
                    Select Indian Food / Dish
                  </label>
                  <select
                    aria-label="Select Food to Log"
                    data-testid="tracker-food-select"
                    value={selectedFoodSlug}
                    onChange={(e) => setSelectedFoodSlug(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    {filteredFoods.map((f) => (
                      <option key={f.slug} value={f.slug}>
                        {f.name_en} ({f.standard_serving_name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantity and serving selection after food identification */}
              {selectedFoodSlug && (
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl bg-stone-50 p-3.5">
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        data-testid="tracker-qty-input"
                        value={quantity}
                        onChange={(e) =>
                          setQuantity(Math.max(0.25, Number(e.target.value) || 1))
                        }
                        className="mt-1 w-24 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600">
                        Serving Unit
                      </label>
                      <select
                        value={unitName}
                        onChange={(e) => setUnitName(e.target.value)}
                        className="mt-1 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold"
                      >
                        <option value="standard_serving">Standard Serving</option>
                        <option value="100g">100g</option>
                        <option value="katori">Katori / Bowl</option>
                        <option value="roti">Roti / Piece</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    data-testid="tracker-add-food-btn"
                    className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
                  >
                    + Add to Daily Log
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Entry Method 2: Natural-Language Food Logging */}
          {logEntryMethod === 'nl' && (
            <div className="space-y-4">
              <form onSubmit={(e) => void handleParseNlFood(e)} className="space-y-2.5">
                <label className="block text-xs font-semibold text-stone-700">
                  Describe what you ate in natural language
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    data-testid="nl-food-log-input"
                    value={nlSentence}
                    onChange={(e) => setNlSentence(e.target.value)}
                    placeholder="e.g. I had two idlis and one bowl of sambar for breakfast"
                    className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={nlParsing}
                    data-testid="nl-food-parse-btn"
                    className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {nlParsing ? 'Parsing...' : 'Preview Nutrition'}
                  </button>
                </div>
              </form>

              {nlError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                  ⚠️ {nlError}
                </div>
              )}

              {nlPreview && (
                <div
                  data-testid="nl-food-preview-card"
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">
                      Matched Food Items ({nlItems.length})
                    </span>
                    <span className="text-[11px] text-stone-500">
                      Review quantities before saving
                    </span>
                  </div>

                  {(nlPreview.clarification_questions || []).length > 0 && (
                    <div
                      data-testid="nl-food-clarification"
                      className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-950 space-y-1"
                    >
                      {(nlPreview.clarification_questions || []).map(
                        (q: string, idx: number) => (
                          <div key={idx}>• {q}</div>
                        )
                      )}
                    </div>
                  )}

                  {nlItems.length > 0 && (
                    <div className="space-y-2">
                      {nlItems.map((it, idx) => (
                        <div
                          key={`${it.food_slug}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 border border-stone-200/80"
                        >
                          <div>
                            <div className="font-bold text-stone-900">{it.food_name}</div>
                            <div className="text-[11px] text-stone-500">
                              {it.grams_equivalent}g •{' '}
                              {it.energy_kcal !== null
                                ? `${it.energy_kcal} kcal`
                                : 'NULL kcal'}{' '}
                              •{' '}
                              {it.protein_g !== null ? `${it.protein_g}g P` : 'NULL P'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0.25"
                              value={it.quantity}
                              onChange={(e) => {
                                const nextQ = Math.max(0.25, Number(e.target.value) || 1);
                                setNlItems((prev) =>
                                  prev.map((row, rIdx) =>
                                    rIdx === idx ? { ...row, quantity: nextQ } : row
                                  )
                                );
                              }}
                              className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-xs font-bold text-center"
                            />
                            <span className="text-[11px] text-stone-500">
                              {it.unit_name}
                            </span>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={nlConfirming}
                          data-testid="nl-food-confirm-btn"
                          onClick={() => void handleConfirmNlFood()}
                          className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {nlConfirming ? 'Saving...' : '✓ Confirm & Save to Diary'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Entry Method 3: Scan a Packaged Food */}
          {logEntryMethod === 'scan' && (
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <Link
                to="/barcode"
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 hover:bg-stone-100 transition"
              >
                <div className="font-bold text-stone-900">🏷️ Barcode Scanner</div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Scan EAN-13 / UPC barcodes from Indian packaged foods.
                </p>
              </Link>
              <Link
                to="/scanner"
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 hover:bg-stone-100 transition"
              >
                <div className="font-bold text-stone-900">📷 Label OCR Reader</div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Extract nutrition facts and ingredients from a package label.
                </p>
              </Link>
              <Link
                to="/tools/mess-analyzer"
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 hover:bg-stone-100 transition"
              >
                <div className="font-bold text-stone-900">🍱 Mess Plate Analyzer</div>
                <p className="mt-1 text-[11px] text-stone-500">
                  Log a hostel or canteen thali plate in one click.
                </p>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 5.5 Saved Meals Drawer (Hidden by Default) */}
      {savedMealsDrawerOpen && (
        <section
          data-testid="saved-meals-drawer"
          className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-md space-y-4"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">Saved Meals</h2>
              <p className="text-xs text-stone-500">
                Reuse yesterday’s breakfast, copy a previous day, or apply a saved meal template.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSavedMealsDrawerOpen(false)}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800"
            >
              ✕ Close
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              data-testid="reuse-yesterday-breakfast-btn"
              onClick={() => void handleCopyDay('breakfast')}
              className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 font-semibold text-emerald-950 hover:bg-emerald-100"
            >
              ↺ Reuse Yesterday’s Breakfast
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <span className="font-semibold text-stone-600">Copy from date:</span>
              <input
                type="date"
                value={copySourceDate}
                onChange={(e) => setCopySourceDate(e.target.value)}
                className="rounded-xl border border-stone-300 px-2.5 py-1.5 font-semibold"
              />
              <button
                type="button"
                data-testid="copy-day-meals-btn"
                onClick={() => void handleCopyDay()}
                className="rounded-xl bg-stone-900 px-3.5 py-1.5 font-bold text-white hover:bg-stone-800"
              >
                Copy Day
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-stone-100 pt-3 text-xs">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`Save today’s ${selectedMealCat.replace(/_/g, ' ')} as a reusable meal...`}
              className="flex-1 rounded-xl border border-stone-300 px-3 py-1.5"
            />
            <button
              type="button"
              onClick={() => void handleSaveTemplate()}
              className="rounded-xl border border-emerald-700 px-3.5 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Save Meal
            </button>
          </div>

          {(tracker?.meal_templates || []).length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-stone-500">
                Your Saved Templates:
              </div>
              <div className="flex flex-wrap gap-2">
                {(tracker?.meal_templates || []).map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void handleApplyTemplate(t.id)}
                    className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
                  >
                    + Apply “{t.name}” ({t.items_count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5.4 Clean Meal Timeline — Only Show Meal Sections Containing Actual Entries */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-stone-900">
            Meal Timeline ({selectedDate})
          </h2>
          {/* Small inline quick-add actions for unlogged meals instead of large empty cards */}
          {emptyMeals.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {emptyMeals.slice(0, 5).map((em: any) => (
                <button
                  key={em.meal_category}
                  type="button"
                  data-testid={`quick-add-meal-${em.meal_category}`}
                  onClick={() => openLogForMeal(em.meal_category)}
                  className="rounded-xl border border-stone-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-600 hover:border-emerald-700 hover:text-emerald-900 transition"
                >
                  + Add {em.meal_label}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && !tracker ? (
          <div className="h-36 animate-pulse rounded-3xl bg-stone-200/70" />
        ) : loggedMeals.length === 0 ? (
          <div
            data-testid="empty-meal-timeline"
            className="rounded-3xl border border-stone-200/80 bg-white p-8 text-center space-y-3"
          >
            <div className="text-sm font-bold text-stone-900">
              No meals logged yet for {selectedDate}
            </div>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Record breakfast in seconds using food search or natural language.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => openLogForMeal('breakfast')}
                className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                + Add Breakfast
              </button>
              <button
                type="button"
                onClick={() => openLogForMeal('lunch')}
                className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                + Add Lunch
              </button>
              <button
                type="button"
                onClick={() => openLogForMeal('dinner')}
                className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                + Add Dinner
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {loggedMeals.map((meal: any) => {
              const mTot = meal.summary?.totals || {};
              const isCollapsed = Boolean(collapsedMeals[meal.meal_category]);
              const showDetails = Boolean(expandedMealDetails[meal.meal_category]);

              return (
                <div
                  key={meal.meal_category}
                  data-testid={`meal-card-${meal.meal_category}`}
                  className="rounded-3xl border border-stone-200/85 bg-white p-5 shadow-2xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedMeals((prev) => ({
                            ...prev,
                            [meal.meal_category]: !prev[meal.meal_category],
                          }))
                        }
                        className="text-xs font-bold text-stone-400 hover:text-stone-700"
                        aria-label={`Toggle ${meal.meal_label}`}
                      >
                        {isCollapsed ? '▸' : '▾'}
                      </button>
                      <div>
                        <h3 className="text-sm font-bold text-stone-900">
                          {meal.meal_label}
                        </h3>
                        <span className="text-[11px] text-stone-500">
                          {meal.entries.length} item(s)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-stone-800 tabular-nums">
                        {mTot.energy_kcal ?? 0} kcal • {mTot.protein_g ?? 0}g P
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMealDetails((prev) => ({
                            ...prev,
                            [meal.meal_category]: !prev[meal.meal_category],
                          }))
                        }
                        className="text-[11px] font-semibold text-emerald-800 hover:underline"
                      >
                        {showDetails ? 'Hide details' : 'More details'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openLogForMeal(meal.meal_category)}
                        className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {showDetails && (
                    <div className="rounded-2xl bg-stone-50 px-3.5 py-2.5 text-[11px] text-stone-600 flex flex-wrap gap-4 tabular-nums">
                      <span>Carbs: <strong>{mTot.carbs_g ?? 'NULL'} g</strong></span>
                      <span>Fat: <strong>{mTot.fat_total_g ?? 'NULL'} g</strong></span>
                      <span>Fibre: <strong>{mTot.fibre_g ?? 'NULL'} g</strong></span>
                      <span>Sodium: <strong>{mTot.sodium_mg ?? 'NULL'} mg</strong></span>
                    </div>
                  )}

                  {!isCollapsed && (
                    <div className="space-y-2 pt-1">
                      {meal.entries.map((entry: any) => (
                        <div
                          key={entry.id}
                          data-testid={`food-log-entry-${entry.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FAF8F5] px-3.5 py-2.5 text-xs border border-stone-200/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-stone-900 truncate">
                              {entry.food_name}
                            </div>
                            <div className="text-[11px] text-stone-500 tabular-nums">
                              {entry.quantity} × {entry.unit_name} ({entry.grams_equivalent}g) •{' '}
                              {entry.energy_kcal !== null
                                ? `${entry.energy_kcal} kcal`
                                : 'NULL kcal'}{' '}
                              •{' '}
                              {entry.protein_g !== null
                                ? `${entry.protein_g}g P`
                                : 'NULL P'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              data-testid={`entry-plus-${entry.id}`}
                              onClick={() =>
                                void handleUpdateEntryQty(entry.id, entry.quantity + 0.5)
                              }
                              className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-stone-100"
                              title="Increase quantity"
                            >
                              +0.5
                            </button>
                            <select
                              aria-label="Move Meal Slot"
                              value={entry.meal_category}
                              onChange={(e) =>
                                void handleMoveEntryMeal(entry.id, e.target.value)
                              }
                              className="rounded-lg border border-stone-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold"
                            >
                              {(tracker?.meal_categories_catalog || DEFAULT_MEAL_SLOTS).map(
                                (mc: any) => (
                                  <option key={mc.code} value={mc.code}>
                                    {mc.label}
                                  </option>
                                )
                              )}
                            </select>
                            <button
                              type="button"
                              data-testid={`delete-food-log-${entry.id}`}
                              onClick={() => void handleDeleteEntry(entry.id)}
                              className="rounded-lg px-2 py-0.5 font-bold text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

// ==========================================
// 3. WATER & HYDRATION TRACKER (MODULE C)
// ==========================================
export const WaterTrackerPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [hydration, setHydration] = useState<Record<string, any> | null>(null);
  const [customMl, setCustomMl] = useState('350');
  const [containerType, setContainerType] = useState('large_glass');
  const [goalDraft, setGoalDraft] = useState('2250');
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  const loadHydration = useCallback(async () => {
    try {
      const res = await api.getDailyHydration(activeMember?.id, selectedDate);
      setHydration(res);
      if (res.settings) {
        setGoalDraft(String(res.settings.daily_goal_ml));
        setContainerType(res.settings.preferred_container || 'large_glass');
        setRemindersEnabled(Boolean(res.settings.reminders_enabled));
      }
    } catch {
      // ignore
    }
  }, [activeMember?.id, selectedDate]);

  useEffect(() => {
    void loadHydration();
  }, [loadHydration]);

  const handleQuickAddWater = async (amountMl: number) => {
    const res = await api.addWaterLog({
      member_id: activeMember?.id,
      logged_date: selectedDate,
      amount_ml: amountMl,
      container_type: containerType,
    });
    setHydration(res);
  };

  const handleUndoEntry = async (logId: number) => {
    const res = await api.deleteWaterLog(logId);
    setHydration(res);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.updateHydrationSettings({
      member_id: activeMember?.id,
      daily_goal_ml: Number(goalDraft) || 2250,
      preferred_container: containerType,
      reminders_enabled: remindersEnabled,
    });
    setHydration(res);
  };

  const totalMl = hydration?.total_ml ?? 0;
  const goalMl = hydration?.goal_ml ?? 2250;
  const pct = hydration?.progress_pct ?? 0;

  return (
    <div data-testid="water-tracker-page" className="space-y-6">
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 sm:p-8 shadow-2xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-3 py-0.5 text-[11px] font-semibold text-sky-900">
              💧 Daily Water &amp; Hydration
            </span>
            <h1
              data-testid="hydration-readout-headline"
              className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900 tabular-nums"
            >
              {totalMl.toLocaleString()} ml{' '}
              <span className="text-lg sm:text-xl font-semibold text-stone-500">
                / {goalMl.toLocaleString()} ml
              </span>
            </h1>
            <p className="text-xs text-stone-500">
              {(hydration?.remaining_ml || 0) > 0
                ? `${hydration?.remaining_ml} ml remaining toward your daily target.`
                : 'Daily hydration target reached.'}
            </p>
          </div>

          <Link
            to="/fitness/tracker"
            className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            ← Back to Today’s Food
          </Link>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-sky-600 transition-all duration-300"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap gap-2">
            {[150, 200, 250, 300, 500].map((amt) => (
              <button
                key={amt}
                type="button"
                data-testid={`quick-water-${amt}`}
                onClick={() => void handleQuickAddWater(amt)}
                className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
              >
                + {amt} ml
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Preferred Water Container"
              value={containerType}
              onChange={(e) => setContainerType(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800"
            >
              <option value="small_glass">Small Glass (150 ml)</option>
              <option value="large_glass">Large Glass (250 ml)</option>
              <option value="water_bottle">Water Bottle (500 ml)</option>
              <option value="custom_container">Custom Container</option>
            </select>
            <input
              type="number"
              value={customMl}
              onChange={(e) => setCustomMl(e.target.value)}
              className="w-20 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-900"
            />
            <button
              type="button"
              data-testid="custom-water-add-btn"
              onClick={() => void handleQuickAddWater(Number(customMl) || 250)}
              className="rounded-xl border border-stone-200 bg-stone-100 px-3.5 py-2 text-xs font-bold text-stone-900 hover:bg-stone-200"
            >
              + Log Custom
            </button>
          </div>
        </div>

        {hydration?.fluid_medical_notice && (
          <div
            data-testid="hydration-medical-notice"
            className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs font-semibold text-amber-950"
          >
            ⚠️ {hydration.fluid_medical_notice}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-900">
              Hydration Log ({hydration?.entries?.length || 0} entries)
            </h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-1 text-xs font-semibold"
            />
          </div>

          {(hydration?.entries || []).length === 0 ? (
            <div className="rounded-2xl bg-stone-50 p-6 text-center text-xs text-stone-500">
              No water entries recorded yet for {selectedDate}.
            </div>
          ) : (
            <div className="space-y-2">
              {(hydration?.entries || []).map((e: any) => (
                <div
                  key={e.id}
                  data-testid={`water-entry-${e.id}`}
                  className="flex items-center justify-between rounded-2xl border border-stone-200/75 bg-[#FAF8F5] px-4 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-900">{e.amount_ml} ml</span> •{' '}
                    <span className="capitalize text-stone-600">
                      {e.container_type.replace(/_/g, ' ')}
                    </span>{' '}
                    <span className="text-stone-400">at {e.logged_time}</span>
                  </div>
                  <button
                    type="button"
                    data-testid={`undo-water-${e.id}`}
                    onClick={() => void handleUndoEntry(e.id)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="lg:col-span-5 rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4"
        >
          <h2 className="text-base font-bold text-stone-900">
            Hydration Goal &amp; Reminders
          </h2>
          <p className="text-xs text-stone-500">
            {hydration?.individual_hydration_disclaimer}
          </p>
          <div>
            <label className="block text-xs font-semibold text-stone-700">
              Daily Hydration Target (ml)
            </label>
            <input
              type="number"
              step="50"
              data-testid="hydration-goal-input"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
              className="rounded border-stone-300 text-emerald-800"
            />
            Enable gentle in-app hydration reminders
          </label>
          <button
            type="submit"
            data-testid="save-hydration-settings-btn"
            className="w-full rounded-xl bg-emerald-800 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
          >
            Save Hydration Target
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 4. REBUILT GOALS & GRAPH-FIRST HABIT EXPERIENCE
// ==========================================
interface AwardedBadgeRecord {
  id: string;
  code?: string;
  title: string;
  subtitle: string;
  category?: string;
  badge_icon?: string;
  awarded_date: string;
  period_key?: string;
  seen_by_user?: boolean;
}

export const GoalsHabitsPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'habits' | 'goals'>('habits');
  const [goals, setGoals] = useState<Record<string, any>[]>([]);
  const [habits, setHabits] = useState<Record<string, any>[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, any>[]>([]);

  // Graph-First Habit Chart Controls
  const [habitRangeDays, setHabitRangeDays] = useState<7 | 30 | 90>(7);
  const [selectedHabitGraphId, setSelectedHabitGraphId] = useState<string>('all');

  // On-demand modals/drawers (never show creation forms simultaneously by default)
  const [addGoalModalOpen, setAddGoalModalOpen] = useState(false);
  const [addHabitModalOpen, setAddHabitModalOpen] = useState(false);
  const [measurementsDrawerOpen, setMeasurementsDrawerOpen] = useState(false);
  const [showPausedHabits, setShowPausedHabits] = useState(false);

  // Habit inline edit / action menu state
  const [openMenuHabitId, setOpenMenuHabitId] = useState<number | null>(null);
  const [editingHabitId, setEditingHabitId] = useState<number | null>(null);
  const [editHabitTitle, setEditHabitTitle] = useState('');
  const [editHabitDesc, setEditHabitDesc] = useState('');
  const [editHabitFreq, setEditHabitFreq] = useState('daily');

  // Goal creation form state
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalType, setNewGoalType] = useState('protein_intake');
  const [newGoalTarget, setNewGoalTarget] = useState('75');
  const [newGoalUnit, setNewGoalUnit] = useState('g / day');

  // Habit creation form state
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitDesc, setNewHabitDesc] = useState('');
  const [newHabitFreq, setNewHabitFreq] = useState('daily');

  // Optional body measurements form state
  const [measWeight, setMeasWeight] = useState('');
  const [measWaist, setMeasWaist] = useState('');
  const [measMilestone, setMeasMilestone] = useState('');

  // Goal Achievement Reward state (persisted per member in backend DB + synced with localStorage)
  const memberStorageSuffix = activeMember?.id ? `member_${activeMember.id}` : 'default';
  const badgeStorageKey = `gharplate_awarded_badges_${memberStorageSuffix}`;
  const rewardsEnabledKey = `gharplate_rewards_enabled_${memberStorageSuffix}`;

  const [rewardsEnabled, setRewardsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(rewardsEnabledKey) !== 'false';
    } catch {
      return true;
    }
  });

  const [awardedBadges, setAwardedBadges] = useState<AwardedBadgeRecord[]>(() => {
    try {
      const raw = localStorage.getItem(badgeStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [upcomingMilestones, setUpcomingMilestones] = useState<Record<string, any>[]>([]);
  const [celebrationBanner, setCelebrationBanner] = useState<AwardedBadgeRecord | null>(
    null
  );

  useEffect(() => {
    if (location.search.includes('tab=goals')) {
      setActiveTab('goals');
    } else if (location.search.includes('tab=habits')) {
      setActiveTab('habits');
    }
  }, [location.search]);

  const syncAchievementsWithBackend = useCallback(async () => {
    try {
      let localStored: AwardedBadgeRecord[] = [];
      try {
        const raw = localStorage.getItem(badgeStorageKey);
        localStored = raw ? JSON.parse(raw) : [];
      } catch {
        localStored = [];
      }

      let achRes: Record<string, any> | null = null;
      if (localStored.length > 0 && typeof api.migrateLocalAchievements === 'function') {
        achRes = await api
          .migrateLocalAchievements({
            member_id: activeMember?.id,
            badge_codes: localStored.map((b) => b.code || b.id),
          })
          .catch(() => null);
      }
      if (!achRes && typeof api.getMemberAchievements === 'function') {
        achRes = await api.getMemberAchievements(activeMember?.id).catch(() => null);
      }

      if (achRes) {
        if (typeof achRes.rewards_enabled === 'boolean') {
          setRewardsEnabled(achRes.rewards_enabled);
        }
        if (Array.isArray(achRes.upcoming_milestones)) {
          setUpcomingMilestones(achRes.upcoming_milestones);
        }
        if (Array.isArray(achRes.earned_achievements) && achRes.earned_achievements.length > 0) {
          const mapped: AwardedBadgeRecord[] = achRes.earned_achievements.map((ea: any) => ({
            id: String(ea.id || ea.code),
            code: ea.code,
            title: ea.title,
            subtitle: ea.description || ea.subtitle || '',
            category: ea.category || 'Consistency',
            badge_icon: ea.badge_icon || '🏅',
            awarded_date: ea.awarded_date || todayStr(),
            period_key: ea.period_key || 'lifetime',
            seen_by_user: ea.seen_by_user,
          }));
          setAwardedBadges((prev) => {
            const seenTitles = new Set(mapped.map((m) => m.title));
            const extraLocal = prev.filter((p) => !seenTitles.has(p.title));
            const merged = [...mapped, ...extraLocal];
            try {
              localStorage.setItem(badgeStorageKey, JSON.stringify(merged));
            } catch {
              // ignore
            }
            return merged;
          });
        }
        if (
          achRes.rewards_enabled !== false &&
          Array.isArray(achRes.newly_awarded) &&
          achRes.newly_awarded.length > 0
        ) {
          const firstNew = achRes.newly_awarded[0];
          setCelebrationBanner({
            id: String(firstNew.id || firstNew.code),
            code: firstNew.code,
            title: firstNew.title,
            subtitle: firstNew.description || firstNew.subtitle || '',
            category: firstNew.category || 'Consistency',
            badge_icon: firstNew.badge_icon || '🏅',
            awarded_date: firstNew.awarded_date || todayStr(),
          });
        }
      }
    } catch {
      // ignore fallback errors
    }
  }, [activeMember?.id, badgeStorageKey]);

  const loadAll = useCallback(async () => {
    try {
      const [gRes, hRes, mRes] = await Promise.all([
        api.getFitnessGoals(activeMember?.id),
        api.getHabits(activeMember?.id),
        api.getMeasurements(activeMember?.id),
      ]);
      setGoals(gRes);
      setHabits(hRes);
      setMeasurements(mRes);
      await syncAchievementsWithBackend();
    } catch {
      // ignore
    }
  }, [activeMember?.id, syncAchievementsWithBackend]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Deduplicate active habits on frontend as well so repeated titles never render twice
  const { activeScheduledHabits, pausedHabits } = useMemo(() => {
    const seenKeys = new Set<string>();
    const active: Record<string, any>[] = [];
    const paused: Record<string, any>[] = [];

    for (const h of habits) {
      if (h.is_active === false) {
        paused.push(h);
        continue;
      }
      const normTitle = (h.title || '').trim().toLowerCase();
      if (seenKeys.has(normTitle)) continue;
      seenKeys.add(normTitle);
      active.push(h);
    }
    return { activeScheduledHabits: active, pausedHabits: paused };
  }, [habits]);

  // Evaluate genuine goal achievements and award each milestone only once
  useEffect(() => {
    if (!rewardsEnabled) return;
    let stored: AwardedBadgeRecord[] = [];
    try {
      const raw = localStorage.getItem(badgeStorageKey);
      stored = raw ? JSON.parse(raw) : [];
    } catch {
      stored = [];
    }
    const existingIds = new Set(stored.map((b) => b.id));
    const existingTitles = new Set(stored.map((b) => b.title));
    const newlyEarned: AwardedBadgeRecord[] = [];

    // 1. Check completed personal goals (progress_pct >= 100)
    for (const g of goals) {
      if ((g.progress_pct || 0) >= 100) {
        const badgeId = `goal_100_${g.id}`;
        const badgeTitle = `Goal Reached: ${g.goal_name}`;
        if (!existingIds.has(badgeId) && !existingTitles.has(badgeTitle)) {
          newlyEarned.push({
            id: badgeId,
            title: badgeTitle,
            subtitle: `Completed ${g.current_value} / ${g.target_value} ${g.unit}`,
            category: 'Personal Goals',
            badge_icon: '🏅',
            awarded_date: todayStr(),
          });
          existingIds.add(badgeId);
          existingTitles.add(badgeTitle);
        }
      }
    }

    // 2. Check if all today's scheduled habits are completed
    if (
      activeScheduledHabits.length > 0 &&
      activeScheduledHabits.every((h) => Boolean(h.completed_on_date))
    ) {
      const badgeId = `all_habits_${todayStr()}`;
      if (!existingIds.has(badgeId)) {
        newlyEarned.push({
          id: badgeId,
          title: 'Daily Habit Cycle Complete',
          subtitle: `Completed all ${activeScheduledHabits.length} scheduled habits for today.`,
          category: 'Consistency',
          badge_icon: '✅',
          awarded_date: todayStr(),
        });
        existingIds.add(badgeId);
      }
    }

    if (newlyEarned.length > 0) {
      const updatedList = [...newlyEarned, ...stored];
      setAwardedBadges(updatedList);
      setCelebrationBanner(newlyEarned[0]);
      try {
        localStorage.setItem(badgeStorageKey, JSON.stringify(updatedList));
      } catch {
        // ignore
      }
      if (typeof api.migrateLocalAchievements === 'function') {
        void api
          .migrateLocalAchievements({
            member_id: activeMember?.id,
            badge_codes: newlyEarned.map((b) => b.code || b.id),
          })
          .catch(() => null);
      }
    } else if (stored.length > 0 && awardedBadges.length === 0) {
      setAwardedBadges(stored);
    }
  }, [goals, activeScheduledHabits, rewardsEnabled, badgeStorageKey, activeMember?.id]);

  const handleToggleRewards = (checked: boolean) => {
    setRewardsEnabled(checked);
    if (!checked) setCelebrationBanner(null);
    try {
      localStorage.setItem(rewardsEnabledKey, String(checked));
    } catch {
      // ignore
    }
    if (typeof api.updateAchievementPreferences === 'function') {
      void api
        .updateAchievementPreferences({
          member_id: activeMember?.id,
          rewards_enabled: checked,
        })
        .catch(() => null);
    }
  };

  const handleDismissCelebration = () => {
    if (celebrationBanner && typeof api.markAchievementsSeen === 'function') {
      const numId = Number(celebrationBanner.id);
      void api
        .markAchievementsSeen({
          member_id: activeMember?.id,
          ...(Number.isFinite(numId) && numId > 0 ? { achievement_ids: [numId] } : {}),
        })
        .catch(() => null);
    }
    setCelebrationBanner(null);
  };

  // Build Graph-First Habit Completion Consistency Series (7d / 30d / 90d)
  const habitGraphSeries = useMemo(() => {
    const targetHabits =
      selectedHabitGraphId === 'all'
        ? activeScheduledHabits
        : activeScheduledHabits.filter((h) => String(h.id) === selectedHabitGraphId);

    const endDt = new Date();
    const series: {
      date: string;
      label: string;
      value: number | null;
      scheduledCount: number;
      completedCount: number;
      statusNote: string;
    }[] = [];

    for (let offset = habitRangeDays - 1; offset >= 0; offset -= 1) {
      const dt = new Date(endDt.getTime() - offset * 86400000);
      const dStr = dt.toISOString().slice(0, 10);
      const dayOfWeek = dt.getDay(); // 0 Sun .. 6 Sat
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      let scheduled = 0;
      let completed = 0;

      for (const h of targetHabits) {
        const freq = (h.frequency || 'daily').toLowerCase();
        // Do not count rest days or unscheduled days as missed
        const isScheduledOnDay =
          freq === 'daily' ||
          freq === 'morning' ||
          freq === 'evening' ||
          (freq === 'weekdays' && !isWeekend) ||
          (freq === 'training_days' && !isWeekend) ||
          (freq === 'weekly' && dayOfWeek === 0);

        if (!isScheduledOnDay) continue;
        scheduled += 1;

        const compDates: string[] =
          h.completed_dates ||
          (h.weekly_days || [])
            .filter((wd: any) => wd.completed)
            .map((wd: any) => wd.date);

        if (compDates.includes(dStr)) {
          completed += 1;
        }
      }

      const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;
      series.push({
        date: dStr,
        label: dStr.slice(5),
        value: pct,
        scheduledCount: scheduled,
        completedCount: completed,
        statusNote:
          scheduled > 0
            ? `${completed}/${scheduled} scheduled habits completed (${pct}%)`
            : 'No habits scheduled (rest day)',
      });
    }

    return series;
  }, [activeScheduledHabits, habitRangeDays, selectedHabitGraphId]);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalName.trim()) return;
    const updated = await api.createFitnessGoal({
      member_id: activeMember?.id,
      goal_name: newGoalName.trim(),
      goal_type: newGoalType,
      target_value: Number(newGoalTarget) || 75,
      unit: newGoalUnit,
      tracking_frequency: 'daily',
    });
    setGoals(updated);
    setNewGoalName('');
    setAddGoalModalOpen(false);
    void syncAchievementsWithBackend();
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    const updated = await api.createHabit({
      member_id: activeMember?.id,
      title: newHabitTitle.trim(),
      description: newHabitDesc.trim() || null,
      frequency: newHabitFreq,
      category: 'nutrition',
    });
    setHabits(updated);
    setNewHabitTitle('');
    setNewHabitDesc('');
    setAddHabitModalOpen(false);
    void syncAchievementsWithBackend();
  };

  const handleToggleHabit = async (habitId: number) => {
    const updated = await api.toggleHabitCompletion(habitId, todayStr());
    setHabits(updated);
    void syncAchievementsWithBackend();
  };

  const handleStartEditHabit = (h: Record<string, any>) => {
    setEditingHabitId(h.id);
    setEditHabitTitle(h.title || '');
    setEditHabitDesc(h.description || '');
    setEditHabitFreq(h.frequency || 'daily');
    setOpenMenuHabitId(null);
  };

  const handleSaveEditHabit = async (habitId: number) => {
    const updated = await api.updateHabit(habitId, {
      title: editHabitTitle.trim() || 'Daily Habit',
      description: editHabitDesc.trim() || null,
      frequency: editHabitFreq,
    });
    setHabits(updated);
    setEditingHabitId(null);
  };

  const handlePauseResumeHabit = async (h: Record<string, any>) => {
    const updated = await api.updateHabit(h.id, {
      is_active: h.is_active === false,
    });
    setHabits(updated);
    setOpenMenuHabitId(null);
  };

  const handleDeleteHabit = async (habitId: number) => {
    const updated = await api.deleteHabit(habitId);
    setHabits(updated);
    setOpenMenuHabitId(null);
  };

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await api.addMeasurement({
      member_id: activeMember?.id,
      logged_date: todayStr(),
      weight_kg: measWeight ? Number(measWeight) : null,
      waist_cm: measWaist ? Number(measWaist) : null,
      milestone_note: measMilestone || null,
    });
    setMeasurements(updated);
    setMeasWeight('');
    setMeasWaist('');
    setMeasMilestone('');
    setMeasurementsDrawerOpen(false);
  };

  const completedTodayCount = activeScheduledHabits.filter((h) => h.completed_on_date).length;

  return (
    <div data-testid="goals-habits-page" className="space-y-6">
      {/* 6.1 Header with Two Simple Tabs (Daily Habits | Goals) & Secondary Action "Create with AI" */}
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-0.5 text-[11px] font-semibold text-emerald-900">
              🎯 Consistency &amp; Milestones
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              My Goals &amp; Habits
            </h1>
            <p className="text-xs text-stone-500">
              Track daily habits through one clear consistency graph and manage personal goals without clutter.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Two simple tabs */}
            <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-semibold">
              <button
                type="button"
                data-testid="tab-daily-habits"
                onClick={() => setActiveTab('habits')}
                className={`rounded-lg px-3.5 py-1.5 transition ${
                  activeTab === 'habits'
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                Daily Habits ({activeScheduledHabits.length})
              </button>
              <button
                type="button"
                data-testid="tab-personal-goals"
                onClick={() => setActiveTab('goals')}
                className={`rounded-lg px-3.5 py-1.5 transition ${
                  activeTab === 'goals'
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-900'
                }`}
              >
                Goals ({goals.length})
              </button>
            </div>

            <Link
              to="/fitness/habit-builder"
              data-testid="open-ai-habit-builder-link"
              className="rounded-xl border border-emerald-700/80 bg-emerald-50/70 px-3.5 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-100 transition"
            >
              ✨ Create with AI
            </Link>
          </div>
        </div>
      </section>

      {/* Section 9: Meaningful Once-Only Goal Achievement Celebration Banner */}
      {rewardsEnabled && celebrationBanner && (
        <section
          data-testid="goal-achievement-celebration"
          className="rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-900 to-emerald-800 p-5 text-white shadow-md flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl">
              {celebrationBanner.badge_icon || '🏅'}
            </span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                Milestone Achieved • {celebrationBanner.awarded_date}
              </div>
              <div className="text-base font-extrabold">{celebrationBanner.title}</div>
              <div className="text-xs text-emerald-100">{celebrationBanner.subtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="celebration-next-goal-btn"
              onClick={() => {
                setActiveTab('goals');
                setAddGoalModalOpen(true);
                handleDismissCelebration();
              }}
              className="rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-emerald-950 hover:bg-emerald-50"
            >
              + Create Next Goal
            </button>
            <button
              type="button"
              data-testid="dismiss-celebration-btn"
              onClick={handleDismissCelebration}
              className="rounded-xl border border-white/25 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* 7. GRAPH-FIRST HABIT TRACKING — Single Prominent Line Chart */}
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Habit Completion Consistency
            </h2>
            <p className="text-xs text-stone-500">
              Today: <strong>{completedTodayCount} of {activeScheduledHabits.length}</strong> scheduled habits completed • Unscheduled or rest days are never counted as missed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="Select Habit for Progress Graph"
              data-testid="habit-graph-selector"
              value={selectedHabitGraphId}
              onChange={(e) => setSelectedHabitGraphId(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-800 max-w-[220px]"
            >
              <option value="all">All Scheduled Habits (%)</option>
              {activeScheduledHabits.map((h) => (
                <option key={h.id} value={String(h.id)}>
                  {h.title}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-xl bg-stone-100 p-1 font-semibold">
              {[
                { days: 7, label: '7 days' },
                { days: 30, label: '30 days' },
                { days: 90, label: '90 days' },
              ].map((rng) => (
                <button
                  key={rng.days}
                  type="button"
                  data-testid={`habit-range-${rng.days}d`}
                  onClick={() => setHabitRangeDays(rng.days as 7 | 30 | 90)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    habitRangeDays === rng.days
                      ? 'bg-emerald-800 text-white'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {rng.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <MinimalistSvgLineChart
          testId="habit-completion-svg-chart"
          points={habitGraphSeries}
          unit="%"
          targetValue={80}
          targetLabel="80% Consistency"
          primaryColor="#065f46"
          yMaxOverride={100}
        />
      </section>

      {/* TAB 1: DAILY HABITS */}
      {activeTab === 'habits' && (
        <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Today’s Scheduled Habits
              </h2>
              <p className="text-xs text-stone-500">
                One click to mark complete. Paused or unscheduled habits stay out of your way.
              </p>
            </div>
            <button
              type="button"
              data-testid="open-add-habit-modal-btn"
              onClick={() => setAddHabitModalOpen((prev) => !prev)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 transition"
            >
              + New Habit
            </button>
          </div>

          {/* On-demand Add Habit Modal/Panel */}
          {addHabitModalOpen && (
            <form
              onSubmit={(e) => void handleAddHabit(e)}
              className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3 text-xs"
            >
              <div className="font-bold text-stone-900">Create a Daily Habit</div>
              <div className="grid gap-2.5 sm:grid-cols-12">
                <input
                  type="text"
                  data-testid="new-habit-title-input"
                  value={newHabitTitle}
                  onChange={(e) => setNewHabitTitle(e.target.value)}
                  placeholder="Habit name (e.g. Drink water regularly)..."
                  className="sm:col-span-5 rounded-xl border border-stone-300 bg-white px-3 py-2"
                />
                <input
                  type="text"
                  value={newHabitDesc}
                  onChange={(e) => setNewHabitDesc(e.target.value)}
                  placeholder="Short 1-line note (optional)..."
                  className="sm:col-span-4 rounded-xl border border-stone-300 bg-white px-3 py-2"
                />
                <select
                  value={newHabitFreq}
                  onChange={(e) => setNewHabitFreq(e.target.value)}
                  className="sm:col-span-3 rounded-xl border border-stone-300 bg-white px-2.5 py-2 font-semibold"
                >
                  <option value="daily">Daily</option>
                  <option value="training_days">Training Days</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddHabitModalOpen(false)}
                  className="rounded-xl px-3 py-1.5 text-stone-500 hover:bg-stone-200/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="add-habit-btn"
                  className="rounded-xl bg-emerald-800 px-4 py-1.5 font-bold text-white hover:bg-emerald-700"
                >
                  Save Habit
                </button>
              </div>
            </form>
          )}

          {/* Simplified Habit Cards — No 7-dot clutter, Clear Name, Schedule, 1-Click Complete & Edit */}
          <div className="space-y-2.5">
            {activeScheduledHabits.map((h) => {
              const isEditing = editingHabitId === h.id;
              return (
                <div
                  key={h.id}
                  data-testid={`habit-item-${h.id}`}
                  className={`rounded-2xl border p-4 transition ${
                    h.completed_on_date
                      ? 'border-emerald-200/90 bg-emerald-50/40'
                      : 'border-stone-200/80 bg-[#FAF8F5]'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2.5 text-xs">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          type="text"
                          value={editHabitTitle}
                          onChange={(e) => setEditHabitTitle(e.target.value)}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 font-bold"
                        />
                        <input
                          type="text"
                          value={editHabitDesc}
                          onChange={(e) => setEditHabitDesc(e.target.value)}
                          placeholder="One-line explanation (optional)"
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1.5"
                        />
                        <select
                          value={editHabitFreq}
                          onChange={(e) => setEditHabitFreq(e.target.value)}
                          className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 font-semibold"
                        >
                          <option value="daily">Daily</option>
                          <option value="training_days">Training Days</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingHabitId(null)}
                          className="rounded-lg px-3 py-1 text-stone-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveEditHabit(h.id)}
                          className="rounded-lg bg-emerald-800 px-3.5 py-1 font-bold text-white"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-stone-900">
                            {h.title}
                          </span>
                          <span className="rounded-full bg-stone-200/75 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-stone-700">
                            {(h.frequency || 'daily').replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] font-medium text-stone-500 tabular-nums">
                            {h.completed_days_last_7}/7d this week
                          </span>
                        </div>
                        {h.description && (
                          <p className="text-xs text-stone-500 line-clamp-1">
                            {h.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 relative">
                        <button
                          type="button"
                          data-testid={`toggle-habit-${h.id}`}
                          onClick={() => void handleToggleHabit(h.id)}
                          className={`rounded-xl px-4 py-2 text-xs font-bold transition active:scale-[0.99] ${
                            h.completed_on_date
                              ? 'bg-emerald-800 text-white shadow-2xs'
                              : 'border border-stone-300 bg-white text-stone-800 hover:border-emerald-700 hover:text-emerald-900'
                          }`}
                        >
                          {h.completed_on_date ? '✓ Completed' : 'Mark complete'}
                        </button>

                        <button
                          type="button"
                          data-testid={`habit-menu-btn-${h.id}`}
                          onClick={() =>
                            setOpenMenuHabitId((prev) => (prev === h.id ? null : h.id))
                          }
                          aria-label={`Edit options for ${h.title}`}
                          className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                        >
                          Edit
                        </button>

                        {openMenuHabitId === h.id && (
                          <div className="absolute right-0 top-11 z-20 w-44 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-lg text-xs">
                            <button
                              type="button"
                              onClick={() => handleStartEditHabit(h)}
                              className="w-full rounded-xl px-3 py-1.5 text-left font-semibold text-stone-700 hover:bg-stone-50"
                            >
                              Edit Habit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePauseResumeHabit(h)}
                              className="w-full rounded-xl px-3 py-1.5 text-left font-semibold text-stone-700 hover:bg-stone-50"
                            >
                              Pause Habit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteHabit(h.id)}
                              className="w-full rounded-xl px-3 py-1.5 text-left font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              Delete Habit
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pausedHabits.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPausedHabits((prev) => !prev)}
                className="text-xs font-semibold text-stone-500 hover:text-stone-800"
              >
                {showPausedHabits
                  ? `▾ Hide paused habits (${pausedHabits.length})`
                  : `▸ Show paused habits (${pausedHabits.length})`}
              </button>
              {showPausedHabits && (
                <div className="mt-2 space-y-2">
                  {pausedHabits.map((ph) => (
                    <div
                      key={ph.id}
                      className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs text-stone-500"
                    >
                      <span>{ph.title} (Paused)</span>
                      <button
                        type="button"
                        onClick={() => void handlePauseResumeHabit(ph)}
                        className="font-semibold text-emerald-800 hover:underline"
                      >
                        Resume
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: PERSONAL GOALS */}
      {activeTab === 'goals' && (
        <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Personal Goals ({goals.length})
              </h2>
              <p className="text-xs text-stone-500">
                Live progress synced with your daily nutrition and water logs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="open-measurements-modal-btn"
                onClick={() => setMeasurementsDrawerOpen((prev) => !prev)}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
              >
                Body Measurements
              </button>
              <button
                type="button"
                data-testid="open-add-goal-modal-btn"
                onClick={() => setAddGoalModalOpen((prev) => !prev)}
                className="rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                + New Goal
              </button>
            </div>
          </div>

          {addGoalModalOpen && (
            <form
              onSubmit={(e) => void handleAddGoal(e)}
              className="grid gap-2.5 sm:grid-cols-12 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs"
            >
              <input
                type="text"
                data-testid="new-goal-name-input"
                value={newGoalName}
                onChange={(e) => setNewGoalName(e.target.value)}
                placeholder="New goal (e.g. 30g daily fibre)..."
                className="sm:col-span-5 rounded-xl border border-stone-300 bg-white px-3 py-2"
              />
              <select
                value={newGoalType}
                onChange={(e) => setNewGoalType(e.target.value)}
                className="sm:col-span-3 rounded-xl border border-stone-300 bg-white px-2 py-2 font-semibold"
              >
                <option value="protein_intake">Protein</option>
                <option value="fiber_intake">Fibre</option>
                <option value="water_habit">Water</option>
                <option value="custom">Custom</option>
              </select>
              <input
                type="number"
                value={newGoalTarget}
                onChange={(e) => setNewGoalTarget(e.target.value)}
                className="sm:col-span-2 rounded-xl border border-stone-300 bg-white px-2 py-2 font-bold"
              />
              <button
                type="submit"
                data-testid="add-goal-btn"
                className="sm:col-span-2 rounded-xl bg-emerald-800 px-3 py-2 font-bold text-white"
              >
                Save Goal
              </button>
            </form>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {goals.map((g) => (
              <div
                key={g.id}
                data-testid={`goal-card-${g.id}`}
                className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-4 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">{g.goal_name}</span>
                  <span className="font-bold text-emerald-800 tabular-nums">
                    {g.current_value} / {g.target_value} {g.unit} ({g.progress_pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-emerald-700 transition-all"
                    style={{ width: `${Math.min(100, g.progress_pct || 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {measurementsDrawerOpen && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3 text-xs">
              <div className="font-bold text-stone-900">
                Optional Body Measurements &amp; Milestones
              </div>
              <form
                onSubmit={(e) => void handleAddMeasurement(e)}
                className="grid gap-2.5 sm:grid-cols-4"
              >
                <input
                  type="number"
                  step="0.1"
                  value={measWeight}
                  onChange={(e) => setMeasWeight(e.target.value)}
                  placeholder="Weight (kg)"
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2"
                />
                <input
                  type="number"
                  step="0.1"
                  value={measWaist}
                  onChange={(e) => setMeasWaist(e.target.value)}
                  placeholder="Waist (cm)"
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2"
                />
                <input
                  type="text"
                  value={measMilestone}
                  onChange={(e) => setMeasMilestone(e.target.value)}
                  placeholder="Milestone note..."
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-stone-900 px-4 py-2 font-bold text-white"
                >
                  + Record
                </button>
              </form>
              {measurements.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {measurements.slice(0, 4).map((m) => (
                    <span
                      key={m.id}
                      className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[11px]"
                    >
                      <strong>{m.logged_date}:</strong>{' '}
                      {m.weight_kg ? `${m.weight_kg} kg ` : ''}
                      {m.milestone_note ? `• ${m.milestone_note}` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* PART B: DATABASE-PERSISTENT ACHIEVEMENT HISTORY & UPCOMING MILESTONES */}
      <section
        data-testid="achievement-history-section"
        className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Achievement Badges ({awardedBadges.length})
            </h2>
            <p className="text-xs text-stone-500">
              Permanently saved to your household member profile across devices and sessions.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              data-testid="toggle-rewards-checkbox"
              checked={rewardsEnabled}
              onChange={(e) => handleToggleRewards(e.target.checked)}
              className="rounded border-stone-300 text-emerald-800"
            />
            Show goal achievement celebrations
          </label>
        </div>

        {awardedBadges.length === 0 ? (
          <div className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-4 text-xs text-stone-500">
            Complete a personal goal, log your first meal, or finish today’s scheduled habits to earn your first persistent milestone badge.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {awardedBadges.map((b) => (
              <div
                key={`${b.id}-${b.awarded_date}`}
                data-testid={`earned-badge-${b.code || b.id}`}
                className="flex items-start gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 text-xs"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-base shadow-2xs border border-emerald-100">
                  {b.badge_icon || '🏅'}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-bold text-stone-900 truncate">🏅 {b.title}</span>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-900">
                      {b.category || 'Milestone'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 line-clamp-2">{b.subtitle}</p>
                  <div className="text-[10px] font-medium text-stone-400">
                    Earned {b.awarded_date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {upcomingMilestones.length > 0 && (
          <div className="space-y-2.5 border-t border-stone-100 pt-4">
            <div className="text-xs font-bold text-stone-700">
              Upcoming Milestones in Progress
            </div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {upcomingMilestones.slice(0, 3).map((um: any) => (
                <div
                  key={um.code}
                  data-testid={`upcoming-milestone-${um.code}`}
                  className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-800 truncate">
                      {um.badge_icon || '🎯'} {um.title}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-800 tabular-nums">
                      {um.current_value}/{um.target_value}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-emerald-700 transition-all"
                      style={{ width: `${Math.min(100, um.progress_pct || 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

// ==========================================
// 5. VISUAL PROGRESS ANALYTICS DASHBOARD (MODULE E)
// ==========================================
export const ProgressAnalyticsPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [overview, setOverview] = useState<Record<string, any> | null>(null);
  const [rangeMode, setRangeMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedMetric, setSelectedMetric] = useState<
    'energy_kcal' | 'protein_g' | 'fiber_g' | 'water_ml'
  >('protein_g');

  useEffect(() => {
    void api
      .getAnalyticsOverview(activeMember?.id, 30)
      .then(setOverview)
      .catch(() => null);
  }, [activeMember?.id]);

  const series: Record<string, any>[] =
    rangeMode === 'weekly'
      ? overview?.weekly_series || []
      : overview?.monthly_series || [];

  const metricMeta: Record<
    string,
    { label: string; unit: string; targetKey: string; color: string }
  > = {
    energy_kcal: {
      label: 'Daily Energy Intake',
      unit: 'kcal',
      targetKey: 'calories_kcal',
      color: '#047857',
    },
    protein_g: {
      label: 'Daily Protein Intake',
      unit: 'g',
      targetKey: 'protein_g',
      color: '#065f46',
    },
    fiber_g: {
      label: 'Daily Dietary Fibre',
      unit: 'g',
      targetKey: 'fiber_g',
      color: '#0d9488',
    },
    water_ml: {
      label: 'Daily Water Consumption',
      unit: 'ml',
      targetKey: 'water_ml',
      color: '#0284c7',
    },
  };

  const currentMeta = metricMeta[selectedMetric];
  const targetVal = overview?.targets?.[currentMeta.targetKey] || 100;
  const metrics = overview?.summary_metrics || {};

  const chartPoints: LineChartPoint[] = series.map((d) => ({
    date: d.date,
    label: (d.date || '').slice(5),
    value:
      d[selectedMetric] !== null && d[selectedMetric] !== undefined
        ? Number(d[selectedMetric])
        : null,
    statusNote: d.food_data_status,
  }));

  return (
    <div data-testid="progress-analytics-page" className="space-y-6">
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-0.5 text-[11px] font-semibold text-emerald-900">
            📊 Progress Analytics
          </span>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
            Nutrition &amp; Hydration Trends
          </h1>
          <p className="text-xs text-stone-500">
            {overview?.chart_integrity_notice ||
              'Solid points represent recorded intake. Unlogged days are never plotted as zero.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-xl bg-stone-100 p-1 font-semibold">
            {[
              { id: 'daily', label: 'Today (Meals)' },
              { id: 'weekly', label: '7 Days' },
              { id: 'monthly', label: '30 Days' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`analytics-range-${tab.id}`}
                onClick={() =>
                  setRangeMode(tab.id as 'daily' | 'weekly' | 'monthly')
                }
                className={`rounded-lg px-3 py-1.5 transition ${
                  rangeMode === tab.id
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-stone-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Select Analytics Metric"
            data-testid="analytics-metric-select"
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as any)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 font-semibold text-stone-800"
          >
            <option value="protein_g">Metric: Protein (g)</option>
            <option value="energy_kcal">Metric: Energy (kcal)</option>
            <option value="fiber_g">Metric: Dietary Fibre (g)</option>
            <option value="water_ml">Metric: Hydration (ml)</option>
          </select>
        </div>
      </section>

      <section className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200/80 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">7-Day Avg Protein</div>
          <div className="mt-1 text-lg font-extrabold text-stone-900 tabular-nums">
            {metrics.weekly_avg_protein_g !== null &&
            metrics.weekly_avg_protein_g !== undefined
              ? `${metrics.weekly_avg_protein_g} g/day`
              : 'No logs yet'}
          </div>
          <div className="text-[11px] text-stone-400">
            Logged on {metrics.logged_days_last_7 ?? 0} of last 7 days
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200/80 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">7-Day Avg Energy</div>
          <div className="mt-1 text-lg font-extrabold text-stone-900 tabular-nums">
            {metrics.weekly_avg_calories_kcal !== null &&
            metrics.weekly_avg_calories_kcal !== undefined
              ? `${metrics.weekly_avg_calories_kcal} kcal/day`
              : 'No logs yet'}
          </div>
          <div className="text-[11px] text-stone-400">
            Target: {overview?.targets?.calories_kcal ?? 2000} kcal
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200/80 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">Training Day Avg</div>
          <div className="mt-1 text-lg font-extrabold text-stone-900 tabular-nums">
            {metrics.training_day_avg_protein_g ?? '—'}g P •{' '}
            {metrics.training_day_avg_calories_kcal ?? '—'} kcal
          </div>
          <div className="text-[11px] text-stone-400">Logged training days</div>
        </div>

        <div className="rounded-2xl border border-stone-200/80 bg-white p-4">
          <div className="text-xs font-medium text-stone-500">Rest Day Avg</div>
          <div className="mt-1 text-lg font-extrabold text-stone-900 tabular-nums">
            {metrics.rest_day_avg_protein_g ?? '—'}g P •{' '}
            {metrics.rest_day_avg_calories_kcal ?? '—'} kcal
          </div>
          <div className="text-[11px] text-stone-400">Logged rest days</div>
        </div>
      </section>

      {rangeMode === 'daily' ? (
        <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
          <h2 className="text-base font-bold text-stone-900">
            Today’s Meal-by-Meal Nutrition Pattern
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(overview?.today_meal_pattern || []).map((m: any) => (
              <div
                key={m.meal_category}
                className="rounded-2xl border border-stone-200/75 bg-[#FAF8F5] p-4 text-xs space-y-1"
              >
                <div className="font-bold text-stone-900">{m.meal_label}</div>
                <div className="text-stone-600 tabular-nums">
                  {m.entry_count > 0 ? (
                    <>
                      <strong>{m.energy_kcal ?? 'NULL'} kcal</strong> •{' '}
                      <strong>{m.protein_g ?? 'NULL'}g P</strong> •{' '}
                      {m.carbs_g ?? 'NULL'}g C
                    </>
                  ) : (
                    <span className="text-stone-400">No entry recorded</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-stone-200/85 bg-white p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                {currentMeta.label} ({currentMeta.unit}) —{' '}
                {rangeMode === 'weekly' ? 'Last 7 Days' : 'Last 30 Days'}
              </h2>
              <p className="text-xs text-stone-500">
                Actual saved values only
              </p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 tabular-nums">
              Target: {targetVal} {currentMeta.unit}
            </span>
          </div>

          <MinimalistSvgLineChart
            testId="analytics-svg-line-chart"
            points={chartPoints}
            unit={currentMeta.unit}
            targetValue={targetVal}
            primaryColor={currentMeta.color}
          />
        </section>
      )}
    </div>
  );
};

// ==========================================
// 6. INTELLIGENT ASSISTANT-STYLE AI HABIT BUILDER (SECTION 8)
// ==========================================
export const AIHabitBuilderPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [goalPrompt, setGoalPrompt] = useState(
    'I want to get fitter, eat breakfast regularly, drink more water and maintain a consistent gym routine.'
  );
  const [loading, setLoading] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [proposedPlan, setProposedPlan] = useState<Record<string, any> | null>(null);
  const [habitsList, setHabitsList] = useState<Record<string, any>[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [modPrompt, setModPrompt] = useState('');

  const quickPrompts = [
    'Eat breakfast regularly, drink 2.5L water and maintain a 3-day gym routine',
    'Lower blood pressure with DASH principles and daily brisk walking',
    'Increase vegetarian protein to 75g with dal, curd, paneer and sprouts',
    'Fasting glucose stability with post-meal walks and high-fibre meals',
  ];

  const revisionSuggestions = [
    'Make the plan easier',
    'Reduce the number of habits',
    'Add a water habit',
    'Change the training days',
    'Make a weekend version',
  ];

  const handleProposePlan = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? goalPrompt).trim();
    if (!prompt) {
      setError('Please describe what you would like to improve first.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.proposeAiHabitPlan({
        member_id: activeMember?.id,
        user_goal_prompt: prompt,
        prompt,
        target_count: 4,
      });
      const candidateHabits = res.proposed_habits || res.habits || [];
      if (!Array.isArray(candidateHabits) || candidateHabits.length === 0) {
        throw new Error(
          'No habits were generated from that request. Please try describing your goal in a little more detail.'
        );
      }
      setProposedPlan(res);
      setHabitsList(candidateHabits.slice(0, 5));
      setEditingIdx(null);
    } catch (err: any) {
      setError(err.message || 'Unable to generate habit plan right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevisionRequest = async (instructionText?: string) => {
    const text = (instructionText ?? modPrompt).trim();
    if (!text) return;
    setModifying(true);
    setError(null);
    try {
      const lower = text.toLowerCase();
      if (lower.includes('reduce') || lower.includes('fewer')) {
        setHabitsList((prev) => prev.slice(0, Math.max(2, prev.length - 1)));
      } else if (lower.includes('easier') || lower.includes('simplify')) {
        setHabitsList((prev) =>
          prev.map((h) =>
            h.category === 'training'
              ? { ...h, frequency: 'training_days', description: 'Gentle 25-minute movement session on training days.' }
              : h
          )
        );
      } else if (lower.includes('water')) {
        const hasWater = habitsList.some((h) =>
          (h.title || '').toLowerCase().includes('water')
        );
        if (!hasWater) {
          setHabitsList((prev) => [
            ...prev,
            {
              title: 'Drink 1 glass (250 ml) of water with every main meal',
              frequency: 'daily',
              category: 'hydration',
              description: 'Steady hydration across breakfast, lunch, and dinner.',
              tracking_method: 'water_tracker',
            },
          ]);
        }
      } else if (lower.includes('training') || lower.includes('weekend')) {
        setHabitsList((prev) =>
          prev.map((h) =>
            h.category === 'training' || lower.includes('weekend')
              ? {
                  ...h,
                  frequency: lower.includes('weekend') ? 'weekly' : 'training_days',
                  description: `${h.description || ''} (${text})`.trim(),
                }
              : h
          )
        );
      } else {
        // Call backend modification endpoint for general instructions
        await api
          .modifyAiHabitPlan({
            ai_plan_id: proposedPlan?.ai_plan_id || proposedPlan?.plan_id,
            member_id: activeMember?.id,
            instruction: text,
            user_confirmed: false,
          })
          .catch(() => null);
        setHabitsList((prev) => [
          ...prev.slice(0, 4),
          {
            title: text.slice(0, 120),
            frequency: 'daily',
            category: 'nutrition',
            description: 'Customised from your revision request.',
            tracking_method: 'manual_check',
          },
        ]);
      }
      setModPrompt('');
    } finally {
      setModifying(false);
    }
  };

  const handleUpdateHabitField = (idx: number, field: string, val: any) => {
    setHabitsList((prev) =>
      prev.map((h, i) => (i === idx ? { ...h, [field]: val } : h))
    );
  };

  const handleRemoveHabit = (idx: number) => {
    setHabitsList((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmPlan = async () => {
    const planId = proposedPlan?.ai_plan_id || proposedPlan?.plan_id || 'ai_plan_custom';
    if (habitsList.length === 0) {
      setError('Please keep at least one habit before confirming your plan.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const res = await api.confirmAiHabitPlan({
        ai_plan_id: planId,
        plan_id: planId,
        member_id: activeMember?.id,
        user_confirmed: true,
        habits: habitsList,
      });
      setSuccessMsg(
        `Saved ${res.saved_count || habitsList.length} habit(s) to your daily schedule.`
      );
    } catch (err: any) {
      setError(err.message || 'Unable to save habit plan.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div data-testid="ai-habit-builder-page" className="max-w-3xl mx-auto space-y-6">
      {/* Initial Assistant-Style Screen: Only "What would you like to improve?", 1 multiline input, and "Create My Plan" */}
      <section className="rounded-3xl border border-stone-200/85 bg-white p-6 sm:p-8 shadow-2xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-0.5 text-[11px] font-semibold text-emerald-900">
              ✨ Personal Habit Assistant
            </span>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900">
              What would you like to improve?
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Describe your routine or goal in plain English for{' '}
              <strong>{activeMember?.display_name || 'your profile'}</strong>. We’ll suggest 3 to 5 realistic habits you can edit before saving.
            </p>
          </div>
          <Link
            to="/fitness/goals"
            className="rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            ← Back to Goals &amp; Habits
          </Link>
        </div>

        <div className="space-y-3">
          <textarea
            rows={3}
            data-testid="ai-habit-prompt-input"
            value={goalPrompt}
            onChange={(e) => setGoalPrompt(e.target.value)}
            placeholder="I want to get fitter, eat breakfast regularly, drink more water and maintain a consistent gym routine."
            className="w-full rounded-2xl border border-stone-300 bg-[#FAF8F5] px-4 py-3 text-xs sm:text-sm text-stone-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setGoalPrompt(p);
                    void handleProposePlan(p);
                  }}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100 transition"
                >
                  {p.slice(0, 44)}…
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={loading}
              data-testid="generate-habit-plan-btn"
              onClick={() => void handleProposePlan()}
              className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {loading ? 'Creating Plan...' : 'Create My Plan'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div
          data-testid="ai-habit-error-banner"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-900 flex items-center justify-between gap-3"
        >
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => void handleProposePlan()}
            className="rounded-xl bg-rose-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {successMsg && (
        <div
          data-testid="ai-habit-success-banner"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-950 flex items-center justify-between gap-4"
        >
          <span>✓ {successMsg}</span>
          <Link
            to="/fitness/goals"
            className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            Open My Goals &amp; Habits →
          </Link>
        </div>
      )}

      {/* Generated Results — Compact Card List (Only rendered AFTER a plan has been generated) */}
      {proposedPlan && habitsList.length > 0 && (
        <section
          data-testid="ai-habit-plan-preview"
          className="rounded-3xl border border-stone-200/85 bg-white p-6 sm:p-8 shadow-2xs space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Suggested Habits ({habitsList.length})
              </h2>
              <p className="text-xs text-stone-500">
                {proposedPlan.plan_summary ||
                  'Review, edit, or remove any habit below before saving to your schedule.'}
              </p>
            </div>
          </div>

          {/* 3–5 Compact Proposed Habit Cards */}
          <div className="space-y-3">
            {habitsList.map((h, idx) => {
              const isEditingCard = editingIdx === idx;
              return (
                <div
                  key={idx}
                  data-testid={`proposed-habit-card-${idx}`}
                  className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-4 space-y-2.5 text-xs"
                >
                  {isEditingCard ? (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={h.title || ''}
                        onChange={(e) =>
                          handleUpdateHabitField(idx, 'title', e.target.value)
                        }
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 font-bold text-stone-900"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={h.frequency || 'daily'}
                          onChange={(e) =>
                            handleUpdateHabitField(idx, 'frequency', e.target.value)
                          }
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 font-semibold"
                        >
                          <option value="daily">Daily</option>
                          <option value="training_days">Training Days</option>
                          <option value="weekdays">Weekdays</option>
                          <option value="weekly">Weekly</option>
                        </select>
                        <input
                          type="text"
                          value={h.description || ''}
                          onChange={(e) =>
                            handleUpdateHabitField(idx, 'description', e.target.value)
                          }
                          placeholder="Short description..."
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1.5"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingIdx(null)}
                          className="rounded-lg bg-emerald-800 px-3 py-1 font-bold text-white"
                        >
                          Done Editing
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-stone-900">
                            {h.title}
                          </span>
                          <span className="rounded-full bg-stone-200/80 px-2.5 py-0.5 text-[10px] font-semibold capitalize text-stone-700">
                            {(h.frequency || 'daily').replace(/_/g, ' ')}
                          </span>
                        </div>
                        {h.description && (
                          <p className="text-xs text-stone-500">{h.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingIdx(idx)}
                          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveHabit(idx)}
                          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Revision Request Bar */}
          <div className="rounded-2xl border border-stone-200/80 bg-stone-50 p-4 space-y-2.5">
            <div className="text-xs font-semibold text-stone-700">
              Want to adjust this plan?
            </div>
            <div className="flex flex-wrap gap-1.5">
              {revisionSuggestions.map((rev) => (
                <button
                  key={rev}
                  type="button"
                  onClick={() => void handleRevisionRequest(rev)}
                  className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
                >
                  {rev}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleRevisionRequest();
              }}
              className="flex gap-2 pt-1"
            >
              <input
                type="text"
                data-testid="ai-habit-mod-input"
                value={modPrompt}
                onChange={(e) => setModPrompt(e.target.value)}
                placeholder="Or type a revision (e.g. 'Make the plan easier' or 'Add a water habit')..."
                className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={modifying || !modPrompt.trim()}
                data-testid="ai-habit-mod-btn"
                className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {modifying ? 'Updating...' : 'Revise'}
              </button>
            </form>
          </div>

          {/* Mandatory User Confirmation Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <p className="text-xs text-stone-500">
              Nothing is saved until you approve. Existing water or breakfast habits will be updated rather than duplicated.
            </p>
            <button
              type="button"
              disabled={confirming || habitsList.length === 0}
              data-testid="confirm-habit-plan-btn"
              onClick={() => void handleConfirmPlan()}
              className="w-full sm:w-auto rounded-xl bg-emerald-800 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {confirming
                ? 'Saving Plan...'
                : `Approve & Save ${habitsList.length} Habit(s)`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
