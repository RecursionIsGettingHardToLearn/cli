-- =====================================================
--  Esquema: ms-gestion (farmacia + facturacion + recetas)
--  Adaptado para Arquitectura de Microservicios Pura (DDD)
--  Se eliminaron las tablas 'usuario', 'paciente' y 'rol'.
--  Se utilizan UUIDs simples para referenciarlos.
-- =====================================================

-- -----------------------------------------------------
-- 1) Tipos enumerados
-- -----------------------------------------------------
CREATE TYPE metodo_pago_enum     AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'QR');
CREATE TYPE estado_factura_enum  AS ENUM ('PAGADA', 'ANULADA');
CREATE TYPE estado_receta_enum   AS ENUM ('EMITIDA', 'DISPENSADA', 'ANULADA');
CREATE TYPE tipo_movimiento_enum AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- -----------------------------------------------------
-- 2) Catalogos / maestros
-- -----------------------------------------------------
CREATE TABLE categoria (
    id          SERIAL       PRIMARY KEY,
    nombre      VARCHAR(80)  NOT NULL UNIQUE,
    descripcion VARCHAR(200)
);

CREATE TABLE proveedor (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre     VARCHAR(150) NOT NULL,
    nit        VARCHAR(30)  UNIQUE,
    telefono   VARCHAR(30),
    email      VARCHAR(150),
    direccion  VARCHAR(250),
    activo     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------
-- 3) Productos / inventario
-- -----------------------------------------------------
CREATE TABLE medicamento (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          VARCHAR(150) NOT NULL,
    descripcion     TEXT,
    categoria_id    INTEGER      REFERENCES categoria(id),
    precio_venta    NUMERIC(12,2) NOT NULL CHECK (precio_venta >= 0),
    requiere_receta BOOLEAN      NOT NULL DEFAULT FALSE,
    controlado      BOOLEAN      NOT NULL DEFAULT FALSE,
    stock_minimo    INTEGER      NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_medicamento_categoria ON medicamento(categoria_id);

CREATE TABLE lote (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    medicamento_id    UUID         NOT NULL REFERENCES medicamento(id),
    proveedor_id      UUID         REFERENCES proveedor(id),
    codigo_lote       VARCHAR(80)  NOT NULL,
    fecha_vencimiento DATE         NOT NULL,
    cantidad_inicial  INTEGER      NOT NULL CHECK (cantidad_inicial >= 0),
    cantidad_actual   INTEGER      NOT NULL CHECK (cantidad_actual >= 0),
    precio_compra     NUMERIC(12,2) NOT NULL CHECK (precio_compra >= 0),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (medicamento_id, codigo_lote),
    CHECK (cantidad_actual <= cantidad_inicial)
);
CREATE INDEX idx_lote_medicamento ON lote(medicamento_id);

CREATE TABLE movimiento_inventario (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id     UUID         NOT NULL REFERENCES lote(id),
    tipo        tipo_movimiento_enum NOT NULL,
    cantidad    INTEGER      NOT NULL,
    motivo      VARCHAR(250),
    usuario_id  UUID         NOT NULL, -- Referencia externa al backend de Node.js
    fecha       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_movimiento_lote ON movimiento_inventario(lote_id);

-- -----------------------------------------------------
-- 4) Recetas (con anclaje a blockchain)
-- -----------------------------------------------------
CREATE TABLE receta (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id     UUID         NOT NULL, -- Referencia externa al backend de Node.js
    medico_nombre   VARCHAR(150) NOT NULL,
    medico_uid      VARCHAR(100) NOT NULL, -- Referencia a Supabase / Node.js
    diagnostico     TEXT,
    fecha_emision   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    controlado      BOOLEAN      NOT NULL DEFAULT FALSE,
    hash_documento  VARCHAR(80),
    blockchain_tx   VARCHAR(100),
    blockchain_id   BIGINT,
    estado          estado_receta_enum NOT NULL DEFAULT 'EMITIDA',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_receta_paciente ON receta(paciente_id);

CREATE TABLE detalle_receta (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    receta_id      UUID         NOT NULL REFERENCES receta(id) ON DELETE CASCADE,
    medicamento_id UUID         NOT NULL REFERENCES medicamento(id),
    cantidad       INTEGER      NOT NULL CHECK (cantidad > 0),
    posologia      VARCHAR(250),
    UNIQUE (receta_id, medicamento_id)
);
CREATE INDEX idx_detalle_receta_receta ON detalle_receta(receta_id);

-- -----------------------------------------------------
-- 5) Facturacion / venta
-- -----------------------------------------------------
CREATE TABLE factura (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    numero      VARCHAR(30)  NOT NULL UNIQUE,
    paciente_id UUID,        -- Referencia externa al backend de Node.js
    usuario_id  UUID         NOT NULL, -- Referencia externa al backend de Node.js
    fecha       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    subtotal    NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    descuento   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
    total       NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    metodo_pago metodo_pago_enum NOT NULL,
    estado      estado_factura_enum NOT NULL DEFAULT 'PAGADA',
    stripe_session_id VARCHAR(255),
    pagada_en   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_factura_paciente ON factura(paciente_id);
CREATE INDEX idx_factura_usuario  ON factura(usuario_id);

CREATE TABLE detalle_factura (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    factura_id      UUID         NOT NULL REFERENCES factura(id) ON DELETE CASCADE,
    medicamento_id  UUID         NOT NULL REFERENCES medicamento(id),
    lote_id         UUID         NOT NULL REFERENCES lote(id),
    receta_id       UUID         REFERENCES receta(id),
    cantidad        INTEGER      NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX idx_detalle_factura_factura     ON detalle_factura(factura_id);
CREATE INDEX idx_detalle_factura_medicamento ON detalle_factura(medicamento_id);
