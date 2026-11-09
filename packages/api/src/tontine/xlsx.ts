/**
 * Classeur Excel (.xlsx, Office Open XML) écrit à la main, sans dépendance :
 * une archive ZIP (deflate de node:zlib, CRC-32 de node:zlib) contenant le
 * strict minimum lu par Excel, LibreOffice et Google Sheets. Cellules en
 * texte « inline » (pas de table de chaînes partagées), montants en nombres,
 * première ligne en gras et figée, largeurs de colonnes ajustées.
 */
import { crc32, deflateRawSync } from "node:zlib";

export type Cell = string | number | bigint | null | undefined;
export interface Sheet {
  /** Nom de l'onglet (31 caractères au plus, sans : \ / ? * [ ]). */
  readonly name: string;
  readonly header: readonly string[];
  readonly rows: readonly (readonly Cell[])[];
  /** Colonnes à écrire en nombre (indices base 0) ; les autres restent du texte. */
  readonly numeric?: readonly number[];
}

const esc = (s: string): string =>
  s
    // Caractères de contrôle interdits en XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetName(raw: string, used: Set<string>): string {
  let base = raw.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Feuille";
  let name = base;
  for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 28)} ${k}`;
  used.add(name.toLowerCase());
  return name;
}

function sheetXml(sheet: Sheet): string {
  const numeric = new Set(sheet.numeric ?? []);
  const widths = sheet.header.map((h, i) =>
    Math.min(60, Math.max(8, h.length + 2, ...sheet.rows.slice(0, 500).map((r) => String(r[i] ?? "").length + 2))),
  );
  const cell = (ref: string, v: Cell, num: boolean, style: number): string => {
    if (v === null || v === undefined || v === "") return "";
    const s = style ? ` s="${style}"` : "";
    if (num) {
      const str = String(v).trim();
      if (/^-?\d+(\.\d+)?$/.test(str)) return `<c r="${ref}"${s}><v>${str}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
  };
  const rows: string[] = [];
  rows.push(`<row r="1">${sheet.header.map((h, i) => cell(`${colName(i)}1`, h, false, 1)).join("")}</row>`);
  sheet.rows.forEach((r, ri) => {
    const n = ri + 2;
    rows.push(`<row r="${n}">${sheet.header.map((_, i) => cell(`${colName(i)}${n}`, r[i], numeric.has(i), numeric.has(i) ? 2 : 0)).join("")}</row>`);
  });
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${rows.join("")}</sheetData>` +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Archive ZIP (méthode deflate) — en-têtes locaux, répertoire central, fin. */
function zip(files: readonly { name: string; data: Buffer }[], when: Date): Buffer {
  const dosTime = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2);
  const dosDate = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const packed = deflateRawSync(f.data);
    const crc = crc32(f.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

export function buildXlsx(sheets: readonly Sheet[], opts: { readonly title?: string; readonly now?: Date } = {}): Buffer {
  const when = opts.now ?? new Date();
  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: sheetName(s.name, used) }));
  const x = (s: string): Buffer => Buffer.from(s, "utf8");
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  const files: { name: string; data: Buffer }[] = [
    {
      name: "[Content_Types].xml",
      data: x(
        head +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
          `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: x(
        head +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "docProps/core.xml",
      data: x(
        head +
          `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
          `<dc:title>${esc(opts.title ?? "KÓMBE")}</dc:title><dc:creator>KÓMBE</dc:creator>` +
          `<dcterms:created xsi:type="dcterms:W3CDTF">${when.toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created>` +
          `</cp:coreProperties>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: x(
        head +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${named.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
          `</workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: x(
        head +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
          `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    { name: "xl/styles.xml", data: x(STYLES) },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x(sheetXml(s)) })),
  ];
  return zip(files, when);
}
