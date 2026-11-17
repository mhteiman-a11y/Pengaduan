import { db } from '../db/index.ts';
import {
  auditLogs,
  complaints,
  notifications,
  roles,
  serviceTypes,
  users,
  verifications,
} from '../db/schema.ts';
import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';

export type RoleCode = 'citizen' | 'verifier' | 'admin' | 'viewer';

export type AdminFeatureKey =
  | 'portal_asn_queue'
  | 'portal_asn_reports'
  | 'portal_asn_notifications'
  | 'portal_asn_master'
  | 'architecture_sql'
  | 'pic_access_control';

export const ALL_ADMIN_FEATURES: AdminFeatureKey[] = [
  'portal_asn_queue',
  'portal_asn_reports',
  'portal_asn_notifications',
  'portal_asn_master',
  'architecture_sql',
  'pic_access_control',
];

const PIC_BOOTSTRAP_EMAILS = new Set(['mhteiman@gmail.com']);

export function parseAllowedFeatures(raw: string | null | undefined): AdminFeatureKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f): f is AdminFeatureKey =>
      ALL_ADMIN_FEATURES.includes(f as AdminFeatureKey)
    );
  } catch {
    return [];
  }
}

export async function ensureBaseRoles() {
  try {
    const existing = await db.select().from(roles);
    if (existing.length === 0) {
      await db
        .insert(roles)
        .values([
          {
            id: 1,
            code: 'citizen',
            name: 'Pemohon / Warga',
            description: 'Mengajukan permohonan dan pengaduan kependudukan serta melacak status tiket.',
          },
          {
            id: 2,
            code: 'verifier',
            name: 'Verifikator ASN',
            description: 'Memeriksa berkas, memverifikasi permohonan, menetapkan tanggal booking/selesai, dan mengekspor laporan.',
          },
          {
            id: 3,
            code: 'admin',
            name: 'System Admin',
            description: 'Mengelola master data layanan, hak akses pengguna, dan konfigurasi sistem.',
          },
          {
            id: 4,
            code: 'viewer',
            name: 'Pimpinan / Viewer',
            description: 'Memantau dashboard analitik eksekutif, SLA layanan, dan rekapitulasi berkala.',
          },
        ])
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error('Database query failed in ensureBaseRoles:', error);
    throw new Error('Gagal memverifikasi master peran sistem.', { cause: error });
  }
}

export async function getOrCreateUserByFirebase(
  uid: string,
  email: string,
  displayName?: string
) {
  try {
    await ensureBaseRoles();

    const selectFields = {
      id: users.id,
      uid: users.uid,
      name: users.name,
      nik: users.nik,
      phone: users.phone,
      email: users.email,
      roleId: users.roleId,
      isActive: users.isActive,
      isPic: users.isPic,
      allowedFeatures: users.allowedFeatures,
      createdAt: users.createdAt,
      roleCode: roles.code,
      roleName: roles.name,
    };

    const existingByUid = await db
      .select(selectFields)
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.uid, uid))
      .limit(1);

    if (existingByUid.length > 0) {
      const u = existingByUid[0];
      return {
        ...u,
        allowedFeatures: parseAllowedFeatures(u.allowedFeatures),
      };
    }

    // Check if PIC pre-authorized this email before first Google login
    const preAuthorized = await db
      .select(selectFields)
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(and(ilike(users.email, email.trim()), sql`${users.uid} IS NULL`))
      .limit(1);

    if (preAuthorized.length > 0) {
      const target = preAuthorized[0];
      await db
        .update(users)
        .set({
          uid,
          name: target.name || displayName || email.split('@')[0],
        })
        .where(eq(users.id, target.id));

      return {
        ...target,
        uid,
        allowedFeatures: parseAllowedFeatures(target.allowedFeatures),
      };
    }

    const isBootstrapPic = PIC_BOOTSTRAP_EMAILS.has(email.toLowerCase());
    const targetRoleCode: RoleCode = isBootstrapPic ? 'admin' : 'citizen';
    const roleRows = await db
      .select()
      .from(roles)
      .where(eq(roles.code, targetRoleCode))
      .limit(1);
    const assignedRoleId = roleRows[0]?.id ?? 1;
    const defaultFeatures: AdminFeatureKey[] = isBootstrapPic
      ? ALL_ADMIN_FEATURES
      : [];

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: email.trim(),
        name: displayName || email.split('@')[0] || 'Pengguna SIPPANDU',
        roleId: assignedRoleId,
        isPic: isBootstrapPic,
        allowedFeatures: JSON.stringify(defaultFeatures),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: email.trim(),
          name: displayName || email.split('@')[0] || 'Pengguna SIPPANDU',
        },
      })
      .returning();

    const userRow = inserted[0];
    const roleInfo = await db
      .select()
      .from(roles)
      .where(eq(roles.id, userRow.roleId))
      .limit(1);

    return {
      id: userRow.id,
      uid: userRow.uid,
      name: userRow.name,
      nik: userRow.nik,
      phone: userRow.phone,
      email: userRow.email,
      roleId: userRow.roleId,
      isActive: userRow.isActive,
      isPic: userRow.isPic,
      allowedFeatures: parseAllowedFeatures(userRow.allowedFeatures),
      createdAt: userRow.createdAt,
      roleCode: roleInfo[0]?.code ?? 'citizen',
      roleName: roleInfo[0]?.name ?? 'Pemohon / Warga',
    };
  } catch (error) {
    console.error('Database query failed in getOrCreateUserByFirebase:', error);
    throw new Error('Gagal menyinkronkan profil pengguna ke database.', {
      cause: error,
    });
  }
}

export async function ensureBaseServiceTypes() {
  try {
    const existing = await db.select({ id: serviceTypes.id }).from(serviceTypes).limit(1);
    if (existing.length === 0) {
      await db
        .insert(serviceTypes)
        .values([
          {
            code: 'KTP_EL',
            name: 'Perekaman / Cetak Ulang KTP-el',
            slaDays: 3,
            requiredDocs:
              'Kartu Keluarga (KK), Surat Kehilangan Kepolisian (jika hilang), atau KTP-el Rusak',
            isActive: true,
          },
          {
            code: 'KK_BARU',
            name: 'Pembaruan / Penerbitan Kartu Keluarga (KK)',
            slaDays: 2,
            requiredDocs:
              'KK Lama, Buku Nikah / Akta Perkawinan, Surat Pindah (jika pindah datang)',
            isActive: true,
          },
          {
            code: 'AKTA_LAHIR',
            name: 'Penerbitan Akta Kelahiran',
            slaDays: 3,
            requiredDocs:
              'Surat Keterangan Lahir RS/Bidan, KK Orang Tua, KTP-el Orang Tua, Buku Nikah',
            isActive: true,
          },
          {
            code: 'PINDAH_SKPWNI',
            name: 'Surat Keterangan Pindah WNI (SKPWNI)',
            slaDays: 2,
            requiredDocs: 'KTP-el Asli, Kartu Keluarga, Formulir F-1.03',
            isActive: true,
          },
          {
            code: 'KIA',
            name: 'Penerbitan Kartu Identitas Anak (KIA)',
            slaDays: 2,
            requiredDocs:
              'Akta Kelahiran Anak, Kartu Keluarga, Pas Foto Anak (usia >= 5 tahun)',
            isActive: true,
          },
          {
            code: 'SINKRON_NIK',
            name: 'Pengaduan Anomali / Sinkronisasi Data NIK',
            slaDays: 1,
            requiredDocs:
              'KTP-el, Kartu Keluarga, Tangkap Layar Kendala Perbankan/BPJS',
            isActive: true,
          },
          {
            code: 'AKTA_KEMATIAN',
            name: 'Penerbitan Akta Kematian',
            slaDays: 3,
            requiredDocs: 'KK, Surat Nikah, Surat Kematian RS/Desa, KTP-el',
            isActive: true,
          },
        ])
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error('Database query failed in ensureBaseServiceTypes:', error);
  }
}

export async function getPublicServiceTypes() {
  try {
    await ensureBaseServiceTypes();
    return await db
      .select()
      .from(serviceTypes)
      .where(eq(serviceTypes.isActive, true))
      .orderBy(serviceTypes.id);
  } catch (error) {
    console.error('Database query failed in getPublicServiceTypes:', error);
    throw new Error('Gagal memuat daftar layanan kependudukan.', { cause: error });
  }
}

export async function getAllServiceTypes() {
  try {
    await ensureBaseServiceTypes();
    return await db.select().from(serviceTypes).orderBy(serviceTypes.id);
  } catch (error) {
    console.error('Database query failed in getAllServiceTypes:', error);
    throw new Error('Gagal memuat master data layanan.', { cause: error });
  }
}

export async function upsertServiceType(input: {
  id?: number;
  code: string;
  name: string;
  slaDays: number;
  requiredDocs: string;
  isActive: boolean;
  actorId: number;
}) {
  try {
    const cleanCode = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    let saved;
    if (input.id) {
      const updated = await db
        .update(serviceTypes)
        .set({
          code: cleanCode,
          name: input.name.trim(),
          slaDays: input.slaDays,
          requiredDocs: input.requiredDocs.trim(),
          isActive: input.isActive,
        })
        .where(eq(serviceTypes.id, input.id))
        .returning();
      saved = updated[0];
    } else {
      const inserted = await db
        .insert(serviceTypes)
        .values({
          code: cleanCode,
          name: input.name.trim(),
          slaDays: input.slaDays,
          requiredDocs: input.requiredDocs.trim(),
          isActive: input.isActive,
        })
        .onConflictDoUpdate({
          target: serviceTypes.code,
          set: {
            name: input.name.trim(),
            slaDays: input.slaDays,
            requiredDocs: input.requiredDocs.trim(),
            isActive: input.isActive,
          },
        })
        .returning();
      saved = inserted[0];
    }

    await db.insert(auditLogs).values({
      userId: input.actorId,
      action: input.id ? 'UPDATE_SERVICE_TYPE' : 'CREATE_SERVICE_TYPE',
      entityName: 'service_types',
      entityId: String(saved.id),
      details: `Layanan ${saved.code} (${saved.name}), SLA ${saved.slaDays} hari`,
    });

    return saved;
  } catch (error) {
    console.error('Database query failed in upsertServiceType:', error);
    throw new Error('Gagal menyimpan master layanan.', { cause: error });
  }
}

function generateTicketNumber(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `SDK-${ym}-${rand}`;
}

export async function createComplaintSubmission(input: {
  authUserId?: number;
  name: string;
  nik: string;
  phone: string;
  email: string;
  serviceType: string;
  description: string;
  filePath?: string | null;
  fileOriginalName?: string | null;
}) {
  try {
    await ensureBaseRoles();

    let applicantId = input.authUserId;
    const cleanNik = input.nik.trim();

    const existingByNik = await db
      .select()
      .from(users)
      .where(eq(users.nik, cleanNik))
      .limit(1);

    if (applicantId) {
      const authRows = await db
        .select({
          id: users.id,
          roleCode: roles.code,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, applicantId))
        .limit(1);
      const isStaffActor =
        authRows.length > 0 && authRows[0].roleCode !== 'citizen';

      if (existingByNik.length > 0 && existingByNik[0].id !== applicantId) {
        if (isStaffActor) {
          // Staff testing/inputting for an existing citizen NIK: link to citizen record
          applicantId = existingByNik[0].id;
          await db
            .update(users)
            .set({
              name: input.name.trim(),
              phone: input.phone.trim(),
              email: input.email.trim(),
            })
            .where(eq(users.id, applicantId));
        } else {
          // Citizen account submitting with a NIK already attached to another record: avoid unique crash
          await db
            .update(users)
            .set({
              name: input.name.trim(),
              phone: input.phone.trim(),
            })
            .where(eq(users.id, applicantId));
        }
      } else if (isStaffActor && existingByNik.length === 0) {
        // Staff submitting on behalf of a new citizen NIK: create citizen record without overwriting staff profile
        const citizenRole = await db
          .select()
          .from(roles)
          .where(eq(roles.code, 'citizen'))
          .limit(1);
        const insertedCitizen = await db
          .insert(users)
          .values({
            name: input.name.trim(),
            nik: cleanNik,
            phone: input.phone.trim(),
            email: input.email.trim(),
            roleId: citizenRole[0]?.id ?? 1,
          })
          .returning();
        applicantId = insertedCitizen[0].id;
      } else {
        await db
          .update(users)
          .set({
            name: input.name.trim(),
            phone: input.phone.trim(),
            nik: cleanNik,
          })
          .where(eq(users.id, applicantId));
      }
    } else {
      if (existingByNik.length > 0) {
        applicantId = existingByNik[0].id;
        await db
          .update(users)
          .set({
            name: input.name.trim(),
            phone: input.phone.trim(),
            email: input.email.trim(),
          })
          .where(eq(users.id, applicantId));
      } else {
        const citizenRole = await db
          .select()
          .from(roles)
          .where(eq(roles.code, 'citizen'))
          .limit(1);

        const insertedUser = await db
          .insert(users)
          .values({
            name: input.name.trim(),
            nik: cleanNik,
            phone: input.phone.trim(),
            email: input.email.trim(),
            roleId: citizenRole[0]?.id ?? 1,
          })
          .returning();
        applicantId = insertedUser[0].id;
      }
    }

    let ticketNumber = generateTicketNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      const dup = await db
        .select({ id: complaints.id })
        .from(complaints)
        .where(eq(complaints.ticketNumber, ticketNumber))
        .limit(1);
      if (dup.length === 0) break;
      ticketNumber = generateTicketNumber();
    }

    const insertedComplaint = await db
      .insert(complaints)
      .values({
        ticketNumber,
        userId: applicantId,
        serviceType: input.serviceType.trim(),
        description: input.description.trim(),
        filePath: input.filePath ?? null,
        fileOriginalName: input.fileOriginalName ?? null,
        status: 'PENDING',
      })
      .returning();

    const complaint = insertedComplaint[0];

    const waMessage = `[SIPPANDU DUKCAPIL SIDOARJO] Permohonan layanan "${complaint.serviceType}" telah diterima dengan Nomor Tiket ${complaint.ticketNumber}. Status saat ini: MENUNGGU VERIFIKASI.`;
    const emailMessage = `Yth. ${input.name.trim()}, permohonan/pengaduan Anda untuk layanan ${complaint.serviceType} telah tercatat pada sistem SIPPANDU DUKCAPIL Kabupaten Sidoarjo dengan nomor tiket ${complaint.ticketNumber}.`;

    await db.insert(notifications).values([
      {
        userId: applicantId,
        complaintId: complaint.id,
        type: 'WHATSAPP',
        recipient: input.phone.trim(),
        messageContent: waMessage,
        statusSent: 'SENT',
      },
      {
        userId: applicantId,
        complaintId: complaint.id,
        type: 'EMAIL',
        recipient: input.email.trim(),
        messageContent: emailMessage,
        statusSent: 'SENT',
      },
    ]);

    await db.insert(auditLogs).values({
      userId: applicantId,
      action: 'SUBMIT_COMPLAINT',
      entityName: 'complaints',
      entityId: complaint.ticketNumber,
      details: `Pengajuan layanan ${complaint.serviceType} oleh NIK ${input.nik.slice(0, 6)}******${input.nik.slice(-4)}`,
    });

    return {
      ...complaint,
      applicantName: input.name.trim(),
      notificationsDispatched: ['WHATSAPP', 'EMAIL'],
    };
  } catch (error) {
    console.error('Database query failed in createComplaintSubmission:', error);
    throw new Error('Gagal menyimpan permohonan kependudukan.', { cause: error });
  }
}

function maskName(fullName: string): string {
  return fullName
    .split(' ')
    .map((part) => {
      if (part.length <= 2) return part[0] + '*';
      return part.slice(0, 2) + '*'.repeat(Math.min(4, part.length - 2));
    })
    .join(' ');
}

function maskNik(nik: string | null): string {
  if (!nik || nik.length < 10) return '****************';
  return `${nik.slice(0, 6)}******${nik.slice(-4)}`;
}

export async function trackComplaintsPublic(query: string) {
  try {
    const clean = query.trim();
    if (!clean) return [];

    const matched = await db
      .select({
        id: complaints.id,
        ticketNumber: complaints.ticketNumber,
        serviceType: complaints.serviceType,
        description: complaints.description,
        status: complaints.status,
        fileOriginalName: complaints.fileOriginalName,
        createdAt: complaints.createdAt,
        updatedAt: complaints.updatedAt,
        applicantName: users.name,
        applicantNik: users.nik,
      })
      .from(complaints)
      .innerJoin(users, eq(complaints.userId, users.id))
      .where(
        or(
          clean.length >= 6
            ? ilike(complaints.ticketNumber, `%${clean}%`)
            : ilike(complaints.ticketNumber, clean),
          eq(users.nik, clean)
        )
      )
      .orderBy(desc(complaints.createdAt))
      .limit(20);

    const results = await Promise.all(
      matched.map(async (item) => {
        const history = await db
          .select({
            id: verifications.id,
            action: verifications.action,
            reason: verifications.reason,
            bookingDate: verifications.bookingDate,
            timestamp: verifications.timestamp,
            verifierName: users.name,
          })
          .from(verifications)
          .leftJoin(users, eq(verifications.adminId, users.id))
          .where(eq(verifications.complaintId, item.id))
          .orderBy(desc(verifications.timestamp));

        const latest = history[0] ?? null;

        return {
          id: item.id,
          ticketNumber: item.ticketNumber,
          serviceType: item.serviceType,
          description: item.description,
          status: item.status,
          fileOriginalName: item.fileOriginalName,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          maskedApplicant: maskName(item.applicantName),
          maskedNik: maskNik(item.applicantNik),
          bookingDate: latest?.bookingDate ?? null,
          reason: latest?.reason ?? null,
          verifications: history,
        };
      })
    );

    return results;
  } catch (error) {
    console.error('Database query failed in trackComplaintsPublic:', error);
    throw new Error('Gagal melacak status permohonan.', { cause: error });
  }
}

export async function getComplaintsForUser(userId: number) {
  try {
    const rows = await db
      .select()
      .from(complaints)
      .where(eq(complaints.userId, userId))
      .orderBy(desc(complaints.createdAt));

    return await Promise.all(
      rows.map(async (row) => {
        const history = await db
          .select({
            id: verifications.id,
            action: verifications.action,
            reason: verifications.reason,
            bookingDate: verifications.bookingDate,
            timestamp: verifications.timestamp,
          })
          .from(verifications)
          .where(eq(verifications.complaintId, row.id))
          .orderBy(desc(verifications.timestamp));

        return {
          ...row,
          latestVerification: history[0] ?? null,
          verifications: history,
        };
      })
    );
  } catch (error) {
    console.error('Database query failed in getComplaintsForUser:', error);
    throw new Error('Gagal memuat riwayat permohonan Anda.', { cause: error });
  }
}

export async function getAdminComplaints(filters?: {
  status?: string;
  search?: string;
}) {
  try {
    const conditions = [];
    if (filters?.status && filters.status !== 'ALL') {
      conditions.push(eq(complaints.status, filters.status));
    }
    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(complaints.ticketNumber, q),
          ilike(users.name, q),
          ilike(users.nik, q),
          ilike(complaints.serviceType, q)
        )
      );
    }

    const rows = await db
      .select({
        id: complaints.id,
        ticketNumber: complaints.ticketNumber,
        userId: complaints.userId,
        serviceType: complaints.serviceType,
        description: complaints.description,
        filePath: complaints.filePath,
        fileOriginalName: complaints.fileOriginalName,
        status: complaints.status,
        createdAt: complaints.createdAt,
        updatedAt: complaints.updatedAt,
        applicantName: users.name,
        applicantNik: users.nik,
        applicantPhone: users.phone,
        applicantEmail: users.email,
      })
      .from(complaints)
      .leftJoin(users, eq(complaints.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(complaints.createdAt), desc(complaints.id));

    return await Promise.all(
      rows.map(async (row) => {
        const history = await db
          .select({
            id: verifications.id,
            action: verifications.action,
            reason: verifications.reason,
            bookingDate: verifications.bookingDate,
            timestamp: verifications.timestamp,
            verifierName: users.name,
          })
          .from(verifications)
          .leftJoin(users, eq(verifications.adminId, users.id))
          .where(eq(verifications.complaintId, row.id))
          .orderBy(desc(verifications.timestamp));

        return {
          ...row,
          applicantName: row.applicantName || 'Pemohon SIPPANDU',
          applicantEmail: row.applicantEmail || '-',
          latestVerification: history[0] ?? null,
          verifications: history,
        };
      })
    );
  } catch (error) {
    console.error('Database query failed in getAdminComplaints:', error);
    throw new Error('Gagal memuat antrean verifikasi permohonan.', {
      cause: error,
    });
  }
}

export async function verifyComplaintAction(input: {
  complaintId: number;
  adminId: number;
  action: 'IN_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
  reason?: string;
  bookingDate?: string | null;
}) {
  try {
    const existingRows = await db
      .select({
        complaint: complaints,
        applicant: users,
      })
      .from(complaints)
      .innerJoin(users, eq(complaints.userId, users.id))
      .where(eq(complaints.id, input.complaintId))
      .limit(1);

    if (existingRows.length === 0) {
      throw new Error('Tiket permohonan tidak ditemukan.');
    }

    const { complaint, applicant } = existingRows[0];

    await db
      .update(complaints)
      .set({
        status: input.action,
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, input.complaintId));

    const verificationRows = await db
      .insert(verifications)
      .values({
        complaintId: input.complaintId,
        adminId: input.adminId,
        action: input.action,
        reason: input.reason?.trim() || null,
        bookingDate: input.bookingDate || null,
      })
      .returning();

    let statusLabel = 'DIPROSES';
    let detailLine = '';
    if (input.action === 'IN_REVIEW') {
      statusLabel = 'SEDANG DIVERIFIKASI';
      detailLine = input.reason?.trim()
        ? `Catatan petugas: ${input.reason.trim()}`
        : 'Berkas Anda sedang diperiksa oleh Verifikator ASN Dukcapil Sidoarjo.';
    } else if (input.action === 'ACCEPTED') {
      statusLabel = 'DISETUJUI';
      detailLine = `Jadwal pengambilan/penyelesaian berkas (Booking Date): ${input.bookingDate}. ${input.reason?.trim() || ''}`;
    } else if (input.action === 'REJECTED') {
      statusLabel = 'DITOLAK / PERLU PERBAIKAN';
      detailLine = `Alasan penolakan: ${input.reason?.trim()}`;
    } else if (input.action === 'COMPLETED') {
      statusLabel = 'SELESAI DITERBITKAN';
      detailLine =
        input.reason?.trim() ||
        'Dokumen kependudukan telah selesai diterbitkan dan siap diambil atau diunduh.';
    }

    const message = `[SIPPANDU DUKCAPIL SIDOARJO] Pembaruan Tiket ${complaint.ticketNumber} (${complaint.serviceType}): Status ${statusLabel}. ${detailLine}`;

    const notifPayloads = [];
    if (applicant.phone) {
      notifPayloads.push({
        userId: applicant.id,
        complaintId: complaint.id,
        type: 'WHATSAPP',
        recipient: applicant.phone,
        messageContent: message,
        statusSent: 'SENT',
      });
    }
    notifPayloads.push({
      userId: applicant.id,
      complaintId: complaint.id,
      type: 'EMAIL',
      recipient: applicant.email,
      messageContent: message,
      statusSent: 'SENT',
    });

    await db.insert(notifications).values(notifPayloads);

    await db.insert(auditLogs).values({
      userId: input.adminId,
      action: `VERIFY_${input.action}`,
      entityName: 'complaints',
      entityId: complaint.ticketNumber,
      details: `${statusLabel}${input.bookingDate ? ` · Booking: ${input.bookingDate}` : ''}${input.reason ? ` · Catatan: ${input.reason.trim()}` : ''}`,
    });

    return {
      verification: verificationRows[0],
      status: input.action,
      ticketNumber: complaint.ticketNumber,
      notificationsDispatched: notifPayloads.map((n) => n.type),
    };
  } catch (error) {
    console.error('Database query failed in verifyComplaintAction:', error);
    if (error instanceof Error && error.message.includes('tidak ditemukan')) {
      throw error;
    }
    throw new Error('Gagal memproses verifikasi berkas.', { cause: error });
  }
}

export async function generatePeriodicReport(input: {
  periodType: 'monthly' | 'quarterly' | 'semester' | 'all';
  year: number;
  periodValue: number;
}) {
  try {
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    let periodLabel = `Tahun ${input.year} (Semua Periode)`;

    if (input.periodType === 'monthly') {
      const monthIdx = Math.max(1, Math.min(12, input.periodValue)) - 1;
      startDate = new Date(input.year, monthIdx, 1);
      endDate = new Date(input.year, monthIdx + 1, 1);
      periodLabel = `Bulanan · ${startDate.toLocaleString('id-ID', {
        month: 'long',
        year: 'numeric',
      })}`;
    } else if (input.periodType === 'quarterly') {
      const q = Math.max(1, Math.min(4, input.periodValue));
      const startMonth = (q - 1) * 3;
      startDate = new Date(input.year, startMonth, 1);
      endDate = new Date(input.year, startMonth + 3, 1);
      periodLabel = `Triwulan ${q} · Tahun ${input.year}`;
    } else if (input.periodType === 'semester') {
      const s = input.periodValue === 2 ? 2 : 1;
      const startMonth = s === 1 ? 0 : 6;
      startDate = new Date(input.year, startMonth, 1);
      endDate = new Date(input.year, startMonth + 6, 1);
      periodLabel = `Semester ${s} · Tahun ${input.year}`;
    }

    const whereClause =
      startDate && endDate
        ? and(
            gte(complaints.createdAt, startDate),
            lt(complaints.createdAt, endDate)
          )
        : undefined;

    const rows = await db
      .select({
        id: complaints.id,
        ticketNumber: complaints.ticketNumber,
        serviceType: complaints.serviceType,
        status: complaints.status,
        createdAt: complaints.createdAt,
        updatedAt: complaints.updatedAt,
        applicantName: users.name,
        applicantNik: users.nik,
      })
      .from(complaints)
      .innerJoin(users, eq(complaints.userId, users.id))
      .where(whereClause)
      .orderBy(desc(complaints.createdAt));

    const summary = {
      total: rows.length,
      pending: 0,
      inReview: 0,
      accepted: 0,
      rejected: 0,
      completed: 0,
    };

    const byServiceMap = new Map<
      string,
      {
        serviceType: string;
        total: number;
        accepted: number;
        rejected: number;
        completed: number;
        pending: number;
      }
    >();

    for (const r of rows) {
      if (r.status === 'PENDING') summary.pending++;
      else if (r.status === 'IN_REVIEW') summary.inReview++;
      else if (r.status === 'ACCEPTED') summary.accepted++;
      else if (r.status === 'REJECTED') summary.rejected++;
      else if (r.status === 'COMPLETED') summary.completed++;

      const cur = byServiceMap.get(r.serviceType) ?? {
        serviceType: r.serviceType,
        total: 0,
        accepted: 0,
        rejected: 0,
        completed: 0,
        pending: 0,
      };
      cur.total++;
      if (r.status === 'ACCEPTED') cur.accepted++;
      else if (r.status === 'REJECTED') cur.rejected++;
      else if (r.status === 'COMPLETED') cur.completed++;
      else cur.pending++;
      byServiceMap.set(r.serviceType, cur);
    }

    return {
      periodLabel,
      periodType: input.periodType,
      year: input.year,
      periodValue: input.periodValue,
      summary,
      byService: Array.from(byServiceMap.values()),
      rows,
    };
  } catch (error) {
    console.error('Database query failed in generatePeriodicReport:', error);
    throw new Error('Gagal menyusun laporan rekapitulasi berkala.', {
      cause: error,
    });
  }
}

export async function getNotificationHistory(limit = 40) {
  try {
    return await db
      .select({
        id: notifications.id,
        type: notifications.type,
        recipient: notifications.recipient,
        messageContent: notifications.messageContent,
        statusSent: notifications.statusSent,
        timestamp: notifications.timestamp,
        userName: users.name,
        ticketNumber: complaints.ticketNumber,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.userId, users.id))
      .leftJoin(complaints, eq(notifications.complaintId, complaints.id))
      .orderBy(desc(notifications.timestamp))
      .limit(limit);
  } catch (error) {
    console.error('Database query failed in getNotificationHistory:', error);
    throw new Error('Gagal memuat riwayat notifikasi.', { cause: error });
  }
}

export async function getAuditLogHistory(limit = 50) {
  try {
    return await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityName: auditLogs.entityName,
        entityId: auditLogs.entityId,
        details: auditLogs.details,
        timestamp: auditLogs.timestamp,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  } catch (error) {
    console.error('Database query failed in getAuditLogHistory:', error);
    throw new Error('Gagal memuat audit log sistem.', { cause: error });
  }
}

export async function getAllUsersWithRoles() {
  try {
    await ensureBaseRoles();
    const roleList = await db.select().from(roles).orderBy(roles.id);
    const userList = await db
      .select({
        id: users.id,
        uid: users.uid,
        name: users.name,
        nik: users.nik,
        phone: users.phone,
        email: users.email,
        roleId: users.roleId,
        isActive: users.isActive,
        isPic: users.isPic,
        allowedFeatures: users.allowedFeatures,
        createdAt: users.createdAt,
        roleCode: roles.code,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .orderBy(desc(users.isPic), desc(users.createdAt));

    return {
      roles: roleList,
      users: userList.map((u) => ({
        ...u,
        allowedFeatures: parseAllowedFeatures(u.allowedFeatures),
      })),
    };
  } catch (error) {
    console.error('Database query failed in getAllUsersWithRoles:', error);
    throw new Error('Gagal memuat daftar pengguna dan hak akses PIC.', {
      cause: error,
    });
  }
}

export async function updateUserRoleAndStatus(input: {
  targetUserId: number;
  roleCode: RoleCode;
  isActive: boolean;
  isPic?: boolean;
  allowedFeatures?: AdminFeatureKey[];
  actorId: number;
}) {
  try {
    const roleRows = await db
      .select()
      .from(roles)
      .where(eq(roles.code, input.roleCode))
      .limit(1);

    if (roleRows.length === 0) {
      throw new Error('Peran target tidak valid.');
    }

    if (input.targetUserId === input.actorId && input.isPic === false) {
      throw new Error('PIC aktif tidak dapat mencabut hak akses PIC milik sendiri.');
    }

    if (input.targetUserId === input.actorId && !input.isActive) {
      throw new Error('PIC aktif tidak dapat menonaktifkan akun sendiri.');
    }

    const sanitizedFeatures = input.allowedFeatures
      ? input.allowedFeatures.filter((f) => ALL_ADMIN_FEATURES.includes(f))
      : undefined;

    const updatePayload: Record<string, unknown> = {
      roleId: roleRows[0].id,
      isActive: input.isActive,
    };

    if (typeof input.isPic === 'boolean') {
      updatePayload.isPic = input.isPic;
      if (input.isPic && sanitizedFeatures) {
        updatePayload.allowedFeatures = JSON.stringify(
          Array.from(new Set([...sanitizedFeatures, 'pic_access_control']))
        );
      }
    }

    if (sanitizedFeatures && !updatePayload.allowedFeatures) {
      updatePayload.allowedFeatures = JSON.stringify(sanitizedFeatures);
    }

    const updated = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, input.targetUserId))
      .returning();

    if (updated.length === 0) {
      throw new Error('Pengguna tidak ditemukan.');
    }

    await db.insert(auditLogs).values({
      userId: input.actorId,
      action: 'PIC_UPDATE_ACCESS',
      entityName: 'users',
      entityId: String(input.targetUserId),
      details: `Peran: ${roleRows[0].name} (${input.roleCode}), aktif: ${input.isActive}, PIC: ${updated[0].isPic}, fitur: ${updated[0].allowedFeatures}`,
    });

    return {
      ...updated[0],
      allowedFeatures: parseAllowedFeatures(updated[0].allowedFeatures),
    };
  } catch (error) {
    console.error('Database query failed in updateUserRoleAndStatus:', error);
    if (
      error instanceof Error &&
      (error.message.includes('tidak valid') ||
        error.message.includes('tidak ditemukan') ||
        error.message.includes('PIC aktif'))
    ) {
      throw error;
    }
    throw new Error('Gagal memperbarui hak akses pengguna.', { cause: error });
  }
}

export async function invitePicAuthorizedUser(input: {
  email: string;
  name: string;
  roleCode: RoleCode;
  isPic: boolean;
  allowedFeatures: AdminFeatureKey[];
  actorId: number;
}) {
  try {
    await ensureBaseRoles();
    const cleanEmail = input.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Alamat email Google yang valid wajib diisi.');
    }

    const roleRows = await db
      .select()
      .from(roles)
      .where(eq(roles.code, input.roleCode))
      .limit(1);

    if (roleRows.length === 0) {
      throw new Error('Peran tidak valid.');
    }

    const cleanFeatures = Array.from(
      new Set(
        input.allowedFeatures.filter((f) => ALL_ADMIN_FEATURES.includes(f))
      )
    );
    if (input.isPic && !cleanFeatures.includes('pic_access_control')) {
      cleanFeatures.push('pic_access_control');
    }

    const existing = await db
      .select()
      .from(users)
      .where(ilike(users.email, cleanEmail))
      .limit(1);

    let saved;
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          name: input.name.trim() || existing[0].name,
          roleId: roleRows[0].id,
          isPic: input.isPic,
          isActive: true,
          allowedFeatures: JSON.stringify(cleanFeatures),
        })
        .where(eq(users.id, existing[0].id))
        .returning();
      saved = updated[0];
    } else {
      const inserted = await db
        .insert(users)
        .values({
          email: cleanEmail,
          name: input.name.trim() || cleanEmail.split('@')[0],
          roleId: roleRows[0].id,
          isPic: input.isPic,
          isActive: true,
          allowedFeatures: JSON.stringify(cleanFeatures),
        })
        .returning();
      saved = inserted[0];
    }

    await db.insert(auditLogs).values({
      userId: input.actorId,
      action: 'PIC_GRANT_ACCESS',
      entityName: 'users',
      entityId: cleanEmail,
      details: `Otorisasi PIC untuk ${cleanEmail} (${roleRows[0].name}), fitur: ${cleanFeatures.join(', ')}`,
    });

    return {
      ...saved,
      allowedFeatures: parseAllowedFeatures(saved.allowedFeatures),
    };
  } catch (error) {
    console.error('Database query failed in invitePicAuthorizedUser:', error);
    if (
      error instanceof Error &&
      (error.message.includes('wajib diisi') ||
        error.message.includes('tidak valid'))
    ) {
      throw error;
    }
    throw new Error('Gagal menambahkan otorisasi petugas.', { cause: error });
  }
}
