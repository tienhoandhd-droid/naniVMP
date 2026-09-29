// The public auth/recovery entry keeps the working dashboard off the cold path.
import { lazy, Suspense, useState } from "react";
import LoginScreen, { type LoginScreenMode } from "./components/auth/LoginScreen.tsx";
import PasswordRecoveryScreen from "./components/auth/PasswordRecoveryScreen.tsx";
import MfaBoundary from "./components/auth/MfaBoundary.tsx";
import { DirtyStateProvider } from "./components/ui/DirtyStateProvider.tsx";
import ToastProvider from "./components/ui/ToastProvider.tsx";
import { useAuth } from "./hooks/useAuth.ts";
import { saveUser } from "./lib/config.ts";
import { nhapCoThuLai } from "./lib/tailMan.ts";
const AuthorizedAppShell = lazy(nhapCoThuLai(() => import("./AuthenticatedApp.tsx")));

type AuthFlowProps = {
  authMode: LoginScreenMode;
  setAuthMode: (mode: LoginScreenMode) => void;
  authNotice: string;
  setAuthNotice: (notice: string) => void;
};

function AppShell({ authMode, setAuthMode, authNotice, setAuthNotice }: AuthFlowProps) {
  const { user, setUser, logout, loading, recoverySignal, clearRecovery } = useAuth();

  if (recoverySignal) return (
    <PasswordRecoveryScreen
      signal={recoverySignal}
      onCompleted={async () => {
        setAuthMode("login");
        setAuthNotice("Mật khẩu đã được cập nhật. Hãy đăng nhập bằng mật khẩu mới.");
        await logout();
        clearRecovery();
      }}
      onRequestNewLink={async () => {
        setAuthMode("forgot");
        setAuthNotice("");
        await logout();
        clearRecovery();
      }}
    />
  );

  if (loading) return <main className="vq-login-page"><p role="status">Đang kiểm tra phiên đăng nhập…</p></main>;

  if (!user) return (
    <LoginScreen initialMode={authMode} notice={authNotice}
      onLogin={(u) => { setAuthNotice(""); setUser(u); saveUser(u); }} />
  );

  return <Suspense fallback={<main className="vq-login-page"><p role="status">Đang mở không gian làm việc…</p></main>}>
    <AuthorizedAppShell user={user} logout={logout} />
  </Suspense>;
}

export default function App() {
  // Recovery guidance survives the intentional session/MFA boundary remount.
  const [authMode, setAuthMode] = useState<LoginScreenMode>("login");
  const [authNotice, setAuthNotice] = useState("");
  return (
    <DirtyStateProvider>
      {/* Vỏ thông báo bọc NGOÀI AppShell: mọi màn, mọi hộp thoại đều gọi
          `useToast()` được, kể cả các hộp thoại dựng bằng portal. */}
      <ToastProvider>
        <MfaBoundary><AppShell authMode={authMode} setAuthMode={setAuthMode}
          authNotice={authNotice} setAuthNotice={setAuthNotice} /></MfaBoundary>
      </ToastProvider>
    </DirtyStateProvider>
  );
}
