import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { telefono: string } }
) {
  try {
    const telefono = params.telefono;

    if (!telefono) {
      return NextResponse.json(
        { success: false, message: "El número de teléfono es requerido" },
        { status: 400 }
      );
    }

    // Asegurarse de que el número en la DB se pueda buscar incluso si Evolution manda el código de país.
    // Ej: Si Evolution manda 59179001752, y en la BD está como 79001752, es mejor buscar usando 'ends with'
    // O si en la BD está exactamente igual, hacemos búsqueda exacta.
    // Usaremos un contains o un equals dependiendo de la rigurosidad. Por seguridad, usaremos EndsWith.
    
    // Asumimos que los teléfonos pueden tener prefijos. Buscamos los últimos 8 digitos (típico en Bolivia) 
    // o el string exacto si es corto.
    const telefonoLimpio = telefono.length > 8 ? telefono.slice(-8) : telefono;

    const paciente = await prisma.paciente.findFirst({
      where: {
        telefono: {
          endsWith: telefonoLimpio,
        },
      },
      include: {
        historia: true,
      }
    });

    if (!paciente) {
      return NextResponse.json(
        { success: false, message: "Paciente no encontrado con ese número" },
        { status: 200 } // Changed to 200 to prevent n8n from crashing
      );
    }

    return NextResponse.json({ success: true, data: paciente }, { status: 200 });

  } catch (error: any) {
    console.error("Error al buscar paciente por teléfono:", error);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor", error: error.message },
      { status: 500 }
    );
  }
}
