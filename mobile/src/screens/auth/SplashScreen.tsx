import { View } from 'react-native';
import { Spinner, T } from '../../ui';
import { useTheme } from '../../theme';

export default function SplashScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <T kind="h1">Sentryx<T kind="h1" color={colors.accent}>.</T></T>
      <Spinner />
    </View>
  );
}
