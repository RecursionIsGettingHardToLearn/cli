export const typeDefs = /* GraphQL */ `
  scalar DateTime

  enum RolNombre { ADMINISTRADOR MEDICO FARMACEUTICO PACIENTE }
  enum EstadoCita { AGENDADA ATENDIDA CANCELADA }
  enum EstadoHistoria { ABIERTA CERRADA }

  type Rol {
    id: Int!
    nombre: RolNombre!
    descripcion: String
  }

  type Usuario {
    id: ID!
    supabaseUid: String!
    nombre: String!
    email: String!
    rol: RolNombre!
    activo: Boolean!
  }

  type Paciente {
    id: ID!
    supabaseUid: String
    ci: String!
    nombre: String!
    apellido: String!
    telefono: String
    email: String
    fechaNacimiento: DateTime
    citas: [Cita!]!
    historia: HistoriaClinica
    pushToken: String
  }

  type Cita {
    id: ID!
    pacienteId: ID!
    paciente: Paciente
    medico: Usuario
    medicoUid: String!
    especialidad: String
    fechaHora: DateTime!
    urgencia: String
    estado: EstadoCita!
    motivo: String
    createdAt: DateTime
  }

  type HistoriaClinica {
    id: ID!
    pacienteId: ID!
    fechaApertura: DateTime!
    estado: EstadoHistoria!
    episodios: [Episodio!]!
  }

  type Episodio {
    id: ID!
    historiaId: ID!
    citaId: ID
    medicoUid: String!
    fecha: DateTime!
    motivoConsulta: String
    evolucion: String
    diagnosticoTexto: String
  }

  input PacienteInput {
    ci: String!
    nombre: String!
    apellido: String!
    telefono: String
    email: String
    fechaNacimiento: DateTime
    supabaseUid: String
  }

  input CitaInput {
    pacienteId: ID!
    medicoUid: String
    especialidad: String
    fechaHora: DateTime!
    urgencia: String
    motivo: String
  }

  input EpisodioInput {
    historiaId: ID!
    citaId: ID
    motivoConsulta: String
    evolucion: String
    diagnosticoTexto: String
  }

  type Query {
    me: Usuario
    miPaciente: Paciente
    usuarios: [Usuario!]!
    pacientes(q: String): [Paciente!]!
    paciente(id: ID!): Paciente
    citas: [Cita!]!
    misCitas: [Cita!]!
    historiaPorPaciente(pacienteId: ID!): HistoriaClinica
  }

  type Mutation {
    crearPaciente(input: PacienteInput!): Paciente!
    actualizarPaciente(id: ID!, input: PacienteInput!): Paciente!
    crearCita(input: CitaInput!): Cita!
    cancelarCita(id: ID!): Cita!
    crearEpisodio(input: EpisodioInput!): Episodio!
    cambiarRolUsuario(id: ID!, rol: RolNombre!): Usuario!
    actualizarUsuario(id: ID!, nombre: String, email: String): Usuario!
    desactivarUsuario(id: ID!): Usuario!
    activarUsuario(id: ID!): Usuario!
    # Al crear un usuario con rol PACIENTE se crea TAMBIEN su ficha en la tabla
    # paciente (misma cuenta), por eso admite los campos clinicos extra. Para
    # otros roles esos campos se ignoran. ci y apellido son obligatorios si el
    # rol es PACIENTE (el ci es lo que buscan las automatizaciones n8n).
    crearUsuario(
      nombre: String!
      email: String!
      password: String!
      rol: RolNombre!
      ci: String
      apellido: String
      telefono: String
      fechaNacimiento: DateTime
    ): Usuario!

    # --- Notificaciones push (Expo) ---
    # Registra el ExpoPushToken del dispositivo del usuario autenticado.
    registrarPushToken(token: String!): Boolean!
    # Recordatorio 24h: envía push a cada paciente con cita AGENDADA mañana
    # (rango calculado en America/La_Paz). Devuelve cuántos push se enviaron.
    enviarRecordatorios: Int!
    # Avisa al paciente que su resultado de estudio ya está disponible.
    notificarResultado(pacienteId: ID!, tipoEstudio: String): Boolean!
  }
`;
