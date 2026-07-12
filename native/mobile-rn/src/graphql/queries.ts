import { gql } from '@apollo/client';

export const HEALTH = gql`query { health }`;

// Registra el ExpoPushToken del dispositivo en MS1 (ms-pacientes).
export const REGISTRAR_PUSH_TOKEN = gql`
  mutation RegistrarPushToken($token: String!) {
    registrarPushToken(token: $token)
  }
`;

export const MIS_RECETAS_PACIENTE = gql`
  query MisRecetasPaciente {
    misRecetasPaciente {
      id fechaEmision controlado blockchainTx hashDocumento estado
      medicoNombre diagnostico
      detalles { medicamento { nombre } cantidad posologia }
    }
  }
`;

export const MIS_RECETAS_MEDICO = gql`
  query MisRecetasMedico {
    misRecetas {
      id fechaEmision controlado blockchainTx hashDocumento estado
      paciente { id nombre apellido }
      detalles { medicamento { nombre } cantidad }
    }
  }
`;

export const MIS_FACTURAS_PACIENTE = gql`
  query MisFacturas {
    misFacturas {
      id numero fecha total metodoPago estado
      detalles { medicamento { nombre } cantidad subtotal }
    }
  }
`;

export const VERIFICAR_RECETA = gql`
  query VerificarReceta($id: UUID!) {
    verificarReceta(id: $id) {
      exists id timestamp blockNumber razon error
    }
  }
`;

export const LIST_MEDICAMENTOS = gql`
  query Medicamentos($q: String) {
    medicamentos(q: $q, activo: true) {
      id nombre precioVenta controlado requiereReceta
    }
  }
`;

export const CREAR_CHECKOUT_FACTURA = gql`
  mutation CrearCheckoutFactura($facturaId: UUID!) {
    crearCheckoutFactura(facturaId: $facturaId)
  }
`;

// ============================================================================
//  Operaciones de GESTION POR ROL (paridad con la web).
//  Todo resuelve contra el mismo gateway (env.graphqlUrl) que hace stitching
//  del backend Node (citas/historia/usuarios/pacientes) + springboot
//  (inventario/facturas/recetas/BI). Por eso conviven tipos ID/UUID/DateTime.
// ============================================================================

// ---- Perfil / sesion -------------------------------------------------------
export const ME = gql`
  query Me {
    me { id supabaseUid nombre email rol activo }
  }
`;

export const MI_PACIENTE = gql`
  query MiPaciente {
    miPaciente { id ci nombre apellido telefono email fechaNacimiento }
  }
`;

// ---- CITAS (ADMIN / MEDICO / PACIENTE) ------------------------------------
const CITA_FIELDS = `
  id pacienteId medicoUid especialidad fechaHora urgencia estado motivo createdAt
  paciente { id nombre apellido ci }
  medico { id nombre }
`;

export const MIS_CITAS = gql`
  query MisCitas { misCitas { ${CITA_FIELDS} } }
`;

export const CITAS = gql`
  query Citas { citas { ${CITA_FIELDS} } }
`;

export const CREAR_CITA = gql`
  mutation CrearCita($input: CitaInput!) {
    crearCita(input: $input) { ${CITA_FIELDS} }
  }
`;

export const CANCELAR_CITA = gql`
  mutation CancelarCita($id: ID!) {
    cancelarCita(id: $id) { id estado }
  }
`;

// ---- HISTORIA CLINICA / DIAGNOSTICO (ADMIN / MEDICO) ----------------------
export const HISTORIA_POR_PACIENTE = gql`
  query HistoriaPorPaciente($pacienteId: ID!) {
    historiaPorPaciente(pacienteId: $pacienteId) {
      id pacienteId fechaApertura estado
      episodios {
        id citaId medicoUid fecha motivoConsulta evolucion diagnosticoTexto
      }
    }
  }
`;

export const CREAR_EPISODIO = gql`
  mutation CrearEpisodio($input: EpisodioInput!) {
    crearEpisodio(input: $input) {
      id historiaId fecha motivoConsulta evolucion diagnosticoTexto
    }
  }
`;

// ---- PACIENTES / RECEPCION (ADMIN / FARMACEUTICO) -------------------------
export const PACIENTES = gql`
  query Pacientes($q: String) {
    pacientes(q: $q) {
      id ci nombre apellido telefono email fechaNacimiento
    }
  }
`;

export const PACIENTE = gql`
  query Paciente($id: ID!) {
    paciente(id: $id) {
      id ci nombre apellido telefono email fechaNacimiento
      historia { id estado }
    }
  }
`;

export const CREAR_PACIENTE = gql`
  mutation CrearPaciente($input: PacienteInput!) {
    crearPaciente(input: $input) { id ci nombre apellido }
  }
`;

export const ACTUALIZAR_PACIENTE = gql`
  mutation ActualizarPaciente($id: ID!, $input: PacienteInput!) {
    actualizarPaciente(id: $id, input: $input) { id ci nombre apellido telefono email }
  }
`;

// ---- ADMINISTRACION (USUARIOS) (ADMIN) ------------------------------------
export const USUARIOS = gql`
  query Usuarios {
    usuarios { id supabaseUid nombre email rol activo }
  }
`;

export const CREAR_USUARIO = gql`
  mutation CrearUsuario(
    $nombre: String!, $email: String!, $password: String!, $rol: RolNombre!,
    $ci: String, $apellido: String, $telefono: String, $fechaNacimiento: DateTime
  ) {
    crearUsuario(
      nombre: $nombre, email: $email, password: $password, rol: $rol,
      ci: $ci, apellido: $apellido, telefono: $telefono, fechaNacimiento: $fechaNacimiento
    ) { id nombre email rol activo }
  }
`;

export const CAMBIAR_ROL_USUARIO = gql`
  mutation CambiarRolUsuario($id: ID!, $rol: RolNombre!) {
    cambiarRolUsuario(id: $id, rol: $rol) { id rol }
  }
`;

export const ACTIVAR_USUARIO = gql`
  mutation ActivarUsuario($id: ID!) { activarUsuario(id: $id) { id activo } }
`;

export const DESACTIVAR_USUARIO = gql`
  mutation DesactivarUsuario($id: ID!) { desactivarUsuario(id: $id) { id activo } }
`;

// ---- INVENTARIO (ADMIN / FARMACEUTICO) ------------------------------------
export const CATEGORIAS = gql`
  query Categorias { categorias { id nombre } }
`;

export const MEDICAMENTOS = gql`
  query MedicamentosFull($q: String, $activo: Boolean) {
    medicamentos(q: $q, activo: $activo) {
      id nombre descripcion precioVenta requiereReceta controlado stockMinimo activo
      categoria { id nombre }
    }
  }
`;

export const LOTES_POR_MEDICAMENTO = gql`
  query LotesPorMedicamento($medicamentoId: UUID!) {
    lotesByMedicamento(medicamentoId: $medicamentoId) {
      id codigoLote fechaVencimiento cantidadInicial cantidadActual precioCompra
    }
  }
`;

export const CREAR_MEDICAMENTO = gql`
  mutation CrearMedicamento($input: MedicamentoInput!) {
    crearMedicamento(input: $input) { id nombre precioVenta }
  }
`;

export const REGISTRAR_ENTRADA_LOTE = gql`
  mutation RegistrarEntradaLote($input: LoteInput!) {
    registrarEntradaLote(input: $input) { id codigoLote cantidadActual }
  }
`;

export const AJUSTAR_STOCK = gql`
  mutation AjustarStock($loteId: UUID!, $cantidad: Int!, $motivo: String!) {
    ajustarStock(loteId: $loteId, cantidad: $cantidad, motivo: $motivo) {
      id tipo cantidad
    }
  }
`;

// ---- FACTURAS / CAJA (ADMIN / FARMACEUTICO) -------------------------------
const FACTURA_FIELDS = `
  id numero pacienteId fecha subtotal descuento total metodoPago estado
  stripeSessionId pagadaEn
  detalles { id cantidad precioUnitario subtotal medicamento { nombre } }
`;

export const FACTURAS = gql`
  query Facturas { facturas { ${FACTURA_FIELDS} } }
`;

export const FACTURA = gql`
  query Factura($id: UUID!) { factura(id: $id) { ${FACTURA_FIELDS} } }
`;

export const CREAR_FACTURA = gql`
  mutation CrearFactura($input: FacturaInput!) {
    crearFactura(input: $input) { id numero total estado metodoPago }
  }
`;

export const ANULAR_FACTURA = gql`
  mutation AnularFactura($id: UUID!, $motivo: String) {
    anularFactura(id: $id, motivo: $motivo) { id estado }
  }
`;

// crearCheckoutFactura ya existe arriba (CREAR_CHECKOUT_FACTURA).

// ---- DASHBOARD BI (ADMIN) -------------------------------------------------
export const BI_VENTAS_DIARIAS = gql`
  query BiVentasDiarias($desde: Date, $hasta: Date) {
    biVentasDiarias(desde: $desde, hasta: $hasta) {
      dia numFacturas totalVendido ticketPromedio
    }
  }
`;

export const BI_TOP_MEDICAMENTOS = gql`
  query BiTopMedicamentos($limit: Int) {
    biTopMedicamentos(limit: $limit) {
      medicamentoId medicamento unidadesVendidas montoTotal numFacturas
    }
  }
`;

export const BI_INVENTARIO_CRITICO = gql`
  query BiInventarioCritico {
    biInventarioCritico {
      medicamentoId medicamento stockMinimo stockActual nivel
    }
  }
`;

export const BI_RECETAS_BLOCKCHAIN = gql`
  query BiRecetasBlockchain($desde: Date, $hasta: Date) {
    biRecetasBlockchain(desde: $desde, hasta: $hasta) {
      mes totalRecetas registradasEnBlockchain controladas dispensadas
    }
  }
`;

// ============================================================================
//  REPORTES (estaticos + dinamicos) — disponibles para los 4 roles.
//  Reutiliza las fuentes ya existentes; estas son consultas adicionales que
//  el modulo de reportes necesita y que no estaban declaradas arriba.
// ============================================================================

// Recetas de un paciente concreto (ADMIN / MEDICO / FARMACEUTICO) — fuente de
// reportes de recetas cuando se parte de la ficha de un paciente.
export const RECETAS_POR_PACIENTE = gql`
  query RecetasPorPaciente($pacienteId: UUID!) {
    recetasPorPaciente(pacienteId: $pacienteId) {
      id fechaEmision estado controlado medicoNombre diagnostico
      paciente { id nombre apellido }
      detalles { medicamento { nombre } cantidad posologia }
    }
  }
`;

// Push #3 — avisar al paciente que su resultado de IA ya esta disponible.
// La resuelve el gateway (rol MEDICO/ADMINISTRADOR): busca el expoPushToken
// del paciente y le envia la notificacion a SU telefono. Devuelve false si
// el paciente aun no tiene la app instalada (sin token registrado).
export const NOTIFICAR_RESULTADO = gql`
  mutation NotificarResultado($pacienteId: ID!, $tipoEstudio: String) {
    notificarResultado(pacienteId: $pacienteId, tipoEstudio: $tipoEstudio)
  }
`;
