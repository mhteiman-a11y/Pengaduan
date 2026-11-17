import { useState } from 'react';
import { Check, Copy, Database, Layers, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminLoginGate } from './AdminLoginGate';

const SQL_MIGRATION_SNIPPET = `-- SIPPANDU DUKCAPIL SIDOARJO (PostgreSQL Schema)
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  uid TEXT UNIQUE,
  name TEXT NOT NULL,
  nik TEXT UNIQUE,
  phone TEXT,
  email TEXT NOT NULL,
  role_id INTEGER NOT NULL DEFAULT 1 REFERENCES roles(id),
  password TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE complaints (
  id SERIAL PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  file_path TEXT,
  file_original_name TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE verifications (
  id SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  reason TEXT,
  booking_date DATE,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  complaint_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message_content TEXT NOT NULL,
  status_sent TEXT NOT NULL DEFAULT 'SENT',
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);`;

interface ArchitectureBlueprintProps {
  onBackToCitizen: () => void;
}

export function ArchitectureBlueprint({ onBackToCitizen }: ArchitectureBlueprintProps) {
  const { dbUser } = useAuth();
  const [copied, setCopied] = useState(false);

  const canViewArch = Boolean(
    dbUser &&
      (dbUser.isPic || dbUser.allowedFeatures?.includes('architecture_sql'))
  );

  if (!canViewArch) {
    return (
      <AdminLoginGate
        targetLabel="Arsitektur Sistem & Skema SQL"
        targetDescription="Dokumentasi arsitektur teknis, alur kerja integrasi, dan skrip DDL migrasi database PostgreSQL hanya dapat diakses oleh Administrator Sistem yang diotorisasi oleh PIC."
        allowedRoles={['admin', 'verifier', 'viewer']}
        requiredFeatures={['architecture_sql']}
        onBackToCitizen={onBackToCitizen}
      />
    );
  }

  const copySql = async () => {
    await navigator.clipboard.writeText(SQL_MIGRATION_SNIPPET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-semibold text-[#0F294A]">
            Cetak Biru Teknis &amp; Spesifikasi Sistem · Khusus System Admin
          </p>
          <h2 className="font-display text-2xl font-bold text-slate-900 mt-1">
            Arsitektur, Alur Kerja, dan Skema PostgreSQL SIPPANDU DUKCAPIL
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-3xl">
            Ringkasan arsitektur sistem e-Government Kabupaten Sidoarjo yang menghubungkan portal warga, ruang verifikasi ASN, gateway notifikasi otomatis, dan basis data relasional PostgreSQL.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#0F294A] font-semibold text-sm">
              <Layers className="w-4 h-4" />
              <span>01. Alur Pengajuan &amp; Pelacakan</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Warga mengisi data NIK, layanan, dan mengunggah berkas PDF/JPG. Sistem menerbitkan nomor tiket unik <span className="font-mono">SDK-YYYYMM-XXXX</span>, mencatat log notifikasi awal, dan menyediakan pelacakan publik berbasis NIK/Tiket.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#0F294A] font-semibold text-sm">
              <Server className="w-4 h-4" />
              <span>02. Verifikasi ASN &amp; Booking Date</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Verifikator ASN memeriksa lampiran melalui endpoint terlindungi RBAC, lalu menetapkan <span className="font-mono">ACCEPTED</span> dengan tanggal booking penyelesaian atau <span className="font-mono">REJECTED</span> beserta alasan resmi, memicu WhatsApp &amp; Email otomatis.
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#0F294A] font-semibold text-sm">
              <Database className="w-4 h-4" />
              <span>03. Rekapitulasi &amp; Jejak Audit</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pimpinan dan Verifikator mengakses agregasi Bulanan, Triwulan, dan Semester lengkap dengan ekspor CSV UTF-8. Setiap perubahan status dan peran direkam secara permanen ke tabel <span className="font-mono">audit_logs</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              Skrip Migrasi PostgreSQL (DDL)
            </h3>
            <p className="text-xs text-slate-500">
              Relasi lengkap untuk tabel roles, users, complaints, verifications, notifications, dan audit_logs.
            </p>
          </div>
          <button
            type="button"
            onClick={copySql}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F294A] hover:bg-[#163A66] rounded-lg cursor-pointer whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Tersalin' : 'Salin Skrip SQL'}</span>
          </button>
        </div>

        <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
          <code>{SQL_MIGRATION_SNIPPET}</code>
        </pre>
      </div>
    </div>
  );
}
