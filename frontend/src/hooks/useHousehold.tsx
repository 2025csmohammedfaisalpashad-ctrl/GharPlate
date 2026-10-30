import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Household, HouseholdMember } from '../types/api';

const STORAGE_KEY = 'gharplate_household_token';
const SEARCH_HISTORY_KEY = 'gharplate_search_history';

interface HouseholdContextValue {
  household: Household | null;
  activeMember: HouseholdMember | null;
  loading: boolean;
  error: string | null;
  searchHistory: string[];
  setActiveMemberId: (id: number) => Promise<void>;
  refreshHousehold: () => Promise<void>;
  createNewHousehold: (name?: string) => Promise<void>;
  clearLocalHousehold: () => Promise<void>;
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

function generateBrowserToken(): string {
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
  return `hh_${randomPart.slice(0, 24)}`;
}

export const HouseholdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      return raw ? JSON.parse(raw) : ['Ragi', 'Avalakki', 'Toor Dal', 'Baale Hannu'];
    } catch {
      return [];
    }
  });

  const initHousehold = async () => {
    setLoading(true);
    setError(null);
    try {
      let token = localStorage.getItem(STORAGE_KEY);
      if (!token) {
        token = generateBrowserToken();
        localStorage.setItem(STORAGE_KEY, token);
      }
      const hh = await api.initOrGetHousehold(token, 'My GharPlate Household');
      setHousehold(hh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load household profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void initHousehold();
  }, []);

  const refreshHousehold = async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      await initHousehold();
      return;
    }
    try {
      const hh = await api.getHousehold(token);
      setHousehold(hh);
    } catch {
      await initHousehold();
    }
  };

  const setActiveMemberId = async (memberId: number) => {
    if (!household) return;
    const updated = await api.setDefaultMember(household.household_token, memberId);
    setHousehold(updated);
  };

  const createNewHousehold = async (name = 'My GharPlate Household') => {
    const newToken = generateBrowserToken();
    localStorage.setItem(STORAGE_KEY, newToken);
    const hh = await api.initOrGetHousehold(newToken, name);
    setHousehold(hh);
  };

  const clearLocalHousehold = async () => {
    const token = localStorage.getItem(STORAGE_KEY);
    if (token) {
      try {
        await api.deleteHousehold(token);
      } catch {
        // ignore if already absent
      }
      localStorage.removeItem(STORAGE_KEY);
    }
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setSearchHistory([]);
    await createNewHousehold('My GharPlate Household');
  };

  const addSearchHistory = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearchHistory((prev) => {
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const clearSearchHistory = () => {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setSearchHistory([]);
  };

  const activeMember =
    household?.members.find((m) => m.id === household.default_member_id) ||
    household?.members[0] ||
    null;

  return (
    <HouseholdContext.Provider
      value={{
        household,
        activeMember,
        loading,
        error,
        searchHistory,
        setActiveMemberId,
        refreshHousehold,
        createNewHousehold,
        clearLocalHousehold,
        addSearchHistory,
        clearSearchHistory,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
};

export function useHousehold(): HouseholdContextValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) {
    throw new Error('useHousehold must be used within a HouseholdProvider');
  }
  return ctx;
}
