import React, { useState } from 'react';
import { Check } from 'lucide-react';

const sports = [
  { id: 'football', name: 'Football', image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=400&h=600&fit=crop' },
  { id: 'basketball', name: 'Basketball', image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=600&fit=crop' },
  { id: 'running', name: 'Running', image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400&h=600&fit=crop' },
  { id: 'gym', name: 'Weightlifting', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=600&fit=crop' },
  { id: 'tennis', name: 'Tennis', image: 'https://images.unsplash.com/photo-1595435064215-46d128ec6012?w=400&h=600&fit=crop' },
  { id: 'cycling', name: 'Cycling', image: 'https://images.unsplash.com/photo-1484156818044-c040038b0719?w=400&h=600&fit=crop' },
];

const SelectionScreen = ({ onNext, onLoginRequested }) => {
  const [selectedSports, setSelectedSports] = useState([]);

  const toggleSport = (id) => {
    setSelectedSports((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background">
      <div className="max-w-4xl w-full">
        <h1 className="text-5xl font-bold mb-4 text-center text-foreground tracking-tight">
          Select your <span className="text-[var(--accent-sport)]">Sports</span>
        </h1>
        <p className="text-muted-foreground text-center mb-12 text-lg">
          Choose the activities you're interested in. You can select multiple.
        </p>

        <div className="grid md:grid-cols-4 grid-cols-2 sm:grid-cols-3 gap-6 mb-12">
          {sports.map((sport) => (
            <div
              key={sport.id}
              onClick={() => toggleSport(sport.id)}
              className={`relative group cursor-pointer overflow-hidden rounded-3xl transition-all duration-500 ${selectedSports.includes(sport.id)
                ? 'ring-4 ring-[var(--accent-sport)] scale-95 '
                : 'hover:scale-105 border border-border'
                }`}
            >
              <img
                src={sport.image}
                alt={sport.name}
                className="w-full h-56 object-cover  group-hover:opacity-80 transition-opacity"
              />
              <div className="absolute " />

              <div className="absolute bottom-6 left-6 flex items-center gap-3">
                <span className="text-lg font-bold text-yellow-600 tracking-wider">{sport.name}</span>
                {selectedSports.includes(sport.id) && (
                  <div className="bg-[var(--accent-sport)] p-1 rounded-full">
                    <Check size={16} className="text-black" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-8 mt-4">
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => onNext(selectedSports)}
              disabled={selectedSports.length === 0}
              className={`px-12 py-4 bg-gray-700 rounded-full text-lg font-bold transition-all duration-300 ${selectedSports.length > 0
                ? 'bg-[var(--accent-sport)] text-black hover:scale-105 hover:shadow-[0_0_20px_rgba(163,230,53,0.4)]'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                }`}
            >
              CONTINUE
            </button>

            <p className="text-black text-lg">
              Already have a registered account?{" "}
              <button
                onClick={onLoginRequested}
                className="text-[var(--accent-sport)] font-bold hover:underline"
              >
                Click to login
              </button>
            </p>
          </div>

          <div className="max-w-xl text-center">
            <p className="text-muted-foreground text-[10px] leading-relaxed opacity-50 uppercase tracking-widest">
              Disclaimer: Alphonso is an AI performance mentor. It provides data-driven coaching insights but does not replace professional medical advice, diagnosis, or injury rehabilitation. By continuing, you agree to our Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectionScreen;
