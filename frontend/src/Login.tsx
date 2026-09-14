import { Button, Form, Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { api } from "./api";
import type { User } from "./api";
import { useAuth } from "./auth";
import { Brand, Language, ErrorBox } from "./components";
import { useLocaleValidation } from "./useLocaleValidation";
export default function Login() {
  const { t, i18n } = useTranslation(),
    { user, setUser } = useAuth();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [form] = Form.useForm();
  useLocaleValidation(form);
  if (user) return <Navigate to="/app" replace />;
  return (
    <div className="login-page">
      <div className="login-visual">
        <Brand />
        <div>
          <div className="eyebrow">ENERGY FOR EVERY VOYAGE</div>
          <h1>{t("hero")}</h1>
          <p>{t("heroCopy")}</p>
        </div>
        <small>VESSEL TRADE MANAGEMENT</small>
      </div>
      <div className="login-form">
        <div className="language-top">
          <Language />
        </div>
        <div className="narrow">
          <div className="eyebrow">MARINE OPERATIONS</div>
          <h1>{t("welcome")}</h1>
          <p className="muted">{t("loginCopy")}</p>
          <ErrorBox error={error} />
          <Form
            form={form}
            layout="vertical"
            onFinish={async (data) => {
              setBusy(true);
              setError("");
              try {
                const u = await api<User>("auth/login/", "POST", data);
                await i18n.changeLanguage(u.language);
                setUser(u);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              name="username"
              label={t("username")}
              rules={[{ required: true, message: t("required") }]}
            >
              <Input autoComplete="username" size="large" maxLength={150} />
            </Form.Item>
            <Form.Item
              name="password"
              label={t("password")}
              rules={[{ required: true, message: t("required") }]}
            >
              <Input.Password
                autoComplete="current-password"
                size="large"
                maxLength={128}
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={busy}
            >
              {t("login")} →
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
