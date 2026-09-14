import { useLocaleValidation } from "./useLocaleValidation";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Spin, App } from "antd";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { useAuth } from "./auth";
import { ErrorBox } from "./components";
export default function Company() {
  const { t } = useTranslation(),
    { user } = useAuth(),
    { message } = App.useApp();
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      form.setFieldsValue(await api("company/"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const fields = [
    ["name", "companyName", 160],
    ["name_en", "companyNameEn", 160],
    ["address", "address", 300],
    ["address_en", "address_en", 300],
    ["email", "email", 254],
    ["phone", "phone", 60],
    ["invoice_prefix", "invoice_prefix", 12],
  ] as const;
  return (
    <>
      <div className="page-heading">
        <h1>{t("settings")}</h1>
        <p>{t("companyCopy")}</p>
      </div>
      <Card>
        <ErrorBox error={error} retry={() => void load()} />
        {user?.role !== "admin" && (
          <Alert type="info" message={t("readonly")} />
        )}
        <Spin spinning={loading}>
          <Form
            form={form}
            layout="vertical"
            disabled={user?.role !== "admin" || loading}
            onFinish={async (values) => {
              setBusy(true);
              try {
                await api("company/", "PATCH", values);
                setError("");
                message.success(t("saved"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="company-grid">
              {fields.map(([key, label, max]) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={t(label)}
                  rules={
                    key === "email"
                      ? [{ type: "email", message: t("errors.invalid") }]
                      : key === "invoice_prefix"
                        ? [{ required: true, message: t("required") }]
                        : []
                  }
                >
                  <Input maxLength={max} />
                </Form.Item>
              ))}
            </div>
            {user?.role === "admin" && (
              <Button type="primary" htmlType="submit" loading={busy}>
                {t("save")}
              </Button>
            )}
          </Form>
        </Spin>
      </Card>
    </>
  );
}
