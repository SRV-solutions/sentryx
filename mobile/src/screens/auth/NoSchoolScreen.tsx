import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../context/AuthContext';
import { Button, Empty, Screen } from '../../ui';
import { WEB_URL } from '../../config';

export default function NoSchoolScreen() {
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <Empty
        icon="home"
        title={user?.userData.isSuperAdmin ? 'La consola de Sentryx es web' : 'Tu cuenta no está vinculada a ningún colegio'}
        text={user?.userData.isSuperAdmin ? 'Para administrar colegios, entrá desde la computadora.' : 'Pedile a la secretaría de tu colegio que te agregue. Si ya lo hicieron, cerrá sesión y volvé a entrar.'}
      />
      {user?.userData.isSuperAdmin && <Button title="Abrir la consola web" icon="external-link" onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/plataforma`)} />}
      <Button title="Cerrar sesión" kind="ghost" onPress={logout} style={{ marginBottom: insets.bottom }} />
    </Screen>
  );
}
