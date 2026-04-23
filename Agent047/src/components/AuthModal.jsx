import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, X, AlertCircle } from 'lucide-react';
import { login, register } from '../../services/api';

const AuthModal = ({ isOpen, onClose, onSuccess, initialUsername }) => {
    const [isLogin, setIsLogin] = useState(false); // Default to signup for onboarding flow
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        username: initialUsername || ''
    });

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            let response;
            if (isLogin) {
                response = await login(formData.email, formData.password);
            } else {
                response = await register(formData.email, formData.password, formData.username);
            }

            if (response.token) {
                onSuccess(response.user);
                console.log(response.token)
            }
        } catch (err) {
            setError(err.response?.data?.message || "Authentication failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-md glass p-10 rounded-[32px] border border-border animate-in fade-in zoom-in duration-300">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-3xl font-bold mb-2 text-foreground text-center">
                    {isLogin ? "Welcome" : "Create"} <span className="text-[var(--accent-sport)]">Account</span>
                </h2>
                <p className="text-white text-center mb-8 italic text-lg">
                    {isLogin ? "Sign in to continue your training." : "Almost there! Save your profile to begin."}
                </p>

                {error && (
                    <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-center gap-3 text-destructive text-sm animate-in shake duration-300">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div className="space-y-1">
                            <label className="text-lg font-medium text-white ml-1">Username</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                                <input
                                    type="text"
                                    required
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full bg-accent/5 border border-border rounded-2xl py-3 pl-11 pr-4 text-foreground outline-none focus:border-[var(--accent-sport)]/50 transition-all"
                                    placeholder="Enter your name"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-lg font-medium text-white ml-1">Email Address</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full bg-accent/5 border border-border rounded-2xl py-3 pl-11 pr-4 text-foreground outline-none focus:border-[var(--accent-sport)]/50 transition-all"
                                placeholder="coach@alphonso.ai"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-lg font-medium text-white ml-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <input
                                type="password"
                                required
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-accent/5 border border-border rounded-2xl py-3 pl-11 pr-4 text-foreground outline-none focus:border-[var(--accent-sport)]/50 transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-lg font-bold bg-[var(--accent-sport)] text-black hover:scale-[1.02] transition-all shadow-lg active:scale-95 disabled:opacity-50 mt-4"
                    >
                        {loading ? "PROCESSING..." : isLogin ? "LOG IN" : "REGISTER"} <ArrowRight size={20} />
                    </button>
                </form>

                <p className="text-center mt-6 text-lg text-white">
                    {isLogin ? "Don't have an account?" : "Already an athlete?"}{" "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-[var(--accent-sport)] font-bold hover:underline"
                    >
                        {isLogin ? "Sign Up" : "Log In"}
                    </button>
                </p>
            </div>
        </div>
    );
};

export default AuthModal;
