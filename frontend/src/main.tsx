import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App, ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import "./i18n";
import "./trading/locales";
import "./style.css";
import "./trading/style.css";
import { AuthProvider } from "./auth";
import Public from "./Public";
const Login = React.lazy(() => import("./Login"));
const Workspace = React.lazy(() => import("./Workspace"));
const Overview = React.lazy(() => import("./trading/Dashboard"));
const Orders = React.lazy(() => import("./trading/Orders"));
const Funds = React.lazy(() => import("./trading/Funds"));
const References = React.lazy(() => import("./References"));
const Users = React.lazy(() => import("./Users"));
const Company = React.lazy(() => import("./Company"));
import { PasswordForm } from "./components";
function Root() {
  const { i18n } = useTranslation();
  return (
    <ConfigProvider
      locale={i18n.language === "en" ? enUS : zhCN}
      theme={{
        token: {
          colorPrimary: "#147d92",
          borderRadius: 8,
          fontFamily: "Inter, Segoe UI, Microsoft YaHei, sans-serif",
          colorBgLayout: "#f3f6f8",
        },
      }}
    >
      <App>
        <AuthProvider>
          <BrowserRouter>
            <React.Suspense
              fallback={
                <div className="loading">
                  <Spin />
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Public />} />
                <Route path="/login" element={<Login />} />
                <Route path="/app" element={<Workspace />}>
                  <Route index element={<Overview />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="settlements" element={<Orders settlements />} />
                  <Route path="funds" element={<Funds />} />
                  <Route path="reference" element={<Navigate to="/app/reference/customer" replace />} />
                  <Route path="reference/:kind" element={<References />} />
                  <Route path="users" element={<Users />} />
                  <Route path="company" element={<Company />} />
                  <Route path="security" element={<PasswordForm />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </React.Suspense>
          </BrowserRouter>
        </AuthProvider>
      </App>
    </ConfigProvider>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
