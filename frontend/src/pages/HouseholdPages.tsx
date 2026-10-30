import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExpandableSection } from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { HealthConditionSummary, HouseholdMember } from '../types/api';

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-900',
  'bg-amber-100 text-amber-900',
  'bg-sky-100 text-sky-900',
  'bg-rose-100 text-rose-900',
  'bg-purple-100 text-purple-900',
];

// ==========================================
// PAGE 6: REDESIGNED VISUAL HOUSEHOLD DASHBOARD
// ==========================================
export const HouseholdDashboardPage: React.FC = () => {
  const {
    household,
    activeMember,
    setActiveMemberId,
    refreshHousehold,
    clearLocalHousehold,
  } = useHousehold();

  const handleRemoveMember = async (memberId: number) => {
    if (!household) return;
    await api.deleteMember(household.household_token, memberId);
    await refreshHousehold();
  };

  return (
    <div className="space-y-8">
      {/* Clean Visual Header */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl">
            🏡
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
              {household?.name || 'My GharPlate Household'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-500">
              Select a family member to personalise food guidance, recipes, and meal suggestions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/household/member"
            className="rounded-2xl bg-emerald-800 px-5 py-3 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 transition"
          >
            + Add Family Member
          </Link>
        </div>
      </section>

      {/* Approachable Member Avatar Cards (Discreet Condition Presentation) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-stone-900">
            Family Profiles ({household?.members.length || 0})
          </h2>
        </div>

        {!household || household.members.length === 0 ? (
          <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center space-y-3">
            <div className="text-4xl">👨‍👩‍👧‍👦</div>
            <h3 className="text-lg font-extrabold text-stone-900">
              Add Your First Household Member
            </h3>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Create profiles for parents, grandparents, or children with their dietary preferences, allergies, and health considerations — no account login required.
            </p>
            <Link
              to="/household/member"
              className="mt-2 inline-block rounded-2xl bg-emerald-800 px-6 py-3 text-xs font-extrabold text-white"
            >
              + Create Member Profile
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {household.members.map((m, idx) => {
              const isDefault = activeMember?.id === m.id;
              const avatarStyle = AVATAR_COLORS[idx % AVATAR_COLORS.length];

              return (
                <div
                  key={m.id}
                  className={`flex flex-col justify-between rounded-3xl border p-6 shadow-sm transition ${
                    isDefault
                      ? 'border-emerald-700 bg-emerald-50/40 ring-2 ring-emerald-700/20'
                      : 'border-stone-200/90 bg-white hover:border-stone-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black ${avatarStyle}`}
                        >
                          {m.display_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-lg font-extrabold text-stone-900">
                            {m.display_name}
                          </h3>
                          <p className="text-xs font-medium text-stone-500 capitalize">
                            {m.age_group.replace('_', ' ')} • {m.dietary_preference.replace('_', ' ')}
                          </p>
                        </div>
                      </div>

                      {isDefault && (
                        <span className="rounded-full bg-emerald-800 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Discreet Summary Pills */}
                    <div className="mt-5 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-xl bg-stone-100 px-3 py-1.5 font-bold text-stone-700">
                        ❤️ {m.selected_conditions.length} Condition{m.selected_conditions.length === 1 ? '' : 's'}
                      </span>
                      {m.allergies.length > 0 && (
                        <span className="rounded-xl bg-rose-50 px-3 py-1.5 font-bold text-rose-900">
                          ⚠️ {m.allergies.length} Allergy
                        </span>
                      )}
                      {m.intolerances.length > 0 && (
                        <span className="rounded-xl bg-amber-50 px-3 py-1.5 font-bold text-amber-900">
                          🌿 {m.intolerances.length} Intolerance
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-stone-200/60 pt-4 text-xs">
                    <div className="flex items-center gap-3">
                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => void setActiveMemberId(m.id)}
                          className="rounded-xl bg-emerald-800 px-3.5 py-1.5 font-bold text-white hover:bg-emerald-700"
                        >
                          Select Profile
                        </button>
                      )}
                      <Link
                        to={`/household/member?edit=${m.id}`}
                        className="font-extrabold text-emerald-800 hover:underline"
                      >
                        Open Profile →
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(m.id)}
                      className="text-stone-400 hover:text-rose-700 font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Progressive Disclosure for Browser Token & Privacy Controls */}
      <ExpandableSection
        title="Household Privacy & Local Browser Token"
        subtitle="No account login required — manage or reset your local household data"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-stone-600">
          <div className="space-y-1 max-w-xl">
            <p>{household?.privacy_notice}</p>
            <p className="font-mono text-stone-500">
              Token ID: <strong>{household?.household_token}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void clearLocalHousehold()}
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-900 hover:bg-rose-100"
          >
            Reset & Purge Local Household
          </button>
        </div>
      </ExpandableSection>
    </div>
  );
};

// ==========================================
// PAGE 7: MEMBER PROFILE CREATION & EDITING PAGE
// ==========================================
export const MemberProfilePage: React.FC = () => {
  const { household, activeMember, refreshHousehold } = useHousehold();
  const [conditions, setConditions] = useState<HealthConditionSummary[]>([]);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [ageGroup, setAgeGroup] = useState('adult');
  const [dietaryPreference, setDietaryPreference] = useState('vegetarian');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [allergiesText, setAllergiesText] = useState('');
  const [intolerancesText, setIntolerancesText] = useState('');
  const [restrictionsText, setRestrictionsText] = useState('');
  const [preferencesText, setPreferencesText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getConditions().then(setConditions).catch(() => null);
  }, []);

  const loadMemberIntoForm = (m: HouseholdMember) => {
    setEditingMemberId(m.id);
    setDisplayName(m.display_name);
    setAgeGroup(m.age_group);
    setDietaryPreference(m.dietary_preference);
    setSelectedConditions(m.selected_conditions);
    setAllergiesText(m.allergies.join(', '));
    setIntolerancesText(m.intolerances.join(', '));
    setRestrictionsText(m.dietary_restrictions.join(', '));
    setPreferencesText(m.food_preferences.join(', '));
    setFeedback(null);
  };

  const resetForm = () => {
    setEditingMemberId(null);
    setDisplayName('');
    setAgeGroup('adult');
    setDietaryPreference('vegetarian');
    setSelectedConditions([]);
    setAllergiesText('');
    setIntolerancesText('');
    setRestrictionsText('');
    setPreferencesText('');
  };

  const toggleCondition = (code: string) => {
    setSelectedConditions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    if (!household) return;
    if (!displayName.trim()) {
      setError('Please enter a display name or nickname.');
      return;
    }

    const payload = {
      display_name: displayName.trim(),
      age_group: ageGroup,
      dietary_preference: dietaryPreference,
      selected_conditions: selectedConditions,
      allergies: allergiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      intolerances: intolerancesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      dietary_restrictions: restrictionsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      food_preferences: preferencesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (editingMemberId) {
        await api.updateMember(household.household_token, editingMemberId, payload);
        setFeedback(`Updated profile for ${payload.display_name}.`);
      } else {
        await api.addMember(household.household_token, payload);
        setFeedback(`Added household member ${payload.display_name}.`);
      }
      await refreshHousehold();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save member profile');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left: Existing Members List */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-stone-900">Family Members</h2>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-extrabold text-emerald-800 hover:underline"
            >
              + New Member
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {household?.members.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                onClick={() => loadMemberIntoForm(m)}
                className={`w-full text-left rounded-2xl border p-3.5 text-xs transition flex items-center gap-3 ${
                  editingMemberId === m.id
                    ? 'border-emerald-700 bg-emerald-50 font-bold'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-black ${
                    AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  }`}
                >
                  {m.display_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between">
                    <span className="font-extrabold text-stone-900 truncate">
                      {m.display_name}
                    </span>
                    {activeMember?.id === m.id && (
                      <span className="text-emerald-800 font-bold">Active</span>
                    )}
                  </div>
                  <div className="text-stone-500 mt-0.5 capitalize">
                    {m.dietary_preference.replace('_', ' ')} • {m.selected_conditions.length} condition(s)
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Clean Member Profile Form */}
      <div className="lg:col-span-8">
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-6"
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900">
              {editingMemberId ? 'Edit Family Member Profile' : 'Add Family Member Profile'}
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Enter a nickname and select any dietary preferences, allergies, or health considerations.
            </p>
          </div>

          {feedback && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-900">
              ✓ {feedback}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-bold text-rose-900">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Nickname *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Amma, Appa, Ajji, Aarav"
                aria-label="Member Nickname"
                className="mt-1.5 w-full rounded-2xl border border-stone-300 px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">Age Stage</label>
              <select
                aria-label="Member Age Group"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm"
              >
                <option value="adult">Adult (19–59 yrs)</option>
                <option value="older_adult">Older Adult (60+ yrs)</option>
                <option value="adolescent">Adolescent (10–18 yrs)</option>
                <option value="child">Child (3–9 yrs)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">Diet Style</label>
              <select
                aria-label="Member Dietary Preference"
                value={dietaryPreference}
                onChange={(e) => setDietaryPreference(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm"
              >
                <option value="vegetarian">Vegetarian</option>
                <option value="eggetarian">Eggetarian</option>
                <option value="non_vegetarian">Non-Vegetarian</option>
                <option value="vegan">Vegan</option>
                <option value="jain">Jain Vegetarian</option>
              </select>
            </div>
          </div>

          {/* Health Condition Pills */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">
              Health Considerations ({selectedConditions.length} selected)
            </label>
            <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-3 rounded-2xl border border-stone-200 bg-stone-50">
              {conditions.map((c) => {
                const active = selectedConditions.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCondition(c.code)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      active
                        ? 'border-emerald-800 bg-emerald-800 text-white shadow-sm'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Distinct Allergies vs Intolerances */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-rose-900">
                ⚠️ Food Allergies (Immune Reaction)
              </label>
              <input
                type="text"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
                placeholder="e.g. peanut, milk, wheat, soy, egg, sesame"
                className="mt-1.5 w-full rounded-2xl border border-stone-300 px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900">
                🌿 Digestive Intolerances (Sensitivity)
              </label>
              <input
                type="text"
                value={intolerancesText}
                onChange={(e) => setIntolerancesText(e.target.value)}
                placeholder="e.g. lactose, fructans_fodmap, gluten"
                className="mt-1.5 w-full rounded-2xl border border-stone-300 px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-2xl bg-emerald-800 px-6 py-3 text-xs font-extrabold text-white shadow hover:bg-emerald-700 transition"
            >
              {editingMemberId ? 'Save Profile Changes' : 'Add Member to Household'}
            </button>
            {editingMemberId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-2xl border border-stone-300 px-4 py-3 text-xs font-bold text-stone-700"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
