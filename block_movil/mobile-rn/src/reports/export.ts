// ---------------------------------------------------------------------------
// Exportacion de reportes a PDF y CSV + comparticion nativa.
//
//  - CSV: se escribe en el directorio de cache con la API nueva de
//    expo-file-system (clase File) y se comparte. Lleva BOM UTF-8 para que
//    Excel (es-ES) respete acentos, y usa ';' como separador.
//  - PDF: expo-print renderiza un HTML con el tema de la clinica y devuelve un
//    file:// que se comparte con expo-sharing.
//
// Todo es dependency-light: expo-print, expo-sharing y expo-file-system ya
// forman parte del SDK de Expo (no son librerias de terceros).
// ---------------------------------------------------------------------------
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { ReportField, ResumenItem } from './sources';
import { toCSV } from './sources';

/** Quita acentos/espacios para un nombre de archivo seguro. */
function slug(s: string): string {
  return (s || 'reporte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .toLowerCase() || 'reporte';
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function compartir(uri: string, mimeType: string, titulo: string): Promise<void> {
  const disponible = await Sharing.isAvailableAsync();
  if (!disponible) {
    throw new Error('La comparticion no esta disponible en este dispositivo.');
  }
  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: titulo,
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.comma-separated-values-text',
  });
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
export async function exportarCSV(
  nombre: string,
  rows: any[],
  fields: ReportField[],
): Promise<void> {
  const csv = '\ufeff' + toCSV(rows, fields); // BOM para Excel
  const file = new File(Paths.cache, `${slug(nombre)}_${stamp()}.csv`);
  try {
    if (file.exists) file.delete();
  } catch {
    /* ignore */
  }
  file.create();
  file.write(csv);
  await compartir(file.uri, 'text/csv', 'Exportar CSV');
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
const esc = (v: any): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface PdfOptions {
  titulo: string;
  subtitulo?: string;
  /** Texto narrativo (reportes con IA). Se respetan saltos de linea. */
  narrativa?: string;
  resumen?: ResumenItem[];
  fields?: ReportField[];
  rows?: any[];
  meta?: { rol?: string; usuario?: string };
}

function construirHtml(o: PdfOptions): string {
  const generado = new Date().toLocaleString();
  const filas = o.rows ?? [];
  const cols = o.fields ?? [];

  const metaLinea = [
    o.meta?.usuario ? `Generado por: ${esc(o.meta.usuario)}` : '',
    o.meta?.rol ? `Rol: ${esc(o.meta.rol)}` : '',
    `Fecha: ${esc(generado)}`,
  ]
    .filter(Boolean)
    .join('&nbsp;&nbsp;·&nbsp;&nbsp;');

  const narrativaHtml = o.narrativa
    ? `<div class="narr"><div class="narr-t">Analisis</div><p>${esc(o.narrativa).replace(/\n/g, '<br/>')}</p></div>`
    : '';

  const resumenHtml =
    o.resumen && o.resumen.length
      ? `<div class="resumen">${o.resumen
          .map(
            it =>
              `<div class="chip"><span class="chip-l">${esc(it.label)}</span><span class="chip-v">${esc(
                it.value,
              )}</span></div>`,
          )
          .join('')}</div>`
      : '';

  let tablaHtml = '';
  if (cols.length && filas.length) {
    const head = cols.map(c => `<th>${esc(c.label)}</th>`).join('');
    const body = filas
      .map(
        (r, i) =>
          `<tr class="${i % 2 ? 'odd' : ''}">${cols
            .map(c => `<td>${esc(c.get(r))}</td>`)
            .join('')}</tr>`,
      )
      .join('');
    tablaHtml = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      <div class="count">${filas.length} registro(s)</div>`;
  } else if (cols.length) {
    tablaHtml = `<div class="vacio">Sin registros para los filtros seleccionados.</div>`;
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; padding: 28px 26px; font-size: 12px; }
  .head { border-bottom: 3px solid #0f6e56; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { color: #0f6e56; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  h1 { font-size: 19px; margin: 4px 0 2px; color: #0b5744; }
  .sub { color: #6b7280; font-size: 12px; margin: 0; }
  .meta { color: #6b7280; font-size: 10.5px; margin-top: 6px; }
  .narr { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
  .narr-t { color: #065f46; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
  .narr p { margin: 0; line-height: 1.5; }
  .resumen { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px; }
  .chip { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; min-width: 120px; }
  .chip-l { display: block; color: #6b7280; font-size: 10px; }
  .chip-v { display: block; color: #0b5744; font-weight: 700; font-size: 15px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #0f6e56; color: #fff; text-align: left; padding: 7px 8px; font-size: 10.5px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eef2f1; font-size: 10.5px; vertical-align: top; }
  tr.odd td { background: #f8fafc; }
  .count { color: #9ca3af; font-size: 10px; margin-top: 8px; text-align: right; }
  .vacio { color: #6b7280; padding: 16px; text-align: center; background: #f8fafc; border-radius: 8px; }
  .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 9.5px; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div class="brand">Clinica · Sistema de gestion</div>
    <h1>${esc(o.titulo)}</h1>
    ${o.subtitulo ? `<p class="sub">${esc(o.subtitulo)}</p>` : ''}
    <div class="meta">${metaLinea}</div>
  </div>
  ${narrativaHtml}
  ${resumenHtml}
  ${tablaHtml}
  <div class="foot">Documento generado automaticamente desde la app movil de la clinica.</div>
</body></html>`;
}

export async function exportarPDF(o: PdfOptions): Promise<void> {
  const html = construirHtml(o);
  const { uri } = await Print.printToFileAsync({ html });
  await compartir(uri, 'application/pdf', 'Exportar PDF');
}
