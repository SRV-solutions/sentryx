import {
  Home, Megaphone, MessageCircle, ClipboardCheck, BookOpenCheck, BellRing, GraduationCap,
  Settings, Baby, School, FolderOpen, Contact, Hash, Receipt, FileText, Building2, LifeBuoy, ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SchoolSession } from '../school/types';
import { Entity, Action } from '../school/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'announcements' | 'threads' | 'channels';
  section: 'school' | 'platform';
}

/** Navegación según roles/permisos. El orden define qué entra en la barra inferior del celular. */
export const buildNav = (opts: {
  session: SchoolSession | null;
  can: (entity: Entity, action: Action) => boolean;
  isSuperAdmin: boolean;
}): NavItem[] => {
  const { session, can, isSuperAdmin } = opts;
  const items: NavItem[] = [];
  if (session?.self && !session.isStaff) {
    // Estudiante (Secundario): su curso, sus canales, mensajes con docentes y su boletín.
    items.push({ to: '/inicio', label: 'Inicio', icon: Home, section: 'school' });
    items.push({ to: '/canales', label: 'Canales', icon: Hash, badge: 'channels', section: 'school' });
    items.push({ to: '/mensajes', label: 'Mensajes', icon: MessageCircle, badge: 'threads', section: 'school' });
    items.push({ to: '/aulas', label: 'Aulas', icon: School, section: 'school' });
    items.push({ to: `/familia/${session.self.studentId}`, label: 'Mi boletín', icon: FileText, section: 'school' });
    items.push({ to: '/comunicados', label: 'Comunicados', icon: Megaphone, badge: 'announcements', section: 'school' });
  } else if (session) {
    items.push({ to: '/inicio', label: 'Inicio', icon: Home, section: 'school' });
    if (can(Entity.ATTENDANCE, Action.UPDATE)) items.push({ to: '/asistencia', label: 'Asistencia', icon: ClipboardCheck, section: 'school' });
    if (session.isGuardian) items.push({ to: '/familia', label: session.childIds.length > 1 ? 'Mis hijos' : 'Mi hijo/a', icon: Baby, section: 'school' });
    items.push({ to: '/aulas', label: 'Aulas', icon: School, section: 'school' });
    if (session.teaching.length || can(Entity.GRADES, Action.READ)) items.push({ to: '/materias', label: 'Materias', icon: BookOpenCheck, section: 'school' });
    items.push({ to: '/comunicados', label: 'Comunicados', icon: Megaphone, badge: 'announcements', section: 'school' });
    items.push({ to: '/mensajes', label: 'Mensajes', icon: MessageCircle, badge: 'threads', section: 'school' });
    if (session.hasChannels) items.push({ to: '/canales', label: 'Canales', icon: Hash, badge: 'channels', section: 'school' });
    if (can(Entity.ALERTS, Action.READ)) items.push({ to: '/alertas', label: 'Alertas', icon: BellRing, section: 'school' });
    if (can(Entity.USERS, Action.READ)) items.push({ to: '/alumnos', label: 'Alumnos', icon: GraduationCap, section: 'school' });
    if (can(Entity.USERS, Action.READ)) items.push({ to: '/personas', label: 'Personas', icon: Contact, section: 'school' });
    if (session.isStaff && (session.teaching.length || can(Entity.ANNOUNCEMENTS, Action.CREATE))) items.push({ to: '/archivos', label: 'Archivos', icon: FolderOpen, section: 'school' });
    if (can(Entity.SCHOOL, Action.UPDATE) || can(Entity.USERS, Action.UPDATE)) items.push({ to: '/admin', label: 'Administración', icon: Settings, section: 'school' });
    if (can(Entity.BILLING, Action.READ)) items.push({ to: '/facturacion', label: 'Facturación', icon: Receipt, section: 'school' });
  }
  if (isSuperAdmin) {
    // Equipo de Sentryx: alta de colegios y facturación de todos.
    items.push({ to: '/plataforma', label: 'Colegios', icon: Building2, section: 'platform' });
    items.push({ to: '/plataforma/facturacion', label: 'Facturación global', icon: Receipt, section: 'platform' });
    items.push({ to: '/plataforma/reportes', label: 'Reportes de usuarios', icon: LifeBuoy, section: 'platform' });
    items.push({ to: '/plataforma/auditoria', label: 'Auditoría', icon: ShieldCheck, section: 'platform' });
  }
  return items;
};
