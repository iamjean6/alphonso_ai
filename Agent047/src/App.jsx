import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import './App.css';
import ChatUI from './UI/chatUI';
import SelectionScreen from './components/SelectionScreen';
import ProfileForm from './components/ProfileForm';
import AuthModal from './components/AuthModal';
import PricingPage from './pages/PricingPage';
import CheckoutPage from './pages/CheckoutPage';
import { updateProfile, getUserDetails, logout } from '../services/api';
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

  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const checkUserAndSkip = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const { user } = await getUserDetails();
          // SMART SKIP: If user already has sports and stats, jump to chat!
          if (user.primarySports && user.primarySports.length > 0 && user.height) {
            setUserData({
                username: user.username,
                height: user.height,
                weight: user.weight,
                sports: user.primarySports
            });
            navigate('/chat', { replace: true });
          }
        } catch (err) {
          console.error("Auth session expired or invalid.");
          logout();
        }
      }
      setLoading(false);
    };
    
    checkUserAndSkip();
  }, [navigate]);

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
    setShowAuthModal(true); // Open the Gate
  };

  const handleAuthSuccess = async (authenticatedUser) => {
    setShowAuthModal(false);
    
    // Check if the user already has a profile on the server
    const hasExistingProfile = authenticatedUser.primarySports && authenticatedUser.primarySports.length > 0;
    
    // Only Sync local onboarding data if the server profile is EMPTY and we have local data
    if (!hasExistingProfile && userData.sports.length > 0) {
      try {
        const profileToSync = {
          height: userData.height,
          weight: userData.weight,
          primarySports: userData.sports,
          goals: `Improve performance in ${userData.sports.join(', ')}`
        };

        await updateProfile(profileToSync);
        console.log("New athlete profile synced with backend.");
        
        // Update local state with the synced data
        setUserData(prev => ({ ...prev, ...profileToSync }));
      } catch (err) {
        console.error("Failed to sync new profile during onboarding:", err);
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
                    onLoginRequested={() => setShowAuthModal(true)} 
                />
            } 
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

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        initialUsername={userData.username}
      />
    </div>
  );
}

export default App;
