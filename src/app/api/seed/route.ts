import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  COLLECTIONS,
  type CollectionName,
  create,
  deleteMany,
} from '@/lib/firestore-helpers';

/**
 * Inicializa la base de datos Firestore para producción.
 *
 * Borra TODOS los documentos de todas las colecciones y crea únicamente
 * un usuario administrador con credenciales frescas.
 *
 * El admin puede luego, desde la UI, crear comités, registrar voluntarios
 * y asignar roles de presidente / vicepresidente / líder de comité.
 *
 * Credenciales por defecto (deben cambiarse tras el primer login):
 *   Carnet: 10000001
 *   Contraseña: EduTECH@2025
 *
 * SEGURIDAD: Este endpoint es DESTRUCTIVO. Requiere la variable de entorno
 * SEED_SECRET configurada y el header `x-seed-secret` con el mismo valor.
 *
 * Uso (tras desplegar en Vercel):
 *   curl -X POST https://TU_DOMINIO/api/seed \
 *     -H "x-seed-secret: $SEED_SECRET"
 */
const ADMIN_CARNET = '10000001';
const ADMIN_PASSWORD = 'EduTECH@2025';
const ADMIN_NAME = 'Administrador EduTECH ESEN';
const ADMIN_EMAIL = 'admin@edutech-esen.org';

export async function POST(req: Request) {
  try {
    // ---------------------------------------------------------------
    // 0) Verificar autorización — protege el endpoint destructivo.
    // ---------------------------------------------------------------
    const expectedSecret = process.env.SEED_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        {
          success: false,
          message:
            'El endpoint de inicialización está deshabilitado. Configura SEED_SECRET en el servidor para usarlo.',
        },
        { status: 403 },
      );
    }
    const providedSecret = req.headers.get('x-seed-secret');
    if (providedSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, message: 'No autorizado para inicializar la base de datos.' },
        { status: 401 },
      );
    }

    // ---------------------------------------------------------------
    // 1) Limpiar TODAS las colecciones (Firestore no tiene FK cascade).
    // ---------------------------------------------------------------
    const allCollections = Object.keys(COLLECTIONS) as CollectionName[];
    const deletedCounts: Record<string, number> = {};
    await Promise.all(
      allCollections.map(async (col) => {
        const n = await deleteMany(col);
        deletedCounts[col] = n;
      }),
    );

    // ---------------------------------------------------------------
    // 2) Crear el único administrador.
    // ---------------------------------------------------------------
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await create('volunteers', {
      name: ADMIN_NAME,
      studentId: ADMIN_CARNET,
      career: 'Ingeniería de Software y Negocios Digitales (ISND)',
      email: ADMIN_EMAIL,
      phone: '6000-0000',
      password: hash,
      role: 'admin',
      committeeId: null,
    });

    return NextResponse.json({
      success: true,
      message: 'Base de datos inicializada para producción. Se creó 1 administrador.',
      deletedCounts,
      admin: {
        carnet: ADMIN_CARNET,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        tempPassword: ADMIN_PASSWORD,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: 'Error al inicializar la base de datos', detail: String(e) },
      { status: 500 },
    );
  }
}
