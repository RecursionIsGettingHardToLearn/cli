import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { gql, useMutation, useQuery } from '@apollo/client';
import { useAuth } from '../auth/AuthContext';
import { env } from '../config/env';

/** Chat de pre-triaje conversacional (IA generativa).
 *
 * El movil NO conoce la API key del LLM: manda el mensaje (con el JWT del
 * paciente) a MS2 /api/chat-triaje, y es MS2 quien habla con Gemini usando
 * la key de su .env. Si el LLM no esta disponible, MS2 responde igual con
 * su clasificador por reglas (la pantalla no nota la diferencia).
 * Cuando la IA sugiere agendar, el boton dispara la mutation crearCita ya
 * existente en MS1 (que a su vez emite el push de confirmacion y el email).
 */

interface Burbuja {
  id: string;
  rol: 'user' | 'bot';
  texto: string;
}

interface Sugerencia {
  especialidad: string;
  urgencia: string | null;
}

const MI_PACIENTE = gql`
  query MiPacienteChatTriaje {
    miPaciente {
      id
      nombre
      apellido
    }
  }
`;

const CREAR_CITA_TRIAJE = gql`
  mutation CrearCitaDesdeTriaje($input: CitaInput!) {
    crearCita(input: $input) {
      id
      fechaHora
      especialidad
      estado
    }
  }
`;

let _seq = 0;
const nuevoId = () => `m${Date.now()}-${_seq++}`;

export function ChatTriajeScreen() {
  const { session, user } = useAuth();
  const { data: dataPaciente } = useQuery<any>(MI_PACIENTE, {
    fetchPolicy: 'cache-and-network',
  });
  const [crearCita, { loading: agendando }] = useMutation(CREAR_CITA_TRIAJE);

  const [mensajes, setMensajes] = useState<Burbuja[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const listaRef = useRef<FlatList<Burbuja>>(null);

  useEffect(() => {
    const nombre = user?.nombre ? `, ${user.nombre.split(' ')[0]}` : '';
    setMensajes([
      {
        id: nuevoId(),
        rol: 'bot',
        texto:
          `Hola${nombre}! Soy el asistente de la clinica. ` +
          'Cuentame que sintomas tienes y te oriento con la especialidad y la urgencia. ' +
          'Recuerda: esto es orientacion, no un diagnostico.',
      },
    ]);
  }, [user?.nombre]);

  const agregar = (b: Burbuja) =>
    setMensajes(prev => {
      const sig = [...prev, b];
      setTimeout(() => listaRef.current?.scrollToEnd({ animated: true }), 80);
      return sig;
    });

  const enviar = async () => {
    const mensaje = texto.trim();
    if (!mensaje || cargando) return;
    setTexto('');
    setSugerencia(null);

    const historial = mensajes.map(m => ({ rol: m.rol, texto: m.texto }));
    agregar({ id: nuevoId(), rol: 'user', texto: mensaje });
    setCargando(true);
    try {
      const resp = await fetch(`${env.diagnosticosUrl}/api/chat-triaje`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ mensaje, historial }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`);
      }
      agregar({ id: nuevoId(), rol: 'bot', texto: String(data.respuesta ?? '...') });
      if (data.agendar && data.especialidad) {
        setSugerencia({
          especialidad: String(data.especialidad),
          urgencia: data.urgencia ? String(data.urgencia) : null,
        });
      }
    } catch (e: any) {
      agregar({
        id: nuevoId(),
        rol: 'bot',
        texto:
          'No pude procesar tu mensaje (' +
          (e?.message ?? 'error de red') +
          '). Verifica que el servicio de IA este encendido e intenta de nuevo.',
      });
    } finally {
      setCargando(false);
    }
  };

  const agendar = async () => {
    if (!sugerencia || agendando) return;
    const pacienteId = dataPaciente?.miPaciente?.id;
    if (!pacienteId) {
      agregar({
        id: nuevoId(),
        rol: 'bot',
        texto:
          'No encontre tu registro de paciente vinculado a esta cuenta, ' +
          'asi que no puedo agendar desde aqui. Acercate a recepcion por favor.',
      });
      setSugerencia(null);
      return;
    }
    const sintomas = mensajes
      .filter(m => m.rol === 'user')
      .map(m => m.texto)
      .join(' / ')
      .slice(0, 180);
    const fechaHora = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      const r = await crearCita({
        variables: {
          input: {
            pacienteId,
            especialidad: sugerencia.especialidad,
            urgencia: sugerencia.urgencia,
            fechaHora,
            motivo: `Pre-triaje IA: ${sintomas}`,
          },
        },
      });
      const cita = r.data?.crearCita;
      const fecha = cita?.fechaHora
        ? new Date(cita.fechaHora).toLocaleString('es-BO', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'manana';
      agregar({
        id: nuevoId(),
        rol: 'bot',
        texto:
          `Listo! Tu cita de ${cita?.especialidad ?? sugerencia.especialidad} ` +
          `quedo agendada para ${fecha}. Te llegara una notificacion y un correo de confirmacion.`,
      });
      setSugerencia(null);
    } catch (e: any) {
      agregar({
        id: nuevoId(),
        rol: 'bot',
        texto: 'No pude agendar la cita (' + (e?.message ?? 'error') + '). Intenta de nuevo.',
      });
    }
  };

  const renderItem = ({ item }: { item: Burbuja }) => (
    <View
      style={[
        styles.burbuja,
        item.rol === 'user' ? styles.burbujaUser : styles.burbujaBot,
      ]}
    >
      <Text style={item.rol === 'user' ? styles.textoUser : styles.textoBot}>
        {item.texto}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={listaRef}
        data={mensajes}
        keyExtractor={m => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
        onContentSizeChange={() => listaRef.current?.scrollToEnd({ animated: true })}
      />

      {cargando && (
        <View style={styles.escribiendo}>
          <ActivityIndicator size="small" color="#0f6e56" />
          <Text style={styles.escribiendoTexto}>El asistente esta escribiendo...</Text>
        </View>
      )}

      {sugerencia && (
        <View style={styles.tarjeta}>
          <Text style={styles.tarjetaTitulo}>
            Sugerencia: {sugerencia.especialidad}
            {sugerencia.urgencia ? `  ·  urgencia ${sugerencia.urgencia}` : ''}
          </Text>
          <TouchableOpacity
            style={[styles.botonAgendar, agendando && styles.botonDeshabilitado]}
            onPress={agendar}
            disabled={agendando}
          >
            <Text style={styles.botonAgendarTexto}>
              {agendando ? 'Agendando...' : `Agendar cita de ${sugerencia.especialidad}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.filaInput}>
        <TextInput
          style={styles.input}
          value={texto}
          onChangeText={setTexto}
          placeholder="Describe tus sintomas..."
          placeholderTextColor="#9ca3af"
          multiline
          editable={!cargando}
          onSubmitEditing={enviar}
        />
        <TouchableOpacity
          style={[styles.botonEnviar, (cargando || !texto.trim()) && styles.botonDeshabilitado]}
          onPress={enviar}
          disabled={cargando || !texto.trim()}
        >
          <Text style={styles.botonEnviarTexto}>Enviar</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        Orientacion informativa generada con IA. No reemplaza la evaluacion de un medico.
        En una emergencia llama a los servicios de emergencia.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#f3f4f6' },
  lista: { padding: 12, paddingBottom: 4 },
  burbuja: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  burbujaBot: { alignSelf: 'flex-start', backgroundColor: '#ffffff' },
  burbujaUser: { alignSelf: 'flex-end', backgroundColor: '#0f6e56' },
  textoBot: { color: '#111827', fontSize: 15, lineHeight: 21 },
  textoUser: { color: '#ffffff', fontSize: 15, lineHeight: 21 },
  escribiendo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 4 },
  escribiendoTexto: { marginLeft: 8, color: '#6b7280', fontSize: 12 },
  tarjeta: {
    backgroundColor: '#ecfdf5',
    borderColor: '#0f6e56',
    borderWidth: 1,
    borderRadius: 12,
    margin: 10,
    padding: 12,
  },
  tarjetaTitulo: { color: '#065f46', fontWeight: '600', marginBottom: 8 },
  botonAgendar: { backgroundColor: '#0f6e56', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  botonAgendarTexto: { color: '#fff', fontWeight: '600' },
  filaInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#111827',
  },
  botonEnviar: {
    marginLeft: 8,
    backgroundColor: '#0f6e56',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  botonEnviarTexto: { color: '#fff', fontWeight: '600' },
  botonDeshabilitado: { opacity: 0.5 },
  disclaimer: {
    fontSize: 11,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
});
