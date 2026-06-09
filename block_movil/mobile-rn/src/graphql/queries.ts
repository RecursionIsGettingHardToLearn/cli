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
