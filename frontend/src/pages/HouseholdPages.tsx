import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { HealthConditionSummary, HouseholdMember } from '../types/api';

// ==========================================
// PAGE 6: HOUSEHOLD DASHBOARD PAGE
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
            No Mandatory Account Login • Browser Convenience Token
          </span>
          <h1 className="mt-2 text-2xl font-extrabold text-stone-900">
            {household?.name || 'My GharPlate Household'} Dashboard
          </h1>
          <p className="mt-1 text-xs text-stone-600 max-w-2xl">
            {household?.privacy_notice}
          </p>
          <p className="mt-2 text-xs font-mono text-stone-500">
            Active Browser Token: <strong>{household?.household_token}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/household/member"
            className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
          >
            + Add / Edit Family Member
          </Link>
          <button
            type="button"
            onClick={() => void clearLocalHousehold()}
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          >
            Reset & Purge Local Household
          </button>
        </div>
      </div>

      {/* Member Cards */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-stone-900">
          Household Members ({household?.members.length || 0})
        </h2>

        {!household || household.members.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <h3 className="text-base font-bold text-stone-900">
              No family members configured yet
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              Add household members (e.g., parents, grandparents, children) with separate dietary preferences, health considerations, allergies, and intolerances.
            </p>
            <Link
              to="/household/member"
              className="mt-4 inline-block rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white"
            >
              Create First Member Profile
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {household.members.map((m) => {
              const isDefault = activeMember?.id === m.id;
              return (
                <div
                  key={m.id}
                  className={`rounded-2xl border p-5 shadow-sm flex flex-col justify-between ${
                    isDefault
                      ? 'border-emerald-700 bg-emerald-50/40'
                      : 'border-stone-200 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-bold text-stone-900">{m.display_name}</h3>
                      {isDefault && (
                        <span className="rounded-full bg-emerald-800 px-2.5 py-0.5 text-[11px] font-bold text-white">
                          Active Default
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-stone-600 capitalize">
                      Age Group: <strong>{m.age_group.replace('_', ' ')}</strong> • Diet:{' '}
                      <strong>{m.dietary_preference.replace('_', ' ')}</strong>
                    </p>

                    <div className="mt-3 space-y-2 text-xs">
                      <div>
                        <span className="font-semibold text-stone-700">Health Considerations: </span>
                        {m.selected_conditions.length > 0 ? (
                          <span className="text-emerald-900 font-medium">
                            {m.selected_conditions.join(', ')}
                          </span>
                        ) : (
                          <span className="text-stone-400">None selected</span>
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-rose-800">Allergies (Immune): </span>
                        {m.allergies.length > 0 ? m.allergies.join(', ') : 'None'}
                      </div>
                      <div>
                        <span className="font-semibold text-amber-800">Intolerances (Digestive): </span>
                        {m.intolerances.length > 0 ? m.intolerances.join(', ') : 'None'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200/70 pt-3 text-xs">
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => void setActiveMemberId(m.id)}
                        className="font-bold text-emerald-800 hover:underline"
                      >
                        Set as Active
                      </button>
                    )}
                    <Link
                      to={`/meals?member=${m.id}`}
                      className="font-semibold text-stone-700 hover:underline"
                    >
                      Meal Ideas →
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(m.id)}
                      className="text-rose-700 hover:underline"
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
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-stone-900">Household Members</h2>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-bold text-emerald-800 hover:underline"
            >
              + New Form
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Select a member to edit or create a new member profile on the right.
          </p>

          <div className="mt-4 space-y-2">
            {household?.members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => loadMemberIntoForm(m)}
                className={`w-full text-left rounded-xl border p-3 text-xs transition ${
                  editingMemberId === m.id
                    ? 'border-emerald-700 bg-emerald-50 font-semibold'
                    : 'border-stone-200 hover:bg-stone-50'
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-bold text-stone-900">{m.display_name}</span>
                  {activeMember?.id === m.id && (
                    <span className="text-emerald-800 font-bold">Default</span>
                  )}
                </div>
                <div className="text-stone-500 mt-0.5">
                  {m.age_group} • {m.dietary_preference} • {m.selected_conditions.length} conditions
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Member Profile Form */}
      <div className="lg:col-span-8">
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-5"
        >
          <div>
            <h1 className="text-xl font-extrabold text-stone-900">
              {editingMemberId ? 'Edit Household Member Profile' : 'Add Household Member Profile'}
            </h1>
            <p className="mt-1 text-xs text-stone-600">
              We collect only minimal nickname and dietary/health preferences needed for food guidance. Do not enter full legal names, government IDs, or medical record numbers.
            </p>
          </div>

          {feedback && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
              {feedback}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Display Name / Nickname *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Amma, Appa, Aarav"
                aria-label="Member Nickname"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">Age Range / Stage</label>
              <select
                aria-label="Member Age Group"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="adult">Adult (19–59 yrs)</option>
                <option value="older_adult">Older Adult (60+ yrs)</option>
                <option value="adolescent">Adolescent (10–18 yrs)</option>
                <option value="child">Child (3–9 yrs)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">Dietary Preference</label>
              <select
                aria-label="Member Dietary Preference"
                value={dietaryPreference}
                onChange={(e) => setDietaryPreference(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="vegetarian">Vegetarian (Lacto-Veg)</option>
                <option value="eggetarian">Eggetarian (Ovo-Lacto)</option>
                <option value="non_vegetarian">Non-Vegetarian</option>
                <option value="vegan">Vegan (Plant-Only)</option>
                <option value="jain">Jain Vegetarian</option>
              </select>
            </div>
          </div>

          {/* Distinct Allergies vs Intolerances */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-rose-900">
                Food Allergies (Immune-Mediated — Distinct from Intolerances)
              </label>
              <input
                type="text"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
                placeholder="Comma-separated e.g. peanut, tree_nuts, milk, egg, soy, wheat, sesame"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <span className="text-[11px] text-stone-500">
                Shown as data-based allergen indications (never a guarantee against cross-contact).
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-900">
                Food Intolerances (Digestive Sensitivity)
              </label>
              <input
                type="text"
                value={intolerancesText}
                onChange={(e) => setIntolerancesText(e.target.value)}
                placeholder="Comma-separated e.g. lactose, fructans_fodmap, gluten"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
              <span className="text-[11px] text-stone-500">
                Kept separate from immunological allergies (e.g., lactose malabsorption vs milk allergy).
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Additional Dietary Restrictions
              </label>
              <input
                type="text"
                value={restrictionsText}
                onChange={(e) => setRestrictionsText(e.target.value)}
                placeholder="e.g. low_salt, no_added_sugar"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Regional Food Preferences
              </label>
              <input
                type="text"
                value={preferencesText}
                onChange={(e) => setPreferencesText(e.target.value)}
                placeholder="e.g. Karnataka, South Indian, Millets"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Health Condition Selection */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">
              Selected Health Conditions & Life-Stage Considerations ({selectedConditions.length} selected)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-2 rounded-xl border border-stone-200 bg-stone-50">
              {conditions.map((c) => {
                const active = selectedConditions.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggleCondition(c.code)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-emerald-800 bg-emerald-800 text-white font-semibold'
                        : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
            >
              {editingMemberId ? 'Save Member Changes' : 'Add Member to Household'}
            </button>
            {editingMemberId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-semibold text-stone-700"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
