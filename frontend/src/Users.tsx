import { useLocaleValidation } from "./useLocaleValidation";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  App,
} from "antd";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { api } from "./api";
import type { User } from "./api";
import { useAuth } from "./auth";
import { ErrorBox, Language } from "./components";
export default function Users() {
  const { t } = useTranslation(),
    { user } = useAuth(),
    { message } = App.useApp();
  const [rows, setRows] = useState<User[]>([]),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"create" | "edit" | "reset" | null>(null),
    [target, setTarget] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api<User[]>("users/"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.role === "admin") void load();
  }, []);
  if (user?.role !== "admin") return <Navigate to="/app" replace />;
  const open = (m: typeof mode, u: User | null) => {
    setMode(m);
    setTarget(u);
    setFormError("");
    form.resetFields();
    form.setFieldsValue(u || { role: "operator", is_active: true });
  };
  return (
    <>
      <div className="page-heading">
        <h1>{t("users")}</h1>
        <p>{t("usersCopy")}</p>
      </div>
      <Card>
        <div className="table-toolbar">
          <span>
            {t("activeUsers")} · {rows.filter((r) => r.is_active).length}
          </span>
          <Button type="primary" onClick={() => open("create", null)}>
            {t("createUser")}
          </Button>
        </div>
        <ErrorBox error={error} retry={() => void load()} />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={error ? [] : rows}
          scroll={{ x: 800 }}
          columns={[
            { title: t("username"), dataIndex: "username" },
            { title: t("displayName"), dataIndex: "first_name" },
            { title: t("role"), render: (_, r) => t(r.role) },
            {
              title: t("accountStatus"),
              render: (_, r) => (
                <Tag color={r.is_active ? "cyan" : "default"}>
                  {t(
                    !r.is_active
                      ? "inactive"
                      : r.must_change_password
                        ? "mustChange"
                        : "normal",
                  )}
                </Tag>
              ),
            },
            {
              title: t("actions"),
              render: (_, r) => (
                <Space>
                  <Button type="link" onClick={() => open("edit", r)}>
                    {t("edit")}
                  </Button>
                  {r.id !== user.id && (
                    <Button type="link" onClick={() => open("reset", r)}>
                      {t("resetPassword")}
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={
          <Space>
            {t(
              mode === "reset"
                ? "resetPassword"
                : mode === "edit"
                  ? "edit"
                  : "createUser",
            )}
            <Language />
          </Space>
        }
        open={mode !== null}
        onCancel={() => setMode(null)}
        footer={null}
      >
        <ErrorBox error={formError} />
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setBusy(true);
            setFormError("");
            try {
              if (mode === "reset")
                await api(`users/${target!.id}/reset-password/`, "POST", {
                  password: values.password,
                });
              else
                await api(
                  `users/${mode === "edit" ? target!.id + "/" : ""}`,
                  mode === "edit" ? "PATCH" : "POST",
                  values,
                );
              setMode(null);
              message.success(t("saved"));
              await load();
            } catch (e) {
              setFormError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode !== "reset" && (
            <>
              <Form.Item
                name="username"
                label={t("username")}
                rules={[{ required: true, message: t("required") }]}
              >
                <Input maxLength={150} disabled={mode === "edit"} />
              </Form.Item>
              <Form.Item name="first_name" label={t("displayName")}>
                <Input maxLength={150} />
              </Form.Item>
              <Form.Item name="role" label={t("role")}>
                <Select
                  disabled={target?.id === user.id}
                  options={["admin", "operator"].map((k) => ({
                    value: k,
                    label: t(k),
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="is_active"
                label={t("is_active")}
                valuePropName="checked"
              >
                <Switch disabled={target?.id === user.id} />
              </Form.Item>
            </>
          )}
          {mode !== "edit" && (
            <>
              <Alert type="info" message={t("resetHint")} />
              <Form.Item
                name="password"
                label={t("initialPassword")}
                extra={t("passwordHint")}
                rules={[
                  { required: true, message: t("required") },
                  { min: 10, message: t("passwordHint") },
                ]}
              >
                <Input.Password maxLength={128} autoComplete="new-password" />
              </Form.Item>
            </>
          )}
          <Button type="primary" htmlType="submit" loading={busy}>
            {t("save")}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
