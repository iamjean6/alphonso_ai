import React, { useState, useEffect } from 'react';
import { Bookmark, Gift, Wrench, DollarSign, Flag, Settings2, Info, Calendar as CalendarIcon, CheckCircle2, AlertCircle, Globe } from 'lucide-react';
import { connectGoogleCalendar, updateTimezone } from '../../services/api';

const RightToolbar = ({ userData }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [tz, setTz] = useState('');

  const hasCalendar = userData?.hasGoogleCalendar;

  useEffect(() => {
    // Auto-detect browser timezone if not set in DB
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const initialTz = userData?.userTimezone || detectedTz;
    setTz(initialTz);

    // If it wasn't set in DB, seamlessly update it in the background
    if (!userData?.userTimezone && detectedTz) {
      updateTimezone(detectedTz).catch(console.error);
    }
  }, [userData]);

  const handleTimezoneChange = async (e) => {
    const newTz = e.target.value;
    setTz(newTz);
    try {
      await updateTimezone(newTz);
    } catch (err) {
      console.error("Failed to update timezone:", err);
    }
  };

  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        setShowTooltip(true);
        setTimeout(() => {
          setShowTooltip(false);
        }, 10000); // 10 seconds
      }
    };

    window.addEventListener('click', handleFirstInteraction, { once: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [hasInteracted]);

  return (
    <div className="w-16 h-screen flex flex-col items-center py-6 bg-sidebar border-l border-sidebar-border space-y-6 relative">
      <div className="flex flex-col gap-4 w-full px-2">

        {/* TIMEZONE SELECTOR */}
        <div className="relative flex justify-center w-full group">
          <div className="relative group cursor-pointer flex justify-center items-center p-3 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-xl transition-all">
            <Globe size={20} />
            <select
              value={tz}
              onChange={handleTimezoneChange}
              className="absolute inset-0 opacity-0 text-black cursor-pointer w-full h-full"
              title="Set Timezone"
            >
              <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              {/* Add fallback for auto-detected timezone if not in standard list */}
              {!["Africa/Nairobi", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Australia/Sydney"].includes(tz) && (
                <option value={tz}>{tz} (Local)</option>
              )}
            </select>
            <div className="absolute right-[calc(100%+10px)] top-1/2 transform -translate-y-1/2 w-max z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="glass bg-black/95 text-white p-2.5 rounded-xl text-[10px] font-bold tracking-wider uppercase border border-white/10 shadow-xl backdrop-blur-xl">
                Timezone: {tz || 'Auto-detecting...'}
              </div>
            </div>
          </div>
        </div>

        {/* CALENDAR SYNC */}
        <div className="relative flex justify-center w-full group">
          <button
            onClick={hasCalendar ? undefined : connectGoogleCalendar}
            disabled={hasCalendar}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => { if (hasInteracted) setShowTooltip(false); }}
            className={`p-3 rounded-xl transition-all relative ${hasCalendar ? 'text-green-400 bg-green-500/10  cursor-default' : 'text-amber-400  hover:bg-amber-500/20 '}`}
          >
            <CalendarIcon size={20} />
            {hasCalendar ? (
              <CheckCircle2 size={10} className="absolute top-1.5 right-1.5 text-green-400 bg-black rounded-full" />
            ) : (
              <AlertCircle size={10} className="absolute top-1.5 right-1.5 text-amber-400 bg-black rounded-full animate-pulse" />
            )}
          </button>

          {showTooltip && (
            <div className="absolute right-[calc(100%+10px)] top-1/2 transform -translate-y-1/2 w-64 z-50 animate-in fade-in zoom-in-95 duration-300 pointer-events-none">
              <div className={`glass bg-black/95 text-white p-3 rounded-2xl text-[11px] leading-relaxed border shadow-xl backdrop-blur-xl flex flex-col gap-1.5 ${hasCalendar ? 'border-green-500/20' : 'border-amber-500/20'}`}>
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                  {hasCalendar ? (
                    <span className="text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> Clearance Active</span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1"><AlertCircle size={12} /> Action Required</span>
                  )}
                </div>
                <span className="text-muted-foreground">
                  {hasCalendar
                    ? "Calendar connected. Alphonso will sync generated workout splits directly to your schedule."
                    : "Click to connect your Google Calendar. This securely authorizes Alphonso to write training blocks to your daily routine."}
                </span>
              </div>
            </div>
          )}
        </div>

        <ToolButton icon={<Bookmark size={20} />} />
        <ToolButton icon={<Gift size={20} />} />
        <ToolButton icon={<Wrench size={20} />} />
        <ToolButton icon={<DollarSign size={20} />} />
        <ToolButton icon={<Flag size={20} />} />
      </div>

      <div className="mt-auto flex flex-col gap-4">
        <ToolButton icon={<Settings2 size={20} />} />
        <ToolButton icon={<Info size={20} />} />
      </div>
    </div>
  );
};

const ToolButton = ({ icon }) => (
  <button className="p-3 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-xl transition-all">
    {icon}
  </button>
);

export default RightToolbar;
