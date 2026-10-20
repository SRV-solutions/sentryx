import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '../theme';
import { avatarUri } from '../lib/api';
import { initials } from '../lib/format';

/**
 * Piezas de interfaz mínimas y livianas (solo componentes nativos de React Native, sin librerías de UI).
 * Los tamaños táctiles son de 44 px o más: la app se usa con una mano, apurado, entre clases.
 */

type TextKind = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'xs';
const SIZES: Record<TextKind, TextStyle> = {
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, lineHeight: 30 },
  h2: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  h3: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  xs: { fontSize: 12, lineHeight: 16 },
};

export const T = ({ kind = 'body', muted, color, style, children, ...rest }: { kind?: TextKind; muted?: boolean; color?: string; style?: StyleProp<TextStyle>; children?: ReactNode } & React.ComponentProps<typeof Text>) => {
  const { colors } = useTheme();
  return (
    <Text style={[SIZES[kind], { color: color ?? (muted ? colors.text3 : colors.text) }, style]} {...rest}>
      {children}
    </Text>
  );
};

export const Card = ({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) => {
  const { colors } = useTheme();
  const base: ViewStyle = { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.lg };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]} android_ripple={{ color: colors.surface2 }}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
};

export const Button = ({ title, onPress, kind = 'primary', disabled, loading, icon, style, small }: {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'accent' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) => {
  const { colors } = useTheme();
  const bg = kind === 'primary' ? colors.primary : kind === 'accent' ? colors.accent : kind === 'danger' ? colors.danger : 'transparent';
  const fg = kind === 'accent' ? colors.onAccent : kind === 'ghost' ? colors.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      style={({ pressed }) => [
        { minHeight: small ? 38 : 48, paddingHorizontal: small ? 12 : 18, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
        kind === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
};

export const IconButton = ({ icon, onPress, label, color, size = 22 }: { icon: keyof typeof Feather.glyphMap; onPress?: () => void; label: string; color?: string; size?: number }) => {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, pressed && { backgroundColor: colors.surface2 }]}>
      <Feather name={icon} size={size} color={color ?? colors.text} />
    </Pressable>
  );
};

export const Badge = ({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent' }) => {
  const { colors } = useTheme();
  const map = {
    ok: [colors.okBg, colors.ok],
    warn: [colors.warnBg, colors.warn],
    danger: [colors.dangerBg, colors.danger],
    info: [colors.infoBg, colors.primary],
    accent: [colors.accent, colors.onAccent],
  } as const;
  const [bg, fg] = tone ? map[tone] : [colors.surface2, colors.text2];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  );
};

export const Avatar = ({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) => {
  const { colors } = useTheme();
  const src = avatarUri(uri);
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
};

export const Chip = ({ label, active, onPress, tone }: { label: string; active?: boolean; onPress?: () => void; tone?: 'ok' }) => {
  const { colors, dark } = useTheme();
  const activeBg = tone === 'ok' ? colors.ok : dark ? '#fff' : '#111';
  const activeFg = tone === 'ok' ? '#fff' : dark ? '#000' : '#fff';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: active ? activeBg : colors.border, backgroundColor: active ? activeBg : colors.surface, justifyContent: 'center' }, pressed && { opacity: 0.8 }]}>
      <Text style={{ color: active ? activeFg : colors.text2, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
};

export const Input = ({ style, ...props }: TextInputProps) => {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.text3}
      style={[{ minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 }, style]}
      {...props}
    />
  );
};

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <View style={{ gap: 6 }}>
    <T kind="small" style={{ fontWeight: '700' }}>{label}</T>
    {children}
    {hint && <T kind="xs" muted>{hint}</T>}
  </View>
);

export const Alert = ({ children, tone = 'info', icon }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' | 'ok'; icon?: keyof typeof Feather.glyphMap }) => {
  const { colors } = useTheme();
  const bg = { info: colors.infoBg, warn: colors.warnBg, danger: colors.dangerBg, ok: colors.okBg }[tone];
  const fg = { info: colors.primary, warn: colors.warn, danger: colors.danger, ok: colors.ok }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      {icon && <Feather name={icon} size={18} color={fg} style={{ marginTop: 1 }} />}
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <T kind="small">{children}</T> : children}</View>
    </View>
  );
};

export const Empty = ({ title, text, icon = 'inbox', action }: { title: string; text?: string; icon?: keyof typeof Feather.glyphMap; action?: ReactNode }) => {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Feather name={icon} size={36} color={colors.text3} />
      <T kind="h3" style={{ textAlign: 'center' }}>{title}</T>
      {text && <T kind="small" muted style={{ textAlign: 'center' }}>{text}</T>}
      {action}
    </View>
  );
};

export const Spinner = ({ center }: { center?: boolean }) => {
  const { colors } = useTheme();
  return <ActivityIndicator color={colors.primary} style={center ? { flex: 1, padding: 40 } : { padding: 12 }} />;
};

export const ErrorBox = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <Alert tone="danger" icon="alert-circle">
    <T kind="small">{error instanceof Error ? error.message : 'Ocurrió un error.'}</T>
    {retry && (
      <Pressable onPress={retry} style={{ marginTop: 6 }}>
        <T kind="small" style={{ fontWeight: '700' }}>Reintentar</T>
      </Pressable>
    )}
  </Alert>
);

/** Esqueleto de carga: rectángulos que "respiran" (sin librerías de animación). */
export const Skeleton = ({ count = 3, h = 64 }: { count?: number; h?: number }) => {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => <Animated.View key={i} style={{ height: h, borderRadius: radius.md, backgroundColor: colors.surface2, opacity }} />)}
    </View>
  );
};

export const Row = ({ children, style, between }: { children: ReactNode; style?: StyleProp<ViewStyle>; between?: boolean }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, between && { justifyContent: 'space-between' }, style]}>{children}</View>
);

export const Divider = () => {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
};

/** Hoja inferior (modal) para formularios cortos y opciones. */
export const Sheet = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: insets.bottom + 12 }}>
        <Row between style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
          <T kind="h2">{title}</T>
          <IconButton icon="x" label="Cerrar" onPress={onClose} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 4, gap: 12 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
};

/** Aviso breve al pie (reemplaza al "toast" de la web). */
let showToastImpl: ((msg: string, danger?: boolean) => void) | null = null;
export const toast = (msg: string, danger = false) => showToastImpl?.(msg, danger);

export const ToastHost = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ msg: string; danger: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    showToastImpl = (msg, danger = false) => {
      setState({ msg, danger });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState(null), 3500);
    };
    return () => {
      showToastImpl = null;
    };
  }, []);
  if (!state) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 72, alignItems: 'center' }}>
      <View style={{ backgroundColor: state.danger ? colors.danger : colors.text, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, maxWidth: '100%' }}>
        <Text style={{ color: state.danger ? '#fff' : colors.bg, fontWeight: '600', fontSize: 14 }}>{state.msg}</Text>
      </View>
    </View>
  );
};

/** Contenedor de pantalla con fondo del tema y márgenes seguros. */
export const Screen = ({ children, scroll = true, padded = true, refreshControl }: { children: ReactNode; scroll?: boolean; padded?: boolean; refreshControl?: React.ReactElement }) => {
  const { colors } = useTheme();
  const pad = padded ? { padding: spacing.lg, gap: spacing.md } : undefined;
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.bg }, pad]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[pad, { paddingBottom: 32 }]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
};

export const keyboardBehavior = Platform.OS === 'ios' ? ('padding' as const) : undefined;
