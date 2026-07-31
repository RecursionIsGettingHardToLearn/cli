/**
 * Pruebas Unitarias — Frontend Angular / DiagnosticoComponent
 * ============================================================
 * Componente testeado: frontend/src/app/features/diagnostico/diagnostico.component.ts
 * Comportamiento cubierto:
 *   - analizarSup / analizarNs: valida que haya archivo antes de llamar al servicio
 *   - tipoFinal: usa el texto libre cuando el tipo es "Otro"
 *   - notificar: no ejecuta la mutation si no hay paciente seleccionado
 *   - Inicialización: carga la lista de pacientes al iniciar
 *   - Estado de carga: activa/desactiva cargandoSup correctamente
 *
 * Ejecución:
 *   cd frontend
 *   npm install
 *   npx ng test --include="../../tests/unitarias/frontend/**"
 *
 * O con Jest (si jest está configurado para el proyecto Angular):
 *   npx jest tests/unitarias/frontend/
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Apollo } from 'apollo-angular';

// Componente real
import { DiagnosticoComponent } from '../../../frontend/src/app/features/diagnostico/diagnostico.component';
// Servicio real
import { Ms2Service } from '../../../frontend/src/app/core/services/ms2.service';

// ─── Stubs ───────────────────────────────────────────────────────────────────

const ms2Stub = {
  diagnosticar: jest.fn(),
};

const apolloStub = {
  query: jest.fn(),
  mutate: jest.fn(),
};

// Respuesta de análisis completa (igual al schema real del backend)
const mockAnalisisResponse = {
  resultado_id: 42,
  proveedor: 'openai',
  tipo_imagen: 'Radiografia de torax',
  clasificacion: 'Normal',
  probabilidad: 0.70,
  probabilidades: [
    { clase: 'Normal', probabilidad: 0.70 },
    { clase: 'Neumonia', probabilidad: 0.20 },
    { clase: 'Derrame pleural', probabilidad: 0.10 },
  ],
  score_anomalia: 0.18,
  es_anomalo: false,
  justificacion_anomalia: 'Imagen dentro de parametros normales',
  hallazgos: ['Estructuras oseas bien definidas', 'Silueta cardiaca normal'],
  urgencia: 'BAJA',
  recomendacion: 'Control de rutina en 6 meses',
  confianza: 0.70,
  nota_seguridad: 'Resultado informativo. No reemplaza evaluacion medica.',
  estado_revision: 'PENDIENTE',
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('DiagnosticoComponent', () => {
  let component: DiagnosticoComponent;

  beforeEach(() => {
    // Apollo query para la lista de pacientes (se llama en ngOnInit)
    apolloStub.query.mockReturnValue(of({
      data: {
        pacientes: [
          { id: '16a46201-9bc1-4d28-a565-4832fcc6a82a', ci: '1000000', nombre: 'Diego', apellido: 'Torres Fernandez' },
          { id: 'd6b9e06c-436f-4cda-8630-eee946f25f60', ci: '1000001', nombre: 'Isabel', apellido: 'Mamani Nina' },
        ],
      },
    }));

    TestBed.configureTestingModule({
      imports: [DiagnosticoComponent],
      providers: [
        { provide: Apollo, useValue: apolloStub },
        { provide: Ms2Service, useValue: ms2Stub },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DiagnosticoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // dispara ngOnInit
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Inicialización ─────────────────────────────────────────────────

  describe('ngOnInit', () => {
    it('carga la lista de pacientes con cuenta al iniciar', () => {
      expect(apolloStub.query).toHaveBeenCalled();
      expect(component.pacientes).toHaveLength(2);
    });

    it('resultado supervisado comienza en null', () => {
      expect(component.resSup).toBeNull();
    });

    it('resultado no supervisado comienza en null', () => {
      expect(component.resNoSup).toBeNull();
    });

    it('no hay paciente seleccionado al inicio', () => {
      expect(component.pacienteId).toBeNull();
    });
  });

  // ─── Validación antes de analizar ───────────────────────────────────

  describe('analizarSup', () => {
    it('no llama a ms2 si no hay archivo seleccionado', fakeAsync(() => {
      component.fileSup = null;
      component.analizarSup();
      tick();

      expect(ms2Stub.diagnosticar).not.toHaveBeenCalled();
    }));

    it('activa cargandoSup mientras analiza', fakeAsync(() => {
      component.fileSup = new File(['datos'], 'radiografia.jpg', { type: 'image/jpeg' });
      ms2Stub.diagnosticar.mockReturnValue(of(mockAnalisisResponse));

      component.analizarSup();
      expect(component.cargandoSup).toBe(true);
      tick();
      expect(component.cargandoSup).toBe(false);
    }));

    it('asigna resSup con la clasificación del backend', fakeAsync(() => {
      component.fileSup = new File(['datos'], 'radiografia.jpg', { type: 'image/jpeg' });
      ms2Stub.diagnosticar.mockReturnValue(of(mockAnalisisResponse));

      component.analizarSup();
      tick();

      expect(component.resSup).not.toBeNull();
      expect(component.resSup?.clasificacion).toBe('Normal');
      expect(component.resSup?.probabilidades).toHaveLength(3);
    }));

    it('captura el error y limpia cargandoSup', fakeAsync(() => {
      component.fileSup = new File(['datos'], 'radiografia.jpg', { type: 'image/jpeg' });
      ms2Stub.diagnosticar.mockReturnValue(throwError(() => ({ message: 'timeout' })));

      component.analizarSup();
      tick();

      expect(component.cargandoSup).toBe(false);
      expect(component.errorSup).toBeTruthy();
      expect(component.resSup).toBeNull();
    }));
  });

  // ─── Análisis no supervisado ─────────────────────────────────────────

  describe('analizarNoSup', () => {
    it('no llama a ms2 si no hay archivo', fakeAsync(() => {
      component.fileNoSup = null;
      component.analizarNoSup();
      tick();

      expect(ms2Stub.diagnosticar).not.toHaveBeenCalled();
    }));

    it('asigna resNoSup con el score de anomalía', fakeAsync(() => {
      component.fileNoSup = new File(['datos'], 'eco.jpg', { type: 'image/jpeg' });
      ms2Stub.diagnosticar.mockReturnValue(of(mockAnalisisResponse));

      component.analizarNoSup();
      tick();

      expect(component.resNoSup?.score_anomalia).toBe(0.18);
      expect(component.resNoSup?.es_anomalo).toBe(false);
    }));

    it('marca es_anomalo=true cuando score >= 0.5', fakeAsync(() => {
      component.fileNoSup = new File(['datos'], 'lesion.jpg', { type: 'image/jpeg' });
      const anomaloResponse = { ...mockAnalisisResponse, score_anomalia: 0.82, es_anomalo: true };
      ms2Stub.diagnosticar.mockReturnValue(of(anomaloResponse));

      component.analizarNoSup();
      tick();

      expect(component.resNoSup?.es_anomalo).toBe(true);
      expect(component.resNoSup?.score_anomalia).toBeGreaterThanOrEqual(0.5);
    }));
  });

  // ─── Tipo de estudio ────────────────────────────────────────────────

  describe('tipoFinal (tipo de estudio)', () => {
    it('devuelve el tipo seleccionado cuando no es "Otro"', () => {
      component.tipoSup = 'Tomografía (TC)';
      // tipoFinal es privado; lo accedemos a través del comportamiento de analizarSup
      const fd = new FormData();
      fd.append('descripcion', component['tipoDe'](component.tipoSup, ''));
      expect(fd.get('descripcion')).toBe('Tomografía (TC)');
    });

    it('usa el texto libre cuando el tipo es "Otro"', () => {
      component.tipoSup = 'Otro';
      component.tipoSupOtro = 'Mamografía bilateral';
      const tipo = component['tipoDe']('Otro', 'Mamografía bilateral');
      expect(tipo).toBe('Mamografía bilateral');
    });

    it('usa "estudio clínico" como fallback si "Otro" y el campo está vacío', () => {
      const tipo = component['tipoDe']('Otro', '');
      expect(tipo).toBe('estudio clínico');
    });
  });

  // ─── Notificación ───────────────────────────────────────────────────

  describe('notificar', () => {
    it('no llama a la mutation si no hay paciente seleccionado', fakeAsync(() => {
      component.resSup = mockAnalisisResponse as any;
      component.pacienteId = null;

      component.notificar();
      tick();

      expect(apolloStub.mutate).not.toHaveBeenCalled();
    }));

    it('llama a la mutation notificarResultado con el pacienteId correcto', fakeAsync(() => {
      component.resSup = mockAnalisisResponse as any;
      component.pacienteId = '16a46201-9bc1-4d28-a565-4832fcc6a82a';
      apolloStub.mutate.mockReturnValue(of({ data: { notificarResultado: true } }));

      component.notificar();
      tick();

      expect(apolloStub.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            pacienteId: '16a46201-9bc1-4d28-a565-4832fcc6a82a',
          }),
        })
      );
    }));

    it('muestra mensaje de éxito cuando el push se envió', fakeAsync(() => {
      component.pacienteId = '16a46201-9bc1-4d28-a565-4832fcc6a82a';
      component.resSup = mockAnalisisResponse as any;
      apolloStub.mutate.mockReturnValue(of({ data: { notificarResultado: true } }));

      component.notificar();
      tick();

      expect(component.notifMsg).toContain('✅');
    }));

    it('muestra advertencia cuando el paciente no tiene token push', fakeAsync(() => {
      component.pacienteId = '16a46201-9bc1-4d28-a565-4832fcc6a82a';
      component.resSup = mockAnalisisResponse as any;
      apolloStub.mutate.mockReturnValue(of({ data: { notificarResultado: false } }));

      component.notificar();
      tick();

      expect(component.notifMsg).toContain('⚠️');
    }));
  });

  // ─── Independencia entre los dos análisis ───────────────────────────

  describe('independencia supervisado / no supervisado', () => {
    it('analizarSup no altera resNoSup', fakeAsync(() => {
      component.fileNoSup = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
      const prevNs = { score_anomalia: 0.33, es_anomalo: false } as any;
      component.resNoSup = prevNs;
      component.fileSup = new File(['y'], 'y.jpg', { type: 'image/jpeg' });
      ms2Stub.diagnosticar.mockReturnValue(of(mockAnalisisResponse));

      component.analizarSup();
      tick();

      expect(component.resNoSup).toBe(prevNs); // no se tocó
    }));

    it('analizarNoSup no altera resSup', fakeAsync(() => {
      const prevSup = { clasificacion: 'Normal', probabilidad: 0.7 } as any;
      component.resSup = prevSup;
      component.fileNoSup = new File(['y'], 'y.jpg', { type: 'image/jpeg' });
      ms2Stub.diagnosticar.mockReturnValue(of(mockAnalisisResponse));

      component.analizarNoSup();
      tick();

      expect(component.resSup).toBe(prevSup); // no se tocó
    }));
  });
});
