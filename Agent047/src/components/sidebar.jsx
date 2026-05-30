import React, { useState, useEffect } from "react";
import {
    Plus,
    Search,
    Grid,
    Library,
    Settings,
    Bell,
    Sun,
    Moon,
    Menu,
    MessageSquare,
    LogOut,
    Trash2,
    Lock,
    Zap
} from "lucide-react";
import { getSessions, deleteSession } from "../../services/api";

const SideBar = ({ userData, isOpen, onClose, onLogout, onNewChat, onSessionSelect, activeSessionId, refreshToggle }) => {
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [activeTab, setActiveTab] = useState('chats');

    const getLimits = (tier) => {
        const t = (tier || 'rookie').toLowerCase();
        if (t === 'rookie') return 3;
        if (t === 'prospect') return 10;
        if (t === 'elite') return 20;
        return Infinity;
    };
    
    const maxChats = getLimits(userData?.tier);
    const chatsUsed = userData?.chatsToday || 0;
    const progress = maxChats === Infinity ? 100 : Math.min((chatsUsed / maxChats) * 100, 100);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const [sessions, setSessions] = useState([]);
    const [sessionToDelete, setSessionToDelete] = useState(null);

    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const data = await getSessions();
                setSessions(data);
            } catch (err) {
                console.error("Failed to fetch sessions:", err);
            }
        };
        if (userData?.username) fetchSessions();
    }, [userData, activeSessionId, refreshToggle]);

    const handleDeleteSession = async () => {
        if (!sessionToDelete) return;
        try {
            await deleteSession(sessionToDelete);
            setSessions(prev => prev.filter(s => s.sessionId !== sessionToDelete));
            if (activeSessionId === sessionToDelete) {
                onNewChat();
            }
        } catch (err) {
            console.error("Failed to delete session", err);
        } finally {
            setSessionToDelete(null);
        }
    };

    // Refresh when user changes or new session starts
    return (
        <>
            {/* Mobile Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
                    onClick={onClose}
                />
            )}

            <div className={`
                w-72 h-screen flex flex-col bg-sidebar border-r border-sidebar-border p-6 select-none transition-transform duration-300 z-50
                fixed md:relative inset-y-0 left-0 
                ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                ${!isOpen && 'hidden md:flex'}
            `}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center">
                            <img src="/logo.png" alt="logo" className="w-full h-full rounded-full" />
                        </div>
                        <span className="font-bold text-xl tracking-tight text-foreground">Alphonso <span className="text-[var(--accent-sport)]">AI</span></span>
                    </div>
                    <button
                        className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
                        onClick={onClose}
                    >
                        <Menu size={20} className="text-sidebar-foreground/60" />
                    </button>
                </div>

                {/* New Chat Button */}
                <button
                    onClick={onNewChat}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-[var(--accent-sport)] hover:brightness-110 text-black font-bold rounded-2xl mb-4 transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(163,230,53,0.3)]"
                >
                    <Plus size={20} />
                    NEW CHAT
                </button>

                {/* Primary Navigation */}
                <nav className="space-y-1 mb-2">
                    <NavItem 
                        icon={<MessageSquare size={20} />} 
                        label="All Chats" 
                        onClick={() => setActiveTab('chats')}
                        isActive={activeTab === 'chats'}
                    />
                    <NavItem 
                        icon={<Library size={20} />} 
                        label="Library" 
                        badge={sessions.filter(s => s.isStarred).length || null} 
                        onClick={() => setActiveTab('library')}
                        isActive={activeTab === 'library'}
                    />
                </nav>

                {/* Chat History */}
                <div className="flex-grow overflow-y-auto relative">
                    <h3 className="text-xs font-bold text-sidebar-foreground/40 uppercase tracking-widest mb-4 ml-2">
                        {activeTab === 'library' ? 'Favorite Stories' : 'Recent Chats'}
                    </h3>
                    
                    {userData?.tier === 'rookie' ? (
                        <div className="absolute inset-x-0 bottom-0 top-10 z-10 flex flex-col items-center justify-center p-4 backdrop-blur-md bg-sidebar/50 rounded-xl border border-white/5">
                            <Lock size={32} className="text-[var(--accent-sport)] mb-3 drop-shadow-[0_0_15px_rgba(219,255,0,0.5)]" />
                            <h4 className="text-white font-bold text-center mb-1">History Locked</h4>
                            <p className="text-xs text-center text-white/60 mb-4">Upgrade to Prospect or Elite to save and view past sessions.</p>
                            <a href="/pricing" className="px-4 py-2 bg-[var(--accent-sport)] text-black font-bold rounded-full text-xs hover:scale-105 transition-transform">Unlock History</a>
                        </div>
                    ) : null}

                    <div className={`space-y-1 ${userData?.tier === 'rookie' ? 'blur-sm opacity-50 pointer-events-none select-none' : ''}`}>
                        {sessions
                            .filter(session => activeTab === 'library' ? session.isStarred : true)
                            .map((session) => (
                            <div
                                key={session.sessionId}
                                onClick={() => onSessionSelect(session.sessionId)}
                                className={`group flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-all cursor-pointer ${activeSessionId === session.sessionId ? 'bg-sidebar-accent text-[var(--accent-sport)] border-l-2 border-[var(--accent-sport)]' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                    }`}
                            >
                                <span className="truncate flex-1">{session.title || "New Performance Chat"}</span>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setSessionToDelete(session.sessionId); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Usage Progress Bar */}
                {maxChats !== Infinity && (
                    <div className="mb-4 px-2">
                        <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs font-bold text-white/60 flex items-center gap-1">
                                <Zap size={12} className="text-[var(--accent-sport)]" />
                                Daily Energy
                            </span>
                            <span className="text-xs font-bold text-white">{chatsUsed} / {maxChats}</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-[var(--accent-sport)] rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(219,255,0,0.5)]"
                                style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? '#ef4444' : '' }}
                            />
                        </div>
                    </div>
                )}

                {/* Footer Settings */}
                <div className="mt-6 pt-6 border-t border-sidebar-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-sidebar-accent overflow-hidden ring-2 ring-[var(--accent-sport)]/20">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userData?.username}`} alt="avatar" />
                        </div>
                        <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[80px]">{userData?.username}</span>
                    </div>
                    <div className="flex gap-1">
                        <IconButton icon={<Settings size={18} />} />
                        <IconButton
                            icon={isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                            onClick={() => setIsDarkMode(!isDarkMode)}
                        />
                        <IconButton
                            icon={<LogOut size={18} />}
                            onClick={onLogout}
                        />
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {sessionToDelete && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="glass bg-sidebar border border-red-500/30 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <Trash2 className="text-red-500" size={20} /> Delete Chat
                        </h3>
                        <p className="text-sidebar-foreground/70 text-sm mb-6">
                            Are you sure you want to permanently delete this session? This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setSessionToDelete(null)}
                                className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-sidebar-accent transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleDeleteSession}
                                className="px-4 py-2 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-sm font-bold transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const NavItem = ({ icon, label, badge, onClick, isActive }) => (
    <button onClick={onClick} className={`flex items-center justify-between w-full p-3 hover:bg-sidebar-accent rounded-xl transition-all group ${isActive ? 'bg-sidebar-accent' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'}`}>
        <div className="flex items-center gap-3">
            <span className={`transition-colors ${isActive ? 'text-[var(--accent-sport)]' : 'group-hover:text-[var(--accent-sport)]'}`}>{icon}</span>
            <span className={`font-medium ${isActive ? 'text-white font-bold' : ''}`}>{label}</span>
        </div>
        {badge && <span className="text-[10px] bg-[var(--accent-sport)]/20 text-[var(--accent-sport)] px-1.5 py-0.5 rounded-md font-bold">{badge}</span>}
    </button>
);

const IconButton = ({ icon, onClick }) => (
    <button
        onClick={onClick}
        className="p-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-all"
    >
        {icon}
    </button>
);

export default SideBar;