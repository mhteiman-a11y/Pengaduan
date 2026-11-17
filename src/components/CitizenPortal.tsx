import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  FileUp,
  Mail,
  MessageSquare,
  Search,
  ShieldAlert,
  Building2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PublicTrackResult, ServiceType } from '../types/sippandu';
import { StatusBadge } from './StatusBadge';

interface CitizenPortalProps {
  onOpenAsnPortal: () => void;
}

export function CitizenPortal({ onOpenAsnPortal }: CitizenPortalProps) {
  const { dbUser, idToken, authFetch, getFreshToken } = useAuth();
  const [services, setServices] = useState<ServiceType[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Tracking state
  const [trackQuery, setTrackQuery] = useState('SDK-202611-0001');
  const [trackResults, setTrackResults] = useState<PublicTrackResult[] | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Submission form state
  const [name, setName] = useState('');
  const [nik, setNik] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketNumber: string;
    serviceType: string;
    notificationsDispatched: string[];
  } | null>(null);

  // Authenticated citizen submissions
  const [myComplaints, setMyComplaints] = useState<any[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const loadServices = async (attempt = 0) => {
    if (attempt === 0) {
      setServicesLoading(true);
      setServicesError(null);
    }
    try {
      const res = await fetch('/api/services');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat daftar layanan kependudukan.');
      }
      const list: ServiceType[] = Array.isArray(data.services) ? data.services : [];
      setServices(list);
      setServicesError(null);
      if (list.length > 0) {
        setServiceType((prev) => prev || list[0].name);
      }
      setServicesLoading(false);
    } catch (err: any) {
      if (attempt < 2) {
        setTimeout(() => loadServices(attempt + 1), 1500 * (attempt + 1));
        return;
      }
      setServices([]);
      setServicesError(err?.message || 'Gagal memuat daftar layanan kependudukan.');
      setServicesLoading(false);
    }
  };

  useEffect(() => {
    loadServices(0);
  }, []);

  useEffect(() => {
    if (dbUser) {
      if (!name) setName(dbUser.name || '');
      if (!email) setEmail(dbUser.email || '');
      if (!nik && dbUser.nik) setNik(dbUser.nik);
      if (!phone && dbUser.phone) setPhone(dbUser.phone);
    }
  }, [dbUser]);

  const fetchMyComplaints = async () => {
    if (!idToken) return;
    setLoadingMine(true);
    try {
      const res = await authFetch('/api/me/complaints');
      if (res.ok) {
        const data = await res.json();
        setMyComplaints(data.complaints || []);
      }
    } finally {
      setLoadingMine(false);
    }
  };

  useEffect(() => {
    if (idToken) {
      fetchMyComplaints();
    } else {
      setMyComplaints([]);
    }
  }, [idToken]);

  const runTracking = async (queryOverride?: string, attempt = 0) => {
    const q = (queryOverride ?? trackQuery).trim();
    if (!q) {
      setTrackError('Masukkan Nomor Tiket atau NIK 16 digit.');
      return;
    }
    if (attempt === 0) {
      setTrackQuery(q);
      setTrackLoading(true);
      setTrackError(null);
    }
    try {
      const res = await fetch(`/api/public/track?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mencari tiket.');
      }
      setTrackResults(Array.isArray(data.results) ? data.results : []);
      setTrackError(null);
      setTrackLoading(false);
    } catch (err: any) {
      if (attempt < 2) {
        setTimeout(() => runTracking(q, attempt + 1), 1500 * (attempt + 1));
        return;
      }
      setTrackError(err.message || 'Terjadi kesalahan saat melacak tiket.');
      setTrackResults(null);
      setTrackLoading(false);
    }
  };

  useEffect(() => {
    runTracking('SDK-202611-0001', 0);
  }, []);

  const selectedServiceMeta = services.find((s) => s.name === serviceType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmittedTicket(null);

    if (!/^\d{16}$/.test(nik.trim())) {
      setSubmitError('NIK harus berisi tepat 16 digit angka sesuai KTP/KK.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('nik', nik.trim());
      formData.append('phone', phone.trim());
      formData.append('email', email.trim());
      formData.append('serviceType', serviceType);
      formData.append('description', description.trim());
      if (file) {
        formData.append('document', file);
      }

      const freshToken = await getFreshToken();
      const headers: Record<string, string> = {};
      if (freshToken) {
        headers.Authorization = `Bearer ${freshToken}`;
      }

      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim permohonan.');
      }

      const created = data.complaint;
      setSubmittedTicket({
        ticketNumber: created.ticketNumber,
        serviceType: created.serviceType,
        notificationsDispatched: created.notificationsDispatched || ['WHATSAPP', 'EMAIL'],
      });
      setDescription('');
      setFile(null);
      await runTracking(created.ticketNumber);
      if (idToken) await fetchMyComplaints();
    } catch (err: any) {
      setSubmitError(err.message || 'Gagal memproses permohonan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-16 pb-20">
      {/* Hero Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-6 sm:p-10">
            <div className="space-y-5">
              <p className="text-xs font-medium tracking-wide text-[#0F294A]">
                Dinas Kependudukan dan Pencatatan Sipil · Kabupaten Sidoarjo
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-900 leading-[1.15] text-balance">
                Pelayanan Pengaduan dan Permohonan Data Kependudukan Tanpa Antre
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Ajukan permohonan dokumen kependudukan atau pengaduan anomali NIK secara daring, pantau progres verifikasi secara real-time, dan terima kepastian jadwal penyelesaian melalui WhatsApp serta Email.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="#pengajuan"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Ajukan Permohonan Online</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#lacak"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#0F294A] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Search className="w-4 h-4" />
                  <span>Lacak Status Tiket</span>
                </a>
                <button
                  type="button"
                  onClick={onOpenAsnPortal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 hover:text-[#0F294A] underline-offset-4 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Ruang Kerja Verifikator ASN</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Mal Pelayanan Publik Sidoarjo</span>
                <span aria-hidden="true">·</span>
                <span>Lacak via Nomor Tiket atau NIK</span>
                <span aria-hidden="true">·</span>
                <span>Notifikasi Otomatis WhatsApp &amp; Email</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-[#0F294A] relative">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/sidoarjo_civic_hall_1794888273511.jpg"
                  alt="Gedung Mal Pelayanan Publik Dinas Kependudukan dan Pencatatan Sipil Kabupaten Sidoarjo"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full lg:h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-white bg-gradient-to-br from-[#0A1D37] to-[#163A66]">
                  <Building2 className="w-12 h-12 mb-3 text-slate-200" />
                  <p className="font-display font-semibold text-lg">
                    Mal Pelayanan Publik Kabupaten Sidoarjo
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    Jl. Lingkar Timur, Rangkahkidul, Sidoarjo
                  </p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent p-5">
                <p className="text-xs font-medium text-slate-200">
                  Layanan Terpadu Dispendukcapil Sidoarjo
                </p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  Transparansi Proses Verifikasi &amp; Kepastian Tanggal Penyelesaian
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column Service SLA Strip */}
        {servicesLoading ? (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((slot) => (
              <div
                key={slot}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 animate-pulse"
              >
                <div className="h-3 w-24 bg-slate-200 rounded" />
                <div className="h-4 w-40 bg-slate-200 rounded" />
                <div className="h-3 w-full bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        ) : servicesError ? (
          <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-amber-900">
              {servicesError} Pastikan koneksi database aktif lalu muat ulang daftar layanan.
            </p>
            <button
              type="button"
              onClick={() => loadServices(0)}
              className="px-3 py-1.5 text-xs font-medium text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-md cursor-pointer whitespace-nowrap shrink-0"
            >
              Muat Ulang Layanan
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {services.slice(0, 4).map((srv, idx) => (
              <button
                key={srv.id}
                type="button"
                onClick={() => {
                  setServiceType(srv.name);
                  document.getElementById('pengajuan')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="text-left bg-white border border-slate-200 hover:border-[#0F294A] rounded-xl p-4 transition-colors cursor-pointer"
              >
                <div className="text-xs font-mono text-slate-500 tabular-nums">
                  0{idx + 1} · SLA {srv.slaDays} Hari Kerja
                </div>
                <div className="mt-1.5 font-display font-semibold text-sm text-slate-900">
                  {srv.name}
                </div>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                  {srv.requiredDocs}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Self-Service Tracking Section */}
      <section id="lacak" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200">
            <div className="space-y-1.5 max-w-2xl">
              <h2 className="font-display text-2xl font-bold text-slate-900">
                Pelacakan Mandiri Status Permohonan
              </h2>
              <p className="text-sm text-slate-600">
                Masukkan Nomor Tiket (contoh: <span className="font-mono text-slate-800">SDK-202611-0001</span>) atau NIK 16 digit untuk melihat status verifikasi berkas dan tanggal booking pengambilan tanpa perlu menelepon atau datang ke kantor.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runTracking();
              }}
              className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto lg:min-w-[460px]"
            >
              <input
                type="text"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                placeholder="Masukkan Nomor Tiket atau 16 digit NIK..."
                aria-label="Nomor Tiket atau NIK"
                className="flex-1 px-3.5 py-2.5 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white"
              />
              <button
                type="submit"
                disabled={trackLoading}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#0F294A] hover:bg-[#163A66] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>{trackLoading ? 'Mencari...' : 'Cek Status'}</span>
              </button>
            </form>
          </div>

          {/* Quick sample ticket selectors */}
          <div className="pt-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>Contoh Tiket Uji:</span>
            {['SDK-202611-0001', 'SDK-202611-0002', 'SDK-202611-0003', 'SDK-202611-0004'].map(
              (sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => runTracking(sample)}
                  className={`px-2.5 py-1 font-mono rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    trackQuery.toUpperCase() === sample
                      ? 'bg-[#0F294A] text-white border-[#0F294A]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {sample}
                </button>
              )
            )}
          </div>

          {trackError && (
            <div className="mt-5 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>{trackError}</span>
              <button
                type="button"
                onClick={() => runTracking(trackQuery, 0)}
                className="px-3 py-1.5 text-xs font-medium text-red-900 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {trackLoading && (
            <div className="mt-6 p-6 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-600">
              Memuat status tiket dan riwayat verifikasi dari server...
            </div>
          )}

          {trackResults && trackResults.length === 0 && !trackLoading && (
            <div className="mt-6 p-8 text-center rounded-lg border border-slate-200 bg-slate-50">
              <p className="text-sm font-semibold text-slate-900">
                Tiket atau NIK tidak ditemukan dalam sistem.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Periksa kembali penulisan Nomor Tiket (format SDK-YYYYMM-XXXX) atau NIK 16 digit Anda.
              </p>
            </div>
          )}

          {trackResults && trackResults.length > 0 && (
            <div className="mt-6 space-y-6">
              {trackResults.map((item) => (
                <div
                  key={item.id}
                  className="border border-slate-200 rounded-xl p-5 sm:p-6 bg-slate-50/60"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                    <div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-sm text-[#0F294A] tabular-nums">
                          {item.ticketNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Pemohon: {item.maskedApplicant}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">NIK {item.maskedNik}</span>
                      </div>
                      <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">
                        {item.serviceType}
                      </h3>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 space-y-3">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {item.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 tabular-nums">
                        <span>
                          Diajukan:{' '}
                          {new Date(item.createdAt).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                        {item.fileOriginalName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Lampiran: {item.fileOriginalName}</span>
                          </>
                        )}
                      </div>

                      {item.bookingDate && (
                        <div className="mt-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                          <CalendarCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-emerald-900">
                              Tanggal Booking / Perkiraan Selesai
                            </p>
                            <p className="text-base font-display font-bold text-emerald-800 mt-0.5 tabular-nums">
                              {new Date(item.bookingDate).toLocaleDateString('id-ID', {
                                weekday: 'long',
                                day: '2-digit',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>
                            {item.reason && (
                              <p className="text-xs text-emerald-800 mt-1">{item.reason}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {item.status === 'REJECTED' && item.reason && (
                        <div className="mt-3 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
                          <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-red-900">
                              Catatan Penolakan Resmi Verifikator
                            </p>
                            <p className="text-sm text-red-800 mt-0.5">{item.reason}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-4">
                      <h4 className="text-xs font-semibold text-slate-900 mb-3">
                        Riwayat Verifikasi Petugas
                      </h4>
                      {item.verifications.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Berkas berada dalam antrean verifikasi ASN Dispendukcapil Sidoarjo.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {item.verifications.map((v) => (
                            <div
                              key={v.id}
                              className="pb-3 last:pb-0 border-b last:border-b-0 border-slate-100"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-slate-800">{v.action}</span>
                                <span className="font-mono text-slate-500 tabular-nums">
                                  {new Date(v.timestamp).toLocaleDateString('id-ID', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </div>
                              {v.reason && (
                                <p className="text-xs text-slate-600 mt-1">{v.reason}</p>
                              )}
                              {v.verifierName && (
                                <p className="text-[11px] text-slate-400 mt-1">
                                  Petugas: {v.verifierName}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Online Submission Form Section */}
      <section id="pengajuan" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-5">
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Formulir Pengajuan Online
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Lengkapi identitas diri sesuai Kartu Keluarga dan unggah berkas pendukung dalam format PDF, JPG, atau PNG (maksimal 5 MB). Nomor tiket dan konfirmasi akan otomatis dikirimkan ke WhatsApp dan Email Anda.
            </p>

            {selectedServiceMeta && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                <p className="text-xs font-semibold text-[#0F294A]">
                  Persyaratan Layanan Terpilih
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedServiceMeta.name}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedServiceMeta.requiredDocs}
                </p>
                <p className="text-xs font-mono text-slate-500 pt-1 tabular-nums">
                  Estimasi Standar Pelayanan (SLA): {selectedServiceMeta.slaDays} Hari Kerja
                </p>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-900">
                Notifikasi Terintegrasi
              </p>
              <div className="flex items-start gap-2.5 text-xs text-slate-600">
                <MessageSquare className="w-4 h-4 text-[#0F294A] shrink-0 mt-0.5" />
                <span>
                  Pembaruan status &amp; jadwal booking dikirim otomatis melalui WhatsApp ke nomor pemohon.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-600">
                <Mail className="w-4 h-4 text-[#0F294A] shrink-0 mt-0.5" />
                <span>
                  Bukti penerimaan tiket dan keputusan verifikasi dikirim ke alamat Email terdaftar.
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            {submittedTicket && (
              <div className="mb-6 p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                  <span>Permohonan Berhasil Terdaftar di Sistem SIPPANDU</span>
                </div>
                <p className="text-sm text-emerald-800">
                  Nomor Tiket Anda:{' '}
                  <span className="font-mono font-bold text-base text-emerald-950 select-all">
                    {submittedTicket.ticketNumber}
                  </span>
                </p>
                <p className="text-xs text-emerald-800">
                  Notifikasi konfirmasi telah dikirim melalui{' '}
                  {submittedTicket.notificationsDispatched.join(' & ')}. Status tiket telah ditampilkan pada panel pelacakan di atas.
                </p>
              </div>
            )}

            {submitError && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Nama Lengkap Pemohon *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Siti Rahmawati"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    NIK (16 Digit) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={16}
                    value={nik}
                    onChange={(e) => setNik(e.target.value.replace(/\D/g, ''))}
                    placeholder="3515xxxxxxxxxxxx"
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Nomor WhatsApp Aktif *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Alamat Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Jenis Layanan / Pengaduan Kependudukan *
                  </label>
                  {servicesError && (
                    <button
                      type="button"
                      onClick={() => loadServices(0)}
                      className="text-xs font-medium text-[#0F294A] hover:underline cursor-pointer"
                    >
                      Muat Ulang Daftar
                    </button>
                  )}
                </div>
                <select
                  required
                  disabled={servicesLoading || services.length === 0}
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white disabled:opacity-70"
                >
                  {servicesLoading ? (
                    <option value="">Memuat daftar layanan kependudukan...</option>
                  ) : services.length === 0 ? (
                    <option value="">Daftar layanan belum tersedia — klik Muat Ulang</option>
                  ) : (
                    services.map((srv) => (
                      <option key={srv.id} value={srv.name}>
                        {srv.name} (SLA {srv.slaDays} Hari)
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Uraian Permohonan / Detail Pengaduan *
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan keperluan dokumen, alamat kecamatan domisili di Kabupaten Sidoarjo, atau kendala data NIK..."
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Unggah Berkas Pendukung (PDF, JPG, PNG · Maks. 5 MB)
                </label>
                <label className="flex items-center justify-between gap-4 px-4 py-3.5 border border-dashed border-slate-300 hover:border-[#0F294A] rounded-lg bg-slate-50 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileUp className="w-5 h-5 text-[#0F294A] shrink-0" />
                    <span className="text-sm text-slate-700 truncate">
                      {file ? file.name : 'Pilih berkas scan KK / KTP / Surat Pengantar...'}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[#0F294A] whitespace-nowrap shrink-0">
                    Pilih File
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Data dilindungi standar keamanan administrasi kependudukan Kabupaten Sidoarjo.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#0F294A] hover:bg-[#163A66] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{submitting ? 'Mengirim Berkas...' : 'Kirim Permohonan'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Signed-in Citizen Submission History */}
      {dbUser && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Riwayat Pengajuan Akun ({dbUser.email})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Daftar permohonan yang dikirim menggunakan akun Google Anda.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchMyComplaints}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
              >
                Muat Ulang
              </button>
            </div>

            {loadingMine ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Memuat riwayat pengajuan...
              </div>
            ) : myComplaints.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Belum ada pengajuan yang ditautkan ke akun Google ini.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Nomor Tiket</th>
                      <th className="py-2.5 pr-4 font-medium">Layanan</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <th className="py-2.5 pr-4 font-medium">Tanggal Booking</th>
                      <th className="py-2.5 font-medium text-right">Tanggal Ajuan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myComplaints.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4 font-mono font-medium text-[#0F294A] tabular-nums">
                          <button
                            type="button"
                            onClick={() => {
                              runTracking(c.ticketNumber);
                              document
                                .getElementById('lacak')
                                ?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="hover:underline cursor-pointer"
                          >
                            {c.ticketNumber}
                          </button>
                        </td>
                        <td className="py-3 pr-4 text-slate-800">{c.serviceType}</td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-700 tabular-nums">
                          {c.latestVerification?.bookingDate || '—'}
                        </td>
                        <td className="py-3 font-mono text-xs text-slate-500 text-right tabular-nums">
                          {new Date(c.createdAt).toLocaleDateString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
