import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Insertando Paciente de Prueba para WhatsApp ---');

  const telefono = '73970844';
  const email = 'paciente7@clinica.com';

  // Buscar si ya existe para no duplicar
  let paciente = await prisma.paciente.findFirst({ where: { email } });

  if (paciente) {
    console.log('El paciente ya existía. Actualizando su teléfono...');
    paciente = await prisma.paciente.update({
      where: { id: paciente.id },
      data: { telefono }
    });
  } else {
    console.log('Creando nuevo paciente...');
    paciente = await prisma.paciente.create({
      data: {
        ci: `CI-WP-${Math.floor(Math.random() * 10000)}`,
        nombre: 'Alberto',
        apellido: 'Martinez Garcia',
        email: email,
        telefono: telefono,
        fechaNacimiento: new Date('1990-01-01T00:00:00Z'),
      }
    });
  }

  console.log('¡Éxito! Datos del paciente en la base de datos:', paciente);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
