# Guía de despliegue para Claude Code — AKS + Supabase + AWS DynamoDB/S3

> Documento de ejecución para **Claude Code**. Despliega los 4 microservicios del
> monorepo en **Azure Kubernetes Service (AKS)**, usando **Supabase** como Postgres +
> Auth y **AWS DynamoDB (+ S3)** como backend de almacenamiento de `ms-diagnostico-ia`.
> Sigue las fases en orden y marca cada checklist antes de avanzar.

---

## 0. Regla de autoría (OBLIGATORIA, no negociable)

Todos los commits llevan **un único autor**: `RecursionIsGettingHardToLearn`.
**Nunca** añadas `Co-Authored-By:` ni ninguna atribución a Claude en commits ni PRs.

En cada clon nuevo, antes de cualquier commit:

```bash
git config user.name  "RecursionIsGettingHardToLearn"
git config user.email "RecursionIsGettingHardToLearn@users.noreply.github.com"
```

La atribución automática ya está desactivada a nivel de proyecto en `.claude/settings.json`
(claves `attribution.commit` y `attribution.pr` vacías). **No la modifiques.**

Verificación tras cada commit (no debe imprimir ningún trailer de coautor):

```bash
git log --format='%an <%ae>%n%(trailers)' -1
```

---

## 1. Prerrequisitos

Herramientas (instalar/verificar): `az` (Azure CLI), `kubectl`, `docker`, `gh` (GitHub CLI),
`aws` (AWS CLI v2).

```bash
az version && kubectl version --client && docker --version && gh --version && aws --version
```

Cuentas necesarias: **Azure** (con suscripción activa), **Supabase** (proyecto), **AWS** (IAM).

Autenticación:

```bash
az login && az account show          # Azure
gh auth login                        # GitHub (elige HTTPS; NO pegues un PAT en texto plano en la shell)
aws configure                        # AWS (Access Key / Secret / región)
```

---

## 2. Supabase — Postgres + Auth (ya integrado en el código)

El código **ya** consume Supabase; solo hay que crear el proyecto y pasar los valores como secrets.

Quién usa qué:
- `ms-ms-pacientes-nextjs` (Next.js + Prisma): `DATABASE_URL` (pooled, puerto **6543**, `?pgbouncer=true`) y `DIRECT_URL` (directo, puerto **5432**) para migraciones.
- `ms-springboot-gestion` (Spring Boot): `DB_URL` en formato **JDBC**, más `DB_USER`/`DB_PASS`. Flyway corre las migraciones al arrancar; `ddl-auto: validate` hará fallar el pod si el esquema no coincide (eso es credenciales/URL mal puestas, no un bug).
- Los 4 validan el **JWT de Supabase** vía `SUPABASE_JWKS_URI` (JWKS), y algunos usan `SUPABASE_ISSUER` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

Pasos:
1. Crear el proyecto en https://supabase.com → anotar la contraseña de la base.
2. **Settings → Database → Connection string**: copiar la cadena *pooled* (6543) y la *direct* (5432).
3. **Settings → API**: copiar `Project URL`, y la `service_role` key (secreta).
4. `SUPABASE_ISSUER = https://<ref>.supabase.co/auth/v1` y
   `SUPABASE_JWKS_URI = https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`.
5. Migraciones:
   - MS1: en local con `DATABASE_URL`/`DIRECT_URL` apuntando a Supabase → `npx prisma migrate deploy`.
   - MS3: automático (Flyway) al arrancar el pod.

> ⚠️ **Datos semilla / cuentas demo.** Si vas a sembrar usuarios, hazlo con contraseñas
> únicas y fuertes. **No** cargues el archivo `usuarios_con_credenciales.txt` del repo tal cual:
> contiene 37 cuentas con la misma contraseña (`admin123`) y está versionado en un repo público
> (ver §10). Trátalas como comprometidas.

Checklist §2:
- [ ] Proyecto Supabase creado y contraseña guardada en un gestor de secretos.
- [ ] Cadenas pooled (6543) y direct (5432) obtenidas.
- [ ] `Project URL`, `service_role`, `ISSUER` y `JWKS_URI` anotados.
- [ ] Migraciones de MS1 aplicadas (`prisma migrate deploy`).

---

## 3. AWS DynamoDB + S3 para `ms-diagnostico-ia` (ya codificado)

El servicio de IA tiene un **backend de almacenamiento intercambiable** en
`microservicios/ms-diagnostico-ia/app/services/storage.py`. `boto3==1.35.90` ya está en
`requirements.txt`. Se activa por configuración: `STORAGE_BACKEND=dynamodb` (por defecto `sqlite`).
Esto es **necesario en AKS**: el pod es efímero, así que SQLite + uploads locales se pierden al
reiniciar. DynamoDB (metadatos) + S3 (archivos) da persistencia real.

Diseño de tabla (single-table) que espera el código:
- Clave de partición `pk` (String): valores `DOC#<id>` y `RES#<id>`.
- Clave de ordenación `sk` (String): valor `METADATA`.

### 3.1 Crear la tabla DynamoDB

```bash
AWS_REGION=sa-east-1                 # coincide con el default del código
DDB_TABLE=ms2_diagnostico_ia

aws dynamodb create-table \
  --table-name "$DDB_TABLE" \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION"

aws dynamodb wait table-exists --table-name "$DDB_TABLE" --region "$AWS_REGION"
```

### 3.2 (Opcional) Bucket S3 para archivos subidos

Solo si quieres guardar los archivos clínicos en S3 (recomendado en producción). Si dejas
`S3_BUCKET` vacío, el servicio guarda en disco del pod (efímero).

```bash
S3_BUCKET=clinica-ms2-uploads-<sufijo-unico>
aws s3api create-bucket --bucket "$S3_BUCKET" --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"
aws s3api put-public-access-block --bucket "$S3_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 3.3 Usuario IAM con permisos mínimos

Como el clúster es **AKS** (no EKS), lo más simple es un usuario IAM dedicado con clave estática,
que luego va en un Secret de Kubernetes. Política de mínimo privilegio:

```bash
cat > ms2-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Dynamo",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Query","dynamodb:Scan"],
      "Resource": "arn:aws:dynamodb:${AWS_REGION}:*:table/${DDB_TABLE}"
    },
    {
      "Sid": "S3",
      "Effect": "Allow",
      "Action": ["s3:PutObject","s3:GetObject"],
      "Resource": "arn:aws:s3:::${S3_BUCKET}/*"
    }
  ]
}
JSON

aws iam create-user --user-name ms2-diagnostico-ia
aws iam put-user-policy --user-name ms2-diagnostico-ia \
  --policy-name ms2-ddb-s3 --policy-document file://ms2-policy.json
aws iam create-access-key --user-name ms2-diagnostico-ia   # anota AccessKeyId y SecretAccessKey
```

> Si prefieres no usar claves estáticas, la alternativa es **AWS IAM Roles Anywhere** o federación
> OIDC entre Azure AD y AWS; es más seguro pero bastante más laborioso. Para empezar, la clave IAM
> dedicada y de mínimo privilegio es aceptable.

### 3.4 Cambios de configuración del servicio

En `microservicios/ms-diagnostico-ia/k8s/configmap.yaml`, añade/ajusta:

```yaml
  STORAGE_BACKEND: "dynamodb"
  AWS_REGION: "sa-east-1"
  DYNAMODB_TABLE: "ms2_diagnostico_ia"
  S3_BUCKET: "clinica-ms2-uploads-<sufijo-unico>"   # omitir si no usas S3
  S3_PREFIX: "uploads"
```

Las credenciales AWS van en el **Secret** (no en el ConfigMap): ver §5.

Checklist §3:
- [ ] Tabla `ms2_diagnostico_ia` creada (pk/sk, PAY_PER_REQUEST).
- [ ] (Opcional) Bucket S3 creado y bloqueado a acceso público.
- [ ] Usuario IAM `ms2-diagnostico-ia` con política de mínimo privilegio y claves generadas.
- [ ] ConfigMap de MS2 con `STORAGE_BACKEND=dynamodb` + región/tabla/bucket.

---

## 4. Infraestructura Azure (RG + ACR + AKS)

> El nombre del ACR debe ser único globalmente y sin guiones.

```bash
RG=rg-clinica
LOC=eastus
ACR=acrclinica$RANDOM          # ANOTAR el nombre final
AKS=aks-clinica

az group create --name $RG --location $LOC
az acr create --resource-group $RG --name $ACR --sku Basic

az aks create \
  --resource-group $RG --name $AKS \
  --node-count 1 --node-vm-size Standard_B2s \
  --generate-ssh-keys --attach-acr $ACR      # --attach-acr da pull sin imagePullSecrets

az aks get-credentials --resource-group $RG --name $AKS
kubectl get nodes                            # 1 nodo Ready
```

### 4.1 Service principal + secrets de GitHub (para el CI/CD)

```bash
SUB_ID=$(az account show --query id -o tsv)
az ad sp create-for-rbac --name sp-clinica-cicd --role Contributor \
  --scopes /subscriptions/$SUB_ID/resourceGroups/$RG --sdk-auth   # copiar el JSON COMPLETO

gh secret set AZURE_CREDENTIALS  --repo RecursionIsGettingHardToLearn/cli   # pegar el JSON
gh secret set ACR_NAME           --repo RecursionIsGettingHardToLearn/cli --body "$ACR"
gh secret set AKS_RESOURCE_GROUP --repo RecursionIsGettingHardToLearn/cli --body "$RG"
gh secret set AKS_CLUSTER_NAME   --repo RecursionIsGettingHardToLearn/cli --body "$AKS"
```

Checklist §4:
- [ ] RG, ACR y AKS creados; `kubectl get nodes` → Ready.
- [ ] Service principal creado y los 4 secrets cargados en el repo.

---

## 5. Secrets del clúster (una sola vez, nunca se commitean)

Plantillas en `microservicios/<ms>/k8s/secret.example.yaml`. Los ConfigMaps los aplica el pipeline;
los Secrets se crean a mano con valores reales.

```bash
kubectl create namespace clinica --dry-run=client -o yaml | kubectl apply -f -

# MS1 — ms-ms-pacientes-nextjs
kubectl create secret generic ms-ms-pacientes-nextjs-secret -n clinica \
  --from-literal=DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true" \
  --from-literal=DIRECT_URL="postgresql://...:5432/postgres" \
  --from-literal=SUPABASE_URL="https://<ref>.supabase.co" \
  --from-literal=SUPABASE_ISSUER="https://<ref>.supabase.co/auth/v1" \
  --from-literal=SUPABASE_JWKS_URI="https://<ref>.supabase.co/auth/v1/.well-known/jwks.json" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="<service_role>"

# MS3 — ms-springboot-gestion
kubectl create secret generic ms-springboot-gestion-secret -n clinica \
  --from-literal=DB_URL="jdbc:postgresql://<host>:5432/postgres" \
  --from-literal=DB_USER="<user>" \
  --from-literal=DB_PASS="<pass>" \
  --from-literal=SUPABASE_ISSUER="https://<ref>.supabase.co/auth/v1" \
  --from-literal=SUPABASE_JWKS_URI="https://<ref>.supabase.co/auth/v1/.well-known/jwks.json" \
  --from-literal=STRIPE_SECRET_KEY="sk_test_..." \
  --from-literal=STRIPE_WEBHOOK_SECRET="whsec_..."

# ms-blockchain (PRIVATE_KEY vacía = modo solo lectura)
kubectl create secret generic ms-blockchain-secret -n clinica \
  --from-literal=PRIVATE_KEY="" \
  --from-literal=CONTRACT_ADDRESS="" \
  --from-literal=SUPABASE_JWKS_URI="https://<ref>.supabase.co/auth/v1/.well-known/jwks.json"

# MS2 — ms-diagnostico-ia  (claves de IA + credenciales AWS para DynamoDB/S3)
kubectl create secret generic ms-diagnostico-ia-secret -n clinica \
  --from-literal=GEMINI_API_KEY="<clave>" \
  --from-literal=OPENAI_API_KEY="<clave>" \
  --from-literal=AWS_ACCESS_KEY_ID="<AccessKeyId de §3.3>" \
  --from-literal=AWS_SECRET_ACCESS_KEY="<SecretAccessKey de §3.3>"
```

> `boto3` toma `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` del entorno. `AWS_REGION`
> ya va en el ConfigMap (§3.4); las dos claves van aquí, en el Secret. Confirma en el Deployment de MS2
> que carga **ambos** (`envFrom: configMapRef` + `secretRef`); los 4 deployments ya usan ese patrón.

Checklist §5:
- [ ] Namespace `clinica` creado.
- [ ] Los 4 secrets creados con valores reales (MS2 incluye claves AWS).

---

## 6. Validar builds Docker en local (antes del primer push)

```bash
docker build -t test-ms1 microservicios/ms-ms-pacientes-nextjs
docker build -t test-ms2 microservicios/ms-diagnostico-ia
docker build -t test-ms3 microservicios/ms-springboot-gestion
docker build -t test-blk microservicios/ms-blockchain
```

Puntos de atención conocidos:
- **MS1**: `next build` puede pedir variables en build-time; si falla, pasa `--build-arg` o valores dummy. Verifica que Prisma incluya sus engines en la salida standalone (si en runtime falta el engine, copia `node_modules/.prisma` y `@prisma` a la imagen final).
- **MS3**: el jar es `ms-gestion-*.jar`; si cambia el `artifactId`, actualiza el Dockerfile.
- **MS2**: con `STORAGE_BACKEND=dynamodb`, el arranque **no** requiere AWS (boto3 conecta perezosamente en la primera operación), pero un `PutItem`/`GetItem` fallará si las claves o la tabla están mal → revisa logs al ejercitar `/api/...`.

---

## 7. Primer despliegue

```bash
# 1) Commit y push de ajustes (autoría única, §0).
# 2) Disparar cada workflow la primera vez: pestaña Actions → "CI/CD ms-..." → Run workflow
#    (los 4 tienen workflow_dispatch). O deja que el filtro de paths los dispare al hacer push.
# 3) Verificar:
kubectl get pods -n clinica            # 4 pods Running
kubectl get svc  -n clinica            # 4 services ClusterIP
kubectl logs -n clinica deploy/ms-ms-pacientes-nextjs --tail=50

# 4) Prueba de humo con port-forward:
kubectl port-forward -n clinica svc/ms-ms-pacientes-nextjs 3000:3000 &
curl http://localhost:3000/api/health
kubectl port-forward -n clinica svc/ms-springboot-gestion 8080:8080 &
curl http://localhost:8080/actuator/health
```

---

## 8. Exposición pública — Ingress (esto FALTA en el repo)

Los services son `ClusterIP`: hoy nada es accesible desde fuera del clúster. Para exponerlos:

### 8.1 Instalar ingress-nginx (o el add-on de AKS)

```bash
az aks approuting enable --resource-group $RG --name $AKS      # add-on gestionado de AKS
# alternativa: helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace
```

### 8.2 Crear `k8s-compartido/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: clinica-ingress
  namespace: clinica
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: webapprouting.kubernetes.azure.com   # o "nginx" si instalaste con Helm
  rules:
    - http:
        paths:
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
            backend: { service: { name: ms-ms-pacientes-nextjs, port: { number: 3000 } } }
          - path: /gestion(/|$)(.*)
            pathType: ImplementationSpecific
            backend: { service: { name: ms-springboot-gestion, port: { number: 8080 } } }
          - path: /ia(/|$)(.*)
            pathType: ImplementationSpecific
            backend: { service: { name: ms-diagnostico-ia, port: { number: 8000 } } }
          - path: /blockchain(/|$)(.*)
            pathType: ImplementationSpecific
            backend: { service: { name: ms-blockchain, port: { number: 3001 } } }
```

```bash
kubectl apply -f k8s-compartido/ingress.yaml
kubectl get ingress -n clinica       # anota la IP pública (ADDRESS)
```

### 8.3 TLS + dominio
- Añade `cert-manager` + Let's Encrypt (`ClusterIssuer`) y un host real en el Ingress.
- Actualiza `CORS_ORIGINS` en **cada** ConfigMap con el dominio final del frontend y vuelve a aplicar.

---

## 9. Frontend Angular

El repo ya trae `frontend/staticwebapp.config.json` → destino natural: **Azure Static Web Apps**
(más barato que meterlo en AKS).

```bash
# Con SWA CLI o gh: crear el recurso, conectar el repo y apuntar app_location=frontend, output=dist.
# Configura la URL base de la API del frontend hacia la IP/host del Ingress (§8) vía set-env.js / environment.
```

Alternativa: desplegarlo como 5.º servicio en AKS con nginx (usa `n8n/nginx-frontend.conf` como base).

---

## 10. Remediación de seguridad (hacer ANTES de dar por cerrado el despliegue)

1. **Rotar el PAT de GitHub** que se usó/compartió: revócalo en GitHub → *Settings → Developer settings
   → Personal access tokens*, genera uno nuevo y guárdalo **solo** en el credential manager local
   (o usa `gh auth login`). Nunca lo pegues en texto plano.
2. **`usuarios_con_credenciales.txt`**: quítalo del repo y añádelo al `.gitignore`.
   - Borrarlo en un commit **no** lo elimina del historial (repo público). Para purgarlo:
     `git filter-repo --path usuarios_con_credenciales.txt --invert-paths` (o BFG), luego
     `git push --force`. Trata todas esas cuentas como comprometidas y rota sus contraseñas si
     existen en el Supabase real.
3. Confirma que ningún Secret real quede en YAML versionado (solo `*.example.yaml`).

---

## Checklist de aceptación final

- [ ] `az acr repository list --name $ACR` muestra las 4 imágenes.
- [ ] Los 4 workflows en verde en Actions.
- [ ] `kubectl get pods -n clinica`: 4/4 Running con probes en Ready.
- [ ] Health checks 200 (§7).
- [ ] MS2 escribe/lee en DynamoDB (y S3 si aplica) sin errores en logs.
- [ ] Ingress con IP/host público y rutas OK (§8).
- [ ] Frontend accesible y llamando a la API por el Ingress.
- [ ] `git log --format='%an <%ae>%n%(trailers)' -5` sin coautores.
- [ ] PAT rotado y archivo de credenciales purgado del historial (§10).
