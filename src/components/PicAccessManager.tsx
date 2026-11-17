import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldAlert, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ADMIN_FEATURE_CATALOG,
  AdminFeatureKey,
  DbUser,
  RoleCode,
} from '../types/sippandu';

interface RoleOption {
  id: number;
  code: RoleCode;
  name: string;
  description: string;
}

export function PicAccessManager() {
  const { dbUser, authFetch } = useAuth();
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Invite / Add new officer form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleCode>('verifier');
  const [inviteIsPic, setInviteIsPic] = useState(false);
  const [inviteFeatures, setInviteFeatures] = useState<AdminFeatureKey[]>([
    'portal_asn_queue',
    'portal_asn_reports',
    'portal_asn_notifications',
  ]);
  const [inviting, setInviting] = useState(false);

  // Editing user feature matrix state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<RoleCode>('citizen');
  const [editActive, setEditActive] = useState(true);
  const [editIsPic, setEditIsPic] = useState(false);
  const [editFeatures, setEditFeatures] = useState<AdminFeatureKey[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadDirectory = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/pic/access');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat daftar PIC.');
      setRoles(data.roles || []);
      setUsers(data.users || []);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, []);

  const toggleFeature = (
    list: AdminFeatureKey[],
    setter: (next: AdminFeatureKey[]) => void,
    key: AdminFeatureKey
  ) => {
    if (list.includes(key)) {
      setter(list.filter((f) => f !== key));
    } else {
      setter([...list, key]);
    }
  };

  const applyPreset = (preset: 'verifier' | 'viewer' | 'admin' | 'citizen') => {
    if (preset === 'verifier') {
      setInviteRole('verifier');
      setInviteIsPic(false);
      setInviteFeatures([
        'portal_asn_queue',
        'portal_asn_reports',
        'portal_asn_notifications',
      ]);
    } else if (preset === 'viewer') {
      setInviteRole('viewer');
      setInviteIsPic(false);
      setInviteFeatures(['portal_asn_reports', 'portal_asn_notifications']);
    } else if (preset === 'admin') {
      setInviteRole('admin');
      setInviteIsPic(true);
      setInviteFeatures(ADMIN_FEATURE_CATALOG.map((f) => f.key));
    } else {
      setInviteRole('citizen');
      setInviteIsPic(false);
      setInviteFeatures([]);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/pic/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          roleCode: inviteRole,
          isPic: inviteIsPic,
          allowedFeatures: inviteFeatures,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan otorisasi.');

      setFeedback({
        type: 'success',
        message: `Otorisasi fitur untuk ${data.user.email} berhasil disimpan.`,
      });
      setInviteEmail('');
      setInviteName('');
      await loadDirectory();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setInviting(false);
    }
  };

  const startEditing = (u: DbUser) => {
    setEditingId(u.id);
    setEditRole(u.roleCode);
    setEditActive(u.isActive);
    setEditIsPic(u.isPic);
    setEditFeatures(u.allowedFeatures || []);
    setFeedback(null);
  };

  const handleSaveEdit = async (targetUserId: number) => {
    setSavingId(targetUserId);
    setFeedback(null);
    try {
      const res = await authFetch(`/api/pic/access/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleCode: editRole,
          isActive: editActive,
          isPic: editIsPic,
          allowedFeatures: editFeatures,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui hak akses.');

      setFeedback({
        type: 'success',
        message: `Hak akses untuk ${data.user.email} telah diperbarui.`,
      });
      setEditingId(null);
      await loadDirectory();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Invite Authorized Officer */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <p className="text-xs font-semibold text-[#0F294A]">
              Kendali Akses Terpusat · Khusus PIC Administrator
            </p>
            <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
              Menu PIC Pengelola Hak Akses Fitur Admin
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Hanya akun yang diberi otorisasi oleh PIC di bawah ini yang dapat mengakses fitur Portal ASN maupun Arsitektur &amp; SQL. Pengguna baru di luar daftar otomatis dibatasi sebagai Pemohon / Warga.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F294A] bg-slate-100 px-3 py-1.5 rounded-md whitespace-nowrap shrink-0">
            <KeyRound className="w-3.5 h-3.5" />
            <span>PIC Aktif: {dbUser?.email}</span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-700" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <form
          onSubmit={handleInviteSubmit}
          className="border border-slate-200 rounded-xl p-5 bg-slate-50/70 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#0F294A]" />
              <span>Tambah / Otorisasi Petugas Admin via Email Google</span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500">Preset:</span>
              <button
                type="button"
                onClick={() => applyPreset('verifier')}
                className="px-2 py-1 bg-white border border-slate-200 hover:border-[#0F294A] rounded cursor-pointer"
              >
                Verifikator ASN
              </button>
              <button
                type="button"
                onClick={() => applyPreset('viewer')}
                className="px-2 py-1 bg-white border border-slate-200 hover:border-[#0F294A] rounded cursor-pointer"
              >
                Pimpinan / Viewer
              </button>
              <button
                type="button"
                onClick={() => applyPreset('admin')}
                className="px-2 py-1 bg-white border border-slate-200 hover:border-[#0F294A] rounded cursor-pointer"
              >
                Admin + PIC
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Google Petugas *
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="petugas.dukcapil@gmail.com"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nama Lengkap Petugas *
              </label>
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nama ASN / Petugas"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Peran Dasar
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleCode)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F294A]"
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700">
              Pilih Fitur Admin yang Diizinkan:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {ADMIN_FEATURE_CATALOG.map((feat) => {
                const checked = inviteFeatures.includes(feat.key);
                return (
                  <label
                    key={feat.key}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                      checked
                        ? 'bg-white border-[#0F294A] text-slate-900'
                        : 'bg-white/60 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleFeature(inviteFeatures, setInviteFeatures, feat.key)
                      }
                      className="mt-0.5 accent-[#0F294A]"
                    />
                    <div>
                      <span className="font-semibold block">{feat.label}</span>
                      <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                        {feat.description}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={inviteIsPic}
                onChange={(e) => setInviteIsPic(e.target.checked)}
                className="accent-[#0F294A]"
              />
              <span>Berikan status PIC (dapat mengelola hak akses petugas lain)</span>
            </label>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
            >
              {inviting ? 'Menyimpan...' : 'Simpan Otorisasi Petugas'}
            </button>
          </div>
        </form>
      </div>

      {/* Directory & Feature Access Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-display text-lg font-bold text-slate-900">
            Matriks Hak Akses Pengguna &amp; Petugas Terdaftar
          </h3>
          <button
            type="button"
            onClick={loadDirectory}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Memuat matriks hak akses PIC...
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {users.map((u) => {
              const isEditing = editingId === u.id;
              return (
                <div key={u.id} className="py-4 space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900">
                          {u.name}
                        </span>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="text-xs font-medium text-[#0F294A]">
                          {u.isPic ? 'PIC Administrator' : u.roleName}
                        </span>
                        {!u.uid && (
                          <>
                            <span className="text-slate-300" aria-hidden="true">·</span>
                            <span className="text-[11px] text-amber-700">
                              Menunggu Login Google Pertama
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {u.email}
                        {u.nik ? ` · NIK ${u.nik}` : ''}
                      </div>
                      {!isEditing && (
                        <div className="text-xs text-slate-600 pt-1">
                          Fitur Diizinkan:{' '}
                          {u.isPic ? (
                            <span className="font-medium text-emerald-800">
                              Seluruh Fitur Admin &amp; Menu PIC
                            </span>
                          ) : u.allowedFeatures && u.allowedFeatures.length > 0 ? (
                            <span className="font-medium text-slate-800">
                              {u.allowedFeatures
                                .map(
                                  (k) =>
                                    ADMIN_FEATURE_CATALOG.find((f) => f.key === k)
                                      ?.label || k
                                )
                                .join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              Tidak ada akses admin (Hanya Portal Warga)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        }`}
                      >
                        {u.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={() => startEditing(u)}
                          className="px-3 py-1.5 text-xs font-medium text-[#0F294A] bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          Atur Hak Akses
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Peran Sistem
                          </label>
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as RoleCode)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                          >
                            {roles.map((r) => (
                              <option key={r.code} value={r.code}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="inline-flex items-center gap-2 font-medium text-slate-800 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editActive}
                              onChange={(e) => setEditActive(e.target.checked)}
                              className="accent-[#0F294A]"
                            />
                            <span>Status Akun Aktif</span>
                          </label>
                        </div>
                        <div className="flex items-end">
                          <label className="inline-flex items-center gap-2 font-medium text-slate-800 py-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editIsPic}
                              onChange={(e) => setEditIsPic(e.target.checked)}
                              className="accent-[#0F294A]"
                            />
                            <span>Jadikan PIC Pengelola Akses</span>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ADMIN_FEATURE_CATALOG.map((feat) => {
                          const checked = editFeatures.includes(feat.key);
                          return (
                            <label
                              key={feat.key}
                              className="flex items-center gap-2 p-2.5 rounded-md border border-slate-200 bg-white text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleFeature(
                                    editFeatures,
                                    setEditFeatures,
                                    feat.key
                                  )
                                }
                                className="accent-[#0F294A]"
                              />
                              <span className="font-medium text-slate-800">
                                {feat.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => handleSaveEdit(u.id)}
                          className="px-4 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] disabled:opacity-60 rounded-md cursor-pointer"
                        >
                          {savingId === u.id ? 'Menyimpan...' : 'Simpan Perubahan Akses'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
