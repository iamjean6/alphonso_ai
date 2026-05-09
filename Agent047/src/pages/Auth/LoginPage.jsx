import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login as loginApi } from '../../../services/api';
import { RingLoader } from 'react-spinners';

const LoginPage = ({ onSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const data = await loginApi({ email, password });
            if (onSuccess) {
                await onSuccess(data.user);
            }
            navigate('/chat');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full space-y-8 bg-surface p-10 rounded-2xl border border-border shadow-2xl">
                <div className="text-center">
                    <h2 className="text-4xl font-black tracking-tighter text-foreground uppercase">
                        Welcome <span className="text-[var(--accent-sport)]">Back</span>
                    </h2>
                    <p className="mt-2 text-muted-foreground italic">Resume your elite training session.</p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                Email or Username
                            </label>
                            <input
                                type="text"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-[var(--accent-sport)] focus:border-transparent outline-none transition-all"
                                placeholder="athlete@alphonso.ai"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-[var(--accent-sport)] focus:border-transparent outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-[var(--accent-sport)] text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <RingLoader size={20} color="#000" /> : 'ENTER ARENA'}
                    </button>

                    <div className="text-center mt-6">
                        <p className="text-muted-foreground">
                            New athlete?{' '}
                            <Link to="/signup" className="text-[var(--accent-sport)] font-bold hover:underline">
                                Sign up for elite access
                            </Link>
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
