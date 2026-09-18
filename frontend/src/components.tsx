import { useLocaleValidation } from "./useLocaleValidation";
import { Alert, Button, Form, Input, Space } from "antd";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "./api";
import type { User } from "./api";
import { useAuth } from "./auth";

export function Brand() {
  const { t } = useTranslation();
  return (
    <Link className="brand" to="/">
      <span className="brand-logo"><img src="/assets/company-logo.png" alt="" /></span>
      <span>
        {t("brand")}
        <small>VESSEL TRADE MANAGEMENT</small>
      </span>
    </Link>
  );
}
export function Language() {
  const { i18n, t } = useTranslation(),
    { user, setUser } = useAuth();
  const [error, setError] = useState("");
  const change = async () => {
    const language = i18n.language === "en" ? "zh-CN" : "en";
    try {
      if (user) {
        await api("auth/language/", "POST", { language });
        setUser({ ...user, language });
      }
      await i18n.changeLanguage(language);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <span>
      <Button aria-label={t("language")} onClick={() => void change()}>
        {i18n.language === "en" ? "中文" : "English"}
      </Button>
      {error && (
        <span role="alert" className="inline-error">
          {t(error, { defaultValue: t("errors.invalid") })}
        </span>
      )}
    </span>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  const { t } = useTranslation();
  return error ? (
    <Alert
      type="error"
      showIcon
      message={t(error, { defaultValue: t("errors.invalid") })}
      action={retry ? <Button onClick={retry}>{t("retry")}</Button> : undefined}
    />
  ) : null;
}
export function PasswordForm() {
  const { t } = useTranslation(),
    { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const [form] = Form.useForm();
  useLocaleValidation(form);
  return (
    <div className="narrow">
      <h2>{t("changePassword")}</h2>
      {user?.must_change_password && (
        <Alert type="info" message={t("forcePassword")} />
      )}
      <p className="muted">{t("passwordHint")}</p>
      <ErrorBox error={error} />
      {saved && <Alert type="success" message={t("saved")} />}
      <Form
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          setBusy(true);
          setError("");
          try {
            const u = await api<User>("auth/password/", "POST", values);
            setUser(u);
            form.resetFields();
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Form.Item
          name="current_password"
          label={t("currentPassword")}
          rules={[{ required: true, message: t("required") }]}
        >
          <Input.Password autoComplete="current-password" maxLength={128} />
        </Form.Item>
        <Form.Item
          name="password"
          label={t("newPassword")}
          rules={[
            { required: true, message: t("required") },
            { min: 10, message: t("passwordHint") },
          ]}
        >
          <Input.Password autoComplete="new-password" maxLength={128} />
        </Form.Item>
        <Form.Item
          name="confirm"
          label={t("confirmPassword")}
          dependencies={["password"]}
          rules={[
            { required: true, message: t("required") },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                !v || getFieldValue("password") === v
                  ? Promise.resolve()
                  : Promise.reject(new Error(t("mismatch"))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" maxLength={128} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={busy}>
            {t("save")}
          </Button>
        </Space>
      </Form>
    </div>
  );
}
