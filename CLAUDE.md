# Instrucciones del proyecto para Claude Code

## Autoria de commits (OBLIGATORIO)
- El UNICO autor de todos los commits es `RecursionIsGettingHardToLearn`.
- NUNCA agregues lineas `Co-Authored-By:` ni ninguna otra atribucion en commits o PRs.
- Antes de commitear, verifica la configuracion local:
  ```
  git config user.name  "RecursionIsGettingHardToLearn"
  git config user.email "RecursionIsGettingHardToLearn@users.noreply.github.com"
  ```
- La atribucion automatica ya esta desactivada en `.claude/settings.json` (clave `attribution`). No la modifiques.

## Arquitectura del repo
- 4 microservicios en `microservicios/`:
  - `ms-ms-pacientes-nextjs`   -> Next.js 15 + Prisma + GraphQL (puerto 3000), BFF/pacientes.
  - `ms-blockchain`-> Node/Express + ethers, Polygon Amoy (puerto 3001).
  - `ms-diagnostico-ia` -> Python/FastAPI (puerto 8000).
  - `ms-springboot-gestion`-> Java 17 Spring Boot / gestion (puerto 8080, health en /actuator/health).
- Cada microservicio tiene su `Dockerfile` y su carpeta `k8s/` (deployment, service, configmap, secret.example).
- CI/CD: `.github/workflows/` con un workflow reutilizable (`deploy-microservicio.yml`) y 4 workflows por servicio que construyen en ACR (`az acr build`) y despliegan en AKS (namespace `clinica`).
- El deployment usa el placeholder `__IMAGE__`, que el pipeline reemplaza por `<ACR>.azurecr.io/<servicio>:<sha>`.

## Plan de trabajo
- El plan detallado de lo que falta esta en `PLAN-CLAUDE-CODE.md`. Seguirlo fase por fase y marcar el checklist.
