import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tooltip,
  Upload,
} from "antd";
import {
  DownOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  UploadOutlined,
  UpOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { uploadApi } from "../api";
import { ErrorBox } from "../components";
import {
  cash,
  downloadOrdersExcel,
  Metrics,
  query,
  Status,
  useResource,
} from "./shared";
import { OrderDetail, OrderEditor, SettlementEditor } from "./OrderForms";
import { DocumentEditor, type DocumentKind } from "./DocumentEditor";
import { EmailSender } from "./EmailSender";
import type { Order, OrderList } from "./types";

const ORDER_WORKSPACE_KEY = "marine-order-workspace";
const NEW_ORDER_DRAFT_KEY = "marine-order-draft-new";

type SavedOrderWorkspace = {
  activeTab?: string;
  newOrderOpen?: boolean;
  detail?: Order | null;
  editor?: Order | null;
};

type OrderImportResult = {
  summary: {
    total: number;
    ready: number;
    duplicate: number;
    invalid: number;
    line_count: number;
    orphan_lines: number;
  };
  rows: Array<{
    number: string;
    result: "ready" | "duplicate" | "invalid";
    errors: string[];
    line_count: number;
  }>;
  created?: number;
};

function savedOrderWorkspace(): SavedOrderWorkspace {
  try {
    return JSON.parse(sessionStorage.getItem(ORDER_WORKSPACE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export default function Orders({
  settlements = false,
}: {
  settlements?: boolean;
}) {
  const { t } = useTranslation();
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const [filters, setFilters] = useState<Record<string, unknown>>(
      settlements ? { state: "financial" } : {},
    ),
    [page, setPage] = useState(1),
    [ordering, setOrdering] = useState("-id");
  const [filterForm] = Form.useForm();
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    settlements ? "list" : savedOrderWorkspace().activeTab || "list",
  );
  const [newOrderOpen, setNewOrderOpen] = useState(() =>
    settlements ? false : Boolean(savedOrderWorkspace().newOrderOpen),
  );
  const [exportError, setExportError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<OrderImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [documentRevision, setDocumentRevision] = useState(0);
  const r = useResource<OrderList>(
    "trading/orders/?" + query({ ...filters, page, ordering }),
  );
  const [editor, setEditor] = useState<Order | null>(() =>
      settlements ? null : savedOrderWorkspace().editor || null,
    ),
    [payment, setPayment] = useState<{ order: Order; refund: boolean } | null>(
      null,
    ),
    [detail, setDetail] = useState<Order | null>(() =>
      settlements ? null : savedOrderWorkspace().detail || null,
    ),
    [document, setDocument] = useState<{
      orderId: number;
      kind: DocumentKind;
    } | null>(null),
    [emailDocument, setEmailDocument] = useState<{
      orderId: number;
      kind: DocumentKind;
    } | null>(null);
  useEffect(() => {
    if (settlements) return;
    sessionStorage.setItem(
      ORDER_WORKSPACE_KEY,
      JSON.stringify({ activeTab, newOrderOpen, detail, editor }),
    );
  }, [activeTab, detail, editor, newOrderOpen, settlements]);
  const refresh = () => {
    r.refresh();
  };
  const inspectImport = async (file: File) => {
    setImportFile(file);
    setImportPreview(null);
    setImportError("");
    setImportBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      setImportPreview(await uploadApi<OrderImportResult>("trading/orders/import/", data));
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImportBusy(false);
    }
  };
  const confirmImport = async () => {
    if (!importFile || !importPreview?.summary.ready) return;
    setImportBusy(true);
    setImportError("");
    try {
      const data = new FormData();
      data.append("file", importFile);
      data.append("confirm", "true");
      const result = await uploadApi<OrderImportResult>("trading/orders/import/", data);
      message.success(t("biz.orderImportCreated", { count: result.created || 0 }));
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      refresh();
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImportBusy(false);
    }
  };
  const actionColumn: ColumnsType<Order>[number] = {
    title: t("biz.action"),
    width: settlements ? 230 : 110,
    render: (_: unknown, o: Order) => (
      <div className="order-row-actions">
        {settlements ? (
          ["confirmed", "supplied", "completed"].includes(o.state) && (
            <Space size={6}>
              <Button size="small" type="primary" disabled={!['admin', 'finance'].includes(user?.role || '')} onClick={() => setPayment({ order: o, refund: false })}>
                {t("biz.recordPayment")}
              </Button>
              <Button size="small" disabled={!['admin', 'finance'].includes(user?.role || '')} onClick={() => setPayment({ order: o, refund: true })}>
                {t("biz.refundAction")}
              </Button>
            </Space>
          )
        ) : (
          <Space size={6}>
            <Tooltip title={t("biz.exportContract")}>
              <span>
                <Dropdown
                  disabled={o.state === "void"}
                  menu={{
                    items: [
                      { key: "sales_contract", label: t("biz.salesContract") },
                      { key: "purchase_contract", label: t("biz.purchaseContract") },
                    ],
                    onClick: ({ key }) => setDocument({ orderId: o.id, kind: key as DocumentKind }),
                  }}
                >
                  <Button className="order-action-button contract" size="small" disabled={o.state === "void"} aria-label={t("biz.exportContract")} icon={<FilePdfOutlined />} />
                </Dropdown>
              </span>
            </Tooltip>
            <Tooltip title={t("biz.issueInvoice")}>
              <span>
                <Button className="order-action-button invoice" size="small" disabled={o.state === "void"} aria-label={t("biz.issueInvoice")} icon={<FileDoneOutlined />} onClick={() => setDocument({ orderId: o.id, kind: "invoice" })} />
              </span>
            </Tooltip>
          </Space>
        )}
      </div>
    ),
  };
  const sharedColumns: ColumnsType<Order> = [
    {
      title: t("biz.number"),
      dataIndex: "number",
      key: "id",
      sorter: true,
      sortOrder:
        ordering === "id"
          ? "ascend"
          : ordering === "-id"
            ? "descend"
            : null,
      width: 175,
      render: (v: string, o: Order) => (
        <Button className="order-number-link" type="link" onClick={() => {
          setDetail(o);
          if (!settlements) setActiveTab("order-detail");
        }}>
          {v}
        </Button>
      ),
    },
    {
      title: t("biz.order_date"),
      dataIndex: "order_date",
      key: "order_date",
      width: 125,
      sorter: true,
      sortOrder:
        ordering === "order_date"
          ? "ascend"
          : ordering === "-order_date"
            ? "descend"
            : null,
    },
  ];
  const columns: ColumnsType<Order> = settlements
    ? [
        ...sharedColumns,
        ...["vessel", "customer", "supplier", "port"].map((key) => ({ title: t(`biz.${key}`), dataIndex: key, width: 145 })),
        {
          title: t("biz.oil"),
          width: 150,
          render: (_: unknown, o: Order) => o.lines.map((line) => line.oil).join(" / "),
        },
        ...["customer_deposit", "customer_received", "supplier_deposit", "supplier_paid", "receivable", "payable"].map((key) => ({
          title: t(`biz.${key}`),
          width: 160,
          render: (_: unknown, o: Order) => cash(o.numbers[key as keyof Order["numbers"]]),
        })),
        ...["customer_due", "supplier_due"].map((key) => ({
          title: t(`biz.${key}`),
          width: 130,
          render: (_: unknown, o: Order) => o.numbers[key as "customer_due" | "supplier_due"] || "—",
        })),
        ...["customer_status", "supplier_status"].map((key) => ({
          title: t(`biz.${key}`),
          width: 130,
          render: (_: unknown, o: Order) => <Status value={o.numbers[key as "customer_status" | "supplier_status"]} />,
        })),
        actionColumn,
      ]
    : [
        ...sharedColumns,
        {
          title: t("biz.vesselCustomer"),
          width: 220,
          render: (_: unknown, o: Order) => (
            <div className="order-primary-secondary">
              <strong>{o.vessel}</strong>
              <span>{o.customer}</span>
            </div>
          ),
        },
        ...(user?.role === "admin" ? [{ title: t("biz.salesperson"), dataIndex: "salesperson", width: 120, render: (value: string) => value || "—" }] : []),
    {
      title: t("biz.oil"),
          width: 180,
          render: (_: unknown, o: Order) => o.lines.map((line) => line.oil).join(", "),
    },
        ...["sales", "cost", ...(user?.role === "admin" ? ["profit"] : [])].map((key) => ({
      title: t(`biz.${key}`),
          width: 125,
          className: key === "profit" ? "order-profit-column" : undefined,
          render: (_: unknown, o: Order) => <strong>{cash(o.numbers[key as keyof Order["numbers"]])}</strong>,
    })),
        {
          title: t("biz.receivablePayable"),
          width: 145,
          render: (_: unknown, o: Order) => (
            <div className="order-stacked-values">
              <strong>{cash(o.numbers.receivable)}</strong>
              <span>{cash(o.numbers.payable)}</span>
            </div>
          ),
        },
        { title: t("biz.businessStatus"), width: 110, render: (_: unknown, o: Order) => <Status value={o.state} /> },
        {
          title: t("biz.receiptPaymentStatus"),
          width: 145,
          render: (_: unknown, o: Order) => (
            <div className="order-settlement-statuses">
              <span>{t("biz.receiptShort")}: <Status value={o.numbers.customer_status} /></span>
              <span>{t("biz.paymentShort")}: <Status value={o.numbers.supplier_status} /></span>
            </div>
          ),
        },
        actionColumn,
      ];
  const openNewOrder = () => {
    setNewOrderOpen(true);
    setActiveTab("new-order");
  };
  const closeNewOrder = () => {
    sessionStorage.removeItem(NEW_ORDER_DRAFT_KEY);
    setNewOrderOpen(false);
    setActiveTab("list");
  };
  const requestCloseNewOrder = () => {
    modal.confirm({
      title: t("biz.unsavedOrderTitle"),
      content: t("biz.unsavedOrderHint"),
      okText: t("biz.discardChanges"),
      cancelText: t("biz.continueEditing"),
      okButtonProps: { danger: true },
      onOk: closeNewOrder,
    });
  };
  const closeOrderEditor = () => {
    if (editor) sessionStorage.removeItem(`marine-order-draft-${editor.id}`);
    setEditor(null);
    setActiveTab(detail ? "order-detail" : "list");
  };
  const requestCloseOrderEditor = () => {
    modal.confirm({
      title: t("biz.unsavedOrderTitle"),
      content: t("biz.unsavedOrderHint"),
      okText: t("biz.discardChanges"),
      cancelText: t("biz.continueEditing"),
      okButtonProps: { danger: true },
      onOk: closeOrderEditor,
    });
  };
  const closeOrderDetail = () => {
    setDetail(null);
    if (activeTab === "order-detail") setActiveTab("list");
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
          onEdit={(targetKey, action) => {
            if (action !== "remove") return;
            if (targetKey === "new-order") requestCloseNewOrder();
            if (targetKey === "edit-order") requestCloseOrderEditor();
            if (targetKey === "order-detail") closeOrderDetail();
          }}
          items={[
            { key: "list", label: t("biz.orders"), closable: false },
            ...(newOrderOpen
              ? [{ key: "new-order", label: t("biz.createOrder"), closable: true }]
              : []),
            ...(detail
              ? [{
                  key: "order-detail",
                  label: `${t("biz.detail")} · ${detail.number}`,
                  closable: true,
                }]
              : []),
            ...(editor
              ? [{
                  key: "edit-order",
                  label: `${t("biz.edit")} · ${editor.number}`,
                  closable: true,
                }]
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
                  ...(user?.role === "admin" ? ["commission", "profit"] : []),
                ]
          }
        />
      )}
      <Card>
        <Form
          form={filterForm}
          layout="vertical"
          className="business-filters"
          initialValues={settlements ? { state: "financial" } : {}}
          onFinish={(values) => {
            setFilters(values);
            setPage(1);
          }}
        >
          <div className="order-filter-basic">
            <Form.Item
              className="order-filter-search"
              name="q"
              label={t("biz.query")}
            >
              <Input allowClear placeholder={t("biz.orderSearchPlaceholder")} />
            </Form.Item>
            {["date_from", "date_to"].map((key) => (
              <Form.Item
                className="order-filter-date"
                key={key}
                name={key}
                label={t(`biz.${key}`)}
              >
                <Input type="date" />
              </Form.Item>
            ))}
            {user?.role === "admin" && (
              <Form.Item
                className="order-filter-salesperson"
                name="salesperson"
                label={t("biz.salesperson")}
              >
                <Input allowClear />
              </Form.Item>
            )}
            <Form.Item
              className="order-filter-state"
              name="state"
              label={t("biz.orderStatus")}
            >
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
            <Form.Item>
              <Button htmlType="submit" type="primary">
                {t("biz.filter")}
              </Button>
            </Form.Item>
            <Form.Item>
              <Tooltip title={t("biz.reset")}>
                <Button
                  aria-label={t("biz.reset")}
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    filterForm.resetFields();
                    filterForm.setFieldValue(
                      "state",
                      settlements ? "financial" : undefined,
                    );
                    setFilters(settlements ? { state: "financial" } : {});
                    setPage(1);
                  }}
                />
              </Tooltip>
            </Form.Item>
            <Form.Item>
              <Button
                type="link"
                icon={advancedFiltersOpen ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setAdvancedFiltersOpen((open) => !open)}
              >
                {t(
                  advancedFiltersOpen
                    ? "biz.hideAdvancedFilters"
                    : "biz.advancedFilters",
                )}
              </Button>
            </Form.Item>
          </div>
          <div className="order-filter-advanced" hidden={!advancedFiltersOpen}>
            {["customer", "supplier", "port", "oil"].map(
              (key) => (
                <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
                  <Input allowClear />
                </Form.Item>
              ),
            )}
            {["customer_status", "supplier_status"].map((key) => (
              <Form.Item key={key} name={key} label={t(`biz.${key}`)}>
                <Select
                  allowClear
                  style={{ width: 140 }}
                  options={["pending", "not_due", "partial", "overdue", "settled"].map(
                    (value) => ({ value, label: t(`biz.${value}`) }),
                  )}
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
          </div>
        </Form>
      </Card>
      <div className="business-toolbar">
        {!settlements && (
          <>
            <Button type="primary" onClick={openNewOrder}>
              {t("biz.createOrder")}
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={async () => {
                setExportError("");
                try {
                  await downloadOrdersExcel(filters);
                } catch (error) {
                  setExportError((error as Error).message);
                }
              }}
            >
              {t("biz.exportOrderExcel")}
            </Button>
            {user?.role === "admin" && (
              <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
                {t("biz.importOrders")}
              </Button>
            )}
          </>
        )}
      </div>
      <ErrorBox error={r.error || exportError} retry={r.refresh} />
      <Table<Order>
        className="orders-table"
        rowKey="id"
        loading={r.loading}
        dataSource={r.data?.results}
        columns={columns}
        scroll={{ x: settlements ? 2600 : 1600 }}
        rowClassName={(row) => row.state === "void" ? "order-row-void" : ""}
        onChange={(_pagination, _tableFilters, sorter) => {
          const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
          const field = String(activeSorter.columnKey || activeSorter.field || "");
          let nextOrdering = ordering;
          if (!activeSorter.order) {
            nextOrdering = "-id";
          } else if (field === "id" || field === "order_date") {
            nextOrdering = `${activeSorter.order === "descend" ? "-" : ""}${field}`;
          }
          if (nextOrdering !== ordering) {
            setOrdering(nextOrdering);
            setPage(1);
          }
        }}
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
            storageKey={NEW_ORDER_DRAFT_KEY}
            onClose={closeNewOrder}
            onSaved={(saved) => {
              refresh();
              setNewOrderOpen(false);
              setDetail(saved);
              setActiveTab("order-detail");
            }}
          />
        </div>
      )}
      {editor && !settlements && (
        <div hidden={activeTab !== "edit-order"}>
          <OrderEditor
            embedded
            order={editor}
            storageKey={`marine-order-draft-${editor.id}`}
            onClose={closeOrderEditor}
            onSaved={(saved) => {
              refresh();
              setEditor(null);
              setDetail(saved);
              setActiveTab("order-detail");
            }}
          />
        </div>
      )}
      {editor && settlements && (
        <OrderEditor
          order={editor}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            refresh();
            setEditor(null);
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
      {detail && !settlements && (
        <div hidden={activeTab !== "order-detail"}>
          <OrderDetail
            key={`${detail.id}-${detail.version}-${documentRevision}`}
            embedded
            order={detail}
            onClose={closeOrderDetail}
            onEdit={(current) => {
              setEditor(current);
              setActiveTab("edit-order");
            }}
            onChanged={(updated) => {
              setDetail(updated);
              refresh();
            }}
            onDocumentEdit={(kind) =>
              setDocument({ orderId: detail.id, kind })
            }
            onDocumentSend={(kind) =>
              setEmailDocument({ orderId: detail.id, kind })
            }
          />
        </div>
      )}
      {detail && settlements && (
        <OrderDetail
          key={`${detail.id}-${detail.version}-${documentRevision}`}
          order={detail}
          onClose={() => setDetail(null)}
          onEdit={(current) => setEditor(current)}
          onChanged={(updated) => {
            setDetail(updated);
            refresh();
          }}
          onDocumentEdit={(kind) =>
            setDocument({ orderId: detail.id, kind })
          }
          onDocumentSend={(kind) =>
            setEmailDocument({ orderId: detail.id, kind })
          }
        />
      )}
      {document && (
        <DocumentEditor
          {...document}
          onClose={() => setDocument(null)}
          onSaved={() => setDocumentRevision((value) => value + 1)}
        />
      )}
      {emailDocument && (
        <EmailSender
          {...emailDocument}
          onClose={() => setEmailDocument(null)}
          onSent={() => setDocumentRevision((value) => value + 1)}
        />
      )}
      <Modal
        open={importOpen}
        width={760}
        title={t("biz.importOrders")}
        okText={t("biz.confirmImport")}
        cancelText={t("biz.cancel")}
        confirmLoading={importBusy}
        okButtonProps={{ disabled: !importPreview?.summary.ready }}
        onOk={confirmImport}
        onCancel={() => {
          if (importBusy) return;
          setImportOpen(false);
          setImportFile(null);
          setImportPreview(null);
          setImportError("");
        }}
      >
        <Alert type="info" showIcon message={t("biz.orderImportHint")} />
        <Upload
          accept=".xlsx"
          maxCount={1}
          showUploadList
          beforeUpload={(file) => {
            void inspectImport(file);
            return false;
          }}
          onRemove={() => {
            setImportFile(null);
            setImportPreview(null);
          }}
        >
          <Button loading={importBusy} icon={<UploadOutlined />} style={{ marginTop: 16 }}>
            {t("biz.selectOrderWorkbook")}
          </Button>
        </Upload>
        <ErrorBox error={importError} />
        {importPreview && (
          <>
            <Alert
              style={{ margin: "16px 0" }}
              type={importPreview.summary.invalid ? "warning" : "success"}
              message={t("biz.orderImportSummary", importPreview.summary)}
              description={importPreview.summary.orphan_lines ? t("biz.orderImportOrphans", { count: importPreview.summary.orphan_lines }) : undefined}
            />
            <Table
              size="small"
              rowKey={(row) => `${row.number}-${row.result}`}
              pagination={{ pageSize: 8 }}
              dataSource={importPreview.rows}
              columns={[
                { title: t("biz.number"), dataIndex: "number" },
                { title: t("biz.productDetails"), dataIndex: "line_count", width: 100 },
                { title: t("biz.importResult"), dataIndex: "result", width: 120, render: (value: string) => t(`biz.import_${value}`) },
                { title: t("biz.importIssues"), dataIndex: "errors", render: (values: string[]) => values.length ? values.map((value) => t(`biz.${value}`)).join("；") : "—" },
              ]}
            />
          </>
        )}
      </Modal>
    </>
  );
}
