import { useLocaleValidation } from "./useLocaleValidation";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  App,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import type { Reference } from "./api";
import { ErrorBox, Language } from "./components";
export default function References() {
  const { t } = useTranslation(),
    { message, modal } = App.useApp(),
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
    form.setFieldsValue(row || { is_active: true, ...(kind === "oil" ? { unit: "MT" } : {}) });
  };
  const visible = rows.filter((r) =>
    [r.name, r.code || "", r.email || "", r.swift_code || "", r.iban || "", r.oil_category || "", r.specification || ""].some((s) =>
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
          scroll={{ x: ["customer", "supplier"].includes(kind) ? 1450 : kind === "oil" ? 1200 : 760 }}
          locale={{ emptyText: t("empty") }}
          columns={[
            {
              title: t("code"),
              dataIndex: "code",
              width: 150,
              render: (code: string, r) => (
                <Space direction="vertical" size={2}>
                  <span className={r.is_active ? "" : "reference-code-inactive"}>{code}</span>
                  <Tag color={r.is_active ? "cyan" : "default"}>
                    {t(r.is_active ? "active" : "inactive")}
                  </Tag>
                </Space>
              ),
            },
            {
              title: t("name"),
              dataIndex: "name",
              render: (name: string) => <strong>{name}</strong>,
            },
            ...(["customer", "supplier"].includes(kind)
              ? [
                  { title: t("email"), dataIndex: "email", width: 210 },
                  { title: t("swiftCode"), dataIndex: "swift_code", width: 150 },
                  { title: t("iban"), dataIndex: "iban", width: 190 },
                  { title: t("bankCode"), dataIndex: "bank_code", width: 140 },
                  { title: t("bankAddress"), dataIndex: "bank_address", width: 280 },
                ]
              : []),
            ...(kind === "oil"
              ? [
                  { title: t("oilCategory"), dataIndex: "oil_category", width: 130 },
                  { title: t("oilSpecification"), dataIndex: "specification", width: 190 },
                  { title: t("measurementUnit"), dataIndex: "unit", width: 100 },
                  { title: t("referenceSalePrice"), dataIndex: "reference_sale_price", width: 160, render: (value: string | null) => value || "—" },
                  { title: t("referenceCostPrice"), dataIndex: "reference_cost_price", width: 160, render: (value: string | null) => value || "—" },
                ]
              : []),
            {
              title: t("actions"),
              width: 110,
              render: (_, r) => (
                <Space size={4}>
                  <Tooltip title={t("edit")}>
                    <Button
                      type="text"
                      aria-label={t("edit")}
                      icon={<EditOutlined />}
                      onClick={() => open(r)}
                    />
                  </Tooltip>
                  <Tooltip title={t("delete")}>
                    <Button
                      type="text"
                      danger
                      aria-label={t("delete")}
                      icon={<DeleteOutlined />}
                      onClick={() => modal.confirm({
                        title: t("deleteReferenceTitle"),
                        content: t("deleteReferenceHint"),
                        okText: t("delete"),
                        cancelText: t("cancel"),
                        okButtonProps: { danger: true },
                        onOk: async () => {
                          try {
                            await api(`reference/${r.id}/`, "DELETE");
                            message.success(t("deleted"));
                            await load();
                          } catch (e) {
                            message.error(t((e as Error).message));
                          }
                        },
                      })}
                    />
                  </Tooltip>
                </Space>
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
          {kind === "oil" && (
            <>
              <Form.Item name="oil_category" label={t("oilCategory")}>
                <Input maxLength={80} placeholder={t("oilCategoryPlaceholder")} />
              </Form.Item>
              <Form.Item name="specification" label={t("oilSpecification")}>
                <Input maxLength={160} placeholder={t("oilSpecificationPlaceholder")} />
              </Form.Item>
              <Form.Item
                name="unit"
                label={t("measurementUnit")}
                rules={[{ required: true, whitespace: true, message: t("required") }]}
              >
                <Input maxLength={20} />
              </Form.Item>
              <Form.Item name="reference_sale_price" label={t("referenceSalePrice")}>
                <InputNumber<string> stringMode min="0" precision={4} style={{ width: "100%" }} placeholder={t("referencePricePlaceholder")} />
              </Form.Item>
              <Form.Item name="reference_cost_price" label={t("referenceCostPrice")}>
                <InputNumber<string> stringMode min="0" precision={4} style={{ width: "100%" }} placeholder={t("referencePricePlaceholder")} />
              </Form.Item>
            </>
          )}
          {["customer", "supplier"].includes(kind) && (
            <>
              <Form.Item name="email" label={t("email")} rules={[{ type: "email" }]}>
                <Input maxLength={254} />
              </Form.Item>
              <div className="business-form-grid adaptive">
                <Form.Item name="swift_code" label={t("swiftCode")}>
                  <Input maxLength={40} />
                </Form.Item>
                <Form.Item name="iban" label={t("iban")}>
                  <Input maxLength={80} />
                </Form.Item>
                <Form.Item name="bank_code" label={t("bankCode")}>
                  <Input maxLength={40} />
                </Form.Item>
              </div>
              <Form.Item name="bank_address" label={t("bankAddress")}>
                <Input.TextArea rows={3} maxLength={300} />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="is_active"
            label={t("is_active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {kind === "oil" && (
            <Form.Item name="note" label={t("note")}>
              <Input.TextArea rows={4} maxLength={1000} placeholder={t("oilNotePlaceholder")} />
            </Form.Item>
          )}
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
