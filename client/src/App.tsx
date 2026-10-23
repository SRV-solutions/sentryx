import { lazy, Suspense, ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSchool } from './school/SchoolContext';
import { AppShell } from './app/AppShell';
import { Spinner } from './ui';
import type { PermissionPair } from './school/permissions';
import { Entity, Action } from './school/permissions';

// --- Escuela (chunks livianos, sin MUI) ---
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ForcePasswordChange = lazy(() => import('./pages/auth/ForcePasswordChange'));
const HomePage = lazy(() => import('./pages/school/HomePage'));
const AnnouncementsPage = lazy(() => import('./pages/school/AnnouncementsPage'));
const AnnouncementDetailPage = lazy(() => import('./pages/school/AnnouncementDetailPage'));
const AnnouncementComposePage = lazy(() => import('./pages/school/AnnouncementComposePage'));
const ThreadsPage = lazy(() => import('./pages/school/ThreadsPage'));
const ThreadPage = lazy(() => import('./pages/school/ThreadPage'));
const NewThreadPage = lazy(() => import('./pages/school/NewThreadPage'));
const FamilyPage = lazy(() => import('./pages/school/FamilyPage'));
const StudentPage = lazy(() => import('./pages/school/StudentPage'));
const StudentsPage = lazy(() => import('./pages/school/StudentsPage'));
const SubjectsPage = lazy(() => import('./pages/school/SubjectsPage'));
const GradeSheetPage = lazy(() => import('./pages/school/GradeSheetPage'));
const DivisionStatusPage = lazy(() => import('./pages/school/DivisionStatusPage'));
const AttendancePage = lazy(() => import('./pages/school/AttendancePage'));
const AlertsPage = lazy(() => import('./pages/school/AlertsPage'));
const StatsPage = lazy(() => import('./pages/school/StatsPage'));
const HelpPage = lazy(() => import('./pages/school/HelpPage'));
const AdminPage = lazy(() => import('./pages/school/AdminPage'));
const ReportCardPrintPage = lazy(() => import('./pages/school/ReportCardPrintPage'));
const ClassroomsPage = lazy(() => import('./pages/school/ClassroomsPage'));
const ClassroomPage = lazy(() => import('./pages/school/ClassroomPage'));
const FilesPage = lazy(() => import('./pages/school/FilesPage'));
const ProfilePage = lazy(() => import('./pages/school/ProfilePage'));
const PeoplePage = lazy(() => import('./pages/school/PeoplePage'));
const PersonPage = lazy(() => import('./pages/school/PersonPage'));
const ChannelsPage = lazy(() => import('./pages/school/ChannelsPage'));
const ChannelPage = lazy(() => import('./pages/school/ChannelPage'));
const BillingPage = lazy(() => import('./pages/school/BillingPage'));
// --- Planes y funciones por plan ---
const PlansPage = lazy(() => import('./pages/school/PlansPage'));
const MyRecordPage = lazy(() => import('./pages/school/MyRecordPage'));
const StaffAdminPage = lazy(() => import('./pages/school/StaffAdminPage'));
const CalendarPage = lazy(() => import('./pages/school/CalendarPage'));
const EventPage = lazy(() => import('./pages/school/EventPage'));
const ProgramsPage = lazy(() => import('./pages/school/ProgramsPage'));
const ProgramPage = lazy(() => import('./pages/school/ProgramPage'));
const QuizzesPage = lazy(() => import('./pages/school/QuizzesPage'));
const QuizEditorPage = lazy(() => import('./pages/school/QuizEditorPage'));
const LiveHostPage = lazy(() => import('./pages/school/LiveHostPage'));
const QuizHomeworkPage = lazy(() => import('./pages/school/QuizHomeworkPage'));
const QuizResultsPage = lazy(() => import('./pages/school/QuizResultsPage'));
const PlayPage = lazy(() => import('./pages/PlayPage'));

// --- Recupero de contraseña y plataforma ---
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const PlatformSchoolsPage = lazy(() => import('./pages/platform/PlatformSchoolsPage'));
const PlatformBillingPage = lazy(() => import('./pages/platform/PlatformBillingPage'));
const PlatformSupportPage = lazy(() => import('./pages/platform/PlatformSupportPage'));
const PlatformAuditPage = lazy(() => import('./pages/platform/PlatformAuditPage'));
const PlatformTeamPage = lazy(() => import('./pages/platform/PlatformTeamPage'));
const NoSchoolPage = lazy(() => import('./pages/auth/NoSchoolPage'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const RequireAuth = () => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.userData.mustChangePassword) return <Navigate to="/cambiar-clave" replace />;
  return <Outlet />;
};

const Shell = () => (
  <AppShell>
    <Suspense fallback={<Spinner center />}>
      <Outlet />
    </Suspense>
  </AppShell>
);

/** Protege por permiso escolar; si falta, vuelve al inicio (sin cerrar sesión). */
const Need = ({ perm, any, children }: { perm?: PermissionPair; any?: PermissionPair[]; children: ReactNode }) => {
  const { can, loading } = useSchool();
  if (loading) return <Spinner center />;
  const ok = perm ? can(...perm) : any ? any.some((pair) => can(...pair)) : true;
  return ok ? <>{children}</> : <Navigate to="/inicio" replace />;
};

const RequireSuperAdmin = ({ children }: { children: ReactNode }) => {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? <>{children}</> : <Navigate to="/" replace />;
};

/** Destino inicial según el tipo de usuario. */
const Landing = () => {
  const { session, loading, noSchool } = useSchool();
  const { isSuperAdmin } = useAuth();
  if (loading) return <Spinner center />;
  if (session) return <Navigate to="/inicio" replace />;
  if (noSchool) return <Navigate to={isSuperAdmin ? '/plataforma' : '/sin-colegio'} replace />;
  return <Spinner center />;
};

export default function App() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<Spinner center />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/c/:slug" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Juego en vivo: los alumnos entran con PIN, sin cuenta. */}
        <Route path="/jugar" element={<PlayPage />} />
        <Route path="/cambiar-clave" element={user ? <ForcePasswordChange /> : <Navigate to="/login" replace />} />

        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="/inicio" element={<HomePage />} />
            <Route path="/comunicados" element={<AnnouncementsPage />} />
            <Route path="/comunicados/nuevo" element={<Need perm={[Entity.ANNOUNCEMENTS, Action.CREATE]}><AnnouncementComposePage /></Need>} />
            <Route path="/comunicados/:id/editar" element={<Need perm={[Entity.ANNOUNCEMENTS, Action.CREATE]}><AnnouncementComposePage /></Need>} />
            <Route path="/comunicados/:id" element={<AnnouncementDetailPage />} />
            <Route path="/mensajes" element={<ThreadsPage />} />
            <Route path="/mensajes/nuevo" element={<NewThreadPage />} />
            <Route path="/mensajes/:id" element={<ThreadPage />} />
            <Route path="/aulas" element={<ClassroomsPage />} />
            <Route path="/aulas/:id" element={<ClassroomPage />} />
            <Route path="/archivos" element={<FilesPage />} />
            <Route path="/familia" element={<FamilyPage />} />
            <Route path="/familia/:id" element={<StudentPage />} />
            <Route path="/boletin/:id" element={<ReportCardPrintPage />} />
            <Route path="/alumnos" element={<Need perm={[Entity.USERS, Action.READ]}><StudentsPage /></Need>} />
            <Route path="/alumnos/:id" element={<Need perm={[Entity.USERS, Action.READ]}><StudentPage /></Need>} />
            <Route path="/division/:id" element={<Need perm={[Entity.GRADES, Action.READ]}><DivisionStatusPage /></Need>} />
            <Route path="/materias" element={<Need any={[[Entity.GRADES, Action.UPDATE], [Entity.GRADES, Action.READ]]}><SubjectsPage /></Need>} />
            <Route path="/materias/:divisionId/:subjectId" element={<Need any={[[Entity.GRADES, Action.UPDATE], [Entity.GRADES, Action.READ]]}><GradeSheetPage /></Need>} />
            <Route path="/asistencia" element={<Need perm={[Entity.ATTENDANCE, Action.UPDATE]}><AttendancePage /></Need>} />
            <Route path="/estadisticas" element={<Need any={[[Entity.ATTENDANCE, Action.READ], [Entity.GRADES, Action.READ]]}><StatsPage /></Need>} />
            <Route path="/ayuda" element={<HelpPage />} />
            <Route path="/alertas" element={<Need perm={[Entity.ALERTS, Action.READ]}><AlertsPage /></Need>} />
            <Route path="/admin" element={<Need any={[[Entity.SCHOOL, Action.UPDATE], [Entity.USERS, Action.UPDATE]]}><AdminPage /></Need>} />
            <Route path="/personas" element={<Need perm={[Entity.USERS, Action.READ]}><PeoplePage /></Need>} />
            <Route path="/personas/:id" element={<PersonPage />} />
            <Route path="/perfil/me" element={<ProfilePage />} />
            <Route path="/canales" element={<ChannelsPage />} />
            <Route path="/canales/:id" element={<ChannelPage />} />
            <Route path="/facturacion" element={<Need perm={[Entity.BILLING, Action.READ]}><BillingPage /></Need>} />
            <Route path="/planes" element={<Need perm={[Entity.PLANS, Action.READ]}><PlansPage /></Need>} />
            <Route path="/mi-legajo" element={<MyRecordPage />} />
            <Route path="/personal" element={<Need any={[[Entity.STAFF_RECORDS, Action.READ], [Entity.PAYROLL, Action.READ]]}><StaffAdminPage /></Need>} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/calendario/:id" element={<EventPage />} />
            <Route path="/programas" element={<ProgramsPage />} />
            <Route path="/programas/:id" element={<ProgramPage />} />
            <Route path="/juegos" element={<QuizzesPage />} />
            <Route path="/juegos/nuevo" element={<Need perm={[Entity.QUIZZES, Action.CREATE]}><QuizEditorPage /></Need>} />
            <Route path="/juegos/en-vivo/:id" element={<Need perm={[Entity.QUIZZES, Action.CREATE]}><LiveHostPage /></Need>} />
            <Route path="/juegos/tarea/:id" element={<QuizHomeworkPage />} />
            <Route path="/juegos/resultados/:id" element={<Need perm={[Entity.QUIZZES, Action.CREATE]}><QuizResultsPage /></Need>} />
            <Route path="/juegos/:id" element={<Need perm={[Entity.QUIZZES, Action.CREATE]}><QuizEditorPage /></Need>} />

            <Route path="/sin-colegio" element={<NoSchoolPage />} />
            <Route path="/plataforma" element={<RequireSuperAdmin><PlatformSchoolsPage /></RequireSuperAdmin>} />
            <Route path="/plataforma/facturacion" element={<RequireSuperAdmin><PlatformBillingPage /></RequireSuperAdmin>} />
            <Route path="/plataforma/reportes" element={<RequireSuperAdmin><PlatformSupportPage /></RequireSuperAdmin>} />
            <Route path="/plataforma/auditoria" element={<RequireSuperAdmin><PlatformAuditPage /></RequireSuperAdmin>} />
            <Route path="/plataforma/equipo" element={<RequireSuperAdmin><PlatformTeamPage /></RequireSuperAdmin>} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
