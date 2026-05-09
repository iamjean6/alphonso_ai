import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import ChatUI from './UI/chatUI';
import SelectionScreen from './components/SelectionScreen';
import ProfileForm from './components/ProfileForm';
import PricingPage from './pages/PricingPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/Auth/LoginPage';
import SignupPage from './pages/Auth/SignupPage';
import { updateProfile, getUserDetails, logout, setAccessToken, refreshAccessToken } from '../services/api';
import { RingLoader } from 'react-spinners';

function App() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [userData, setUserData] = useState(() => {
    const saved = localStorage.getItem('alphonso_user_data');
    return saved ? JSON.parse(saved) : {
      username: '',
      height: '',
      weight: '',
      sports: []
    };
  });

  const location = useLocation();

  useEffect(() => {
    const checkUserAndSkip = async () => {
      try {
        // Step 1: Silent Refresh - Attempt to get a fresh Access Token from the cookie
        const { token } = await refreshAccessToken();
        setAccessToken(token);

        // Step 2: Fetch User Details with the new token
        const { user } = await getUserDetails();

        // Always hydrate local state from DB on mount/reload
        setUserData({
          username: user.username,
          height: user.height,
          weight: user.weight,
          sports: user.primarySports,
          tier: user.tier || (user.isPro ? 'elite' : 'rookie')
        });

        // SMART SKIP: Only redirect to chat if user is fully onboarded AND currently at the root
        if (user.primarySports && user.primarySports.length > 0 && user.height && location.pathname === '/') {
          navigate('/chat', { replace: true });
        }
      } catch (err) {
        console.warn("No active session found or refresh failed.");
        // If it fails, we just don't log them in. 
        // No need to call logout() as it might trigger a loop or clear valid local UI data
      } finally {
        setLoading(false);
      }
    };

    checkUserAndSkip();
  }, [navigate, location.pathname]);

  const handleLogout = () => {
    logout();
    localStorage.removeItem('alphonso_user_data');
    navigate('/', { replace: true });
    window.location.reload(); // Hard reset to ensure fresh state
  };

  useEffect(() => {
    localStorage.setItem('alphonso_user_data', JSON.stringify(userData));
  }, [userData]);

  const handleSportsSelected = (selectedSports) => {
    setUserData(prev => ({ ...prev, sports: selectedSports }));
    navigate('/profile');
  };

  const handleProfileComplete = (profileData) => {
    setUserData(prev => ({ ...prev, ...profileData }));
    navigate('/signup'); // Direct to signup with the profile data ready to sync
  };

  const handleAuthSuccess = async (authenticatedUser, localProfile = null) => {
    // Check if the user already has a profile on the server
    const hasExistingProfile = authenticatedUser.primarySports && authenticatedUser.primarySports.length > 0;

    // Use either the passed localProfile or the global state
    const sportsToSync = localProfile?.sports || userData.sports;
    const heightToSync = localProfile?.height || userData.height;
    const weightToSync = localProfile?.weight || userData.weight;

    // Only Sync local onboarding data if the server profile is EMPTY and we have local data
    if (!hasExistingProfile && sportsToSync?.length > 0) {
      try {
        const profileToSync = {
          height: Number(heightToSync),
          weight: Number(weightToSync),
          primarySports: sportsToSync,
          goals: `Improve performance in ${sportsToSync.join(', ')}`
        };

        // Small timeout to ensure the token interceptor in api.js has the latest _accessToken
        setTimeout(async () => {
          try {
            await updateProfile(profileToSync);
            console.log("✅ Athlete profile successfully synced with MongoDB.");
            setUserData(prev => ({ ...prev, ...profileToSync }));
          } catch (err) {
            console.error("❌ Profile sync failed:", err.response?.data || err.message);
          }
        }, 500);

      } catch (err) {
        console.error("Critical error during profile preparation:", err);
      }
    } else if (hasExistingProfile) {
      // Pull existing profile into local state for visibility
      setUserData({
        username: authenticatedUser.username,
        height: authenticatedUser.height,
        weight: authenticatedUser.weight,
        sports: authenticatedUser.primarySports
      });
      console.log("Welcome back! Existing profile loaded.");
    }

    navigate('/chat');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <RingLoader color="var(--accent-sport)" size={60} />
        <h2 className="text-2xl font-bold text-foreground mt-6 tracking-widest animate-pulse uppercase">ALPHONSO</h2>
        <p className="text-muted-foreground mt-2">Preparing your personal arena...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      <Routes>
        <Route
          path="/"
          element={
            <SelectionScreen
              onNext={handleSportsSelected}
              onLoginRequested={() => navigate('/login')}
            />
          }
        />
        <Route
          path="/login"
          element={<LoginPage onSuccess={handleAuthSuccess} />}
        />
        <Route
          path="/signup"
          element={<SignupPage onSuccess={handleAuthSuccess} initialData={userData} />}
        />
        <Route
          path="/profile"
          element={<ProfileForm onNext={handleProfileComplete} />}
        />
        <Route
          path="/chat"
          element={<ChatUI userData={userData} onLogout={handleLogout} />}
        />
        <Route
          path="/pricing"
          element={<PricingPage />}
        />
        <Route
          path="/checkout/:planId"
          element={<CheckoutPage userData={userData} />}
        />
        {/* Fallback to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
