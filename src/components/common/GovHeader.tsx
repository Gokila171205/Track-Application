import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Search, User, LogIn, UserPlus, LogOut, LayoutDashboard, Bell, X, CheckCircle2, Grid, Compass, ChevronDown, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { handleSkipToMainContent } from '../../utils/skipLink';

export const GovHeader: React.FC = () => {
  const {
    language,
    setLanguage,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize
  } = useApp();

  const { isAuthenticated, user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isReading, setIsReading] = useState(false);
  const speechRunRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      speechRunRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const { adminNotifications = [], markNotificationAsRead } = useApp();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'ALL' | 'UNREAD' | 'STARTED' | 'SUBMITTED' | 'RESUBMITTED'>('ALL');

  const unreadCount = adminNotifications.filter(n => !n.isRead).length;

  const filteredNotifications = adminNotifications.filter(n => {
    if (notificationFilter === 'UNREAD') return !n.isRead;
    if (notificationFilter === 'STARTED') return n.actionType === 'Application Started';
    if (notificationFilter === 'SUBMITTED') return n.actionType === 'Application Submitted' || n.actionType === 'New Application Submitted';
    if (notificationFilter === 'RESUBMITTED') return n.actionType === 'Application Resubmitted';
    return true;
  });

  const handleNotificationClick = (n: any) => {
    markNotificationAsRead(n.id);
    setIsNotificationOpen(false);
    navigate(`/admin/applications?scheme=${n.schemeCode}&app=${n.applicationId}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/schemes?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleScreenReader = () => {
    if (!('speechSynthesis' in window)) return;

    if (isReading) {
      speechRunRef.current += 1;
      window.speechSynthesis.cancel();
      setIsReading(false);
      return;
    }

    const mainContent = document.querySelector('main')?.innerText || document.body.innerText;
    const readableText = mainContent.replace(/\s+/g, ' ').trim();
    if (!readableText) return;

    const chunks = readableText.match(/.{1,220}(?:\s|$)/g)?.map((chunk) => chunk.trim()).filter(Boolean) || [readableText];
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    const targetLanguage = language === 'HI' ? 'hi' : 'en';
    const preferredVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith(targetLanguage));

    window.speechSynthesis.cancel();
    setIsReading(true);

    const speakChunk = (index: number) => {
      if (speechRunRef.current !== runId || index >= chunks.length) {
        if (speechRunRef.current === runId) setIsReading(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = language === 'HI' ? 'hi-IN' : 'en-IN';
      utterance.rate = 0.95;
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => {
        if (speechRunRef.current === runId) setIsReading(false);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  };

  return (
    <header className="bg-white border-b border-slate-200">
      {/* Top micro-bar: Accessibility, Language, Tricolor strip */}
      <div className="gov-strip-bg w-full"></div>
      
      <div className="bg-slate-100 text-slate-700 text-xs py-1.5 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          {/* Left: Official Government of India claim */}
          <div className="flex items-center gap-2">
            <span className="font-semibold tracking-wide text-slate-900">
              भारत सरकार | Government of India
            </span>
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="hidden sm:inline text-slate-600">
              माननीय जनजातीय कार्य मंत्रालय (MoTA)
            </span>
          </div>

          {/* Right: Accessibility toolbar & Language */}
          <div className="flex items-center gap-3">
            {/* Screen Reader Access link */}
            <a
              href="#main-content"
              onClick={handleSkipToMainContent}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  handleSkipToMainContent(e);
                }
              }}
              className="text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 focus:bg-white focus:text-blue-900 focus:shadow-sm px-1.5 py-0.5 rounded font-medium inline-block text-xs"
            >
              Skip to Main Content
            </a>

            <div className="h-3 w-px bg-slate-300 hidden md:block"></div>

            <button
              type="button"
              onClick={handleScreenReader}
              className={`border rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                isReading
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title={isReading ? 'Stop reading page' : 'Read page aloud'}
              aria-label={isReading ? 'Stop reading page' : 'Read page aloud'}
              aria-pressed={isReading}
            >
              {isReading ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span className="text-[11px] font-medium hidden sm:inline">
                {isReading ? 'Stop' : 'Read aloud'}
              </span>
            </button>

            {/* Font size adjustments */}
            <div className="flex items-center gap-1 border border-slate-300 rounded bg-white px-1 py-0.5">
              <span className="text-[11px] text-slate-500 font-medium mr-1">Text:</span>
              <button
                onClick={decreaseFontSize}
                className="px-1 font-bold hover:text-blue-700 focus:outline-none"
                title="Decrease font size"
                aria-label="Decrease text size"
              >
                A-
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={resetFontSize}
                className="px-1 font-bold hover:text-blue-700 focus:outline-none"
                title="Default font size"
                aria-label="Default text size"
              >
                A
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={increaseFontSize}
                className="px-1 font-bold hover:text-blue-700 focus:outline-none"
                title="Increase font size"
                aria-label="Increase text size"
              >
                A+
              </button>
            </div>

            <div className="h-3 w-px bg-slate-300"></div>

            {/* Language Switcher */}
            <div className="flex items-center font-medium">
              <button
                onClick={() => setLanguage('EN')}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  language === 'EN'
                    ? 'font-bold text-blue-900 underline'
                    : 'text-slate-600 hover:text-blue-800'
                }`}
              >
                English
              </button>
              <span className="text-slate-400">/</span>
              <button
                onClick={() => setLanguage('HI')}
                className={`px-1.5 py-0.5 rounded text-xs ${
                  language === 'HI'
                    ? 'font-bold text-blue-900 underline'
                    : 'text-slate-600 hover:text-blue-800'
                }`}
              >
                हिंदी
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Government Header Banner */}
      <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: National Emblem & Ministry Identity */}
          <Link to="/" className="flex items-center gap-3 sm:gap-4 group">
            {/* MoTA Emblem / Logo */}
            <div className="flex-shrink-0 flex items-center justify-center">
              <img
                src="/images/mota-emblem.png"
                alt="Government of India emblem"
                className="h-10 sm:h-12 md:h-14 w-auto max-w-[120px] sm:max-w-[160px] md:max-w-[200px] object-contain flex-shrink-0"
              />
            </div>

            {/* Ministry Text */}
            <div className="border-l border-slate-300 pl-3 sm:pl-3.5">
              <h2 className="text-xs sm:text-sm font-bold tracking-tight text-slate-800 leading-tight uppercase font-sans">
                {language === 'HI' ? 'जनजातीय कार्य मंत्रालय' : 'MINISTRY OF TRIBAL AFFAIRS'}
              </h2>
              <p className="text-[11px] sm:text-xs font-semibold text-slate-600 leading-tight">
                {language === 'HI' ? 'भारत सरकार' : 'Government of India'}
              </p>
              <h1 className="text-sm sm:text-lg font-bold text-[#0b2853] tracking-tight leading-snug mt-0.5 sm:mt-1">
                {language === 'HI'
                  ? 'एकीकृत एआई-सक्षम छात्रवृत्ति एवं अध्येतावृत्ति पोर्टल'
                  : 'Unified AI-Enabled Scholarship & Fellowship Portal'}
              </h1>
            </div>
          </Link>

          {/* Right: Search and Dynamic Auth State */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Global Search Bar */}
            <form onSubmit={handleSearch} className="relative min-w-[220px] sm:min-w-[260px]">
              <input
                type="text"
                placeholder={language === 'HI' ? 'योजनाएं, दिशानिर्देश खोजें...' : 'Search schemes, guidelines...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-800 text-slate-900 placeholder:text-slate-400"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <button type="submit" className="sr-only">Search</button>
            </form>

            {/* Dynamic Authentication Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {!isAuthenticated ? (
                <>
                  <Link
                    to="/schemes"
                    className="hidden sm:inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-slate-600 hover:text-blue-800 text-xs font-semibold transition-colors"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Explore</span>
                  </Link>
                  <button
                    className="inline-flex items-center justify-center p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
                    title="Services"
                    aria-label="Services"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[#0b2853] text-xs font-semibold shadow-sm transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                    <span className="hidden sm:inline">Register</span>
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#0b2853] hover:bg-[#134685] text-white text-xs font-bold shadow-sm transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Login</span>
                  </Link>
                </>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Notifications for everyone */}
                  <div className="relative">
                    <button
                      onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                      className="relative p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
                      title="Notifications"
                      aria-label="Notifications"
                    >
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                          {unreadCount}
                        </span>
                      )}
                    </button>

                    {isNotificationOpen && (
                        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                              Admin Notifications
                              {unreadCount > 0 && (
                                <span className="bg-[#0b2853] text-white text-[10px] px-2 py-0.5 rounded-full">
                                  {unreadCount} New
                                </span>
                              )}
                            </h3>
                            <button onClick={() => setIsNotificationOpen(false)} className="text-slate-400 hover:text-slate-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="px-2 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto text-[10px] sm:text-xs">
                            {['ALL', 'UNREAD', 'STARTED', 'SUBMITTED', 'RESUBMITTED'].map((filter) => (
                              <button
                                key={filter}
                                onClick={() => setNotificationFilter(filter as any)}
                                className={`px-2 py-1 rounded whitespace-nowrap ${notificationFilter === filter ? 'bg-blue-100 text-blue-800 font-bold' : 'text-slate-600 hover:bg-slate-100'}`}
                              >
                                {filter === 'STARTED' ? 'Application Started' : filter === 'SUBMITTED' ? 'Submitted' : filter === 'RESUBMITTED' ? 'Resubmitted' : filter === 'ALL' ? 'All' : 'Unread'}
                              </button>
                            ))}
                          </div>

                          <div className="max-h-80 overflow-y-auto">
                            {filteredNotifications.length === 0 ? (
                              <div className="px-4 py-6 text-center text-sm text-slate-500">
                                No notifications match this filter.
                              </div>
                            ) : (
                              <div className="divide-y divide-slate-100">
                                {filteredNotifications.map(n => (
                                  <button
                                    key={n.id}
                                    onClick={() => handleNotificationClick(n)}
                                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                                  >
                                    <div className="flex-shrink-0 mt-0.5">
                                      {n.actionType === 'Application Started' ? (
                                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                          <UserPlus className="w-3.5 h-3.5" />
                                        </div>
                                      ) : n.actionType === 'Application Resubmitted' ? (
                                        <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </div>
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm ${!n.isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                                        {n.title}
                                      </p>
                                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                                        <span className="font-mono text-blue-800">{n.applicationId}</span> • {n.schemeCode}
                                      </p>
                                      <p className="text-[11px] text-slate-400 mt-1 flex justify-between">
                                        <span>{n.description}</span>
                                        <span>{n.timestamp}</span>
                                      </p>
                                    </div>
                                    {!n.isRead && (
                                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Services */}
                  <button
                    className="inline-flex items-center justify-center p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-colors"
                    title="Services"
                    aria-label="Services"
                  >
                    <Grid className="w-4 h-4" />
                  </button>

                  {/* User Profile Dropdown */}
                  <div className="relative group">
                    <button className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full border border-slate-300 bg-slate-50 hover:bg-white shadow-sm transition-colors focus:outline-none">
                      <div className="w-6 h-6 rounded-full bg-[#0b2853] flex items-center justify-center text-white">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-left hidden sm:block leading-none mr-1">
                        <span className="text-[10px] text-slate-800 uppercase font-bold">
                          {user?.role === 'APPLICANT' ? 'Applicant' : 'Admin'}
                        </span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {/* Hover Dropdown */}
                    <div className="absolute right-0 top-full pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                      <div className="w-48 bg-white border border-slate-200 rounded shadow-lg overflow-hidden py-1">
                        <div className="px-4 py-2 border-b border-slate-100 mb-1">
                          <span className="text-xs font-bold text-slate-900 block truncate">
                            {user?.name}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold block mt-0.5">
                            {user?.role}
                          </span>
                        </div>
                        <Link
                          to={user?.role === 'APPLICANT' ? '/applicant/dashboard' : '/admin'}
                          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-800"
                        >
                          <LayoutDashboard className="w-3.5 h-3.5 text-blue-700" />
                          Dashboard
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full text-left flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Logout
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export const GovernmentHeader = GovHeader;
export default GovHeader;
