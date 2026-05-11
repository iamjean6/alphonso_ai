import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Download, ShieldCheck } from 'lucide-react';

const CompletePayment = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { order } = location.state || {};

    if (!order) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-4xl font-black uppercase italic mb-4">Access <span className="text-accent-sport">Denied</span></h1>
                <p className="text-muted-foreground mb-8">No transaction data found. Please return to the arena.</p>
                <button 
                    onClick={() => navigate('/')}
                    className="px-8 py-4 bg-accent-sport text-black font-black uppercase italic rounded-full hover:scale-105 transition-all"
                >
                    Back to Start
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto no-scrollbar">
            <div className="w-full max-w-2xl text-center">
                <div className="mb-8 inline-flex items-center justify-center w-24 h-24 bg-accent-sport/10 rounded-full">
                    <CheckCircle2 className="w-12 h-12 text-accent-sport animate-bounce" />
                </div>
                
                <h1 className="text-6xl font-black uppercase italic tracking-tighter mb-4">
                    Audit <span className="text-accent-sport">Complete</span>
                </h1>
                <p className="text-xl text-muted-foreground font-medium mb-12">
                    Your athletic profile has been upgraded. Welcome to the elite.
                </p>

                <div className="glass p-8 rounded-[32px] border border-border text-left relative overflow-hidden mb-12">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-accent-sport/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                    
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground mb-6">Transaction Receipt</h3>
                    
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-medium">Order ID</span>
                            <span className="font-mono text-sm font-bold">{order.id}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-medium">Status</span>
                            <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] font-black uppercase">
                                {order.status}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground font-medium">Customer</span>
                            <span className="font-bold">{order.payer?.name?.given_name} {order.payer?.name?.surname}</span>
                        </div>
                        
                        <div className="h-px bg-border/50 my-6" />
                        
                        <div className="flex justify-between items-end">
                            <span className="text-muted-foreground font-semibold uppercase text-xs tracking-widest">Total Paid</span>
                            <span className="text-4xl font-black italic">
                                {order.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value} {order.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                        onClick={() => navigate('/chat')}
                        className="flex items-center justify-center gap-2 px-8 py-6 bg-accent-sport text-black font-black uppercase italic rounded-[24px] hover:scale-[1.02] transition-all shadow-xl shadow-accent-sport/20"
                    >
                        Enter Training Lab <ChevronRight size={20} />
                    </button>
                    <button 
                        className="flex items-center justify-center gap-2 px-8 py-6 bg-secondary/50 text-foreground font-black uppercase italic rounded-[24px] hover:bg-secondary transition-all border border-border"
                    >
                        <Download size={20} /> Download Receipt
                    </button>
                </div>

                <div className="mt-12 flex justify-center items-center gap-4 text-muted-foreground opacity-30 grayscale">
                    <ShieldCheck size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Secured by Alphonso AI Identity Engine</span>
                </div>
            </div>
        </div>
    );
};

export default CompletePayment;