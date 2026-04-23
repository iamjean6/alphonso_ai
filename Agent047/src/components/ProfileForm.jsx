import React, { useState } from 'react';
import { User, Ruler, Weight, ArrowRight } from 'lucide-react';

const ProfileForm = ({ onNext }) => {
  const [formData, setFormData] = useState({
    username: '',
    height: '',
    weight: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isFormValid = formData.username && formData.height && formData.weight;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background">
      <div className="max-w-md w-full glass p-10 rounded-[32px] shadow-2xl relative overflow-hidden border border-border">
        {/* Decorative Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[var(--accent-sport)]/10 blur-[80px]" />
        
        <h2 className="text-4xl font-bold mb-2 text-foreground text-center">Athlete <span className="text-[var(--accent-sport)]">Profile</span></h2>
        <p className="text-muted-foreground text-center mb-10 italic">We need a few details to personalize your coaching experience.</p>

        <form className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground ml-1">Username</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your name"
                className="w-full bg-accent/5 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground focus:border-[var(--accent-sport)]/50 focus:bg-accent/10 transition-all outline-none placeholder:text-muted-foreground/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground ml-1">Height (cm)</label>
              <div className="relative">
                <Ruler className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="number"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  placeholder="180"
                  className="w-full bg-accent/5 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground focus:border-[var(--accent-sport)]/50 focus:bg-accent/10 transition-all outline-none placeholder:text-muted-foreground/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground ml-1">Weight (kg)</label>
              <div className="relative">
                <Weight className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
                <input
                  type="number"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                  placeholder="75"
                  className="w-full bg-accent/5 border border-border rounded-2xl py-4 pl-12 pr-4 text-foreground focus:border-[var(--accent-sport)]/50 focus:bg-accent/10 transition-all outline-none placeholder:text-muted-foreground/30"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNext(formData)}
            disabled={!isFormValid}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-bold transition-all duration-300 mt-4 shadow-lg ${
              isFormValid
                ? 'bg-[var(--accent-sport)] text-black hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(163,230,53,0.3)]'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            }`}
          >
            GET STARTED <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfileForm;
