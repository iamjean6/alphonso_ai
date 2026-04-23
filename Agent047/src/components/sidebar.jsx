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
    LogOut
} from "lucide-react";

const SideBar = ({ userData, isOpen, onClose, onLogout, onNewChat }) => {
    const [isDarkMode, setIsDarkMode] = useState(true);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    const chatHistory = [
        "Jump Training Session...",
        "Shooting Mechanics",
        "Bench Press PR Data",
        "Klay Thompson Form...",
        "Sprint Speed Analysis",
        "Mobility Routine Prep",
        "Vertical Jump Intake"
    ];

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
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-foreground rounded-full flex items-center justify-center">
                            <div className="w-4 h-4 bg-background rounded-sm rotate-45" />
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
                    className="flex items-center justify-center gap-2 w-full py-4 bg-[var(--accent-sport)] hover:brightness-110 text-black font-bold rounded-2xl mb-8 transition-all hover:scale-[1.02] shadow-[0_0_20px_rgba(163,230,53,0.3)]"
                >
                    <Plus size={20} />
                    NEW CHAT
                </button>

                {/* Primary Navigation */}
                <nav className="space-y-1 mb-10">
                    <NavItem icon={<Search size={20} />} label="Explore" />
                    <NavItem icon={<Grid size={20} />} label="Categories" />
                    <NavItem icon={<Library size={20} />} label="Library" badge="141" />
                    <NavItem icon={<Settings size={20} />} label="Settings" />
                </nav>

                {/* Chat History */}
                <div className="flex-grow overflow-y-auto no-scrollbar">
                    <h3 className="text-xs font-bold text-sidebar-foreground/40 uppercase tracking-widest mb-4 ml-2">Chats</h3>
                    <div className="space-y-1">
                        {chatHistory.map((chat, i) => (
                            <div
                                key={i}
                                className={`px-3 py-3 rounded-xl text-sm transition-all cursor-pointer truncate ${i === 0 ? 'bg-sidebar-accent text-[var(--accent-sport)] border-l-2 border-[var(--accent-sport)]' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                    }`}
                            >
                                {chat}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer Settings */}
                <div className="mt-6 pt-6 border-t border-sidebar-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-sidebar-accent overflow-hidden ring-2 ring-[var(--accent-sport)]/20">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userData?.username || 'Felix'}`} alt="avatar" />
                        </div>
                        <span className="text-sm font-medium text-sidebar-foreground truncate max-w-[80px]">{userData?.username || 'Guest'}</span>
                    </div>
                    <div className="flex gap-1">
                        <IconButton icon={<Bell size={18} />} />
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
        </>
    );
};

const NavItem = ({ icon, label, badge }) => (
    <button className="flex items-center justify-between w-full p-3 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-xl transition-all group">
        <div className="flex items-center gap-3">
            <span className="group-hover:text-[var(--accent-sport)] transition-colors">{icon}</span>
            <span className="font-medium">{label}</span>
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