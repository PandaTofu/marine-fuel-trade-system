import { useLocaleValidation } from "./useLocaleValidation";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  App,
} from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import type { Reference } from "./api";
import { ErrorBox, Language } from "./components";
export default function References() {
  const { t } = useTranslation(),
    { message } = App.useApp(),
    navigate = useNavigate(),
    { kind: paramKind } = useParams();
  const kinds = ["customer", "supplier", "oil", "port", "salesperson"] as const;
  const validKind = kinds.includes(paramKind as (typeof kinds)[number]);
  const kind = (validKind ? paramKind : "customer") as (typeof kinds)[number];
  const [rows, setRows] = useState<Reference[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState<Reference | null | undefined>(undefined);
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api<Reference[]>(`reference/?kind=${kind}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [kind]);
  const open = (row: Reference | null) => {
    setEditing(row);
    setFormError("");
    form.resetFields();
    form.setFieldsValue(row || { is_active: true });
  };
  const visible = rows.filter((r) =>
    [r.name, r.code || ""].some((s) =>
      s.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  if (!validKind) return <Navigate to="/app/reference/customer" replace />;
  const titles = {
    customer: "customerManagement",
    supplier: "supplierManagement",
    oil: "oilLibrary",
    port: "portManagement",
    salesperson: "salespersonManagement",
  } as const;
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">{t("references")}</div>
        <h1>{t(titles[kind])}</h1>
        <p>{t(`${kind}ReferenceCopy`)}</p>
      </div>
      <div className="reference-summary">
        <Card>
          <span>{t("totalRecords")}</span>
          <strong>{rows.length}</strong>
        </Card>
        <Card>
          <span>{t("activeRecords")}</span>
          <strong>{rows.filter((row) => row.is_active).length}</strong>
        </Card>
        <Card>
          <span>{t("inactiveRecords")}</span>
          <strong>{rows.filter((row) => !row.is_active).length}</strong>
        </Card>
      </div>
      <Card>
        <Tabs
          activeKey={kind}
          onChange={(k) => {
            setQuery("");
            navigate(`/app/reference/${k}`);
          }}
          items={["customer", "supplier", "oil", "port", "salesperson"].map(
            (k) => ({ key: k, label: t(k) }),
          )}
        />
        <div className="table-toolbar">
          <Input.Search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            allowClear
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => open(null)}
          >
            {t("add")}
          </Button>
        </div>
        <ErrorBox error={error} retry={() => void load()} />
        <Table
          rowKey="id"
          loading={loading}
          dataSource={error ? [] : visible}
          scroll={{ x: 760 }}
          locale={{ emptyText: t("empty") }}
          columns={[
            { title: t("code"), dataIndex: "code", width: 150 },
            {
              title: t("name"),
              dataIndex: "name",
              render: (name: string) => <strong>{name}</strong>,
            },
            {
              title: t("is_active"),
              render: (_, r) => (
                <Tag color={r.is_active ? "cyan" : "default"}>
                  {t(r.is_active ? "active" : "inactive")}
                </Tag>
              ),
            },
            {
              title: t("actions"),
              width: 90,
              render: (_, r) => (
                <Tooltip title={t("edit")}>
                  <Button
                    type="text"
                    aria-label={t("edit")}
                    icon={<EditOutlined />}
                    onClick={() => open(r)}
                  />
                </Tooltip>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={
          <Space>
            {`${t(editing ? "edit" : "add")} · ${t(kind)}`}
            <Language />
          </Space>
        }
        open={editing !== undefined}
        onCancel={() => setEditing(undefined)}
        footer={null}
        destroyOnHidden={false}
      >
        <ErrorBox error={formError} />
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setBusy(true);
            setFormError("");
            try {
              await api(
                `reference/${editing ? editing.id + "/" : ""}`,
                editing ? "PATCH" : "POST",
                { ...values, kind },
              );
              setEditing(undefined);
              message.success(t("saved"));
              await load();
            } catch (e) {
              setFormError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label={t("name")}
            rules={[
              { required: true, whitespace: true, message: t("required") },
            ]}
          >
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            name="is_active"
            label={t("is_active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              {t("save")}
            </Button>
            <Button onClick={() => setEditing(undefined)}>{t("cancel")}</Button>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
