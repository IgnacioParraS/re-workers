# Contexto

El sistema de cálculo de rutas corre como una función Lambda invocada por el JobsMaster. El worker recibe una matriz de adyacencia, ciudad origen y criterio, corre Dijkstra, y retorna las rutas óptimas a todos los destinos.

```
JobsMaster (EC2) → InvokeCommand (AWS SDK) → Lambda re-workers-dev-calculate → { routes }
```

---

## Prerrequisitos

### 1. Node.js y pnpm

```bash
node -v   # v22 o superior recomendado
pnpm -v   # v11 o superior
```

### 2. Serverless Framework v4

```bash
npm install -g serverless
serverless -v  # debe mostrar Framework Core: 4.x.x
```

### 3. Perfil AWS CLI configurado

El deploy usa el perfil `re-workers` que apunta a la **Cuenta B** (116715028640, us-east-2). Si no lo tienes configurado:

```bash
aws configure --profile re-workers
#AWS_ACCESS_KEY_ID=<tu-access-key>
#AWS_SECRET_ACCESS_KEY=<tu-secret-key>
# Default region name: us-east-2
# Default output format: json
```

Verificar que el perfil funciona:

```bash
aws sts get-caller-identity --profile re-workers
# Debe retornar Account: "116715028640"
```

### 4. S3 Bucket para deployment

Serverless sube el código a un bucket S3 antes de crear la Lambda. El bucket debe existir previamente en la Cuenta B:

```bash
aws s3 mb s3://re-workers-serverless-deploy \
  --region us-east-2 \
  --profile re-workers
```


---

## Estructura del directorio `workers/`

```
workers/
├── handler.js      ← función Lambda exportada como exports.calculate
├── serverless.yml  ← configuración de Serverless Framework
└── package.json    ← sin dependencias externas (solo Node.js built-ins)
```

---

## Archivo `serverless.yml`

```yaml
service: re-workers
frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs22.x
  region: us-east-2
  profile: re-workers          # perfil AWS CLI de Cuenta B
  deploymentBucket:
    name: re-workers-serverless-deploy   # bucket S3 que debe existir previamente

functions:
  calculate:
    handler: handler.calculate  # archivo handler.js, función exportada calculate
    timeout: 30                 # segundos máximos de ejecución (Dijkstra sobre 17 nodos es rápido)
    memorySize: 256             # MB asignados a la función
```

---

## Pasos para hacer el deploy

### Paso 1 — Ir al directorio de workers

```bash
cd ~/uc/arquisoftware/re-workers/workers
```

### Paso 2 — Instalar dependencias (si las hubiera)

```bash
pnpm install
# En este caso no hay dependencias externas, pero es buena práctica correrlo
```

### Paso 3 — Hacer el deploy

```bash
serverless deploy
```

Serverless ejecuta internamente:

1. Empaqueta `handler.js` y `node_modules/` en un archivo `.zip`
2. Sube el `.zip` al bucket S3 `re-workers-serverless-deploy`
3. Crea o actualiza el stack de CloudFormation `re-workers-dev`
4. CloudFormation crea los recursos: IAM Role, Lambda Function, Log Group en CloudWatch

Output esperado al terminar:

```
✔ Service deployed to stack re-workers-dev

functions:
  calculate: re-workers-dev-calculate (X.X kB)
```

### Paso 4 — Verificar que la función existe

```bash
aws lambda get-function \
  --function-name re-workers-dev-calculate \
  --region us-east-2 \
  --profile re-workers
```

Debe retornar la configuración de la función con `"State": "Active"`.

### Paso 5 — Probar la función manualmente

```bash
aws lambda invoke \
  --function-name re-workers-dev-calculate \
  --region us-east-2 \
  --profile re-workers \
  --payload '{"matrix":{"A":{"B":{"distance":10,"transportCost":5,"enabled":true}}},"originCity":"A","criteria":"distance"}' \
  --cli-binary-format raw-in-base64-out \
  output.json

cat output.json
# {"routes":{"B":{"reachable":true,"routeMetricCost":10,"hops":1,"nextHop":"B","path":["A","B"]}}}
```

---

## Recursos creados en AWS (Cuenta B)

| Recurso | Nombre |
|---------|--------|
| Lambda Function | `re-workers-dev-calculate` |
| IAM Role | `re-workers` |
| CloudWatch Log Group | `/aws/lambda/re-workers-dev-calculate` |
| CloudFormation Stack | `re-workers-dev` |
| S3 Bucket (preexistente) | `re-workers-serverless-deploy` |

---

## Cómo actualizar el código

Si modificas `handler.js`, basta con volver a correr:

```bash
serverless deploy
```

Serverless detecta el cambio en el hash del código y sube una nueva versión.

Para actualizar **solo el código** de la función sin tocar infraestructura (más rápido):

```bash
serverless deploy function -f calculate
```

---

## Cómo eliminar el stack (cleanup)

```bash
serverless remove
```

Esto elimina la Lambda, el IAM Role y el Log Group. El bucket S3 **no** se elimina automáticamente.

---

## Cómo lo invoca el JobsMaster

El JobsMaster (`jobs-master/src/worker.js`) invoca la Lambda usando `@aws-sdk/client-lambda`:

```javascript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const client = new LambdaClient({ region: 'us-east-2' });

const command = new InvokeCommand({
  FunctionName: process.env.LAMBDA_FUNCTION_NAME, // "re-workers-dev-calculate"
  InvocationType: 'RequestResponse',              // espera la respuesta (síncrono)
  Payload: JSON.stringify({ matrix, originCity, criteria }),
});

const response = await client.send(command);
const result = JSON.parse(Buffer.from(response.Payload).toString());
// result.routes = { [destCode]: { reachable, routeMetricCost, hops, nextHop, path[] } }
```

Las credenciales AWS del JobsMaster deben tener permiso `lambda:InvokeFunction` sobre `re-workers-dev-calculate`. Esto se configura en las variables de entorno del container JobsMaster (.env) (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).
