import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLazyQuery, useMutation } from '@apollo/client';
import { HISTORIA_POR_PACIENTE, CREAR_EPISODIO } from '../graphql/queries';
import {
  Screen,
  Card,
  Field,
  PrimaryButton,
  Loading,
  Banner,
  SectionTitle,
  COLORS,
  fmtFecha,
} from '../ui/kit';
import { PacienteSearch, type PacienteLite } from '../components/PacienteSearch';

export function DiagnosticoScreen() {
  const [paciente, setPaciente] = useState<PacienteLite | null>(null);
  const [motivo, setMotivo] = useState('');
  const [evolucion, setEvolucion] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [cargarHistoria, { data, loading }] = useLazyQuery<any>(HISTORIA_POR_PACIENTE, {
    fetchPolicy: 'network-only',
  });

  const [crear, { loading: saving }] = useMutation(CREAR_EPISODIO, {
    onCompleted: () => {
      setMsg({ kind: 'ok', text: 'Episodio registrado correctamente.' });
      setMotivo('');
      setEvolucion('');
      setDiagnostico('');
      if (paciente) cargarHistoria({ variables: { pacienteId: paciente.id } });
    },
    onError: (e) => setMsg({ kind: 'error', text: e.message }),
  });

  function onSelect(p: PacienteLite) {
    setPaciente(p);
    setMsg(null);
    cargarHistoria({ variables: { pacienteId: p.id } });
  }

  const historia = data?.historiaPorPaciente;
  const episodios: any[] = historia?.episodios ?? [];

  function submit() {
    setMsg(null);
    if (!historia?.id) {
      return setMsg({
        kind: 'error',
        text: 'El paciente no tiene historia clínica abierta donde registrar el episodio.',
      });
    }
    if (!motivo.trim() && !evolucion.trim() && !diagnostico.trim()) {
      return setMsg({ kind: 'error', text: 'Completa al menos un campo del episodio.' });
    }
    crear({
      variables: {
        input: {
          historiaId: historia.id,
          motivoConsulta: motivo.trim() || null,
          evolucion: evolucion.trim() || null,
          diagnosticoTexto: diagnostico.trim() || null,
        },
      },
    });
  }

  return (
    <Screen>
      <Card>
        <SectionTitle>Paciente</SectionTitle>
        <PacienteSearch selected={paciente} onSelect={onSelect} onClear={() => setPaciente(null)} />
      </Card>

      {loading && <Loading />}

      {paciente && !loading && (
        <Card>
          {!historia ? (
            <Banner
              kind="warn"
              message="Sin historia clínica abierta para este paciente. No se puede registrar el episodio."
            />
          ) : (
            <>
              <SectionTitle>Nuevo episodio / diagnóstico</SectionTitle>
              {msg && <Banner kind={msg.kind} message={msg.text} />}
              <Field
                label="Motivo de consulta"
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Síntoma principal, motivo de la visita"
                multiline
              />
              <Field
                label="Evolución"
                value={evolucion}
                onChangeText={setEvolucion}
                placeholder="Evolución / exploración"
                multiline
              />
              <Field
                label="Diagnóstico"
                value={diagnostico}
                onChangeText={setDiagnostico}
                placeholder="Diagnóstico clínico"
                multiline
              />
              <PrimaryButton title="Guardar episodio" onPress={submit} loading={saving} />
            </>
          )}
        </Card>
      )}

      {historia && episodios.length > 0 && (
        <>
          <SectionTitle>Episodios previos ({episodios.length})</SectionTitle>
          {episodios
            .slice()
            .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
            .slice(0, 5)
            .map((e) => (
              <Card key={e.id}>
                <Text style={s.epFecha}>{fmtFecha(e.fecha)}</Text>
                {e.diagnosticoTexto ? (
                  <Text style={s.epField}>{e.diagnosticoTexto}</Text>
                ) : (
                  <Text style={s.epField}>{e.motivoConsulta ?? 'Sin diagnóstico'}</Text>
                )}
              </Card>
            ))}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  epFecha: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginBottom: 4 },
  epField: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
});
