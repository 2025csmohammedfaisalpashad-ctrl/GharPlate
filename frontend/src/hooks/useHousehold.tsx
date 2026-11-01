import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCsrfToken } from '../services/api';
import type { AuthSessionResponse, AuthUser, Household, HouseholdMember } from '../types/api';

const SEARCH_HISTORY_KEY = 'gharplate_search_history';

interface HouseholdContextValue {
  authenticated: boolean;
  user: AuthUser | null;
  household: Household | null;
  activeMember: HouseholdMember | null;
  loading: boolean;
  error: string | null;
  searchHistory: string[];
  applyAuthenticatedSession: (session: AuthSessionResponse) => void;
  signOut: () => Promise<void>;
  setActiveMemberId: (id: number) => Promise<void>;
  refreshHousehold: () => Promise<void>;
  createNewHousehold: (name?: string) => Promise<void>;
  clearLocalHousehold: () => Promise<void>;
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;
}

const HouseholdContext = createContext<HouseholdContextValue | undefined>(undefined);

export const HouseholdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<AuthUser | null>(null);
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

  const applyAuthenticatedSession = useCallback((session: AuthSessionResponse) => {
    if (session.csrf_token) {
      setCsrfToken(session.csrf_token);
    }
    setAuthenticated(Boolean(session.authenticated));
    setUser(session.user);
    setHousehold(session.household);
    setError(null);
    setLoading(false);
  }, []);

  const restoreSessionFromBackend = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await api.getAuthMe();
      applyAuthenticatedSession(session);
    } catch {
      setAuthenticated(false);
      setUser(null);
      setHousehold(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedSession]);

  useEffect(() => {
    void restoreSessionFromBackend();
  }, [restoreSessionFromBackend]);

  const signOut = async () => {
    try {
      await api.logoutAccount();
    } catch {
      // Even if session already expired on server, clear client state
    }
    setCsrfToken(null);
    setAuthenticated(false);
    setUser(null);
    setHousehold(null);
    setError(null);
  };

  const refreshHousehold = async () => {
    if (!authenticated) {
      await restoreSessionFromBackend();
      return;
    }
    try {
      const hh = await api.getHousehold(household?.household_token || 'me');
      setHousehold(hh);
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) {
        setAuthenticated(false);
        setUser(null);
        setHousehold(null);
      }
    }
  };

  const setActiveMemberId = async (memberId: number) => {
    if (!household) return;
    const updated = await api.setDefaultMember(household.household_token, memberId);
    setHousehold(updated);
  };

  const createNewHousehold = async (name = 'My GharPlate Household') => {
    if (!authenticated) return;
    const hh = await api.initOrGetHousehold(household?.household_token, name);
    setHousehold(hh);
  };

  const clearLocalHousehold = async () => {
    if (!household) return;
    try {
      await api.deleteHousehold(household.household_token);
    } catch {
      // ignore if error
    }
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setSearchHistory([]);
    await refreshHousehold();
  };

  const addSearchHistory = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearchHistory((prev) => {
      const next = [
        trimmed,
        ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
      ].slice(0, 8);
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
        authenticated,
        user,
        household,
        activeMember,
        loading,
        error,
        searchHistory,
        applyAuthenticatedSession,
        signOut,
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
