import { ArrowLeft, Database, KeyRound, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminFeatureKey, RoleCode } from '../types/sippandu';

interface AdminLoginGateProps {
  targetLabel: string;
  targetDescription: string;
  allowedRoles: RoleCode[];
  requiredFeatures?: AdminFeatureKey[];
  onBackToCitizen: () => void;
  onSuccessTarget?: (target: 'asn' | 'architecture') => void;
  showTargetSelector?: boolean;
}

export function AdminLoginGate({
  targetLabel,
  targetDescription,
  allowedRoles,
  requiredFeatures,
  onBackToCitizen,
  onSuccessTarget,
  showTargetSelector = false,
}: AdminLoginGateProps) {
  const { dbUser, loading, authError, signInWithGoogle, logout } = useAuth();

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Memeriksa sesi otentikasi admin SIPPANDU DUKCAPIL...
        </div>
      </div>
    );
  }

  const hasRoleAccess = dbUser && allowedRoles.includes(dbUser.roleCode);
  const hasFeatureAccess =
    dbUser &&
    (dbUser.isPic ||
      !requiredFeatures ||
      requiredFeatures.length === 0 ||
      requiredFeatures.some((f) => dbUser.allowedFeatures?.includes(f)));

  const hasAccess = Boolean(hasRoleAccess && hasFeatureAccess);

  if (dbUser && !hasAccess) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-amber-700" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              Akses Terbatas · Belum Diizinkan oleh PIC
            </p>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Halaman {targetLabel} Khusus Petugas Berizin
            </h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Akun yang sedang aktif (<span className="font-mono text-slate-800">{dbUser.email}</span>) terdaftar sebagai{' '}
              <span className="font-semibold text-slate-900">{dbUser.roleName}</span> dan belum diberikan izin akses fitur ini oleh{' '}
              <span className="font-semibold text-slate-900">PIC Administrator</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Ganti Akun Google</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Keluar
            </button>
            <button
              type="button"
              onClick={onBackToCitizen}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#0F294A] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Portal Warga</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        <div className="md:col-span-7 space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F294A]">
            <Lock className="w-3.5 h-3.5" />
            <span>Menu Login Khusus Admin &amp; Petugas ASN</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            {targetLabel}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {targetDescription}
          </p>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {authError}
            </div>
          )}

          {showTargetSelector && dbUser && hasAccess && onSuccessTarget ? (
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {(dbUser.isPic ||
                dbUser.allowedFeatures?.some((f) =>
                  [
                    'portal_asn_queue',
                    'portal_asn_reports',
                    'portal_asn_notifications',
                    'portal_asn_master',
                    'pic_access_control',
                  ].includes(f)
                )) && (
                <button
                  type="button"
                  onClick={() => onSuccessTarget('asn')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Masuk ke Portal ASN</span>
                </button>
              )}
              {(dbUser.isPic || dbUser.allowedFeatures?.includes('architecture_sql')) && (
                <button
                  type="button"
                  onClick={() => onSuccessTarget('architecture')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#0F294A] bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <Database className="w-4 h-4" />
                  <span>Buka Arsitektur &amp; SQL</span>
                </button>
              )}
              {dbUser.isPic && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Status PIC Aktif</span>
                </span>
              )}
            </div>
          ) : (
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-2.5 px-5 py-2.5 text-sm font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Login Admin / ASN dengan Google</span>
              </button>
              <button
                type="button"
                onClick={onBackToCitizen}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-[#0F294A] cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Portal Warga</span>
              </button>
            </div>
          )}
        </div>

        <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-semibold text-slate-900">
            Kontrol Hak Akses oleh PIC
          </h3>
          <ul className="space-y-2.5 text-xs text-slate-600">
            <li>
              <span className="font-semibold text-slate-900">Portal ASN:</span> Hanya terbuka bagi petugas yang diberi izin fitur Antrean, Laporan, atau Master oleh PIC.
            </li>
            <li>
              <span className="font-semibold text-slate-900">Arsitektur &amp; SQL:</span> Hanya terbuka bagi PIC atau admin yang diberi izin khusus fitur Arsitektur &amp; SQL.
            </li>
            <li>
              <span className="font-semibold text-slate-900">Menu PIC:</span> Mengelola daftar email petugas dan mencentang fitur admin mana saja yang boleh diakses masing-masing petugas.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
