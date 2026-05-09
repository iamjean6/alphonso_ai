import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register, requestOTP, checkUsername } from '../../../services/api';
import { RingLoader } from 'react-spinners';

const SignupPage = ({ onSuccess, initialData = {} }) => {
    const [step, setStep] = useState(1); // 1: Info, 2: OTP
    const [formData, setFormData] = useState({
        username: initialData.username || '',
        email: '',
        password: '',
        otp: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [usernameStatus, setUsernameStatus] = useState({ available: null, checking: false });
    const navigate = useNavigate();

    // Real-time username check
    useEffect(() => {
        if (formData.username.length < 3) {
            setUsernameStatus({ available: null, checking: false });
            return;
        }

        const timer = setTimeout(async () => {
            setUsernameStatus(prev => ({ ...prev, checking: true }));
            try {
                const { available } = await checkUsername(formData.username);
                setUsernameStatus({ available, checking: false });
            } catch (err) {
                setUsernameStatus({ available: null, checking: false });
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.username]);

    const handleRequestOTP = async (e) => {
        e.preventDefault();
        if (usernameStatus.available === false) {
            setError('Username is already taken.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            await requestOTP(formData.email);
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send verification code.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const data = await register(formData);
            if (onSuccess) {
                // Pass the new user AND the local profile data we collected
                await onSuccess(data.user, {
                    height: initialData.height,
                    weight: initialData.weight,
                    sports: initialData.sports
                });
            }
            navigate('/chat');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full space-y-8 bg-surface p-10 rounded-2xl border border-border shadow-2xl">
                <div className="text-center">
                    <h2 className="text-4xl font-black tracking-tighter text-foreground uppercase">
                        Join the <span className="text-[var(--accent-sport)]">Elite</span>
                    </h2>
                    <p className="mt-2 text-muted-foreground italic">
                        {step === 1 ? 'Start your performance journey.' : 'Verify your email address.'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-lg text-sm text-center">
                        {error}
                    </div>
                )}

                {step === 1 ? (
                    <form className="mt-8 space-y-6" onSubmit={handleRequestOTP}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Username
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-[var(--accent-sport)] outline-none transition-all"
                                        placeholder="EliteAthlete"
                                    />
                                    {usernameStatus.checking && (
                                        <div className="absolute right-3 top-3"><RingLoader size={20} color="var(--accent-sport)" /></div>
                                    )}
                                    {usernameStatus.available === true && !usernameStatus.checking && (
                                        <div className="absolute right-3 top-3 text-green-500 text-xs font-bold uppercase mt-1">Available</div>
                                    )}
                                    {usernameStatus.available === false && !usernameStatus.checking && (
                                        <div className="absolute right-3 top-3 text-red-500 text-xs font-bold uppercase mt-1">Taken</div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-[var(--accent-sport)] outline-none transition-all"
                                    placeholder="pro@alphonso.ai"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-[var(--accent-sport)] outline-none transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || usernameStatus.available === false}
                            className="w-full py-4 bg-[var(--accent-sport)] text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <RingLoader size={20} color="#000" /> : 'GET VERIFIED'}
                        </button>
                    </form>
                ) : (
                    <form className="mt-8 space-y-6" onSubmit={handleSignup}>
                        <div className="text-center space-y-4">
                            <p className="text-sm text-muted-foreground">
                                We sent a 6-digit code to <span className="text-foreground font-bold">{formData.email}</span>.
                                It expires in 60 seconds.
                            </p>
                            <input
                                type="text"
                                required
                                maxLength={6}
                                value={formData.otp}
                                onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                                className="w-full px-4 py-6 bg-background border-2 border-border rounded-xl focus:border-[var(--accent-sport)] text-4xl text-center font-black tracking-[1rem] outline-none transition-all"
                                placeholder="000000"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || formData.otp.length < 6}
                            className="w-full py-4 bg-[var(--accent-sport)] text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <RingLoader size={20} color="#000" /> : 'COMPLETE SIGNUP'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Change Email or Username
                        </button>
                    </form>
                )}

                <div className="text-center mt-6">
                    <p className="text-muted-foreground">
                        Already have an account?{' '}
                        <Link to="/login" className="text-[var(--accent-sport)] font-bold hover:underline">
                            Login here
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SignupPage;
