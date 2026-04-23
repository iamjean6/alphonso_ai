import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Zap, Trophy, Crown, ShieldCheck, ChevronLeft, Globe, Loader2 } from 'lucide-react';

const PricingPage = () => {
    const navigate = useNavigate();
    const [currency, setCurrency] = useState('USD');
    const [rates, setRates] = useState({ USD: 1, KES: 135, EUR: 0.92, GBP: 0.78 });
    const [loadingRates, setLoadingRates] = useState(true);

    useEffect(() => {
        const fetchRates = async () => {
            try {
                const response = await fetch('https://open.er-api.com/v6/latest/USD');
                const data = await response.json();
                if (data && data.rates) {
                    setRates(prev => ({
                        ...prev,
                        USD: 1,
                        KES: data.rates.KES || 135,
                        EUR: data.rates.EUR || 0.92,
                        GBP: data.rates.GBP || 0.78
                    }));
                }
            } catch (err) {
                console.error("Failed to fetch live rates, falling back to cached constants.", err);
            } finally {
                setLoadingRates(false);
            }
        };
        fetchRates();
    }, []);

    const formatPrice = (usdPrice) => {
        if (usdPrice === '0') return '0';
        const price = parseFloat(usdPrice) * rates[currency];
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(price).replace(/[A-Z]{3}/, '').trim(); // Custom cleaning for the audit UI
    };

    const getSymbol = (curr) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: curr,
        }).format(0).replace(/[0-9\s.,]/g, '');
    };

    const plans = [
        {
            id: 'rookie',
            name: 'Rookie',
            priceUSD: '0',
            icon: <Zap className="w-10 h-10 text-blue-400" />,
            features: ['2 Technical Audits', 'Standard Memory', 'Community Support'],
            buttonText: 'Get Started',
            color: 'blue'
        },
        {
            id: 'prospect',
            name: 'Prospect',
            priceUSD: '5',
            icon: <Trophy className="w-10 h-10 text-emerald-400" />,
            features: ['50 Technical Audits', 'Deep Memory Bank', 'HD Media Scouting', 'Priority Queue'],
            buttonText: 'Upgrade to Prospect',
            color: 'emerald'
        },
        {
            id: 'elite',
            name: 'Elite',
            priceUSD: '10',
            icon: <Crown className="w-10 h-10 text-amber-500" />,
            features: ['Unlimited Audits', 'Legendary Memory', 'Visual Masterclasses', 'Direct AI Coaching', 'CSV/JSON Analytics'],
            buttonText: 'Go Elite',
            color: 'amber',
            popular: true
        },
        {
            id: 'legend',
            name: 'Legend',
            priceUSD: '15',
            icon: <ShieldCheck className="w-10 h-10 text-purple-400" />,
            features: ['Full Legacy Vault', 'Multi-sport Sync', 'Alpha Access to New Tools', 'White-glove Support'],
            buttonText: 'Become a Legend',
            color: 'purple'
        }
    ];

    const handleSelectPlan = (plan) => {
        if (plan.id === 'rookie') {
            navigate('/chat');
            return;
        }
        navigate(`/checkout/${plan.id}?currency=${currency}`);
    };

    return (
        <div className="min-h-screen bg-background p-8 md:p-16 flex flex-col font-sans no-scrollbar overflow-y-auto">
            {/* Header Area */}
            <div className="max-w-7xl mx-auto w-full flex justify-between items-start mb-16">
                <div>
                    <button
                        onClick={() => navigate('/chat')}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all mb-6 uppercase text-xs font-black tracking-widest italic"
                    >
                        <ChevronLeft size={16} /> Return to Arena
                    </button>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic leading-none">
                        Elite <span className="text-accent-sport">Memberships</span>
                    </h1>
                    <p className="text-xl text-muted-foreground mt-4 max-w-2xl font-medium">
                        Invest in your legacy. Unlock high-intelligence athletic deconstruction and unlimited coaching sessions.
                    </p>
                </div>

                {/* Currency Selector */}
                <div className="glass p-4 rounded-2xl border border-border flex items-center gap-4">
                    <Globe className="w-5 h-5 text-accent-sport" />
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Select Currency</span>
                        <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="bg-transparent text-lg font-bold border-none focus:outline-none cursor-pointer pr-4"
                            disabled={loadingRates}
                        >
                            {Object.keys(rates).map(c => (
                                <option key={c} value={c} className="bg-background">{c}</option>
                            ))}
                        </select>
                    </div>
                    {loadingRates && <Loader2 className="w-4 h-4 text-accent-sport animate-spin" />}
                </div>
            </div>

            {/* Grid Area */}
            <div className="max-w-7xl mx-auto w-full grid grid-cols-2 lg:grid-cols-4 gap-8 mb-24">
                {plans.map((plan) => (
                    <div
                        key={plan.id}
                        className={`relative group p-8 rounded-[40px] border-2 flex flex-col transition-all duration-500 hover:scale-[1.03]
                            ${plan.popular ? 'bg-secondary/40 border-amber-500 shadow-2xl shadow-amber-500/10' : 'bg-secondary/20 border-border hover:border-accent-sport/40'}
                        `}
                    >
                        {plan.popular && (
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-amber-500 text-black px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest italic shadow-lg">
                                Master's Choice
                            </div>
                        )}

                        <div className="mb-8">{plan.icon}</div>
                        <h3 className="text-2xl font-black uppercase tracking-tight italic">{plan.name}</h3>

                        <div className="flex items-baseline gap-2 mt-4 mb-8">
                            <span className="text-5xl font-black tabular-nums tracking-tighter">
                                {plan.priceUSD === '0' ? 'FREE' : formatPrice(plan.priceUSD)}
                            </span>
                            {plan.priceUSD !== '0' && (
                                <span className="text-muted-foreground font-bold uppercase text-xs tracking-widest mb-1">/mo</span>
                            )}
                        </div>

                        <div className="flex-1 space-y-4 mb-10">
                            {plan.features.map((f, i) => (
                                <div key={i} className="flex gap-3 text-sm font-medium">
                                    <Check className={`w-5 h-5 shrink-0 text-${plan.color}-400`} />
                                    <span className="text-foreground/80 leading-tight">{f}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => handleSelectPlan(plan)}
                            className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-sm italic transition-all active:scale-95
                                ${plan.popular
                                    ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-xl shadow-amber-500/20'
                                    : 'bg-foreground text-background hover:bg-accent-sport hover:text-black'
                                }
                            `}
                        >
                            {plan.buttonText}
                        </button>
                    </div>
                ))}
            </div>

            {/* Bottom Proof */}
            <div className="max-w-4xl mx-auto w-full text-center py-12 border-t border-border/30">
                <p className="text-muted-foreground uppercase text-xs font-black tracking-[0.3em] mb-4">Trusted by elite performers globally</p>
                <div className="flex justify-center gap-12 opacity-30 grayscale contrast-125">
                    <span className="font-black italic text-2xl tracking-tighter">NIKE</span>
                    <span className="font-black italic text-2xl tracking-tighter">ADIDAS</span>
                    <span className="font-black italic text-2xl tracking-tighter">UFC</span>
                    <span className="font-black italic text-2xl tracking-tighter">STRAVA</span>
                </div>
            </div>
        </div>
    );
};

export default PricingPage;
