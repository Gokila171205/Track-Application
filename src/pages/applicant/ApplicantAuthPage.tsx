import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ShieldCheck, User, LogIn, ExternalLink, CheckCircle2 } from 'lucide-react';

export const ApplicantAuthPage: React.FC = () => {
  const { switchRole } = useApp();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [loginMethod, setLoginMethod] = useState<'AADHAAR_OTP' | 'CREDENTIALS' | 'DIGILOCKER'>('AADHAAR_OTP');
  const [aadhaarInput, setAadhaarInput] = useState('981245097819');
  const [otpInput, setOtpInput] = useState('892011');
  const [isOtpSent, setIsOtpSent] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    switchRole('APPLICANT');
    navigate('/schemes');
  };

  return (
    <div className="max-w-md mx-auto my-12 p-6 bg-white border border-slate-300 rounded shadow-md text-xs">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-full flex items-center justify-center mx-auto mb-2 text-[#0b2853]">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
          Government of India • Ministry of Tribal Affairs
        </span>
        <h1 className="text-lg font-black text-[#0b2853]">
          {authMode === 'LOGIN' ? 'Citizen & Scholar Portal Login' : 'New ST Student Registration'}
        </h1>
      </div>

      {/* Login Method Tabs */}
      <div className="grid grid-cols-3 gap-1 mb-5 p-1 bg-slate-100 rounded">
        <button
          type="button"
          onClick={() => setLoginMethod('AADHAAR_OTP')}
          className={`py-1.5 font-bold rounded text-[11px] transition-colors ${
            loginMethod === 'AADHAAR_OTP' ? 'bg-[#0b2853] text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          Aadhaar OTP
        </button>
        <button
          type="button"
          onClick={() => setLoginMethod('DIGILOCKER')}
          className={`py-1.5 font-bold rounded text-[11px] transition-colors ${
            loginMethod === 'DIGILOCKER' ? 'bg-[#0b2853] text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          DigiLocker
        </button>
        <button
          type="button"
          onClick={() => setLoginMethod('CREDENTIALS')}
          className={`py-1.5 font-bold rounded text-[11px] transition-colors ${
            loginMethod === 'CREDENTIALS' ? 'bg-[#0b2853] text-white' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          Password
        </button>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {loginMethod === 'AADHAAR_OTP' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Enter 12-Digit Aadhaar Number / Virtual ID (VID):
              </label>
              <input
                type="text"
                required
                value={aadhaarInput}
                onChange={(e) => setAadhaarInput(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded font-mono font-bold text-slate-900 tracking-wider"
              />
            </div>

            {!isOtpSent ? (
              <button
                type="button"
                onClick={() => setIsOtpSent(true)}
                className="w-full py-2 bg-blue-900 text-white rounded font-bold hover:bg-blue-800"
              >
                Send One Time Password (OTP)
              </button>
            ) : (
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Enter 6-digit OTP sent to linked mobile:
                </label>
                <input
                  type="text"
                  required
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded font-mono font-bold text-center tracking-widest text-base text-blue-950"
                />
                <span className="text-[10px] text-emerald-700 font-semibold block mt-1">
                  ✓ Demo simulation: Test OTP prefilled. Click Login.
                </span>
              </div>
            )}
          </>
        )}

        {loginMethod === 'DIGILOCKER' && (
          <div className="bg-cyan-50 border border-cyan-200 p-4 rounded text-center space-y-2">
            <span className="font-bold text-cyan-950 block">Authenticate with DigiLocker Gateway</span>
            <p className="text-[11px] text-cyan-800">
              Instant login and automated retrieval of certified Caste & Income certificates.
            </p>
          </div>
        )}

        {loginMethod === 'CREDENTIALS' && (
          <>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Application ID / Mobile Number:</label>
              <input type="text" defaultValue="APP-ST-8821" className="w-full p-2 bg-white border border-slate-300 rounded" />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password:</label>
              <input type="password" defaultValue="••••••••" className="w-full p-2 bg-white border border-slate-300 rounded" />
            </div>
          </>
        )}

        <button
          type="submit"
          className="w-full py-2.5 bg-[#0b2853] hover:bg-[#134685] text-white font-black text-xs rounded shadow uppercase tracking-wider transition-colors"
        >
          {authMode === 'LOGIN' ? 'Login to Citizen Portal' : 'Register with Aadhaar'}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-slate-200 text-center text-slate-500">
        <button
          onClick={() => setAuthMode(authMode === 'LOGIN' ? 'REGISTER' : 'LOGIN')}
          className="text-blue-900 font-bold hover:underline"
        >
          {authMode === 'LOGIN' ? "Don't have an account? Register Now" : 'Already registered? Login here'}
        </button>
      </div>
    </div>
  );
};
