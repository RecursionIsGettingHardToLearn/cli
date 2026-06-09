import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { env } from './env';
import { supabase } from './supabase';

const httpLink = new HttpLink({ uri: env.graphqlUrl });

const authLink = setContext(async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({
    typePolicies: {
      Medicamento: { keyFields: ['id'] },
      Paciente: { keyFields: ['id'] },
      Factura: { keyFields: ['id'] },
      Receta: { keyFields: ['id'] },
    },
  }),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network', errorPolicy: 'all' },
    query: { fetchPolicy: 'network-only', errorPolicy: 'all' },
    mutate: { errorPolicy: 'all' },
  },
});
