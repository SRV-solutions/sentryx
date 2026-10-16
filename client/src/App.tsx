import { lazy, Suspense, ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSchool } from './school/SchoolContext';
import { AppShell } from './app/AppShell';
import { Spinner } from './ui';
import type { Permission } from './school/types';

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
const AdminPage = lazy(() => import('./pages/school/AdminPage'));
const ReportCardPrintPage = lazy(() => import('./pages/school/ReportCardPrintPage'));
const ClassroomsPage = lazy(() => import('./pages/school/ClassroomsPage'));
const ClassroomPage = lazy(() => import('./pages/school/ClassroomPage'));
const FilesPage = lazy(() => import('./pages/school/FilesPage'));

// --- Pantallas existentes (cursos SRV, comunidad, Solvix, admin) ---
const LegacyFrame = lazy(() => import('./app/LegacyFrame.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Catalogue = lazy(() => import('./pages/Catalogue.jsx'));
const CourseCatalogueDetail = lazy(() => import('./pages/CourseCatalogueDetail.jsx'));
const MyCourseDetail = lazy(() => import('./pages/MyCourseDetail.jsx'));
const CourseDetail = lazy(() => import('./pages/CourseDetail.jsx'));
const ClassDetail = lazy(() => import('./pages/ClassDetail.jsx'));
const ChatSolvix = lazy(() => import('./components/Chat/ChatSolvix.jsx'));
const UserProfile = lazy(() => import('./pages/UserProfile.jsx'));
const UserPublicProfile = lazy(() => import('./pages/UserPublicProfile.jsx'));
const UserSearch = lazy(() => import('./pages/UserSearch.jsx'));
const FriendRequests = lazy(() => import('./components/FriendRequests.jsx'));
const FriendList = lazy(() => import('./components/FriendList.jsx'));
const ManageUsers = lazy(() => import('./pages/adminPages/ManageUsers.jsx'));
const AssignCourses = lazy(() => import('./pages/adminPages/AssignCourses.jsx'));
const IAEmbeddingUploader = lazy(() => import('./pages/adminPages/IAEmbeddingUploader.jsx'));
const AdminCourseList = lazy(() => import('./pages/adminPages/AdminCourseList.jsx'));
const AdminCourseDetail = lazy(() => import('./pages/adminPages/AdminCourseDetail.jsx'));
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
const Need = ({ perm, any, children }: { perm?: Permission; any?: Permission[]; children: ReactNode }) => {
  const { can, loading } = useSchool();
  if (loading) return <Spinner center />;
  const ok = perm ? can(perm) : any ? any.some(can) : true;
  return ok ? <>{children}</> : <Navigate to="/inicio" replace />;
};

const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
};

/** Destino inicial según el tipo de usuario. */
const Landing = () => {
  const { session, loading, noSchool } = useSchool();
  if (loading) return <Spinner center />;
  if (session) return <Navigate to="/inicio" replace />;
  if (noSchool) return <Navigate to="/dashboard" replace />;
  return <Spinner center />;
};

export default function App() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<Spinner center />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/c/:slug" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/cambiar-clave" element={user ? <ForcePasswordChange /> : <Navigate to="/login" replace />} />

        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="/inicio" element={<HomePage />} />
            <Route path="/comunicados" element={<AnnouncementsPage />} />
            <Route path="/comunicados/nuevo" element={<Need perm="announcements.publish"><AnnouncementComposePage /></Need>} />
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
            <Route path="/alumnos" element={<Need perm="people.read"><StudentsPage /></Need>} />
            <Route path="/alumnos/:id" element={<Need perm="people.read"><StudentPage /></Need>} />
            <Route path="/division/:id" element={<Need perm="grades.read"><DivisionStatusPage /></Need>} />
            <Route path="/materias" element={<Need any={['grades.write', 'grades.read']}><SubjectsPage /></Need>} />
            <Route path="/materias/:divisionId/:subjectId" element={<Need any={['grades.write', 'grades.read']}><GradeSheetPage /></Need>} />
            <Route path="/asistencia" element={<Need perm="attendance.write"><AttendancePage /></Need>} />
            <Route path="/alertas" element={<Need perm="alerts.read"><AlertsPage /></Need>} />
            <Route path="/admin" element={<Need any={['school.manage', 'people.manage']}><AdminPage /></Need>} />

            <Route element={<LegacyFrame />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/catalogue" element={<Catalogue />} />
              <Route path="/catalogue/curso/:courseId" element={<CourseCatalogueDetail />} />
              <Route path="/curso" element={<MyCourseDetail />} />
              <Route path="/curso/:courseId" element={<CourseDetail />} />
              <Route path="/curso/:courseId/modulo/:moduleId/clase/:classId" element={<ClassDetail />} />
              <Route path="/chat/:id" element={<ChatSolvix />} />
              <Route path="/perfil/me" element={<UserProfile />} />
              <Route path="/perfil/:id" element={<UserPublicProfile />} />
              <Route path="/usuarios" element={<UserSearch />} />
              <Route path="/friends/requests" element={<FriendRequests />} />
              <Route path="/my-friends" element={<FriendList />} />
              <Route path="/admin/usuarios" element={<RequireAdmin><ManageUsers /></RequireAdmin>} />
              <Route path="/admin/asignar-cursos/:userId" element={<RequireAdmin><AssignCourses /></RequireAdmin>} />
              <Route path="/admin/solvix" element={<RequireAdmin><IAEmbeddingUploader /></RequireAdmin>} />
              <Route path="/admin/cursos" element={<RequireAdmin><AdminCourseList /></RequireAdmin>} />
              <Route path="/admin/cursos/:courseId" element={<RequireAdmin><AdminCourseDetail /></RequireAdmin>} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
