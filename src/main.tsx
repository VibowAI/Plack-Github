import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { fetchRuntimeConfig } from '@/lib/supabase/client';
import Page from '@/app/page';
import WelcomePage from '@/app/welcome/page';
import PrivacyPolicyPage from '@/app/privacypolicy/page';
import TermsOfServicePage from '@/app/termsofservice/page';
import '@/app/globals.css';

async function init() {
  // Pre-fetch configuration to ensure Supabase client has correct credentials
  await fetchRuntimeConfig();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AppProvider>
          <Routes>
            <Route path="/" element={<Page />} />
            <Route path="/chat/:id" element={<Page />} />
            <Route path="/connections" element={<Page />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/privacypolicy" element={<PrivacyPolicyPage />} />
            <Route path="/termsofservice" element={<TermsOfServicePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

init();
