import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import {
  type AdminFeatureKey,
  getOrCreateUserByFirebase,
  type RoleCode,
} from '../db/repository.ts';

export interface AuthenticatedDbUser {
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
  roleCode: string;
  roleName: string;
}

export interface AuthRequest extends Request {
  firebaseUid?: string;
  firebaseEmail?: string;
  dbUser?: AuthenticatedDbUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Sesi otentikasi tidak ditemukan. Silakan masuk terlebih dahulu.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || `${decoded.uid}@users.sippandu.local`;
    const dbUser = await getOrCreateUserByFirebase(
      decoded.uid,
      email,
      decoded.name
    );

    if (!dbUser.isActive) {
      return res
        .status(403)
        .json({ error: 'Akun Anda sedang dinonaktifkan oleh PIC Administrator.' });
    }

    req.firebaseUid = decoded.uid;
    req.firebaseEmail = email;
    req.dbUser = dbUser;
    next();
  } catch (error: any) {
    if (error?.code === 'auth/id-token-expired') {
      return res.status(401).json({
        code: 'TOKEN_EXPIRED',
        error: 'Sesi token telah kedaluwarsa. Memperbarui sesi...',
      });
    }
    console.error('Error verifying Firebase ID token:', error);
    return res
      .status(401)
      .json({ error: 'Token sesi tidak valid atau kedaluwarsa.' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const email = decoded.email || `${decoded.uid}@users.sippandu.local`;
      const dbUser = await getOrCreateUserByFirebase(
        decoded.uid,
        email,
        decoded.name
      );
      if (dbUser.isActive) {
        req.firebaseUid = decoded.uid;
        req.firebaseEmail = email;
        req.dbUser = dbUser;
      }
    } catch {
      // Ignore invalid optional token for public endpoints
    }
  }
  next();
};

export const requireRole = (allowedRoles: RoleCode[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Otentikasi diperlukan.' });
    }
    if (!allowedRoles.includes(req.dbUser.roleCode as RoleCode)) {
      return res.status(403).json({
        error: `Akses ditolak. Fitur ini memerlukan hak akses: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
};

export const requireFeature = (feature: AdminFeatureKey) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Otentikasi diperlukan.' });
    }
    if (
      req.dbUser.isPic ||
      req.dbUser.allowedFeatures.includes(feature)
    ) {
      return next();
    }
    return res.status(403).json({
      error: `Akses ditolak. Fitur (${feature}) belum diizinkan untuk akun Anda oleh PIC Administrator.`,
    });
  };
};

export const requirePic = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Otentikasi diperlukan.' });
  }
  if (!req.dbUser.isPic && !req.dbUser.allowedFeatures.includes('pic_access_control')) {
    return res.status(403).json({
      error: 'Akses ditolak. Menu ini khusus untuk PIC Pengelola Hak Akses.',
    });
  }
  next();
};
