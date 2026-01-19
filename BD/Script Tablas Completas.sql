
-- Script SQL generado automáticamente para el modelo de base de datos de empaques
-- Fecha: 2025-08-07 14:28:31

-- ===========================
-- TABLAS BASE
-- ===========================

CREATE TABLE roles_usuarios (
    id_rol_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    id_rol_usuario INT REFERENCES roles_usuarios(id_rol_usuario),
    nombre VARCHAR(100),
    primer_apellido VARCHAR(100),
    segundo_apellido VARCHAR(100),
    correo VARCHAR(100) UNIQUE,
    contrasena TEXT NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tipo_bolsa (
    id_tipo_bolsa SERIAL PRIMARY KEY,
    nombre_bolsa VARCHAR(100) NOT NULL
);

CREATE TABLE subtipos_bolsas (
    id_subtipo_bolsa SERIAL PRIMARY KEY,
    id_tipo_bolsa INT REFERENCES tipo_bolsa(id_tipo_bolsa),
    nombre_subtipo_bolsa VARCHAR(100),
    descripcion_subtipo VARCHAR(255)
);

CREATE TABLE bolsas (
    id_bolsa SERIAL PRIMARY KEY,
    id_tipo_bolsa INT REFERENCES tipo_bolsa(id_tipo_bolsa),
    id_subtipo_bolsa INT REFERENCES subtipos_bolsas(id_subtipo_bolsa),
    ancho FLOAT,
    alto FLOAT,
    precio NUMERIC(10,2),
    descripcion_bolsa TEXT
);

CREATE TABLE inventario (
    id_movimiento SERIAL PRIMARY KEY,
    id_bolsa INT REFERENCES bolsas(id_bolsa),
    cantidad FLOAT,
    tipo_movimiento VARCHAR(20), -- 'ENTRADA', 'SALIDA', 'AJUSTE'
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    encargado INT REFERENCES usuarios(id_usuario)
);

-- ===========================
-- CARRITO Y ORDENES
-- ===========================

CREATE TABLE carritos (
    id_carrito SERIAL PRIMARY KEY,
    id_usuario INT REFERENCES usuarios(id_usuario),
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE carrito_productos (
    id_carrito INT REFERENCES carritos(id_carrito),
    id_bolsa INT REFERENCES bolsas(id_bolsa),
    cantidad INT NOT NULL,
    PRIMARY KEY (id_carrito, id_bolsa)
);

CREATE TABLE tipos_entrega (
    id_tipo_entrega SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion TEXT
);

CREATE TABLE metodos_pago (
    id_metodo_pago SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion TEXT
);

CREATE TABLE direcciones_usuario (
    id_direccion SERIAL PRIMARY KEY,
    id_usuario INT REFERENCES usuarios(id_usuario),
    direccion_exacta TEXT,
    distrito VARCHAR(100),
    canton VARCHAR(100),
    provincia VARCHAR(100),
    codigo_postal INTEGER,
    activa BOOLEAN DEFAULT TRUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ordenes (
    id_orden SERIAL PRIMARY KEY,
    id_usuario INT REFERENCES usuarios(id_usuario),
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total FLOAT,
    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    tipo_entrega INT REFERENCES tipos_entrega(id_tipo_entrega),
    id_direccion INT REFERENCES direcciones_usuario(id_direccion),
    id_metodo_pago INT REFERENCES metodos_pago(id_metodo_pago)
);

CREATE TABLE orden_productos (
    id_orden INT REFERENCES ordenes(id_orden),
    id_bolsa INT REFERENCES bolsas(id_bolsa),
    cantidad INT,
    precio_unitario NUMERIC(10,2),
    PRIMARY KEY (id_orden, id_bolsa)
);

CREATE TABLE imagenes_subtipos (
  id_imagen SERIAL PRIMARY KEY,
  id_subtipo_bolsa INT NOT NULL REFERENCES subtipos_bolsas(id_subtipo_bolsa),
  url_imagen TEXT NOT NULL,
  descripcion TEXT,
  orden INT DEFAULT 1 -- opcional, para ordenar en el frontend
);
