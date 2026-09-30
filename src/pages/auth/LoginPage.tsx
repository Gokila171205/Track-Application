import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Target destination after login
  const from = (location.state as any)?.from?.pathname;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic client validation
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your registered email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login({ email: email.trim().toLowerCase(), password });
      if (user.role === 'ADMIN') {
        navigate('/admin');
      } else {
        // Redirect applicant to Scheme Discovery (/schemes) on login
        const isDefaultOrAuthPath =
          !from ||
          from === '/login' ||
          from === '/signup' ||
          from === '/applicant/dashboard' ||
          from === '/dashboard';
        const target = isDefaultOrAuthPath ? '/schemes' : from;
        navigate(target);
      }
    } catch (err: any) {
      if (
        err?.isNetworkError ||
        err?.status === 0 ||
        err?.message?.toLowerCase().includes('failed to fetch') ||
        err?.message?.toLowerCase().includes('unable to connect')
      ) {
        setErrorMessage('Unable to connect to the portal server. Please check your network connection and ensure the backend service is running on port 8000.');
      } else if (
        err?.status === 401 ||
        err?.message?.toLowerCase().includes('invalid email') ||
        err?.message?.toLowerCase().includes('credentials')
      ) {
        setErrorMessage('Invalid email or password. Please verify your credentials and try again.');
      } else if (
        err?.status === 403 ||
        err?.message?.toLowerCase().includes('deactivated')
      ) {
        setErrorMessage('Your citizen account is currently deactivated. Please contact the MoTA support desk.');
      } else if (err?.status >= 500) {
        setErrorMessage('The portal authentication service is temporarily unavailable. Please try again shortly.');
      } else {
        setErrorMessage(err.message || 'Login failed. Please check your credentials and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[#f8fafc] py-8 px-4 flex flex-col justify-center items-center">
      <div className="max-w-md w-full bg-white border border-slate-300 rounded-lg shadow-md overflow-hidden">
        {/* Ministry Branding Header */}
        <div className="bg-[#0b2853] text-white p-6 text-center border-b-4 border-amber-500">
          <div className="flex justify-center mb-3">
            <img
              src="/images/mota-emblem.png"
              alt="Government of India emblem"
              className="h-16 w-auto max-w-full object-contain bg-white px-2 py-1 rounded"
            />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200">
            Government of India
          </h2>
          <h1 className="text-base font-black uppercase tracking-tight text-white mt-0.5">
            Ministry of Tribal Affairs
          </h1>
          <p className="text-[11px] text-amber-300 font-semibold mt-1">
            Tribal Scholarship & Fellowship Management System (TSFMS)
          </p>
        </div>

        {/* Login Form Container */}
        <div className="p-6 sm:p-8 space-y-5">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-lg font-black text-[#0b2853]">
              Portal Login
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Enter your registered email and password to access your application dossier.
            </p>
          </div>

          {/* Error message alert */}
          {errorMessage && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3.5 bg-rose-50 border-l-4 border-rose-600 rounded text-xs text-rose-900 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Email Address <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. citizen@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800 text-slate-900"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold text-slate-700"
                >
                  Password <span className="text-rose-600">*</span>
                </label>
                <Link
                  to="/forgot-password"
                  className="text-[11px] text-blue-900 font-semibold hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800 text-slate-900"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-2.5 p-1 text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-800 rounded"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-[#0b2853] hover:bg-[#134685] text-white font-bold text-xs rounded shadow uppercase tracking-wider transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-800 focus:ring-offset-1 disabled:bg-slate-400"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-amber-400 rounded-full animate-spin" />
                  <span>Authenticating Credentials...</span>
                </>
              ) : (
                <span>Login</span>
              )}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="pt-3 border-t border-slate-200 text-center text-xs text-slate-600">
            <span>Don't have an account? </span>
            <Link
              to="/signup"
              className="text-blue-900 font-bold hover:underline focus:outline-none focus:ring-1 focus:ring-blue-800 rounded px-1"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
