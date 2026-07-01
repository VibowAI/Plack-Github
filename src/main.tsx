import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { fetchRuntimeConfig } from '@/lib/supabase/client';
const Page = React.lazy(() => import('@/app/page'));
const WelcomePage = React.lazy(() => import('@/app/welcome/page'));
const PrivacyPolicyPage = React.lazy(() => import('@/app/privacypolicy/page'));
const TermsOfServicePage = React.lazy(() => import('@/app/termsofservice/page'));
import '@/app/globals.css';

async function init() {
  // Pre-fetch configuration to ensure Supabase client has correct credentials
  await fetchRuntimeConfig();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AppProvider>
          <Routes>
            <Route path="/" element={<React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}><Page /></React.Suspense>} />
            <Route path="/chat/:id" element={<React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}><Page /></React.Suspense>} />
            <Route path="/welcome" element={<React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}><WelcomePage /></React.Suspense>} />
            <Route path="/privacypolicy" element={<React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}><PrivacyPolicyPage /></React.Suspense>} />
            <Route path="/termsofservice" element={<React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-black text-white">Loading...</div>}><TermsOfServicePage /></React.Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

init();
