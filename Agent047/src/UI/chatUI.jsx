import React, { useState, useEffect, useRef } from 'react';
import SideBar from '../components/sidebar';
import RightToolbar from '../components/RightToolbar';
import YoutubeMediaRow from '../components/YoutubeMediaRow';
import { chatWithAi, getSessionMessages } from '../../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import {
    Share,
    Star,
    MoreHorizontal,
    Paperclip,
    Mic,
    Send,
    Sparkles,
    Menu,
    ChevronLeft,
    ChevronRight,
    Crown,
    FileText,
    Lock,
    X
} from 'lucide-react';

const ChatUI = ({ userData, onLogout }) => {
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [pendingFile, setPendingFile] = useState(null); // Stage file for combined send
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // MASTER PERSISTENCE RECOVERY: Hydrate session and history on mount
    useEffect(() => {
        const hydrateChat = async () => {
            // 1. Recover Session ID from local storage immediately
            // We use a generic key first, then refine with username if available
            const globalSessionId = localStorage.getItem(`alphonso_sess_active`);
            const userSessionId = userData?.username ? localStorage.getItem(`alphonso_sess_${userData.username}`) : null;

            const activeId = userSessionId || globalSessionId;

            if (activeId) {
                setSessionId(activeId);
                try {
                    const history = await getSessionMessages(activeId);
                    if (history && history.length > 0) {
                        const hydrated = history.map(m => ({
                            ...m,
                            timestamp: new Date(m.timestamp)
                        }));
                        setMessages(hydrated);
                    }
                } catch (err) {
                    console.error("Failed to hydrate history on mount:", err);
                }
            }
        };

        hydrateChat();
    }, [userData?.username]); // Re-run if user profile loads late

    // PERSISTENCE SYNC: Keep Session ID anchored
    useEffect(() => {
        if (sessionId) {
            localStorage.setItem(`alphonso_sess_active`, sessionId);
            if (userData?.username) {
                localStorage.setItem(`alphonso_sess_${userData.username}`, sessionId);
            }
        }
    }, [sessionId, userData?.username]);

    // Auto-scroll to latest message
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    /**
     * LIVE DISCOVERY PARSER: Scrub text for the bubble while extracting videos for real-time UI.
     */
    const parseAlphonsoResponse = (text) => {
        if (!text) return { cleanedText: "", videos: [] };

        const lines = text.split('\n');
        const videos = [];
        let lastTitle = "";
        let lastChannel = "";
        let lastAudit = "";

        lines.forEach(line => {
            // 1. CAPTURE TITLE/CHANNEL
            // 1. CAPTURE TITLE/CHANNEL (Supports both bold and raw text)
            const titleRowMatch = line.match(/(?:\d+\.\s+)?(?:\*\*)?([^*]+?)(?:\*\*)?\s+by\s+([^-:[\]]+?)(?:\s+Audit:|\s*\*Audit:\*|$)/i);
            if (titleRowMatch) {
                lastTitle = titleRowMatch[1].trim();
                lastChannel = titleRowMatch[2].trim();
            }

            // 1.5 CAPTURE AUDIT (Handles both standalone and inline after "Audit:")
            const auditMatch = line.match(/(?:\s+Audit:|\*Audit:\*)\s*(.+?)(?:\s+\[System Metadata\]|$)/i);
            if (auditMatch) {
                lastAudit = auditMatch[1].trim();
            }

            // 2. EXTRACT VIDEO DATA
            const idMatch = line.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([0-9A-Za-z_-]{11})/i);
            if (idMatch) {
                const videoId = idMatch[1];

                // Extract metadata if present
                const viewsMatch = line.match(/Views:\s*(\d+)/i);
                const yearMatch = line.match(/Year:\s*(\d{4})/i);
                const thumbMatch = line.match(/Thumb:\s*(https:\/\/[^\s]+)/i);

                const views = viewsMatch ? parseInt(viewsMatch[1]) : 0;
                const year = yearMatch ? yearMatch[1] : "2024";
                const thumbnail = thumbMatch ? thumbMatch[1].trim() : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                // Prevent duplicates in the live array
                if (!videos.some(v => v.id === videoId)) {
                    videos.push({
                        id: videoId,
                        title: lastTitle || "Expert Training Drill",
                        channel: lastChannel || "Elite Performance",
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        views,
                        year,
                        thumbnail,
                        audit: lastAudit || "Study this footage for technical precision."
                    });
                }
            }
        });

        // 3. CLEAN TEXT (Keep titles, remove metadata, audits, and graph tags for the bubble)
        let cleanedText = text;
        cleanedText = cleanedText.replace(/### (THE VISUAL MASTERCLASS|MEDIA & DRILLS|TRAINING RESOURCES)[:\s]*/gi, '');
        cleanedText = cleanedText.replace(/\[PHASE \d+\] [^:\n]+/gi, ''); // Scrub Phase headers
        cleanedText = cleanedText.replace(/\[GRAPH_FILE:\s*[^\]]+\]/gi, ''); // Scrub the graph tags

        cleanedText = cleanedText.split('\n').map(line => {
            // Remove "by [Channel Name] Audit: ..." from title lines in the bubble
            const titleRowMatch = line.match(/^(\d+\.\s+)?(?:\*\*)?([^*]+?)(?:\*\*)?\s+by\s+([^-:[\]]+?)(?:\s+Audit:|\s*\*Audit:\*|$)/i);
            if (titleRowMatch) {
                const numbering = titleRowMatch[1] || "";
                const title = titleRowMatch[2].trim();
                return `${numbering}**${title}**`;
            }
            return line;
        }).filter(line => {
            // Remove System Metadata, Link, and Audit lines
            const isScrubLine = /(youtube\.com|youtu\.be|\[System Metadata\]|\*Audit:\*|Views:|Year:|Thumb:|Link:)/i.test(line);
            return !isScrubLine;
        }).join('\n');

        return {
            cleanedText: cleanedText.trim() || text,
            videos
        };
    };

    // Initial greeting based on user sports
    useEffect(() => {
        if (messages.length === 0 && userData.username) {
            const sportText = userData.sports?.length > 0
                ? `Ready to hit the ${userData.sports[0]} court, ${userData.username}?`
                : `Welcome to the arena, ${userData.username}.`;

            setMessages([{
                role: 'assistant',
                content: `${sportText} I'm Alphonso, your AI performance mentor. What's our focus for today's training?`,
                timestamp: new Date()
            }]);
        }
    }, [userData]);

    // (Removed redundant loadHistory effect - now handled by Master Recovery)

    const [uploadProgress, setUploadProgress] = useState(0);

    const handleSend = async (e) => {
        e.preventDefault();
        if ((!input.trim() && !pendingFile) || isStreaming) return;

        // Resolve Session ID
        let activeSessionId = sessionId;
        if (!activeSessionId) {
            activeSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            setSessionId(activeSessionId);
        }

        // 1. Stage User Message (with attachment info if present)
        const contentWithFile = pendingFile
            ? `📎 [Attached: ${pendingFile.name}]\n${input}`
            : input;

        const userMsg = { role: 'user', content: contentWithFile, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);

        const currentInput = input;
        const currentFile = pendingFile;

        setInput('');
        setPendingFile(null); // Clear stage
        setIsStreaming(true);
        setUploadProgress(0); // Reset progress

        // Add a placeholder for the AI response
        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date(), isStreaming: true }]);

        try {
            // 2. Perform Direct File Upload if staged
            if (currentFile) {
                const { uploadStatsFile } = await import('../../services/api');
                // BTS: We use the new High-Performance Direct Stream protocol
                await uploadStatsFile(currentFile, activeSessionId, (progress) => {
                    setUploadProgress(progress);
                });
            }

            let fullResponse = "";
            const chatPromise = chatWithAi(currentInput || `I've uploaded ${currentFile.name}. Analyze it.`, activeSessionId, (chunk) => {
                if (chunk.type === 'content') {
                    fullResponse += chunk.chunk;
                    const { cleanedText, videos } = parseAlphonsoResponse(fullResponse);
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        lastMsg.content = cleanedText;
                        lastMsg.videos = videos.length > 0 ? videos : lastMsg.videos;
                        return newMsgs;
                    });
                } else if (chunk.type === 'image') {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        lastMsg.images = [...(lastMsg.images || []), chunk];
                        return newMsgs;
                    });
                } else if (chunk.type === 'error') {
                    throw new Error(chunk.message || "Agent execution failure.");
                } else if (chunk.type === 'status' && chunk.message) {
                    console.log(`[Subagent Status] ${chunk.message}`);
                }
            });

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("TIMEOUT")), 120000) // Increased to 2 mins for heavy analysis
            );

            try {
                await Promise.race([chatPromise, timeoutPromise]);
            } catch (err) {
                if (err.message === "TIMEOUT") {
                    console.warn("Safety timeout reached. Unlocking UI.");
                } else {
                    throw err;
                }
            }

        } catch (err) {
            console.error("Chat Error:", err);
            setMessages(prev => {
                const newMsgs = [...prev];
                // Update the placeholder with the error message
                newMsgs[newMsgs.length - 1] = {
                    role: 'assistant',
                    content: `🚨 Coach's Clipboard Error: ${err.message || "Unknown Connection Issue"}`,
                    isError: true,
                    timestamp: new Date()
                };
                return newMsgs;
            });
        } finally {
            setIsStreaming(false);
            setUploadProgress(0); // Reset for next turn
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPendingFile(file);
        }
        // Reset the input value so the same file can be picked again if removed
        e.target.value = '';
    };

    const handleNewChat = () => {
        setSessionId(null);
        setMessages([]);
        if (userData?.username) {
            localStorage.removeItem(`alphonso_sess_${userData.username}`);
        }
        localStorage.removeItem(`alphonso_sess_active`);
        setIsSidebarOpen(false);
    };

    const handleSessionSelect = (id) => {
        if (id === sessionId) {
            setIsSidebarOpen(false);
            return;
        }
        setSessionId(id);
        setMessages([]); // Clear current to trigger DB fetch
        setIsSidebarOpen(false);
    };

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden no-scrollbar-x">
            <SideBar
                userData={userData}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onLogout={onLogout}
                onNewChat={handleNewChat}
                onSessionSelect={handleSessionSelect}
                activeSessionId={sessionId}
            />

            <div className="flex-grow flex flex-col relative overflow-hidden h-full">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-8 border-b border-border bg-background/50 backdrop-blur-md z-10">
                    <button
                        className="md:hidden p-2 hover:bg-accent rounded-lg transition-colors mr-2"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <Menu size={24} className="text-muted-foreground" />
                    </button>
                    <div className="flex items-center gap-2">
                        {/* Dynamic Tier Badge */}
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-xl border text-[10px] font-black uppercase tracking-widest italic animate-in zoom-in duration-500 ${userData.tier === 'legend' ? 'bg-sport-accent/20 border-sport-accent text-sport-accent' :
                            userData.tier === 'elite' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                                userData.tier === 'prospect' ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' :
                                    'bg-muted/10 border-muted-foreground/20 text-muted-foreground'
                            }`}>
                            {(userData.tier === 'elite' || userData.tier === 'legend') && <Crown size={12} className="fill-current" />}
                            {userData.tier || 'Rookie'}
                        </div>

                        {userData.tier !== 'legend' && (
                            <button
                                onClick={() => navigate('/pricing')}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-sport)]/10 hover:bg-[var(--accent-sport)] border border-[var(--accent-sport)]/20 hover:text-black rounded-xl text-[var(--accent-sport)] text-sm font-black uppercase tracking-tighter transition-all active:scale-95"
                            >
                                <Lock size={16} />
                                {userData.tier === 'elite' ? 'Go Legend' : 'Unlock Elite'}
                            </button>
                        )}
                        <HeaderButton icon={<Share size={18} />} label="Share" />
                        <HeaderButton icon={<Star size={18} />} />
                        <HeaderButton icon={<MoreHorizontal size={18} />} />
                    </div>
                </header>

                {/* Chat Content */}
                <div className="flex-grow overflow-y-auto px-8 py-10 space-y-12 no-scrollbar overflow-x-hidden">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end pr-4' : 'flex-col space-y-8'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                            {msg.role === 'user' ? (
                                <div className="max-w-[70%] glass p-4 rounded-3xl flex items-center gap-4">
                                    <p className="text-foreground">{msg.content}</p>
                                    <div className="w-8 h-8 rounded-full bg-primary overflow-hidden flex-shrink-0">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.username}`} alt="user" />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-4 overflow-hidden">
                                    <div className="w-8 h-8 bg-foreground rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-white/10">
                                        <img src="/img/logo.png" alt="logo" className="w-full h-full rounded-full" />
                                    </div>
                                    <div className="space-y-6 flex-grow min-w-0 overflow-hidden">
                                        <div className="text-foreground prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50 overflow-x-hidden prose-pre:rounded-2xl max-w-none">
                                            {msg.content ? (
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            ) : (
                                                msg.isStreaming && (
                                                     <div className="flex flex-col gap-3 py-2">
                                                         {uploadProgress > 0 && uploadProgress < 100 && (
                                                             <div className="w-full max-w-[200px] space-y-2 animate-in fade-in duration-500">
                                                                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--accent-sport)]">
                                                                     <span>Streaming Tape</span>
                                                                     <span>{uploadProgress}%</span>
                                                                 </div>
                                                                 <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                                     <div 
                                                                         className="h-full bg-[var(--accent-sport)] shadow-[0_0_10px_var(--accent-sport)] transition-all duration-300 ease-out"
                                                                         style={{ width: `${uploadProgress}%` }}
                                                                     />
                                                                 </div>
                                                             </div>
                                                         )}
                                                         <div className="flex items-center gap-2">
                                                             <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--accent-sport)]"></div>
                                                             <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                                                                 {uploadProgress === 100 ? "Sync Complete. Deconstructing..." : "Coach is observing..."}
                                                             </span>
                                                         </div>
                                                     </div>
                                                 )
                                            )}
                                        </div>

                                        {/* Performance Graphs */}
                                        {msg.images && msg.images.length > 0 && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-8">
                                                {msg.images.map((img, i) => (
                                                    <div key={i} className="glass rounded-[32px] overflow-hidden border border-border/50 group cursor-zoom-in animate-in fade-in zoom-in duration-700">
                                                        <div className="bg-black/40 px-5 py-3 flex items-center justify-between border-b border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-sport)] shadow-[0_0_8px_var(--accent-sport)] animate-pulse" />
                                                                <span className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Analytical Deconstruction</span>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-white/20 italic">v2.5 Lab</span>
                                                        </div>
                                                        <div className="p-1">
                                                            <img
                                                                src={img.url ? img.url : (img.data?.startsWith('data:') ? img.data : `data:${img.mimeType || 'image/png'};base64,${img.data}`)}
                                                                alt="Performance Graph"
                                                                className="w-full h-auto rounded-[24px] transition-transform group-hover:scale-[1.02] duration-700"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {msg.videos && msg.videos.length > 0 && (
                                            <div className="w-full mt-5 space-y-1">
                                                {msg.videos.map((vid, i) => (
                                                    <YoutubeMediaRow
                                                        key={i}
                                                        title={vid.title}
                                                        channel={vid.channel}
                                                        url={vid.url}
                                                        views={vid.views || 0}
                                                        year={vid.year || "2024"}
                                                        thumbnail={vid.thumbnail}
                                                        audit={vid.audit}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSend} className="p-8 bg-gradient-to-t from-background via-background to-transparent relative">
                    <div className="max-w-4xl mx-auto flex flex-col gap-3">
                        {/* Staged File Preview */}
                        {pendingFile && (
                            <div className="flex items-center gap-3 self-start px-4 py-2 glass rounded-2xl border border-[var(--accent-sport)]/30 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="w-8 h-8 rounded-lg bg-[var(--accent-sport)]/20 flex items-center justify-center text-[var(--accent-sport)]">
                                    <FileText size={16} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-foreground truncate max-w-[200px]">{pendingFile.name}</span>
                                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Staged for sync</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPendingFile(null)}
                                    className="ml-2 p-1 hover:bg-white/10 rounded-full text-muted-foreground hover:text-foreground transition-all"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        <div className="glass rounded-[32px] p-2 flex items-center gap-2 focus-within:ring-2 ring-[var(--accent-sport)]/30 transition-all shadow-xl border border-border">
                            <button
                                type="button"
                                className="p-4 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => {
                                    if (userData?.tier === 'rookie') {
                                        alert("🚨 COACH'S CLIPBOARD: Advanced lab analysis and file syncing are reserved for our Elite and Legend athletes. Level up your membership to unlock the analytics scout.");
                                        return;
                                    }
                                    fileInputRef.current?.click();
                                }}
                            >
                                <Paperclip size={20} />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileUpload}
                                accept=".csv,.json,.txt,.pdf,.jpg,.png"
                            />
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Coach, how can I improve my vertical jump?"
                                className="flex-grow bg-transparent border-none text-foreground p-4 focus:outline-none placeholder:text-muted-foreground/30 font-medium"
                                disabled={isStreaming}
                            />
                            <div className="flex items-center gap-2 pr-2">
                                <button type="button" className="w-12 h-12 rounded-full hover:bg-accent flex items-center justify-center transition-all active:scale-95 text-muted-foreground hover:text-foreground">
                                    <Mic size={20} />
                                </button>
                                <button
                                    type="submit"
                                    disabled={isStreaming || !input.trim()}
                                    className="w-12 h-12 rounded-full bg-[var(--accent-sport)] flex items-center justify-center transition-all active:scale-95 text-black hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            <RightToolbar />
        </div>
    );
};


const HeaderButton = ({ icon, label }) => (
    <button className="flex items-center gap-2 px-4 py-2 hover:bg-accent rounded-xl text-muted-foreground hover:text-foreground text-sm font-medium transition-all">
        {icon}
        {label && <span>{label}</span>}
    </button>
);

export default ChatUI;