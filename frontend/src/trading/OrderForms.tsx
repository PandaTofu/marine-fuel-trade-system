import { useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Upload,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SendOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { api, uploadApi } from "../api";
import { ErrorBox, Language } from "../components";
import { useLocaleValidation } from "../useLocaleValidation";
import {
  AccountField,
  cash,
  CommandErrors,
  MoneyInput,
  ReferenceInput,
  Status,
  today,
  useCommand,
  useResource,
  downloadOrderDocument,
} from "./shared";
import type { DocumentKind, DocumentResponse } from "./DocumentEditor";
import {
  components,
  type Order,
  type Revision,
  type LedgerList,
  type Entry,
  type OrderAttachment,
  type OrderAttachmentKind,
} from "./types";

export function OrderEditor({
  order,
  onClose,
  onSaved,
  embedded = false,
  storageKey,
}: {
  order?: Order;
  onClose: () => void;
  onSaved: (saved: Order) => void;
  embedded?: boolean;
  storageKey?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const cmd = useCommand();
  const required = [{ required: true, message: t("required") }];
  const referenceField: Record<string, string> = {
    customer: "customer_reference",
    supplier: "supplier_reference",
    port: "port_reference",
    salesperson: "salesperson_reference",
  };
  const input = (key: string, requiredField = false) => (
    <Form.Item
      key={key}
      name={key}
      label={t(`biz.${key}`)}
      rules={requiredField ? required : []}
    >
      {referenceField[key] ? (
        <ReferenceInput
          kind={key}
          onReferenceChange={(id) =>
            form.setFieldValue(referenceField[key], id)
          }
        />
      ) : (
        <Input maxLength={key === "imo" ? 40 : 160} />
      )}
    </Form.Item>
  );
  const values = Form.useWatch([], form) || {};
  const scaled = (value: unknown, scale: number) => {
    const match = String(value ?? "0").match(/^(\d*)(?:\.(\d*))?$/);
    if (!match) return 0n;
    return BigInt(
      (match[1] || "0") + (match[2] || "").padEnd(scale, "0").slice(0, scale),
    );
  };
  const multiplyToCents = (
    left: unknown,
    leftScale: number,
    right: unknown,
    rightScale: number,
  ) => {
    const product = scaled(left, leftScale) * scaled(right, rightScale);
    const divisor = 10n ** BigInt(leftScale + rightScale - 2);
    return (product + divisor / 2n) / divisor;
  };
  const cents = (value: unknown) => scaled(value, 2);
  const moneyText = (value: bigint) =>
    `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, "0")}`;
  const quantityText = (value: bigint) =>
    `${value / 1000n}.${String(value % 1000n).padStart(3, "0")}`;
  const calculated = (value: bigint, danger = false) => (
    <Tooltip title={cash(moneyText(value))}>
      <span className={`calculated-value${danger ? " danger" : ""}`}>
        {cash(moneyText(value))}
      </span>
    </Tooltip>
  );
  const productLabel = (label: string, unit?: string) => (
    <span className="product-field-label">
      <span>{label}</span>
      <small>{unit || "\u00a0"}</small>
    </span>
  );
  const num = (value: unknown) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const lines = (values.lines || []) as Array<Record<string, unknown>>;
  const lineAmounts = lines.map((line) => ({
    sale: multiplyToCents(line.actual_qty, 3, line.sale_price, 4),
    cost: multiplyToCents(line.actual_qty, 3, line.cost_price, 4),
  }));
  const totals = lineAmounts.reduce<{
    orderedMin: bigint;
    orderedMax: bigint;
    actual: bigint;
    sale: bigint;
    cost: bigint;
  }>(
    (result, line, index) => ({
      orderedMin: result.orderedMin + scaled(lines[index]?.ordered_qty_min, 3),
      orderedMax: result.orderedMax + scaled(lines[index]?.ordered_qty_max, 3),
      actual: result.actual + scaled(lines[index]?.actual_qty, 3),
      sale: result.sale + line.sale,
      cost: result.cost + line.cost,
    }),
    { orderedMin: 0n, orderedMax: 0n, actual: 0n, sale: 0n, cost: 0n },
  );
  const commission = multiplyToCents(
    quantityText(totals.actual),
    3,
    values.commission_rate,
    4,
  );
  const payable =
    totals.cost - cents(values.supplier_deposit) - cents(values.supplier_paid);
  const receivable =
    totals.sale -
    cents(values.customer_deposit) -
    cents(values.customer_received) -
    cents(order?.customer_fee);
  const otherFees =
    cents(order?.customer_fee) +
    cents(order?.supplier_fee) +
    cents(values.berth_fee) +
    cents(values.exceptional_fee);
  const actualProfit = totals.sale - totals.cost - commission - otherFees;
  const due = (days: unknown) => {
    if (!values.actual_date) return "—";
    const date = new Date(`${values.actual_date}T00:00:00`);
    date.setDate(date.getDate() + Math.max(num(days) - 1, 0));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const section = (title: string, content: ReactNode) => (
    <section className="order-section">
      <h3>{title}</h3>
      {content}
    </section>
  );
  const defaultValues = order
    ? {
        ...order,
        ...order.numbers,
        order_state: order.state,
        estimated_range:
          order.estimated_start_date && order.estimated_end_date
            ? [
                dayjs(order.estimated_start_date),
                dayjs(order.estimated_end_date),
              ]
            : undefined,
      }
    : {
        order_date: today(),
        order_state: "draft",
        customer_reference: null,
        supplier_reference: null,
        port_reference: null,
        salesperson_reference: null,
        customer_term_description: "",
        supplier_term_description: "",
        customer_term: 0,
        supplier_term: 0,
        commission_rate: "0",
        berth_fee: "0",
        exceptional_fee: "0",
        lines: [
          {
            oil: "",
            oil_reference: null,
            ordered_qty_min: "0",
            ordered_qty_max: "0",
            actual_qty: null,
            sale_price: "0",
            cost_price: "0",
          },
        ],
      };
  const initialValues = (() => {
    if (!storageKey) return defaultValues;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (!saved) return defaultValues;
      return {
        ...defaultValues,
        ...saved,
        estimated_range: saved.estimated_range?.map((value: string) =>
          dayjs(value),
        ),
      };
    } catch {
      return defaultValues;
    }
  })();
  const requestClose = () => {
    if (cmd.busy) return;
    if (!form.isFieldsTouched()) {
      onClose();
      return;
    }
    Modal.confirm({
      title: t("biz.unsavedOrderTitle"),
      content: t("biz.unsavedOrderHint"),
      okText: t("biz.discardChanges"),
      cancelText: t("biz.continueEditing"),
      okButtonProps: { danger: true },
      onOk: onClose,
    });
  };
  const editorContent = (
    <>
      <Alert
        type="info"
        message={t("biz.freeInput")}
        description={t("biz.pendingHint")}
      />
      <CommandErrors command={cmd} />
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onValuesChange={(_, allValues) => {
          if (!storageKey) return;
          const storedValues = {
            ...allValues,
            estimated_range: allValues.estimated_range?.map(
              (value: { format: (pattern: string) => string } | null) =>
                value?.format("YYYY-MM-DD") || null,
            ),
          };
          sessionStorage.setItem(storageKey, JSON.stringify(storedValues));
        }}
        onFinish={async (values) => {
          const {
            estimated_range,
            order_state,
            customer_deposit,
            customer_received,
            supplier_deposit,
            supplier_paid,
            account_id,
            customer_fee,
            supplier_fee,
            ...fields
          } = values;
          void customer_deposit;
          void customer_received;
          void supplier_deposit;
          void supplier_paid;
          void account_id;
          void customer_fee;
          void supplier_fee;
          const payload = {
            ...fields,
            currency: "USD",
            estimated_start_date:
              estimated_range?.[0]?.format("YYYY-MM-DD") || null,
            estimated_end_date:
              estimated_range?.[1]?.format("YYYY-MM-DD") || null,
            actual_date: values.actual_date || null,
            version: order?.version,
            save_as_draft: order_state === "draft",
            desired_state: order_state,
            lines: values.lines.map((line: Record<string, unknown>) => ({
              oil: line.oil,
              oil_reference: line.oil_reference || null,
              ordered_qty_min: line.ordered_qty_min,
              ordered_qty_max: line.ordered_qty_max,
              actual_qty:
                line.actual_qty === "" || line.actual_qty === undefined
                  ? null
                  : line.actual_qty,
              sale_price: line.sale_price,
              cost_price: line.cost_price,
            })),
          };
          try {
            const saved = await cmd.send<Order>(
              `trading/orders/${order ? order.id + "/" : ""}`,
              payload,
              order ? "PATCH" : "POST",
            );
            if (storageKey) sessionStorage.removeItem(storageKey);
            onSaved(saved);
          } catch {
            /* ErrorBox preserves form for correction. */
          }
        }}
      >
        {Object.values(referenceField).map((key) => (
          <Form.Item key={key} name={key} hidden>
            <Input />
          </Form.Item>
        ))}
        <div className="order-editor-layout">
          <div className="order-editor-main">
            {section(
              t("biz.basicInformation"),
              <div className="basic-information-layout">
                <div className="business-form-grid adaptive basic-information-row">
                  <Form.Item
                    name="order_date"
                    label={t("biz.order_date")}
                    rules={required}
                  >
                    <Input type="date" />
                  </Form.Item>
                  {input("customer", true)}
                  {input("supplier", true)}
                </div>
                <div className="business-form-grid adaptive basic-information-row">
                  {input("vessel", true)}
                  {input("port", true)}
                  {input("imo")}
                </div>
              </div>,
            )}
            {section(
              t("biz.productDetails"),
              <>
                <Form.List
                  name="lines"
                  rules={[
                    {
                      validator: (_, rows) =>
                        rows?.length
                          ? Promise.resolve()
                          : Promise.reject(new Error(t("required"))),
                    },
                  ]}
                >
                  {(fields, { add, remove }, meta) => (
                    <>
                      <div className="order-lines">
                        <div className="order-line-header">
                          <div className="required-column">
                            {productLabel(t("biz.oilName"))}
                          </div>
                          <div className="required-column">
                            {productLabel(t("biz.orderQuantity"), "MT")}
                          </div>
                          <div>
                            {productLabel(t("biz.actualQuantity"), "MT")}
                          </div>
                          <div className="required-column">
                            {productLabel(t("biz.saleUnitPrice"), "USD/MT")}
                          </div>
                          <div>{productLabel(t("biz.saleAmount"), "USD")}</div>
                          <div className="required-column">
                            {productLabel(t("biz.supplierCostPrice"), "USD/MT")}
                          </div>
                          <div>
                            {productLabel(t("biz.supplierCostAmount"), "USD")}
                          </div>
                          <div />
                        </div>
                        {fields.map((field, index) => (
                          <div className="order-line" key={field.key}>
                            <Form.Item
                              name={[field.name, "oil_reference"]}
                              hidden
                            >
                              <Input />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "oil"]}
                              rules={required}
                            >
                              <ReferenceInput
                                kind="oil"
                                onReferenceChange={(id) =>
                                  form.setFieldValue(
                                    ["lines", field.name, "oil_reference"],
                                    id,
                                  )
                                }
                              />
                            </Form.Item>
                            <Form.Item>
                              <div className="quantity-range-inputs">
                                <Form.Item
                                  name={[field.name, "ordered_qty_min"]}
                                  noStyle
                                  rules={required}
                                >
                                  <MoneyInput
                                    compact
                                    precision={3}
                                    placeholder={t("biz.minimum")}
                                  />
                                </Form.Item>
                                <span>–</span>
                                <Form.Item
                                  name={[field.name, "ordered_qty_max"]}
                                  noStyle
                                  dependencies={[
                                    ["lines", field.name, "ordered_qty_min"],
                                  ]}
                                  rules={[
                                    ...required,
                                    ({ getFieldValue }) => ({
                                      validator(_, value) {
                                        const minimum = getFieldValue([
                                          "lines",
                                          field.name,
                                          "ordered_qty_min",
                                        ]);
                                        return value == null ||
                                          minimum == null ||
                                          scaled(value, 3) >= scaled(minimum, 3)
                                          ? Promise.resolve()
                                          : Promise.reject(
                                              new Error(
                                                t(
                                                  "errors.ordered_quantity_range",
                                                ),
                                              ),
                                            );
                                      },
                                    }),
                                  ]}
                                >
                                  <MoneyInput
                                    compact
                                    precision={3}
                                    placeholder={t("biz.maximum")}
                                  />
                                </Form.Item>
                              </div>
                            </Form.Item>
                            <Form.Item name={[field.name, "actual_qty"]}>
                              <MoneyInput compact precision={3} />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "sale_price"]}
                              rules={required}
                            >
                              <MoneyInput compact precision={4} />
                            </Form.Item>
                            <Form.Item>
                              {calculated(lineAmounts[index]?.sale || 0n)}
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "cost_price"]}
                              rules={required}
                            >
                              <MoneyInput compact precision={4} />
                            </Form.Item>
                            <Form.Item>
                              {calculated(lineAmounts[index]?.cost || 0n, true)}
                            </Form.Item>
                            <Tooltip title={t("biz.removeLine")}>
                              <Button
                                className="order-line-delete"
                                type="text"
                                danger
                                aria-label={t("biz.removeLine")}
                                icon={<DeleteOutlined />}
                                disabled={fields.length === 1}
                                onClick={() => remove(field.name)}
                              />
                            </Tooltip>
                          </div>
                        ))}
                        <div className="order-total-row">
                          <strong>{t("biz.total")}</strong>
                          <Tooltip
                            title={`${quantityText(totals.orderedMin)}–${quantityText(totals.orderedMax)} MT`}
                          >
                            <span>
                              {quantityText(totals.orderedMin)}–
                              {quantityText(totals.orderedMax)} MT
                            </span>
                          </Tooltip>
                          <Tooltip title={`${quantityText(totals.actual)} MT`}>
                            <span>
                              {quantityText(totals.actual)} MT
                            </span>
                          </Tooltip>
                          <span />
                          {calculated(totals.sale)}
                          <span />
                          {calculated(totals.cost, true)}
                          <span />
                        </div>
                      </div>
                      <Form.ErrorList errors={meta.errors} />
                      <Button
                        icon={<PlusOutlined />}
                        disabled={fields.length >= 100}
                        onClick={() =>
                          add({
                            oil: "",
                            oil_reference: null,
                            ordered_qty_min: "0",
                            ordered_qty_max: "0",
                            actual_qty: null,
                            sale_price: "0",
                            cost_price: "0",
                          })
                        }
                      >
                        {t("biz.addLine")}
                      </Button>
                    </>
                  )}
                </Form.List>
              </>,
            )}
            {section(
              t("biz.supplyInformation"),
              <div className="business-form-grid adaptive">
                <Form.Item
                  name="estimated_range"
                  label={t("biz.estimatedSupplyRange")}
                >
                  <DatePicker.RangePicker
                    className="supply-range-picker"
                    format="YYYY-MM-DD"
                    placeholder={[
                      t("biz.estimatedSupplyStart"),
                      t("biz.estimatedSupplyEnd"),
                    ]}
                  />
                </Form.Item>
                <Form.Item name="actual_date" label={t("biz.actualSupplyDate")}>
                  <Input type="date" />
                </Form.Item>
              </div>,
            )}
            <div className="order-two-columns">
              {section(
                t("biz.supplierPayment"),
                <div className="business-form-grid compact">
                  <Form.Item
                    name="supplier_term"
                    label={t("biz.paymentDays")}
                    rules={required}
                  >
                    <InputNumber min={0} max={32767} precision={0} />
                  </Form.Item>
                  {input("supplier_term_description")}
                </div>,
              )}
              {section(
                t("biz.customerReceipt"),
                <div className="business-form-grid compact">
                  <Form.Item
                    name="customer_term"
                    label={t("biz.paymentDays")}
                    rules={required}
                  >
                    <InputNumber min={0} max={32767} precision={0} />
                  </Form.Item>
                  {input("customer_term_description")}
                </div>,
              )}
            </div>
            {section(
              t("biz.otherFees"),
              <div className="business-form-grid adaptive">
                {[
                  "berth_fee",
                  "exceptional_fee",
                ].map((key) => (
                  <Form.Item
                    key={key}
                    name={key}
                    label={t(`biz.${key}`)}
                    rules={required}
                  >
                    <MoneyInput />
                  </Form.Item>
                ))}
              </div>,
            )}
            {user?.role === "admin" && section(
              t("biz.performanceCommission"),
              <div className="business-form-grid commission-fields">
                {input("salesperson")}
                {input("commission_recipient")}
                <Form.Item
                  name="commission_rate"
                  label={t("biz.customerCommissionRate")}
                  rules={required}
                >
                  <MoneyInput compact precision={4} />
                </Form.Item>
              </div>,
            )}
            {section(
              t("biz.note"),
              <Form.Item name="note" noStyle>
                <Input.TextArea rows={4} maxLength={2000} />
              </Form.Item>,
            )}
            {order && (
              <Form.Item
                name="reason"
                label={t("biz.reason")}
                extra={t("biz.orderEditHint")}
                rules={values.order_state === "void" ? required : undefined}
              >
                <Input.TextArea maxLength={1000} />
              </Form.Item>
            )}
          </div>
          <aside className="order-summary-card">
            <div className="order-summary-title">
              <span>{t("biz.orderSummary")}</span>
              <small>USD</small>
            </div>
            {user?.role === "admin" && <div className="order-summary-profit">
              <span>{t("biz.actualProfit")}</span>
              <strong className={actualProfit < 0n ? "negative" : "positive"}>
                {cash(moneyText(actualProfit))}
              </strong>
              <small>{t("biz.actualProfitFormula")}</small>
            </div>}
            <div className="order-summary-group">
              <h4>{t("biz.revenueAndCost")}</h4>
              {[
                [t("biz.sales"), totals.sale, ""],
                [t("biz.cost"), totals.cost, "danger"],
                [t("biz.commissionTotal"), commission, ""],
                [t("biz.otherFees"), otherFees, ""],
              ].filter(([label]) => user?.role === "admin" || label !== t("biz.commissionTotal")).map(([label, value, tone]) => (
                <div className="order-summary-row" key={String(label)}>
                  <span>{String(label)}</span>
                  <strong className={String(tone)}>
                    {cash(moneyText(value as bigint))}
                  </strong>
                </div>
              ))}
            </div>
            <div className="order-summary-group">
              <h4>{t("biz.settlementBalance")}</h4>
              {[
                [t("biz.remainingReceivable"), receivable],
                [t("biz.remainingPayable"), payable],
              ].map(([label, value]) => (
                <div className="order-summary-row" key={String(label)}>
                  <span>{String(label)}</span>
                  <Tooltip title={cash(moneyText(value as bigint))}>
                    <strong className="danger">
                      {cash(moneyText(value as bigint))}
                    </strong>
                  </Tooltip>
                </div>
              ))}
            </div>
            <div className="order-summary-group">
              <h4>{t("biz.keyDates")}</h4>
              <div className="order-summary-row">
                <span>{t("biz.receiptDueDate")}</span>
                <strong className="date">{due(values.customer_term)}</strong>
              </div>
              <div className="order-summary-row">
                <span>{t("biz.paymentDueDate")}</span>
                <strong className="date">{due(values.supplier_term)}</strong>
              </div>
            </div>
          </aside>
        </div>
        <div className="order-save-bar">
          <Form.Item
            name="order_state"
            label={t("biz.orderStatus")}
            rules={required}
          >
            <Select
              disabled={order?.state === "void"}
              options={(
                order
                  ? Array.from(
                      new Set([
                        order.state,
                        ...(user?.role === "admin" ? ["void"] : []),
                      ]),
                    )
                  : ["draft", "confirmed"]
              ).map((value) => ({
                value,
                label: t(`biz.${value}`),
              }))}
            />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={cmd.busy}>
              {t("biz.save")}
            </Button>
            <span>{t("biz.saveThenPay")}</span>
          </Space>
        </div>
      </Form>
    </>
  );
  if (embedded) {
    return <div className="order-editor-page">{editorContent}</div>;
  }
  return (
    <Modal
      open
      width={1280}
      maskClosable={false}
      keyboard={false}
      title={
        <div className="order-modal-title">
          <Space>
            {t(order ? "biz.editOrder" : "biz.createOrder")}
            <Language />
          </Space>
        </div>
      }
      onCancel={requestClose}
      footer={null}
    >
      {editorContent}
    </Modal>
  );
}

export function SettlementEditor({
  order,
  refund = false,
  onClose,
  onSaved,
}: {
  order: Order;
  refund?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const cmd = useCommand();
  const required = [{ required: true, message: t("required") }];
  return (
    <Modal
      open
      width={760}
      title={
        <Space>
          {t(refund ? "biz.refundAction" : "biz.recordPayment")} ·{" "}
          {order.number}
          <Language />
        </Space>
      }
      onCancel={() => {
        if (!cmd.busy) onClose();
      }}
      footer={null}
    >
      <Alert
        type="info"
        message={t(refund ? "biz.refundHint" : "biz.settlementHint")}
      />
      <CommandErrors command={cmd} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          ...order.numbers,
          customer_fee_delta: "0",
          supplier_fee_delta: "0",
          berth_fee: order.berth_fee,
          exceptional_fee: order.exceptional_fee,
          date: today(),
        }}
        onFinish={async (values) => {
          try {
            await cmd.send(
              `trading/orders/${order.id}/${refund ? "refund" : "settlement"}/`,
              { ...values, version: order.version },
            );
            onSaved();
            onClose();
          } catch {
            /* Retain inputs. */
          }
        }}
      >
        <div className="business-form-grid">
          {refund ? (
            <>
              <Form.Item
                name="component"
                label={t("biz.component")}
                rules={required}
              >
                <Select
                  options={components.map((value) => ({
                    value,
                    label: t(`biz.${value}`),
                  }))}
                />
              </Form.Item>
              <Form.Item name="amount" label={t("biz.amount")} rules={required}>
                <MoneyInput />
              </Form.Item>
            </>
          ) : (
            <>
              {components.map((key) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={t(`biz.${key}`)}
                  rules={required}
                >
                  <MoneyInput />
                </Form.Item>
              ))}
              {[
                "customer_fee_delta",
                "supplier_fee_delta",
                "berth_fee",
                "exceptional_fee",
              ].map((key) => (
                <Form.Item
                  key={key}
                  name={key}
                  label={t(`biz.${key}`)}
                  rules={required}
                >
                  <MoneyInput />
                </Form.Item>
              ))}
              <Form.Item name="account_id" label={t("biz.account")}>
                <AccountField currency={order.currency} />
              </Form.Item>
            </>
          )}
          <Form.Item name="date" label={t("biz.date")} rules={required}>
            <Input type="date" max={today()} />
          </Form.Item>
        </div>
        <Form.Item
          name="reason"
          label={t("biz.reason")}
          rules={refund ? required : []}
        >
          <Input.TextArea maxLength={1000} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={cmd.busy}>
          {t("biz.save")}
        </Button>
      </Form>
    </Modal>
  );
}

function OrderPaymentEditor({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  useLocaleValidation(form);
  const cmd = useCommand();
  const action = Form.useWatch("payment_action", form) || "receipt";
  const required = [{ required: true, message: t("required") }];
  const addMoney = (left: string, right: unknown) => {
    const toCents = (value: unknown) => {
      const [whole = "0", fraction = ""] = String(value ?? 0).split(".");
      return (
        BigInt(whole || "0") * 100n +
        BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0")
      );
    };
    const total = toCents(left) + toCents(right);
    return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
  };
  const componentOptions = components
    .filter((value) =>
      value.startsWith(action === "receipt" ? "customer" : "supplier"),
    )
    .map((value) => ({ value, label: t(`biz.${value}`) }));
  const submit = async (values: Record<string, unknown>) => {
    try {
      let updated: Order;
      if (values.payment_action === "commission") {
        await cmd.send("trading/ledger/", {
          order_id: order.id,
          version: order.version,
          account_id: values.account_id,
          date: values.date,
          direction: "expense",
          category: "commission",
          amount: values.amount,
          reason: values.reason,
        });
        updated = await api<Order>(`trading/orders/${order.id}/`);
      } else {
        const component = values.component as keyof Order["numbers"];
        updated = await cmd.send<Order>(
          `trading/orders/${order.id}/settlement/`,
          {
            version: order.version,
            account_id: values.account_id,
            date: values.date,
            reason: values.reason,
            [values.payment_action === "receipt"
              ? "customer_fee_delta"
              : "supplier_fee_delta"]: values.fee,
            [component]: addMoney(
              String(order.numbers[component] || "0"),
              values.amount,
            ),
          },
        );
      }
      onSaved(updated);
      onClose();
    } catch {
      /* Keep entered payment for correction. */
    }
  };
  return (
    <Modal
      open
      width={620}
      title={
        <Space>
          {t("biz.recordPayment")} · {order.number}
          <Language />
        </Space>
      }
      footer={null}
      onCancel={() => {
        if (!cmd.busy) onClose();
      }}
    >
      <CommandErrors command={cmd} />
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          payment_action: "receipt",
          fee: "0",
          date: today(),
          reason: "",
        }}
        onFinish={submit}
      >
        <Form.Item
          name="payment_action"
          label={t("biz.entryType")}
          rules={required}
        >
          <Select
            options={["receipt", "payment", "commission"].map((value) => ({
              value,
              label: t(`biz.${value}Action`),
            }))}
            onChange={() =>
              form.setFieldsValue({ component: undefined, fee: "0" })
            }
          />
        </Form.Item>
        {action !== "commission" && (
          <Form.Item
            name="component"
            label={t("biz.component")}
            rules={required}
          >
            <Select options={componentOptions} />
          </Form.Item>
        )}
        {action === "commission" && (
          <Alert
            type="info"
            message={`${t("biz.commissionRecipient")}: ${order.commission_recipient || "—"}`}
          />
        )}
        <div className="business-form-grid">
          <Form.Item name="amount" label={t("biz.amount")} rules={required}>
            <MoneyInput />
          </Form.Item>
          {action !== "commission" && (
            <Form.Item
              name="fee"
              label={t(
                action === "receipt"
                  ? "biz.customerFeeThisTime"
                  : "biz.supplierFeeThisTime",
              )}
              rules={required}
            >
              <MoneyInput />
            </Form.Item>
          )}
          <Form.Item
            name="account_id"
            label={t("biz.account")}
            rules={required}
          >
            <AccountField currency={order.currency} />
          </Form.Item>
          <Form.Item name="date" label={t("biz.date")} rules={required}>
            <Input type="date" max={today()} />
          </Form.Item>
        </div>
        <Form.Item name="reason" label={t("biz.reason")}>
          <Input.TextArea maxLength={1000} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={cmd.busy}>
          {t("biz.confirm")}
        </Button>
      </Form>
    </Modal>
  );
}

export function OrderDetail({
  order,
  onClose,
  onEdit,
  onChanged,
  onDocumentEdit,
  onDocumentSend,
  embedded = false,
}: {
  order: Order;
  onClose: () => void;
  onEdit: (order: Order) => void;
  onChanged: (order: Order) => void;
  onDocumentEdit: (kind: DocumentKind) => void;
  onDocumentSend: (kind: DocumentKind) => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const revisions = useResource<Revision[]>(
    `trading/orders/${order.id}/history/`,
  );
  const ledger = useResource<LedgerList>(
    `trading/ledger/?order=${order.id}&page_size=200`,
  );
  const invoiceDocument = useResource<DocumentResponse>(
    `trading/orders/${order.id}/documents/invoice/`,
  );
  const purchaseContractDocument = useResource<DocumentResponse>(
    `trading/orders/${order.id}/documents/purchase_contract/`,
  );
  const salesContractDocument = useResource<DocumentResponse>(
    `trading/orders/${order.id}/documents/sales_contract/`,
  );
  const attachments = useResource<OrderAttachment[]>(
    `trading/orders/${order.id}/attachments/`,
  );
  const [snapshot, setSnapshot] = useState<Order>(order),
    [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set()),
    [activeDetailTab, setActiveDetailTab] = useState("detail"),
    [payment, setPayment] = useState(false),
    [documentError, setDocumentError] = useState(""),
    [attachmentError, setAttachmentError] = useState(""),
    [uploadingAttachment, setUploadingAttachment] = useState<OrderAttachmentKind | null>(null),
    [deletingAttachment, setDeletingAttachment] = useState<OrderAttachmentKind | null>(null),
    [downloading, setDownloading] = useState<DocumentKind | null>(null);
  const payments = (ledger.data?.results || []).filter((entry) =>
    ["customer_receipt", "supplier_payment", "commission"].includes(
      entry.category,
    ),
  );
  const title = (
    <div className="order-modal-title">
      <Space>
        {order.number}
        <Language />
      </Space>
      <Button
        icon={<EditOutlined />}
        disabled={order.state === "void"}
        onClick={() => onEdit(order)}
      >
        {t("biz.edit")}
      </Button>
    </div>
  );
  const changeLabel = (field: string) =>
    t(
      field === "lines"
        ? "biz.productDetails"
        : `biz.${field.replace("numbers.", "")}`,
    );
  const changeValue = (value: unknown) =>
    value === null || value === undefined || value === "" ? "—" : String(value);
  const changeSummary = (revision: Revision) =>
    revision.changes.length
      ? revision.changes
          .map(
            (change) =>
              `${changeLabel(change.field)}: ${changeValue(change.before)} → ${changeValue(change.after)}`,
          )
          .join("；")
      : t(`biz.${revision.action}`);
  const detailValue = (key: string) => {
    if (key === "state") return <Status value={snapshot.state} />;
    const value = (snapshot as unknown as Record<string, unknown>)[key];
    return value === null || value === undefined || value === "" ? "—" : String(value);
  };
  const detailGroup = (titleKey: string, fields: string[]) => (
    <section className="order-detail-group">
      <h3>{t(`biz.${titleKey}`)}</h3>
      <div className="order-detail-fields">
        {fields.map((key) => (
          <div key={key} className={highlightedFields.has(key) ? "revision-field-highlight" : undefined}>
            <span>{t(key === "state" ? "biz.orderStatus" : `biz.${key}`)}</span>
            <strong>{detailValue(key)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
  const numberGroup = (titleKey: string, fields: string[]) => (
    <section className="order-detail-group">
      <h3>{t(`biz.${titleKey}`)}</h3>
      <div className="order-detail-fields">
        {fields.map((key) => {
          const value = snapshot.numbers[key as keyof typeof snapshot.numbers];
          return (
            <div key={key} className={highlightedFields.has(`numbers.${key}`) ? "revision-field-highlight" : undefined}>
              <span>{t(`biz.${key}`)}</span>
              <strong>
                {key.endsWith("_status") ? <Status value={String(value)} /> : key.endsWith("_due") ? (value || "—") : cash(value)}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
  const uploadAttachment = async (kind: OrderAttachmentKind, file: File) => {
    setAttachmentError("");
    setUploadingAttachment(kind);
    const data = new FormData();
    data.append("kind", kind);
    data.append("file", file);
    try {
      await uploadApi(`trading/orders/${order.id}/attachments/`, data);
      attachments.refresh();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "errors.server_error");
    } finally {
      setUploadingAttachment(null);
    }
  };
  const downloadAttachment = async (row: OrderAttachment) => {
    const response = await fetch(`/api/trading/orders/${order.id}/attachments/${row.kind}/`, { credentials: "same-origin" });
    if (!response.ok) throw new Error("errors.server_error");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = row.original_name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const deleteAttachment = async (row: OrderAttachment) => {
    setAttachmentError("");
    setDeletingAttachment(row.kind);
    try {
      await api(`trading/orders/${order.id}/attachments/${row.kind}/`, "DELETE");
      attachments.refresh();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "errors.server_error");
    } finally {
      setDeletingAttachment(null);
    }
  };
  const documentCard = (
    kind: DocumentKind,
    resource: typeof invoiceDocument,
  ) => {
    const invoice = kind === "invoice";
    const purchase = kind === "purchase_contract";
    const updatedAt = resource.data?.updated_at;
    const number = String(
      resource.data?.content[invoice ? "invoice_number" : "reference"] ||
        `${order.number}-${invoice ? "INV" : purchase ? "PC" : "SC"}`,
    );
    return (
      <article className="order-document-row">
        <div className="order-document-info">
          <div className="order-document-heading">
            <Tag color={invoice ? "blue" : purchase ? "orange" : "green"}>
              {t(invoice ? "biz.salesInvoice" : purchase ? "biz.purchaseContract" : "biz.salesContract")}
            </Tag>
            <strong>{number}</strong>
          </div>
          <div className="order-document-meta">
            <span>
              {t("biz.generatedAt")}: {updatedAt ? new Date(updatedAt).toLocaleString() : "—"}
            </span>
            <span>
              {t("biz.generatedBy")}: {resource.data?.updated_by || "—"}
            </span>
          </div>
          <span className="muted">
            {resource.data?.last_sent_at
              ? t("biz.lastSent", {
                  time: new Date(resource.data.last_sent_at).toLocaleString(),
                  recipients: resource.data.last_sent_to.join(", "),
                })
              : t("biz.notSent")}
          </span>
        </div>
        <Space className="order-document-actions" wrap>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => onDocumentEdit(kind)}
          >
            {t("biz.edit")}
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            loading={downloading === kind}
            onClick={async () => {
              setDocumentError("");
              setDownloading(kind);
              try {
                await downloadOrderDocument(order.id, kind);
              } catch (error) {
                setDocumentError((error as Error).message);
              } finally {
                setDownloading(null);
              }
            }}
          >
            {t("biz.downloadPdf")}
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => onDocumentSend(kind)}
          >
            {t(invoice ? "biz.sendInvoice" : "biz.sendContract")}
          </Button>
        </Space>
      </article>
    );
  };
  const content = (
    <>
      <Tabs
        activeKey={activeDetailTab}
        onChange={setActiveDetailTab}
        items={[
          {
            key: "detail",
            label: t("biz.detail"),
            children: (
              <>
                {snapshot.version !== order.version && (
                  <Alert
                    type="info"
                    showIcon
                    message={t("biz.viewingRevision", {
                      version: snapshot.version,
                    })}
                    action={
                      <Button
                        size="small"
                        onClick={() => {
                          setSnapshot(order);
                          setHighlightedFields(new Set());
                        }}
                      >
                        {t("biz.backToLatest")}
                      </Button>
                    }
                  />
                )}
                <div className="order-detail-hero">
                  <div>
                    <span>{t("biz.orderOverview")}</span>
                    <h2>{snapshot.vessel} · {snapshot.customer}</h2>
                    <Space wrap>
                      <Status value={snapshot.state} />
                      <span>{snapshot.number}</span>
                      <span>{snapshot.order_date}</span>
                    </Space>
                  </div>
                  <div className="order-detail-metrics">
                    {[
                      ["sales", snapshot.numbers.sales],
                      ["cost", snapshot.numbers.cost],
                      ["receivable", snapshot.numbers.receivable],
                      ["payable", snapshot.numbers.payable],
                    ].map(([key, value]) => (
                      <div key={key} className={highlightedFields.has(`numbers.${key}`) ? "revision-field-highlight" : undefined}>
                        <span>{t(`biz.${key}`)}</span>
                        <strong>{cash(value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="order-detail-groups">
                  {detailGroup("basicInformation", ["state", "order_date", "customer", "supplier", "vessel", "port", "imo"])}
                  {detailGroup("supplyInformation", ["estimated_start_date", "estimated_end_date", "actual_date"])}
                  {detailGroup("customerReceipt", ["customer_term", "customer_term_description"])}
                  {detailGroup("supplierPayment", ["supplier_term", "supplier_term_description"])}
                  {numberGroup("customerSettlement", ["customer_deposit", "customer_received", "receivable", "customer_due", "customer_status"])}
                  {numberGroup("supplierSettlement", ["supplier_deposit", "supplier_paid", "payable", "supplier_due", "supplier_status"])}
                  {detailGroup("otherFees", ["customer_fee", "supplier_fee", "berth_fee", "exceptional_fee"])}
                  {user?.role === "admin" && detailGroup("performanceCommission", ["salesperson", "commission_rate", "commission_recipient"])}
                  {user?.role === "admin" && numberGroup("performanceSummary", ["commission", "profit"])}
                  {detailGroup("note", ["note"])}
                </div>
                <section className="order-detail-group order-detail-lines">
                  <h3>{t("biz.productDetails")}</h3>
                <div
                  className={
                    highlightedFields.has("lines")
                      ? "revision-table-highlight"
                      : undefined
                  }
                >
                  <Table
                    rowKey={(_, index) => String(index)}
                    pagination={false}
                    scroll={{ x: 760 }}
                    dataSource={snapshot.lines}
                    columns={[
                      "oil",
                      "ordered_qty_min",
                      "ordered_qty_max",
                      "actual_qty",
                      "sale_price",
                      "cost_price",
                      "sale_amount",
                      "cost_amount",
                    ].map((key) => ({ title: t(`biz.${key}`), dataIndex: key }))}
                  />
                </div>
                </section>
              </>
            ),
          },
          {
            key: "payments",
            label: t("biz.orderPayments"),
            children: (
              <>
                <div className="business-toolbar">
                  <Button
                    type="primary"
                    disabled={
                      !["admin", "finance"].includes(user?.role || "") ||
                      !["confirmed", "supplied", "completed"].includes(
                        order.state,
                      )
                    }
                    onClick={() => setPayment(true)}
                  >
                    {t("biz.recordPayment")}
                  </Button>
                </div>
                <ErrorBox error={ledger.error} retry={ledger.refresh} />
                <Table<Entry>
                  rowKey="id"
                  loading={ledger.loading}
                  dataSource={payments}
                  scroll={{ x: 1050 }}
                  pagination={false}
                  columns={[
                    {
                      title: t("biz.entryType"),
                      dataIndex: "category",
                      render: (value: string) =>
                        t(
                          `biz.${value === "customer_receipt" ? "receiptAction" : value === "supplier_payment" ? "paymentAction" : "commissionAction"}`,
                        ),
                    },
                    {
                      title: t("biz.amount"),
                      dataIndex: "amount",
                      render: (value: string, row: Entry) => (
                        <span
                          className={
                            row.direction === "expense" ? "negative" : ""
                          }
                        >
                          {row.direction === "expense" ? "−" : "+"}
                          {cash(value)}
                        </span>
                      ),
                    },
                    { title: t("biz.date"), dataIndex: "date" },
                    {
                      title: t("biz.counterparty"),
                      render: (_: unknown, row: Entry) =>
                        row.category === "customer_receipt"
                          ? order.customer
                          : row.category === "supplier_payment"
                            ? order.supplier
                            : order.commission_recipient || "—",
                    },
                    { title: t("biz.account"), dataIndex: "account_name" },
                    { title: t("biz.operator"), dataIndex: "actor_name" },
                    { title: t("biz.reason"), dataIndex: "reason" },
                    {
                      title: t("biz.source"),
                      dataIndex: "source",
                      render: (value: string) => t(`biz.${value}`),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "ledger",
            label: t("biz.ledger"),
            children: (
              <>
                <ErrorBox error={ledger.error} retry={ledger.refresh} />
                <Table
                  rowKey="id"
                  loading={ledger.loading}
                  dataSource={ledger.data?.results}
                  scroll={{ x: 750 }}
                  columns={[
                    "date",
                    "account_name",
                    "direction",
                    "category",
                    "amount",
                    "source",
                    "reason",
                  ].map((key) => ({
                    title: t(`biz.${key === "account_name" ? "account" : key}`),
                    dataIndex: key,
                    render: (v: string) =>
                      ["direction", "category", "source"].includes(key)
                        ? t(`biz.${v}`)
                        : key === "amount"
                          ? cash(v)
                          : v,
                  }))}
                />
                {(ledger.data?.count || 0) > 200 && (
                  <p>{t("biz.historyLimit")}</p>
                )}
              </>
            ),
          },
          {
            key: "documents",
            label: t("biz.contractsAndInvoices"),
            children: (
              <div className="order-documents-panel">
                <ErrorBox
                  error={
                    documentError ||
                    invoiceDocument.error ||
                    purchaseContractDocument.error ||
                    salesContractDocument.error
                  }
                  retry={() => {
                    invoiceDocument.refresh();
                    purchaseContractDocument.refresh();
                    salesContractDocument.refresh();
                  }}
                />
                {documentCard("invoice", invoiceDocument)}
                {documentCard("sales_contract", salesContractDocument)}
                {documentCard("purchase_contract", purchaseContractDocument)}
              </div>
            ),
          },
          {
            key: "attachments",
            label: t("biz.orderAttachments"),
            children: (
              <div className="order-attachments-panel">
                <div className="order-attachments-heading">
                  <div>
                    <h3>{t("biz.orderAttachments")}</h3>
                    <p>{t("biz.orderAttachmentsHint")}</p>
                  </div>
                  <Space wrap>
                    {(["supplier_invoice", "bdn"] as OrderAttachmentKind[]).map((kind) => (
                      <Upload
                        key={kind}
                        accept="application/pdf,.pdf"
                        maxCount={1}
                        showUploadList={false}
                        beforeUpload={(file) => {
                          void uploadAttachment(kind, file);
                          return false;
                        }}
                      >
                        <Button type="primary" icon={<UploadOutlined />} loading={uploadingAttachment === kind}>
                          {t(`biz.upload_${kind}`)}
                        </Button>
                      </Upload>
                    ))}
                  </Space>
                </div>
                <ErrorBox error={attachmentError || attachments.error} retry={attachments.refresh} />
                <Table<OrderAttachment>
                  rowKey="kind"
                  loading={attachments.loading}
                  dataSource={attachments.data || []}
                  pagination={false}
                  locale={{ emptyText: t("biz.noOrderAttachments") }}
                  columns={[
                    { title: t("biz.type"), dataIndex: "kind", render: (value: string) => t(`biz.${value}`) },
                    { title: t("biz.fileName"), dataIndex: "original_name" },
                    { title: t("biz.uploadedAt"), dataIndex: "uploaded_at", render: (value: string) => new Date(value).toLocaleString() },
                    { title: t("biz.operator"), dataIndex: "uploaded_by" },
                    {
                      title: t("biz.action"),
                      render: (_: unknown, row: OrderAttachment) => (
                        <Space>
                          <Tooltip title={t("biz.downloadPdf")}>
                            <Button type="text" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(row)} />
                          </Tooltip>
                          <Popconfirm
                            title={t("biz.deleteAttachmentTitle")}
                            description={t("biz.deleteAttachmentHint")}
                            okText={t("biz.confirm")}
                            cancelText={t("biz.cancel")}
                            okButtonProps={{ danger: true, loading: deletingAttachment === row.kind }}
                            onConfirm={() => deleteAttachment(row)}
                          >
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              loading={deletingAttachment === row.kind}
                            />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: "history",
            label: t("biz.history"),
            children: (
              <>
                <ErrorBox error={revisions.error} retry={revisions.refresh} />
                <Table
                  rowKey="version"
                  loading={revisions.loading}
                  dataSource={revisions.data}
                  columns={[
                    { title: t("biz.revision"), dataIndex: "version" },
                    { title: t("biz.operator"), dataIndex: "actor" },
                    { title: t("biz.date"), dataIndex: "created_at" },
                    {
                      title: t("biz.action"),
                      dataIndex: "action",
                      render: (v: string) => t(`biz.${v}`),
                    },
                    {
                      title: t("biz.changeSummary"),
                      render: (_: unknown, revision: Revision) => {
                        const summary = changeSummary(revision);
                        return (
                          <Tooltip title={summary}>
                            <span className="revision-change-summary">{summary}</span>
                          </Tooltip>
                        );
                      },
                    },
                    { title: t("biz.reason"), dataIndex: "reason" },
                    {
                      title: t("biz.snapshot"),
                      render: (_: unknown, r: Revision) => (
                        <Tooltip title={`${t("biz.view")} v${r.version}`}>
                          <Button
                            type="text"
                            aria-label={`${t("biz.view")} v${r.version}`}
                            icon={<EyeOutlined />}
                            onClick={() => {
                              setSnapshot(r.snapshot);
                              setHighlightedFields(
                                new Set(r.changes.map((change) => change.field)),
                              );
                              setActiveDetailTab("detail");
                            }}
                          />
                        </Tooltip>
                      ),
                    },
                  ]}
                />
                <p>{t("biz.snapshotHint", { version: snapshot.version })}</p>
              </>
            ),
          },
        ]}
      />
      {payment && (
        <OrderPaymentEditor
          order={order}
          onClose={() => setPayment(false)}
          onSaved={(updated) => {
            setSnapshot(updated);
            setHighlightedFields(new Set());
            ledger.refresh();
            revisions.refresh();
            onChanged(updated);
          }}
        />
      )}
    </>
  );
  if (embedded) {
    return (
      <section className="order-detail-page">
        <header className="order-detail-page-header">{title}</header>
        {content}
      </section>
    );
  }
  return (
    <Modal
      open
      width={1100}
      title={title}
      onCancel={onClose}
      footer={null}
    >
      {content}
    </Modal>
  );
}
