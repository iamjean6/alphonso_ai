import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, CreditCard, Smartphone, ShieldCheck, Lock, CheckCircle2, Info } from 'lucide-react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { createPayPalOrder, capturePayPalPayment } from '../../services/api';

const CheckoutPage = ({ userData, setUserData }) => {
    const { planId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const currency = searchParams.get('currency') || 'USD';
    const [rates, setRates] = useState({ USD: 1, KES: 135, EUR: 0.92, GBP: 0.78 });
    const [method, setMethod] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingRates, setLoadingRates] = useState(true);
    const [idempotencyKey, setIdempotencyKey] = useState("");

    const initialOptions = {
        clientId: import.meta.env.VITE_PAYPAL_CLIENTID,
        currency: currency,
        intent: "capture",
    }

    useEffect(() => {
        // Generate a unique key for this checkout session
        setIdempotencyKey(crypto.randomUUID());
    }, []);

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
                console.error("Checkout: Fallback to static rates.");
            } finally {
                setLoadingRates(false);
            }
        };
        fetchRates();
    }, []);

    const plans = {
        prospect: { name: 'Prospect Tier', usd: 5 },
        elite: { name: 'Elite Tier', usd: 10 },
        legend: { name: 'Legend Tier', usd: 15 }
    };

    const currentPlan = plans[planId] || plans.prospect;
    const convertedAmount = currentPlan.usd * rates[currency];

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(val);
    };

    const isKES = currency === 'KES';

    // PAYPAL HANDLERS
    const onCreateOrder = async (data, actions) => {
        try {
            const response = await createPayPalOrder({
                plan: currentPlan.name,
                amount: convertedAmount,
                currency: currency,
                idempotencyKey: idempotencyKey // Send key to prevent duplicates
            });
            return response.id;
        } catch (error) {
            console.error("PayPal Create Order Error:", error);
            alert("Failed to initiate PayPal checkout. Please try again.");
        }
    };

    const onApprove = async (data, actions) => {
        try {
            setIsLoading(true);
            const response = await capturePayPalPayment(data.orderID);
            
            if (response.message === "Payment captured successfully") {
                // Update local global state
                setUserData(prev => ({
                    ...prev,
                    tier: response.user.tier,
                    isPro: response.user.isPro
                }));

                navigate('/paypal/complete-payment', { state: { order: response.order } });
            }
        } catch (error) {
            console.error("PayPal Capture Error:", error);
            alert("Payment verification failed. Please contact support.");
        } finally {
            setIsLoading(false);
        }
    };

    const onError = (err) => {
        console.error("PayPal Script/Button Error:", err);
    };

    const handlePayment = async () => {
        if (method === 'paypal') return; // PayPal is handled by its own buttons
        
        setIsLoading(true);
        // Simulate other payment methods (M-Pesa/Paystack)
        setTimeout(() => {
            setIsLoading(false);
            alert(`Simulation: Payment of ${currency} ${convertedAmount.toLocaleString()} initiated via ${method}`);
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto no-scrollbar">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12">

                {/* Left Side: Summary */}
                <div className="flex flex-col">
                    <button
                        onClick={() => navigate('/pricing')}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-all mb-8 uppercase text-xs font-black tracking-widest italic"
                    >
                        <ChevronLeft size={16} /> Choose different plan
                    </button>

                    <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-2">Order <span className="text-accent-sport">Summary</span></h2>
                    <p className="text-muted-foreground font-medium mb-12">Ready to lock in your athletic dominance.</p>

                    <div className="glass p-8 rounded-[32px] border border-border space-y-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-accent-sport/5 rounded-full -mr-16 -mt-16 blur-2xl" />

                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-semibold uppercase text-xs tracking-widest">Plan Selected</span>
                            <span className="text-lg font-black uppercase italic">{currentPlan.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-semibold uppercase text-xs tracking-widest">Base Cost</span>
                            <span className="font-bold">${currentPlan.usd}/mo</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-semibold uppercase text-xs tracking-widest">Exchange Rate</span>
                            <span className="text-xs font-medium text-accent-sport italic">1 USD = {rates[currency]} {currency}</span>
                        </div>

                        <div className="h-px bg-border/50 my-6" />

                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-muted-foreground font-semibold uppercase text-[10px] tracking-[0.2em] block mb-1">Total Due Now</span>
                                <span className="text-5xl font-black tabular-nums tracking-tighter">
                                    {formatCurrency(convertedAmount)}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-muted-foreground text-[10px] uppercase font-bold block">Recurring</span>
                                <span className="text-xs font-black">AUDITED BI-MONTHLY</span>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-2 p-4 bg-secondary/30 rounded-2xl border border-border items-start">
                            <Info className="w-4 h-4 text-accent-sport shrink-0 mt-0.5" />
                            <p className="text-[10px] text-muted-foreground leading-relaxed uppercase font-medium">
                                Your membership will auto-renew. Access is granted immediately upon successful verification by the reasoning engine.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Side: Payment Methods */}
                <div className="flex flex-col justify-center">
                    <h3 className="text-xl font-bold uppercase mb-6 flex items-center gap-2">
                        <Lock className="w-5 h-5 text-accent-sport" />
                        Select Payment Method
                    </h3>

                    <div className="space-y-4 mb-10">
                        {/* MPESA STK - LOCKED */}
                        <div className="relative p-6 rounded-3xl border-2 border-border opacity-50 bg-muted/50 cursor-not-allowed overflow-hidden">
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
                                <div className="flex items-center gap-2 px-3 py-1 bg-background border border-border rounded-full shadow-lg">
                                    <Lock className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Coming Soon</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center opacity-40">
                                <div className="flex items-center gap-3">
                                    <Smartphone className="w-6 h-6 text-green-500" />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-lg">M-PESA STK Push</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PAYSTACK (CARD/BANK) - LOCKED */}
                        <div className="relative p-6 rounded-3xl border-2 border-border opacity-50 bg-muted/50 cursor-not-allowed overflow-hidden">
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
                                <div className="flex items-center gap-2 px-3 py-1 bg-background border border-border rounded-full shadow-lg">
                                    <Lock className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Coming Soon</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center opacity-40">
                                <div className="flex items-center gap-3">
                                    <CreditCard className="w-6 h-6 text-blue-500" />
                                    <div className="flex flex-col">
                                        <span className="font-bold text-lg">Card / Bank Transfer</span>
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground">Powered by Paystack</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PAYPAL */}
                        <div
                            onClick={() => setMethod('paypal')}
                            className={`p-1 rounded-3xl border-2 transition-all cursor-pointer
                                ${method === 'paypal' ? 'border-yellow-500 bg-yellow-500/5' : 'border-border hover:border-yellow-500/40'}
                            `}
                        >
                            <div className="p-5">
                                <PayPalScriptProvider options={initialOptions}>
                                    <PayPalButtons
                                        style={{
                                            shape: "rect",
                                            layout: "vertical",
                                            color: "gold",
                                            label: "paypal"
                                        }}
                                        createOrder={onCreateOrder}
                                        onApprove={onApprove}
                                        onError={onError}
                                    />
                                </PayPalScriptProvider>
                            </div>
                        </div>
                    </div>

                    <button
                        disabled={!method || isLoading || (method === 'paypal')}
                        onClick={handlePayment}
                        className={`w-full py-6 rounded-[32px] font-black uppercase tracking-widest text-lg italic transition-all shadow-2xl active:scale-95
                            ${(!method || (method === 'paypal'))
                                ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                                : 'bg-accent-sport text-black hover:scale-[1.02] shadow-accent-sport/20'
                            }
                        `}
                    >
                        {isLoading ? 'Encrypting Connection...' : method === 'paypal' ? 'Use PayPal Buttons Above' : `Complete ${method?.toUpperCase()} Audit`}
                    </button>

                    <div className="mt-8 flex justify-center items-center gap-6 text-muted-foreground opacity-50">
                        <ShieldCheck className="w-10 h-10" />
                        <div className="text-left">
                            <span className="block text-xs font-black uppercase leading-tight">Secure Transaction</span>
                            <span className="block text-[10px] uppercase font-medium">Verified by Alphonso Security Engine</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;

