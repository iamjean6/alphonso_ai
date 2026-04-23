import React, { useState, useEffect, useRef } from 'react';
import SideBar from '../components/sidebar';
import RightToolbar from '../components/RightToolbar';
import YoutubeCard from '../components/youtubecard';
import { chatWithAi } from '../../services/api';
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
    Crown
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

    // PERSISTENCE RECOVERY: Load history on mount
    useEffect(() => {
        if (userData?.username) {
            const savedMessages = localStorage.getItem(`alphonso_msgs_${userData.username}`);
            const savedSessionId = localStorage.getItem(`alphonso_sess_${userData.username}`);
            
            if (savedMessages) {
                try {
                    const parsed = JSON.parse(savedMessages);
                    // Ensure timestamps are date objects
                    const hydrated = parsed.map(m => ({
                        ...m,
                        timestamp: new Date(m.timestamp)
                    }));
                    setMessages(hydrated);
                } catch (e) {
                    console.error("Failed to hydrate chat history:", e);
                }
            }
            
            if (savedSessionId) {
                setSessionId(savedSessionId);
            }
        }
    }, [userData]);

    // PERSISTENCE SYNC: Save on every update
    useEffect(() => {
        if (userData?.username && messages.length > 0) {
            localStorage.setItem(`alphonso_msgs_${userData.username}`, JSON.stringify(messages));
            if (sessionId) {
                localStorage.setItem(`alphonso_sess_${userData.username}`, sessionId);
            }
        }
    }, [messages, sessionId, userData]);

    // Auto-scroll to latest message
    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    /**
     * IRON-CLAD FUZZY SCRAPER
     * Now bracket-less compatible. Identifies patterns based on labels and flow.
     */
    const parseAlphonsoResponse = (text) => {
        if (!text) return { cleanedText: "", videos: [] };

        const videos = [];
        const seenIds = new Set();
        const lines = text.split('\n');

        lines.forEach(line => {
            // Find Video ID: The most reliable anchor
            const idMatch = line.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([0-9A-Za-z_-]{11})/i);

            if (idMatch) {
                const videoId = idMatch[1];

                if (seenIds.has(videoId)) return;
                seenIds.add(videoId);

                // 1. FUZZY TITLE: Match anything after a digit (1.) but before 'by', '-', or 'Link:'
                const titleMatch = line.match(/(?:\d+\.\s+)?(?:\[?([^\]\-]+)\]?)\s+(?:by|-|Link:)/i);
                let title = titleMatch ? titleMatch[1].trim() : "Expert Training Drill";
                if (title.startsWith('http')) title = "Expert Training Drill";

                // 2. FUZZY CHANNEL: Match text following 'by'
                const channelMatch = line.match(/by\s+([^-\[\(\s]+(?:\s+[^-\[\(\s]+)?)/i);
                const channel = channelMatch ? channelMatch[1].trim() : "Elite Performance";

                // 3. FUZZY VIEWS & YEAR
                const viewsMatch = line.match(/Views:?\s*\[?([\d.,\sBMK]+)\]?/i);
                const yearMatch = line.match(/Year:?\s*\[?(\d{4})\]?/i);

                let viewsRaw = viewsMatch ? viewsMatch[1].replace(/[^\d.BMK]/gi, '') : "0";
                let views = 0;
                if (viewsRaw.toLowerCase().includes('m')) views = parseFloat(viewsRaw) * 1000000;
                else if (viewsRaw.toLowerCase().includes('k')) views = parseFloat(viewsRaw) * 1000;
                else views = parseInt(viewsRaw.replace(/,/g, '')) || 0;

                const year = yearMatch ? yearMatch[1] : "2024";

                // 4. FUZZY THUMBNAIL
                const thumbMatch = line.match(/(?:Thumb:|thumbnail|-[^h]*):?\s*\[?([-!]*\s*https?:\/\/[^\s\)]+\.(?:jpg|png|webp|jpeg)[^\s]*)/i);
                const thumbnail = thumbMatch ? thumbMatch[1].replace(/^[-!]*\s*/, '').trim() : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                videos.push({
                    id: videoId,
                    title,
                    channel,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    views,
                    year,
                    thumbnail,
                });
            }
        });

        let cleanedText = text;
        cleanedText = cleanedText.replace(/### (THE VISUAL MASTERCLASS|MEDIA & DRILLS|TRAINING RESOURCES)[:\s]*/gi, '');

        // Scrub metadata and raw links to keep the bubble clean
        cleanedText = cleanedText.split('\n').filter(line => {
            const isVideoMeta = /(youtube\.com|youtu\.be|Views:|Year:|Thumb:|Link:)/i.test(line);
            return !isVideoMeta;
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

        // Add a placeholder for the AI response
        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date(), isStreaming: true }]);

        try {
            // 2. Perform File Upload if staged
            if (currentFile) {
                const { uploadStatsFile } = await import('../../services/api');
                await uploadStatsFile(currentFile, activeSessionId);
            }

            let fullResponse = "";
            await chatWithAi(currentInput || `I've uploaded ${currentFile.name}. Analyze it.`, activeSessionId, (chunk) => {
                if (chunk.type === 'content') {
                    fullResponse += chunk.chunk;

                    // Parse text and extract videos
                    const { cleanedText, videos } = parseAlphonsoResponse(fullResponse);

                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        lastMsg.content = cleanedText;
                        lastMsg.videos = videos.length > 0 ? videos : lastMsg.videos;
                        return newMsgs;
                    });
                } else if (chunk.type === 'tool_result' && chunk.tool === 'youtube_search') {
                    // Fallback for explicit tool results
                    const toolVideos = (chunk.output || []).map(v => ({
                        ...v,
                        rating: v.rating || "9.2",
                        year: v.year || "2024"
                    }));

                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        lastMsg.videos = [...(lastMsg.videos || []), ...toolVideos];
                        return newMsgs;
                    });
                }
            });

        } catch (err) {
            console.error("Chat Error:", err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `🚨 Coach's Clipboard Error: ${err.message || "Unknown Connection Issue"}`,
                isError: true
            }]);
        }

        finally {
            setIsStreaming(false);
            setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].isStreaming = false;
                return newMsgs;
            });
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

    const handleNewSession = () => {
        if (userData?.username) {
            localStorage.removeItem(`alphonso_msgs_${userData.username}`);
            localStorage.removeItem(`alphonso_sess_${userData.username}`);
            setMessages([]);
            setSessionId(null);
            window.location.reload(); // Hard reset for freshness
        }
    };

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden no-scrollbar-x">
            <SideBar
                userData={userData}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onLogout={onLogout}
                onNewChat={handleNewSession}
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

                    <div className="flex items-center gap-3">
                        <span className="text-muted-foreground font-medium hidden sm:inline">Personal Coaching Hub</span>
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <Sparkles size={16} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        {userData.isPro ? (
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 text-xs font-black uppercase tracking-widest italic animate-in zoom-in duration-500">
                                <Crown size={14} className="fill-amber-500" />
                                Pro Athlete
                            </div>
                        ) : (
                            <button 
                                onClick={() => navigate('/pricing')}
                                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-sport)]/10 hover:bg-[var(--accent-sport)] border border-[var(--accent-sport)]/20 hover:text-black rounded-xl text-[var(--accent-sport)] text-sm font-black uppercase tracking-tighter transition-all active:scale-95"
                            >
                                <Sparkles size={16} />
                                Unlock Elite
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
                                        <div className="w-4 h-4 bg-background rounded-sm rotate-45" />
                                    </div>
                                    <div className="space-y-6 flex-grow min-w-0 overflow-hidden">
                                        <div className="text-foreground prose prose-invert prose-p:leading-relaxed prose-pre:bg-black/50 overflow-x-hidden prose-pre:rounded-2xl max-w-none">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.content || (msg.isStreaming ? "..." : "")}
                                            </ReactMarkdown>
                                        </div>

                                        {msg.videos && msg.videos.length > 0 && (
                                            <div className="w-full max-w-full relative mt-6 group overflow-hidden rounded-[32px] min-w-0">
                                                {/* Carousel Controls */}
                                                <button
                                                    onClick={() => {
                                                        const el = document.getElementById(`carousel-${idx}`);
                                                        el?.scrollBy({ left: -400, behavior: 'smooth' });
                                                    }}
                                                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass border border-white/20 flex items-center justify-center text-foreground z-20 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 shadow-2xl"
                                                >
                                                    <ChevronLeft size={20} />
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        const el = document.getElementById(`carousel-${idx}`);
                                                        el?.scrollBy({ left: 400, behavior: 'smooth' });
                                                    }}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass border border-white/20 flex items-center justify-center text-foreground z-20 opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 shadow-2xl"
                                                >
                                                    <ChevronRight size={20} />
                                                </button>

                                                <div
                                                    id={`carousel-${idx}`}
                                                    className="flex gap-6 overflow-x-auto pb-6 no-scrollbar scroll-smooth px-2"
                                                >
                                                    {msg.videos.map((vid, i) => (
                                                        <YoutubeCard
                                                            key={i}
                                                            number={i + 1}
                                                            title={vid.title}
                                                            url={vid.url}
                                                            views={vid.views || 0}
                                                            year={vid.year || "2024"}
                                                            thumbnail={vid.thumbnail}
                                                        />
                                                    ))}
                                                </div>
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
                                onClick={() => fileInputRef.current?.click()}
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