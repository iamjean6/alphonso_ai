import React, { useState, useEffect, useRef, useCallback } from 'react';
import SideBar from '../components/sidebar';
import RightToolbar from '../components/RightToolbar';
import YoutubeMediaRow from '../components/YoutubeMediaRow';
import { chatWithAi, getSessionMessages, connectGoogleCalendar, cancelSession, toggleStarSession } from '../../services/api';
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
    Calendar,
    CheckCircle2,
    AlertCircle,
    X,
    Copy,
    Check,
    Square
} from 'lucide-react';

const ChatUI = ({ userData, onLogout }) => {
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [activeMode, setActiveMode] = useState('research'); // 'research' vs 'workout'
    const [isStreaming, setIsStreaming] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [pendingFile, setPendingFile] = useState(null); // Stage file for combined send
    const [copiedMessageId, setCopiedMessageId] = useState(null);
    const [refreshSidebarToggle, setRefreshSidebarToggle] = useState(false);

    const handleCopy = (content, messageId) => {
        navigator.clipboard.writeText(content);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
    };
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const abortControllerRef = useRef(null);

    // Share & Favorites State
    const [isShared, setIsShared] = useState(false);
    const [isStarred, setIsStarred] = useState(false);

    // Reset star state on new chat
    useEffect(() => {
        if (!sessionId) {
            setIsStarred(false);
        }
    }, [sessionId]);

    const handleShare = () => {
        if (!sessionId) {
            alert("Please start a session first!");
            return;
        }
        navigator.clipboard.writeText(`${window.location.origin}/chat/${sessionId}`);
        setIsShared(true);
        setTimeout(() => setIsShared(false), 2000);
    };

    const handleStar = async () => {
        if (!sessionId) {
            alert("Please start a session first to favorite it!");
            return;
        }
        const newValue = !isStarred;
        setIsStarred(newValue); // Optimistic update
        
        try {
            await toggleStarSession(sessionId, newValue);
            setRefreshSidebarToggle(prev => !prev); // Refresh Sidebar Library
        } catch (err) {
            console.error("Failed to update favorite status", err);
            setIsStarred(!newValue); // Revert on fail
        }
    };

    const handleCancel = async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsStreaming(false);
        setUploadProgress(0);
        setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg && lastMsg.role === 'ai') {
                lastMsg.content = (lastMsg.content || "") + "\n\n> ⚠️ *Generation interrupted by user*";
            }
            return newMsgs;
        });

        if (sessionId) {
            try {
                await cancelSession(sessionId);
            } catch (err) {
                console.error("Failed to signal backend to cancel session:", err);
            }
        }
    };

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
                    const data = await getSessionMessages(activeId);
                    const history = data.messages || [];
                    if (history && history.length > 0) {
                        const hydrated = history.map(m => ({
                            ...m,
                            timestamp: new Date(m.timestamp)
                        }));
                        setMessages(hydrated);
                    }
                    if (data.activeFlow) {
                        setActiveMode(data.activeFlow);
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
    const [agentStatus, setAgentStatus] = useState("Coach is observing...");
    const isSendingRef = useRef(false);

    const handleSend = useCallback(async (submittedText) => {
        if ((!submittedText.trim() && !pendingFile) || isStreaming || isSendingRef.current) return;
        isSendingRef.current = true;

        // Resolve Session ID
        let activeSessionId = sessionId;
        if (!activeSessionId) {
            activeSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            setSessionId(activeSessionId);
        }

        // 1. Stage User Message (with attachment info if present)
        const contentWithFile = pendingFile
            ? `📎 [Attached: ${pendingFile.name}]\n${submittedText}`
            : submittedText;

        const userMsg = { role: 'user', content: contentWithFile, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);

        const currentInput = submittedText;
        const currentFile = pendingFile;

        setPendingFile(null); // Clear stage
        setIsStreaming(true);
        setUploadProgress(0); // Reset progress
        setAgentStatus("Coach is observing...");

        abortControllerRef.current = new AbortController();

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
                    setAgentStatus(chunk.message);
                }
            }, activeMode, abortControllerRef.current);

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
                // Format user-friendly error message
                const isTimeout = err.message === "TIMEOUT";
                const friendlyMessage = isTimeout 
                    ? "⏱️ **Shot Clock Violation:** Alphonso took too long to analyze this play. Please try breaking your request into smaller pieces."
                    : "🚨 **Coach's Clipboard Error:** Alphonso encountered a temporary issue processing your request. Please try again.";

                newMsgs[newMsgs.length - 1] = {
                    role: 'assistant',
                    content: friendlyMessage,
                    isError: true,
                    timestamp: new Date()
                };
                return newMsgs;
            });
        } finally {
            abortControllerRef.current = null;
            setIsStreaming(false);
            isSendingRef.current = false;
            setUploadProgress(0); // Reset for next turn
            setRefreshSidebarToggle(prev => !prev);
        }
    }, [sessionId, pendingFile, isStreaming, activeMode]);

    const triggerWorkflowAction = async (actionMsg, targetFlow = null) => {
        if (isStreaming || isSendingRef.current) return;
        isSendingRef.current = true;

        // Stage user message locally in UI
        const userMsg = { role: 'user', content: actionMsg, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);

        // Resolve Session ID
        let activeSessionId = sessionId;
        if (!activeSessionId) {
            activeSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            setSessionId(activeSessionId);
        }

        if (targetFlow) {
            setActiveMode(targetFlow);
        }

        setIsStreaming(true);
        setUploadProgress(0);
        setAgentStatus("Coach is observing...");

        abortControllerRef.current = new AbortController();

        // Add a placeholder for AI response
        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date(), isStreaming: true }]);

        try {
            let fullResponse = "";
            const currentFlowState = targetFlow || activeMode;
            const chatPromise = chatWithAi(actionMsg, activeSessionId, (chunk) => {
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
                    setAgentStatus(chunk.message);
                }
            }, currentFlowState, abortControllerRef.current);

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("TIMEOUT")), 120000)
            );

            await Promise.race([chatPromise, timeoutPromise]);

        } catch (err) {
            console.error("Workflow Action Error:", err);
            setMessages(prev => {
                const isTimeout = err.message === "TIMEOUT";
                const friendlyMessage = isTimeout 
                    ? "⏱️ **Shot Clock Violation:** Alphonso took too long to execute this workflow."
                    : "🚨 **Coach's Clipboard Error:** Alphonso encountered a temporary issue. Please try again.";

                newMsgs[newMsgs.length - 1] = {
                    role: 'assistant',
                    content: friendlyMessage,
                    isError: true,
                    timestamp: new Date()
                };
                return newMsgs;
            });
        } finally {
            abortControllerRef.current = null;
            setIsStreaming(false);
            isSendingRef.current = false;
            setUploadProgress(0);
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

    const handleSessionSelect = async (id) => {
        if (id === sessionId) {
            setIsSidebarOpen(false);
            return;
        }
        setSessionId(id);
        setMessages([]); // Clear current while loading
        setIsSidebarOpen(false);

        try {
            const data = await getSessionMessages(id);
            const history = data.messages || [];
            if (history && history.length > 0) {
                const hydrated = history.map(m => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                }));
                setMessages(hydrated);
            }
            if (data.activeFlow) {
                setActiveMode(data.activeFlow);
            }
            if (data.isStarred !== undefined) {
                setIsStarred(data.isStarred);
            }
        } catch (err) {
            console.error("Failed to fetch session messages on click:", err);
        }
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
                refreshToggle={refreshSidebarToggle}
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
                    <div className="flex items-center gap-2 md:w-full">
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
                        <HeaderButton
                            icon={isShared ? <CheckCircle2 size={18} /> : <Share size={18} />}
                            label={isShared ? "Copied!" : "Share"}
                            onClick={handleShare}
                            isActive={isShared}
                        />
                        <HeaderButton
                            icon={<Star size={18} className={isStarred ? "fill-[var(--accent-sport)] text-[var(--accent-sport)]" : ""} />}
                            onClick={handleStar}
                            isActive={isStarred}
                        />
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
                                                <div className="relative group/message pb-4">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                    <button
                                                        onClick={() => handleCopy(msg.content, msg._id || idx)}
                                                        className="absolute bottom-0 right-0 p-1.5 bg-sidebar/80 backdrop-blur-md hover:bg-sidebar-accent rounded-lg transition-all flex items-center justify-center border border-white/10 shadow-lg"
                                                        title="Copy message"
                                                    >
                                                        {copiedMessageId === (msg._id || idx) ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-muted-foreground hover:text-foreground" />}
                                                    </button>
                                                </div>
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
                                                                {uploadProgress === 100 ? "Sync Complete. Deconstructing..." : agentStatus}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>

                                        {msg.pdfUrl && (
                                            <div className="my-6 glass p-6 rounded-[28px] border border-blue-500/30 flex items-center justify-between gap-4 animate-in fade-in zoom-in duration-500 bg-gradient-to-r from-blue-900/20 via-black/40 to-transparent shadow-[0_10px_30px_rgba(59,130,246,0.15)]">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                                        <FileText size={24} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white tracking-wide uppercase">Personalized Workout Syllabus</h4>
                                                        <p className="text-xs text-muted-foreground mt-0.5">High-fidelity printable PDF compiled by Alphonso Lab</p>
                                                    </div>
                                                </div>
                                                <a
                                                    href={msg.pdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                                                >
                                                    <Share size={16} /> Open Document
                                                </a>
                                            </div>
                                        )}



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
                <div className="flex flex-col items-center w-full">
                    <MemoizedChatInputBar
                        onSendMessage={handleSend}
                        isStreaming={isStreaming}
                        pendingFile={pendingFile}
                        onClearPendingFile={() => setPendingFile(null)}
                        fileInputRef={fileInputRef}
                        onFileUpload={handleFileUpload}
                        userData={userData}
                        activeMode={activeMode}
                        onModeChange={setActiveMode}
                        onCancel={handleCancel}
                    />
                </div>
            </div>

            <RightToolbar userData={userData} />
        </div>
    );
};

const MemoizedChatInputBar = React.memo(({ onSendMessage, isStreaming, pendingFile, onClearPendingFile, fileInputRef, onFileUpload, userData, activeMode, onModeChange, onCancel }) => {
    const [localInput, setLocalInput] = useState('');
    const textareaRef = useRef(null);

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        if ((!localInput.trim() && !pendingFile) || isStreaming) return;
        onSendMessage(localInput);
        setLocalInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset height after submission
        }
    };

    const handleKeyDown = (e) => {
        // Submit on Enter, unless Shift is held down
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleInput = (e) => {
        setLocalInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
    };
    const getLimits = (tier) => {
        const t = (tier || 'rookie').toLowerCase();
        if (t === 'rookie') return 3;
        if (t === 'prospect') return 10;
        if (t === 'elite') return 20;
        return Infinity;
    };
    const isLimitReached = (userData?.chatsToday || 0) >= getLimits(userData?.tier);

    return (
        <form onSubmit={(e) => {
            if (isLimitReached) {
                e.preventDefault();
                alert("You've reached your daily energy limit! Upgrade to a higher tier to keep training.");
                return;
            }
            handleSubmit(e);
        }} className="w-full p-8 bg-gradient-to-t from-background via-background to-transparent relative">
            <div className="w-full mx-auto flex flex-col gap-3">
                {/* Premium Flow Mode Selector */}
                <div className="flex items-center gap-2 px-4 py-1.5 self-center glass rounded-full border border-border/50 text-xs font-semibold mb-1 shadow-lg bg-black/40 backdrop-blur-md">
                    <button
                        type="button"
                        onClick={() => onModeChange('research')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all ${activeMode === 'research' ? 'bg-[var(--accent-sport)] text-black font-bold shadow-[0_0_15px_rgba(219,255,0,0.5)]' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <Sparkles size={14} />
                        <span>Research Scout</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (userData?.tier === 'rookie' || userData?.tier === 'prospect') {
                                alert("🚨 ELITE ONLY: Workout Planning and Scheduling is reserved for our Elite and Legend athletes. Upgrade to unlock this flow.");
                                return;
                            }
                            onModeChange('workout')
                        }}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-all ${activeMode === 'workout' ? 'bg-[var(--accent-sport)] text-black font-bold shadow-[0_0_15px_rgba(219,255,0,0.5)]' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <Calendar size={14} />
                        <span>Plan Workout & Schedule</span>
                    </button>
                </div>

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
                            onClick={onClearPendingFile}
                            className="ml-2 p-1 hover:bg-white/10 rounded-full text-muted-foreground hover:text-foreground transition-all"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                <div className={`glass rounded-[32px] p-2 flex items-center gap-2 focus-within:ring-2 ring-[var(--accent-sport)]/30 transition-all shadow-xl border ${isLimitReached ? 'border-red-500/50 bg-red-500/5' : 'border-border'}`}>
                    <button
                        type="button"
                        className="p-4 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        disabled={isLimitReached}
                        onClick={() => {
                            if (isLimitReached) return;
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
                        onChange={onFileUpload}
                        accept=".csv,.json,.txt,.pdf,.jpg,.png"
                    />
                    <textarea
                        ref={textareaRef}
                        value={localInput}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder={isLimitReached ? "Daily limit reached. Upgrade to continue." : "How can I improve my vertical jump?"}
                        className="flex-grow bg-transparent border-none text-foreground p-4 focus:outline-none placeholder:text-muted-foreground/30 font-medium resize-none min-h-[56px] max-h-[200px] overflow-y-auto disabled:opacity-50"
                        disabled={isStreaming || isLimitReached}
                        rows={1}
                        style={{ height: 'auto' }}
                    />
                    <div className="flex items-center gap-2 pr-2">
                        <button type="button" disabled={isLimitReached} className="w-12 h-12 rounded-full hover:bg-accent flex items-center justify-center transition-all active:scale-95 text-muted-foreground hover:text-foreground disabled:opacity-50">
                            <Mic size={20} />
                        </button>
                        {isStreaming ? (
                            <button
                                type="button"
                                onClick={onCancel}
                                className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center transition-all active:scale-95 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 animate-in zoom-in-50 duration-200"
                                title="Stop Generating"
                            >
                                <Square size={16} className="fill-current" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={isLimitReached || (!localInput.trim() && !pendingFile)}
                                className="w-12 h-12 rounded-full bg-[var(--accent-sport)] flex items-center justify-center transition-all active:scale-95 text-black hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 animate-in zoom-in-50 duration-200"
                            >
                                <Send size={20} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </form>
    );
});

const HeaderButton = ({ icon, label, onClick, isActive }) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-center gap-2 md:flex-1 px-4 py-2 hover:bg-accent rounded-xl text-sm font-medium transition-all active:scale-95 ${isActive ? 'text-[var(--accent-sport)] bg-[var(--accent-sport)]/10' : 'text-muted-foreground hover:text-foreground'}`}
    >
        {icon}
        {label && <span>{label}</span>}
    </button>
);

export default ChatUI;