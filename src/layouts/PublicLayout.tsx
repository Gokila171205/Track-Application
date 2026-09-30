import React from 'react';
import { Outlet } from 'react-router-dom';

import { GovHeader } from '../components/common/GovHeader';
import { GovNavigation } from '../components/common/GovNavigation';
import { NewsTicker } from '../components/common/NewsTicker';
import { GovFooter } from '../components/common/GovFooter';

export const PublicLayout: React.FC = () => {
  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">

      {/* Main Government Header */}
      <GovHeader />

      {/* Main Navigation Bar */}
      <GovNavigation />

      {/* Breaking Updates Ticker */}
      <NewsTicker />

      {/* Main Page Area */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 scroll-mt-20 focus:outline-none"
      >
        <Outlet />
      </main>

      {/* Government Footer */}
      <GovFooter />
    </div>
  );
};
