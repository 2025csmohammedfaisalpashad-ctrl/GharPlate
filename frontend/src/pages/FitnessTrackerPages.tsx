import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { FoodSummary } from '../types/api';

const todayStr = () => new Date().toISOString().slice(0, 10);

// ==========================================
// 1. FITNESS DASHBOARD & WEEKLY TRAINING SCHEDULE (MODULE A)
// ==========================================
export const FitnessDashboardPage: React.FC = () => {
  const { activeMember, refreshHousehold } = useHousehold();
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [primaryGoal, setPrimaryGoal] = useState('maintain_balanced_diet');
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

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getFitnessProfile(activeMember?.id);
      setProfile(res);
      setPrimaryGoal(res.primary_goal || 'maintain_balanced_diet');
      setHeightCm(res.height_cm ? String(res.height_cm) : '');
      setWeightKg(res.current_weight_kg ? String(res.current_weight_kg) : '');
      setTargetWeightKg(res.target_weight_kg ? String(res.target_weight_kg) : '');
      setTrainingFreq(res.training_frequency_days_per_week ?? 3);
      setTrainingType(res.training_type || 'mixed_fitness');
      setWorkoutDuration(res.typical_workout_duration_min ?? 45);
      setPreferredTime(res.preferred_training_time || 'morning');
      setActivityLevel(res.daily_activity_level || 'moderately_active');
      setBudgetInr(res.daily_food_budget_inr ? String(res.daily_food_budget_inr) : '');
      setTargetCalories(
        res.computed_targets?.calories_kcal
          ? String(res.computed_targets.calories_kcal)
          : ''
      );
      setTargetProtein(
        res.computed_targets?.protein_g ? String(res.computed_targets.protein_g) : ''
      );
      setSchedule(res.training_schedule || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeMember?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

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
      setFeedback('Saved fitness profile, daily targets, and weekly training schedule.');
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
              workout_type: !d.is_training_day ? 'Strength & Conditioning' : 'Rest & Recovery',
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

  if (loading && !profile) {
    return <div className="h-80 animate-pulse rounded-3xl bg-stone-200/70" />;
  }

  const targets = profile?.computed_targets || {};

  return (
    <div data-testid="fitness-dashboard-page" className="space-y-8">
      {/* Hero Banner */}
      <section className="rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-800/80 px-3 py-1 text-xs font-extrabold text-amber-300">
              💪 Fitness &amp; Condition Co-Optimisation
            </span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              Fitness Profile &amp; Weekly Training Hub
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 max-w-2xl">
              Personalising for <strong>{profile?.member_name || activeMember?.display_name}</strong> — combine personal fitness objectives (muscle gain, strength, endurance, hydration) with any existing medical conditions safely.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/fitness/tracker"
              className="rounded-2xl bg-amber-400 px-5 py-3 text-xs font-extrabold text-stone-950 shadow hover:bg-amber-300 transition"
            >
              📒 Open My Daily Tracker →
            </Link>
            <Link
              to="/fitness/analytics"
              className="rounded-2xl border border-emerald-500/60 bg-emerald-800/60 px-4 py-3 text-xs font-bold text-white hover:bg-emerald-800 transition"
            >
              📈 Progress Analytics
            </Link>
          </div>
        </div>

        {/* Target Summary Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Primary Goal', val: (primaryGoal || '').replace(/_/g, ' ') },
            { label: 'Daily Energy Target', val: `${targets.calories_kcal ?? 2000} kcal` },
            { label: 'Daily Protein Target', val: `${targets.protein_g ?? 65} g` },
            { label: 'Daily Fibre Target', val: `${targets.fiber_g ?? 30} g` },
            {
              label: 'Training Days / Wk',
              val: `${schedule.filter((s) => s.is_training_day).length} days`,
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl bg-white/10 border border-white/15 p-3.5 backdrop-blur-xs"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                {c.label}
              </div>
              <div className="mt-1 text-sm sm:text-base font-black capitalize text-white">
                {c.val}
              </div>
            </div>
          ))}
        </div>

        {targets.condition_fitness_cautions &&
          targets.condition_fitness_cautions.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-400/15 p-4 text-xs text-amber-100 space-y-1">
              <div className="font-extrabold text-amber-300">
                🩺 Condition + Fitness Co-Existence Guidance
              </div>
              {targets.condition_fitness_cautions.map((note: string, i: number) => (
                <p key={i}>• {note}</p>
              ))}
            </div>
          )}
      </section>

      <form onSubmit={(e) => void handleSave(e)} className="grid gap-8 lg:grid-cols-12">
        {/* Left: Primary Goal & Fitness Profile */}
        <div className="lg:col-span-6 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-lg font-black text-stone-900">
              1. What is your primary health or fitness goal?
            </h2>
            <p className="text-xs text-stone-500">
              Works alongside your selected health conditions ({(profile?.selected_conditions || []).length} active).
            </p>
          </div>

          {feedback && (
            <div
              data-testid="fitness-profile-saved-banner"
              className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-950"
            >
              ✓ {feedback}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(profile?.available_primary_goals || []).map((g: any) => {
              const active = primaryGoal === g.code;
              return (
                <button
                  key={g.code}
                  type="button"
                  data-testid={`goal-option-${g.code}`}
                  onClick={() => setPrimaryGoal(g.code)}
                  className={`rounded-2xl border p-3 text-left text-xs font-bold transition ${
                    active
                      ? 'border-emerald-800 bg-emerald-800 text-white shadow-xs'
                      : 'border-stone-200 bg-stone-50 text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3 pt-2">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Height (cm, optional)
              </label>
              <input
                type="number"
                step="0.5"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g. 170"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Current Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                data-testid="fitness-weight-input"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 68"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Target Weight (kg, opt)
              </label>
              <input
                type="number"
                step="0.1"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Training Style
              </label>
              <select
                value={trainingType}
                onChange={(e) => setTrainingType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="strength_training">Gym / Strength Training</option>
                <option value="mixed_fitness">Mixed Fitness &amp; Home</option>
                <option value="running_endurance">Running &amp; Endurance</option>
                <option value="yoga_mobility">Yoga &amp; Mobility</option>
                <option value="walking">Daily Brisk Walking</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Daily Activity Level
              </label>
              <select
                value={activityLevel}
                onChange={(e) => setActivityLevel(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="sedentary">Sedentary / Desk Job</option>
                <option value="lightly_active">Lightly Active</option>
                <option value="moderately_active">Moderately Active</option>
                <option value="active">Active</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Daily Food Budget (₹)
              </label>
              <input
                type="number"
                value={budgetInr}
                onChange={(e) => setBudgetInr(e.target.value)}
                placeholder="e.g. 200"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 border-t border-stone-100 pt-4">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Custom Energy Target (kcal/day)
              </label>
              <input
                type="number"
                value={targetCalories}
                onChange={(e) => setTargetCalories(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Custom Protein Target (g/day)
              </label>
              <input
                type="number"
                value={targetProtein}
                onChange={(e) => setTargetProtein(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              />
            </div>
          </div>

          <p className="text-[11px] text-stone-500">{targets.assumptions_disclosure}</p>
        </div>

        {/* Right: 7-Day Weekly Training & Rest Schedule */}
        <div className="lg:col-span-6 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-black text-stone-900">
                2. Weekly Training &amp; Rest Schedule (Mon–Sun)
              </h2>
              <p className="text-xs text-stone-500">
                Mark training days vs. rest days so Daily Tracker and Analytics compare training-day vs. rest-day nutrition.
              </p>
            </div>

            <div className="space-y-2.5">
              {schedule.map((item, idx) => (
                <div
                  key={item.day_of_week}
                  data-testid={`schedule-row-${item.day_of_week}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 text-xs ${
                    item.is_training_day
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-stone-200 bg-stone-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => toggleScheduleDay(idx)}
                      className={`rounded-xl px-2.5 py-1 text-[11px] font-extrabold transition ${
                        item.is_training_day
                          ? 'bg-emerald-800 text-white'
                          : 'bg-stone-200 text-stone-700'
                      }`}
                    >
                      {item.is_training_day ? '🏋️ Training' : '🌿 Rest Day'}
                    </button>
                    <span className="font-black capitalize text-stone-900">
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
                      className="rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold w-40 sm:w-48"
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
                        className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-bold w-16 text-center"
                        title="Workout duration (minutes)"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            data-testid="save-fitness-profile-btn"
            className="w-full rounded-2xl bg-emerald-800 py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {saving
              ? 'Saving Fitness Profile...'
              : '✓ Save Fitness Profile, Targets & Training Schedule'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================
// 2. MY DAILY TRACKER & CALENDAR FOOD DIARY (MODULE B)
// ==========================================
export const DailyTrackerPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tracker, setTracker] = useState<Record<string, any> | null>(null);
  const [allFoods, setAllFoods] = useState<FoodSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Add food form state
  const [selectedMealCat, setSelectedMealCat] = useState('breakfast');
  const [selectedFoodSlug, setSelectedFoodSlug] = useState('idli-steamed-rice-lentil');
  const [quantity, setQuantity] = useState(1);
  const [unitName, setUnitName] = useState('standard_serving');
  const [foodFilter, setFoodFilter] = useState('');

  // Copy previous day state
  const [copySourceDate, setCopySourceDate] = useState(() => {
    const d = new Date(Date.now() - 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [templateName, setTemplateName] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

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

  const handleCopyDay = async () => {
    const res = await api.copyDayMeals({
      member_id: activeMember?.id,
      source_date: copySourceDate,
      target_date: selectedDate,
    });
    setTracker(res.daily_summary);
    setStatusBanner(`Copied ${res.copied_count} meal entry(s) from ${copySourceDate}.`);
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
    setStatusBanner('Saved reusable meal template.');
  };

  const handleApplyTemplate = async (templateId: number) => {
    const res = await api.applyMealTemplate(templateId, {
      member_id: activeMember?.id,
      target_date: selectedDate,
    });
    setTracker(res);
    setStatusBanner('Applied saved meal template to today.');
  };

  const filteredFoods = foodFilter.trim()
    ? allFoods.filter((f) =>
        f.name_en.toLowerCase().includes(foodFilter.trim().toLowerCase())
      )
    : allFoods;

  const totals = tracker?.daily_nutrition?.totals || {};
  const targets = tracker?.targets || {};
  const hydration = tracker?.hydration || {};

  return (
    <div data-testid="daily-tracker-page" className="space-y-8">
      {/* Header & Calendar Date Selector */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-950">
            📒 Persistent Daily Food &amp; Macro Diary
          </span>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-stone-900">
            My Daily Tracker
          </h1>
          <p className="text-xs text-stone-500">
            Active Member: <strong>{tracker?.member?.display_name || activeMember?.display_name}</strong> • Goal:{' '}
            <strong className="capitalize">
              {(tracker?.member?.primary_goal || 'maintain_balanced_diet').replace(/_/g, ' ')}
            </strong>
            {tracker?.today_training && (
              <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-950">
                {tracker.today_training.is_training_day
                  ? `🏋️ Training Day: ${tracker.today_training.workout_type}`
                  : '🌿 Rest Day'}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <label className="font-bold text-stone-600">Diary Date:</label>
          <input
            type="date"
            aria-label="Food Diary Date"
            data-testid="tracker-date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-bold text-stone-900"
          />
          <Link
            to="/fitness/hydration"
            className="rounded-xl bg-sky-600 px-3.5 py-2 font-extrabold text-white hover:bg-sky-500"
          >
            💧 Water ({hydration.total_ml ?? 0} ml)
          </Link>
        </div>
      </section>

      {statusBanner && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-950">
          ✓ {statusBanner}
        </div>
      )}

      {/* Visual Progress Cards Against Goals */}
      <section className="grid gap-3.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          {
            label: 'Energy',
            consumed: totals.energy_kcal,
            target: targets.calories_kcal || 2000,
            unit: 'kcal',
            color: 'bg-emerald-700',
          },
          {
            label: 'Protein',
            consumed: totals.protein_g,
            target: targets.protein_g || 65,
            unit: 'g',
            color: 'bg-amber-500',
          },
          {
            label: 'Carbohydrates',
            consumed: totals.carbs_g,
            target: targets.carbs_g || 250,
            unit: 'g',
            color: 'bg-teal-600',
          },
          {
            label: 'Total Fat',
            consumed: totals.fat_total_g,
            target: targets.fat_g || 55,
            unit: 'g',
            color: 'bg-orange-500',
          },
          {
            label: 'Dietary Fibre',
            consumed: totals.fibre_g,
            target: targets.fiber_g || 30,
            unit: 'g',
            color: 'bg-emerald-600',
          },
          {
            label: 'Hydration',
            consumed: hydration.total_ml ?? 0,
            target: hydration.goal_ml || 2250,
            unit: 'ml',
            color: 'bg-sky-600',
          },
        ].map((item) => {
          const val = item.consumed ?? 0;
          const pct = Math.min(100, Math.round((val / (item.target || 1)) * 100));
          return (
            <div
              key={item.label}
              data-testid={`tracker-stat-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-2xs space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-bold text-stone-500">
                <span>{item.label}</span>
                <span>{pct}%</span>
              </div>
              <div className="text-base font-black text-stone-900">
                {item.consumed !== null && item.consumed !== undefined
                  ? `${item.consumed} ${item.unit}`
                  : 'NULL'}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full transition-all ${item.color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-stone-500">
                Target: {item.target} {item.unit}
              </div>
            </div>
          );
        })}
      </section>

      {tracker?.daily_nutrition?.has_incomplete_entries && (
        <div
          data-testid="tracker-incomplete-nutrient-alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950"
        >
          <strong>ℹ️ Incomplete Nutrient Snapshot Notice:</strong> One or more logged items (
          {(tracker.daily_nutrition.incomplete_entry_names || []).join(', ')}) have unmeasured (
          <code>NULL</code>) nutrients. GharPlate never converts unknown nutrients to zero.
        </div>
      )}

      {/* Quick Food Logger + Copy Previous Day + Meal Templates */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form
          onSubmit={(e) => void handleLogFood(e)}
          className="lg:col-span-7 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-stone-900">
              + Log Food to Today’s Diary
            </h2>
            <input
              type="text"
              value={foodFilter}
              onChange={(e) => setFoodFilter(e.target.value)}
              placeholder="Filter catalog (e.g. Idli, Ragi, Egg)..."
              className="rounded-xl border border-stone-300 px-3 py-1 text-xs"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-bold text-stone-600">Meal Slot</label>
              <select
                aria-label="Meal Category Selector"
                data-testid="tracker-meal-category-select"
                value={selectedMealCat}
                onChange={(e) => setSelectedMealCat(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs font-bold"
              >
                {(tracker?.meal_categories_catalog || [
                  { code: 'early_morning', label: 'Early Morning' },
                  { code: 'breakfast', label: 'Breakfast' },
                  { code: 'mid_morning_snack', label: 'Mid-Morning Snack' },
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

            <div className="sm:col-span-5">
              <label className="block text-[11px] font-bold text-stone-600">
                Select Indian Food / Product
              </label>
              <select
                aria-label="Select Food to Log"
                data-testid="tracker-food-select"
                value={selectedFoodSlug}
                onChange={(e) => setSelectedFoodSlug(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs font-bold"
              >
                {filteredFoods.map((f) => (
                  <option key={f.slug} value={f.slug}>
                    {f.name_en} ({f.standard_serving_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-stone-600">Qty</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                data-testid="tracker-qty-input"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0.25, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-2 text-xs font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-stone-600">Unit</label>
              <select
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-2 py-2 text-xs font-bold"
              >
                <option value="standard_serving">Serving</option>
                <option value="100g">100g</option>
                <option value="katori">Katori</option>
                <option value="roti">Roti</option>
                <option value="piece">Piece</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="submit"
              data-testid="tracker-add-food-btn"
              className="rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700 transition"
            >
              + Add to Daily Log
            </button>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link
                to="/barcode"
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-100"
              >
                🏷️ Log via Barcode
              </Link>
              <Link
                to="/tools/mess-analyzer"
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-100"
              >
                🍱 Log Mess Plate
              </Link>
            </div>
          </div>
        </form>

        {/* Right: Copy Previous Date & Reusable Meal Templates */}
        <div className="lg:col-span-5 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-black text-stone-900">
            Diary Shortcuts &amp; Meal Templates
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-stone-600">Copy meals from:</span>
            <input
              type="date"
              value={copySourceDate}
              onChange={(e) => setCopySourceDate(e.target.value)}
              className="rounded-xl border border-stone-300 px-2.5 py-1.5 font-bold"
            />
            <button
              type="button"
              data-testid="copy-day-meals-btn"
              onClick={() => void handleCopyDay()}
              className="rounded-xl bg-stone-900 px-3.5 py-1.5 font-bold text-white hover:bg-stone-800"
            >
              Copy to {selectedDate}
            </button>
          </div>

          <div className="flex items-center gap-2 border-t border-stone-100 pt-3 text-xs">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={`Save current ${selectedMealCat} as template...`}
              className="flex-1 rounded-xl border border-stone-300 px-3 py-1.5"
            />
            <button
              type="button"
              onClick={() => void handleSaveTemplate()}
              className="rounded-xl border border-emerald-700 px-3 py-1.5 font-bold text-emerald-800 hover:bg-emerald-50"
            >
              Save Template
            </button>
          </div>

          {(tracker?.meal_templates || []).length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold uppercase text-stone-400">
                Saved Meal Templates:
              </div>
              <div className="flex flex-wrap gap-2">
                {(tracker?.meal_templates || []).map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void handleApplyTemplate(t.id)}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-100"
                  >
                    + Apply “{t.name}” ({t.items_count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Meal-by-Meal Logged Food Breakdown */}
      <section className="space-y-4">
        <h2 className="text-lg font-black text-stone-900">
          Logged Meals on {selectedDate}
        </h2>
        {loading && !tracker ? (
          <div className="h-40 animate-pulse rounded-3xl bg-stone-200/70" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {(tracker?.meals || []).map((meal: any) => {
              const mTot = meal.summary?.totals || {};
              return (
                <div
                  key={meal.meal_category}
                  data-testid={`meal-card-${meal.meal_category}`}
                  className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                    <div>
                      <h3 className="text-sm font-black text-stone-900">
                        {meal.meal_label}
                      </h3>
                      <div className="text-[11px] text-stone-500">
                        {meal.entries.length} item(s)
                      </div>
                    </div>
                    <div className="text-right text-xs font-bold text-emerald-900">
                      {mTot.energy_kcal ?? 0} kcal • {mTot.protein_g ?? 0}g P •{' '}
                      {mTot.carbs_g ?? 0}g C
                    </div>
                  </div>

                  {meal.entries.length === 0 ? (
                    <div className="py-3 text-center text-xs text-stone-400">
                      No foods logged for {meal.meal_label.toLowerCase()} yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {meal.entries.map((entry: any) => (
                        <div
                          key={entry.id}
                          data-testid={`food-log-entry-${entry.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone-50 p-3 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-extrabold text-stone-900 truncate">
                              {entry.food_name}
                            </div>
                            <div className="text-[11px] text-stone-500">
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
                              className="rounded-lg border border-stone-300 bg-white px-2 py-0.5 font-bold hover:bg-stone-100"
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
                              className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] font-bold"
                            >
                              {(tracker?.meal_categories_catalog || []).map((mc: any) => (
                                <option key={mc.code} value={mc.code}>
                                  {mc.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              data-testid={`delete-food-log-${entry.id}`}
                              onClick={() => void handleDeleteEntry(entry.id)}
                              className="rounded-lg px-2 py-0.5 font-bold text-rose-700 hover:bg-rose-50"
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
    <div data-testid="water-tracker-page" className="space-y-8">
      <section className="rounded-[2rem] bg-gradient-to-br from-sky-950 via-sky-900 to-emerald-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="grid gap-6 lg:grid-cols-12 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-800/80 px-3 py-1 text-xs font-extrabold text-sky-200">
              💧 Daily Water &amp; Hydration Tracker
            </span>
            <h1
              data-testid="hydration-readout-headline"
              className="text-3xl sm:text-5xl font-black tracking-tight"
            >
              {totalMl.toLocaleString()} ml{' '}
              <span className="text-xl sm:text-2xl font-bold text-sky-200">
                / {goalMl.toLocaleString()} ml
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-sky-100/90">
              {(hydration?.remaining_ml || 0) > 0
                ? `${hydration?.remaining_ml} ml remaining toward your configured daily hydration target.`
                : 'Daily hydration target reached!'}
            </p>

            {/* Quick-Add Water Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {[150, 200, 250, 300, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  data-testid={`quick-water-${amt}`}
                  onClick={() => void handleQuickAddWater(amt)}
                  className="rounded-2xl bg-white px-4 py-2.5 text-xs font-extrabold text-sky-950 shadow hover:bg-sky-50 transition"
                >
                  + {amt} ml
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-3xl bg-white/10 border border-white/15 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Date: {selectedDate}</span>
              <span>{pct}% Complete</span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-sky-950">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <select
                aria-label="Preferred Water Container"
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                className="rounded-xl bg-sky-900 border border-sky-700 px-3 py-2 text-xs font-bold text-white"
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
                className="w-24 rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-900"
              />
              <button
                type="button"
                data-testid="custom-water-add-btn"
                onClick={() => void handleQuickAddWater(Number(customMl) || 250)}
                className="rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-stone-950"
              >
                + Log Custom
              </button>
            </div>
          </div>
        </div>

        {hydration?.fluid_medical_notice && (
          <div
            data-testid="hydration-medical-notice"
            className="mt-5 rounded-2xl border border-amber-300 bg-amber-400/20 p-4 text-xs font-bold text-amber-100"
          >
            ⚠️ {hydration.fluid_medical_notice}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Today's Logged Water Entries */}
        <div className="lg:col-span-7 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-stone-900">
              Hydration Log ({hydration?.entries?.length || 0} entries)
            </h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl border border-stone-300 px-3 py-1 text-xs font-bold"
            />
          </div>

          {(hydration?.entries || []).length === 0 ? (
            <div className="rounded-2xl bg-stone-50 p-6 text-center text-xs text-stone-500">
              No water entries recorded yet for {selectedDate}. Tap any quick-add button above!
            </div>
          ) : (
            <div className="space-y-2">
              {(hydration?.entries || []).map((e: any) => (
                <div
                  key={e.id}
                  data-testid={`water-entry-${e.id}`}
                  className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-stone-50 px-4 py-2.5 text-xs"
                >
                  <div>
                    <span className="font-black text-sky-900">{e.amount_ml} ml</span> •{' '}
                    <span className="capitalize text-stone-700">
                      {e.container_type.replace(/_/g, ' ')}
                    </span>{' '}
                    <span className="text-stone-400">at {e.logged_time}</span>
                  </div>
                  <button
                    type="button"
                    data-testid={`undo-water-${e.id}`}
                    onClick={() => void handleUndoEntry(e.id)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Configurable Hydration Target & Non-Intrusive Reminders */}
        <form
          onSubmit={(e) => void handleSaveSettings(e)}
          className="lg:col-span-5 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-black text-stone-900">
            Hydration Goal &amp; In-App Reminders
          </h2>
          <p className="text-xs text-stone-500">
            {hydration?.individual_hydration_disclaimer}
          </p>
          <div>
            <label className="block text-xs font-bold text-stone-700">
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
          <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => setRemindersEnabled(e.target.checked)}
              className="rounded border-stone-300 text-sky-700"
            />
            Enable gentle in-app hydration reminders (respects quiet hours 22:00–07:00)
          </label>
          <button
            type="submit"
            data-testid="save-hydration-settings-btn"
            className="w-full rounded-2xl bg-sky-800 py-2.5 text-xs font-extrabold text-white hover:bg-sky-700"
          >
            Save Hydration Target
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// 4. GOALS, GENTLE HABIT TRACKER & MEASUREMENTS (MODULE D)
// ==========================================
export const GoalsHabitsPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [goals, setGoals] = useState<Record<string, any>[]>([]);
  const [habits, setHabits] = useState<Record<string, any>[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, any>[]>([]);

  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalType, setNewGoalType] = useState('protein_intake');
  const [newGoalTarget, setNewGoalTarget] = useState('75');
  const [newGoalUnit, setNewGoalUnit] = useState('g / day');

  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitFreq, setNewHabitFreq] = useState('daily');

  const [measWeight, setMeasWeight] = useState('');
  const [measWaist, setMeasWaist] = useState('');
  const [measMilestone, setMeasMilestone] = useState('');

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
    } catch {
      // ignore
    }
  }, [activeMember?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
  };

  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    const updated = await api.createHabit({
      member_id: activeMember?.id,
      title: newHabitTitle.trim(),
      frequency: newHabitFreq,
      category: 'nutrition',
    });
    setHabits(updated);
    setNewHabitTitle('');
  };

  const handleToggleHabit = async (habitId: number) => {
    const updated = await api.toggleHabitCompletion(habitId, todayStr());
    setHabits(updated);
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
  };

  return (
    <div data-testid="goals-habits-page" className="space-y-8">
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-950">
          🎯 Sustainable Habits &amp; Configurable Goals
        </span>
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-stone-900">
          Goals, Habits &amp; Body Progress
        </h1>
        <p className="text-xs text-stone-500">
          Establish realistic nutrition and training goals, build daily kitchen habits without streak pressure, and optionally log measurements.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Configurable Fitness & Nutrition Goals */}
        <div className="lg:col-span-6 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-black text-stone-900">
            Personal Goals ({goals.length})
          </h2>

          <form onSubmit={(e) => void handleAddGoal(e)} className="grid gap-2 sm:grid-cols-12 text-xs">
            <input
              type="text"
              data-testid="new-goal-name-input"
              value={newGoalName}
              onChange={(e) => setNewGoalName(e.target.value)}
              placeholder="New goal (e.g. 30g daily fibre)..."
              className="sm:col-span-5 rounded-xl border border-stone-300 px-3 py-2"
            />
            <select
              value={newGoalType}
              onChange={(e) => setNewGoalType(e.target.value)}
              className="sm:col-span-3 rounded-xl border border-stone-300 bg-white px-2 py-2 font-bold"
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
              className="sm:col-span-2 rounded-xl border border-stone-300 px-2 py-2 font-bold"
            />
            <button
              type="submit"
              data-testid="add-goal-btn"
              className="sm:col-span-2 rounded-xl bg-emerald-800 px-3 py-2 font-extrabold text-white"
            >
              + Goal
            </button>
          </form>

          <div className="space-y-3">
            {goals.map((g) => (
              <div
                key={g.id}
                data-testid={`goal-card-${g.id}`}
                className="rounded-2xl border border-stone-200/80 bg-stone-50 p-4 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-stone-900">{g.goal_name}</span>
                  <span className="font-black text-emerald-800">
                    {g.current_value} / {g.target_value} {g.unit} ({g.progress_pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-emerald-700"
                    style={{ width: `${Math.min(100, g.progress_pct || 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Gentle Habit Checklist */}
        <div className="lg:col-span-6 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-black text-stone-900">
            Gentle Daily Habit Tracker ({habits.length})
          </h2>

          <form onSubmit={(e) => void handleAddHabit(e)} className="flex gap-2 text-xs">
            <input
              type="text"
              data-testid="new-habit-title-input"
              value={newHabitTitle}
              onChange={(e) => setNewHabitTitle(e.target.value)}
              placeholder="Add habit (e.g. Prepare dal or sprouts at home)..."
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2"
            />
            <select
              value={newHabitFreq}
              onChange={(e) => setNewHabitFreq(e.target.value)}
              className="rounded-xl border border-stone-300 bg-white px-2.5 py-2 font-bold"
            >
              <option value="daily">Daily</option>
              <option value="training_days">Training Days</option>
              <option value="weekly">Weekly</option>
            </select>
            <button
              type="submit"
              data-testid="add-habit-btn"
              className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white"
            >
              + Add
            </button>
          </form>

          <div className="space-y-2.5">
            {habits.map((h) => (
              <div
                key={h.id}
                data-testid={`habit-item-${h.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-stone-50 p-3.5 text-xs"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    data-testid={`toggle-habit-${h.id}`}
                    onClick={() => void handleToggleHabit(h.id)}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg border font-black transition ${
                      h.completed_on_date
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-stone-300 bg-white text-transparent'
                    }`}
                  >
                    ✓
                  </button>
                  <div>
                    <div className="font-extrabold text-stone-900">{h.title}</div>
                    <div className="text-[11px] text-stone-500">
                      {h.completed_days_last_7}/7 days this week ({h.weekly_consistency_pct}%)
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {(h.weekly_days || []).map((d: any) => (
                    <span
                      key={d.date}
                      title={d.date}
                      className={`h-2.5 w-2.5 rounded-full ${
                        d.completed ? 'bg-emerald-600' : 'bg-stone-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Optional Body Measurements & Milestones */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-base font-black text-stone-900">
          Optional Body Measurements &amp; Fitness Milestones
        </h2>
        <form onSubmit={(e) => void handleAddMeasurement(e)} className="grid gap-3 sm:grid-cols-4 text-xs">
          <input
            type="number"
            step="0.1"
            value={measWeight}
            onChange={(e) => setMeasWeight(e.target.value)}
            placeholder="Weight (kg, optional)"
            className="rounded-xl border border-stone-300 px-3 py-2"
          />
          <input
            type="number"
            step="0.1"
            value={measWaist}
            onChange={(e) => setMeasWaist(e.target.value)}
            placeholder="Waist (cm, optional)"
            className="rounded-xl border border-stone-300 px-3 py-2"
          />
          <input
            type="text"
            value={measMilestone}
            onChange={(e) => setMeasMilestone(e.target.value)}
            placeholder="Milestone note (e.g. 5 km walk completed)"
            className="rounded-xl border border-stone-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-xl bg-stone-900 px-4 py-2 font-extrabold text-white"
          >
            + Record Optional Entry
          </button>
        </form>

        {measurements.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-3 text-xs pt-2">
            {measurements.slice(0, 6).map((m) => (
              <div
                key={m.id}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-3"
              >
                <div className="font-bold text-stone-500">{m.logged_date}</div>
                <div className="mt-1 font-extrabold text-stone-900">
                  {m.weight_kg ? `${m.weight_kg} kg` : ''}{' '}
                  {m.waist_cm ? `• Waist: ${m.waist_cm} cm` : ''}
                </div>
                {m.milestone_note && (
                  <div className="text-emerald-800 font-semibold mt-0.5">
                    🏅 {m.milestone_note}
                  </div>
                )}
              </div>
            ))}
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
      color: '#d97706',
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
  const maxVal = Math.max(
    targetVal * 1.25,
    ...series.map((d) => Number(d[selectedMetric] || 0)),
    10
  );

  // Build SVG polyline points ONLY for recorded days (never connecting unlogged days as fake zeros)
  const chartWidth = 720;
  const chartHeight = 220;
  const padX = 44;
  const padY = 24;
  const plotW = chartWidth - padX * 2;
  const plotH = chartHeight - padY * 2;

  const plottedPoints: Record<string, any>[] = series.map((d, idx) => {
    const x =
      padX + (series.length > 1 ? (idx / (series.length - 1)) * plotW : plotW / 2);
    const val = d[selectedMetric];
    const hasValue = val !== null && val !== undefined;
    const y = hasValue ? padY + plotH - (Number(val) / maxVal) * plotH : null;
    return { ...d, x, y, val, hasValue };
  });

  const recordedSegments = plottedPoints.filter((p) => p.hasValue && p.y !== null);
  const polylinePoints = recordedSegments.map((p) => `${p.x},${p.y}`).join(' ');
  const targetY = padY + plotH - (targetVal / maxVal) * plotH;

  const metrics = overview?.summary_metrics || {};

  return (
    <div data-testid="progress-analytics-page" className="space-y-8">
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-950">
            📈 Honest Data-Driven Visual Analytics
          </span>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-stone-900">
            Daily, Weekly &amp; Monthly Nutrition Analytics
          </h1>
          <p className="text-xs text-stone-500">
            {overview?.chart_integrity_notice}
          </p>
        </div>

        {/* Time Range & Metric Switchers */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-xl bg-stone-100 p-1 font-extrabold">
            {[
              { id: 'daily', label: 'Today (Meals)' },
              { id: 'weekly', label: 'Weekly (7d)' },
              { id: 'monthly', label: 'Monthly (30d)' },
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
                    ? 'bg-emerald-800 text-white shadow-xs'
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
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 font-bold text-stone-800"
          >
            <option value="protein_g">Metric: Protein (g)</option>
            <option value="energy_kcal">Metric: Energy (kcal)</option>
            <option value="fiber_g">Metric: Dietary Fibre (g)</option>
            <option value="water_ml">Metric: Hydration (ml)</option>
          </select>
        </div>
      </section>

      {/* Summary Comparison Cards (including Training Day vs Rest Day) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-bold text-stone-500">7-Day Avg Protein</div>
          <div className="mt-1 text-xl font-black text-stone-900">
            {metrics.weekly_avg_protein_g !== null &&
            metrics.weekly_avg_protein_g !== undefined
              ? `${metrics.weekly_avg_protein_g} g/day`
              : 'No logs yet'}
          </div>
          <div className="text-[11px] text-stone-400">
            Logged on {metrics.logged_days_last_7 ?? 0} of last 7 days
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-xs font-bold text-stone-500">7-Day Avg Energy</div>
          <div className="mt-1 text-xl font-black text-stone-900">
            {metrics.weekly_avg_calories_kcal !== null &&
            metrics.weekly_avg_calories_kcal !== undefined
              ? `${metrics.weekly_avg_calories_kcal} kcal/day`
              : 'No logs yet'}
          </div>
          <div className="text-[11px] text-stone-400">
            Target: {overview?.targets?.calories_kcal ?? 2000} kcal
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="text-xs font-bold text-emerald-900">
            🏋️ Training Day Avg
          </div>
          <div className="mt-1 text-xl font-black text-emerald-950">
            {metrics.training_day_avg_protein_g ?? '—'}g P •{' '}
            {metrics.training_day_avg_calories_kcal ?? '—'} kcal
          </div>
          <div className="text-[11px] text-emerald-800">
            Actual logged training days
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <div className="text-xs font-bold text-stone-600">🌿 Rest Day Avg</div>
          <div className="mt-1 text-xl font-black text-stone-900">
            {metrics.rest_day_avg_protein_g ?? '—'}g P •{' '}
            {metrics.rest_day_avg_calories_kcal ?? '—'} kcal
          </div>
          <div className="text-[11px] text-stone-500">Actual logged rest days</div>
        </div>
      </section>

      {/* Interactive SVG Line / Meal Chart */}
      {rangeMode === 'daily' ? (
        <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-black text-stone-900">
            Today’s Meal-by-Meal Nutrition Pattern
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {(overview?.today_meal_pattern || []).map((m: any) => (
              <div
                key={m.meal_category}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs space-y-1"
              >
                <div className="font-extrabold text-stone-900">{m.meal_label}</div>
                <div className="text-stone-600">
                  {m.entry_count > 0 ? (
                    <>
                      <strong>{m.energy_kcal ?? 'NULL'} kcal</strong> •{' '}
                      <strong>{m.protein_g ?? 'NULL'}g Protein</strong> •{' '}
                      {m.carbs_g ?? 'NULL'}g Carbs
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
        <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-stone-900">
                {currentMeta.label} ({currentMeta.unit}) —{' '}
                {rangeMode === 'weekly' ? 'Last 7 Days' : 'Last 30 Days'}
              </h2>
              <p className="text-xs text-stone-500">
                Solid points = recorded intake • Hollow grey markers = no entry recorded (never plotted as fake zero)
              </p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">
              Target Line: {targetVal} {currentMeta.unit}
            </span>
          </div>

          <div className="overflow-x-auto">
            <svg
              data-testid="analytics-svg-line-chart"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full min-w-[540px] h-56 rounded-2xl bg-stone-50/70 border border-stone-100"
            >
              {/* Target reference dashed line */}
              <line
                x1={padX}
                y1={targetY}
                x2={chartWidth - padX}
                y2={targetY}
                stroke="#94a3b8"
                strokeDasharray="5,5"
                strokeWidth="1.5"
              />
              <text
                x={chartWidth - padX - 4}
                y={Math.max(14, targetY - 6)}
                textAnchor="end"
                className="fill-stone-500 text-[10px] font-bold"
              >
                Target ({targetVal} {currentMeta.unit})
              </text>

              {/* Connected line across recorded days */}
              {recordedSegments.length > 1 && (
                <polyline
                  fill="none"
                  stroke={currentMeta.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

              {/* Data Points & No-Entry Indicators */}
              {plottedPoints.map((pt) => (
                <g key={pt.date}>
                  {pt.hasValue && pt.y !== null ? (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={5}
                      fill={
                        pt.food_data_status === 'incomplete_nutrient_data'
                          ? '#f59e0b'
                          : currentMeta.color
                      }
                      stroke="#ffffff"
                      strokeWidth="2"
                    >
                      <title>
                        {`${pt.date}: ${pt.val} ${currentMeta.unit} (${pt.food_data_status})`}
                      </title>
                    </circle>
                  ) : (
                    <circle
                      cx={pt.x}
                      cy={padY + plotH}
                      r={3.5}
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                    >
                      <title>{`${pt.date}: No entry recorded`}</title>
                    </circle>
                  )}
                  {(rangeMode === 'weekly' || plottedPoints.indexOf(pt) % 5 === 0) && (
                    <text
                      x={pt.x}
                      y={chartHeight - 5}
                      textAnchor="middle"
                      className="fill-stone-500 text-[9px] font-semibold"
                    >
                      {pt.date.slice(5)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </section>
      )}
    </div>
  );
};
