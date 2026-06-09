import { createYoga } from 'graphql-yoga';
import { schema as localSchema } from '@/graphql/schema';
import { actorFromRequest } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stitchSchemas } from '@graphql-tools/stitch';
import { schemaFromExecutor } from '@graphql-tools/wrap';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { delegateToSchema } from '@graphql-tools/delegate';
import { OperationTypeNode, GraphQLSchema } from 'graphql';

export const dynamic = 'force-dynamic';

const MS3_URL = process.env.MS3_URL || 'http://localhost:8080/graphql';

const ms3Executor = buildHTTPExecutor({
  endpoint: MS3_URL,
  headers: (executorRequest: any) => {
    const auth = executorRequest?.context?.authorization;
    const h: Record<string, string> = {};
    if (auth) h['authorization'] = auth;
    return h;
  },
});

let stitchedSchemaPromise: Promise<GraphQLSchema> | null = null;

async function getStitchedSchema() {
  if (stitchedSchemaPromise) return stitchedSchemaPromise;
  
  stitchedSchemaPromise = (async () => {
    console.log(`[BFF] Introspeccionando MS3 en ${MS3_URL} ...`);
    let ms3Schema;
    let retries = 20; // Hasta 40 segundos de espera por Java
    while (retries > 0) {
      try {
        ms3Schema = await schemaFromExecutor(ms3Executor);
        break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        console.warn(`[BFF] Fallo introspeccion MS3, reintentando en 2s... (Quedan ${retries} intentos)`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const localSubschema = { schema: localSchema };
    const ms3Subschema = { schema: ms3Schema, executor: ms3Executor };

    const resolvePacienteDesdeMs1 = (parent: any, _args: any, context: any, info: any) => {
      if (!parent || !parent.pacienteId) return null;
      return delegateToSchema({
        schema: localSubschema,
        operation: OperationTypeNode.QUERY,
        fieldName: 'paciente',
        args: { id: parent.pacienteId },
        context,
        info,
      });
    };

    return stitchSchemas({
      subschemas: [localSubschema, ms3Subschema],
      typeDefs: `
        extend type Receta { paciente: Paciente }
        extend type Factura { paciente: Paciente }
      `,
      resolvers: {
        Receta: { paciente: { selectionSet: '{ pacienteId }', resolve: resolvePacienteDesdeMs1 } },
        Factura: { paciente: { selectionSet: '{ pacienteId }', resolve: resolvePacienteDesdeMs1 } },
      },
    });
  })().catch(e => {
    // Si definitivamente falla, limpiamos el caché para que el siguiente F5 lo vuelva a intentar
    stitchedSchemaPromise = null;
    throw e;
  });

  return stitchedSchemaPromise;
}

async function handle(request: Request) {
  const schema = await getStitchedSchema();
  const yoga = createYoga({
    schema,
    graphqlEndpoint: '/api/graphql',
    fetchAPI: { Response },
    cors: { origin: '*', methods: ['GET', 'POST', 'OPTIONS'] },
    maskedErrors: false,
    context: async ({ request }) => ({
      actor: await actorFromRequest(request),
      prisma,
      authorization: request.headers.get('authorization') || '',
    }),
  });
  return yoga.handleRequest(request, {});
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
export async function OPTIONS(request: Request) { return handle(request); }
