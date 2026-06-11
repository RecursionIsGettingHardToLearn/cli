import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pacienteId, medicoUid, fechaHora, especialidad, motivo, urgencia } = body;

    if (!pacienteId || !medicoUid) {
      return NextResponse.json(
        { success: false, message: "Faltan datos obligatorios: pacienteId o medicoUid" },
        { status: 400 }
      );
    }

    // Validar si el paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { id: pacienteId }
    });

    if (!paciente) {
      return NextResponse.json(
        { success: false, message: "El paciente especificado no existe" },
        { status: 404 }
      );
    }

    let finalFechaHora: Date;

    if (fechaHora) {
      finalFechaHora = new Date(fechaHora);
    } else {
      // Algoritmo: Encontrar el próximo turno libre
      let dateCursor = new Date();
      // Empezar a buscar desde "mañana" a las 09:00 AM (La Paz UTC-4 = 13:00 UTC)
      dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
      dateCursor.setUTCHours(13, 0, 0, 0);

      // Traer todas las citas futuras del médico
      const citasFuturas = await prisma.cita.findMany({
        where: {
          medicoUid,
          fechaHora: { gte: dateCursor }
        },
        select: { fechaHora: true }
      });

      const tiemposOcupados = new Set(citasFuturas.map(c => c.fechaHora.getTime()));

      let encontrado = false;
      // Límite de seguridad para evitar bucle infinito (buscar máximo 30 días)
      let intentos = 0;

      while (!encontrado && intentos < 30 * 8) {
        intentos++;
        
        // Evitar fines de semana (0=Domingo, 6=Sábado)
        const diaSemana = dateCursor.getUTCDay();
        if (diaSemana === 0 || diaSemana === 6) {
          dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
          dateCursor.setUTCHours(13, 0, 0, 0);
          continue;
        }

        // Si este hueco no está en las citas ocupadas, lo elegimos
        if (!tiemposOcupados.has(dateCursor.getTime())) {
          encontrado = true;
          break;
        }

        // Si está ocupado, sumar 1 hora
        dateCursor.setUTCHours(dateCursor.getUTCHours() + 1);

        // Si ya son las 17:00 (21:00 UTC), saltar al día siguiente a las 09:00
        if (dateCursor.getUTCHours() >= 21) {
          dateCursor.setUTCDate(dateCursor.getUTCDate() + 1);
          dateCursor.setUTCHours(13, 0, 0, 0);
        }
      }

      finalFechaHora = dateCursor;
    }

    // Crear la cita
    const nuevaCita = await prisma.cita.create({
      data: {
        pacienteId,
        medicoUid,
        fechaHora: finalFechaHora,
        especialidad: especialidad || "General",
        motivo: motivo || "Consulta agendada por WhatsApp",
        urgencia: urgencia || "Baja",
        estado: "AGENDADA"
      }
    });

    return NextResponse.json({ success: true, data: nuevaCita }, { status: 201 });

  } catch (error: any) {
    console.error("Error al crear la cita:", error);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor", error: error.message },
      { status: 500 }
    );
  }
}
