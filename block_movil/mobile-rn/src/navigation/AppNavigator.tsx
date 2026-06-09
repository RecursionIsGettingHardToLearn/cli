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
  { name: 'MisRecetas', label: 'Mis recetas', component: MisRecetasScreen, roles: ['MEDICO', 'PACIENTE'] },
  { name: 'MisFacturas', label: 'Mis facturas', component: MisFacturasScreen, roles: ['PACIENTE'] },
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
