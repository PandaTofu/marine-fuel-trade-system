import { useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tooltip,
} from "antd";
import {
  EditOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { ErrorBox } from "../components";
import {
  cash,
  Metrics,
  query,
  Status,
  useResource,
} from "./shared";
import { OrderDetail, OrderEditor, SettlementEditor } from "./OrderForms";
import { DocumentEditor } from "./DocumentEditor";
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
    [page, setPage] = useState(1);
  const [filterForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState("list");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const r = useResource<OrderList>(
    "trading/orders/?" + query({ ...filters, page }),
  );
  const [editor, setEditor] = useState<Order | null>(null),
    [payment, setPayment] = useState<{ order: Order; refund: boolean } | null>(
      null,
    ),
    [detail, setDetail] = useState<Order | null>(null),
    [document, setDocument] = useState<{
      orderId: number;
      kind: "contract" | "invoice";
    } | null>(null);
  const refresh = () => {
    r.refresh();
  };
  const columns: ColumnsType<Order> = [
    {
      title: t("biz.number"),
      dataIndex: "number",
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
      width: 520,
      render: (_: unknown, o: Order) => (
        <div className="order-row-actions">
          {settlements ? (
            ["confirmed", "supplied", "completed"].includes(o.state) && (
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
            )
          ) : (
            <Space size={6}>
              {o.state !== "void" && (
                <Tooltip title={t("biz.edit")}>
                  <Button
                    size="small"
                    type="text"
                    aria-label={t("biz.edit")}
                    icon={<EditOutlined />}
                    onClick={() => setEditor(o)}
                  />
                </Tooltip>
              )}
              <Button size="small" icon={<FileExcelOutlined />} disabled>
                {t("biz.exportOrderExcel")}
              </Button>
              <Button
                size="small"
                icon={<FilePdfOutlined />}
                onClick={() => setDocument({ orderId: o.id, kind: "contract" })}
              >
                {t("biz.exportContract")}
              </Button>
              <Button
                size="small"
                icon={<FileDoneOutlined />}
                onClick={() => setDocument({ orderId: o.id, kind: "invoice" })}
              >
                {t("biz.issueInvoice")}
              </Button>
            </Space>
          )}
          {!settlements && <Status value={o.state} />}
        </div>
      ),
    },
  ];
  const openNewOrder = () => {
    setNewOrderOpen(true);
    setActiveTab("new-order");
  };
  const closeNewOrder = () => {
    setNewOrderOpen(false);
    setActiveTab("list");
  };
  const requestCloseNewOrder = () => {
    Modal.confirm({
      title: t("biz.unsavedOrderTitle"),
      content: t("biz.unsavedOrderHint"),
      okText: t("biz.discardChanges"),
      cancelText: t("biz.continueEditing"),
      okButtonProps: { danger: true },
      onOk: closeNewOrder,
    });
  };
  return (
    <>
      {!settlements && (
        <Tabs
          className="order-workspace-tabs"
          type="editable-card"
          hideAdd
          activeKey={activeTab}
          onChange={setActiveTab}
          onEdit={(key, action) => {
            if (action === "remove" && key === "new-order") requestCloseNewOrder();
          }}
          items={[
            { key: "list", label: t("biz.orders"), closable: false },
            ...(newOrderOpen
              ? [{ key: "new-order", label: t("biz.createOrder"), closable: true }]
              : []),
          ]}
        />
      )}
      <div hidden={!settlements && activeTab !== "list"}>
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
              }}
            >
              {t("biz.reset")}
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <div className="business-toolbar">
        {!settlements && (
          <Button type="primary" onClick={openNewOrder}>
            {t("biz.createOrder")}
          </Button>
        )}
      </div>
      <ErrorBox error={r.error} retry={r.refresh} />
      <Table<Order>
        rowKey="id"
        loading={r.loading}
        dataSource={r.data?.results}
        columns={columns}
        scroll={{ x: 2600 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: r.data?.count,
          showSizeChanger: false,
          onChange: (value) => {
            setPage(value);
          },
        }}
      />
      </div>
      {!settlements && newOrderOpen && (
        <div hidden={activeTab !== "new-order"}>
          <OrderEditor
            embedded
            onClose={closeNewOrder}
            onSaved={(saved) => {
              refresh();
              closeNewOrder();
              setDetail(saved);
            }}
          />
        </div>
      )}
      {editor && (
        <OrderEditor
          order={editor}
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
      {document && (
        <DocumentEditor
          {...document}
          onClose={() => setDocument(null)}
        />
      )}
    </>
  );
}
