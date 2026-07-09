/**
 * Reports Service — generación de documentos:
 *  1. Excel "Memoria de Labores" (exceljs)
 *  2. Excel "Horas Sociales" (exceljs)
 *  3. Word "Plantilla de Proyecto ODS" (docx)
 *
 * Mantiene los formatos del backend original (EduTECH ESEN), adaptados a Prisma/SQLite.
 */
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  TextRun,
} from 'docx';
import { inject, Injectable } from '@/server/core/container';
import { PRISMA_TOKEN } from '@/server/core/prisma.provider';
import fs from 'fs';
import path from 'path';

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF4472C4' } };

/**
 * Directorio donde se guardan los documentos ODS generados.
 *
 * En Vercel (NODE_ENV=production) el filesystem es read-only excepto `/tmp`.
 * Usamos `/tmp/edutech/uploads` para que las escrituras no crasheen la
 * descarga del documento al cliente (el buffer siempre se retorna en la
 * response HTTP; el guardado en disco es best-effort).
 *
 * ADVERTENCIA (Vercel serverless): cada invocación es efímera — los
 * archivos guardados NO persisten entre invocaciones. Esto es aceptable
 * porque el documento generado se retorna directamente en la response
 * HTTP al cliente (no se sirve desde disco posteriormente).
 *
 * En desarrollo local usamos `process.cwd()/upload` para que los
 * documentos persistan entre reinicios y puedan inspeccionarse.
 */
function dataDir(): string {
  return process.env.NODE_ENV === 'production'
    ? '/tmp/edutech'
    : process.cwd();
}
const UPLOAD_DIR = path.join(dataDir(), 'uploads');

/** Tipo para los filtros de rango de meses (formato YYYY-MM). */
export interface PeriodFilter {
  startMonth?: string; // YYYY-MM (inclusive)
  endMonth?: string;   // YYYY-MM (inclusive)
}

/** Convierte "YYYY-MM" → fecha inicial del mes (día 1). */
function monthStart(month?: string): Date | undefined {
  if (!month) return undefined;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return undefined;
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

/** Convierte "YYYY-MM" → fecha final del mes (último día, 23:59:59). */
function monthEnd(month?: string): Date | undefined {
  if (!month) return undefined;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return undefined;
  return new Date(y, m, 0, 23, 59, 59, 999); // día 0 = último día del mes anterior = último día de `m`
}

/**
 * Compara una fecha almacenada como string (puede ser "YYYY-MM-DD", "YYYY-MM",
 * "DD/MM/YYYY" o ISO) contra un rango. Devuelve true si la fecha cae dentro del
 * rango [start, end] (ambos inclusive). Si no hay rango, devuelve true.
 */
function dateInRange(dateStr: string | null | undefined, period: PeriodFilter): boolean {
  if (!period.startMonth && !period.endMonth) return true;
  if (!dateStr) return false;
  // Intentar parsear la fecha. Aceptamos varios formatos.
  let d: Date;
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
    // YYYY-MM o YYYY-MM-DD
    d = s.length === 7 ? new Date(s + '-01') : new Date(s);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    // DD/MM/YYYY
    const [dd, mm, yyyy] = s.split('/').map(Number);
    d = new Date(yyyy, mm - 1, dd);
  } else {
    const parsed = new Date(s);
    if (isNaN(parsed.getTime())) return true; // si no se puede parsear, no filtrar
    d = parsed;
  }
  const start = monthStart(period.startMonth);
  const end = monthEnd(period.endMonth);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

@Injectable()
export class ReportsService {
  private readonly db = inject<typeof import('@prisma/client').PrismaClient>(PRISMA_TOKEN);

  /**
   * 1. Excel — Memoria de Labores. Sigue la estructura del documento oficial:
   *
   *   Tipo de proyecto | Principales proyectos, actividades o eventos |
   *   Fecha / período | Objetivos | Actores | Beneficiarios | Impacto | ODS
   *
   * Una fila por actividad, filtrable por rango de meses (usa startDate).
   * Los campos "Objetivos" e "Impacto" se toman de los campos homónimos de
   * la actividad (con fallback a la descripción / un valor por defecto).
   */
  async memoriaLabores(period: PeriodFilter = {}): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EduTECH ESEN';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Memoria de Labores');

    // Encabezados exactly como el documento oficial
    const columns = [
      { header: 'Tipo de proyecto', key: 'type', width: 22 },
      { header: 'Principales proyectos, actividades o eventos de proyección social', key: 'activity', width: 50 },
      { header: 'Fecha / período', key: 'period', width: 24 },
      { header: 'Objetivos', key: 'objectives', width: 55 },
      { header: 'Actores', key: 'actors', width: 28 },
      { header: 'Beneficiarios', key: 'beneficiaries', width: 30 },
      { header: 'Impacto', key: 'impact', width: 55 },
      { header: 'ODS', key: 'ods', width: 40 },
    ];
    worksheet.columns = columns;

    const allActivities = await this.db.activity.findMany({
      include: { committee: true, volunteers: { include: { volunteer: true } } },
      orderBy: { startDate: 'asc' },
    });

    // Filtrar por rango de meses usando startDate de la actividad
    const activities = allActivities.filter((act) =>
      dateInRange(act.startDate, period),
    );

    activities.forEach((act) => {
      const beneficiaries = (act.beneficiariesMen ?? 0) + (act.beneficiariesWomen ?? 0);
      // Período legible
      let periodStr = '—';
      if (act.startDate && act.endDate) {
        periodStr = `${this.formatDateEs(act.startDate)} – ${this.formatDateEs(act.endDate)}`;
      } else if (act.startDate) {
        periodStr = this.formatDateEs(act.startDate);
      }
      // Objetivos: usar el campo específico; fallback a la descripción
      const objectives = (act.objectives && act.objectives.trim()) ||
        (act.description && act.description.trim()) ||
        '—';
      // Impacto: usar el campo específico; fallback genérico
      const impact = (act.impact && act.impact.trim()) ||
        'Jóvenes más informados, críticos y empoderados digitalmente, con mayor participación en su comunidad educativa';
      // Actores: comité + voluntarios inscritos
      const actors = act.committee?.name || 'EduTECH ESEN';
      // Beneficiarios
      const beneficiariesStr = beneficiaries > 0
        ? `${beneficiaries} beneficiarios (H: ${act.beneficiariesMen}, M: ${act.beneficiariesWomen})`
        : '—';
      // ODS
      const odsStr = act.ods && act.ods.trim() ? act.ods : 'ODS 4: Educación de Calidad';

      worksheet.addRow({
        type: act.type || 'EduTECH ESEN',
        activity: act.title,
        period: periodStr,
        objectives,
        actors,
        beneficiaries: beneficiariesStr,
        impact,
        ods: odsStr,
      });
    });

    // Estilizar encabezado
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = HEADER_FILL;
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 38;
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Estilizar filas de datos: wrap text, alineación vertical arriba, bordes
    const dataRowCount = activities.length;
    for (let r = 2; r <= 1 + dataRowCount; r++) {
      const row = worksheet.getRow(r);
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
      // Altura mínima para que el wrap text se vea bien
      row.height = 60;
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Formatea una fecha "YYYY-MM-DD" o ISO a "dd MMM yyyy" en español. */
  private formatDateEs(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      const s = String(dateStr).trim();
      let d: Date;
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
        d = s.length === 7 ? new Date(s + '-01') : new Date(s);
      } else {
        d = new Date(s);
      }
      if (isNaN(d.getTime())) return dateStr;
      const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return `${String(d.getDate()).padStart(2, '0')} ${meses[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  }

  /**
   * 2. Excel — Horas Sociales por voluntario, con una columna por cada
   * proyecto/actividad. Sigue la estructura del documento oficial:
   *
   *   Miembros | Carnet | [Actividad 1] | [Actividad 2] | … | [Actividad N] |
   *   Horas administrativas | Horas de campo | Horas
   *
   * - Cada columna de actividad contiene las horas que el voluntario ganó en
   *   esa actividad (suma de SocialHour.hours aprobadas en el período).
   * - "Horas administrativas" = suma de columnas de actividades de tipo admin
   *   (más horas manuales admin si las hay). Se usa fórmula Excel.
   * - "Horas de campo" = suma de columnas de actividades de tipo field
   *   (más horas manuales field si las hay). Se usa fórmula Excel.
   * - "Horas" = administrativas + de campo (fórmula Excel).
   *
   * Solo se incluyen horas con approvalStatus = 'approved' (las que realmente
   * cuentan). Las horas pendientes o rechazadas se omiten.
   */
  async horasSociales(period: PeriodFilter = {}): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EduTECH ESEN';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Horas Sociales');

    // --- 1. Cargar datos ---
    const [allVolunteers, allActivities, allHours] = await Promise.all([
      this.db.volunteer.findMany({
        include: { committee: true },
        orderBy: { name: 'asc' },
      }),
      this.db.activity.findMany({ orderBy: { startDate: 'asc' } }),
      this.db.socialHour.findMany({
        where: { approvalStatus: 'approved' },
        include: { activity: true },
      }),
    ]);

    // --- 2. Filtrar horas por período ---
    const hoursInPeriod = allHours.filter((h) => dateInRange(h.date, period));

    // --- 3. Determinar actividades que tienen horas en el período ---
    // Mapa activityId → actividad (solo las que aparecen en al menos un registro)
    const activityMap = new Map(allActivities.map((a) => [a.id, a]));
    const activitiesWithHours: string[] = [];
    const seenActivity = new Set<string>();
    for (const h of hoursInPeriod) {
      if (h.activityId && !seenActivity.has(h.activityId)) {
        seenActivity.add(h.activityId);
        activitiesWithHours.push(h.activityId);
      }
    }
    // Ordenar actividades por startDate ascendente (igual que allActivities)
    activitiesWithHours.sort((a, b) => {
      const aa = activityMap.get(a);
      const bb = activityMap.get(b);
      return (aa?.startDate || '').localeCompare(bb?.startDate || '');
    });

    // ¿Hay horas manuales (sin actividad)?
    const hasManualHours = hoursInPeriod.some((h) => !h.activityId);

    // --- 4. Construir encabezados ---
    // Columnas: A=Miembros, B=Carnet, C..=actividades, [Registro manual?],
    // Horas administrativas, Horas de campo, Horas
    const headers: string[] = ['Miembros', 'Carnet'];
    activitiesWithHours.forEach((aid) => {
      const act = activityMap.get(aid);
      const title = act?.title || 'Actividad';
      const typeLabel = act?.hourType === 'admin' ? ' (Admin)' : ' (Campo)';
      headers.push(title + typeLabel);
    });
    if (hasManualHours) {
      headers.push('Registro manual');
    }
    const numActivityCols = activitiesWithHours.length + (hasManualHours ? 1 : 0);
    const adminColIdx = 2 + numActivityCols; // 0-based: después de Miembros(0), Carnet(1), actividades(2..)
    const fieldColIdx = adminColIdx + 1;
    const totalColIdx = adminColIdx + 2;
    headers.push('Horas administrativas', 'Horas de campo', 'Horas');

    worksheet.columns = headers.map((h, i) => ({
      header: h,
      key: `col${i}`,
      width: i < 2 ? (i === 0 ? 40 : 15) : i < 2 + numActivityCols ? 16 : 20,
    }));

    // --- 5. Llenar filas (una por voluntario con horas en el período) ---
    // Estructura: volunteerId → { activityId → hours, manualAdmin → hours, manualField → hours }
    type RowData = {
      activityHours: Record<string, number>;
      manualAdmin: number;
      manualField: number;
    };
    const dataByVolunteer = new Map<string, RowData>();

    for (const h of hoursInPeriod) {
      if (!dataByVolunteer.has(h.volunteerId)) {
        dataByVolunteer.set(h.volunteerId, {
          activityHours: {},
          manualAdmin: 0,
          manualField: 0,
        });
      }
      const row = dataByVolunteer.get(h.volunteerId)!;
      if (h.activityId) {
        // El tipo (admin/field) se determina más adelante usando Activity.hourType
        row.activityHours[h.activityId] =
          (row.activityHours[h.activityId] || 0) + h.hours;
      } else {
        // Hora manual: usar h.type para categorizar
        if (h.type === 'admin') row.manualAdmin += h.hours;
        else row.manualField += h.hours;
      }
    }

    let dataRowCount = 0;
    for (const v of allVolunteers) {
      const row = dataByVolunteer.get(v.id);
      if (!row) continue; // sin horas en el período → omitir
      // Si hay filtro de período y el voluntario no tiene horas, ya se omitió arriba
      const cells: (string | number)[] = [v.name, v.studentId];
      // Celdas de actividades
      for (const aid of activitiesWithHours) {
        cells.push(row.activityHours[aid] || 0);
      }
      // Celda de registro manual (si aplica)
      if (hasManualHours) {
        cells.push(row.manualAdmin + row.manualField);
      }
      // Horas administrativas: suma de actividades tipo admin + manual admin
      let adminTotal = row.manualAdmin;
      for (const aid of activitiesWithHours) {
        const act = activityMap.get(aid);
        if (act?.hourType === 'admin') {
          adminTotal += row.activityHours[aid] || 0;
        }
      }
      // Horas de campo: suma de actividades tipo field + manual field
      let fieldTotal = row.manualField;
      for (const aid of activitiesWithHours) {
        const act = activityMap.get(aid);
        if (act?.hourType === 'field') {
          fieldTotal += row.activityHours[aid] || 0;
        }
      }
      cells.push(adminTotal);
      cells.push(fieldTotal);
      cells.push(adminTotal + fieldTotal);
      worksheet.addRow(cells);
      dataRowCount++;
    }

    // --- 6. Fila de totales al final ---
    if (dataRowCount > 0) {
      const lastDataRow = 1 + dataRowCount; // header en fila 1
      const totalCells: (string | number)[] = ['TOTALES', ''];
      // Suma por columna de actividad
      for (let i = 0; i < numActivityCols; i++) {
        const colLetter = this.colLetter(2 + i); // col C en adelante
        totalCells.push({
          formula: `SUM(${colLetter}2:${colLetter}${lastDataRow})`,
        } as any);
      }
      // Totales admin / field / total
      const adminLetter = this.colLetter(adminColIdx);
      const fieldLetter = this.colLetter(fieldColIdx);
      const totalLetter = this.colLetter(totalColIdx);
      totalCells.push({
        formula: `SUM(${adminLetter}2:${adminLetter}${lastDataRow})`,
      } as any);
      totalCells.push({
        formula: `SUM(${fieldLetter}2:${fieldLetter}${lastDataRow})`,
      } as any);
      totalCells.push({
        formula: `SUM(${totalLetter}2:${totalLetter}${lastDataRow})`,
      } as any);
      worksheet.addRow(totalCells);
      // Estilizar fila de totales
      const totalRow = worksheet.getRow(lastDataRow + 1);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      };
    }

    // --- 7. Estilizar encabezado ---
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = HEADER_FILL;
    headerRow.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    headerRow.height = 32;
    worksheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];

    // Bordes finos para toda la tabla
    worksheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
    });

    // Las celdas numéricas (actividades + totales) con formato entero
    for (let i = 2; i < headers.length; i++) {
      worksheet.getColumn(i + 1).numFmt = '0';
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Convierte un índice de columna (0-based) a letra Excel (A, B, …, Z, AA, …). */
  private colLetter(idx: number): string {
    let letter = '';
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  /** 3. Word — Plantilla de Proyecto ODS. SIEMPRE requiere un projectId (actividad). */
  async odsProject(projectId: string): Promise<{ buffer: Buffer; filename: string }> {
    if (!projectId) {
      throw new Error('Se requiere seleccionar un proyecto (actividad) para generar el documento ODS.');
    }
    const act = await this.db.activity.findUnique({
      where: { id: projectId },
      include: { committee: true, volunteers: { include: { volunteer: true } } },
    });
    if (!act) {
      throw new Error(`No se encontró el proyecto con id "${projectId}".`);
    }

    // Construir los datos del proyecto a partir de la actividad
    const projectData = buildProjectDataFromActivity(act);

    const tr = (text: string, bold = false) => new TextRun({ text, bold });
    const p = (text: string, bold = false) => new Paragraph({ children: [tr(text, bold)] });
    const cell = (text: string, bold = false, span = 1) =>
      new TableCell({ children: [p(text, bold)], columnSpan: span });

    const doc = new Document({
      sections: [
        {
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: [cell('Plantilla de Proyectos Asociaciones ESEN', true, 3)] }),
                new TableRow({ children: [cell('Nombre del proyecto'), cell(projectData.name, false, 2)] }),
                new TableRow({ children: [cell('Nombre de Asociación'), cell(projectData.association, false, 2)] }),
                new TableRow({ children: [cell('Datos de contacto del responsable'), cell(`Nombre: ${projectData.responsible.name}`, false, 2)] }),
                new TableRow({ children: [cell('1.'), cell(`Cargo: ${projectData.responsible.role}`, false, 2)] }),
                new TableRow({ children: [cell('2.'), cell(`Teléfono: ${projectData.responsible.phone}`, false, 2)] }),
                new TableRow({ children: [cell('3.'), cell(`E-mail: ${projectData.responsible.email}`, false, 2)] }),
                new TableRow({ children: [cell('Ubicación del proyecto'), cell(`Departamento: ${projectData.location.department}`, false, 2)] }),
                new TableRow({ children: [cell('4.'), cell(`Municipio: ${projectData.location.municipality}`, false, 2)] }),
                new TableRow({ children: [cell('5.'), cell(`Comunidad: ${projectData.location.community}`, false, 2)] }),
                new TableRow({ children: [cell('6.'), cell('Otro: ', false, 2)] }),
                new TableRow({ children: [cell('Objetivos'), cell(`General: ${projectData.objectives.general}`, false, 2)] }),
                new TableRow({
                  children: [
                    cell('7.'),
                    cell(`Específicos: ${projectData.objectives.specific.map((s, i) => `${i + 1}. ${s}`).join(' ')}`, false, 2),
                  ],
                }),
                new TableRow({
                  children: [
                    cell('Número de Beneficiarios'),
                    cell(`Hombres: ${projectData.beneficiaries.men}`),
                    cell(`Mujeres: ${projectData.beneficiaries.women}`),
                  ],
                }),
                new TableRow({ children: [cell('Justificación'), cell(projectData.justification, false, 2)] }),
                new TableRow({ children: [cell('Actividades realizadas / Ayuda proporcionada'), cell(projectData.activities.join(', '), false, 2)] }),
                new TableRow({ children: [cell('Impacto esperado - Social'), cell(projectData.impact.social, false, 2)] }),
                new TableRow({ children: [cell('Impacto esperado - Económico'), cell(projectData.impact.economic, false, 2)] }),
                new TableRow({ children: [cell('8.'), cell(`Tecnológico: ${projectData.impact.technological}`, false, 2)] }),
                new TableRow({ children: [cell('Recursos - Materiales'), cell(projectData.resources.materials, false, 2)] }),
                new TableRow({ children: [cell('Recursos - Financieros'), cell(projectData.resources.financial, false, 2)] }),
                new TableRow({ children: [cell('Recursos - Humanos'), cell(projectData.resources.human, false, 2)] }),
                new TableRow({ children: [cell('Duración del Proyecto'), cell(projectData.duration, false, 2)] }),
                new TableRow({ children: [cell('Objetivo de Desarrollo Sostenible'), cell(projectData.ods.join(', '), false, 2)] }),
                new TableRow({
                  children: [
                    cell('Pilar de Agenda 2030 a la que aporta'),
                    cell(projectData.agenda2030.map((x, i) => `${i + 1}. ${x}`).join(' '), false, 2),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });

    const buffer = Buffer.from(await Packer.toBuffer(doc));

    // Generar el nombre del archivo: ODS-{ProjectNameSlug}{Year}.docx
    const year = new Date().getFullYear();
    const slug = slugifyProjectName(projectData.name);
    const filename = `ODS-${slug}${year}.docx`;

    // Guardar en disco (best-effort). En Vercel usa /tmp/edutech/uploads
    // (efímero). En dev usa cwd/upload (persistente). El buffer siempre
    // se retorna en la response HTTP al cliente.
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    } catch (e) {
      // No fallar la descarga si no se puede guardar en disco
      console.error('No se pudo guardar el documento ODS en disco:', e);
    }

    return { buffer, filename };
  }

  /** 4. Excel — Balance Financiero (ingresos vs egresos). Filtrable por rango de meses. */
  async balanceFinanciero(period: PeriodFilter = {}): Promise<Buffer> {
    const [allIncomes, allExpenses] = await Promise.all([
      this.db.income.findMany({ orderBy: { date: 'desc' } }),
      this.db.expense.findMany({ include: { activity: true }, orderBy: { date: 'desc' } }),
    ]);

    // Filtrar por rango de meses usando el campo `date`
    const incomes = allIncomes.filter((i) => dateInRange(i.date, period));
    const expenses = allExpenses.filter((e) => dateInRange(e.date, period));

    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
    const balance = totalIncome - totalExpense;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EduTECH ESEN';
    workbook.created = new Date();

    // --- Hoja 1: Resumen ---
    const wsSummary = workbook.addWorksheet('Resumen');
    wsSummary.columns = [
      { header: 'Concepto', key: 'concept', width: 40 },
      { header: 'Monto (USD)', key: 'amount', width: 18 },
    ];
    wsSummary.addRow({ concept: 'Total Ingresos', amount: totalIncome });
    wsSummary.addRow({ concept: 'Total Egresos', amount: totalExpense });
    wsSummary.addRow({ concept: 'Balance Neto', amount: balance });

    // Formatear fila de encabezado
    const sumHeader = wsSummary.getRow(1);
    sumHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sumHeader.fill = HEADER_FILL;
    sumHeader.alignment = { vertical: 'middle', horizontal: 'center' };

    // Formato moneda en columna amount
    wsSummary.getColumn('amount').numFmt = '$#,##0.00';

    // Resaltar balance neto
    const balanceRow = wsSummary.getRow(4);
    balanceRow.font = { bold: true };
    balanceRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: balance >= 0 ? 'FFD1FAE5' : 'FFFEE2E2' },
    };

    // --- Hoja 2: Ingresos detallados ---
    const wsIncome = workbook.addWorksheet('Ingresos');
    wsIncome.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Concepto', key: 'concept', width: 40 },
      { header: 'Monto (USD)', key: 'amount', width: 16 },
      { header: 'Fuente', key: 'source', width: 20 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Notas', key: 'notes', width: 40 },
    ];
    incomes.forEach((i) => {
      wsIncome.addRow({
        date: i.date || '—',
        concept: i.concept,
        amount: i.amount,
        source: i.source || '—',
        category: i.category || '—',
        notes: i.notes || '—',
      });
    });
    const incHeader = wsIncome.getRow(1);
    incHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    incHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    incHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    wsIncome.getColumn('amount').numFmt = '$#,##0.00';
    wsIncome.views = [{ state: 'frozen', ySplit: 1 }];

    // --- Hoja 3: Egresos detallados ---
    const wsExpense = workbook.addWorksheet('Egresos');
    wsExpense.columns = [
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Concepto', key: 'concept', width: 40 },
      { header: 'Monto (USD)', key: 'amount', width: 16 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Método de pago', key: 'paymentMethod', width: 18 },
      { header: 'Beneficiario', key: 'beneficiary', width: 24 },
      { header: 'Actividad asociada', key: 'activity', width: 30 },
      { header: 'Notas', key: 'notes', width: 40 },
    ];
    expenses.forEach((e) => {
      wsExpense.addRow({
        date: e.date || '—',
        concept: e.concept,
        amount: e.amount,
        category: e.category || '—',
        paymentMethod: e.paymentMethod || '—',
        beneficiary: e.beneficiary || '—',
        activity: e.activity?.title || '—',
        notes: e.notes || '—',
      });
    });
    const expHeader = wsExpense.getRow(1);
    expHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    expHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF43F5E' } };
    expHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    wsExpense.getColumn('amount').numFmt = '$#,##0.00';
    wsExpense.views = [{ state: 'frozen', ySplit: 1 }];

    // --- Hoja 4: Por categoría ---
    const wsCat = workbook.addWorksheet('Por Categoría');
    wsCat.columns = [
      { header: 'Tipo', key: 'type', width: 14 },
      { header: 'Categoría', key: 'category', width: 24 },
      { header: 'Monto (USD)', key: 'amount', width: 18 },
    ];
    const incByCat = new Map<string, number>();
    for (const i of incomes) incByCat.set(i.category, (incByCat.get(i.category) ?? 0) + i.amount);
    const expByCat = new Map<string, number>();
    for (const e of expenses) expByCat.set(e.category, (expByCat.get(e.category) ?? 0) + e.amount);

    Array.from(incByCat.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => wsCat.addRow({ type: 'Ingreso', category: cat || '—', amount: amt }));
    Array.from(expByCat.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => wsCat.addRow({ type: 'Egreso', category: cat || '—', amount: amt }));

    const catHeader = wsCat.getRow(1);
    catHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    catHeader.fill = HEADER_FILL;
    catHeader.alignment = { vertical: 'middle', horizontal: 'center' };
    wsCat.getColumn('amount').numFmt = '$#,##0.00';

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

/**
 * Construye los datos del proyecto ODS a partir de una actividad de la BD.
 * Usa los campos de la actividad (título, descripción, ODS, beneficiarios,
 * ubicación, fechas) y rellena con valores por defecto de EduTECH ESEN
 * los campos que la actividad no provee (responsable, justificación, etc.).
 */
function buildProjectDataFromActivity(act: any) {
  const odsList = act.ods
    ? String(act.ods)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
    : ['ODS 4 - Educación de Calidad'];

  const specificObjectives =
    odsList.length > 0
      ? odsList.map((o: string) => `Contribuir al cumplimiento del ${o}.`)
      : ['Fomentar el pensamiento crítico sobre el uso de la tecnología.'];

  return {
    name: act.title || 'Proyecto sin nombre',
    association: 'EduTECH ESEN',
    responsible: {
      name: 'Kevin Elías Luna Palacios',
      role: 'presidente de la asociación',
      phone: '6991-8387',
      email: '20245109@esen.edu.sv',
    },
    location: {
      department: 'La Libertad / San Salvador',
      municipality: 'Santa Tecla / Ciudad Delgado',
      community: act.location || 'Escuelas públicas participantes',
    },
    objectives: {
      general:
        act.description ||
        'Disminuir la brecha tecnológica en escuelas públicas salvadoreñas, proporcionando formación integral en competencias digitales básicas y avanzadas para fomentar oportunidades equitativas y el descubrimiento del mundo tecnológico.',
      specific: specificObjectives,
    },
    beneficiaries: {
      men: act.beneficiariesMen ?? 0,
      women: act.beneficiariesWomen ?? 0,
    },
    justification:
      'La brecha digital en El Salvador limita el acceso de estudiantes de escuelas públicas a herramientas tecnológicas esenciales, afectando su empleabilidad y desarrollo educativo. EduTECH ESEN responde con talleres prácticos que parten de lo básico (ofimática) hacia lo avanzado (programación). Esto fortalece la equidad, reduce desigualdades y prepara para un mercado laboral digitalizado.',
    activities: [act.title || 'Talleres presenciales en herramientas digitales básicas.'],
    impact: {
      social:
        'Jóvenes empoderados digitalmente con mayor autoestima, participación crítica en su comunidad y reducción de desigualdades.',
      economic:
        'Mejores competencias para empleos tecnológicos, aumentando oportunidades laborales futuras.',
      technological:
        'Incremento en alfabetización digital, innovación temprana y uso responsable de recursos.',
    },
    resources: {
      materials: 'Computadoras, proyectores y celulares.',
      financial: 'Fondos de EduTECH ESEN',
      human: 'Equipo de EduTECH ESEN y docente.',
    },
    duration:
      act.startDate && act.endDate
        ? `${act.startDate} – ${act.endDate}`
        : act.startDate || 'Duración no especificada',
    ods: odsList,
    agenda2030: ['Personas', 'Prosperidad', 'Alianzas'],
  };
}

/**
 * Convierte el nombre del proyecto en un slug apto para nombre de archivo.
 * Ej: "Clases a Centro Escolar Centro América" → "CentroEscolarCentroAmerica"
 * (se eliminan palabras vacías como "Clases", "a", "de", "y" y se concatena
 * en CamelCase sin espacios ni acentos).
 */
function slugifyProjectName(name: string): string {
  const stopWords = new Set([
    'a', 'de', 'del', 'la', 'el', 'en', 'y', 'o', 'u', 'para', 'por', 'con',
    'clases', 'al', 'las', 'los', 'un', 'una', 'unos', 'unas',
  ]);
  const noAccents = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ');
  const words = noAccents
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !stopWords.has(w.toLowerCase()));
  const slug = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  // Limitar a 60 caracteres para nombres de archivo manejables
  return slug.slice(0, 60) || 'Proyecto';
}
