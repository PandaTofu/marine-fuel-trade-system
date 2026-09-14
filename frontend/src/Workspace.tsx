import { useEffect, useState } from "react";
import { Button, Card, Menu, Spin, Tag } from "antd";
import {
  AppstoreOutlined,
  DatabaseOutlined,
  TeamOutlined,
  SettingOutlined,
  SafetyOutlined,
  LogoutOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth";
import { api } from "./api";
import { Brand, Language, PasswordForm, ErrorBox } from "./components";
export default function Workspace() {
  const { t } = useTranslation(),
    { user, setUser, loading, error, refresh } = useAuth(),
    location = useLocation();
  const [logoutError, setLogoutError] = useState("");
  if (loading)
    return (
      <div className="loading">
        <Spin />
      </div>
    );
  if (error)
    return (
      <div className="narrow">
        <ErrorBox error={error} retry={() => void refresh()} />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  const menu = [
    ["/app", "overview", <AppstoreOutlined />],
    ["/app/orders", "biz.orders", <DatabaseOutlined />],
    ["/app/settlements", "biz.settlements", <AppstoreOutlined />],
    ["/app/funds", "biz.funds", <DatabaseOutlined />],
    ["/app/reference", "references", <DatabaseOutlined />],
    ...(user.role === "admin"
      ? [["/app/users", "users", <TeamOutlined />]]
      : []),
    ["/app/company", "settings", <SettingOutlined />],
    ["/app/security", "security", <SafetyOutlined />],
  ];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-caption">MARINE OPERATIONS</div>
        <Menu
          theme="dark"
          selectedKeys={[location.pathname]}
          items={menu.map(([path, label, icon]) => ({
            key: String(path),
            icon,
            label: <Link to={String(path)}>{t(String(label))}</Link>,
          }))}
        />
        <div className="sidebar-foot">
          <span className="status-dot" />
          {t("phase")}
          <Link to="/">{t("home")} ↗</Link>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <span>{t("workspace")}</span>
          <div>
            <Language />
            <span className="user-name">
              {user.first_name || user.username} <Tag>{t(user.role)}</Tag>
            </span>
            <Button
              aria-label={t("logout")}
              icon={<LogoutOutlined />}
              onClick={async () => {
                try {
                  await api("auth/logout/", "POST");
                  setUser(null);
                } catch (e) {
                  setLogoutError((e as Error).message);
                }
              }}
            />
          </div>
        </header>
        <main className="workspace-content">
          <ErrorBox error={logoutError} />
          {user.must_change_password ? (
            <Card>
              <PasswordForm />
            </Card>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
export function Overview() {
  const { t } = useTranslation(),
    { user } = useAuth();
  const [data, setData] = useState<{
      references: Record<string, number>;
      active_users: number | null;
    }>(),
    [error, setError] = useState("");
  const load = () => {
    setError("");
    api<typeof data>("overview/")
      .then(setData)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">OPERATIONS OVERVIEW</div>
        <h1>{t("hello", { name: user?.first_name || user?.username })}</h1>
        <p>{t("overviewCopy")}</p>
      </div>
      <ErrorBox error={error} retry={load} />
      {!data && !error ? (
        <Spin />
      ) : (
        data && (
          <>
            <div className="stats-grid">
              {Object.entries(data.references).map(([key, value]) => (
                <Card key={key}>
                  <span className="stat-label">{t(key)}</span>
                  <strong>{value}</strong>
                  <span className="stat-foot">{t("active")}</span>
                </Card>
              ))}
            </div>
            <div className="overview-bottom">
              <Card className="welcome-card">
                <Tag color="cyan">{t("ready")}</Tag>
                <h2>{t("nextTitle")}</h2>
                <p>{t("nextCopy")}</p>
                <Link to="/app/reference">
                  <Button type="primary" icon={<ArrowRightOutlined />}>
                    {t("manageReference")}
                  </Button>
                </Link>
              </Card>
              <Card>
                <div className="eyebrow">COMPANY PROFILE</div>
                <h2>{t("settings")}</h2>
                {data.active_users !== null && (
                  <p>
                    {t("activeUsers")} · {data.active_users}
                  </p>
                )}
                <Link to="/app/company">{t("manageCompany")} →</Link>
              </Card>
            </div>
          </>
        )
      )}
    </>
  );
}
