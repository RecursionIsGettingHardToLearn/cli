import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInputProps,
  ViewStyle,
} from 'react-native';

/**
 * Kit de UI compartido para las pantallas de gestion del movil.
 * Centraliza el look & feel (tema verde #0f6e56, tarjetas blancas sobre
 * fondo #f6f8fa) para que todas las pantallas nuevas se vean nativas a la app
 * sin repetir StyleSheet en cada archivo.
 */

export const COLORS = {
  primary: '#0f6e56',
  primaryDark: '#0b5744',
  bg: '#f6f8fa',
  card: '#ffffff',
  text: '#1f2937',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  danger: '#991b1b',
  dangerBg: '#fee2e2',
  warn: '#92400e',
  warnBg: '#fef3c7',
  ok: '#065f46',
  okBg: '#d1fae5',
  info: '#3730a3',
  infoBg: '#e0e7ff',
};

/** Contenedor de pantalla con scroll y teclado tolerante. */
export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  if (!scroll) {
    return <View style={[k.screen, padded && { padding: 12 }]}>{children}</View>;
  }
  return (
    <KeyboardAvoidingView
      style={k.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={k.screen}
        contentContainerStyle={padded ? { padding: 12, paddingBottom: 40 } : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[k.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={k.sectionTitle}>{children}</Text>;
}

export function Field({
  label,
  ...props
}: { label?: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 10 }}>
      {label ? <Text style={k.label}>{label}</Text> : null}
      <TextInput
        style={k.input}
        placeholderTextColor="#9ca3af"
        {...props}
      />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      style={[k.btn, off && k.btnDisabled]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={k.btnText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function OutlineButton({
  title,
  onPress,
  disabled,
  color = COLORS.primary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[k.btnOutline, { borderColor: color }, disabled && k.btnDisabled]}
      activeOpacity={0.8}
    >
      <Text style={[k.btnOutlineText, { color }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Badge({
  text,
  bg = COLORS.infoBg,
  color = COLORS.info,
}: {
  text: string;
  bg?: string;
  color?: string;
}) {
  return (
    <View style={[k.badge, { backgroundColor: bg }]}>
      <Text style={[k.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

/** Selector horizontal de opciones (reemplaza a Picker, sin dependencias). */
export function ChipSelect<T extends string | number>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly T[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  labelOf?: (v: T) => string;
}) {
  return (
    <View style={k.chipRow}>
      {options.map(opt => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={String(opt)}
            onPress={() => onChange(opt)}
            style={[k.chip, active && k.chipActive]}
            activeOpacity={0.8}
          >
            <Text style={[k.chipText, active && k.chipTextActive]}>
              {labelOf ? labelOf(opt) : String(opt)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Loading() {
  return (
    <View style={k.center}>
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <View style={k.center}>
      <Text style={k.error}>{message}</Text>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={k.center}>
      <Text style={k.empty}>{message}</Text>
    </View>
  );
}

export function Banner({
  kind,
  message,
}: {
  kind: 'ok' | 'error' | 'warn';
  message: string;
}) {
  const map = {
    ok: { bg: COLORS.okBg, color: COLORS.ok },
    error: { bg: COLORS.dangerBg, color: COLORS.danger },
    warn: { bg: COLORS.warnBg, color: COLORS.warn },
  } as const;
  const s = map[kind];
  return (
    <View style={[k.banner, { backgroundColor: s.bg }]}>
      <Text style={[k.bannerText, { color: s.color }]}>{message}</Text>
    </View>
  );
}

/** Formatea un monto en Bs (Bolivianos). Acepta string o number. */
export function money(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  if (Number.isNaN(n as number)) return 'Bs 0.00';
  return `Bs ${(n as number).toFixed(2)}`;
}

/** Fecha + hora legible. */
export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

const k = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnOutline: {
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 4,
  },
  btnOutlineText: { fontWeight: '700', fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  empty: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },
  error: { color: COLORS.danger, fontSize: 14, textAlign: 'center' },
  banner: { borderRadius: 8, padding: 10, marginBottom: 10 },
  bannerText: { fontSize: 13, fontWeight: '600' },
});
