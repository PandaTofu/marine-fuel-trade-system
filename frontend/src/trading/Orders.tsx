import { useState } from "react";
import {
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  MoreOutlined,
  StopOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { api } from "../api";
import { ErrorBox } from "../components";
import {
  cash,
  downloadOrderDocument,
  Metrics,
  query,
  ReasonDialog,
  Status,
  useCommand,
  useResource,
} from "./shared";
import { OrderDetail, OrderEditor, SettlementEditor } from "./OrderForms";
import type { Order, OrderList } from "./types";

export default function Orders({
  settlements = false,
}: {
  settlements?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Record<string, unknown>>(
      settlements ? { state: "financial" } : {},
    ),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Order[]>([]);
  const [filterForm] = Form.useForm();
  const r = useResource<OrderList>(
    "trading/orders/?" + query({ ...filters, page }),
  );
  const cmd = useCommand();
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Order | "new" | null>(null),
    [payment, setPayment] = useState<{ order: Order; refund: boolean } | null>(
      null,
    ),
    [detail, setDetail] = useState<Order | null>(null);
  const [closing, setClosing] = useState<{
    action: "delete" | "void" | "bulk" | "clear";
    rows: { id: number; version: number }[];
  } | null>(null);
  const refresh = () => {
    r.refresh();
    setSelected([]);
  };
  const columns: ColumnsType<Order> = [
    {
      title: t("biz.number"),
      dataIndex: "number",
      fixed: "left",
      width: 195,
      render: (v: string, o: Order) => (
        <Button type="link" onClick={() => setDetail(o)}>
          {v}
        </Button>
      ),
    },
    ...["order_date", "customer", "vessel", "supplier", "port"].map((key) => ({
      title: t(`biz.${key}`),
      dataIndex: key,
      width: 145,
    })),
    {
      title: t("biz.oil"),
      width: 150,
      render: (_: unknown, o: Order) => o.lines.map((l) => l.oil).join(" / "),
    },
    ...(!settlements
      ? ["sales", "cost", "commission", "profit"]
      : [
          "customer_deposit",
          "customer_received",
          "supplier_deposit",
          "supplier_paid",
        ]
    ).map((key) => ({
      title: t(`biz.${key}`),
      width: 160,
      render: (_: unknown, o: Order) =>
        cash(o.numbers[key as keyof Order["numbers"]]),
    })),
    ...["receivable", "payable"].map((key) => ({
      title: t(`biz.${key}`),
      width: 160,
      render: (_: unknown, o: Order) =>
        cash(o.numbers[key as "receivable" | "payable"]),
    })),
    ...["customer_due", "supplier_due"].map((key) => ({
      title: t(`biz.${key}`),
      width: 130,
      render: (_: unknown, o: Order) =>
        o.numbers[key as "customer_due" | "supplier_due"] || "—",
    })),
    ...["customer_status", "supplier_status"].map((key) => ({
      title: t(`biz.${key}`),
      width: 130,
      render: (_: unknown, o: Order) => (
        <Status
          value={o.numbers[key as "customer_status" | "supplier_status"]}
        />
      ),
    })),
    {
      title: t("biz.action"),
      width: 230,
      fixed: "right",
      render: (_: unknown, o: Order) => (
        <div className="order-row-actions">
          {["confirmed", "supplied", "completed"].includes(o.state) &&
            (settlements ? (
              <Space size={6}>
                <Button
                  size="small"
                  type="primary"
                  disabled={!['admin', 'finance'].includes(user?.role || '')}
                  onClick={() => setPayment({ order: o, refund: false })}
                >
                  {t("biz.recordPayment")}
                </Button>
                <Button
                  size="small"
                  disabled={!['admin', 'finance'].includes(user?.role || '')}
                  onClick={() => setPayment({ order: o, refund: true })}
                >
                  {t("biz.refundAction")}
                </Button>
              </Space>
            ) : (
              <Space size={6}>
                <Tooltip title={t("biz.edit")}>
                  <Button
                    size="small"
                    type="text"
                    aria-label={t("biz.edit")}
                    icon={<EditOutlined />}
                    onClick={() => setEditor(o)}
                  />
                </Tooltip>
                <Tooltip
                  title={
                    user?.role === "admin"
                      ? t("biz.delete")
                      : t("biz.adminDeleteOnly")
                  }
                >
                  <span>
                    <Button
                      size="small"
                      type="text"
                      danger
                      aria-label={t("biz.delete")}
                      icon={<DeleteOutlined />}
                      disabled={user?.role !== "admin"}
                      onClick={() =>
                        setClosing({ action: "delete", rows: [o] })
                      }
                    />
                  </span>
                </Tooltip>
                {user?.role === "admin" && (
                  <Tooltip title={t("biz.voidAction")}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      aria-label={t("biz.voidAction")}
                      icon={<StopOutlined />}
                      onClick={() => setClosing({ action: "void", rows: [o] })}
                    />
                  </Tooltip>
                )}
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    onClick: async ({ key }) => {
                      if (
                        key === "export-contract" ||
                        key === "issue-invoice"
                      ) {
                        setError("");
                        try {
                          await downloadOrderDocument(
                            o.id,
                            key === "export-contract" ? "contract" : "invoice",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }
                    },
                    items: [
                      {
                        key: "export-order",
                        icon: <FileExcelOutlined />,
                        label: t("biz.exportOrderExcel"),
                        disabled: true,
                      },
                      {
                        key: "export-contract",
                        icon: <FilePdfOutlined />,
                        label: t("biz.exportContract"),
                      },
                      {
                        key: "issue-invoice",
                        icon: <FileDoneOutlined />,
                        label: t("biz.issueInvoice"),
                      },
                    ],
                  }}
                >
                  <Tooltip title={t("biz.moreActions")}>
                    <Button
                      size="small"
                      type="text"
                      aria-label={t("biz.moreActions")}
                      icon={<MoreOutlined />}
                    />
                  </Tooltip>
                </Dropdown>
              </Space>
            ))}
          {o.state === "draft" && !settlements && (
            <Space size={6}>
              <Tooltip title={t("biz.edit")}>
                <Button
                  size="small"
                  type="text"
                  aria-label={t("biz.edit")}
                  icon={<EditOutlined />}
                  onClick={() => setEditor(o)}
                />
              </Tooltip>
              <Tooltip
                title={
                  user?.role === "admin"
                    ? t("biz.delete")
                    : t("biz.adminDeleteOnly")
                }
              >
                <span>
                  <Button
                    size="small"
                    type="text"
                    danger
                    aria-label={t("biz.delete")}
                    icon={<DeleteOutlined />}
                    disabled={user?.role !== "admin"}
                    onClick={() => setClosing({ action: "delete", rows: [o] })}
                  />
                </span>
              </Tooltip>
            </Space>
          )}
          {!settlements && <Status value={o.state} />}
        </div>
      ),
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">MARINE TRADE · USD</div>
        <h1>{t(settlements ? "biz.settlements" : "biz.orders")}</h1>
        <p>{t("biz.amountsHint")}</p>
      </div>
      {r.data && (
        <Metrics
          data={r.data.summary}
          keys={
            settlements
              ? [
                  "receivable",
                  "payable",
                  "customer_overdue",
                  "supplier_overdue",
                  "partial_receipts",
                  "net_expected",
                ]
              : [
                  "order_count",
                  "sales",
                  "cost",
                  "commission",
                  "profit",
                ]
          }
        />
      )}
      <Card>
        <Form
          form={filterForm}
          layout="inline"
          className="business-filters"
          initialValues={settlements ? { state: "financial" } : {}}
          onFinish={(values) => {
            setFilters(values);
            setPage(1);
            setSelected([]);
          }}
        >
          {["q", "customer", "supplier", "port", "oil", "salesperson"].map(
            (key) => (
              <Form.Item
                key={key}
                name={key}
                label={t(`biz.${key === "q" ? "query" : key}`)}
              >
                <Input allowClear />
              </Form.Item>
            ),
          )}
          {["date_from", "date_to"].map((key) => (
            <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
              <Input type="date" />
            </Form.Item>
          ))}
          <Form.Item name="state" label={t("biz.supplyState")}>
            <Select
              allowClear
              style={{ width: 140 }}
              options={(
                settlements
                  ? ["financial", "confirmed", "supplied", "completed"]
                  : ["draft", "confirmed", "supplied", "completed", "void"]
              ).map((value) => ({ value, label: t(`biz.${value}`) }))}
            />
          </Form.Item>
          {["customer_status", "supplier_status"].map((key) => (
            <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
              <Select
                allowClear
                style={{ width: 140 }}
                options={[
                  "pending",
                  "not_due",
                  "partial",
                  "overdue",
                  "settled",
                ].map((value) => ({ value, label: t(`biz.${value}`) }))}
              />
            </Form.Item>
          ))}
          {settlements && (
            <Form.Item name="settlement_scope" label={t("biz.filter")}>
              <Select
                allowClear
                style={{ width: 140 }}
                options={["partial", "overdue", "settled"].map((value) => ({
                  value,
                  label: t(`biz.${value}`),
                }))}
              />
            </Form.Item>
          )}
          <Form.Item>
            <Button htmlType="submit" type="primary">
              {t("biz.filter")}
            </Button>
          </Form.Item>
          <Form.Item>
            <Button
              onClick={() => {
                filterForm.resetFields();
                filterForm.setFieldValue(
                  "state",
                  settlements ? "financial" : undefined,
                );
                setFilters(settlements ? { state: "financial" } : {});
                setPage(1);
                setSelected([]);
              }}
            >
              {t("biz.reset")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <div className="business-toolbar">
        {!settlements && (
          <Button type="primary" onClick={() => setEditor("new")}>
            {t("biz.createOrder")}
          </Button>
        )}
        {!settlements && user?.role === "admin" && (
          <Space>
            <Button
              danger
              disabled={!selected.length}
              onClick={() => setClosing({ action: "bulk", rows: selected })}
            >
              {t("biz.deleteSelected")} ({selected.length})
            </Button>
            <Button
              danger
              onClick={async () => {
                setError("");
                try {
                  const rows = await api<{ id: number; version: number }[]>(
                    "trading/orders/clear-snapshot/",
                  );
                  if (rows.length) setClosing({ action: "clear", rows });
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t("biz.clearAll")}
            </Button>
          </Space>
        )}
      </div>
      <ErrorBox error={r.error || error} retry={r.refresh} />
      <Table<Order>
        rowKey="id"
        loading={r.loading}
        dataSource={r.data?.results}
        columns={columns}
        scroll={{ x: 2300 }}
        rowSelection={
          !settlements && user?.role === "admin"
            ? {
                selectedRowKeys: selected.map((o) => o.id),
                onChange: (_, rows) => setSelected(rows),
                getCheckboxProps: (o) => ({
                  disabled: ![
                    "draft",
                    "confirmed",
                    "supplied",
                    "completed",
                  ].includes(o.state),
                }),
              }
            : undefined
        }
        pagination={{
          current: page,
          pageSize: 20,
          total: r.data?.count,
          showSizeChanger: false,
          onChange: (value) => {
            setPage(value);
            setSelected([]);
          },
        }}
      />
      {editor && (
        <OrderEditor
          order={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            refresh();
            setDetail(saved);
          }}
        />
      )}
      {payment && (
        <SettlementEditor
          {...payment}
          onClose={() => setPayment(null)}
          onSaved={refresh}
        />
      )}
      {detail && (
        <OrderDetail
          order={detail}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setDetail(updated);
            refresh();
          }}
        />
      )}
      {closing && (
        <ReasonDialog
          title={t(
            `biz.${closing.action === "void" ? "voidAction" : closing.action === "clear" ? "clearAll" : "delete"}`,
          )}
          hint={t(
            closing.action === "void"
              ? "biz.voidHint"
              : closing.action === "clear"
                ? "biz.clearHint"
                : "biz.deleteHint",
          )}
          clear={closing.action === "clear"}
          date={closing.action === "void"}
          onClose={() => setClosing(null)}
          onSubmit={async (values) => {
            const bulk = ["bulk", "clear"].includes(closing.action);
            await cmd.send(
              bulk
                ? "trading/orders/bulk-delete/"
                : `trading/orders/${closing.rows[0].id}/${closing.action}/`,
              bulk
                ? {
                    ...values,
                    orders: closing.rows.map(({ id, version }) => ({
                      id,
                      version,
                    })),
                    clear_all: closing.action === "clear",
                  }
                : { ...values, version: closing.rows[0].version },
            );
            refresh();
          }}
        />
      )}{" "}
    </>
  );
}
