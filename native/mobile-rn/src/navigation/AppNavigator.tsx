import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
  DrawerItem,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MisRecetasScreen } from '../screens/MisRecetasScreen';
import { VerificadorRecetaScreen } from '../screens/VerificadorRecetaScreen';
import { RecursosNativosScreen } from '../screens/RecursosNativosScreen';
import { ChatTriajeScreen } from '../screens/ChatTriajeScreen';
import { CitasScreen } from '../screens/CitasScreen';
import { DiagnosticoIaScreen } from '../screens/DiagnosticoIaScreen';
import { ReportesScreen } from '../screens/ReportesScreen';
import type { RolUsuario } from '../config/supabase';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

interface MenuItem {
  name: string;
  label: string;
  component: React.ComponentType<any>;
  roles: RolUsuario[];
}

// Menu MOVIL enfocado: solo lo esencial de cada rol en el telefono, mas
// Reportes para TODOS los roles. La gestion administrativa completa
// (inventario, caja, recepcion, facturas, administracion, BI, historia,
// diagnostico) vive solo en la web — el movil NO es una copia.
const MENU: MenuItem[] = [
  { name: 'Home', label: 'Inicio', component: HomeScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] },
  { name: 'Citas', label: 'Citas', component: CitasScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'] },
  { name: 'MisRecetas', label: 'Mis recetas', component: MisRecetasScreen, roles: ['MEDICO', 'PACIENTE'] },
  { name: 'DiagnosticoIa', label: 'Diagnóstico IA', component: DiagnosticoIaScreen, roles: ['ADMINISTRADOR', 'MEDICO'] },
  { name: 'Reportes', label: 'Reportes', component: ReportesScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] },
  { name: 'Verificador', label: 'Verificar receta', component: VerificadorRecetaScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO'] },
  { name: 'ChatTriaje', label: 'Asistente IA', component: ChatTriajeScreen, roles: ['PACIENTE'] },
  { name: 'RecursosNativos', label: 'Recursos del telefono', component: RecursosNativosScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] },
];

// Contenido del drawer: las opciones del rol + "Cerrar sesion" siempre
// visible al final, desde cualquier pantalla.
function ContenidoDrawer(props: DrawerContentComponentProps) {
  const { signOut } = useAuth();
  return (
    <DrawerContentScrollView {...props}>
      <DrawerItemList {...props} />
      <DrawerItem
        label="Cerrar sesión"
        labelStyle={{ color: '#a32d2d', fontWeight: '600' }}
        onPress={signOut}
      />
    </DrawerContentScrollView>
  );
}

function MainDrawer() {
  const { user } = useAuth();
  const rol = user?.rol ?? 'PACIENTE';
  const items = MENU.filter(i => i.roles.includes(rol));

  return (
    <Drawer.Navigator
      initialRouteName="Home"
      drawerContent={(props) => <ContenidoDrawer {...props} />}
      screenOptions={{
        drawerActiveTintColor: '#0f6e56',
        drawerInactiveTintColor: '#374151',
        headerStyle: { backgroundColor: '#0f6e56' },
        headerTintColor: '#fff',
      }}
    >
      {items.map(i => (
        <Drawer.Screen
          key={i.name}
          name={i.name}
          component={i.component}
          options={{ title: i.label, drawerLabel: i.label }}
        />
      ))}
    </Drawer.Navigator>
  );
}

export function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0f6e56" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="App" component={MainDrawer} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
