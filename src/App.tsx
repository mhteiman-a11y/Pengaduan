import { useState } from 'react';
import { Lock, LogIn, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CitizenPortal } from './components/CitizenPortal';
import { AsnWorkspace } from './components/AsnWorkspace';
import { ArchitectureBlueprint } from './components/ArchitectureBlueprint';
import { AdminLoginGate } from './components/AdminLoginGate';

type ActiveView = 'citizen' | 'asn' | 'architecture' | 'admin-login';

function AppShell() {
  const [view, setView] = useState<ActiveView>('citizen');
  const { dbUser, logout } = useAuth();

  const isStaff = Boolean(
    dbUser &&
      (dbUser.isPic ||
        dbUser.allowedFeatures?.some((f) =>
          [
            'portal_asn_queue',
            'portal_asn_reports',
            'portal_asn_notifications',
            'portal_asn_master',
            'pic_access_control',
          ].includes(f)
        ))
  );
  const isAdmin = Boolean(
    dbUser &&
      (dbUser.isPic || dbUser.allowedFeatures?.includes('architecture_sql'))
  );

  const navigateCitizenSection = (sectionId: string) => {
    setView('citizen');
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setView('citizen');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-display text-lg font-bold tracking-tight text-[#0F294A] whitespace-nowrap shrink-0"
          >
            SIPPANDU DUKCAPIL
          </a>

          {/* Zone 2: 4 Single-line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => navigateCitizenSection('pengajuan')}
              className={`hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'citizen' ? 'text-[#0F294A] font-semibold' : ''
              }`}
            >
              Pengajuan Online
            </button>
            <button
              type="button"
              onClick={() => navigateCitizenSection('lacak')}
              className="hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Lacak Tiket
            </button>
            <button
              type="button"
              onClick={() => {
                setView('asn');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`inline-flex items-center gap-1.5 hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'asn' ? 'text-[#0F294A] font-semibold' : ''
              }`}
            >
              {!isStaff && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              <span>Portal ASN</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setView('architecture');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`inline-flex items-center gap-1.5 hover:text-[#0F294A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'architecture' ? 'text-[#0F294A] font-semibold' : ''
              }`}
            >
              {!isAdmin && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              <span>Arsitektur &amp; SQL</span>
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {dbUser ? (
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#0F294A] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="max-w-[140px] truncate">{dbUser.name}</span>
                <LogOut className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setView('admin-login');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span>Login Admin / ASN</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 overflow-x-auto text-xs font-medium text-slate-600">
        <button
          type="button"
          onClick={() => navigateCitizenSection('pengajuan')}
          className="whitespace-nowrap shrink-0 hover:text-[#0F294A]"
        >
          Ajukan
        </button>
        <button
          type="button"
          onClick={() => navigateCitizenSection('lacak')}
          className="whitespace-nowrap shrink-0 hover:text-[#0F294A]"
        >
          Lacak Tiket
        </button>
        <button
          type="button"
          onClick={() => setView('asn')}
          className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
            view === 'asn' ? 'text-[#0F294A] font-semibold' : ''
          }`}
        >
          {!isStaff && <Lock className="w-3 h-3 text-slate-400" />}
          <span>Portal ASN</span>
        </button>
        <button
          type="button"
          onClick={() => setView('architecture')}
          className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
            view === 'architecture' ? 'text-[#0F294A] font-semibold' : ''
          }`}
        >
          {!isAdmin && <Lock className="w-3 h-3 text-slate-400" />}
          <span>Arsitektur &amp; SQL</span>
        </button>
      </div>

      <main className="flex-1">
        {view === 'citizen' && (
          <CitizenPortal
            onOpenAsnPortal={() => {
              setView('asn');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
        {view === 'asn' && (
          <AsnWorkspace onBackToCitizen={() => setView('citizen')} />
        )}
        {view === 'architecture' && (
          <ArchitectureBlueprint onBackToCitizen={() => setView('citizen')} />
        )}
        {view === 'admin-login' && (
          <AdminLoginGate
            targetLabel="Login Portal ASN & Arsitektur Sistem"
            targetDescription="Menu khusus untuk Administrator Sistem, Verifikator ASN, dan Pimpinan yang telah mendapat otorisasi dari PIC Pengelola Akses."
            allowedRoles={['verifier', 'admin', 'viewer']}
            requiredFeatures={[
              'portal_asn_queue',
              'portal_asn_reports',
              'portal_asn_notifications',
              'portal_asn_master',
              'architecture_sql',
              'pic_access_control',
            ]}
            onBackToCitizen={() => setView('citizen')}
            showTargetSelector
            onSuccessTarget={(target) => {
              setView(target);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </main>

      <footer className="bg-[#0A1D37] text-slate-300 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div>
            <p className="font-display font-semibold text-white">
              Dinas Kependudukan dan Pencatatan Sipil Kabupaten Sidoarjo
            </p>
            <p className="mt-1 text-slate-400">
              SIPPANDU DUKCAPIL — Pelayanan Pengaduan dan Permohonan Data Kependudukan
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => navigateCitizenSection('lacak')}
              className="hover:text-white cursor-pointer"
            >
              Lacak Tiket
            </button>
            <button
              type="button"
              onClick={() => setView('asn')}
              className="hover:text-white cursor-pointer"
            >
              Login Portal ASN
            </button>
            <button
              type="button"
              onClick={() => setView('architecture')}
              className="hover:text-white cursor-pointer"
            >
              Login Arsitektur &amp; SQL
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
