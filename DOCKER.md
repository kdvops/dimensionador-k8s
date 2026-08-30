# Ejecución con Docker

## Docker Compose

```bash
docker compose up -d --build
```

Abre `http://localhost:3000`.

Para detener el servicio:

```bash
docker compose down
```

## Docker sin Compose

```bash
docker build -t dimensionador-kubernetes-on-premise:1.0.0 .
docker run -d --name dimensionador-kubernetes -p 3000:3000 \
  dimensionador-kubernetes-on-premise:1.0.0
```

## Requisitos

- Docker Engine 24 o superior.
- Docker Compose v2.
- Puerto TCP 3000 disponible en el host.

El contenedor se ejecuta con el filesystem en modo de solo lectura, sin capacidades Linux adicionales y utiliza `/tmp` como almacenamiento temporal.
