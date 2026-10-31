/**
 * Convierte un registro compilado OCDS de Guatecompras en las filas del histórico (CU-11, paso 3).
 * Solo se guarda lo que usan el historial y las banderas rojas; el registro completo sigue en el archivo.
 */

interface Parte { id?: string; name?: string; roles?: string[]; memberOf?: Organizacion[]; identifier?: { id?: string; scheme?: string }; details?: { legalEntityTypeDetail?: { description?: string } } }
interface Organizacion { id?: string; name?: string }
interface RegistroOcds {
  ocid?: string;
  date?: string;
  buyer?: Organizacion;
  parties?: Parte[];
  tender?: {
    id?: string; title?: string; status?: string; statusDetails?: string; datePublished?: string;
    procurementMethodDetails?: string; mainProcurementCategory?: string; numberOfTenderers?: number;
    tenderPeriod?: { startDate?: string; endDate?: string };
    procuringEntity?: Organizacion;
    items?: { classification?: { id?: string } }[];
  };
  awards?: { date?: string; status?: string; value?: { amount?: number }; suppliers?: Organizacion[] }[];
}

export interface ProveedorFila { identificador: string; nit: string | null; nombre: string; tipo: string | null }
export interface ProcesoFila {
  ocid: string; nog: string | null; comprador_id: string; comprador_nombre: string; unidad_id: string | null; unidad_nombre: string | null;
  titulo: string; modalidad: string;
  categoria: string | null; clasificaciones: string[]; fecha_publicacion: string | null; inicio_ofertas: string | null;
  fin_ofertas: string | null; numero_ofertas: number | null; estado: string | null; actualizado_en: string | null;
}
export interface AdjudicacionFila { ocid: string; identificador: string; monto: number | null; fecha: string | null; estado: string | null }

/** Fecha OCDS ("2020-02-28T15:12:47-06:00") en ISO UTC; null si no es válida. */
export function fechaUtc(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const f = new Date(valor);
  return Number.isNaN(f.getTime()) ? null : f.toISOString();
}

const limpiar = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').replace(/^"+|"+$/g, '').trim();

/**
 * Las personas individuales vienen como "APELLIDO1,APELLIDO2,APELLIDO_CASADA,NOMBRE1,NOMBRE2":
 * se devuelven en orden natural ("EDGAR BEMBENUTO MENDÓZA"). Las empresas quedan igual.
 */
export function nombreProveedor(nombre: string | undefined | null): string {
  const texto = limpiar(nombre);
  const partes = texto.split(',');
  if (partes.length === 5) {
    const [ap1, ap2, casada, n1, n2] = partes.map((p) => p.trim());
    return [n1, n2, ap1, ap2, casada ? `DE ${casada}` : ''].filter(Boolean).join(' ');
  }
  return texto.replace(/,+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizarRegistro(r: RegistroOcds): { proceso: ProcesoFila; proveedores: ProveedorFila[]; adjudicaciones: AdjudicacionFila[] } | null {
  const t = r.tender;
  if (!r.ocid || !t) return null;
  const comprador = r.buyer?.id ? r.buyer : t.procuringEntity;
  const partes = new Map((r.parties ?? []).filter((p) => p.id).map((p) => [p.id!, p]));
  // La unidad compradora es la parte con rol buyer que pertenece (memberOf) a la entidad
  const unidad = (r.parties ?? []).find((p) => p.roles?.includes('buyer') && p.memberOf?.length);

  const proceso: ProcesoFila = {
    ocid: r.ocid,
    nog: t.id?.match(/^GT-NOG-(\d+)$/)?.[1] ?? null,
    comprador_id: comprador?.id ?? 'desconocido',
    comprador_nombre: limpiar(comprador?.name) || 'Sin entidad',
    unidad_id: unidad?.id ?? null,
    unidad_nombre: unidad ? limpiar(unidad.name) || null : null,
    titulo: limpiar(t.title) || '(sin título)',
    modalidad: limpiar(t.procurementMethodDetails) || 'Sin modalidad',
    categoria: t.mainProcurementCategory ?? null,
    clasificaciones: [...new Set((t.items ?? []).map((i) => i.classification?.id).filter((c): c is string => !!c))].slice(0, 20),
    fecha_publicacion: fechaUtc(t.datePublished ?? t.tenderPeriod?.startDate),
    inicio_ofertas: fechaUtc(t.tenderPeriod?.startDate),
    fin_ofertas: fechaUtc(t.tenderPeriod?.endDate),
    numero_ofertas: typeof t.numberOfTenderers === 'number' ? t.numberOfTenderers : null,
    estado: t.statusDetails ?? t.status ?? null,
    actualizado_en: fechaUtc(r.date),
  };

  const proveedores = new Map<string, ProveedorFila>();
  const adjudicaciones: AdjudicacionFila[] = [];
  for (const a of r.awards ?? []) {
    const suppliers = (a.suppliers ?? []).filter((s) => s.id);
    if (!suppliers.length) continue;
    // Una adjudicación a varios proveedores (consorcio) reparte el monto en partes iguales
    const monto = typeof a.value?.amount === 'number' ? a.value.amount / suppliers.length : null;
    for (const s of suppliers) {
      const parte = partes.get(s.id!);
      const nit = s.id!.match(/^GT-NIT-(.+)$/)?.[1] ?? (parte?.identifier?.scheme === 'GT-NIT' ? parte.identifier.id ?? null : null);
      proveedores.set(s.id!, {
        identificador: s.id!,
        nit,
        nombre: nombreProveedor(s.name ?? parte?.name) || s.id!,
        tipo: parte?.details?.legalEntityTypeDetail?.description ?? null,
      });
      adjudicaciones.push({ ocid: r.ocid, identificador: s.id!, monto, fecha: fechaUtc(a.date), estado: a.status ?? null });
    }
  }
  return { proceso, proveedores: [...proveedores.values()], adjudicaciones };
}
