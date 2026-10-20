import { createNavigationContainerRef, LinkingOptions, NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import { useTheme } from '../theme';
import { Perm } from '../types';
import { WEB_URL } from '../config';
import LoginScreen from '../screens/auth/LoginScreen';
import ForcePasswordScreen from '../screens/auth/ForcePasswordScreen';
import NoSchoolScreen from '../screens/auth/NoSchoolScreen';
import SplashScreen from '../screens/auth/SplashScreen';
import HomeScreen from '../screens/HomeScreen';
import AttendanceScreen from '../screens/attendance/AttendanceScreen';
import AnnouncementsScreen from '../screens/announcements/AnnouncementsScreen';
import AnnouncementScreen from '../screens/announcements/AnnouncementScreen';
import ThreadsScreen from '../screens/threads/ThreadsScreen';
import ThreadScreen from '../screens/threads/ThreadScreen';
import NewThreadScreen from '../screens/threads/NewThreadScreen';
import FamilyScreen from '../screens/family/FamilyScreen';
import StudentScreen from '../screens/family/StudentScreen';
import MoreScreen from '../screens/MoreScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  ForcePassword: undefined;
  NoSchool: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  AnnouncementDetail: { id: number };
  Thread: { id: number };
  NewThread: { studentId?: number } | undefined;
  Student: { id: number; name?: string };
  Notifications: undefined;
  Profile: undefined;
};
export type TabParamList = {
  Inicio: undefined;
  Asistencia: undefined;
  Familia: undefined;
  Comunicados: undefined;
  Mensajes: undefined;
  Mas: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Deep links: los mismos caminos que la web (los avisos push traen el link de la web). */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['sentryx://', WEB_URL],
  config: {
    screens: {
      Main: { screens: { Inicio: 'inicio', Asistencia: 'asistencia', Familia: 'familia', Comunicados: 'comunicados', Mensajes: 'mensajes', Mas: 'mas' } },
      AnnouncementDetail: 'comunicados/:id',
      NewThread: 'mensajes/nuevo',
      Thread: 'mensajes/:id',
      Student: 'familia/:id',
      Notifications: 'notificaciones',
      Profile: 'perfil/me',
    },
  },
};

/** Abre un camino de la web (/comunicados/12, /alumnos/5…) en la pantalla que corresponde. */
export const openPath = (path: string | null | undefined) => {
  if (!path || !navigationRef.isReady()) return;
  const clean = path.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const m = (re: RegExp) => clean.match(re);
  let r: RegExpMatchArray | null;
  if ((r = m(/^\/comunicados\/(\d+)/))) return navigationRef.navigate('AnnouncementDetail', { id: Number(r[1]) });
  if ((r = m(/^\/mensajes\/(\d+)/))) return navigationRef.navigate('Thread', { id: Number(r[1]) });
  if ((r = m(/^\/(familia|alumnos)\/(\d+)/))) return navigationRef.navigate('Student', { id: Number(r[2]) });
  if (m(/^\/mensajes/)) return navigationRef.navigate('Main', { screen: 'Mensajes' });
  if (m(/^\/comunicados/)) return navigationRef.navigate('Main', { screen: 'Comunicados' });
  if (m(/^\/asistencia/)) return navigationRef.navigate('Main', { screen: 'Asistencia' });
  if (m(/^\/familia/)) return navigationRef.navigate('Main', { screen: 'Familia' });
  if (m(/^\/perfil/)) return navigationRef.navigate('Profile');
  return navigationRef.navigate('Main', { screen: 'Inicio' });
};

const MainTabs = () => {
  const { colors } = useTheme();
  const { session, can } = useSchool();
  const icons: Record<keyof TabParamList, keyof typeof Feather.glyphMap> = { Inicio: 'home', Asistencia: 'check-square', Familia: 'smile', Comunicados: 'bell', Mensajes: 'message-circle', Mas: 'more-horizontal' };
  const showAttendance = !!session?.isStaff && can(Perm.ATTENDANCE_UPDATE);
  const showFamily = !!session && !session.isStaff && (session.isGuardian || !!session.self);
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => <Feather name={icons[route.name]} size={size} color={color} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: Platform.OS === 'ios' ? 84 : 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        lazy: true,
      })}
    >
      <Tabs.Screen name="Inicio" component={HomeScreen} />
      {showAttendance && <Tabs.Screen name="Asistencia" component={AttendanceScreen} />}
      {showFamily && <Tabs.Screen name="Familia" component={FamilyScreen} options={{ title: session?.self ? 'Mi boletín' : session!.childIds.length > 1 ? 'Mis hijos' : 'Mi hijo/a' }} />}
      <Tabs.Screen name="Comunicados" component={AnnouncementsScreen} />
      <Tabs.Screen name="Mensajes" component={ThreadsScreen} />
      <Tabs.Screen name="Mas" component={MoreScreen} options={{ title: 'Más' }} />
    </Tabs.Navigator>
  );
};

export const RootNavigator = () => {
  const { colors } = useTheme();
  const { user, restoring } = useAuth();
  const { loading, noSchool, session } = useSchool();
  const screenOptions = { headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '800' as const }, headerShadowVisible: false, contentStyle: { backgroundColor: colors.bg }, headerBackTitle: 'Atrás' };

  if (restoring) return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Splash" component={SplashScreen} /></Stack.Navigator>;
  if (!user) return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Login" component={LoginScreen} /></Stack.Navigator>;
  if (user.userData.mustChangePassword) return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="ForcePassword" component={ForcePasswordScreen} /></Stack.Navigator>;
  if (loading && !session) return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Splash" component={SplashScreen} /></Stack.Navigator>;
  if (noSchool || !session) return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="NoSchool" component={NoSchoolScreen} /></Stack.Navigator>;

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="AnnouncementDetail" component={AnnouncementScreen} options={{ title: 'Comunicado' }} />
      <Stack.Screen name="Thread" component={ThreadScreen} options={{ title: 'Conversación' }} />
      <Stack.Screen name="NewThread" component={NewThreadScreen} options={{ title: 'Nuevo mensaje' }} />
      <Stack.Screen name="Student" component={StudentScreen} options={({ route }) => ({ title: route.params.name ?? 'Alumno' })} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notificaciones' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Mi perfil' }} />
    </Stack.Navigator>
  );
};
