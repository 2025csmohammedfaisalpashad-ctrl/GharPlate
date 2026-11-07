import React from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HouseholdProvider, useHousehold } from './hooks/useHousehold';
import { AuthLandingPage } from './pages/AuthLandingPage';
import {
  ProductComparisonPage,
  MealSuggestionsPage,
} from './pages/ComparisonMealsPages';
import {
  ConditionDetailPage,
  ConditionExplorerPage,
} from './pages/ConditionPages';
import {
  DailyTrackerPage,
  FitnessDashboardPage,
  GoalsHabitsPage,
  ProgressAnalyticsPage,
  WaterTrackerPage,
} from './pages/FitnessTrackerPages';
import {
  FoodDetailPage,
  FoodExplorerPage,
  HomePage,
} from './pages/HomePages';
import {
  HouseholdDashboardPage,
  MemberProfilePage,
} from './pages/HouseholdPages';
import {
  MessAndFamilyEcosystemPage,
  ProteinIntelligencePage,
  RecipeDiscoveryPage,
  SmartGroceryPantryPage,
} from './pages/KitchenEcosystemPages';
import {
  RecipeCalculatorPage,
  SavedRecipesPage,
} from './pages/RecipePages';
import {
  BarcodeLookupPage,
  FoodRecognitionPage,
  FoodScannerPage,
} from './pages/ScannerPages';
import {
  AboutPage,
  DataSourcesPage,
  PrivacySafetyPage,
  SettingsPage,
} from './pages/TrustPages';
import type { AuthUser } from './types/api';

export function useAuthGate(): {
  authProfile: { name: string; email: string } | null;
  user: AuthUser | null;
  authenticated: boolean;
  signOut: () => Promise<void>;
} {
  const { user, authenticated, signOut } = useHousehold();
  return {
    authProfile: user ? { name: user.full_name, email: user.email } : null,
    user,
    authenticated,
    signOut,
  };
}

const RoutedAuthPage: React.FC<{ initialMode: 'login' | 'signup' }> = ({ initialMode }) => {
  const navigate = useNavigate();

  return (
    <AuthLandingPage
      initialMode={initialMode}
      onAuthenticated={(_session, targetPath = '/') => {
        navigate(targetPath);
      }}
    />
  );
};

export const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<RoutedAuthPage initialMode="login" />} />
    <Route path="/signup" element={<RoutedAuthPage initialMode="signup" />} />
    <Route
      path="*"
      element={
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/foods" element={<FoodExplorerPage />} />
            <Route path="/foods/:slug" element={<FoodDetailPage />} />
            <Route path="/conditions" element={<ConditionExplorerPage />} />
            <Route path="/conditions/:code" element={<ConditionDetailPage />} />
            <Route path="/household" element={<HouseholdDashboardPage />} />
            <Route path="/household/member" element={<MemberProfilePage />} />
            <Route path="/recipes/calculator" element={<RecipeCalculatorPage />} />
            <Route path="/recipes/saved" element={<SavedRecipesPage />} />
            <Route path="/recipes/discover" element={<RecipeDiscoveryPage />} />
            <Route path="/fitness/dashboard" element={<FitnessDashboardPage />} />
            <Route path="/fitness/tracker" element={<DailyTrackerPage />} />
            <Route path="/fitness/hydration" element={<WaterTrackerPage />} />
            <Route path="/fitness/goals" element={<GoalsHabitsPage />} />
            <Route path="/fitness/analytics" element={<ProgressAnalyticsPage />} />
            <Route path="/fitness/protein" element={<ProteinIntelligencePage />} />
            <Route path="/kitchen/grocery" element={<SmartGroceryPantryPage />} />
            <Route path="/tools/mess-analyzer" element={<MessAndFamilyEcosystemPage />} />
            <Route path="/scanner" element={<FoodScannerPage />} />
            <Route path="/barcode" element={<BarcodeLookupPage />} />
            <Route path="/recognition" element={<FoodRecognitionPage />} />
            <Route path="/compare" element={<ProductComparisonPage />} />
            <Route path="/meals" element={<MealSuggestionsPage />} />
            <Route path="/sources" element={<DataSourcesPage />} />
            <Route path="/privacy-safety" element={<PrivacySafetyPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      }
    />
  </Routes>
);

const AuthenticatedAppShell: React.FC = () => {
  const { authenticated, loading } = useHousehold();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div
        data-testid="auth-session-loading"
        className="min-h-screen flex items-center justify-center bg-[#FAF7F2] text-stone-700"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-3.5 text-xs font-extrabold shadow-sm">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-emerald-700" />
          <span>Verifying your GharPlate session...</span>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <AuthLandingPage
        initialMode="login"
        onAuthenticated={(_session, targetPath = '/') => {
          navigate(targetPath);
        }}
      />
    );
  }

  return <AppRoutes />;
};

export const App: React.FC = () => (
  <HouseholdProvider>
    <BrowserRouter>
      <AuthenticatedAppShell />
    </BrowserRouter>
  </HouseholdProvider>
);

export default App;
