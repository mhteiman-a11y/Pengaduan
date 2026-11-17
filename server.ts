import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  AuthRequest,
  optionalAuth,
  requireAuth,
  requireFeature,
  requirePic,
  requireRole,
} from './src/middleware/auth.ts';
import {
  createComplaintSubmission,
  generatePeriodicReport,
  getAdminComplaints,
  getAllServiceTypes,
  getAllUsersWithRoles,
  getAuditLogHistory,
  getComplaintsForUser,
  getNotificationHistory,
  getPublicServiceTypes,
  invitePicAuthorizedUser,
  trackComplaintsPublic,
  updateUserRoleAndStatus,
  upsertServiceType,
  verifyComplaintAction,
} from './src/db/repository.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Format berkas harus PDF, JPG, JPEG, atau PNG.'));
    }
    cb(null, true);
  },
});

app.use(express.json({ limit: '2mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SIPPANDU DUKCAPIL SIDOARJO' });
});

// Public: List active Dukcapil services & document requirements
app.get('/api/services', async (_req, res) => {
  try {
    const list = await getPublicServiceTypes();
    res.json({ services: list });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memuat layanan.' });
  }
});

// Public: Self-service ticket or NIK tracking
app.get('/api/public/track', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 4) {
      return res.status(400).json({
        error: 'Masukkan Nomor Tiket (contoh: SDK-202611-0001) atau NIK 16 digit.',
      });
    }
    const results = await trackComplaintsPublic(q);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal melacak tiket.' });
  }
});

// Citizen Online Submission (works publicly or linked to signed-in Firebase account)
app.post(
  '/api/complaints',
  optionalAuth,
  (req, res, next) => {
    upload.single('document')(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          error: err.message || 'Berkas gagal diunggah (maksimal 5 MB, PDF/JPG/PNG).',
        });
      }
      next();
    });
  },
  async (req: AuthRequest, res) => {
    try {
      const { name, nik, phone, email, serviceType, description } = req.body;

      if (!name || !nik || !phone || !email || !serviceType || !description) {
        return res.status(400).json({
          error: 'Semua kolom wajib diisi: Nama, NIK, WhatsApp, Email, Jenis Layanan, dan Uraian.',
        });
      }

      if (!/^\d{16}$/.test(String(nik).trim())) {
        return res.status(400).json({
          error: 'NIK harus terdiri dari tepat 16 digit angka.',
        });
      }

      const filePath = req.file ? `/api/uploads/${req.file.filename}` : null;
      const fileOriginalName = req.file ? req.file.originalname : null;

      const created = await createComplaintSubmission({
        authUserId: req.dbUser?.id,
        name: String(name),
        nik: String(nik),
        phone: String(phone),
        email: String(email),
        serviceType: String(serviceType),
        description: String(description),
        filePath,
        fileOriginalName,
      });

      res.status(201).json({ complaint: created });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal mengirim permohonan.' });
    }
  }
);

// Authenticated User Profile & Personal Submissions
app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.dbUser });
});

app.get('/api/me/complaints', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await getComplaintsForUser(req.dbUser!.id);
    res.json({ complaints: items });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memuat pengajuan Anda.' });
  }
});

// Secure Upload Download & Preview (ASN Verifier / Admin / Viewer with queue feature)
app.get(
  '/api/uploads/:filename',
  requireAuth,
  requireRole(['verifier', 'admin', 'viewer']),
  requireFeature('portal_asn_queue'),
  (req, res) => {
    const safeFile = path.basename(req.params.filename);
    const fullPath = path.join(uploadDir, safeFile);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Berkas lampiran tidak ditemukan di server.' });
    }
    const requestedName = req.query.name
      ? path.basename(String(req.query.name))
      : safeFile;
    if (req.query.download === '1') {
      return res.download(fullPath, requestedName);
    }
    res.sendFile(fullPath);
  }
);

// ASN Verification Queue & Management
app.get(
  '/api/admin/complaints',
  requireAuth,
  requireRole(['verifier', 'admin', 'viewer']),
  requireFeature('portal_asn_queue'),
  async (req: AuthRequest, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const items = await getAdminComplaints({ status, search });
      res.json({ complaints: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat antrean berkas.' });
    }
  }
);

// ASN Verify Decision
app.post(
  '/api/admin/verify',
  requireAuth,
  requireRole(['verifier', 'admin']),
  requireFeature('portal_asn_queue'),
  async (req: AuthRequest, res) => {
    try {
      const { complaintId, action, reason, bookingDate } = req.body;
      const allowedActions = ['IN_REVIEW', 'ACCEPTED', 'REJECTED', 'COMPLETED'];

      if (!complaintId || !allowedActions.includes(action)) {
        return res.status(400).json({ error: 'Parameter verifikasi tidak valid.' });
      }

      if (action === 'ACCEPTED' && !bookingDate) {
        return res.status(400).json({
          error: 'Tanggal booking / estimasi selesai wajib diisi saat menyetujui permohonan.',
        });
      }

      if (action === 'REJECTED' && (!reason || !String(reason).trim())) {
        return res.status(400).json({
          error: 'Alasan penolakan resmi wajib diisi agar pemohon dapat memperbaiki berkas.',
        });
      }

      const result = await verifyComplaintAction({
        complaintId: Number(complaintId),
        adminId: req.dbUser!.id,
        action,
        reason: reason ? String(reason) : undefined,
        bookingDate: bookingDate ? String(bookingDate) : null,
      });

      res.json({ result });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan verifikasi.' });
    }
  }
);

// Periodic Reports & Executive Analytics
app.get(
  '/api/admin/reports',
  requireAuth,
  requireRole(['verifier', 'admin', 'viewer']),
  requireFeature('portal_asn_reports'),
  async (req: AuthRequest, res) => {
    try {
      const periodType = (String(req.query.periodType || 'all') as
        | 'monthly'
        | 'quarterly'
        | 'semester'
        | 'all');
      const year = Number(req.query.year) || new Date().getFullYear();
      const periodValue = Number(req.query.periodValue) || 1;

      const report = await generatePeriodicReport({
        periodType,
        year,
        periodValue,
      });

      res.json({ report });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyusun laporan.' });
    }
  }
);

// CSV Export for Periodic Reports
app.get(
  '/api/admin/reports/export',
  requireAuth,
  requireRole(['verifier', 'admin', 'viewer']),
  requireFeature('portal_asn_reports'),
  async (req: AuthRequest, res) => {
    try {
      const periodType = (String(req.query.periodType || 'all') as
        | 'monthly'
        | 'quarterly'
        | 'semester'
        | 'all');
      const year = Number(req.query.year) || new Date().getFullYear();
      const periodValue = Number(req.query.periodValue) || 1;

      const report = await generatePeriodicReport({
        periodType,
        year,
        periodValue,
      });

      const escapeCsv = (val: unknown) => {
        const s = String(val ?? '').replace(/"/g, '""');
        return `"${s}"`;
      };

      const header = [
        'Nomor Tiket',
        'Nama Pemohon',
        'NIK',
        'Jenis Layanan',
        'Status',
        'Tanggal Pengajuan',
        'Pembaruan Terakhir',
      ].join(',');

      const lines = report.rows.map((r) =>
        [
          escapeCsv(r.ticketNumber),
          escapeCsv(r.applicantName),
          escapeCsv(r.applicantNik || '-'),
          escapeCsv(r.serviceType),
          escapeCsv(r.status),
          escapeCsv(new Date(r.createdAt).toISOString()),
          escapeCsv(new Date(r.updatedAt).toISOString()),
        ].join(',')
      );

      const csvContent = [header, ...lines].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rekap-sippandu-${periodType}-${year}.csv"`
      );
      res.send('\uFEFF' + csvContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal mengekspor CSV.' });
    }
  }
);

// Notifications & Audit Trail
app.get(
  '/api/admin/notifications',
  requireAuth,
  requireRole(['verifier', 'admin', 'viewer']),
  requireFeature('portal_asn_notifications'),
  async (_req, res) => {
    try {
      const items = await getNotificationHistory(60);
      res.json({ notifications: items });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat notifikasi.' });
    }
  }
);

app.get(
  '/api/admin/audit-logs',
  requireAuth,
  requireFeature('portal_asn_master'),
  async (_req, res) => {
    try {
      const logs = await getAuditLogHistory(80);
      res.json({ auditLogs: logs });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat audit log.' });
    }
  }
);

// PIC Access Control Endpoints (Exclusive to PIC / pic_access_control)
app.get(
  '/api/pic/access',
  requireAuth,
  requirePic,
  async (_req, res) => {
    try {
      const data = await getAllUsersWithRoles();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat daftar hak akses PIC.' });
    }
  }
);

app.post(
  '/api/pic/access',
  requireAuth,
  requirePic,
  async (req: AuthRequest, res) => {
    try {
      const { email, name, roleCode, isPic, allowedFeatures } = req.body;
      const saved = await invitePicAuthorizedUser({
        email: String(email || ''),
        name: String(name || ''),
        roleCode: roleCode || 'verifier',
        isPic: Boolean(isPic),
        allowedFeatures: Array.isArray(allowedFeatures) ? allowedFeatures : [],
        actorId: req.dbUser!.id,
      });
      res.status(201).json({ user: saved });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Gagal menyimpan akses petugas.' });
    }
  }
);

app.patch(
  '/api/pic/access/:id',
  requireAuth,
  requirePic,
  async (req: AuthRequest, res) => {
    try {
      const targetUserId = Number(req.params.id);
      const { roleCode, isActive, isPic, allowedFeatures } = req.body;
      const updated = await updateUserRoleAndStatus({
        targetUserId,
        roleCode,
        isActive: Boolean(isActive),
        isPic: typeof isPic === 'boolean' ? isPic : undefined,
        allowedFeatures: Array.isArray(allowedFeatures) ? allowedFeatures : undefined,
        actorId: req.dbUser!.id,
      });
      res.json({ user: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Gagal memperbarui hak akses.' });
    }
  }
);

// Backward-compatible User & Role Management protected by PIC
app.get(
  '/api/admin/users',
  requireAuth,
  requirePic,
  async (_req, res) => {
    try {
      const data = await getAllUsersWithRoles();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat daftar pengguna.' });
    }
  }
);

app.patch(
  '/api/admin/users/:id/role',
  requireAuth,
  requirePic,
  async (req: AuthRequest, res) => {
    try {
      const targetUserId = Number(req.params.id);
      const { roleCode, isActive, isPic, allowedFeatures } = req.body;
      const updated = await updateUserRoleAndStatus({
        targetUserId,
        roleCode,
        isActive: Boolean(isActive),
        isPic: typeof isPic === 'boolean' ? isPic : undefined,
        allowedFeatures: Array.isArray(allowedFeatures) ? allowedFeatures : undefined,
        actorId: req.dbUser!.id,
      });
      res.json({ user: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memperbarui pengguna.' });
    }
  }
);

// System Admin: Master Service Types
app.get(
  '/api/admin/services',
  requireAuth,
  requireFeature('portal_asn_master'),
  async (_req, res) => {
    try {
      const services = await getAllServiceTypes();
      res.json({ services });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal memuat master layanan.' });
    }
  }
);

app.post(
  '/api/admin/services',
  requireAuth,
  requireFeature('portal_asn_master'),
  async (req: AuthRequest, res) => {
    try {
      const { id, code, name, slaDays, requiredDocs, isActive } = req.body;
      if (!code || !name || !requiredDocs) {
        return res.status(400).json({ error: 'Kode, nama layanan, dan syarat berkas wajib diisi.' });
      }
      const saved = await upsertServiceType({
        id: id ? Number(id) : undefined,
        code: String(code),
        name: String(name),
        slaDays: Number(slaDays) || 3,
        requiredDocs: String(requiredDocs),
        isActive: isActive !== false,
        actorId: req.dbUser!.id,
      });
      res.json({ service: saved });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Gagal menyimpan master layanan.' });
    }
  }
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIPPANDU DUKCAPIL server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
