# Plan de implementacion: CI/CD con GitHub Actions + AKS (Azure)

Plan para que **Claude Code Desktop** termine la implementacion del despliegue de los 4 microservicios en Azure Kubernetes Service. Las fases 0 a la 2 son trabajo en la maquina local / portal de Azure; de la 3 en adelante es validacion y ajustes en el repo.

## Estado actual (lo que YA esta hecho en este repo)

| Pieza | Estado |
|---|---|
| Dockerfile `ms-backend` (Next.js standalone + Prisma) | Listo |
| Dockerfile `ms-blockchain` (Node 20, solo prod) | Listo |
| Dockerfile `ms-diagnostico-ia` (Python 3.11) | Ya existia |
| Dockerfile `ms-springboot` (Maven multi-stage, Java 17) | Ya existia |
| Manifiestos `k8s/` de los 4 microservicios | Listos (placeholder `__IMAGE__`) |
| Endpoint `/api/health` en ms-backend | Listo |
| `output: "standalone"` en `next.config.mjs` | Listo |
| Workflow reutilizable `.github/workflows/deploy-microservicio.yml` | Listo |
| 4 workflows por servicio con filtro de paths | Listos |
| `.claude/settings.json` sin atribucion + `CLAUDE.md` | Listos |

## Regla permanente de autoria

Todos los commits llevan como unico autor a `RecursionIsGettingHardToLearn`. En cada clon nuevo ejecutar:

```bash
git config user.name  "RecursionIsGettingHardToLearn"
git config user.email "RecursionIsGettingHardToLearn@users.noreply.github.com"
```

La atribucion automatica de Claude Code ya esta desactivada a nivel de proyecto en `.claude/settings.json`. Referencia oficial de settings: https://docs.claude.com/en/docs/claude-code/settings

---

## Fase 0 - Prerrequisitos locales

1. Instalar/verificar herramientas: `az` (Azure CLI), `kubectl`, `docker`, `gh` (GitHub CLI).
2. Autenticarse: `az login` y `gh auth login`.
3. Verificar la suscripcion activa: `az account show`.

## Fase 1 - Infraestructura en Azure

> Ajustar nombres/region si ya existen recursos. El nombre del ACR debe ser unico globalmente y sin guiones.

```bash
RG=rg-clinica
LOC=eastus
ACR=acrclinica$RANDOM          # anotar el nombre final
AKS=aks-clinica

az group create --name $RG --location $LOC

az acr create --resource-group $RG --name $ACR --sku Basic

# Cluster minimo economico para empezar (1 nodo B2s). Escalar despues si hace falta.
az aks create \
  --resource-group $RG \
  --name $AKS \
  --node-count 1 \
  --node-vm-size Standard_B2s \
  --generate-ssh-keys \
  --attach-acr $ACR

az aks get-credentials --resource-group $RG --name $AKS
kubectl get nodes   # debe mostrar 1 nodo Ready
```

`--attach-acr` es clave: le da al cluster permiso de pull sobre el registry sin imagePullSecrets.

## Fase 2 - Service principal y secrets de GitHub

```bash
SUB_ID=$(az account show --query id -o tsv)

az ad sp create-for-rbac \
  --name sp-clinica-cicd \
  --role Contributor \
  --scopes /subscriptions/$SUB_ID/resourceGroups/$RG \
  --sdk-auth
# Copiar el JSON COMPLETO que imprime
```

Registrar los 4 secrets en el repo (con gh CLI o en Settings > Secrets and variables > Actions):

```bash
gh secret set AZURE_CREDENTIALS   --repo RecursionIsGettingHardToLearn/cli  # pegar el JSON
gh secret set ACR_NAME            --repo RecursionIsGettingHardToLearn/cli --body "$ACR"
gh secret set AKS_RESOURCE_GROUP  --repo RecursionIsGettingHardToLearn/cli --body "$RG"
gh secret set AKS_CLUSTER_NAME    --repo RecursionIsGettingHardToLearn/cli --body "$AKS"
```

## Fase 3 - Secrets y ConfigMaps en el cluster

Los deployments referencian un ConfigMap y un Secret por servicio. Los ConfigMaps los aplica el pipeline; los Secrets se crean UNA vez a mano (nunca se commitean). Plantillas en `microservicios/<ms>/k8s/secret.example.yaml`.

```bash
kubectl create namespace clinica

# MS1 - ms-backend (usar los valores reales del .env)
kubectl create secret generic ms-backend-secret -n clinica \
  --from-literal=DATABASE_URL="..." \
  --from-literal=DIRECT_URL="..." \
  --from-literal=SUPABASE_URL="..." \
  --from-literal=SUPABASE_ISSUER="..." \
  --from-literal=SUPABASE_JWKS_URI="..." \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="..."

# ms-blockchain (PRIVATE_KEY vacia = modo solo lectura)
kubectl create secret generic ms-blockchain-secret -n clinica \
  --from-literal=PRIVATE_KEY="" \
  --from-literal=CONTRACT_ADDRESS="" \
  --from-literal=SUPABASE_JWKS_URI="..."

# MS3 - ms-springboot
kubectl create secret generic ms-springboot-secret -n clinica \
  --from-literal=DB_URL="jdbc:postgresql://..." \
  --from-literal=DB_USER="..." \
  --from-literal=DB_PASS="..." \
  --from-literal=SUPABASE_ISSUER="..." \
  --from-literal=SUPABASE_JWKS_URI="..."

# MS2 - ms-diagnostico-ia (segun su secret.example.yaml: API keys de Gemini/OpenAI, etc.)
kubectl create secret generic ms-diagnostico-ia-secret -n clinica \
  --from-literal=GEMINI_API_KEY="..." \
  --from-literal=OPENAI_API_KEY="..."
```

Revisar `microservicios/ms-diagnostico-ia/k8s/secret.example.yaml` por si su secret exige mas claves, y comparar cada ConfigMap con lo que el codigo realmente lee.

## Fase 4 - Validar los builds Docker localmente

Antes del primer push, construir cada imagen en local para cazar errores rapido:

```bash
docker build -t test-ms-backend        microservicios/ms-backend
docker build -t test-ms-blockchain     microservicios/ms-blockchain
docker build -t test-ms-diagnostico-ia microservicios/ms-diagnostico-ia
docker build -t test-ms-springboot     microservicios/ms-springboot
```

Puntos de atencion conocidos:
- **ms-backend**: `next build` puede requerir variables en build-time si alguna ruta las evalua al compilar. Si falla, pasar `--build-arg` o valores dummy con `ENV` en la etapa build. Verificar tambien que Prisma trace sus engines en la salida standalone (si en runtime falta el engine, copiar `node_modules/.prisma` y `node_modules/@prisma` a la imagen final).
- **ms-blockchain**: confirmar que `src/server.js` resuelve el ABI/address desde `artifacts/` y `deployments/` con rutas relativas al WORKDIR.
- **ms-springboot**: el jar se llama `ms-gestion-*.jar`; si el `artifactId` cambia, actualizar el Dockerfile. El Dockerfile actual NO copia `.mvn/` (usa la imagen maven), esta bien asi.

## Fase 5 - Primer despliegue

1. Commit y push de cualquier ajuste de la Fase 4 (autoria unica, ver regla arriba).
2. Disparar cada workflow manualmente la primera vez: pestaña **Actions** > elegir `CI/CD ms-...` > **Run workflow** (los 4 tienen `workflow_dispatch`).
3. Verificar:

```bash
kubectl get pods -n clinica            # 4 pods Running
kubectl get svc  -n clinica            # 4 services ClusterIP
kubectl logs -n clinica deploy/ms-backend --tail=50
```

4. Prueba de humo con port-forward:

```bash
kubectl port-forward -n clinica svc/ms-backend 3000:3000 &
curl http://localhost:3000/api/health
kubectl port-forward -n clinica svc/ms-springboot 8080:8080 &
curl http://localhost:8080/actuator/health
```

## Fase 6 - Exposicion publica (Ingress)

Los services son ClusterIP (solo red interna). Para exponer:

1. Instalar ingress-nginx (o usar Application Gateway / el add-on `--enable-app-routing` de AKS).
2. Crear `k8s/ingress.yaml` (nuevo archivo, por ejemplo en una carpeta `k8s-compartido/`) con rutas:
   - `/api/*` y `/api/graphql` -> `ms-backend:3000`
   - `/gestion/*` o `/graphql-java` -> `ms-springboot:8080`
   - `/ia/*` -> `ms-diagnostico-ia:8000`
   - `/blockchain/*` -> `ms-blockchain:3001`
3. Agregar el `kubectl apply` del ingress al workflow reutilizable (o un workflow aparte `infra.yml`).
4. Actualizar `CORS_ORIGINS` en los ConfigMaps con el dominio real y TLS con cert-manager + Let's Encrypt.

## Fase 7 - Pendientes / mejoras

- [ ] Etapa de **tests** previa al build en el workflow reutilizable (npm test / mvn test / pytest) que bloquee el deploy si falla.
- [ ] Desplegar el **frontend Angular** (carpeta `frontend/`): como 5to servicio en AKS con nginx, o en Azure Static Web Apps (mas barato).
- [ ] Decidir que hacer con `n8n` y Evolution API del docker-compose: ¿tambien van a AKS o quedan fuera del alcance?
- [ ] `HorizontalPodAutoscaler` para ms-backend y ms-springboot.
- [ ] Probar rollback: `kubectl rollout undo deployment/<ms> -n clinica`.
- [ ] Nota: el `docker-compose.yml` de la raiz referencia rutas viejas (`./backend`, `./springboot`, `./block_movil/...`); actualizarlo a `microservicios/...` para que el entorno local vuelva a funcionar.
- [ ] **Rotar el PAT de GitHub usado para el push inicial** (se compartio en un chat) y guardar el nuevo solo en el credential manager local.

## Checklist de aceptacion

- [ ] `az acr repository list --name $ACR` muestra las 4 imagenes.
- [ ] Los 4 workflows en verde en la pestaña Actions.
- [ ] `kubectl get pods -n clinica`: 4/4 Running y probes en Ready.
- [ ] Health checks responden 200 (Fase 5, paso 4).
- [ ] ms-backend alcanza a ms-springboot y ms-blockchain por DNS interno (revisar logs al ejercitar el GraphQL).
- [ ] Git log sin coautores: `git log --format='%an <%ae>%n%(trailers)' -5`.
