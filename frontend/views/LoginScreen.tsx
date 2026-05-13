import React, { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase, signInWithGoogle } from '../supabaseClient';

export default function LoginScreen({ isLight = false, onManualLogin }: { isLight?: boolean, onManualLogin: (email: string, name: string) => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.includes(' ') || !cleanEmail.endsWith('@gmail.com')) {
      setMessage("Error: Please enter a valid Gmail address ending in @gmail.com with no spaces.");
      return;
    }

    setLoading(true);
    
    // Completely bypass OTP/Magic Link.
    // Instantly load or create profile based on email alone.
    try {
       await onManualLogin(email, name);
    } catch (err: any) {
       setMessage(`Error: ${err.message}`);
       setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (googleError) throw googleError;
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  };

  const inputStyle: React.CSSProperties = isLight
    ? { background: '#ffffff', border: '1px solid #e2e8f0', color: '#1f2937' }
    : { background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,140,66,0.2)', color: '#fff' };

  return (
    <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center overflow-hidden" 
         style={isLight 
           ? { background: '#ffffff' } 
           : { background: 'radial-gradient(circle at center, #071E3D 0%, #05102E 50%, #020713 100%)' }}>
      
      {!isLight && <div className="stars opacity-40" />}
      {isLight && (
        <>
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-50 blur-[100px] rounded-full pointer-events-none opacity-70" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-50 blur-[100px] rounded-full pointer-events-none opacity-50" />
        </>
      )}
      
      <div className="relative z-10 w-full max-w-[420px] p-8 sm:p-10 flex flex-col items-center rounded-2xl"
           style={isLight
             ? { background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)', border: '1px solid rgba(217,119,6,0.15)', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }
             : { background: 'rgba(6,3,18,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,140,66,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        
        <div className="w-24 h-24 mb-4 rounded-full flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(255,140,66,0.2)]" 
             style={{ border: '1px solid rgba(255,140,66,0.5)' }}>
          <img src={isLight ? "/assets/logo-light.png" : "/assets/logo.png"} alt="Kalam Spark" className="w-[120%] h-[120%] object-contain" />
        </div>
        
        <h1 className="heading-gold font-cinzel text-2xl font-bold tracking-[0.1em] mb-1 uppercase text-center">
          Kalam Spark
        </h1>
        <p className="text-[9px] text-gold-500/60 uppercase tracking-[0.3em] font-mono mb-8 text-center">
          AI Career Architect
        </p>

        <div className="w-full flex rounded-lg overflow-hidden mb-6" style={isLight ? { background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(217,119,6,0.1)' } : { background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,140,66,0.1)' }}>
          <button 
            onClick={() => { setTab('login'); setMessage(''); }}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              tab === 'login' ? (isLight ? 'text-orange-600' : 'text-gold-200') : (isLight ? 'text-gray-500 hover:text-gray-800' : 'text-gold-500/40 hover:text-gold-400/60')
            }`}
            style={tab === 'login' ? { background: isLight ? 'rgba(217,119,6,0.1)' : 'linear-gradient(to right, rgba(255,140,66,0.15), rgba(255,140,66,0.05))', borderBottom: isLight ? '2px solid #ea580c' : '2px solid #ff8c42' } : {}}
          >
            Login
          </button>
          <button 
            onClick={() => { setTab('register'); setMessage(''); }}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              tab === 'register' ? (isLight ? 'text-orange-600' : 'text-gold-200') : (isLight ? 'text-gray-500 hover:text-gray-800' : 'text-gold-500/40 hover:text-gold-400/60')
            }`}
            style={tab === 'register' ? { background: isLight ? 'rgba(217,119,6,0.1)' : 'linear-gradient(to left, rgba(255,140,66,0.15), rgba(255,140,66,0.05))', borderBottom: isLight ? '2px solid #ea580c' : '2px solid #ff8c42' } : {}}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleEmailLogin} className="w-full flex flex-col gap-3 mb-6">
          {tab === 'register' && (
            <input 
              type="text" 
              placeholder="Your Name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none transition-all placeholder-gold-500/40"
              style={inputStyle}
              required
            />
          )}
          <input 
            type="email" 
            placeholder="your@email.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none transition-all placeholder-gold-500/40"
            style={inputStyle}
            required
          />
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full mt-2 py-3 rounded-lg font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 btn-primary transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? 'Logging in...' : (tab === 'login' ? 'Sign In' : 'Create Account')}
            {!loading && <ArrowRight size={16} />}
          </button>
          
          {message && (
            <p className={`text-xs text-center mt-2 ${message.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
              {message}
            </p>
          )}
        </form>

        <div className="w-full flex items-center gap-4 mb-6">
          <div className="h-px flex-1 bg-gold-500/20" />
          <span className="text-[10px] uppercase font-mono text-gold-500/40 tracking-widest">OR</span>
          <div className="h-px flex-1 bg-gold-500/20" />
        </div>

        <button 
          type="button"
          onClick={handleGoogleAuth}
          className={`w-full py-3 rounded-lg flex items-center justify-center gap-3 text-sm font-semibold transition-all ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/10'}`}
          style={isLight ? { background: '#ffffff', border: '1px solid #e2e8f0', color: '#1f2937' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
              <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
              <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
              <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
              <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
            </g>
          </svg>
          Continue with Google
        </button>

        <div className="mt-8 flex items-center gap-2 justify-center">
          <ShieldCheck size={11} className="text-gold-500/50" />
          <span className="text-[8px] uppercase font-mono tracking-[0.2em] text-gold-500/40">
            Cross-Device Sync • No Password Needed
          </span>
        </div>
      </div>
    </div>
  );
}
