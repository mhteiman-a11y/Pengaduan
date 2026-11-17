export type RoleCode = 'citizen' | 'verifier' | 'admin' | 'viewer';

export type AdminFeatureKey =
  | 'portal_asn_queue'
  | 'portal_asn_reports'
  | 'portal_asn_notifications'
  | 'portal_asn_master'
  | 'architecture_sql'
  | 'pic_access_control';

export const ADMIN_FEATURE_CATALOG: Array<{
  key: AdminFeatureKey;
  label: string;
  description: string;
}> = [
  {
    key: 'portal_asn_queue',
    label: 'Antrean & Verifikasi Berkas',
    description: 'Melihat antrean pengajuan, unduh/pratinjau lampiran, dan menetapkan keputusan atau tanggal booking.',
  },
  {
    key: 'portal_asn_reports',
    label: 'Analitik & Laporan Berkala',
    description: 'Melihat statistik kinerja bulanan, triwulan, semester, serta ekspor file CSV.',
  },
  {
    key: 'portal_asn_notifications',
    label: 'Log Notifikasi WhatsApp & Email',
    description: 'Memantau riwayat pengiriman notifikasi otomatis kepada pemohon.',
  },
  {
    key: 'portal_asn_master',
    label: 'Master Layanan & Jejak Audit',
    description: 'Mengelola daftar jenis layanan, target SLA, dan membaca audit log sistem.',
  },
  {
    key: 'architecture_sql',
    label: 'Arsitektur & Skema SQL',
    description: 'Mengakses halaman cetak biru arsitektur sistem dan skrip migrasi PostgreSQL.',
  },
  {
    key: 'pic_access_control',
    label: 'Menu PIC (Pengelola Hak Akses)',
    description: 'Menambah akun petugas dan mengatur hak akses fitur admin bagi pengguna lain.',
  },
];

export type ComplaintStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'COMPLETED';

export interface DbUser {
  id: number;
  uid: string | null;
  name: string;
  nik: string | null;
  phone: string | null;
  email: string;
  roleId: number;
  isActive: boolean;
  isPic: boolean;
  allowedFeatures: AdminFeatureKey[];
  roleCode: RoleCode;
  roleName: string;
  createdAt?: string;
}

export interface ServiceType {
  id: number;
  code: string;
  name: string;
  slaDays: number;
  requiredDocs: string;
  isActive: boolean;
}

export interface VerificationItem {
  id: number;
  action: ComplaintStatus;
  reason: string | null;
  bookingDate: string | null;
  timestamp: string;
  verifierName?: string;
}

export interface PublicTrackResult {
  id: number;
  ticketNumber: string;
  serviceType: string;
  description: string;
  status: ComplaintStatus;
  fileOriginalName: string | null;
  createdAt: string;
  updatedAt: string;
  maskedApplicant: string;
  maskedNik: string;
  bookingDate: string | null;
  reason: string | null;
  verifications: VerificationItem[];
}

export interface AdminComplaint {
  id: number;
  ticketNumber: string;
  userId: number;
  serviceType: string;
  description: string;
  filePath: string | null;
  fileOriginalName: string | null;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
  applicantName: string;
  applicantNik: string | null;
  applicantPhone: string | null;
  applicantEmail: string;
  latestVerification: VerificationItem | null;
  verifications: VerificationItem[];
}

export interface PeriodicReport {
  periodLabel: string;
  periodType: 'monthly' | 'quarterly' | 'semester' | 'all';
  year: number;
  periodValue: number;
  summary: {
    total: number;
    pending: number;
    inReview: number;
    accepted: number;
    rejected: number;
    completed: number;
  };
  byService: Array<{
    serviceType: string;
    total: number;
    accepted: number;
    rejected: number;
    completed: number;
    pending: number;
  }>;
  rows: Array<{
    id: number;
    ticketNumber: string;
    serviceType: string;
    status: ComplaintStatus;
    createdAt: string;
    updatedAt: string;
    applicantName: string;
    applicantNik: string | null;
  }>;
}

export interface NotificationLog {
  id: number;
  type: 'WHATSAPP' | 'EMAIL';
  recipient: string;
  messageContent: string;
  statusSent: string;
  timestamp: string;
  userName: string;
  ticketNumber: string | null;
}

export interface AuditLogItem {
  id: number;
  action: string;
  entityName: string;
  entityId: string | null;
  details: string | null;
  timestamp: string;
  actorName: string | null;
  actorEmail: string | null;
}
