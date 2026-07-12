-- CreateEnum
CREATE TYPE "RolNombre" AS ENUM ('ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('AGENDADA', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoHistoria" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateTable
CREATE TABLE "rol" (
    "id" SERIAL NOT NULL,
    "nombre" "RolNombre" NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "supabase_uid" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paciente" (
    "id" UUID NOT NULL,
    "supabase_uid" TEXT,
    "ci" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "fecha_nacimiento" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cita" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "medico_uid" TEXT NOT NULL,
    "especialidad" TEXT,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "urgencia" TEXT,
    "estado" "EstadoCita" NOT NULL DEFAULT 'AGENDADA',
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historia_clinica" (
    "id" UUID NOT NULL,
    "paciente_id" UUID NOT NULL,
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoHistoria" NOT NULL DEFAULT 'ABIERTA',

    CONSTRAINT "historia_clinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodio" (
    "id" UUID NOT NULL,
    "historia_id" UUID NOT NULL,
    "cita_id" UUID,
    "medico_uid" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo_consulta" TEXT,
    "evolucion" TEXT,
    "diagnostico_texto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episodio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rol_nombre_key" ON "rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_supabase_uid_key" ON "usuario"("supabase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_rol_id_idx" ON "usuario"("rol_id");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_supabase_uid_key" ON "paciente"("supabase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "paciente_ci_key" ON "paciente"("ci");

-- CreateIndex
CREATE INDEX "cita_paciente_id_idx" ON "cita"("paciente_id");

-- CreateIndex
CREATE INDEX "cita_medico_uid_idx" ON "cita"("medico_uid");

-- CreateIndex
CREATE UNIQUE INDEX "historia_clinica_paciente_id_key" ON "historia_clinica"("paciente_id");

-- CreateIndex
CREATE INDEX "episodio_historia_id_idx" ON "episodio"("historia_id");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita" ADD CONSTRAINT "cita_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historia_clinica" ADD CONSTRAINT "historia_clinica_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodio" ADD CONSTRAINT "episodio_historia_id_fkey" FOREIGN KEY ("historia_id") REFERENCES "historia_clinica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodio" ADD CONSTRAINT "episodio_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "cita"("id") ON DELETE SET NULL ON UPDATE CASCADE;
