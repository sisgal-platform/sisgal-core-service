// Datos ya resueltos (nombres, direcciones, montos) necesarios para dibujar el
// desprendible de nómina en PDF. No es una copia de la entidad: es exactamente
// lo que la plantilla necesita, para que el servicio de generación no dependa
// de TypeORM ni de los nombres de columnas de la base de datos.
export type PayrollSlipData = {
  company: {
    name: string;
    // null cuando la compañía no tiene NIT registrado (en vez de mostrar un
    // dato inventado); si lo tiene, se muestra tal cual está en la BD.
    nit: string | null;
  };
  branch: {
    name: string;
    city: string;
    address: string | null;
  };
  employee: {
    fullName: string;
    documentType: string;
    document: string;
    position: string | null;
  };
  period: {
    start: Date;
    end: Date;
    settlementDate: Date;
  };
  earnings: { conceptName: string; amount: number }[];
  deductions: { conceptName: string; amount: number }[];
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  generatedAt: Date;
};
