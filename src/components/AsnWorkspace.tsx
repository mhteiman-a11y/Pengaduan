import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  KeyRound,
  Search,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  AdminComplaint,
  AdminFeatureKey,
  AuditLogItem,
  NotificationLog,
  PeriodicReport,
  ServiceType,
} from '../types/sippandu';
import { StatusBadge } from './StatusBadge';
import { AdminLoginGate } from './AdminLoginGate';
import { PicAccessManager } from './PicAccessManager';

type AdminTab = 'queue' | 'reports' | 'notifications' | 'master' | 'pic';

interface AsnWorkspaceProps {
  onBackToCitizen: () => void;
}

export function AsnWorkspace({ onBackToCitizen }: AsnWorkspaceProps) {
  const { dbUser, idToken, loading, authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Queue state
  const [complaints, setComplaints] = useState<AdminComplaint[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedComplaint, setSelectedComplaint] = useState<AdminComplaint | null>(null);

  // Attachment download & preview state
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    url: string;
    mime: string;
    name: string;
  } | null>(null);

  // Verification action state
  const [verifyAction, setVerifyAction] = useState<'IN_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED'>('ACCEPTED');
  const [verifyBookingDate, setVerifyBookingDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [verifyReason, setVerifyReason] = useState('');
  const [verifySaving, setVerifySaving] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<string | null>(null);

  // Reports state
  const [periodType, setPeriodType] = useState<'all' | 'monthly' | 'quarterly' | 'semester'>('all');
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [periodValue, setPeriodValue] = useState(new Date().getMonth() + 1);
  const [report, setReport] = useState<PeriodicReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Notifications state
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);

  // Master & Users state (System Admin)
  const [masterServices, setMasterServices] = useState<ServiceType[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [newServiceCode, setNewServiceCode] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceSla, setNewServiceSla] = useState(3);
  const [newServiceDocs, setNewServiceDocs] = useState('');
  const [masterSaving, setMasterSaving] = useState(false);

  const hasFeature = (feature: AdminFeatureKey): boolean => {
    if (!dbUser) return false;
    return Boolean(dbUser.isPic || dbUser.allowedFeatures?.includes(feature));
  };

  const canAccessQueue = hasFeature('portal_asn_queue');
  const canAccessReports = hasFeature('portal_asn_reports');
  const canAccessNotifications = hasFeature('portal_asn_notifications');
  const canAccessMaster = hasFeature('portal_asn_master');
  const canAccessPic = hasFeature('pic_access_control');

  const isStaff = Boolean(
    dbUser &&
      (dbUser.isPic ||
        (['verifier', 'admin', 'viewer'].includes(dbUser.roleCode) &&
          (canAccessQueue ||
            canAccessReports ||
            canAccessNotifications ||
            canAccessMaster ||
            canAccessPic)))
  );

  const canVerify = Boolean(
    dbUser &&
      ['verifier', 'admin'].includes(dbUser.roleCode) &&
      canAccessQueue
  );

  // Ensure activeTab always points to a feature the user has access to
  useEffect(() => {
    if (!dbUser || !isStaff) return;
    const allowedTabs: Array<{ tab: AdminTab; ok: boolean }> = [
      { tab: 'queue', ok: canAccessQueue },
      { tab: 'reports', ok: canAccessReports },
      { tab: 'notifications', ok: canAccessNotifications },
      { tab: 'master', ok: canAccessMaster },
      { tab: 'pic', ok: canAccessPic },
    ];
    const currentOk = allowedTabs.find((t) => t.tab === activeTab)?.ok;
    if (!currentOk) {
      const firstOk = allowedTabs.find((t) => t.ok);
      if (firstOk) setActiveTab(firstOk.tab);
    }
  }, [
    dbUser,
    isStaff,
    activeTab,
    canAccessQueue,
    canAccessReports,
    canAccessNotifications,
    canAccessMaster,
    canAccessPic,
  ]);

  const fetchQueue = async (
    attempt = 0,
    overrides?: { status?: string; search?: string; silent?: boolean }
  ) => {
    if (!dbUser || !canAccessQueue) return;
    if (attempt === 0 && !overrides?.silent) {
      setQueueLoading(true);
      setQueueError(null);
    }
    try {
      const effectiveStatus = overrides?.status ?? statusFilter;
      const effectiveSearch = overrides?.search ?? searchTerm;
      const params = new URLSearchParams();
      if (effectiveStatus !== 'ALL') params.set('status', effectiveStatus);
      if (effectiveSearch.trim()) params.set('search', effectiveSearch.trim());
      const res = await authFetch(`/api/admin/complaints?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal memuat antrean.');
      const list: AdminComplaint[] = Array.isArray(data.complaints)
        ? data.complaints
        : [];
      setComplaints(list);
      setQueueError(null);
      if (selectedComplaint) {
        const updatedSel = list.find(
          (c: AdminComplaint) => c.id === selectedComplaint.id
        );
        if (updatedSel) setSelectedComplaint(updatedSel);
      }
      if (!overrides?.silent) {
        setQueueLoading(false);
      }
    } catch (err: any) {
      if (attempt < 2) {
        setTimeout(() => fetchQueue(attempt + 1, overrides), 1500 * (attempt + 1));
        return;
      }
      if (!overrides?.silent) {
        setQueueError(err.message || 'Gagal memuat antrean permohonan.');
        setQueueLoading(false);
      }
    }
  };

  const fetchReport = async () => {
    if (!dbUser || !canAccessReports) return;
    setReportLoading(true);
    try {
      const params = new URLSearchParams({
        periodType,
        year: String(reportYear),
        periodValue: String(periodValue),
      });
      const res = await authFetch(`/api/admin/reports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setReport(data.report);
      }
    } finally {
      setReportLoading(false);
    }
  };

  const fetchNotifications = async () => {
    if (!dbUser || !canAccessNotifications) return;
    setNotifLoading(true);
    try {
      const res = await authFetch('/api/admin/notifications');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotifLogs(data.notifications || []);
      }
    } finally {
      setNotifLoading(false);
    }
  };

  const fetchMasterAndServices = async () => {
    if (!dbUser || !canAccessMaster) return;
    const [sRes, aRes] = await Promise.all([
      authFetch('/api/admin/services'),
      authFetch('/api/admin/audit-logs'),
    ]);
    if (sRes.ok) {
      const sData = await sRes.json().catch(() => ({}));
      setMasterServices(sData.services || []);
    }
    if (aRes.ok) {
      const aData = await aRes.json().catch(() => ({}));
      setAuditLogs(aData.auditLogs || []);
    }
  };

  useEffect(() => {
    if (!dbUser || !canAccessQueue || activeTab !== 'queue') return;
    fetchQueue(0);
    const onFocus = () => fetchQueue(0, { silent: true });
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => fetchQueue(0, { silent: true }), 15000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [dbUser?.id, idToken, canAccessQueue, activeTab, statusFilter]);

  useEffect(() => {
    if (dbUser && canAccessReports && activeTab === 'reports') fetchReport();
  }, [dbUser?.id, idToken, canAccessReports, activeTab, periodType, reportYear, periodValue]);

  useEffect(() => {
    if (dbUser && canAccessNotifications && activeTab === 'notifications') fetchNotifications();
  }, [dbUser?.id, idToken, canAccessNotifications, activeTab]);

  useEffect(() => {
    if (dbUser && canAccessMaster && activeTab === 'master') fetchMasterAndServices();
  }, [dbUser?.id, idToken, canAccessMaster, activeTab]);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint || !idToken) return;
    setVerifySaving(true);
    setVerifyFeedback(null);
    try {
      const res = await authFetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId: selectedComplaint.id,
          action: verifyAction,
          reason: verifyReason.trim() || undefined,
          bookingDate: verifyAction === 'ACCEPTED' ? verifyBookingDate : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan keputusan.');

      setVerifyFeedback(
        `Status tiket ${data.result.ticketNumber} diperbarui ke ${data.result.status}. Notifikasi (${data.result.notificationsDispatched.join(', ')}) telah dikirim.`
      );
      setVerifyReason('');
      await fetchQueue();
    } catch (err: any) {
      setVerifyFeedback(err.message);
    } finally {
      setVerifySaving(false);
    }
  };

  const clearPreviewDoc = () => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
    setDocError(null);
  };

  useEffect(() => {
    return () => {
      if (previewDoc?.url) {
        URL.revokeObjectURL(previewDoc.url);
      }
    };
  }, [previewDoc]);

  const handleDownloadAttachment = async (complaint: AdminComplaint) => {
    if (!complaint.filePath) return;
    setDocLoading(true);
    setDocError(null);
    try {
      const filename = complaint.fileOriginalName || 'lampiran-berkas';
      const sep = complaint.filePath.includes('?') ? '&' : '?';
      const url = `${complaint.filePath}${sep}download=1&name=${encodeURIComponent(filename)}`;
      const res = await authFetch(url);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Gagal mengunduh berkas lampiran.');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      setDocError(err.message || 'Gagal mengunduh lampiran.');
    } finally {
      setDocLoading(false);
    }
  };

  const handlePreviewAttachment = async (complaint: AdminComplaint) => {
    if (!complaint.filePath) return;
    setDocLoading(true);
    setDocError(null);
    try {
      const res = await authFetch(complaint.filePath);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Gagal memuat pratinjau berkas.');
      }
      const blob = await res.blob();
      if (previewDoc?.url) {
        URL.revokeObjectURL(previewDoc.url);
      }
      const blobUrl = URL.createObjectURL(blob);
      setPreviewDoc({
        url: blobUrl,
        mime: blob.type || 'application/octet-stream',
        name: complaint.fileOriginalName || 'Berkas Lampiran',
      });
    } catch (err: any) {
      setDocError(err.message || 'Gagal menampilkan pratinjau lampiran.');
    } finally {
      setDocLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!idToken) return;
    const params = new URLSearchParams({
      periodType,
      year: String(reportYear),
      periodValue: String(periodValue),
    });
    const res = await authFetch(`/api/admin/reports/export?${params.toString()}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-sippandu-${periodType}-${reportYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idToken) return;
    setMasterSaving(true);
    try {
      const res = await authFetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newServiceCode,
          name: newServiceName,
          slaDays: newServiceSla,
          requiredDocs: newServiceDocs,
          isActive: true,
        }),
      });
      if (res.ok) {
        setNewServiceCode('');
        setNewServiceName('');
        setNewServiceDocs('');
        setNewServiceSla(3);
        await fetchMasterAndServices();
      }
    } finally {
      setMasterSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Memverifikasi sesi otentikasi SIPPANDU DUKCAPIL...
        </div>
      </div>
    );
  }

  if (!dbUser || !isStaff) {
    return (
      <AdminLoginGate
        targetLabel="Portal Verifikator ASN & Pimpinan"
        targetDescription="Masuk menggunakan akun Google resmi yang telah diberi otorisasi oleh PIC Administrator untuk mengakses antrean verifikasi permohonan, laporan berkala, log notifikasi, serta pengelolaan sistem."
        allowedRoles={['verifier', 'admin', 'viewer']}
        requiredFeatures={[
          'portal_asn_queue',
          'portal_asn_reports',
          'portal_asn_notifications',
          'portal_asn_master',
          'pic_access_control',
        ]}
        onBackToCitizen={onBackToCitizen}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Enterprise Sidebar (250px) */}
        <aside className="w-full lg:w-64 shrink-0 bg-white border border-slate-200 rounded-xl p-4 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#0F294A] shrink-0 border border-slate-200">
              {!avatarFailed ? (
                <img
                  src="/src/assets/images/asn_verifier_portrait_1794888279742.jpg"
                  alt={dbUser.name}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm">
                  {dbUser.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {dbUser.name}
              </p>
              <p className="text-xs text-[#0F294A] font-medium truncate">
                {dbUser.roleName}
              </p>
            </div>
          </div>

          <nav className="space-y-1">
            {canAccessQueue && (
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'queue'
                    ? 'bg-[#0F294A] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">Antrean Verifikasi</span>
              </button>
            )}

            {canAccessReports && (
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'reports'
                    ? 'bg-[#0F294A] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span className="truncate">Analitik &amp; Laporan</span>
              </button>
            )}

            {canAccessNotifications && (
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'notifications'
                    ? 'bg-[#0F294A] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Bell className="w-4 h-4 shrink-0" />
                <span className="truncate">Log Notifikasi</span>
              </button>
            )}

            {canAccessMaster && (
              <button
                type="button"
                onClick={() => setActiveTab('master')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'master'
                    ? 'bg-[#0F294A] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className="truncate">Master Layanan &amp; Audit</span>
              </button>
            )}

            {canAccessPic && (
              <button
                type="button"
                onClick={() => setActiveTab('pic')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'pic'
                    ? 'bg-[#0F294A] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <KeyRound className="w-4 h-4 shrink-0" />
                <span className="truncate">Kelola Akses PIC</span>
              </button>
            )}
          </nav>
        </aside>

        {/* Main Workspace Viewport */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* TAB 1: VERIFICATION QUEUE */}
          {activeTab === 'queue' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500">
                      Portal ASN / Antrean Verifikasi Berkas
                    </p>
                    <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                      Daftar Permohonan &amp; Pengaduan Masuk
                      {!queueLoading && (
                        <span className="ml-2 font-mono text-sm font-normal text-slate-500 tabular-nums">
                          ({complaints.length})
                        </span>
                      )}
                    </h2>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      fetchQueue(0);
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Cari Tiket / NIK / Nama..."
                        className="pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] w-56"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-3.5 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Cari
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchQueue(0)}
                      disabled={queueLoading}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      {queueLoading ? 'Memuat...' : 'Muat Ulang'}
                    </button>
                  </form>
                </div>

                {/* Segmented Status Filters */}
                <div className="pt-4 flex flex-wrap items-center gap-1.5">
                  {[
                    { code: 'ALL', label: 'Semua' },
                    { code: 'PENDING', label: 'Menunggu' },
                    { code: 'IN_REVIEW', label: 'Diverifikasi' },
                    { code: 'ACCEPTED', label: 'Disetujui' },
                    { code: 'REJECTED', label: 'Ditolak' },
                    { code: 'COMPLETED', label: 'Selesai' },
                  ].map((f) => (
                    <button
                      key={f.code}
                      type="button"
                      onClick={() => setStatusFilter(f.code)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        statusFilter === f.code
                          ? 'bg-[#0F294A] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {queueError && (
                  <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span>{queueError}</span>
                    <button
                      type="button"
                      onClick={() => fetchQueue(0)}
                      className="px-3 py-1 text-xs font-medium text-red-900 bg-red-100 hover:bg-red-200 rounded cursor-pointer whitespace-nowrap self-start sm:self-auto"
                    >
                      Coba Muat Ulang
                    </button>
                  </div>
                )}

                <div className="mt-4">
                  {queueLoading ? (
                    <div className="py-10 text-center text-sm text-slate-500">
                      Memuat antrean verifikasi dari PostgreSQL...
                    </div>
                  ) : complaints.length === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-sm text-slate-500">
                        Tidak ada permohonan yang cocok dengan filter saat ini.
                      </p>
                      {(statusFilter !== 'ALL' || searchTerm.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter('ALL');
                            setSearchTerm('');
                            fetchQueue(0, { status: 'ALL', search: '' });
                          }}
                          className="px-3.5 py-1.5 text-xs font-medium text-[#0F294A] bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          Tampilkan Semua Permohonan
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200 border-t border-slate-200">
                      {complaints.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            clearPreviewDoc();
                            setSelectedComplaint(c);
                            setVerifyFeedback(null);
                            setVerifyAction(
                              c.status === 'ACCEPTED' ? 'COMPLETED' : 'ACCEPTED'
                            );
                          }}
                          className={`py-3.5 px-2 -mx-2 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer ${
                            selectedComplaint?.id === c.id ? 'bg-slate-100/80' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="font-mono text-xs font-semibold text-[#0F294A] tabular-nums">
                                {c.ticketNumber}
                              </span>
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span className="text-sm font-medium text-slate-900">
                                {c.applicantName}
                              </span>
                              {c.applicantNik && (
                                <>
                                  <span className="text-slate-300" aria-hidden="true">·</span>
                                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                                    {c.applicantNik}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
                              <span className="truncate max-w-md">{c.serviceType}</span>
                              {c.latestVerification?.bookingDate && (
                                <>
                                  <span className="text-slate-300" aria-hidden="true">·</span>
                                  <span className="font-mono text-emerald-700 tabular-nums">
                                    Booking: {c.latestVerification.bookingDate}
                                  </span>
                                </>
                              )}
                              {c.fileOriginalName && (
                                <>
                                  <span className="text-slate-300" aria-hidden="true">·</span>
                                  <span className="text-slate-500 truncate max-w-[180px]">
                                    Lampiran: {c.fileOriginalName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <StatusBadge status={c.status} />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearPreviewDoc();
                                setSelectedComplaint(c);
                                setVerifyFeedback(null);
                                setVerifyAction(
                                  c.status === 'ACCEPTED' ? 'COMPLETED' : 'ACCEPTED'
                                );
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Periksa Berkas
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Slide-Over Inspection & Verification Drawer */}
              {selectedComplaint && (
                <div
                  className="fixed inset-0 z-50 flex justify-end bg-slate-950/45"
                  onClick={() => {
                    clearPreviewDoc();
                    setSelectedComplaint(null);
                  }}
                >
                  <div
                    className="w-full max-w-3xl bg-white h-full overflow-y-auto shadow-2xl border-l border-slate-200 p-6 sm:p-8 space-y-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-[#0F294A]">
                            {selectedComplaint.ticketNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{selectedComplaint.serviceType}</span>
                        </div>
                        <h3 className="font-display text-lg font-bold text-slate-900 mt-1">
                          Inspeksi &amp; Keputusan Verifikator
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={selectedComplaint.status} />
                        <button
                          type="button"
                          onClick={() => {
                            clearPreviewDoc();
                            setSelectedComplaint(null);
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          aria-label="Tutup panel pemeriksaan"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div>
                          <span className="text-slate-500 block">Nama Pemohon</span>
                          <span className="font-semibold text-slate-900">
                            {selectedComplaint.applicantName}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">NIK</span>
                          <span className="font-mono text-slate-900 tabular-nums">
                            {selectedComplaint.applicantNik || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">WhatsApp</span>
                          <span className="font-mono text-slate-900 tabular-nums">
                            {selectedComplaint.applicantPhone || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Email</span>
                          <span className="text-slate-900 truncate block">
                            {selectedComplaint.applicantEmail}
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">
                          Uraian Permohonan / Pengaduan
                        </p>
                        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3.5 leading-relaxed">
                          {selectedComplaint.description}
                        </p>
                      </div>

                      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-800">
                          Berkas Lampiran Pemohon
                        </p>
                        {selectedComplaint.filePath ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={docLoading}
                                onClick={() => handleDownloadAttachment(selectedComplaint)}
                                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] disabled:opacity-60 rounded-lg cursor-pointer"
                              >
                                <Download className="w-4 h-4 shrink-0" />
                                <span className="truncate max-w-[260px]">
                                  {docLoading
                                    ? 'Memproses Berkas...'
                                    : `Unduh Lampiran (${selectedComplaint.fileOriginalName || 'Berkas'})`}
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={docLoading}
                                onClick={() => handlePreviewAttachment(selectedComplaint)}
                                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#0F294A] bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg cursor-pointer"
                              >
                                <Eye className="w-4 h-4 shrink-0" />
                                <span>Pratinjau Dokumen</span>
                              </button>
                            </div>

                            {docError && (
                              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                                {docError}
                              </div>
                            )}

                            {previewDoc && (
                              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                                <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 text-xs">
                                  <span className="font-medium text-slate-800 truncate flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5 text-[#0F294A] shrink-0" />
                                    {previewDoc.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={clearPreviewDoc}
                                    className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                                    aria-label="Tutup pratinjau"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                {previewDoc.mime.startsWith('image/') ? (
                                  <img
                                    src={previewDoc.url}
                                    alt={previewDoc.name}
                                    className="w-full max-h-[420px] object-contain bg-slate-100"
                                  />
                                ) : previewDoc.mime === 'application/pdf' ? (
                                  <iframe
                                    src={previewDoc.url}
                                    title={previewDoc.name}
                                    className="w-full h-[420px] bg-white"
                                  />
                                ) : (
                                  <div className="p-4 text-xs text-slate-600">
                                    Format berkas tidak mendukung pratinjau langsung. Silakan klik tombol Unduh Lampiran.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            {selectedComplaint.fileOriginalName
                              ? `Nama berkas tercatat: ${selectedComplaint.fileOriginalName} (data sampel awal tanpa file fisik di server).`
                              : 'Pemohon tidak mengunggah berkas lampiran pada pengajuan ini.'}
                          </p>
                        )}
                      </div>

                      {canVerify ? (
                        <form
                          onSubmit={handleVerifySubmit}
                          className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/70"
                        >
                          <h4 className="text-sm font-semibold text-slate-900">
                            Formulir Verifikasi ASN
                          </h4>

                          {verifyFeedback && (
                            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                              {verifyFeedback}
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Keputusan Verifikasi
                              </label>
                              <select
                                value={verifyAction}
                                onChange={(e) =>
                                  setVerifyAction(e.target.value as any)
                                }
                                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                              >
                                <option value="IN_REVIEW">
                                  Sedang Diverifikasi (Dalam Pemeriksaan)
                                </option>
                                <option value="ACCEPTED">
                                  Setujui &amp; Tetapkan Tanggal Booking Selesai
                                </option>
                                <option value="REJECTED">
                                  Tolak / Kembalikan dengan Alasan Resmi
                                </option>
                                <option value="COMPLETED">
                                  Selesai Diterbitkan / Siap Diserahkan
                                </option>
                              </select>
                            </div>

                            {verifyAction === 'ACCEPTED' && (
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                  Tanggal Booking / Penyelesaian (Wajib) *
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={verifyBookingDate}
                                  onChange={(e) => setVerifyBookingDate(e.target.value)}
                                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">
                              {verifyAction === 'REJECTED'
                                ? 'Alasan Penolakan Resmi (Wajib) *'
                                : 'Catatan Verifikator untuk Pemohon'}
                            </label>
                            <textarea
                              rows={3}
                              required={verifyAction === 'REJECTED'}
                              value={verifyReason}
                              onChange={(e) => setVerifyReason(e.target.value)}
                              placeholder={
                                verifyAction === 'REJECTED'
                                  ? 'Jelaskan dokumen yang kurang atau tidak terbaca agar pemohon dapat melengkapi...'
                                  : 'Catatan tambahan lokasi loket MPP Sidoarjo atau instruksi pengambilan...'
                              }
                              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <span className="text-[11px] text-slate-500">
                              Otomatis mengirim WhatsApp &amp; Email ke pemohon.
                            </span>
                            <button
                              type="submit"
                              disabled={verifySaving}
                              className="px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                            >
                              {verifySaving ? 'Menyimpan...' : 'Simpan & Kirim Notifikasi'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="border border-slate-200 rounded-xl p-5 text-xs text-slate-600 bg-slate-50">
                          Mode Pimpinan / Viewer hanya memiliki akses pemantauan dan pelaporan. Keputusan verifikasi hanya dapat dilakukan oleh Verifikator ASN atau System Admin.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ANALYTICS & PERIODIC REPORTS */}
          {activeTab === 'reports' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">
                    Modul Pelaporan Berkala &amp; Kinerja Pimpinan
                  </p>
                  <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                    Rekapitulasi Bulanan, Triwulan &amp; Semester
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={periodType}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setPeriodType(val);
                      if (val === 'quarterly') setPeriodValue(1);
                      else if (val === 'semester') setPeriodValue(1);
                      else if (val === 'monthly') setPeriodValue(new Date().getMonth() + 1);
                    }}
                    className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="all">Semua Periode</option>
                    <option value="monthly">Bulanan</option>
                    <option value="quarterly">Triwulan</option>
                    <option value="semester">Semester</option>
                  </select>

                  <select
                    value={reportYear}
                    onChange={(e) => setReportYear(Number(e.target.value))}
                    className="px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    {[2026, 2025, 2024].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>

                  {periodType === 'monthly' && (
                    <select
                      value={periodValue}
                      onChange={(e) => setPeriodValue(Number(e.target.value))}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {new Date(2026, m - 1, 1).toLocaleString('id-ID', {
                            month: 'long',
                          })}
                        </option>
                      ))}
                    </select>
                  )}

                  {periodType === 'quarterly' && (
                    <select
                      value={periodValue}
                      onChange={(e) => setPeriodValue(Number(e.target.value))}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      <option value={1}>Triwulan I (Jan–Mar)</option>
                      <option value={2}>Triwulan II (Apr–Jun)</option>
                      <option value={3}>Triwulan III (Jul–Sep)</option>
                      <option value={4}>Triwulan IV (Okt–Des)</option>
                    </select>
                  )}

                  {periodType === 'semester' && (
                    <select
                      value={periodValue}
                      onChange={(e) => setPeriodValue(Number(e.target.value))}
                      className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      <option value={1}>Semester I (Jan–Jun)</option>
                      <option value={2}>Semester II (Jul–Des)</option>
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ekspor Rekap CSV</span>
                  </button>
                </div>
              </div>

              {reportLoading || !report ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Menyusun rekapitulasi laporan...
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-600">
                    Periode Aktif: <span className="text-slate-900 font-semibold">{report.periodLabel}</span>
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { label: 'Total Pengajuan', val: report.summary.total, cls: 'text-[#0F294A]' },
                      {
                        label: 'Dalam Proses',
                        val: report.summary.pending + report.summary.inReview,
                        cls: 'text-amber-700',
                      },
                      { label: 'Disetujui (Booking)', val: report.summary.accepted, cls: 'text-emerald-700' },
                      { label: 'Selesai Terbit', val: report.summary.completed, cls: 'text-emerald-800' },
                      { label: 'Ditolak', val: report.summary.rejected, cls: 'text-red-700' },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="border border-slate-200 rounded-lg p-4 bg-slate-50"
                      >
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className={`mt-1 text-2xl font-mono font-bold tabular-nums ${stat.cls}`}>
                          {stat.val}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Distribusi Berdasarkan Jenis Layanan
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500">
                            <th className="py-2 pr-4 font-medium">Jenis Layanan</th>
                            <th className="py-2 px-3 font-medium text-right">Total</th>
                            <th className="py-2 px-3 font-medium text-right">Proses</th>
                            <th className="py-2 px-3 font-medium text-right">Disetujui</th>
                            <th className="py-2 px-3 font-medium text-right">Selesai</th>
                            <th className="py-2 pl-3 font-medium text-right">Ditolak</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {report.byService.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-xs text-slate-500">
                                Belum ada pengajuan pada periode yang dipilih.
                              </td>
                            </tr>
                          ) : (
                            report.byService.map((row) => (
                              <tr key={row.serviceType}>
                                <td className="py-2.5 pr-4 font-medium text-slate-800">
                                  {row.serviceType}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-right tabular-nums">
                                  {row.total}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-right tabular-nums text-amber-700">
                                  {row.pending}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-right tabular-nums text-emerald-700">
                                  {row.accepted}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-right tabular-nums text-emerald-800">
                                  {row.completed}
                                </td>
                                <td className="py-2.5 pl-3 font-mono text-right tabular-nums text-red-700">
                                  {row.rejected}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: NOTIFICATION LOGS */}
          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">
                    Riwayat Pengiriman Otomatis
                  </p>
                  <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                    Log Notifikasi WhatsApp &amp; Email
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={fetchNotifications}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                >
                  Segarkan
                </button>
              </div>

              {notifLoading ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  Memuat riwayat notifikasi...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 pr-3 font-medium">Kanal</th>
                        <th className="py-2 pr-3 font-medium">Tiket</th>
                        <th className="py-2 pr-3 font-medium">Penerima</th>
                        <th className="py-2 pr-3 font-medium">Isi Pesan</th>
                        <th className="py-2 font-medium text-right">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {notifLogs.map((n) => (
                        <tr key={n.id}>
                          <td className="py-3 pr-3 font-mono text-xs font-semibold text-[#0F294A] whitespace-nowrap">
                            {n.type} · {n.statusSent}
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs text-slate-700 whitespace-nowrap tabular-nums">
                            {n.ticketNumber || '—'}
                          </td>
                          <td className="py-3 pr-3 text-xs text-slate-700">
                            <div className="font-medium text-slate-900">{n.userName}</div>
                            <div className="font-mono text-slate-500">{n.recipient}</div>
                          </td>
                          <td className="py-3 pr-3 text-xs text-slate-600 max-w-md">
                            {n.messageContent}
                          </td>
                          <td className="py-3 font-mono text-xs text-slate-500 text-right whitespace-nowrap tabular-nums">
                            {new Date(n.timestamp).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SYSTEM ADMIN MASTER DATA & AUDIT LOGS */}
          {activeTab === 'master' && canAccessMaster && (
            <div className="space-y-6">
              {/* Master Service Types */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                  <ShieldCheck className="w-5 h-5 text-[#0F294A]" />
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Master Data Layanan &amp; SLA
                  </h2>
                </div>

                <form
                  onSubmit={handleCreateService}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4"
                >
                  <input
                    type="text"
                    required
                    value={newServiceCode}
                    onChange={(e) => setNewServiceCode(e.target.value)}
                    placeholder="Kode (mis. AKTA_NIKAH)"
                    className="md:col-span-2 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    required
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="Nama Layanan Dukcapil"
                    className="md:col-span-4 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                  />
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={newServiceSla}
                    onChange={(e) => setNewServiceSla(Number(e.target.value))}
                    placeholder="SLA (Hari)"
                    className="md:col-span-1 px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    required
                    value={newServiceDocs}
                    onChange={(e) => setNewServiceDocs(e.target.value)}
                    placeholder="Persyaratan Berkas"
                    className="md:col-span-3 px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                  />
                  <button
                    type="submit"
                    disabled={masterSaving}
                    className="md:col-span-2 px-3 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-md cursor-pointer"
                  >
                    {masterSaving ? 'Menyimpan...' : 'Tambah Layanan'}
                  </button>
                </form>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 pr-3 font-medium">Kode</th>
                        <th className="py-2 pr-3 font-medium">Nama Layanan</th>
                        <th className="py-2 pr-3 font-medium text-right">SLA</th>
                        <th className="py-2 font-medium">Persyaratan Dokumen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {masterServices.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2.5 pr-3 font-mono text-xs text-[#0F294A]">
                            {s.code}
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-slate-900">
                            {s.name}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-xs text-right tabular-nums">
                            {s.slaDays} hari
                          </td>
                          <td className="py-2.5 text-xs text-slate-600">
                            {s.requiredDocs}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Immutable Audit Trail */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-slate-900 pb-3 border-b border-slate-200">
                  Jejak Audit Sistem (Audit Logs)
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Waktu</th>
                        <th className="py-2 pr-3 font-medium">Aktor</th>
                        <th className="py-2 pr-3 font-medium">Aksi</th>
                        <th className="py-2 pr-3 font-medium">Entitas</th>
                        <th className="py-2 font-medium">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 pr-3 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                            {new Date(log.timestamp).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-800">
                            {log.actorName || 'Publik / Sistem'}
                          </td>
                          <td className="py-2.5 pr-3 font-mono font-semibold text-[#0F294A]">
                            {log.action}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-slate-600">
                            {log.entityName} ({log.entityId || '—'})
                          </td>
                          <td className="py-2.5 text-slate-600">{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PIC ACCESS CONTROL */}
          {activeTab === 'pic' && canAccessPic && <PicAccessManager />}
        </div>
      </div>
    </div>
  );
}
