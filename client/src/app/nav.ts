import {
  Home, Megaphone, MessageCircle, Users, ClipboardCheck, BookOpenCheck, BellRing, GraduationCap,
  Settings, BookOpen, Library, Bot, UserCog, LayoutGrid, Baby, School, FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SchoolSession, Permission } from '../school/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: 'announcements' | 'threads';
  section: 'school' | 'courses' | 'admin';
}

/** Navegación según roles/permisos. El orden define qué entra en la barra inferior del celular. */
export const buildNav = (opts: {
  session: SchoolSession | null;
  can: (p: Permission) => boolean;
  lms: boolean;
  isAdmin: boolean;
}): NavItem[] => {
  const { session, can, lms, isAdmin } = opts;
  const items: NavItem[] = [];
  if (session) {
    items.push({ to: '/inicio', label: 'Inicio', icon: Home, section: 'school' });
    if (can('attendance.write')) items.push({ to: '/asistencia', label: 'Asistencia', icon: ClipboardCheck, section: 'school' });
    if (session.isGuardian) items.push({ to: '/familia', label: session.childIds.length > 1 ? 'Mis hijos' : 'Mi hijo/a', icon: Baby, section: 'school' });
    items.push({ to: '/aulas', label: 'Aulas', icon: School, section: 'school' });
    if (session.teaching.length || can('grades.read')) items.push({ to: '/materias', label: 'Materias', icon: BookOpenCheck, section: 'school' });
    items.push({ to: '/comunicados', label: 'Comunicados', icon: Megaphone, badge: 'announcements', section: 'school' });
    items.push({ to: '/mensajes', label: 'Mensajes', icon: MessageCircle, badge: 'threads', section: 'school' });
    if (can('alerts.read')) items.push({ to: '/alertas', label: 'Alertas', icon: BellRing, section: 'school' });
    if (can('people.read')) items.push({ to: '/alumnos', label: 'Alumnos', icon: GraduationCap, section: 'school' });
    if (session.isStaff && (session.teaching.length || can('announcements.publish'))) items.push({ to: '/archivos', label: 'Archivos', icon: FolderOpen, section: 'school' });
    if (can('school.manage') || can('people.manage')) items.push({ to: '/admin', label: 'Administración', icon: Settings, section: 'school' });
  }
  if (lms) {
    items.push({ to: '/dashboard', label: 'Mis cursos', icon: BookOpen, section: 'courses' });
    items.push({ to: '/catalogue', label: 'Catálogo', icon: Library, section: 'courses' });
    items.push({ to: '/chat/ai', label: 'Solvix IA', icon: Bot, section: 'courses' });
    items.push({ to: '/my-friends', label: 'Comunidad', icon: Users, section: 'courses' });
  }
  if (isAdmin) {
    items.push({ to: '/admin/usuarios', label: 'Usuarios SRV', icon: UserCog, section: 'admin' });
    items.push({ to: '/admin/cursos', label: 'Cursos SRV', icon: LayoutGrid, section: 'admin' });
  }
  return items;
};
