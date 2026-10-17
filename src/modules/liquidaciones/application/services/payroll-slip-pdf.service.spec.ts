import { PayrollSlipPdfService } from './payroll-slip-pdf.service';
import { PayrollSlipData } from 'src/modules/liquidaciones/domain/payroll-slip';

describe('PayrollSlipPdfService', () => {
  let service: PayrollSlipPdfService;

  beforeEach(() => {
    service = new PayrollSlipPdfService();
  });

  it('genera un PDF válido con los datos de la liquidación', async () => {
    const buffer = await service.generate(crearDatos());

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('genera un documento distinto por cada liquidación (no reutiliza un PDF cacheado)', async () => {
    const primero = await service.generate(crearDatos({ netPay: 1000000 }));
    const segundo = await service.generate(crearDatos({ netPay: 2000000 }));

    expect(primero.equals(segundo)).toBe(false);
  });

  it('no lanza errores cuando no hay conceptos devengados ni deducciones', async () => {
    await expect(
      service.generate(crearDatos({ earnings: [], deductions: [] })),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('propaga un error si pdfkit falla al generar el documento', async () => {
    const datosInvalidos = { ...crearDatos(), period: null } as unknown as PayrollSlipData;

    await expect(service.generate(datosInvalidos)).rejects.toThrow();
  });
});

function crearDatos(overrides: Partial<PayrollSlipData> = {}): PayrollSlipData {
  return {
    company: { name: 'JS Burguer Parrilla', nit: null },
    branch: { name: 'Envigado', city: 'Envigado', address: 'Calle 46 Sur # 42B-16, Zona 7' },
    employee: { fullName: 'Ana Barros', documentType: 'CC', document: '1020304050', position: 'Mesera' },
    period: {
      start: new Date('2026-09-01'),
      end: new Date('2026-09-30'),
      settlementDate: new Date('2026-09-30'),
    },
    earnings: [
      { conceptName: 'Salario base', amount: 1530000 },
      { conceptName: 'Horas extra', amount: 270000 },
    ],
    deductions: [{ conceptName: 'Salud y pensión', amount: 150000 }],
    totalEarnings: 1800000,
    totalDeductions: 150000,
    netPay: 1650000,
    generatedAt: new Date('2026-10-17'),
    ...overrides,
  };
}
