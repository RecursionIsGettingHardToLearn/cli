import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MisRecetasScreen } from '../screens/MisRecetasScreen';
import { MisFacturasScreen } from '../screens/MisFacturasScreen';
import { VerificadorRecetaScreen } from '../screens/VerificadorRecetaScreen';
import { RecursosNativosScreen } from '../screens/RecursosNativosScreen';
import { ChatTriajeScreen } from '../screens/ChatTriajeScreen';
import { CitasScreen } from '../screens/CitasScreen';
import { HistoriaScreen } from '../screens/HistoriaScreen';
import { DiagnosticoScreen } from '../screens/DiagnosticoScreen';
import { RecepcionScreen } from '../screens/RecepcionScreen';
import { CajaScreen } from '../screens/CajaScreen';
import { FacturasScreen } from '../screens/FacturasScreen';
import { InventarioScreen } from '../screens/InventarioScreen';
import { AdministracionScreen } from '../screens/AdministracionScreen';
import { DashboardBiScreen } from '../screens/DashboardBiScreen';
import type { RolUsuario } from '../config/supabase';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

interface MenuItem {
  name: string;
  label: string;
  component: React.ComponentType<any>;
  roles: RolUsuario[];
}

const MENU: MenuItem[] = [
  { name: 'Home', label: 'Inicio', component: HomeScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] },
  { name: 'Citas', label: 'Citas', component: CitasScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'PACIENTE'] },
  { name: 'MisRecetas', label: 'Mis recetas', component: MisRecetasScreen, roles: ['MEDICO', 'PACIENTE'] },
  { name: 'MisFacturas', label: 'Mis facturas', component: MisFacturasScreen, roles: ['PACIENTE'] },
  { name: 'Historia', label: 'Historia clinica', component: HistoriaScreen, roles: ['ADMINISTRADOR', 'MEDICO'] },
  { name: 'Diagnostico', label: 'Diagnostico', component: DiagnosticoScreen, roles: ['ADMINISTRADOR', 'MEDICO'] },
  { name: 'Recepcion', label: 'Recepcion', component: RecepcionScreen, roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
  { name: 'Caja', label: 'Caja', component: CajaScreen, roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
  { name: 'Facturas', label: 'Facturas', component: FacturasScreen, roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
  { name: 'Inventario', label: 'Inventario', component: InventarioScreen, roles: ['ADMINISTRADOR', 'FARMACEUTICO'] },
  { name: 'Administracion', label: 'Administracion', component: AdministracionScreen, roles: ['ADMINISTRADOR'] },
  { name: 'DashboardBi', label: 'Dashboard BI', component: DashboardBiScreen, roles: ['ADMINISTRADOR'] },
  { name: 'ChatTriaje', label: 'Asistente IA', component: ChatTriajeScreen, roles: ['PACIENTE', 'ADMINISTRADOR', 'MEDICO'] },
  { name: 'Verificador', label: 'Verificar receta', component: VerificadorRecetaScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO'] },
  { name: 'RecursosNativos', label: 'Recursos del telefono', component: RecursosNativosScreen, roles: ['ADMINISTRADOR', 'MEDICO', 'FARMACEUTICO', 'PACIENTE'] },
];

function MainDrawer() {
  const { user } = useAuth();
  const rol = user?.rol ?? 'PACIENTE';
  const items = MENU.filter(i => i.roles.includes(rol));

  return (
    <Drawer.Navigator
      initialRouteName="Home"
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
